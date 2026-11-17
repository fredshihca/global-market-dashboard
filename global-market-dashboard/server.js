一步：複製完整程式碼

import express from 'express';

const app = express();
app.disable('x-powered-by');
app.use(express.static('public'));
const PORT = process.env.PORT || 3000;

// Keep this order: the frontend uses these symbols and their positions.
const symbols = [
  ['道瓊', '^DJI', 'US'],
  ['那斯達克', '^IXIC', 'US'],
  ['費城半導體', '^SOX', 'US'],
  ['標普500', '^GSPC', 'US'],
  ['美元／台幣', 'TWD=X', 'FX'],
  ['台灣加權', '^TWII', 'TW'],
  ['櫃買指數', '^TWOII', 'TW'],
  ['台指期（參考）', 'TX=F', 'TW'],
  ['DIA 道瓊ETF', 'DIA', 'US'],
  ['QQQ 那指ETF', 'QQQ', 'US'],
  ['SOXX 費半ETF', 'SOXX', 'US'],
  ['SPY 標普ETF', 'SPY', 'US'],
  ['美光', 'MU', 'US'],
  ['輝達', 'NVDA', 'US'],
  ['SK海力士', '000660.KS', 'KR'],
  ['三星電機', '009150.KS', 'KR'],
  ['日東紡', '3110.T', 'JP'],
  ['IBIDEN', '4062.T', 'JP']
];

const cache = new Map();
const inflight = new Map();
async function cached(key, ttl, fn) {
  const old = cache.get(key);
  if (old && Date.now() - old.at < ttl) return old.value;
  if (inflight.has(key)) return inflight.get(key);
  const promise = Promise.resolve().then(fn);
  inflight.set(key, promise);
  try {
    const value = await promise;
    cache.set(key, { at: Date.now(), value });
    return value;
  } finally {
    inflight.delete(key);
  }
}

const positive = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const finite = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const changePct = (price, previous) =>
  price !== null && previous !== null && previous > 0
    ? ((price - previous) / previous) * 100 : null;

async function getJSON(url, timeoutMs = 8500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MarketDashboard/1.0)',
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    if (!response.ok) throw Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

// Stooq is a delayed daily-close fallback, never an after-hours quote.
const stooqSymbols = {
  MU: 'mu.us', NVDA: 'nvda.us',
  DIA: 'dia.us', QQQ: 'qqq.us',
  SOXX: 'soxx.us', SPY: 'spy.us',
  '^DJI': '^dji', '^IXIC': '^ndq', '^GSPC': '^spx'
};

async function yahooChart(symbol) {
  const errors = [];
  for (const host of [
    'query1.finance.yahoo.com',
    'query2.finance.yahoo.com'
  ]) {
    for (const range of ['1d', '5d']) {
      try {
        const interval = range === '1d' ? '1m' : '1d';
        const url = 'https://' + host +
          '/v8/finance/chart/' + encodeURIComponent(symbol) +
          '?interval=' + interval +
          '&range=' + range + '&includePrePost=true';
        const json = await getJSON(url);
        const result = json.chart?.result?.[0];
        if (result) return result;
        throw Error('Empty chart');
      } catch (error) {
        errors.push(host + ' ' + range + ': ' + error.message);
      }
    }
  }
  throw Error(errors.join(' | '));
}

async function stooqQuote(symbol) {
  const code = stooqSymbols[symbol];
  if (!code) throw Error('No configured Stooq fallback');
  const url = 'https://stooq.com/q/d/l/?s=' +
    encodeURIComponent(code) + '&i=d&d1=20260101';
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'text/csv'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw Error('Stooq HTTP ' + response.status);

  const lines = (await response.text()).trim().split(/\r?\n/);
  if (lines.length < 2) throw Error('No daily observations');

  const rows = lines.slice(1)
    .map(line => line.split(','))
    .filter(row =>
      row.length >= 5 &&
      /^\d{4}-\d{2}-\d{2}$/.test(row[0]) &&
      positive(row[4]) !== null
    );
  if (!rows.length) throw Error('Invalid daily observations');

  const last = rows.at(-1);
  const previous = rows.at(-2);
  const price = positive(last[4]);
  const prevPrice = previous ? positive(previous[4]) : null;

  return {
    price,
    previous: prevPrice,
    change: changePct(price, prevPrice),
    after: null,
    points: rows.slice(-40).map(row => ({
      t: Date.parse(row[0] + 'T00:00:00Z'),
      v: Number(row[4])
    })),
    exchangeTime: Date.parse(last[0] + 'T00:00:00Z'),
    source: 'Stooq',
    dataType: 'delayed_daily',
    asOf: last[0],
    warning: '歷史日線收盤價，非即時行情',
    afterStatus: 'unavailable'
  };
}

