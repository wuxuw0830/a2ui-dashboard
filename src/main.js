import * as v0_9 from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/lit/v0_9';

const app = document.querySelector('#app');
const errorBox = document.querySelector('#error');
const SURFACE = 'dashboard';

// AI-BOUNDARY: 只有 CoinGecko 支援瀏覽器 CORS，所有即時互動都走它；TWSE 走每日預抓
const GECKO = 'https://api.coingecko.com/api/v3/simple/price';
// AI-INVARIANT: COINS/FX 清單必須與 scripts/gen-dashboard.mjs 一致
const COINS = ['bitcoin', 'ethereum', 'solana', 'dogecoin', 'ripple', 'cardano'];
const FX = ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'HKD'];

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

async function refreshFx() {
  setData('/fx/status', '更新中…');
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/TWD');
    if (!res.ok) throw new Error(`er-api ${res.status}`);
    const { rates } = await res.json();
    for (const code of FX) {
      if (rates[code]) {
        const twd = 1 / rates[code];
        setData(`/fx/px/${code}`, `${twd < 1 ? twd.toFixed(4) : twd.toFixed(2)} TWD`);
      }
    }
    setData('/fx/status', '1 外幣 = X 台幣｜匯率每日更新一次');
  } catch (err) {
    setData('/fx/status', `更新失敗：${err.message}`);
  }
}

function pickCurrency(raw) {
  return (Array.isArray(raw) ? raw[0] : raw) === 'twd' ? 'twd' : 'usd';
}

async function searchCoin(query, cur) {
  const blank = () => [0, 1, 2].forEach((i) => setData(`/crypto/results/${i}`, { name: '', px: '' }));
  const q = (query || '').trim();
  if (!q) {
    blank();
    return void setData('/crypto/searchStatus', '輸入點什麼再搜吧');
  }
  setData('/crypto/searchStatus', `搜尋「${q}」中…`);
  try {
    const found = await (
      await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`)
    ).json();
    const top = (found.coins ?? []).slice(0, 3);
    if (!top.length) {
      blank();
      return void setData('/crypto/searchStatus', `找不到「${q}」相關的幣`);
    }
    const ids = top.map((c) => c.id).join(',');
    const px = await (
      await fetch(`${GECKO}?ids=${ids}&vs_currencies=${cur}&include_24hr_change=true`)
    ).json();
    [0, 1, 2].forEach((i) => {
      const c = top[i];
      setData(
        `/crypto/results/${i}`,
        c
          ? {
              name: `${c.symbol.toUpperCase()}　${c.name}`,
              px: px[c.id]?.[cur] != null ? priceLine(px[c.id], cur) : '—',
            }
          : { name: '', px: '' }
      );
    });
    setData('/crypto/searchStatus', '');
  } catch (err) {
    setData('/crypto/searchStatus', `搜尋失敗：${err.message}`);
  }
}

// 台股全市場清單（上市+上櫃）由 CI 每日烤成同源靜態檔；首次搜尋才載入
let twStocks = null;

async function searchTw(query) {
  const blank = () => [0, 1, 2].forEach((i) => setData(`/tw/results/${i}`, { name: '', px: '' }));
  const q = (query || '').trim();
  if (!q) {
    blank();
    return void setData('/tw/searchStatus', '輸入代號或名稱，例如 2317 或 鴻海');
  }
  setData('/tw/searchStatus', '搜尋中…');
  try {
    if (!twStocks) {
      const res = await fetch('./data/twstocks.json');
      if (!res.ok) throw new Error(`twstocks ${res.status}`);
      twStocks = await res.json();
    }
    const qU = q.toUpperCase();
    const exact = twStocks.filter(([code]) => code === qU);
    const prefix = twStocks.filter(([code]) => code !== qU && code.startsWith(qU));
    const byName = twStocks.filter(([, name]) => name.includes(q));
    const hits = [...exact, ...prefix, ...byName].slice(0, 3);
    if (!hits.length) {
      blank();
      return void setData('/tw/searchStatus', `找不到「${q}」`);
    }
    [0, 1, 2].forEach((i) => {
      const r = hits[i];
      if (!r) return void setData(`/tw/results/${i}`, { name: '', px: '' });
      const chg = parseFloat(r[3]);
      const px = Number.isNaN(parseFloat(r[2]))
        ? '—'
        : `${r[2]}　${chg >= 0 ? '▲' : '▼'}${Math.abs(chg)}`;
      setData(`/tw/results/${i}`, { name: `${r[0]}　${r[1]}`, px });
    });
    setData('/tw/searchStatus', '');
  } catch (err) {
    setData('/tw/searchStatus', `搜尋失敗：${err.message}`);
  }
}

async function handleAction(action) {
  const ctx = action.context ?? {};
  if (action.name === 'refresh_fx') return void (await refreshFx());
  if (action.name === 'refresh_crypto') return void (await refreshCrypto(pickCurrency(ctx.currency)));
  if (action.name === 'search_coin') return void (await searchCoin(ctx.query, pickCurrency(ctx.currency)));
  if (action.name === 'search_tw') return void (await searchTw(ctx.query));
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
  refreshFx();
}

main().catch((err) => {
  errorBox.textContent = `載入失敗：${err?.message ?? err}`;
  console.error(err);
});
