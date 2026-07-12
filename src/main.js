import './styles/app.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import * as THREE from 'three';
import { SceneManager } from './editor/SceneManager.js';
import { PlacementController } from './editor/PlacementController.js';
import { assetPacks } from './editor/assetCatalog.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <main class="builder-shell" data-mode="build" data-play-mode="sandbox" data-screen="menu" data-ui="expanded">
    <section class="viewport-wrap">
      <div id="viewport" class="viewport" aria-label="3D street builder viewport"></div>
      <div id="world-alerts" class="world-alerts" aria-label="3D scene alerts"></div>

      <section class="town-generation-overlay" id="town-generation-overlay" aria-label="Generating town" aria-live="polite" aria-modal="true" role="dialog" hidden>
        <div class="town-generation-card">
          <span class="town-generation-spinner" aria-hidden="true"></span>
          <p>Generating town...</p>
        </div>
      </section>

      <section class="main-menu" aria-label="Main menu">
        <div class="main-menu-content">
          <h1 class="main-menu-title">
            <img src="${import.meta.env.BASE_URL}assets/branding/cozy-street-builder-logo.png" alt="Cozy Street Builder" />
          </h1>
          <div class="main-menu-box" aria-label="Main menu actions">
            <button class="main-menu-button primary" id="start-normal" type="button" disabled>
              <i class="fa-solid fa-play" aria-hidden="true"></i>
              <span>Play Normal Mode</span>
            </button>
            <button class="main-menu-button" id="start-sandbox" type="button" disabled>
              <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
              <span>Sandbox Mode</span>
            </button>
            <button class="main-menu-button" id="continue-town" type="button" disabled hidden>
              <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>
              <span>Continue Saved Town</span>
            </button>
            <button class="main-menu-button" id="menu-import-town" type="button" disabled>
              <i class="fa-solid fa-folder-open" aria-hidden="true"></i>
              <span>Load Town File</span>
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
            <p class="main-menu-credit">
              <i class="fa-solid fa-star" aria-hidden="true"></i>
              <span>Created by Matthias Wurm</span>
            </p>
          </div>
        </div>
        <span class="main-menu-version" aria-label="Application version">${__APP_VERSION__}</span>
      </section>

      <section class="escape-overlay" id="escape-overlay" aria-label="Paused game menu" aria-modal="true" role="dialog" hidden>
        <div class="escape-card">
          <header class="escape-header">
            <div>
              <p class="eyebrow">Game paused</p>
              <h2>Your Town</h2>
            </div>
            <span class="escape-key" aria-label="Escape key">Esc</span>
          </header>
          <p class="escape-summary" id="escape-summary">Manage this town or return to building.</p>
          <div class="escape-actions">
            <button class="escape-button primary" id="resume-game" type="button">
              <i class="fa-solid fa-play" aria-hidden="true"></i><span>Resume</span>
            </button>
            <button class="escape-button" id="save-town" type="button">
              <i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Save Town</span>
            </button>
            <button class="escape-button" id="export-town" type="button">
              <i class="fa-solid fa-file-export" aria-hidden="true"></i><span>Export to File</span>
            </button>
            <button class="escape-button" id="load-saved-town" type="button">
              <i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i><span>Load Saved Town</span>
            </button>
            <button class="escape-button" id="import-town" type="button">
              <i class="fa-solid fa-file-import" aria-hidden="true"></i><span>Load from File</span>
            </button>
            <button class="escape-button danger" id="return-main-menu" type="button">
              <i class="fa-solid fa-house" aria-hidden="true"></i><span>Return to Main Menu</span>
            </button>
          </div>
          <p class="save-status" id="save-status" role="status" aria-live="polite"></p>
        </div>
      </section>

      <section class="confirm-overlay" id="main-menu-confirm" aria-labelledby="main-menu-confirm-title" aria-describedby="main-menu-confirm-message" aria-modal="true" role="dialog" hidden>
        <div class="confirm-card">
          <span class="confirm-icon" aria-hidden="true"><i class="fa-solid fa-house"></i></span>
          <div>
            <p class="eyebrow">Leave town?</p>
            <h2 id="main-menu-confirm-title">Return to Main Menu</h2>
          </div>
          <p id="main-menu-confirm-message">Any unsaved changes will be lost. Export or save first if you want to keep this town.</p>
          <div class="confirm-actions">
            <button class="escape-button" id="cancel-main-menu" type="button">Keep Building</button>
            <button class="escape-button danger" id="confirm-main-menu" type="button">Return to Menu</button>
          </div>
        </div>
      </section>
      <input id="town-file-input" type="file" accept="application/json,.json,.cozytown" hidden />

      <div class="hud-root" aria-label="Street builder interface">
        <div class="top-right-controls" aria-label="Viewport controls">
          <button class="hud-button escape-toggle" id="escape-toggle" type="button" aria-label="Open game menu" aria-expanded="false" aria-controls="escape-overlay" title="Game menu (Escape)">
            <i class="fa-solid fa-bars" aria-hidden="true"></i>
            <span>Menu</span>
          </button>
          <button class="hud-button" id="fullscreen-toggle" type="button" aria-label="Enter fullscreen" title="Enter fullscreen">
            <i class="fa-solid fa-expand" id="fullscreen-toggle-icon" aria-hidden="true"></i>
          </button>
          <button class="hud-button music-toggle" id="music-toggle" type="button" aria-label="Turn music on" aria-pressed="false" title="Turn music on">
            <i class="fa-solid fa-volume-xmark" id="music-toggle-icon" aria-hidden="true"></i>
          </button>
        </div>
        <button class="day-night-clock" id="day-night-clock" type="button" aria-label="Time 08:00, Sunlit" aria-expanded="false" aria-controls="day-night-panel">
          <i class="fa-solid fa-sun" id="day-night-clock-icon" aria-hidden="true"></i>
          <div>
            <span class="clock-kicker">Time</span>
            <time id="fictional-clock-time" datetime="08:00">08:00</time>
            <span class="clock-period" id="fictional-clock-period">Sunlit</span>
          </div>
        </button>
        <div class="day-night-panel" id="day-night-panel" hidden>
          <div class="clock-action-grid" role="group" aria-label="Clock controls">
            <button id="set-day-time" type="button" title="Set day">
              <i class="fa-solid fa-sun" aria-hidden="true"></i>
              <span>Day</span>
            </button>
            <button id="set-night-time" type="button" title="Set night">
              <i class="fa-solid fa-moon" aria-hidden="true"></i>
              <span>Night</span>
            </button>
            <button id="pause-time" type="button" title="Pause time">
              <i class="fa-solid fa-pause" id="pause-time-icon" aria-hidden="true"></i>
              <span id="pause-time-label">Pause</span>
            </button>
          </div>
          <div class="weather-action-grid" role="group" aria-label="Weather controls">
            <button id="weather-sunny" type="button" title="Set sunny weather">
              <i class="fa-solid fa-sun" aria-hidden="true"></i>
              <span>Sunny</span>
            </button>
            <button id="weather-rain" type="button" title="Set rain">
              <i class="fa-solid fa-cloud-rain" aria-hidden="true"></i>
              <span>Rain</span>
            </button>
            <button id="weather-snow" type="button" title="Set snow">
              <i class="fa-solid fa-snowflake" aria-hidden="true"></i>
              <span>Snow</span>
            </button>
            <button id="weather-random" type="button" title="Random weather from the clock">
              <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
              <span>Random</span>
            </button>
          </div>
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
              <button class="generation-entry" id="generate-mode" type="button">Generate</button>
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

        <section class="game-window generate-window generate-only generation-entry" data-window="generate" aria-label="Generate window">
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

        <aside class="economy-hud normal-only" id="economy-hud" aria-label="Town economy">
          <div class="economy-topline">
            <div>
              <span class="economy-kicker">Town Funds</span>
              <strong id="economy-balance">$2,500</strong>
            </div>
            <div class="tax-income" aria-label="Tax income">
              <span>Next taxes</span>
              <strong id="tax-income">+$0</strong>
            </div>
          </div>
          <label class="tax-control" for="tax-rate">
            <span>Tax rate</span>
            <input id="tax-rate" type="range" min="0" max="20" value="8" step="1" />
            <output id="tax-rate-value">8%</output>
          </label>
          <div class="happiness-block">
            <div class="happiness-heading">
              <span><i class="fa-solid fa-face-smile" aria-hidden="true"></i> Happiness</span>
              <strong id="happiness-value">54%</strong>
            </div>
            <div class="happiness-track" role="progressbar" aria-label="Town happiness" aria-valuemin="0" aria-valuemax="100" aria-valuenow="54">
              <span id="happiness-fill"></span>
            </div>
            <div class="happiness-factors" aria-label="Happiness factors">
              <span title="Lower taxes improve happiness"><i class="fa-solid fa-coins" aria-hidden="true"></i> Taxes <strong id="tax-happiness-score">68</strong></span>
              <span title="More plants improve happiness"><i class="fa-solid fa-leaf" aria-hidden="true"></i> Greenery <strong id="foliage-happiness-score">45</strong></span>
              <span title="A complete road network improves happiness"><i class="fa-solid fa-road" aria-hidden="true"></i> Roads <strong id="road-happiness-score">45</strong></span>
            </div>
            <p id="happiness-note">Build roads and add plants to make the new town feel welcoming.</p>
          </div>
        </aside>

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

        <section class="game-window fire-window" data-window="fire" aria-label="Fire response window" hidden>
          <header class="window-titlebar emergency-titlebar" data-drag-handle>
            <div>
              <p class="eyebrow">Emergency</p>
              <h2 id="fire-building-name">Building Fire</h2>
            </div>
            <button class="window-close" type="button" data-window-close="fire" title="Close fire response" aria-label="Close fire response">X</button>
          </header>

          <div class="window-body fire-window-body">
            <dl class="status-list">
              <div>
                <dt>Status</dt>
                <dd id="fire-status">Smoke reported</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd id="fire-location">-</dd>
              </div>
            </dl>
            <button id="dispatch-fire-truck" class="primary-action fire-action" type="button">
              <i class="fa-solid fa-truck-medical" aria-hidden="true"></i>
              <span>Dispatch Fire Truck</span>
            </button>
          </div>
        </section>

        <nav class="skill-dock" aria-label="Skill dock">
          <button class="dock-button dock-minimize" type="button" data-ui-toggle title="Minify interface" aria-label="Minify interface">-</button>
          <button class="dock-button" type="button" data-skill="build" data-window-open="assets" title="Build skills">Build</button>
          <button class="dock-button" type="button" data-skill="placement" data-window-open="placement" title="Edit skills">Edit</button>
          <button class="dock-button generation-entry" type="button" data-skill="generate" data-window-open="generate" title="World skills">World</button>
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
  fireWindow: document.querySelector('[data-window="fire"]'),
  fireBuildingName: document.querySelector('#fire-building-name'),
  fireStatus: document.querySelector('#fire-status'),
  fireLocation: document.querySelector('#fire-location'),
  dispatchFireTruck: document.querySelector('#dispatch-fire-truck'),
  worldAlerts: document.querySelector('#world-alerts'),
  canPlaceAsset: (asset) => canAffordAsset(asset, true),
  onAssetPlaced: (asset) => purchaseAsset(asset),
  onTownChanged: () => updateEconomyHud(),
  getAssetPriceLabel: (asset) => getAssetPriceLabel(asset),
  isAssetAffordable: (asset) => canAffordAsset(asset, false),
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
const dayNightClock = document.querySelector('#day-night-clock');
const dayNightClockIcon = document.querySelector('#day-night-clock-icon');
const dayNightPanel = document.querySelector('#day-night-panel');
const fictionalClockTime = document.querySelector('#fictional-clock-time');
const fictionalClockPeriod = document.querySelector('#fictional-clock-period');
const setDayTime = document.querySelector('#set-day-time');
const setNightTime = document.querySelector('#set-night-time');
const pauseTime = document.querySelector('#pause-time');
const pauseTimeIcon = document.querySelector('#pause-time-icon');
const pauseTimeLabel = document.querySelector('#pause-time-label');
const weatherButtons = {
  sunny: document.querySelector('#weather-sunny'),
  rain: document.querySelector('#weather-rain'),
  snow: document.querySelector('#weather-snow'),
  random: document.querySelector('#weather-random'),
};
const startSandbox = document.querySelector('#start-sandbox');
const townGenerationOverlay = document.querySelector('#town-generation-overlay');
const startNormal = document.querySelector('#start-normal');
const continueTown = document.querySelector('#continue-town');
const menuImportTown = document.querySelector('#menu-import-town');
const menuOptions = document.querySelector('#menu-options');
const menuOptionsPanel = document.querySelector('#menu-options-panel');
const menuMusic = document.querySelector('#menu-music');
const menuFullscreen = document.querySelector('#menu-fullscreen');
const backgroundMusic = new Audio(assetUrl('/assets/sounds/bg.mp3'));
let mainMenuTownActive = false;
let mainMenuBuildAnimation = null;
const mainMenuCameraTarget = new THREE.Vector3(0, 2.5, 0);
const mainMenuCameraPosition = new THREE.Vector3(13, 8.5, 13);
const MAIN_MENU_CAMERA_SPEED = 0.055;
const economyBalance = document.querySelector('#economy-balance');
const taxRate = document.querySelector('#tax-rate');
const taxRateValue = document.querySelector('#tax-rate-value');
const taxIncome = document.querySelector('#tax-income');
const happinessValue = document.querySelector('#happiness-value');
const happinessFill = document.querySelector('#happiness-fill');
const happinessTrack = document.querySelector('.happiness-track');
const happinessNote = document.querySelector('#happiness-note');
const taxHappinessScore = document.querySelector('#tax-happiness-score');
const foliageHappinessScore = document.querySelector('#foliage-happiness-score');
const roadHappinessScore = document.querySelector('#road-happiness-score');
const economyHud = document.querySelector('#economy-hud');
const escapeOverlay = document.querySelector('#escape-overlay');
const escapeToggle = document.querySelector('#escape-toggle');
const escapeSummary = document.querySelector('#escape-summary');
const saveStatus = document.querySelector('#save-status');
const mainMenuConfirm = document.querySelector('#main-menu-confirm');
const cancelMainMenu = document.querySelector('#cancel-main-menu');
const confirmMainMenu = document.querySelector('#confirm-main-menu');
const townFileInput = document.querySelector('#town-file-input');
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const TAX_CYCLE_MS = 10000;
const TOWN_SAVE_KEY = 'cozy-street-builder:town:v1';
const TOWN_FILE_VERSION = 1;
let economyEnabled = false;
let assetsReady = false;
let balance = 2500;
let happiness = 54;
let taxTimer = null;

