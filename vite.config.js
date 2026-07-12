import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const patchNotes = JSON.parse(readFileSync(new URL('./src/patchNotes.json', import.meta.url), 'utf8'));
const buildNumber = process.env.GITHUB_RUN_NUMBER || 'dev';
const commit = process.env.GITHUB_SHA?.slice(0, 7) || 'local';
const appVersion = `v${packageJson.version} · ${buildNumber === 'dev' ? 'development' : `build ${buildNumber}`} · ${commit}`;

if (!patchNotes[packageJson.version]) {
  throw new Error(`Missing patch notes for version ${packageJson.version} in src/patchNotes.json`);
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_RELEASE_VERSION__: JSON.stringify(packageJson.version),
  },
});
