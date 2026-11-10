// 產生 public/data/dashboard.json（A2UI v0.9 message 陣列）
// 資料源：TWSE OpenAPI（無 CORS，只能每日預抓）、CoinGecko（支援 CORS，前端可即時刷新）
import { mkdirSync, writeFileSync } from 'node:fs';

const TPE = 'Asia/Taipei';

function taipeiNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TPE }));
}

const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
const daysBetween = (a, b) => Math.ceil((b - a) / 86_400_000);

function wfhData() {
  const now = taipeiNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const open = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const deadline = new Date(now.getFullYear(), now.getMonth(), 25);

  const fridays = [];
  for (let d = new Date(open); d.getMonth() === open.getMonth(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) fridays.push(fmt(d));
  }
  const toOpen = daysBetween(today, open);
  const toDeadline = daysBetween(today, deadline);
  return {
    bigNumber: toOpen === 0 ? '今天！' : `${toOpen} 天`,
    openLabel: `距離 ${open.getMonth() + 1} 月班表開搶（${fmt(open)} 00:00）`,
    deadline:
      toDeadline > 0
        ? `⏰ 本月送出截止 ${fmt(deadline)}，還有 ${toDeadline} 天`
        : toDeadline === 0
          ? '🚨 今天就是送出截止日！'
          : `本月已於 ${fmt(deadline)} 截止`,
    fridays: fridays.join('　'),
    fridaysTitle: `${open.getMonth() + 1} 月的週五（每週名額約 2 個，手要快）`,
  };
}

// AI-INVARIANT: TW_LIST 的 code 必須與元件 id（tw_row_{code}）及 main.js 無關聯但要存在於上市清單
const TW_LIST = [
  ['0050', '元大台灣50'],
  ['0056', '元大高股息'],
  ['2330', '台積電'],
  ['2317', '鴻海'],
  ['2454', '聯發科'],
  ['2881', '富邦金'],
];

const priceStr = (close, change) => {
  const c = parseFloat(change);
  if (Number.isNaN(parseFloat(close))) return '—';
  return `${close}　${c >= 0 ? '▲' : '▼'}${Math.abs(c)}`;
};