function getAssetCost(asset) {
  return asset?.kind === 'building' ? Math.max(0, Number(asset.cost) || 0) : 0;
}

function getTownCounts() {
  return controller.placed.reduce((counts, object) => {
    const kind = object.userData.assetKind;
    counts[kind] = (counts[kind] ?? 0) + 1;
    return counts;
  }, {});
}

function getTaxIncome() {
  const buildingCount = getTownCounts().building ?? 0;
  return Math.round(buildingCount * 25 * (Number(taxRate.value) / 10));
}

function getHappinessFactors(counts, rate) {
  const buildingCount = counts.building ?? 0;
  const foliageCount = counts.foliage ?? 0;
  const roadCount = counts.road ?? 0;
  const foliageTarget = Math.max(2, Math.ceil(buildingCount / 2));
  const roadTarget = Math.max(4, buildingCount * 2);

  return {
    taxes: clamp(100 - rate * 4, 20, 100),
    foliage: clamp(45 + (foliageCount / foliageTarget) * 55, 45, 100),
    roads: clamp(45 + (roadCount / roadTarget) * 55, 45, 100),
    foliageCount,
    foliageTarget,
    roadCount,
    roadTarget,
  };
}

function getAssetPriceLabel(asset) {
  if (!economyEnabled) {
    return '';
  }

  const cost = getAssetCost(asset);
  return cost === 0 ? 'Free' : currency.format(cost);
}

