import * as v0_9 from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/lit/v0_9';

const app = document.querySelector('#app');
const errorBox = document.querySelector('#error');
const SURFACE = 'dashboard';

// AI-BOUNDARY: 只有 CoinGecko 支援瀏覽器 CORS，所有即時互動都走它；TWSE 走每日預抓
const GECKO = 'https://api.coingecko.com/api/v3/simple/price';
// AI-INVARIANT: COINS 清單必須與 scripts/gen-dashboard.mjs 的 COINS 一致
const COINS = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'ripple', 'cardano'];

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

async function refreshCrypto(cur) {
  setData('/crypto/status', '更新中…');
  try {
    const res = await fetch(`${GECKO}?ids=${COINS.join(',')}&vs_currencies=${cur}&include_24hr_change=true`);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const px = await res.json();
    for (const id of COINS) {
      if (px[id]) setData(`/crypto/px/${id}`, priceLine(px[id], cur));
    }
    const t = new Date();
    setData(
      '/crypto/status',
      `即時報價 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`
    );
  } catch (err) {
    setData('/crypto/status', `更新失敗：${err.message}`);
  }
}

async function handleAction(action) {
  if (action.name !== 'refresh_crypto') return;
  const raw = action.context?.currency;
  const cur = (Array.isArray(raw) ? raw[0] : raw) === 'twd' ? 'twd' : 'usd';
  await refreshCrypto(cur);
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

  // 開頁即自動更新報價，每日預抓的資料只是首屏佔位
  refreshCrypto('usd');
}

main().catch((err) => {
  errorBox.textContent = `載入失敗：${err?.message ?? err}`;
  console.error(err);
});