async function twData() {
  const out = { taiex: '—', change: '', px: Object.fromEntries(TW_LIST.map(([c]) => [c, '—'])) };
  try {
    const rows = await (await fetch('https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK')).json();
    const last = rows.at(-1);
    out.taiex = last.TAIEX;
    const c = parseFloat(last.Change);
    out.change = `${c >= 0 ? '▲' : '▼'} ${Math.abs(c)}`;
  } catch {}

  // 全市場清單（上市 + 上櫃）烤成靜態檔，讓前端同源搜尋（TWSE/TPEx 無 CORS）
  const all = [];
  try {
    const twse = await (await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')).json();
    for (const r of twse) all.push([r.Code, r.Name, r.ClosingPrice, r.Change]);
  } catch {}
  try {
    const tpex = await (await fetch('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes')).json();
    for (const r of tpex) all.push([r.SecuritiesCompanyCode, r.CompanyName, r.Close, r.Change]);
  } catch {}
  mkdirSync('public/data', { recursive: true });
  writeFileSync('public/data/twstocks.json', JSON.stringify(all));

  const byCode = new Map(all.map((r) => [r[0], r]));
  for (const [code] of TW_LIST) {
    const r = byCode.get(code);
    if (r) out.px[code] = priceStr(r[2], r[3]);
  }
  return out;
}

// AI-INVARIANT: COINS 清單必須與 src/main.js 的 COINS 一致（同一組 id 與顯示名）
const COINS = [
  ['bitcoin', 'BTC'],
  ['ethereum', 'ETH'],
  ['solana', 'SOL'],
  ['dogecoin', 'DOGE'],
  ['ripple', 'XRP'],
  ['cardano', 'ADA'],
];

// AI-INVARIANT: FX 清單必須與 src/main.js 的 FX 一致（代碼與顯示名）
const FX = [
  ['USD', '美金'],
  ['JPY', '日圓'],
  ['EUR', '歐元'],
  ['CNY', '人民幣'],
  ['KRW', '韓元'],
  ['HKD', '港幣'],
];

async function fxData() {
  const out = Object.fromEntries(FX.map(([c]) => [c, '—']));
  try {
    const { rates } = await (await fetch('https://open.er-api.com/v6/latest/TWD')).json();
    for (const [code] of FX) {
      if (rates[code]) {
        const twd = 1 / rates[code];
        out[code] = `${twd < 1 ? twd.toFixed(4) : twd.toFixed(2)} TWD`;
      }
    }
  } catch {}
  return out;
}

async function cryptoData() {
  const out = Object.fromEntries(COINS.map(([id]) => [id, '—']));
  try {
    const ids = COINS.map(([id]) => id).join(',');
    const px = await (
      await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`
      )
    ).json();
    for (const [id] of COINS) {
      const c = px[id];
      if (c)
        out[id] = `$${c.usd.toLocaleString()}　${c.usd_24h_change >= 0 ? '▲' : '▼'}${Math.abs(
          Math.round(c.usd_24h_change * 100) / 100
        )}%`;
    }
  } catch {}
  return out;
}

const text = (id, pathOrText, extra = {}) => ({
  id,
  component: 'Text',
  text: typeof pathOrText === 'string' && pathOrText.startsWith('/') ? { path: pathOrText } : pathOrText,
  ...extra,
});

const SURFACE = 'dashboard';
const components = [
  { id: 'root', component: 'Column', children: ['header', 'tabs'], align: 'stretch' },
  { id: 'header', component: 'Row', children: ['title', 'updated'], justify: 'spaceBetween', align: 'center' },
  text('title', 'Kelly 的小宇宙', { variant: 'h3' }),
  text('updated', '/updated', { variant: 'caption' }),

  {
    id: 'tabs',
    component: 'Tabs',
    tabs: [
      { title: '🏠 WFH', child: 'wfh_card' },
      { title: '📈 台股', child: 'tw_card' },
      { title: '🪙 加密', child: 'crypto_card' },
      { title: '💱 匯率', child: 'fx_card' },
    ],
  },

  // ── WFH ──────────────────────────────────────────
  { id: 'wfh_card', component: 'Card', child: 'wfh_col' },
  {
    id: 'wfh_col',
    component: 'Column',
    children: ['wfh_big', 'wfh_open_label', 'wfh_deadline', 'wfh_div', 'wfh_fri_title', 'wfh_fridays'],
    align: 'center',
  },
  text('wfh_big', '/wfh/bigNumber', { variant: 'h1' }),
  text('wfh_open_label', '/wfh/openLabel', { variant: 'caption' }),
  text('wfh_deadline', '/wfh/deadline'),
  { id: 'wfh_div', component: 'Divider' },
  text('wfh_fri_title', '/wfh/fridaysTitle', { variant: 'caption' }),
  text('wfh_fridays', '/wfh/fridays', { variant: 'h3' }),

  // ── 台股（收盤資料；搜尋走同源靜態檔涵蓋上市+上櫃）──
  { id: 'tw_card', component: 'Card', child: 'tw_col' },
  {
    id: 'tw_col',
    component: 'Column',
    children: [
      'tw_taiex_label', 'tw_taiex_row', 'tw_div',
      ...TW_LIST.map(([c]) => `tw_row_${c}`),
      'tw_note',
      'tw_search_field', 'tw_search_btn',
      ...[0, 1, 2].map((i) => `tw_sr_${i}`),
      'tw_search_status',
    ],
    align: 'stretch',
  },
  text('tw_taiex_label', '加權指數', { variant: 'caption' }),
  { id: 'tw_taiex_row', component: 'Row', children: ['tw_taiex', 'tw_change'], justify: 'start', align: 'end' },
  text('tw_taiex', '/tw/taiex', { variant: 'h1' }),
  text('tw_change', '/tw/change', { variant: 'h4' }),
  { id: 'tw_div', component: 'Divider' },
  ...TW_LIST.flatMap(([code, name]) => [
    {
      id: `tw_row_${code}`,
      component: 'Row',
      children: [`tw_name_${code}`, `tw_px_${code}`],
      justify: 'spaceBetween',
      align: 'center',
    },
    text(`tw_name_${code}`, `${code}　${name}`, { variant: 'h5' }),
    text(`tw_px_${code}`, `/tw/px/${code}`),
  ]),
  text('tw_note', '收盤資料每日 14:35 更新', { variant: 'caption' }),
  {
    id: 'tw_search_field',
    component: 'TextField',
    label: '搜尋個股（代號或名稱，含上市/上櫃）',
    value: { path: '/tw/query' },
  },
  {
    id: 'tw_search_btn',
    component: 'Button',
    variant: 'primary',
    child: 'tw_search_text',
    action: { event: { name: 'search_tw', context: { query: { path: '/tw/query' } } } },
  },
  text('tw_search_text', '🔍 搜尋'),
  ...[0, 1, 2].flatMap((i) => [
    {
      id: `tw_sr_${i}`,
      component: 'Row',
      children: [`tw_sr_name_${i}`, `tw_sr_px_${i}`],
      justify: 'spaceBetween',
      align: 'center',
    },
    text(`tw_sr_name_${i}`, `/tw/results/${i}/name`, { variant: 'h5' }),
    text(`tw_sr_px_${i}`, `/tw/results/${i}/px`),
  ]),
  text('tw_search_status', '/tw/searchStatus', { variant: 'caption' }),

  // ── 加密（開頁自動抓即時價；按鈕為手動刷新）────────
  { id: 'crypto_card', component: 'Card', child: 'crypto_col' },
  {
    id: 'crypto_col',
    component: 'Column',
    children: [
      'cy_currency',
      ...COINS.flatMap(([id]) => [`cy_row_${id}`]),
      'cy_status',
      'cy_refresh_btn',
      'cy_search_div',
      'cy_search_field',
      'cy_search_btn',
      ...[0, 1, 2].map((i) => `cy_sr_${i}`),
      'cy_search_status',
    ],
    align: 'stretch',
  },
  {
    id: 'cy_currency',
    component: 'ChoicePicker',
    variant: 'mutuallyExclusive',
    displayStyle: 'chips',
    options: [
      { label: 'USD', value: 'usd' },
      { label: 'TWD', value: 'twd' },
    ],
    value: { path: '/crypto/currency' },
  },
  ...COINS.flatMap(([id, label]) => [
    {
      id: `cy_row_${id}`,
      component: 'Row',
      children: [`cy_name_${id}`, `cy_px_${id}`],
      justify: 'spaceBetween',
      align: 'center',
    },
    text(`cy_name_${id}`, label, { variant: 'h5' }),
    text(`cy_px_${id}`, `/crypto/px/${id}`),
  ]),
  text('cy_status', '/crypto/status', { variant: 'caption' }),
  {
    id: 'cy_refresh_btn',
    component: 'Button',
    variant: 'primary',
    child: 'cy_refresh_text',
    action: { event: { name: 'refresh_crypto', context: { currency: { path: '/crypto/currency' } } } },
  },
  text('cy_refresh_text', '🔄 刷新報價'),
  { id: 'cy_search_div', component: 'Divider' },
  {
    id: 'cy_search_field',
    component: 'TextField',
    label: '搜尋幣種（名稱或代號都行）',
    value: { path: '/crypto/query' },
  },
  {
    id: 'cy_search_btn',
    component: 'Button',
    variant: 'primary',
    child: 'cy_search_text',
    action: {
      event: {
        name: 'search_coin',
        context: { query: { path: '/crypto/query' }, currency: { path: '/crypto/currency' } },
      },
    },
  },
  text('cy_search_text', '🔍 搜尋'),
  ...[0, 1, 2].flatMap((i) => [
    {
      id: `cy_sr_${i}`,
      component: 'Row',
      children: [`cy_sr_name_${i}`, `cy_sr_px_${i}`],
      justify: 'spaceBetween',
      align: 'center',
    },
    text(`cy_sr_name_${i}`, `/crypto/results/${i}/name`, { variant: 'h5' }),
    text(`cy_sr_px_${i}`, `/crypto/results/${i}/px`),
  ]),
  text('cy_search_status', '/crypto/searchStatus', { variant: 'caption' }),

  // ── 匯率（1 外幣 = X 台幣；開頁自動抓）───────────
  { id: 'fx_card', component: 'Card', child: 'fx_col' },
  {
    id: 'fx_col',
    component: 'Column',
    children: [...FX.map(([c]) => `fx_row_${c}`), 'fx_status', 'fx_refresh_btn'],
    align: 'stretch',
  },
  ...FX.flatMap(([code, name]) => [
    {
      id: `fx_row_${code}`,
      component: 'Row',
      children: [`fx_name_${code}`, `fx_px_${code}`],
      justify: 'spaceBetween',
      align: 'center',
    },
    text(`fx_name_${code}`, `${code}　${name}`, { variant: 'h5' }),
    text(`fx_px_${code}`, `/fx/px/${code}`),
  ]),
  text('fx_status', '/fx/status', { variant: 'caption' }),
  {
    id: 'fx_refresh_btn',
    component: 'Button',
    variant: 'primary',
    child: 'fx_refresh_text',
    action: { event: { name: 'refresh_fx', context: {} } },
  },
  text('fx_refresh_text', '🔄 刷新匯率'),
];

const now = taipeiNow();
const [tw, crypto, fx] = await Promise.all([twData(), cryptoData(), fxData()]);
const messages = [
  {
    version: 'v0.9',
    createSurface: {
      surfaceId: SURFACE,
      // CONSTRAINT: 這個 id 必須跟安裝版本的 basicCatalog.id 完全一致（0.9.x 與 0.15.x 不同）
      catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
    },
  },
  { version: 'v0.9', updateComponents: { surfaceId: SURFACE, components } },
  {
    version: 'v0.9',
    updateDataModel: {
      surfaceId: SURFACE,
      path: '/',
      value: {
        wfh: wfhData(),
        tw: {
          ...tw,
          query: '',
          results: [{ name: '', px: '' }, { name: '', px: '' }, { name: '', px: '' }],
          searchStatus: '',
        },
        crypto: {
          px: crypto,
          currency: 'usd',
          status: '',
          query: '',
          results: [{ name: '', px: '' }, { name: '', px: '' }, { name: '', px: '' }],
          searchStatus: '',
        },
        fx: { px: fx, status: '' },
        updated: `${fmt(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} 更新`,
      },
    },
  },
];

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/dashboard.json', JSON.stringify(messages, null, 2));
console.log('wrote public/data/dashboard.json');