function canAffordAsset(asset, showFeedback) {
  const cost = getAssetCost(asset);
  const affordable = !economyEnabled || cost <= balance;

  if (!affordable && showFeedback) {
    controller.elements.modeLabel.textContent = `You need ${currency.format(cost - balance)} more to build ${asset.name}.`;
    economyHud.classList.remove('is-alerting');
    requestAnimationFrame(() => economyHud.classList.add('is-alerting'));
  }

  return affordable;
}

function purchaseAsset(asset) {
  if (!economyEnabled) {
    return;
  }

  const cost = getAssetCost(asset);
  balance -= cost;
  controller.elements.modeLabel.textContent = cost > 0
    ? `${asset.name} built for ${currency.format(cost)}.`
    : `${asset.name} placed for free.`;
  updateEconomyHud();
}

function updateEconomyHud() {
  if (!economyBalance) {
    return;
  }

  const rate = Number(taxRate.value);
  const counts = getTownCounts();
  const factors = getHappinessFactors(counts, rate);
  happiness = factors.taxes * 0.4 + factors.foliage * 0.3 + factors.roads * 0.3;
  const income = getTaxIncome();

  economyBalance.textContent = currency.format(balance);
  taxRateValue.value = `${rate}%`;
  taxIncome.textContent = `+${currency.format(income)}`;
  happinessValue.textContent = `${Math.round(happiness)}%`;
  happinessFill.style.width = `${happiness}%`;
  happinessTrack.setAttribute('aria-valuenow', String(Math.round(happiness)));
  taxHappinessScore.textContent = Math.round(factors.taxes);
  foliageHappinessScore.textContent = Math.round(factors.foliage);
  roadHappinessScore.textContent = Math.round(factors.roads);

  const weakestFactor = [
    { score: factors.taxes, note: 'Lowering taxes would give residents more breathing room.' },
    { score: factors.foliage, note: `Add more plants around town (${factors.foliageCount}/${factors.foliageTarget} recommended).` },
    { score: factors.roads, note: `Expand the road network (${factors.roadCount}/${factors.roadTarget} recommended pieces).` },
  ].sort((a, b) => a.score - b.score)[0];

  happinessNote.textContent = happiness >= 90
    ? 'Residents love the balance of taxes, greenery, and infrastructure.'
    : weakestFactor.note;
  economyHud.dataset.mood = happiness >= 60 ? 'happy' : happiness >= 40 ? 'uneasy' : 'unhappy';
  controller.refreshAssetButtons();
}

