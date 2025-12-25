export const Materials = {
  empty: { id: 0, name: 'empty', color: [0, 0, 0, 0], density: 0 },
  stone: { id: 1, name: 'stone', color: [110, 115, 123, 255], density: 1000 },
  sand: { id: 2, name: 'sand', color: [227, 189, 120, 255], density: 300 },
  water: { id: 3, name: 'water', color: [56, 142, 255, 200], density: 100 },
  concrete: { id: 4, name: 'concrete', color: [150, 150, 150, 255], density: 1200 },
  oil: { id: 5, name: 'oil', color: [40, 40, 20, 220], density: 80 },
  wood: { id: 6, name: 'wood', color: [120, 84, 40, 255], density: 900 },
  fire: { id: 7, name: 'fire', color: [255, 120, 10, 200], density: 1 },
  smoke: { id: 8, name: 'smoke', color: [120, 120, 120, 150], density: 1 },
  steam: { id: 9, name: 'steam', color: [200, 200, 255, 120], density: 1 },
  lava: { id: 10, name: 'lava', color: [255, 60, 20, 240], density: 500 },
  glass: { id: 11, name: 'glass', color: [180, 220, 255, 230], density: 1100 },
  ember: { id: 12, name: 'ember', color: [220, 80, 30, 230], density: 1100 },
  ash: { id: 13, name: 'ash', color: [90, 90, 90, 240], density: 280 },
};

export const MaterialList = [
  Materials.empty,
  Materials.stone,
  Materials.sand,
  Materials.water,
  Materials.concrete,
  Materials.oil,
  Materials.wood,
  Materials.fire,
  Materials.smoke,
  Materials.steam,
  Materials.lava,
  Materials.glass,
  Materials.ember,
  Materials.ash,
];

export function materialIdFromName(name) {
  const found = MaterialList.find((m) => m.name === name);
  return found ? found.id : Materials.empty.id;
}

// Small per-cell color variance to avoid flat look
export function jitterColor([r, g, b, a], noise) {
  const j = Math.floor((noise - 128) / 16); // -8..+7
  return [
    Math.max(0, Math.min(255, r + j)),
    Math.max(0, Math.min(255, g + j)),
    Math.max(0, Math.min(255, b + j)),
    a,
  ];
}


