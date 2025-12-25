import { createWorld } from './sim/World.js';
import { Materials, materialIdFromName } from './sim/materials.js';
import { createRenderer } from './render/renderer.js';
import { initUI } from './ui/ui.js';

const displayCanvas = document.getElementById('display');
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const SIM_ASPECT = 16 / 9;
const SIM_WIDTH = 320; // Internal simulation resolution; tuned for performance
const SIM_HEIGHT = Math.round(SIM_WIDTH / SIM_ASPECT);

const world = createWorld(SIM_WIDTH, SIM_HEIGHT);
const renderer = createRenderer(displayCanvas, SIM_WIDTH, SIM_HEIGHT, dpr);

let isRunning = true;
let currentMaterial = Materials.sand.id;
let brushRadius = 8;
let isPouring = false;
let rainEnabled = false;
let spawnPersonMode = false; // People Playground mode!
let spawnBombMode = false; // Bomb mode!
let spawnGunMode = false; // Gun spawn mode!
let spawnGrenadeMode = false; // Grenade spawn mode!
let spawnSwordMode = false; // Sword spawn mode!
let spawnCarMode = false; // Car spawn mode!
let spawnBoatMode = false; // Boat spawn mode!
let spawnPlaneMode = false; // Plane spawn mode!

// Resize display backing store to keep it sharp on DPR screens
function resizeDisplayCanvas() {
  const rect = displayCanvas.getBoundingClientRect();
  displayCanvas.width = Math.max(2, Math.floor(rect.width * dpr));
  displayCanvas.height = Math.max(2, Math.floor(rect.height * dpr));
}

resizeDisplayCanvas();
window.addEventListener('resize', () => {
  resizeDisplayCanvas();
  renderer.requestFullRedraw();
});

// Input: painting
let isPointerDown = false;
let lastPaintX = null;
let lastPaintY = null;

function canvasToSimCoords(clientX, clientY) {
  const rect = displayCanvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * world.width;
  const y = ((clientY - rect.top) / rect.height) * world.height;
  return { x: Math.floor(x), y: Math.floor(y) };
}

function paintAt(clientX, clientY) {
  const { x, y } = canvasToSimCoords(clientX, clientY);
  world.paintCircle(x, y, brushRadius, currentMaterial);
}

function lerp(a, b, t) { return a + (b - a) * t; }

displayCanvas.addEventListener('pointerdown', (e) => {
  // People Playground spawn mode!
  if (spawnPersonMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnPerson(x, y);
    return;
  }
  
  // Bomb spawn mode!
  if (spawnBombMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnBomb(x, y);
    console.log('💣 Bomb placed! 2 seconds until detonation...');
    return;
  }

  // Weapon spawn modes!
  if (spawnGunMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnGun(x, y);
    console.log('🔫 Pistol placed!');
    return;
  }

  if (spawnGrenadeMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnGrenade(x, y);
    console.log('💣 Grenade placed! 3 second fuse...');
    return;
  }

  if (spawnSwordMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnSword(x, y);
    console.log('⚔️ Sword placed!');
    return;
  }

  // Vehicle spawn modes!
  if (spawnCarMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnCar(x, y);
    console.log('🚗 Car placed!');
    return;
  }

  if (spawnBoatMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnBoat(x, y);
    console.log('🚤 Boat placed!');
    return;
  }

  if (spawnPlaneMode) {
    const { x, y } = canvasToSimCoords(e.clientX, e.clientY);
    world.spawnPlane(x, y);
    console.log('✈️ Plane placed!');
    return;
  }
  
  isPointerDown = true;
  lastPaintX = e.clientX; lastPaintY = e.clientY;
  paintAt(e.clientX, e.clientY);
  // enable continuous pouring for sand/water
  if (currentMaterial === Materials.sand.id || currentMaterial === Materials.water.id || currentMaterial === Materials.oil.id || currentMaterial === Materials.lava.id) {
    isPouring = true;
  }
});

displayCanvas.addEventListener('pointermove', (e) => {
  if (!isPointerDown) return;
  
  // Interpolate points between last and current to avoid gaps at fast mouse movement
  const steps = 1 + Math.floor(Math.hypot(e.clientX - lastPaintX, e.clientY - lastPaintY) / 4);
  for (let i = 1; i <= steps; i++) {
    const ix = lerp(lastPaintX, e.clientX, i / steps);
    const iy = lerp(lastPaintY, e.clientY, i / steps);
    paintAt(ix, iy);
  }
  
  lastPaintX = e.clientX; lastPaintY = e.clientY;
});
window.addEventListener('pointerup', () => { isPointerDown = false; isPouring = false; });
window.addEventListener('pointercancel', () => { isPointerDown = false; isPouring = false; });