function collectTaxes() {
  if (!economyEnabled || shell.dataset.screen !== 'game' || !escapeOverlay.hidden) {
    return;
  }

  const income = getTaxIncome();
  balance += income;
  updateEconomyHud();
  economyHud.classList.remove('is-paying');
  requestAnimationFrame(() => economyHud.classList.add('is-paying'));
}

function setEconomyEnabled(enabled, reset = true) {
  economyEnabled = enabled;
  shell.dataset.playMode = enabled ? 'normal' : 'sandbox';
  window.clearInterval(taxTimer);
  taxTimer = null;

  if (enabled && reset) {
    balance = 2500;
    taxRate.value = '8';
  }

  if (enabled) {
    taxTimer = window.setInterval(collectTaxes, TAX_CYCLE_MS);
  }

  updateEconomyHud();
}

function createTownSave() {
  const now = new Date();
  return {
    format: 'cozy-street-builder-town',
    version: TOWN_FILE_VERSION,
    savedAt: now.toISOString(),
    town: {
      playMode: economyEnabled ? 'normal' : 'sandbox',
      objects: controller.exportTownObjects(),
      editor: {
        mode: shell.dataset.mode,
        gridSize: Number(gridSize.value),
        generationOptions: getGenerationOptionsFromControls(),
      },
      economy: {
        balance,
        taxRate: Number(taxRate.value),
        happiness,
      },
      trafficDensity: Number(trafficDensity.value) / 100,
      environment: scene.getEnvironmentState(),
      camera: {
        position: scene.camera.position.toArray(),
        target: scene.controls.target.toArray(),
      },
    },
  };
}

function validateTownSave(save) {
  if (!save || save.format !== 'cozy-street-builder-town' || save.version !== TOWN_FILE_VERSION) {
    throw new Error('This is not a supported Cozy Street Builder town file.');
  }

  if (!save.town || !Array.isArray(save.town.objects) || save.town.objects.length > 10000) {
    throw new Error('The town file is incomplete or contains too many pieces.');
  }

  if (!['normal', 'sandbox'].includes(save.town.playMode)) {
    throw new Error('The town file has an invalid play mode.');
  }

  const hasFiniteVector = (value) => Array.isArray(value)
    && value.length >= 3
    && value.slice(0, 3).every(Number.isFinite);

  save.town.objects.forEach((record, index) => {
    if (typeof record?.assetId !== 'string' || !hasFiniteVector(record.position) || !hasFiniteVector(record.rotation)) {
      throw new Error(`Town piece ${index + 1} has invalid data.`);
    }

    if (record.scale !== undefined && !hasFiniteVector(record.scale)) {
      throw new Error(`Town piece ${index + 1} has an invalid scale.`);
    }
  });

  return save;
}

