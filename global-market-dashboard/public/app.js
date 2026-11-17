'use strict';

// Global Market Dashboard - frontend
// Compatible with the revised server.js.

const $ = id => document.getElementById(id);

const validNumber = value => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const validPrice = value => {
  const n = validNumber(value);
  return n !== null && n > 0;
};

const fmt = (value, digits = 2) => {
  const n = validNumber(value);
  if (n === null) return '—';
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(n);
};

const priceFmt = (value, digits = 2) =>
  validPrice(value) ? fmt(value, digits) : '—';

const pctFmt = value => {
  const n = validNumber(value);
  return n === null
    ? '—'
    : (n > 0 ? '+' : '') + fmt(n) + '%';
};

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));

function time(value) {
  if (value === null || value === undefined || value === '') {
    return '時間未提供';
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '時間未提供';

  return date.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

function quoteSource(q) {
  if (!q || !q.source || q.source === 'Unavailable') {
    return '資料來源未提供';
  }
  if (q.dataType === 'delayed_daily') {
    return 'Stooq 歷史日線（延遲）';
  }
  return q.source;
}

function quoteStatus(q, after = false) {
  if (!q || q.status !== 'ok') {
    return '暫無可用行情';
  }
  if (after && !validPrice(q.after)) {
    return '尚無可靠延長時段報價';
  }
  if (!validPrice(q.price)) {
    return '報價缺失';
  }
  if (q.dataType === 'delayed_daily') {
    return '歷史日線收盤價，非即時';
  }
  return '行情可能延遲';
}

let quotes = [];
let tab = 'marginListed';
let quotesLoading = false;
let economyLoading = false;
let flowsLoading = false;

const quoteMap = () =>
  new Map(quotes.map(q => [q.symbol, q]));

function spark(points) {
  const usable = (Array.isArray(points) ? points : [])
    .filter(p => p && validPrice(p.v));

  if (usable.length < 2) {
    return '<div class="spark muted">暫無走勢資料</div>';
  }

  const sampled = usable.length > 100
    ? usable.filter((_, i) =>
        i % Math.ceil(usable.length / 100) === 0
      )
    : usable;

  const vals = sampled.map(p => Number(p.v));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;

  const coords = vals.map((v, i) => {
    const x = i / (vals.length - 1) * 300;
    const y = 45 - (v - min) / range * 37;
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');

  const color = vals.at(-1) >= vals[0]
    ? '#39d6a4'
    : '#f7778b';

  return `<svg class="spark"
    viewBox="0 0 300 52"
    preserveAspectRatio="none"
    role="img"
    aria-label="歷史價格走勢">
    <polyline fill="none"
      stroke="${color}"
      stroke-width="2.5"
      points="${coords}"/>
  </svg>`;
}

function card(q, after = false) {
  const available = q?.status === 'ok';
  const val = after ? q?.after : q?.price;
  const hasValue = available && validPrice(val);

  let delta = null;

  if (hasValue) {
    if (after) {
      if (validPrice(q.price)) {
        delta = (Number(val) - Number(q.price)) /
          Number(q.price) * 100;
      }
    } else {
      delta = validNumber(q.change);
    }
  }

  const cls = delta === null
    ? 'muted'
    : delta > 0 ? 'up' : delta < 0 ? 'down' : 'muted';

  const displayName = esc(q?.name || '暫無資料');
  const symbol = esc(q?.symbol || '');
  const currency = esc(q?.currency || '');
  const source = esc(quoteSource(q));
  const status = esc(quoteStatus(q, after));

  const quoteTime = after
    ? q?.afterTime
    : q?.exchangeTime;

  const timeLabel = q?.dataType === 'delayed_daily'
    ? '歷史交易日期'
    : after ? '延長交易報價時間' : '報價時間';

  let extra = '';

  if (after) {
    extra = `<div class="extra">
      ETF 延長交易參考，不等同指數盤後價
    </div>`;
  } else if (q?.market === 'US') {
    extra = `<div class="extra">
      延長時段：${priceFmt(q.after)}
      ${validPrice(q.after) ? '' : '（尚無可靠資料）'}
    </div>`;
  }

  const warning = q?.dataType === 'delayed_daily'
    ? `<div class="extra" style="color:#ffcb77">
        ⚠ 歷史日線收盤價，非即時行情
      </div>`
    : '';

  const statusLine = !hasValue
    ? `<div class="extra muted">${status}</div>`
    : '';

  const chart = after
    ? ''
    : spark(q?.points);

  return `<article class="tile">
    <div class="top">
      <span class="name">${displayName}</span>
      <span class="symbol">${symbol}</span>
    </div>

    <div class="price">${hasValue ? priceFmt(val) : '—'}</div>

    <div class="delta ${cls}">
      ${hasValue ? pctFmt(delta) : '無可用報價'}
    </div>

    ${chart}
    ${extra}
    ${warning}
    ${statusLine}

    <div class="meta">
      ${currency ? currency + ' · ' : ''}${esc(timeLabel)}：
      ${time(quoteTime)}
      <br>
      來源：${source}
      <br>
      ${status}
    </div>
  </article>`;
}

function render() {
  const by = quoteMap();
  const get = symbol => by.get(symbol) || {
    symbol,
    name: symbol,
    status: 'unavailable'
  };

  const sections = [
    ['summary', ['^DJI', '^IXIC', '^TWII', 'MU'], false],
    ['usCards', ['^DJI', '^IXIC', '^SOX', '^GSPC'], false],
    ['afterCards', ['DIA', 'QQQ', 'SOXX', 'SPY'], true],
    ['twCards', ['TWD=X', '^TWII', '^TWOII', 'TX=F'], false]
  ];

  for (const [id, symbols, after] of sections) {
    const element = $(id);
    if (!element) continue;
    element.innerHTML = symbols
      .map(symbol => card(get(symbol), after))
      .join('');
  }

  const search = $('search')?.value.trim().toLowerCase() || '';
  const semiconductorSymbols = [
    'MU', 'NVDA', '000660.KS',
    '009150.KS', '3110.T', '4062.T'
  ];

  const semiconductor = semiconductorSymbols
    .map(get)
    .filter(q =>
      q.name.toLowerCase().includes(search) ||
      q.symbol.toLowerCase().includes(search)
    );

  if ($('chipCards')) {
    $('chipCards').innerHTML = semiconductor.length
      ? semiconductor.map(q => card(q)).join('')
      : '<p class="hint">找不到符合的股票</p>';
  }
}

async function fetchJSON(url, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) {
      throw Error('HTTP ' + response.status);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadQuotes() {
  if (quotesLoading) return;
  quotesLoading = true;

  const notice = $('notice');
  if (notice) notice.textContent = '正在更新行情…';

  try {
    const data = await fetchJSON('/api/quotes', 35000);

    if (!Array.isArray(data.items)) {
      throw Error('行情 API 格式不正確');
    }

    quotes = data.items;

    const valid = quotes.filter(q =>
      q.status === 'ok' && validPrice(q.price)
    ).length;

    const delayed = quotes.filter(q =>
      q.dataType === 'delayed_daily'
    ).length;

    const unavailable = quotes.length - valid;

    if ($('lastUpdated')) {
      $('lastUpdated').textContent =
        '伺服器更新：' + time(data.updatedAt);
    }

    if (notice) {
      notice.textContent =
        `已取得 ${valid}/${quotes.length} 項有效行情` +
        (delayed ? `，其中 ${delayed} 項為歷史日線` : '') +
        (unavailable ? `，${unavailable} 項暫無可靠報價` : '') +
        '。報價可能延遲，請以來源及時間為準。';
    }

    render();

  } catch (error) {
    if (notice) {
      notice.textContent =
        '行情更新失敗：' +
        (error.name === 'AbortError'
          ? '連線逾時'
          : error.message) +
        '。保留上次成功取得的資料。';
    }

    // Do not manufacture quote prices from diagnostics.
    // Diagnostics only reports availability, not usable prices.
    if (!quotes.length) {
      render();
    }

  } finally {
    quotesLoading = false;
  }
}

function calculateYoY(latest, previousYear) {
  const current = validNumber(latest?.value);
  const prior = validNumber(previousYear?.value);

  if (current === null || prior === null || prior === 0) {
    return null;
  }

  return (current / prior - 1) * 100;
}

async function loadEconomy() {
  if (economyLoading) return;
  economyLoading = true;

  try {
    const response = await fetchJSON('/api/economy', 30000);

    if (response.status !== 'ok' || !response.data) {
      throw Error('BLS 暫無可用資料');
    }

    const html = ['cpi', 'ppi'].map(key => {
      const item = response.data[key];
      const series = Array.isArray(item?.series)
        ? item.series
        : [];

      const latest = series[0];
      const previous = series[1];

      const previousYear = latest
        ? series.find(row =>
            Number(row.year) === Number(latest.year) - 1 &&
            row.period === latest.period
          )
        : null;

      const yoy = calculateYoY(latest, previousYear);

      const title = key === 'cpi'
        ? '消費者物價指數'
        : '生產者物價指數';

      return `<div class="tile">
        <div class="name">${key.toUpperCase()} ${title}</div>
        <div class="price">${priceFmt(latest?.value, 3)}</div>
        <div class="delta muted">
          ${latest
            ? esc(latest.year + ' / ' + latest.periodName)
            : '無資料'}
        </div>
        <div class="extra">
          年增率：${yoy === null ? '—' : pctFmt(yoy)}
        </div>
        <div class="meta">
          上期指數：${priceFmt(previous?.value, 3)}
          <br>
          來源：美國勞工統計局 BLS
          <br>
          官方歷史數據，非市場預測
        </div>
      </div>`;
    }).join('');

    if ($('macroCards')) $('macroCards').innerHTML = html;

  } catch (error) {
    if ($('macroCards')) {
      $('macroCards').innerHTML =
        `<div class="tile muted">
          CPI／PPI 暫無可用資料：${esc(error.message)}
        </div>`;
    }
  } finally {
    economyLoading = false;
  }
}

function flatten(data) {
  if (!data || typeof data !== 'object') return null;

  if (Array.isArray(data.tables)) {
    const table = data.tables.find(item =>
      Array.isArray(item.data) && item.data.length
    );
    if (table) {
      return {
        fields: table.fields || [],
        rows: table.data
      };
    }
  }

  if (Array.isArray(data.data) && data.data.length) {
    return {
      fields: data.fields || [],
      rows: data.data
    };
  }

  if (Array.isArray(data.aaData) && data.aaData.length) {
    return {
      fields: data.fields || [],
      rows: data.aaData
    };
  }

  // Some OTC endpoints use nested objects.
  if (data.data && typeof data.data === 'object') {
    return flatten(data.data);
  }

  return null;
}

async function loadFlows() {
  if (flowsLoading) return;
  flowsLoading = true;

  const chosen = tab;
  const status = $('flowStatus');
  const tableElement = $('flowTable');

  if (status) status.textContent = '正在取得官方公開資料…';
  if (tableElement) tableElement.innerHTML = '';

  try {
    const response = await fetchJSON(
      '/api/taiwan/' + encodeURIComponent(chosen),
      30000
    );

    if (chosen !== tab) return;

    if (response.status !== 'ok') {
      throw Error(response.error || '資料來源未回應');
    }

    const table = flatten(response.data);

    if (!table || !table.rows.length) {
      if (status) {
        status.textContent =
          '官方端點已回應，但目前沒有可解析的表格。' +
          '可能是非交易日或資料格式已更新。';
      }
      return;
    }

    const rows = table.rows
      .filter(Array.isArray)
      .slice(0, 100);

    if (!rows.length) {
      if (status) status.textContent = '目前無可顯示的資料列';
      return;
    }

    const fields = table.fields.length
      ? table.fields
      : rows[0].map((_, index) => '欄位 ' + (index + 1));

    const header = fields.map(field =>
      `<th>${esc(field)}</th>`
    ).join('');

    const body = rows.map(row =>
      '<tr>' +
      row.map(value => `<td>${esc(value)}</td>`).join('') +
      '</tr>'
    ).join('');

    if (tableElement) {
      tableElement.innerHTML =
        `<table>
          <thead><tr>${header}</tr></thead>
          <tbody>${body}</tbody>
        </table>`;
    }

    if (status) {
      status.textContent =
        '官方原始資料 · 顯示前 ' + rows.length +
        ' 筆 · 來源：' + response.source +
        ' · API 擷取：' + time(response.updatedAt);
    }

  } catch (error) {
    if (chosen === tab && status) {
      status.textContent =
        '目前無法取得官方資料：' + error.message;
    }
  } finally {
    flowsLoading = false;
    // If the user changed tabs during loading, fetch the new tab.
    if (chosen !== tab) loadFlows();
  }
}

function tick() {
  const clock = $('clock');
  if (!clock) return;

  clock.textContent = new Date().toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    hour12: false
  }) + ' 台灣時間';
}

function initialize() {
  $('tabs')?.addEventListener('click', event => {
    const button = event.target.closest('[data-tab]');
    if (!button) return;

    tab = button.dataset.tab;

    document.querySelectorAll('[data-tab]').forEach(element => {
      element.classList.toggle('active', element === button);
    });

    loadFlows();
  });

  $('search')?.addEventListener('input', render);

  if ($('refresh')) {
    $('refresh').onclick = () => {
      loadQuotes();
      loadEconomy();
      loadFlows();
    };
  }

  tick();
  setInterval(tick, 1000);

  loadQuotes();
  loadEconomy();
  loadFlows();

  setInterval(loadQuotes, 60000);
  setInterval(loadFlows, 300000);
  setInterval(loadEconomy, 21600000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