// UI
initUI({
  onSelectMaterial: (name) => {
    if (name === 'erase') currentMaterial = Materials.empty.id;
    else currentMaterial = materialIdFromName(name);
    spawnPersonMode = false; // Exit spawn modes when selecting material
    spawnBombMode = false;
    spawnGunMode = false;
    spawnGrenadeMode = false;
    spawnSwordMode = false;
    spawnCarMode = false;
    spawnBoatMode = false;
    spawnPlaneMode = false;
  },
  onChangeBrush: (size) => { brushRadius = size; },
  onPlayPause: () => { isRunning = !isRunning; return isRunning; },
  onStep: () => { world.step(); renderer.draw(world); },
  onClear: () => { 
    world.clear(); 
    renderer.requestFullRedraw(); 
  },
  onSave: () => { renderer.savePNG(); },
  onToggleRain: () => { rainEnabled = !rainEnabled; return rainEnabled; },
  onToggleSpawnMode: (enabled) => { 
    spawnPersonMode = enabled;
    if (enabled) spawnBombMode = false; // Only one mode at a time
    if (enabled) {
      console.log('🧍 Spawn Person mode activated! Click anywhere to spawn.');
    }
  },
  onToggleBombMode: (enabled) => {
    spawnBombMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnGunMode = false;
      spawnGrenadeMode = false;
      spawnSwordMode = false;
    }
    if (enabled) {
      console.log('💣 Bomb mode activated! Click anywhere to place a bomb.');
    }
  },
  onToggleGunMode: (enabled) => {
    spawnGunMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnBombMode = false;
      spawnGrenadeMode = false;
      spawnSwordMode = false;
    }
    if (enabled) {
      console.log('🔫 Gun mode activated! Click anywhere to place a pistol.');
    }
  },
  onToggleGrenadeMode: (enabled) => {
    spawnGrenadeMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnBombMode = false;
      spawnGunMode = false;
      spawnSwordMode = false;
    }
    if (enabled) {
      console.log('💣 Grenade mode activated! Click anywhere to place a grenade.');
    }
  },
  onToggleSwordMode: (enabled) => {
    spawnSwordMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnBombMode = false;
      spawnGunMode = false;
      spawnGrenadeMode = false;
      spawnCarMode = false;
      spawnBoatMode = false;
      spawnPlaneMode = false;
    }
    if (enabled) {
      console.log('⚔️ Sword mode activated! Click anywhere to place a sword.');
    }
  },
  onToggleCarMode: (enabled) => {
    spawnCarMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnBombMode = false;
      spawnGunMode = false;
      spawnGrenadeMode = false;
      spawnSwordMode = false;
      spawnBoatMode = false;
      spawnPlaneMode = false;
    }
    if (enabled) {
      console.log('🚗 Car mode activated! Click anywhere to place a car.');
    }
  },
  onToggleBoatMode: (enabled) => {
    spawnBoatMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnBombMode = false;
      spawnGunMode = false;
      spawnGrenadeMode = false;
      spawnSwordMode = false;
      spawnCarMode = false;
      spawnPlaneMode = false;
    }
    if (enabled) {
      console.log('🚤 Boat mode activated! Click anywhere to place a boat.');
    }
  },
  onTogglePlaneMode: (enabled) => {
    spawnPlaneMode = enabled;
    if (enabled) {
      spawnPersonMode = false;
      spawnBombMode = false;
      spawnGunMode = false;
      spawnGrenadeMode = false;
      spawnSwordMode = false;
      spawnCarMode = false;
      spawnBoatMode = false;
    }
    if (enabled) {
      console.log('✈️ Plane mode activated! Click anywhere to place a plane.');
    }
  },
});

// Animation loop
let lastTime = performance.now();
let accumulator = 0;
const dt = 1000 / 60; // fixed sim step (~60Hz)

function frame(now) {
  const elapsed = Math.min(50, now - lastTime);
  lastTime = now;
  accumulator += elapsed;

  if (isRunning) {
    while (accumulator >= dt) {
      world.step();
      if (isPouring) {
        // keep adding at last pointer position for sand/water
        if (lastPaintX != null && lastPaintY != null) paintAt(lastPaintX, lastPaintY);
      }
      // rain spawner
      if (rainEnabled && Math.random() < 0.6) {
        const rx = Math.floor(Math.random() * world.width);
        world.paintCircle(rx, 0, 1, Materials.water.id);
      }
      accumulator -= dt;
    }
  } else {
    // drain accumulator to avoid jump when resuming
    accumulator = 0;
  }

  renderer.draw(world);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