function updateContinueButton() {
  try {
    continueTown.hidden = !localStorage.getItem(TOWN_SAVE_KEY);
    continueTown.disabled = !assetsReady;
  } catch {
    continueTown.hidden = true;
  }
}

function setSaveStatus(message, isError = false) {
  saveStatus.textContent = message;
  saveStatus.classList.toggle('is-error', isError);
}

function openEscapeMenu() {
  if (shell.dataset.screen !== 'game' || !escapeOverlay.hidden) {
    return;
  }

  controller.select(null);
  controller.clearGhost();
  setDayNightPanelOpen(false);
  scene.setSimulationPaused(true);
  escapeSummary.textContent = `${economyEnabled ? 'Normal' : 'Sandbox'} town · ${controller.placed.length} pieces${economyEnabled ? ` · ${currency.format(balance)}` : ''}`;
  setSaveStatus('');
  escapeOverlay.hidden = false;
  escapeToggle.setAttribute('aria-expanded', 'true');
  document.querySelector('#resume-game').focus();
}

function closeEscapeMenu() {
  if (escapeOverlay.hidden) {
    return;
  }

  escapeOverlay.hidden = true;
  escapeToggle.setAttribute('aria-expanded', 'false');
  scene.setSimulationPaused(false);
  escapeToggle.focus();
}

function saveTownToBrowser() {
  try {
    const save = createTownSave();
    localStorage.setItem(TOWN_SAVE_KEY, JSON.stringify(save));
    updateContinueButton();
    setSaveStatus(`Saved locally at ${new Date(save.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`);
  } catch (error) {
    setSaveStatus(`Could not save: ${error.message}`, true);
  }
}

function exportTownToFile() {
  try {
    const save = createTownSave();
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = save.savedAt.slice(0, 10);
    anchor.href = url;
    anchor.download = `cozy-town-${save.town.playMode}-${date}.cozytown`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSaveStatus('Town exported. Keep the .cozytown file somewhere safe.');
  } catch (error) {
    setSaveStatus(`Could not export: ${error.message}`, true);
  }
}

function applyTownSave(rawSave) {
  if (!assetsReady) {
    throw new Error('Town pieces are still loading. Please try again in a moment.');
  }

  const save = validateTownSave(rawSave);
  const town = save.town;
  const normalMode = town.playMode === 'normal';

  clearMainMenuTown();
  setEconomyEnabled(normalMode);
  enterGameMode(town.editor?.mode ?? 'build');

  const grid = clamp(finiteNumber(town.editor?.gridSize, 2), 0.5, 4);
  gridSize.value = String(grid);
  gridSizeValue.value = `${grid}m`;
  controller.setGridSize(grid);

  const options = town.editor?.generationOptions ?? {};
  townSize.value = String(clamp(Math.round(finiteNumber(options.townSize, 1)), 0, 2));
  buildingDensity.value = String(Math.round(clamp(finiteNumber(options.buildingDensity, 0.7), 0, 1) * 100));
  foliageDensity.value = String(Math.round(clamp(finiteNumber(options.foliageDensity, 0.55), 0, 1) * 100));
  const density = clamp(finiteNumber(town.trafficDensity, 0.5), 0, 1);
  trafficDensity.value = String(Math.round(density * 100));
  generateTrafficDensity.value = trafficDensity.value;
  townSizeValue.value = townSizeLabels[Number(townSize.value)] ?? 'Medium';
  buildingDensityValue.value = `${buildingDensity.value}%`;
  foliageDensityValue.value = `${foliageDensity.value}%`;
  trafficDensityValue.value = `${trafficDensity.value}%`;
  generateTrafficDensityValue.value = `${trafficDensity.value}%`;
  controller.setGenerationOptions({
    townSize: Number(townSize.value),
    buildingDensity: Number(buildingDensity.value) / 100,
    foliageDensity: Number(foliageDensity.value) / 100,
    trafficDensity: density,
  });
  controller.setTrafficDensity(density);

  const result = controller.importTownObjects(town.objects);

  if (normalMode) {
    balance = Number.isFinite(town.economy?.balance) ? town.economy.balance : 2500;
    taxRate.value = String(clamp(finiteNumber(town.economy?.taxRate, 8), 0, 20));
  }

  scene.setEnvironmentState(town.environment);
  if (Array.isArray(town.camera?.position) && town.camera.position.length >= 3 && town.camera.position.slice(0, 3).every(Number.isFinite)) {
    scene.camera.position.fromArray(town.camera.position);
  }
  if (Array.isArray(town.camera?.target) && town.camera.target.length >= 3 && town.camera.target.slice(0, 3).every(Number.isFinite)) {
    scene.controls.target.fromArray(town.camera.target);
  }
  scene.controls.update();
  updateEconomyHud();
  setMode(town.editor?.mode ?? 'build');

  const missingNote = result.missingAssetIds.length
    ? ` ${result.missingAssetIds.length} unavailable asset type(s) were skipped.`
    : '';
  return `Loaded ${result.loaded} pieces.${missingNote}`;
}

