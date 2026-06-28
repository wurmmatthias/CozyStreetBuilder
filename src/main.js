import './styles/app.css';
import { SceneManager } from './editor/SceneManager.js';
import { PlacementController } from './editor/PlacementController.js';
import { assetPacks } from './editor/assetCatalog.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="builder-shell" data-mode="build">
    <aside class="tool-panel" aria-label="Street builder tools">
      <section class="brand-block">
        <p class="eyebrow">Cozy Street Builder</p>
        <h1>Build a tiny town grid.</h1>
      </section>

      <section class="panel-section">
        <h2>Mode</h2>
        <div class="mode-toggle" role="group" aria-label="Editor mode">
          <button class="is-active" id="build-mode" type="button">Build</button>
          <button id="generate-mode" type="button">Generate</button>
          <button id="view-mode" type="button">View</button>
        </div>
      </section>

      <section class="panel-section camera-section">
        <h2>Camera</h2>
        <div class="hint-grid">
          <span>WASD moves</span>
          <span>Arrow keys rotate</span>
          <span>Mouse drag orbits</span>
          <span>Wheel zooms</span>
        </div>
      </section>

      <section class="panel-section build-only">
        <div class="section-heading">
          <h2>Assets</h2>
          <button class="icon-button" id="reload-assets" type="button" title="Reload assets" aria-label="Reload assets">R</button>
        </div>
        <div class="asset-grid" id="asset-grid"></div>
      </section>

      <section class="panel-section build-only">
        <h2>Placement</h2>
        <div class="control-row">
          <label for="grid-size">Grid</label>
          <input id="grid-size" type="range" min="0.5" max="4" value="2" step="0.5" />
          <output id="grid-size-value">2m</output>
        </div>
        <div class="button-row">
          <button id="rotate-left" type="button" title="Rotate left">L</button>
          <button id="rotate-right" type="button" title="Rotate right">R</button>
          <button id="duplicate" type="button" title="Duplicate selected">Copy</button>
          <button id="delete-selected" type="button" title="Delete selected">Del</button>
        </div>
      </section>

      <section class="panel-section build-only">
        <h2>Selection</h2>
        <dl class="status-list">
          <div>
            <dt>Asset</dt>
            <dd id="selected-name">None</dd>
          </div>
          <div>
            <dt>Position</dt>
            <dd id="selected-position">-</dd>
          </div>
          <div>
            <dt>Rotation</dt>
            <dd id="selected-rotation">0 deg</dd>
          </div>
        </dl>
      </section>

      <section class="panel-section generate-only">
        <h2>Town</h2>
        <div class="button-row action-row">
          <button id="generate-town" class="primary-action" type="button">Generate Town</button>
          <button id="clear-town" type="button">Clear</button>
        </div>
        <dl class="status-list">
          <div>
            <dt>Layout</dt>
            <dd id="generate-status">Ready</dd>
          </div>
        </dl>
      </section>
    </aside>

    <section class="viewport-wrap">
      <div class="viewport-toolbar">
        <span id="mode-label">Pick an asset, then click the grid.</span>
        <span class="kbd">WASD move</span>
        <span class="kbd">Arrows rotate</span>
        <span class="kbd build-kbd">Q/E rotate</span>
        <span class="kbd build-kbd">Del removes</span>
        <span class="kbd build-kbd">Esc clears</span>
      </div>
      <div id="viewport" class="viewport" aria-label="3D street builder viewport"></div>
    </section>
  </main>
`;

const shell = document.querySelector('.builder-shell');
const scene = new SceneManager(document.querySelector('#viewport'));
const controller = new PlacementController(scene, {
  assetGrid: document.querySelector('#asset-grid'),
  selectedName: document.querySelector('#selected-name'),
  selectedPosition: document.querySelector('#selected-position'),
  selectedRotation: document.querySelector('#selected-rotation'),
  generateStatus: document.querySelector('#generate-status'),
  modeLabel: document.querySelector('#mode-label'),
});

if (import.meta.env.DEV) {
  window.cozyStreetBuilder = { scene, controller };
}

const buildMode = document.querySelector('#build-mode');
const generateMode = document.querySelector('#generate-mode');
const viewMode = document.querySelector('#view-mode');
const gridSize = document.querySelector('#grid-size');
const gridSizeValue = document.querySelector('#grid-size-value');

function setMode(mode) {
  shell.dataset.mode = mode;
  buildMode.classList.toggle('is-active', mode === 'build');
  generateMode.classList.toggle('is-active', mode === 'generate');
  viewMode.classList.toggle('is-active', mode === 'view');
  controller.setMode(mode);
}

buildMode.addEventListener('click', () => setMode('build'));
generateMode.addEventListener('click', () => setMode('generate'));
viewMode.addEventListener('click', () => setMode('view'));

gridSize.addEventListener('input', () => {
  const value = Number(gridSize.value);
  gridSizeValue.value = `${value}m`;
  controller.setGridSize(value);
});

document.querySelector('#rotate-left').addEventListener('click', () => controller.rotateSelected(-1));
document.querySelector('#rotate-right').addEventListener('click', () => controller.rotateSelected(1));
document.querySelector('#duplicate').addEventListener('click', () => controller.duplicateSelected());
document.querySelector('#delete-selected').addEventListener('click', () => controller.deleteSelected());
document.querySelector('#reload-assets').addEventListener('click', () => controller.loadAssets(assetPacks));
document.querySelector('#generate-town').addEventListener('click', () => controller.generateTown());
document.querySelector('#clear-town').addEventListener('click', () => controller.clearTown());

await controller.loadAssets(assetPacks);
setMode('build');
scene.start();
