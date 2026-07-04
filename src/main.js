import './styles/app.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import { SceneManager } from './editor/SceneManager.js';
import { PlacementController } from './editor/PlacementController.js';
import { assetPacks } from './editor/assetCatalog.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="builder-shell" data-mode="build" data-screen="menu" data-ui="expanded">
    <section class="viewport-wrap">
      <div id="viewport" class="viewport" aria-label="3D street builder viewport"></div>

      <section class="main-menu" aria-label="Main menu">
        <div class="main-menu-content">
          <h1 class="main-menu-title">Cozy Street Builder</h1>
          <div class="main-menu-box" aria-label="Main menu actions">
            <button class="main-menu-button primary" id="start-sandbox" type="button">
              <i class="fa-solid fa-play" aria-hidden="true"></i>
              <span>Sandbox Mode</span>
            </button>
            <button class="main-menu-button" id="menu-options" type="button" aria-expanded="false" aria-controls="menu-options-panel">
              <i class="fa-solid fa-gear" aria-hidden="true"></i>
              <span>Options</span>
            </button>
            <div class="main-menu-options" id="menu-options-panel" hidden>
              <button class="main-menu-button compact" id="menu-music" type="button">
                <i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>
                <span>Music Off</span>
              </button>
              <button class="main-menu-button compact" id="menu-fullscreen" type="button">
                <i class="fa-solid fa-expand" aria-hidden="true"></i>
                <span>Fullscreen</span>
              </button>
            </div>
            <button class="main-menu-button credit" id="created-by" type="button">
              <i class="fa-solid fa-star" aria-hidden="true"></i>
              <span>Created by Matthias Wurm</span>
            </button>
          </div>
        </div>
      </section>

      <div class="hud-root" aria-label="Street builder interface">
        <div class="top-right-controls" aria-label="Viewport controls">
          <button class="hud-button" id="fullscreen-toggle" type="button" aria-label="Enter fullscreen" title="Enter fullscreen">
            <i class="fa-solid fa-expand" id="fullscreen-toggle-icon" aria-hidden="true"></i>
          </button>
          <button class="hud-button music-toggle" id="music-toggle" type="button" aria-label="Turn music on" aria-pressed="false" title="Turn music on">
            <i class="fa-solid fa-volume-xmark" id="music-toggle-icon" aria-hidden="true"></i>
          </button>
        </div>

        <section class="game-window command-window" data-window="command" aria-label="Command window">
          <header class="window-titlebar" data-drag-handle>
            <div>
              <p class="eyebrow">Cozy Street Builder</p>
              <h1>Town Kit</h1>
            </div>
            <button class="window-close" type="button" data-window-close="command" title="Close command window" aria-label="Close command window">X</button>
          </header>

          <div class="window-body">
            <div class="mode-toggle" role="group" aria-label="Editor mode">
              <button class="is-active" id="build-mode" type="button">Build</button>
              <button id="generate-mode" type="button">Generate</button>
              <button id="view-mode" type="button">View</button>
            </div>

            <p class="mode-readout" id="mode-label">Build mode is ready.</p>

            <section class="panel-section">
              <div class="section-heading">
                <h2>Traffic</h2>
                <span class="signal-dot" aria-hidden="true"></span>
              </div>
              <div class="control-row">
                <label for="traffic-density">Density</label>
                <input id="traffic-density" type="range" min="0" max="100" value="50" step="5" />
                <output id="traffic-density-value">50%</output>
              </div>
            </section>
          </div>
        </section>

        <section class="game-window asset-window build-only" data-window="assets" aria-label="Asset window">
          <header class="window-titlebar" data-drag-handle>
            <div>
              <p class="eyebrow">Build Shelf</p>
              <h2>Pieces</h2>
            </div>
            <div class="window-actions">
              <button class="icon-button" id="reload-assets" type="button" title="Reload assets" aria-label="Reload assets">R</button>
              <button class="window-close" type="button" data-window-close="assets" title="Close asset window" aria-label="Close asset window">X</button>
            </div>
          </header>

          <div class="window-body">
            <div class="asset-palette" id="asset-grid"></div>
          </div>
        </section>

        <section class="game-window placement-window build-only" data-window="placement" aria-label="Placement window">
          <header class="window-titlebar" data-drag-handle>
            <div>
              <p class="eyebrow">Arrange</p>
              <h2>Placement</h2>
            </div>
            <button class="window-close" type="button" data-window-close="placement" title="Close placement window" aria-label="Close placement window">X</button>
          </header>

          <div class="window-body">
            <section class="panel-section">
              <div class="control-row">
                <label for="grid-size">Grid</label>
                <input id="grid-size" type="range" min="0.5" max="4" value="2" step="0.5" />
                <output id="grid-size-value">2m</output>
              </div>
              <div class="button-row">
                <button id="rotate-left" type="button" title="Rotate left" aria-label="Rotate left">L</button>
                <button id="rotate-right" type="button" title="Rotate right" aria-label="Rotate right">R</button>
                <button id="duplicate" type="button" title="Duplicate selected">Copy</button>
                <button id="delete-selected" type="button" title="Delete selected">Del</button>
              </div>
            </section>

            <section class="panel-section">
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
          </div>
        </section>

        <section class="game-window generate-window generate-only" data-window="generate" aria-label="Generate window">
          <header class="window-titlebar" data-drag-handle>
            <div>
              <p class="eyebrow">World Bake</p>
              <h2>Town Generator</h2>
            </div>
            <button class="window-close" type="button" data-window-close="generate" title="Close generator window" aria-label="Close generator window">X</button>
          </header>

          <div class="window-body">
            <section class="panel-section">
              <div class="control-row">
                <label for="town-size">Size</label>
                <input id="town-size" type="range" min="0" max="2" value="1" step="1" />
                <output id="town-size-value">Medium</output>
              </div>
              <div class="control-row">
                <label for="building-density">Buildings</label>
                <input id="building-density" type="range" min="0" max="100" value="70" step="5" />
                <output id="building-density-value">70%</output>
              </div>
              <div class="control-row">
                <label for="foliage-density">Foliage</label>
                <input id="foliage-density" type="range" min="0" max="100" value="55" step="5" />
                <output id="foliage-density-value">55%</output>
              </div>
              <div class="control-row">
                <label for="generate-traffic-density">Traffic</label>
                <input id="generate-traffic-density" type="range" min="0" max="100" value="50" step="5" />
                <output id="generate-traffic-density-value">50%</output>
              </div>
              <div class="button-row action-row">
                <button id="generate-town" class="primary-action" type="button">Make Town</button>
                <button id="clear-town" type="button">Clear</button>
              </div>
            </section>

            <dl class="status-list">
              <div>
                <dt>Layout</dt>
                <dd id="generate-status">Ready</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="game-window resident-window" data-window="resident" aria-label="Resident camera window" hidden>
          <header class="window-titlebar" data-drag-handle>
            <div>
              <p class="eyebrow">Resident Cam</p>
              <h2 id="resident-name">No resident</h2>
            </div>
            <button class="window-close" type="button" data-window-close="resident" title="Close resident camera" aria-label="Close resident camera">X</button>
          </header>

          <div class="window-body resident-window-body">
            <div id="resident-camera" class="resident-camera" aria-label="Selected resident camera feed"></div>
            <dl class="status-list resident-profile">
              <div>
                <dt>Occupation</dt>
                <dd id="resident-occupation">-</dd>
              </div>
              <div>
                <dt>Age</dt>
                <dd id="resident-age">-</dd>
              </div>
              <div>
                <dt>Mood</dt>
                <dd id="resident-mood" class="resident-mood">-</dd>
              </div>
              <div id="resident-wanted-status-row" hidden>
                <dt>Status</dt>
                <dd id="resident-wanted-status">Wanted</dd>
              </div>
              <div id="resident-wanted-reason-row" hidden>
                <dt>Wanted For</dt>
                <dd id="resident-wanted-reason">-</dd>
              </div>
            </dl>
            <button id="call-police" class="primary-action police-action" type="button" hidden>
              <i class="fa-solid fa-shield-halved" aria-hidden="true"></i>
              <span>Call Police</span>
            </button>
          </div>
        </section>

        <nav class="skill-dock" aria-label="Skill dock">
          <button class="dock-button dock-minimize" type="button" data-ui-toggle title="Minify interface" aria-label="Minify interface">-</button>
          <button class="dock-button" type="button" data-skill="build" data-window-open="assets" title="Build skills">Build</button>
          <button class="dock-button" type="button" data-skill="placement" data-window-open="placement" title="Edit skills">Edit</button>
          <button class="dock-button" type="button" data-skill="generate" data-window-open="generate" title="World skills">World</button>
          <button class="dock-button" type="button" data-skill="view" data-window-open="command" title="View mode">View</button>
          <button class="dock-button" type="button" data-skill="command" data-window-open="command" title="Command console">Core</button>
        </nav>
      </div>
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
  residentWindow: document.querySelector('[data-window="resident"]'),
  residentViewport: document.querySelector('#resident-camera'),
  residentName: document.querySelector('#resident-name'),
  residentOccupation: document.querySelector('#resident-occupation'),
  residentAge: document.querySelector('#resident-age'),
  residentMood: document.querySelector('#resident-mood'),
  residentWantedStatusRow: document.querySelector('#resident-wanted-status-row'),
  residentWantedStatus: document.querySelector('#resident-wanted-status'),
  residentWantedReason: document.querySelector('#resident-wanted-reason'),
  residentWantedReasonRow: document.querySelector('#resident-wanted-reason-row'),
  callPolice: document.querySelector('#call-police'),
});