function loadSavedTown() {
  try {
    const stored = localStorage.getItem(TOWN_SAVE_KEY);
    if (!stored) {
      throw new Error('No locally saved town was found.');
    }
    const message = applyTownSave(JSON.parse(stored));
    closeEscapeMenu();
    controller.elements.modeLabel.textContent = message;
  } catch (error) {
    if (shell.dataset.screen === 'menu') {
      window.alert(`Could not load town: ${error.message}`);
    } else {
      setSaveStatus(`Could not load: ${error.message}`, true);
    }
  }
}

function returnToMainMenu() {
  if (controller.placed.length > 0) {
    mainMenuConfirm.hidden = false;
    cancelMainMenu.focus();
    return;
  }

  completeReturnToMainMenu();
}

function cancelReturnToMainMenu() {
  mainMenuConfirm.hidden = true;
  document.querySelector('#return-main-menu').focus();
}

function completeReturnToMainMenu() {
  mainMenuConfirm.hidden = true;

  escapeOverlay.hidden = true;
  escapeToggle.setAttribute('aria-expanded', 'false');
  controller.setFireSimulationEnabled(false);
  controller.clearTown();
  setEconomyEnabled(false);
  shell.dataset.screen = 'menu';
  scene.setSimulationPaused(false);
  generateMainMenuTown();
  updateContinueButton();
}

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
  stopMainMenuBuildAnimation();
  scene.setTimeFrozen(true);
  scene.setDayTime();
  controller.setGenerationOptions(getGenerationOptionsFromControls());
  controller.setTrafficDensity(Number(generateTrafficDensity.value) / 100);
  controller.generateTown();
  controller.select(null);
  controller.clearGhost();
  mainMenuTownActive = true;

  scene.controls.target.copy(mainMenuCameraTarget);
  scene.camera.position.copy(mainMenuCameraPosition);
  scene.controls.update();
  startMainMenuBuildAnimation();
}

function startMainMenuBuildAnimation({ ambientAfter = true, onComplete = null } = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onComplete?.();
    return;
  }

  const kindOrder = { road: 0, building: 1, streetlight: 2, foliage: 3 };
  const shuffledObjects = controller.placed
    .map((object) => ({ object, randomOrder: Math.random() }))
    .sort((a, b) => {
      const kindDifference = (kindOrder[a.object.userData.assetKind] ?? 4)
        - (kindOrder[b.object.userData.assetKind] ?? 4);
      return kindDifference || a.randomOrder - b.randomOrder;
    });
  const animationSpan = 5.5;

  mainMenuBuildAnimation = {
    elapsed: 0,
    ambient: false,
    ambientAfter,
    onComplete,
    nextChange: 0,
    items: shuffledObjects.map(({ object }, index) => {
      const baseScale = object.scale.clone();
      const baseY = object.position.y;
      const delay = shuffledObjects.length > 1
        ? (index / (shuffledObjects.length - 1)) * animationSpan
        : 0;
      object.scale.setScalar(0.001);
      object.position.y = baseY - (object.userData.assetKind === 'road' ? 0.16 : 0.7);
      return { object, baseScale, baseY, delay, phase: 'opening', phaseElapsed: 0 };
    }),
  };
}

function stopMainMenuBuildAnimation({ finish = false } = {}) {
  if (!mainMenuBuildAnimation) {
    return;
  }

  if (finish) {
    mainMenuBuildAnimation.items.forEach(({ object, baseScale, baseY }) => {
      object.scale.copy(baseScale);
      object.position.y = baseY;
    });
  }
  mainMenuBuildAnimation = null;
}

function updateMainMenuBackdrop(delta) {
  if (shell.dataset.screen === 'menu') {
    const offset = scene.camera.position.clone().sub(scene.controls.target);
    offset.applyAxisAngle(THREE.Object3D.DEFAULT_UP, MAIN_MENU_CAMERA_SPEED * delta);
    scene.camera.position.copy(scene.controls.target).add(offset);
  }

  if (!mainMenuBuildAnimation) {
    return;
  }

  mainMenuBuildAnimation.elapsed += delta;
  if (mainMenuBuildAnimation.ambient) {
    updateMainMenuTownChanges(delta);
    return;
  }

  let animationComplete = true;
  mainMenuBuildAnimation.items.forEach(({ object, baseScale, baseY, delay }) => {
    const progress = THREE.MathUtils.clamp((mainMenuBuildAnimation.elapsed - delay) / 0.65, 0, 1);
    if (progress < 1) animationComplete = false;
    const eased = progress === 0 ? 0.001 : 1 - Math.pow(1 - progress, 3);
    const bounce = progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) * 0.08 : 0;
    object.scale.copy(baseScale).multiplyScalar(eased + bounce);
    object.position.y = THREE.MathUtils.lerp(baseY - (object.userData.assetKind === 'road' ? 0.16 : 0.7), baseY, eased);
  });

  if (animationComplete) {
    const completedAnimation = mainMenuBuildAnimation;
    completedAnimation.items.forEach((item) => {
      item.phase = 'idle';
      item.object.scale.copy(item.baseScale);
      item.object.position.y = item.baseY;
    });
    completedAnimation.onComplete?.();
    if (completedAnimation.ambientAfter) {
      completedAnimation.ambient = true;
      completedAnimation.nextChange = 0.45;
    } else {
      mainMenuBuildAnimation = null;
    }
  }
}

