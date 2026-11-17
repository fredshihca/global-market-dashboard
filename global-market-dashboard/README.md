# 全球金融與半導體行情監控中心

Node.js 20+ / Express 靜態網站與行情代理。繁體中文、深色儀表板、手機與平板適配。

## 本機啟動

```bash
npm install
npm start
```

瀏覽 http://localhost:3000 。

## Render 部署

1. 將此資料夾推送到 GitHub repository。
2. Render → New → Web Service → 連結 GitHub repository。
3. Runtime: Node；Build Command: `npm install`；Start Command: `npm start`。
4. 部署完成後使用 Render 提供的 HTTPS 網址，手機、平板均可使用。

## Railway 部署

New Project → Deploy from GitHub repo → 選擇專案。Railway 自動辨識 Node，Start Command `npm start`。在 Settings → Networking 產生公開網域。

## 資料與限制（請務必閱讀）

- Yahoo Finance chart 是非官方資料源，可能封鎖、限速、延遲、停止供應；無任何交易所級即時授權。
- 道瓊／那指／費半／標普指數本身沒有獨立盤後成交價。網站另列 DIA、QQQ、SOXX、SPY ETF 延長交易時段參考。延長交易時段資料只有資料源實際提供時才顯示。
- 台灣指數及台指期 Yahoo 符號的支援程度與合約有效性不保證；須核對正式資料供應商。
- 韓國、日本股票的盤後交易時段與機制不同；本網站不將收盤價偽裝為盤後價。
- BLS CPI: CUUR0000SA0；PPI: WPUFD4。顯示最新官方指數及推算年增率，不含市場預估值；PPI 指標定義請依 BLS 官方說明確認。
- 台灣三大法人與融資融券：提供 TWSE/TPEx 公開端點的原始表格檢視；部分端點可能需要指定日期、調整欄位、處理跨域或反爬限制。
- **上市／上櫃買賣超前20名尚未實作排序及驗證**。目前畫面明確顯示待資料映射，沒有虛構排行。
- 若需穩定正式商用，應採購有授權的行情供應商，完成交易所授權、資料契約與測試。

## 安全與營運

目前為公開讀取型網站，沒有登入系統。若需私人登入，請加上 Cloudflare Access 或其他身份驗證；不要將 API key 寫入 public/ 內。建議配置監控、限速、快取與錯誤告警。