if (import.meta.env.DEV || ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  window.cozyStreetBuilder = { scene, controller };
}

const buildMode = document.querySelector('#build-mode');
const generateMode = document.querySelector('#generate-mode');
const viewMode = document.querySelector('#view-mode');
const gridSize = document.querySelector('#grid-size');
const gridSizeValue = document.querySelector('#grid-size-value');
const trafficDensity = document.querySelector('#traffic-density');
const trafficDensityValue = document.querySelector('#traffic-density-value');
const townSize = document.querySelector('#town-size');
const townSizeValue = document.querySelector('#town-size-value');
const buildingDensity = document.querySelector('#building-density');
const buildingDensityValue = document.querySelector('#building-density-value');
const foliageDensity = document.querySelector('#foliage-density');
const foliageDensityValue = document.querySelector('#foliage-density-value');
const generateTrafficDensity = document.querySelector('#generate-traffic-density');
const generateTrafficDensityValue = document.querySelector('#generate-traffic-density-value');
const townSizeLabels = ['Small', 'Medium', 'Large'];
const windows = [...document.querySelectorAll('.game-window')];
const dockButtons = [...document.querySelectorAll('[data-window-open]')];
const uiToggle = document.querySelector('[data-ui-toggle]');
const compactUiQuery = window.matchMedia('(max-width: 760px)');
const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;
const musicToggle = document.querySelector('#music-toggle');
const musicToggleIcon = document.querySelector('#music-toggle-icon');
const fullscreenToggle = document.querySelector('#fullscreen-toggle');
const fullscreenToggleIcon = document.querySelector('#fullscreen-toggle-icon');
const startSandbox = document.querySelector('#start-sandbox');
const menuOptions = document.querySelector('#menu-options');
const menuOptionsPanel = document.querySelector('#menu-options-panel');
const menuMusic = document.querySelector('#menu-music');
const menuFullscreen = document.querySelector('#menu-fullscreen');
const backgroundMusic = new Audio(assetUrl('/assets/sounds/bg.mp3'));
let mainMenuTownActive = false;

