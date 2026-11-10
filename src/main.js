import * as v0_9 from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/lit/v0_9';

const app = document.querySelector('#app');
const errorBox = document.querySelector('#error');
const SURFACE = 'dashboard';

// AI-BOUNDARY: 只有 CoinGecko 支援瀏覽器 CORS，所有即時互動都走它；TWSE 走每日預抓
const GECKO = 'https://api.coingecko.com/api/v3/simple/price';

let processor;

function setData(path, value) {
  processor.processMessages([
    { version: 'v0.9', updateDataModel: { surfaceId: SURFACE, path, value } },
  ]);
}

function priceLine(c, cur) {
  const sym = cur === 'twd' ? 'NT$' : '$';
  const chg = c[`${cur}_24h_change`];
  const arrow = chg >= 0 ? '▲' : '▼';
  return `${sym}${c[cur].toLocaleString()}　${arrow}${Math.abs(Math.round(chg * 100) / 100)}%`;
}

async function fetchPrices(ids, cur) {
  const res = await fetch(`${GECKO}?ids=${ids}&vs_currencies=${cur}&include_24hr_change=true`);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return res.json();
}

async function handleAction(action) {
  const ctx = action.context ?? {};
  const rawCur = Array.isArray(ctx.currency) ? ctx.currency[0] : ctx.currency;
  const cur = rawCur === 'twd' ? 'twd' : 'usd';
  try {
    if (action.name === 'refresh_crypto') {
      const px = await fetchPrices('bitcoin,ethereum', cur);
      setData('/crypto/btc', priceLine(px.bitcoin, cur));
      setData('/crypto/eth', priceLine(px.ethereum, cur));
    } else if (action.name === 'lookup_price') {
      const id = (ctx.id || '').trim().toLowerCase();
      if (!id) return void setData('/crypto/lookup', '先輸入一個 CoinGecko id');
      setData('/crypto/lookup', '查詢中…');
      const px = await fetchPrices(encodeURIComponent(id), cur);
      setData(
        '/crypto/lookup',
        px[id] ? `${id}：${priceLine(px[id], cur)}` : `找不到「${id}」，確認一下 CoinGecko id`
      );
    }
  } catch (err) {
    setData('/crypto/lookup', `查詢失敗：${err.message}`);
  }
}

async function main() {
  processor = new v0_9.MessageProcessor([basicCatalog], handleAction);

  const res = await fetch('./data/dashboard.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`dashboard.json ${res.status}`);
  const parsed = await res.json();
  processor.processMessages(Array.isArray(parsed) ? parsed : [parsed]);

  for (const [, surface] of processor.model.surfacesMap) {
    const el = document.createElement('a2ui-surface');
    el.surface = surface;
    app.append(el);
  }
}

main().catch((err) => {
  errorBox.textContent = `載入失敗：${err?.message ?? err}`;
  console.error(err);
});
