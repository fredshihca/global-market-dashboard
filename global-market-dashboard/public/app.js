const $ = id => document.getElementById(id);
const fmt = (v, d = 2) =>
  Number.isFinite(Number(v))
    ? new Intl.NumberFormat('zh-TW', {
        maximumFractionDigits: d,
        minimumFractionDigits: d
      }).format(Number(v))
    : '—';
function spark(points){if(!points?.length)return '<div class="spark muted">暫無走勢資料</div>';const vals=points.map(p=>p.v),mn=Math.min(...vals),mx=Math.max(...vals),range=mx-mn||1;const coords=vals.map((v,i)=>`${(i/(vals.length-1||1)*300).toFixed(1)},${(45-(v-mn)/range*37).toFixed(1)}`).join(' ');return `<svg class="spark" viewBox="0 0 300 52" preserveAspectRatio="none"><polyline fill="none" stroke="${vals.at(-1)>=vals[0]?'#39d6a4':'#f7778b'}" stroke-width="2.5" points="${coords}"/></svg>`}
function card(q,after=false){const available=q?.status==='ok';const val=after?q?.after:q?.price;const delta=after&&Number.isFinite(val)&&Number.isFinite(q.price)&&q.price?100*(val-q.price)/q.price:q?.change;const cls=delta>0?'up':delta<0?'down':'muted';return `<article class="tile"><div class="top"><span class="name">${esc(q?.name||'—')}</span><span class="symbol">${esc(q?.symbol||'')}</span></div><div class="price">${fmt(val)}</div><div class="delta ${cls}">${Number.isFinite(delta)?(delta>0?'+':'')+fmt(delta)+'%':'無可用報價'}</div>${!after?spark(q?.points):'<div class="extra">延長時段參考，不等同指數盤後價</div>'}<div class="meta">${available?esc(q.currency)+' · '+time(q.exchangeTime):'資料源暫時無法取得'}<br>${after?'盤後／延長交易時段': '來源：'+esc(q?.source||'未取得')}</div>${q?.dataType==='delayed_daily'?'<div class="extra" style="color:#ffcb77">⚠ 歷史日線收盤價，非即時</div>':''}${!after&&q?.market!=='FX'?`<div class="extra">盤後：${q?.market==='US'?fmt(q.after):'不適用／無可靠資料'}</div>`:''}</article>`}
function render(){const by=s=>quotes.find(q=>q.symbol===s);$('summary').innerHTML=['^DJI','^IXIC','^TWII','MU'].map(s=>card(by(s))).join('');$('usCards').innerHTML=['^DJI','^IXIC','^SOX','^GSPC'].map(s=>card(by(s))).join('');$('afterCards').innerHTML=['DIA','QQQ','SOXX','SPY'].map(s=>card(by(s),true)).join('');$('twCards').innerHTML=['TWD=X','^TWII','^TWOII','TX=F'].map(s=>card(by(s))).join('');const term=$('search').value.trim().toLowerCase();$('chipCards').innerHTML=['MU','NVDA','000660.KS','009150.KS','3110.T','4062.T'].map(by).filter(q=>q&&(q.name.toLowerCase().includes(term)||q.symbol.toLowerCase().includes(term))).map(q=>card(q)).join('')||'<p class="hint">找不到符合的股票</p>'}
async function loadQuotes(){
 const notice=$('notice');
 notice.textContent='正在連線行情服務，請稍候（最多約25秒）…';
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),25000);
 try{
  const r=await fetch('/api/quotes',{signal:ctrl.signal,cache:'no-store'});
  if(!r.ok)throw Error('行情 API HTTP '+r.status);
  const d=await r.json();if(!Array.isArray(d.items))throw Error('API 資料格式錯誤');
  quotes=d.items;const ok=quotes.filter(x=>x.status==='ok').length;
  $('lastUpdated').textContent='更新：'+time(d.updatedAt);
  notice.textContent='成功取得 '+ok+'/'+quotes.length+' 項行情；其他項目請參考資料來源及狀態。';
  render();
 }catch(e){
  notice.textContent='完整行情暫時無法載入（'+(e.name==='AbortError'?'超過25秒':e.message)+'），正在嘗試顯示診斷行情…';
  try{
   const r=await fetch('/api/diagnostics',{cache:'no-store'});if(!r.ok)throw Error('診斷 API HTTP '+r.status);
   const d=await r.json();
   const samples=(d.results||[]).filter(x=>x.hasPrice&&Number.isFinite(x.price));
   if(samples.length){quotes=samples.map(x=>({...x,status:'ok',market:'US',change:null,after:null,points:[]}));render();notice.textContent='目前僅顯示 '+samples.length+' 項診斷行情；完整行情查詢失敗，請查看 Render Logs。';}
   else notice.textContent='行情無法載入，診斷資料也未提供可顯示的價格。請查看 /api/diagnostics 與 Render Logs。';
  }catch(err){notice.textContent='行情與診斷服務皆無法載入：'+err.message+'。請查看 Render Logs。';}
 }finally{clearTimeout(timer)}
}
async function loadEconomy(){try{const r=await fetch('/api/economy');if(!r.ok)throw Error('資料源未回應');const d=await r.json();$('macroCards').innerHTML=['cpi','ppi'].map(k=>{const x=d.data[k],latest=x.series?.[0],prev=x.series?.[1],year=x.series?.find(y=>y.year===String(Number(latest?.year)-1)&&y.period===latest?.period);const yoy=latest&&year?(Number(latest.value)/Number(year.value)-1)*100:null;return `<div class="tile"><div class="name">${k.toUpperCase()} ${k==='cpi'?'消費者物價指數':'生產者物價指數'}</div><div class="price">${fmt(Number(latest?.value),3)}</div><div class="delta muted">${latest?latest.year+' / '+latest.periodName:'無資料'}</div><div class="extra">年增率（依指數計算）：${fmt(yoy)}%</div><div class="meta">上期指數：${esc(prev?.value||'—')}<br>來源：BLS 官方公開 API；預測值未提供</div></div>`}).join('')}catch(e){$('macroCards').innerHTML='<div class="tile muted">BLS 指標暫無資料：'+esc(e.message)+'</div>'}}
function flatten(data){if(!data||typeof data!=='object')return null;if(Array.isArray(data.tables)){const t=data.tables.find(x=>Array.isArray(x.data)&&x.data.length);if(t)return {fields:t.fields||[],rows:t.data}}if(Array.isArray(data.data)&&data.data.length)return {fields:data.fields||[],rows:data.data};if(Array.isArray(data.aaData)&&data.aaData.length)return {fields:data.fields||[],rows:data.aaData};return null}
async function loadFlows(){const chosen=tab;$('flowStatus').textContent='正在取得官方公開資料…';$('flowTable').innerHTML='';try{const r=await fetch('/api/taiwan/'+tab);const d=await r.json();if(chosen!==tab)return;if(!r.ok)throw Error(d.error||'無法連線');const t=flatten(d.data);if(!t){$('flowStatus').textContent='官方端點已回應，但格式不符合目前解析器；請檢查來源與日期。';return}$('flowStatus').textContent='官方原始資料（欄位定義以交易所為準），顯示前100筆 · '+d.source;const cols=t.fields.length?t.fields:t.rows[0].map((_,i)=>'欄位 '+(i+1));$('flowTable').innerHTML='<table><thead><tr>'+cols.map(c=>'<th>'+esc(c)+'</th>').join('')+'</tr></thead><tbody>'+t.rows.slice(0,100).map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'}catch(e){if(chosen===tab)$('flowStatus').textContent='目前無法取得此項官方資料：'+e.message}}
$('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));loadFlows()});$('search').addEventListener('input',render);$('refresh').onclick=()=>{loadQuotes();loadEconomy();loadFlows()};function tick(){$('clock').textContent=new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+' 台灣時間'}tick();setInterval(tick,1000);loadQuotes();loadEconomy();loadFlows();setInterval(loadQuotes,60000);setInterval(loadFlows,300000);setInterval(loadEconomy,21600000);