backgroundMusic.loop = true;
backgroundMusic.muted = true;
backgroundMusic.preload = 'auto';

function setMusicMuted(isMuted) {
  backgroundMusic.muted = isMuted;
  musicToggle.classList.toggle('is-muted', isMuted);
  musicToggleIcon.className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  menuMusic.querySelector('.fa-solid').className = isMuted ? 'fa-solid fa-volume-xmark' : 'fa-solid fa-volume-high';
  menuMusic.querySelector('span').textContent = isMuted ? 'Music Off' : 'Music On';
  musicToggle.setAttribute('aria-pressed', String(!isMuted));
  musicToggle.setAttribute('aria-label', isMuted ? 'Turn music on' : 'Mute music');
  musicToggle.title = isMuted ? 'Turn music on' : 'Mute music';

  if (isMuted) {
    backgroundMusic.pause();
    return;
  }

  backgroundMusic.play().catch(() => {
    setMusicMuted(true);
  });
}

function setFullscreenButtonState(isFullscreen) {
  fullscreenToggleIcon.className = isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
  menuFullscreen.querySelector('.fa-solid').className = isFullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand';
  menuFullscreen.querySelector('span').textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
  fullscreenToggle.setAttribute('aria-label', isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen');
  fullscreenToggle.title = isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen';
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await shell.requestFullscreen();
  } catch {
    setFullscreenButtonState(Boolean(document.fullscreenElement));
  }
}

function getGenerationOptionsFromControls() {
  return {
    townSize: Number(townSize.value),
    buildingDensity: Number(buildingDensity.value) / 100,
    foliageDensity: Number(foliageDensity.value) / 100,
    trafficDensity: Number(generateTrafficDensity.value) / 100,
  };
}

function generateMainMenuTown() {
  controller.setGenerationOptions(getGenerationOptionsFromControls());
  controller.setTrafficDensity(Number(generateTrafficDensity.value) / 100);
  controller.generateTown();
  controller.select(null);
  controller.clearGhost();
  mainMenuTownActive = true;
}

function clearMainMenuTown() {
  if (!mainMenuTownActive) {
    return;
  }

  controller.clearTown();
  mainMenuTownActive = false;
}