function yahooQuote(result, name, symbol, market) {
  const meta = result.meta || {};
  const timestamps = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];

  const price = positive(meta.regularMarketPrice);
  if (price === null) throw Error('Yahoo returned no valid price');

  const previous = positive(
    meta.chartPreviousClose ?? meta.previousClose
  );

  const points = timestamps.map((timestamp, index) => ({
    t: timestamp * 1000,
    v: positive(closes[index])
  })).filter(point => point.v !== null);

  const last = points.at(-1);
  const post = meta.currentTradingPeriod?.post;
  const regularTime = finite(meta.regularMarketTime);
  const postPrice = positive(meta.postMarketPrice);

  let after = null;
  let afterTime = null;

  if (market === 'US' && post) {
    const postStart = finite(post.start);
    const postEnd = finite(post.end);
    const postMarketTime = finite(meta.postMarketTime);

    if (
      postPrice !== null &&
      postMarketTime !== null &&
      postStart !== null &&
      postEnd !== null &&
      postMarketTime >= postStart &&
      postMarketTime <= postEnd
    ) {
      after = postPrice;
      afterTime = postMarketTime * 1000;
    } else if (
      last &&
      postStart !== null &&
      postEnd !== null &&
      last.t / 1000 >= postStart &&
      last.t / 1000 <= postEnd &&
      (regularTime === null || last.t / 1000 > regularTime)
    ) {
      after = last.v;
      afterTime = last.t;
    }
  }

  const sampled = points.filter((_, index) =>
    index % Math.max(1, Math.floor(points.length / 80)) === 0
  );

  return {
    name, symbol, market,
    price,
    previous,
    change: changePct(price, previous),
    after,
    afterTime,
    afterStatus: after !== null ? 'available' : 'unavailable',
    currency: meta.currency || '',
    exchangeTime: regularTime === null ? null : regularTime * 1000,
    points: sampled,
    status: 'ok',
    source: 'Yahoo Finance Chart API',
    dataType: 'quote',
    warning: '非官方行情來源，可能延遲；盤後價格僅供參考'
  };
}

async function quote([name, symbol, market]) {
  const errors = [];
  try {
    const result = await cached(
      'q' + symbol, 45000, () => yahooChart(symbol)
    );
    return yahooQuote(result, name, symbol, market);
  } catch (error) {
    errors.push(error.message);
  }

  try {
    const fallback = await cached(
      'stooq' + symbol, 300000, () => stooqQuote(symbol)
    );
    return {
      name, symbol, market,
      ...fallback,
      currency: 'USD',
      status: 'ok'
    };
  } catch (error) {
    errors.push(error.message);
  }

  return {
    name, symbol, market,
    price: null,
    previous: null,
    change: null,
    after: null,
    afterTime: null,
    exchangeTime: null,
    points: [],
    currency: '',
    status: 'unavailable',
    dataType: 'unavailable',
    afterStatus: 'unavailable',
    source: 'Unavailable',
    warning: '目前無法取得可靠報價',
    error: errors.join(' | ').slice(0, 500)
  };
}

app.get('/api/quotes', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const items = await Promise.all(symbols.map(quote));
    res.json({
      updatedAt: new Date().toISOString(),
      items
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      error: error.message
    });
  }
});

// Taiwan official public data endpoints.
const twEndpoints = {
  marginListed:
    'https://www.twse.com.tw/rwd/zh/marginTrading/MI_MARGN?response=json',
  institutionalListed:
    'https://www.twse.com.tw/rwd/zh/fund/T86?selectType=ALLBUT0999&response=json',
  institutionalOTC:
    'https://www.tpex.org.tw/www/zh-tw/insti/daily?type=Daily&response=json',
  marginOTC:
    'https://www.tpex.org.tw/www/zh-tw/margin/balance?response=json'
};

app.get('/api/taiwan/:type', async (req, res) => {
  const url = twEndpoints[req.params.type];
  if (!url) {
    return res.status(404).json({ error: 'Unknown endpoint' });
  }
  try {
    const data = await cached(
      'tw' + req.params.type,
      300000,
      () => getJSON(url)
    );
    res.json({
      status: 'ok',
      source: url,
      updatedAt: new Date().toISOString(),
      data
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      source: url,
      error: String(error.message)
    });
  }
});

// Official US BLS CPI and PPI data.
app.get('/api/economy', async (req, res) => {
  try {
    const data = await cached('bls', 21600000, async () => {
      const series = await Promise.all(
        ['CUUR0000SA0', 'WPUFD4'].map(async id => {
          const json = await getJSON(
            'https://api.bls.gov/publicAPI/v1/timeseries/data/' + id
          );
          if (json.status !== 'REQUEST_SUCCEEDED') {
            throw Error('BLS request failed for ' + id);
          }
          return {
            id,
            series: json.Results?.series?.[0]?.data
              ?.filter(item => /^M\d\d$/.test(item.period))
              .slice(0, 14) || []
          };
        })
      );
      return { cpi: series[0], ppi: series[1] };
    });
    res.json({
      status: 'ok',
      source: 'US Bureau of Labor Statistics',
      data
    });
  } catch (error) {
    res.status(503).json({
      status: 'unavailable',
      error: String(error.message)
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get('/api/diagnostics', async (req, res) => {
  const items = await Promise.all(
    [symbols[0], symbols[12], symbols[13]].map(quote)
  );
  res.json({
    checkedAt: new Date().toISOString(),
    results: items.map(item => ({
      name: item.name,
      symbol: item.symbol,
      status: item.status,
      source: item.source,
      dataType: item.dataType,
      error: item.error,
      hasPrice: positive(item.price) !== null
    }))
  });
});

app.listen(PORT, () => {
  console.log('Dashboard listening on ' + PORT);
});
