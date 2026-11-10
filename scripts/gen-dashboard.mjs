// 產生 public/data/dashboard.json（A2UI v0.9 message 陣列）
// 資料源：TWSE OpenAPI、CoinGecko（皆免費）；WFH 僅日期計算，不含任何內部資訊
import { mkdirSync, writeFileSync } from 'node:fs';

const TPE = 'Asia/Taipei';

function taipeiNow() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: TPE }));
}

function fmt(d) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function daysBetween(a, b) {
  return Math.ceil((b - a) / 86_400_000);
}

function wfhData() {
  const now = taipeiNow();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nextMonth1st = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const deadline = new Date(now.getFullYear(), now.getMonth(), 25);

  const fridays = [];
  for (let d = new Date(nextMonth1st); d.getMonth() === nextMonth1st.getMonth(); d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 5) fridays.push(fmt(d));
  }

  const toDeadline = daysBetween(today, deadline);
  return {
    countdown: `下次開搶 ${fmt(nextMonth1st)} 00:00（還有 ${daysBetween(today, nextMonth1st)} 天）`,
    deadline:
      toDeadline > 0
        ? `本月送出截止 ${fmt(deadline)}（還有 ${toDeadline} 天）`
        : toDeadline === 0
          ? `⚠️ 今天就是送出截止日！`
          : `本月已截止（${fmt(deadline)}）`,
    fridays: `${nextMonth1st.getMonth() + 1}月週五：${fridays.join('、')}`,
  };
}

async function marketData() {
  const out = { taiex: 'N/A', s0050: 'N/A', s2330: 'N/A', btc: 'N/A', eth: 'N/A' };
  try {
    const rows = await (await fetch('https://openapi.twse.com.tw/v1/exchangeReport/FMTQIK')).json();
    const last = rows.at(-1);
    out.taiex = `加權指數 ${last.TAIEX}（${last.Change}）`;
  } catch {}
  try {
    const all = await (await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL')).json();
    for (const [key, code] of [['s0050', '0050'], ['s2330', '2330']]) {
      const row = all.find((r) => r.Code === code);
      if (row) out[key] = `${row.Code} ${row.Name}  ${row.ClosingPrice}（${row.Change}）`;
    }
  } catch {}
  try {
    const px = await (
      await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true'
      )
    ).json();
    const line = (name, c) => `${name}  $${c.usd}（24h ${Math.round(c.usd_24h_change * 100) / 100}%）`;
    out.btc = line('BTC', px.bitcoin);
    out.eth = line('ETH', px.ethereum);
  } catch {}
  return out;
}

function textRow(id, path, variant) {
  return { id, component: 'Text', text: { path }, ...(variant ? { variant } : {}) };
}

const SURFACE = 'dashboard';
const components = [
  { id: 'root', component: 'Column', children: ['wfh_card', 'market_card'], align: 'stretch' },

  { id: 'wfh_card', component: 'Card', child: 'wfh_col' },
  {
    id: 'wfh_col',
    component: 'Column',
    children: ['wfh_head', 'wfh_countdown', 'wfh_deadline', 'wfh_div', 'wfh_fridays'],
    align: 'stretch',
  },
  { id: 'wfh_head', component: 'Row', children: ['wfh_icon', 'wfh_title'], justify: 'start', align: 'center' },
  { id: 'wfh_icon', component: 'Icon', name: 'home' },
  { id: 'wfh_title', component: 'Text', text: 'WFH 搶班', variant: 'h4' },
  textRow('wfh_countdown', '/wfh/countdown'),
  textRow('wfh_deadline', '/wfh/deadline'),
  { id: 'wfh_div', component: 'Divider' },
  textRow('wfh_fridays', '/wfh/fridays', 'h5'),

  { id: 'market_card', component: 'Card', child: 'market_col' },
  {
    id: 'market_col',
    component: 'Column',
    children: ['mk_head', 'mk_taiex', 'mk_0050', 'mk_2330', 'mk_div', 'mk_btc', 'mk_eth', 'mk_updated'],
    align: 'stretch',
  },
  { id: 'mk_head', component: 'Row', children: ['mk_icon', 'mk_title'], justify: 'start', align: 'center' },
  { id: 'mk_icon', component: 'Icon', name: 'star' },
  { id: 'mk_title', component: 'Text', text: '市場', variant: 'h4' },
  textRow('mk_taiex', '/market/taiex'),
  textRow('mk_0050', '/market/s0050'),
  textRow('mk_2330', '/market/s2330'),
  { id: 'mk_div', component: 'Divider' },
  textRow('mk_btc', '/market/btc'),
  textRow('mk_eth', '/market/eth'),
  textRow('mk_updated', '/updated'),
];

const market = await marketData();
const now = taipeiNow();
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
        market,
        updated: `更新於 ${fmt(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      },
    },
  },
];

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/dashboard.json', JSON.stringify(messages, null, 2));
console.log('wrote public/data/dashboard.json');