function enterGameMode(mode) {
  shell.dataset.screen = 'game';
  clearMainMenuTown();
  setMode(mode);
  openWindow('command');
}

function setMode(mode) {
  shell.dataset.mode = mode;
  buildMode.classList.toggle('is-active', mode === 'build');
  generateMode.classList.toggle('is-active', mode === 'generate');
  viewMode.classList.toggle('is-active', mode === 'view');
  dockButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.skill === mode);
  });
  controller.setMode(mode);
}

function openWindow(name) {
  const target = document.querySelector(`[data-window="${name}"]`);

  if (!target) {
    return;
  }

  if (compactUiQuery.matches) {
    windows.forEach((windowElement) => {
      windowElement.hidden = windowElement !== target;
    });
  }

  target.hidden = false;
  shell.dataset.ui = 'expanded';
  uiToggle.textContent = '-';
  uiToggle.title = 'Minify interface';
  uiToggle.setAttribute('aria-label', 'Minify interface');
}

function minifyInterface() {
  shell.dataset.ui = 'minified';
  windows.forEach((windowElement) => {
    windowElement.hidden = true;
  });
  uiToggle.textContent = '+';
  uiToggle.title = 'Expand interface';
  uiToggle.setAttribute('aria-label', 'Expand interface');
}

function restoreInterface() {
  shell.dataset.ui = 'expanded';
  windows.forEach((windowElement) => {
    if (windowElement.dataset.window === 'resident' && !controller.hasSelectedResident()) {
      return;
    }

    windowElement.hidden = false;
  });
  uiToggle.textContent = '-';
  uiToggle.title = 'Minify interface';
  uiToggle.setAttribute('aria-label', 'Minify interface');
}

function toggleInterface() {
  if (shell.dataset.ui === 'minified') {
    restoreInterface();
    return;
  }

  minifyInterface();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function makeWindowsDraggable() {
  document.querySelectorAll('[data-drag-handle]').forEach((handle) => {
    let pointerDragActive = false;

    const startDrag = (event, attachTarget) => {
      if (event.target.closest('button')) {
        return;
      }

      const windowElement = handle.closest('.game-window');
      const shellRect = shell.getBoundingClientRect();
      const windowRect = windowElement.getBoundingClientRect();
      const offsetX = event.clientX - windowRect.left;
      const offsetY = event.clientY - windowRect.top;

      windowElement.classList.add('is-dragging');
      windowElement.style.left = `${windowRect.left - shellRect.left}px`;
      windowElement.style.top = `${windowRect.top - shellRect.top}px`;
      windowElement.style.right = 'auto';
      windowElement.style.bottom = 'auto';

      const moveWindow = (moveEvent) => {
        const maxLeft = shellRect.width - windowRect.width - 12;
        const maxTop = shellRect.height - windowRect.height - 76;
        const nextLeft = clamp(moveEvent.clientX - shellRect.left - offsetX, 8, Math.max(8, maxLeft));
        const nextTop = clamp(moveEvent.clientY - shellRect.top - offsetY, 8, Math.max(8, maxTop));

        windowElement.style.left = `${nextLeft}px`;
        windowElement.style.top = `${nextTop}px`;
      };

      const stopDrag = () => {
        windowElement.classList.remove('is-dragging');
        attachTarget.removeEventListener('pointermove', moveWindow);
        attachTarget.removeEventListener('pointerup', stopDrag);
        attachTarget.removeEventListener('pointercancel', stopDrag);
        attachTarget.removeEventListener('mousemove', moveWindow);
        attachTarget.removeEventListener('mouseup', stopDrag);
      };

      attachTarget.addEventListener('pointermove', moveWindow);
      attachTarget.addEventListener('pointerup', stopDrag);
      attachTarget.addEventListener('pointercancel', stopDrag);
      attachTarget.addEventListener('mousemove', moveWindow);
      attachTarget.addEventListener('mouseup', stopDrag);
    };

    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) {
        return;
      }

      pointerDragActive = true;
      handle.setPointerCapture(event.pointerId);
      startDrag(event, handle);

      const clearPointerDrag = () => {
        pointerDragActive = false;
        handle.releasePointerCapture(event.pointerId);
        handle.removeEventListener('pointerup', clearPointerDrag);
        handle.removeEventListener('pointercancel', clearPointerDrag);
      };

      handle.addEventListener('pointerup', clearPointerDrag);
      handle.addEventListener('pointercancel', clearPointerDrag);
    });

    handle.addEventListener('mousedown', (event) => {
      if (pointerDragActive) {
        return;
      }

      startDrag(event, document);
    });
  });
}

