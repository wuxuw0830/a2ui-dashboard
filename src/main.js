import * as v0_9 from '@a2ui/web_core/v0_9';
import { basicCatalog } from '@a2ui/lit/v0_9';

// 預生成模式：dashboard.json 由 CI 每天產生，這裡只負責載入與渲染
const app = document.querySelector('#app');
const errorBox = document.querySelector('#error');

async function main() {
  const processor = new v0_9.MessageProcessor([basicCatalog], async (action) => {
    console.debug('action', action);
  });

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