function generateSandboxTown() {
  if (!townGenerationOverlay.hidden) {
    return;
  }

  townGenerationOverlay.hidden = false;
  document.querySelector('#generate-town').disabled = true;

  requestAnimationFrame(() => {
    controller.generateTown();
    controller.select(null);
    controller.clearGhost();
    startMainMenuBuildAnimation({
      ambientAfter: false,
      onComplete: () => {
        townGenerationOverlay.hidden = true;
        document.querySelector('#generate-town').disabled = false;
      },
    });
  });
}

function updateMainMenuTownChanges(delta) {
  const animation = mainMenuBuildAnimation;
  animation.nextChange -= delta;
  const activeCount = animation.items.filter((item) => item.phase !== 'idle').length;

  if (animation.nextChange <= 0 && activeCount < 7) {
    const candidates = animation.items.filter((item) => item.phase === 'idle');
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    if (item) {
      item.phase = 'removing';
      item.phaseElapsed = 0;
    }
    animation.nextChange = THREE.MathUtils.randFloat(0.3, 0.75);
  }

  animation.items.forEach((item) => {
    if (item.phase === 'idle') return;
    item.phaseElapsed += delta;
    const loweredY = item.baseY - (item.object.userData.assetKind === 'road' ? 0.16 : 0.7);

    if (item.phase === 'removing') {
      const progress = THREE.MathUtils.clamp(item.phaseElapsed / 0.5, 0, 1);
      const eased = Math.pow(1 - progress, 3);
      item.object.scale.copy(item.baseScale).multiplyScalar(Math.max(eased, 0.001));
      item.object.position.y = THREE.MathUtils.lerp(item.baseY, loweredY, progress);
      if (progress >= 1) {
        item.phase = 'hidden';
        item.phaseElapsed = 0;
        item.phaseDuration = THREE.MathUtils.randFloat(0.35, 0.7);
      }
      return;
    }

    if (item.phase === 'hidden') {
      if (item.phaseElapsed >= item.phaseDuration) {
        item.phase = 'adding';
        item.phaseElapsed = 0;
      }
      return;
    }

    const progress = THREE.MathUtils.clamp(item.phaseElapsed / 0.65, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const bounce = progress < 1 ? Math.sin(progress * Math.PI) * 0.08 : 0;
    item.object.scale.copy(item.baseScale).multiplyScalar(eased + bounce);
    item.object.position.y = THREE.MathUtils.lerp(loweredY, item.baseY, eased);
    if (progress >= 1) {
      item.object.scale.copy(item.baseScale);
      item.object.position.y = item.baseY;
      item.phase = 'idle';
      item.phaseElapsed = 0;
    }
  });
}

function clearMainMenuTown() {
  if (!mainMenuTownActive) {
    return;
  }

  stopMainMenuBuildAnimation();
  controller.clearTown();
  mainMenuTownActive = false;
}

function enterGameMode(mode) {
  shell.dataset.screen = 'game';
  clearMainMenuTown();
  scene.setTimeFrozen(false);
  scene.setSimulationPaused(false);
  controller.setFireSimulationEnabled(true);
  setMode(mode);
  openWindow('command');
}

function setMode(mode) {
  if (economyEnabled && mode === 'generate') {
    mode = 'build';
  }

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

    if (windowElement.dataset.window === 'fire' && !controller.hasSelectedFire()) {
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

function setDayNightPanelOpen(isOpen) {
  dayNightPanel.hidden = !isOpen;
  dayNightClock.setAttribute('aria-expanded', String(isOpen));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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
escapeToggle.addEventListener('click', openEscapeMenu);
document.querySelector('#resume-game').addEventListener('click', closeEscapeMenu);
document.querySelector('#save-town').addEventListener('click', saveTownToBrowser);
document.querySelector('#export-town').addEventListener('click', exportTownToFile);
document.querySelector('#load-saved-town').addEventListener('click', loadSavedTown);
document.querySelector('#import-town').addEventListener('click', () => {
  townFileInput.dataset.source = 'escape';
  townFileInput.click();
});
document.querySelector('#return-main-menu').addEventListener('click', returnToMainMenu);
cancelMainMenu.addEventListener('click', cancelReturnToMainMenu);
confirmMainMenu.addEventListener('click', completeReturnToMainMenu);
townFileInput.addEventListener('change', async () => {
  const file = townFileInput.files?.[0];
  const requestedFromMenu = townFileInput.dataset.source === 'menu';

  if (!file) {
    return;
  }

  try {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error('Town files must be smaller than 8 MB.');
    }

    const message = applyTownSave(JSON.parse(await file.text()));
    closeEscapeMenu();
    controller.elements.modeLabel.textContent = message;
  } catch (error) {
    if (requestedFromMenu) {
      window.alert(`Could not load town: ${error.message}`);
    } else {
      setSaveStatus(`Could not load: ${error.message}`, true);
    }
  } finally {
    townFileInput.value = '';
  }
});
fullscreenToggle.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  setFullscreenButtonState(Boolean(document.fullscreenElement));
});
musicToggle.addEventListener('click', () => {
  setMusicMuted(!backgroundMusic.muted);
});
startSandbox.addEventListener('click', () => {
  setEconomyEnabled(false);
  enterGameMode('build');
});
startNormal.addEventListener('click', () => {
  clearMainMenuTown();
  setEconomyEnabled(true);
  enterGameMode('build');
});
continueTown.addEventListener('click', loadSavedTown);
menuImportTown.addEventListener('click', () => {
  townFileInput.dataset.source = 'menu';
  townFileInput.click();
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
dayNightClock.addEventListener('click', () => {
  setDayNightPanelOpen(dayNightPanel.hidden);
});
setDayTime.addEventListener('click', () => {
  scene.setDayTime();
  setDayNightPanelOpen(false);
});
setNightTime.addEventListener('click', () => {
  scene.setNightTime();
  setDayNightPanelOpen(false);
});
pauseTime.addEventListener('click', () => {
  scene.toggleTimePaused();
});
weatherButtons.sunny.addEventListener('click', () => {
  scene.setWeather('sunny');
  setDayNightPanelOpen(false);
});
weatherButtons.rain.addEventListener('click', () => {
  scene.setWeather('rain');
  setDayNightPanelOpen(false);
});
weatherButtons.snow.addEventListener('click', () => {
  scene.setWeather('snow');
  setDayNightPanelOpen(false);
});
weatherButtons.random.addEventListener('click', () => {
  scene.setRandomWeather();
  setDayNightPanelOpen(false);
});
document.addEventListener('click', (event) => {
  if (event.target.closest('.day-night-clock') || event.target.closest('.day-night-panel')) {
    return;
  }

  setDayNightPanelOpen(false);
});
document.addEventListener('keydown', (event) => {
  const activeModal = !mainMenuConfirm.hidden ? mainMenuConfirm : (!escapeOverlay.hidden ? escapeOverlay : null);

  if (event.key === 'Tab' && activeModal) {
    const focusable = [...activeModal.querySelectorAll('button:not(:disabled)')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      last.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first.focus();
      event.preventDefault();
    }
    return;
  }

  if (event.key !== 'Escape') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  setDayNightPanelOpen(false);

  if (!mainMenuConfirm.hidden) {
    cancelReturnToMainMenu();
    return;
  }

  if (shell.dataset.screen !== 'game') {
    return;
  }

  if (escapeOverlay.hidden) {
    openEscapeMenu();
  } else {
    closeEscapeMenu();
  }
});

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
let currentClockState = {
  clockLabel: '08:00',
  period: 'Sunlit',
  isPaused: false,
};
let currentWeatherState = {
  weather: 'sunny',
  label: 'Sunny',
  isAuto: false,
};

function getWeatherReadout() {
  return currentWeatherState.isAuto ? `Random ${currentWeatherState.label}` : currentWeatherState.label;
}

function updateClockReadout() {
  const weatherReadout = getWeatherReadout();
  fictionalClockPeriod.textContent = `${currentClockState.isPaused ? 'Paused' : currentClockState.period} / ${weatherReadout}`;
  dayNightClock.setAttribute(
    'aria-label',
    `Time ${currentClockState.clockLabel}, ${currentClockState.isPaused ? 'paused' : currentClockState.period}, ${weatherReadout}`,
  );
}

scene.onDayNightChange(({ clockLabel, period, isNight, isPaused }) => {
  currentClockState = { clockLabel, period, isPaused };
  fictionalClockTime.textContent = clockLabel;
  fictionalClockTime.setAttribute('datetime', clockLabel);
  dayNightClock.classList.toggle('is-night', isNight);
  dayNightClock.classList.toggle('is-paused', isPaused);
  dayNightClockIcon.className = isNight ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  pauseTimeIcon.className = isPaused ? 'fa-solid fa-play' : 'fa-solid fa-pause';
  pauseTimeLabel.textContent = isPaused ? 'Resume' : 'Pause';
  pauseTime.title = isPaused ? 'Resume time' : 'Pause time';
  updateClockReadout();
});

scene.onWeatherChange((weatherState) => {
  currentWeatherState = weatherState;

  Object.entries(weatherButtons).forEach(([weather, button]) => {
    const isActive = weather === 'random'
      ? weatherState.isAuto
      : !weatherState.isAuto && weatherState.weather === weather;

    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  updateClockReadout();
});

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

taxRate.addEventListener('input', updateEconomyHud);

document.querySelector('#rotate-left').addEventListener('click', () => controller.rotateSelected(-1));
document.querySelector('#rotate-right').addEventListener('click', () => controller.rotateSelected(1));
document.querySelector('#duplicate').addEventListener('click', () => controller.duplicateSelected());
document.querySelector('#delete-selected').addEventListener('click', () => controller.deleteSelected());
document.querySelector('#reload-assets').addEventListener('click', () => controller.loadAssets(assetPacks));
document.querySelector('#generate-town').addEventListener('click', generateSandboxTown);
document.querySelector('#clear-town').addEventListener('click', () => controller.clearTown());

updateContinueButton();
await controller.loadAssets(assetPacks);
assetsReady = true;
startNormal.disabled = false;
startSandbox.disabled = false;
menuImportTown.disabled = false;
updateContinueButton();
if (shell.dataset.screen === 'menu') {
  generateMainMenuTown();
}
setMode('build');
scene.addUpdater(updateMainMenuBackdrop);
scene.start();