makeWindowsDraggable();

document.querySelectorAll('[data-window-close]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelector(`[data-window="${button.dataset.windowClose}"]`).hidden = true;
  });
});

dockButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const skill = button.dataset.skill;

    if (skill === 'build' || skill === 'placement') {
      setMode('build');
    }

    if (skill === 'generate') {
      setMode('generate');
    }

    if (skill === 'view') {
      setMode('view');
    }

    openWindow(button.dataset.windowOpen);
  });
});

uiToggle.addEventListener('click', toggleInterface);
fullscreenToggle.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  setFullscreenButtonState(Boolean(document.fullscreenElement));
});
musicToggle.addEventListener('click', () => {
  setMusicMuted(!backgroundMusic.muted);
});
startSandbox.addEventListener('click', () => {
  enterGameMode('build');
});
menuOptions.addEventListener('click', () => {
  const isOpen = menuOptions.getAttribute('aria-expanded') === 'true';
  menuOptions.setAttribute('aria-expanded', String(!isOpen));
  menuOptionsPanel.hidden = isOpen;
});
menuMusic.addEventListener('click', () => {
  setMusicMuted(!backgroundMusic.muted);
});
menuFullscreen.addEventListener('click', toggleFullscreen);

if (!document.fullscreenEnabled) {
  fullscreenToggle.disabled = true;
  fullscreenToggle.title = 'Fullscreen is not available';
  fullscreenToggle.setAttribute('aria-label', 'Fullscreen is not available');
  menuFullscreen.disabled = true;
  menuFullscreen.title = 'Fullscreen is not available';
  menuFullscreen.setAttribute('aria-label', 'Fullscreen is not available');
}

setFullscreenButtonState(Boolean(document.fullscreenElement));
setMusicMuted(true);

if (compactUiQuery.matches) {
  document.querySelector('[data-window="placement"]').hidden = true;
}

buildMode.addEventListener('click', () => {
  setMode('build');

  if (compactUiQuery.matches) {
    openWindow('assets');
  }
});

generateMode.addEventListener('click', () => {
  setMode('generate');

  if (compactUiQuery.matches) {
    openWindow('generate');
  }
});

viewMode.addEventListener('click', () => {
  setMode('view');

  if (compactUiQuery.matches) {
    openWindow('command');
  }
});

gridSize.addEventListener('input', () => {
  const value = Number(gridSize.value);
  gridSizeValue.value = `${value}m`;
  controller.setGridSize(value);
});

trafficDensity.addEventListener('input', () => {
  const value = Number(trafficDensity.value);
  trafficDensityValue.value = `${value}%`;
  controller.setTrafficDensity(value / 100);
  generateTrafficDensity.value = trafficDensity.value;
  generateTrafficDensityValue.value = `${value}%`;
});

townSize.addEventListener('input', () => {
  const value = Number(townSize.value);
  townSizeValue.value = townSizeLabels[value] ?? 'Medium';
  controller.setGenerationOptions({ townSize: value });
});

buildingDensity.addEventListener('input', () => {
  const value = Number(buildingDensity.value);
  buildingDensityValue.value = `${value}%`;
  controller.setGenerationOptions({ buildingDensity: value / 100 });
});

foliageDensity.addEventListener('input', () => {
  const value = Number(foliageDensity.value);
  foliageDensityValue.value = `${value}%`;
  controller.setGenerationOptions({ foliageDensity: value / 100 });
});

generateTrafficDensity.addEventListener('input', () => {
  const value = Number(generateTrafficDensity.value);
  generateTrafficDensityValue.value = `${value}%`;
  trafficDensity.value = generateTrafficDensity.value;
  trafficDensityValue.value = `${value}%`;
  controller.setGenerationOptions({ trafficDensity: value / 100 });
  controller.setTrafficDensity(value / 100);
});

document.querySelector('#rotate-left').addEventListener('click', () => controller.rotateSelected(-1));
document.querySelector('#rotate-right').addEventListener('click', () => controller.rotateSelected(1));
document.querySelector('#duplicate').addEventListener('click', () => controller.duplicateSelected());
document.querySelector('#delete-selected').addEventListener('click', () => controller.deleteSelected());
document.querySelector('#reload-assets').addEventListener('click', () => controller.loadAssets(assetPacks));
document.querySelector('#generate-town').addEventListener('click', () => controller.generateTown());
document.querySelector('#clear-town').addEventListener('click', () => controller.clearTown());

await controller.loadAssets(assetPacks);
if (shell.dataset.screen === 'menu') {
  generateMainMenuTown();
}
setMode('build');
scene.start();
