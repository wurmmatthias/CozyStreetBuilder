import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const buildNumber = process.env.GITHUB_RUN_NUMBER || 'dev';
const commit = process.env.GITHUB_SHA?.slice(0, 7) || 'local';
const appVersion = `v${packageJson.version} · ${buildNumber === 'dev' ? 'development' : `build ${buildNumber}`} · ${commit}`;

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
});
