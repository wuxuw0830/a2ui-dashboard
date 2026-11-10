import { defineConfig } from 'vite';

// CONSTRAINT: GitHub Pages 專案頁掛在 /a2ui-dashboard/ 子路徑，資源必須用相對路徑
export default defineConfig({
  base: './',
});
