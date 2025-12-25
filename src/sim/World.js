import { Materials } from './materials.js';
import { createPeopleManager } from './Person.js';

function makeNoise(width, height) {
  const arr = new Uint8Array(width * height);
  for (let i = 0; i < arr.length; i++) {
    arr[i] = (Math.random() * 256) | 0;
  }
  return arr;
}

export function createWorld(width, height) {
  const cells = new Uint8Array(width * height); // material id per cell
  const updated = new Uint8Array(width * height); // mark cells already processed this tick
  const timer = new Uint16Array(width * height); // generic per-cell timer (embers)
  const noise = makeNoise(width, height);
  
  // People Playground-style people manager
  const peopleManager = createPeopleManager();
  
  // Bombs array - {x, y, fuse, exploded}
  const bombs = [];
  
  // Explosions array for visual effects - {x, y, radius, maxRadius, age}
  const explosions = [];
  
  // Blood particles - {x, y, vx, vy, life}
  const bloodParticles = [];
  
  // Detached limbs - {x, y, vx, vy, rotation, type, color}
  const gibs = [];

  const world = {
    width,
    height,
    cells,
    updated,
    noise,
    timer,
    peopleManager,
    bombs,
    explosions,
    bloodParticles,
    gibs,
    clear,
    step,
    paintCircle,
    getAt,
    setAt,
    spawnPerson,
    getPeople,
    spawnBomb,
    triggerExplosion,
    spawnBlood,
    spawnGib,
  };

  function index(x, y) { return y * width + x; }
  function inBounds(x, y) { return x >= 0 && x < width && y >= 0 && y < height; }

  const EMBER_LIFETIME = 1800; // ~30s at 60Hz

  function getAt(x, y) {
    if (!inBounds(x, y)) return Materials.stone.id; // treat out-of-bounds bottom as solid
    return cells[index(x, y)];
  }
  function setAt(x, y, id) {
    if (!inBounds(x, y)) return;
    const i = index(x, y);
    cells[i] = id;
    if (id === Materials.ember.id) {
      if (timer[i] === 0) timer[i] = EMBER_LIFETIME;
    } else {
      timer[i] = 0;
    }
  }
  function setEmber(x, y) {
    if (!inBounds(x, y)) return;
    const i = index(x, y);
    cells[i] = Materials.ember.id;
    timer[i] = EMBER_LIFETIME;
  }
  function swap(x1, y1, x2, y2) {
    const i1 = index(x1, y1);
    const i2 = index(x2, y2);
    const a = cells[i1];
    cells[i1] = cells[i2];
    cells[i2] = a;
    const ta = timer[i1];
    timer[i1] = timer[i2];
    timer[i2] = ta;
    updated[i2] = 1; // dest cell already processed
  }

  function clear() {
    cells.fill(0);
    updated.fill(0);
    peopleManager.clear();
    bombs.length = 0;
    explosions.length = 0;
    bloodParticles.length = 0;
    gibs.length = 0;
  }
  
  function spawnPerson(x, y) {
    return peopleManager.spawn(x, y);
  }
  
  function getPeople() {
    return peopleManager.getAll();
  }
  
  // ===== BOMB SYSTEM =====
  function spawnBomb(x, y) {
    bombs.push({
      x: x,
      y: y,
      fuse: 120, // 2 seconds at 60fps
      exploded: false,
      size: 4, // visual size
    });
  }
  
  function triggerExplosion(x, y, radius = 40, power = 15) {
    // Add visual explosion effect
    explosions.push({
      x: x,
      y: y,
      radius: 0,
      maxRadius: radius,
      age: 0,
      maxAge: 30,
    });
    
    // Destroy materials in radius
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= r2) {
          const px = Math.floor(x + dx);
          const py = Math.floor(y + dy);
          if (inBounds(px, py)) {
            const mat = getAt(px, py);
            // Destroy most materials, create fire/smoke
            if (mat !== Materials.stone.id && mat !== Materials.empty.id) {
              if (Math.random() < 0.3) {
                setAt(px, py, Materials.fire.id);
              } else if (Math.random() < 0.5) {
                setAt(px, py, Materials.smoke.id);
              } else {
                setAt(px, py, Materials.empty.id);
              }
            }
          }
        }
      }
    }
    
    // Apply force to all people
    for (const person of peopleManager.getAll()) {
      const dx = person.points.hip.x - x;
      const dy = person.points.hip.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < radius * 1.5) {
        // Calculate explosion force
        const forceMult = Math.max(0, 1 - dist / (radius * 1.5));
        const force = power * forceMult;
        
        // Normalize direction
        const nx = dist > 0 ? dx / dist : 0;
        const ny = dist > 0 ? dy / dist : -1;
        
        // Apply force to all body parts (sends them flying!)
        for (const pt of person.pointsArray) {
          pt.oldX = pt.x - nx * force * (0.8 + Math.random() * 0.4);
          pt.oldY = pt.y - ny * force * (0.8 + Math.random() * 0.4);
        }
        
        // Apply damage based on distance
        const damage = 50 * forceMult + (dist < radius * 0.3 ? 50 : 0);
        person.health -= damage;
        person.damageFlash = 10;
        
        // Spawn blood!
        spawnBlood(person.points.hip.x, person.points.hip.y, 20 + Math.floor(damage / 2));
        
        // If close to explosion, chance to lose limbs!
        if (dist < radius * 0.5 && damage > 30) {
          // Try to detach random limbs
          if (Math.random() < 0.5) detachLimb(person, 'arm');
          if (Math.random() < 0.5) detachLimb(person, 'leg');
        }
        
        // Kill if too close
        if (dist < radius * 0.2) {
          person.health = 0;
          person.alive = false;
          // Explode into gibs!
          explodeIntoGibs(person, x, y, force);
        }
      }
    }
  }
  
  function detachLimb(person, type) {
    if (!person.alive) return;
    
    // Mark limb as detached and spawn a gib
    const side = Math.random() < 0.5 ? 'l' : 'r';
    let limbPoint;
    let color;
    
    if (type === 'arm') {
      limbPoint = person.points[`hand_${side}`];
      color = [255, 200, 150, 255]; // Skin color
      person[`arm_${side}_detached`] = true;
    } else if (type === 'leg') {
      limbPoint = person.points[`foot_${side}`];
      color = [80, 80, 180, 255]; // Pants color
      person[`leg_${side}_detached`] = true;
    }
    
    if (limbPoint) {
      spawnGib(limbPoint.x, limbPoint.y, type, color);
      spawnBlood(limbPoint.x, limbPoint.y, 15);
    }
  }
  
  function explodeIntoGibs(person, explosionX, explosionY, force) {
    const pts = person.points;
    
    // Create gibs for each body part
    const gibTypes = [
      { pt: pts.head, type: 'head', color: [255, 200, 150, 255] },
      { pt: pts.hip, type: 'torso', color: [50, 100, 200, 255] },
      { pt: pts.hand_l, type: 'arm', color: [255, 200, 150, 255] },
      { pt: pts.hand_r, type: 'arm', color: [255, 200, 150, 255] },
      { pt: pts.foot_l, type: 'leg', color: [80, 80, 180, 255] },
      { pt: pts.foot_r, type: 'leg', color: [80, 80, 180, 255] },
    ];
    
    for (const gib of gibTypes) {
      // Direction away from explosion
      const dx = gib.pt.x - explosionX;
      const dy = gib.pt.y - explosionY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      
      spawnGib(
        gib.pt.x, 
        gib.pt.y, 
        gib.type, 
        gib.color,
        (dx / dist) * force * 0.5 + (Math.random() - 0.5) * 5,
        (dy / dist) * force * 0.5 - Math.random() * 5
      );
    }
    
    // Lots of blood!
    spawnBlood(pts.hip.x, pts.hip.y, 50);
  }
  
  function spawnBlood(x, y, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4;
      bloodParticles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 60 + Math.random() * 120, // 1-3 seconds
        size: 1 + Math.random() * 2,
      });
    }
  }
  
  function spawnGib(x, y, type, color, vx = 0, vy = 0) {
    gibs.push({
      x: x,
      y: y,
      vx: vx || (Math.random() - 0.5) * 6,
      vy: vy || -Math.random() * 8,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.3,
      type: type,
      color: color,
      life: 600, // 10 seconds
      grounded: false,
    });
  }
  
  function updateBombs() {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const bomb = bombs[i];
      
      // Count down fuse
      bomb.fuse--;
      
      // Bomb falls with gravity
      const belowMat = getAt(Math.floor(bomb.x), Math.floor(bomb.y + 1));
      if (belowMat === Materials.empty.id) {
        bomb.y += 1;
      }
      
      // BOOM!
      if (bomb.fuse <= 0) {
        triggerExplosion(bomb.x, bomb.y, 35, 12);
        bombs.splice(i, 1);
      }
    }
  }
  
  function updateExplosions() {
    for (let i = explosions.length - 1; i >= 0; i--) {
      const exp = explosions[i];
      exp.age++;
      exp.radius = (exp.age / exp.maxAge) * exp.maxRadius;
      
      if (exp.age >= exp.maxAge) {
        explosions.splice(i, 1);
      }
    }
  }
  
  function updateBloodParticles() {
    for (let i = bloodParticles.length - 1; i >= 0; i--) {
      const p = bloodParticles[i];
      
      // Physics
      p.vy += 0.15; // Gravity
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.life--;
      
      // Check collision with world
      const mat = getAt(Math.floor(p.x), Math.floor(p.y));
      if (mat !== Materials.empty.id && mat !== Materials.water.id) {
        // Stick to surface, leave blood stain
        p.vx = 0;
        p.vy = 0;
        p.life = Math.min(p.life, 30);
      }
      
      // Remove dead particles
      if (p.life <= 0 || p.y > height) {
        bloodParticles.splice(i, 1);
      }
    }
  }
  
  function updateGibs() {
    for (let i = gibs.length - 1; i >= 0; i--) {
      const gib = gibs[i];
      
      if (!gib.grounded) {
        // Physics
        gib.vy += 0.2; // Gravity
        gib.x += gib.vx;
        gib.y += gib.vy;
        gib.vx *= 0.98;
        gib.rotation += gib.rotationSpeed;
        
        // Check ground collision
        const mat = getAt(Math.floor(gib.x), Math.floor(gib.y + 2));
        if (mat !== Materials.empty.id && mat !== Materials.water.id) {
          gib.grounded = true;
          gib.vy = 0;
          gib.vx = 0;
          gib.rotationSpeed = 0;
        }
        
        // Bounce off walls
        if (gib.x < 0 || gib.x > width) gib.vx *= -0.5;
      }
      
      gib.life--;
      
      // Trail blood while flying
      if (!gib.grounded && Math.random() < 0.3) {
        spawnBlood(gib.x, gib.y, 1);
      }
      
      // Remove old gibs
      if (gib.life <= 0) {
        gibs.splice(i, 1);
      }
    }
  }

  function tryFallPowder(x, y) {
    // Falls down, can displace water
    const below = getAt(x, y + 1);
    if (below === Materials.empty.id || below === Materials.water.id) {
      swap(x, y, x, y + 1);
      return true;
    }
    // diagonals with random lateral preference
    const dir = Math.random() < 0.5 ? -1 : 1;
    const dl = getAt(x - dir, y + 1);
    if (dl === Materials.empty.id || dl === Materials.water.id) {
      swap(x, y, x - dir, y + 1);
      return true;
    }
    const dr = getAt(x + dir, y + 1);
    if (dr === Materials.empty.id || dr === Materials.water.id) {
      swap(x, y, x + dir, y + 1);
      return true;
    }
    return false;
  }

  function tryFlowWater(x, y) {
    // Gravity first
    const below = getAt(x, y + 1);
    if (below === Materials.empty.id) { swap(x, y, x, y + 1); return true; }
    // water sinks below oil (to make oil float)
    if (below === Materials.oil.id) { swap(x, y, x, y + 1); return true; }
    // diagonals
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (getAt(x - dir, y + 1) === Materials.empty.id) { swap(x, y, x - dir, y + 1); return true; }
    if (getAt(x + dir, y + 1) === Materials.empty.id) { swap(x, y, x + dir, y + 1); return true; }
    // lateral spread up to N cells
    const maxSpread = 5 + (Math.random() * 5) | 0; // slightly more spread for nicer look under gun carving
    // randomize left/right starting direction to avoid bias
    if (Math.random() < 0.5) {
      for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x - dx, y) === Materials.empty.id) { swap(x, y, x - dx, y); return true; }
      for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x + dx, y) === Materials.empty.id) { swap(x, y, x + dx, y); return true; }
    } else {
      for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x + dx, y) === Materials.empty.id) { swap(x, y, x + dx, y); return true; }
      for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x - dx, y) === Materials.empty.id) { swap(x, y, x - dx, y); return true; }
    }
    return false;
  }

  function step() {
    updated.fill(0);
    // Bottom-up iteration for gravity-friendly updates
    for (let y = height - 1; y >= 0; y--) {
      const yIndex = y * width;
      // Randomize lateral traversal sometimes to reduce biasing
      const leftToRight = Math.random() < 0.5;
      if (leftToRight) {
        for (let x = 0; x < width; x++) {
          const i = yIndex + x;
          if (updated[i]) continue;
          const id = cells[i];
          if (id === Materials.sand.id) {
            if (tryFallPowder(x, y)) continue;
          } else if (id === Materials.water.id) {
            if (tryFlowWater(x, y)) continue;
          } else if (id === Materials.oil.id) {
            if (tryFlowOil(x, y)) continue;
          } else if (id === Materials.fire.id) {
            if (tryRiseFire(x, y)) continue;
          } else if (id === Materials.smoke.id) {
            if (tryRiseSmoke(x, y)) continue;
          } else if (id === Materials.steam.id) {
            if (tryRiseSteam(x, y)) continue;
          } else if (id === Materials.lava.id) {
            if (tryFlowLava(x, y)) continue;
          } else if (id === Materials.ember.id) {
            if (tryEmber(x, y)) continue;
          }
          // stone/concrete do nothing
          updated[i] = 1;
        }
      } else {
        for (let x = width - 1; x >= 0; x--) {
          const i = yIndex + x;
          if (updated[i]) continue;
          const id = cells[i];
          if (id === Materials.sand.id) {
            if (tryFallPowder(x, y)) continue;
          } else if (id === Materials.water.id) {
            if (tryFlowWater(x, y)) continue;
          } else if (id === Materials.oil.id) {
            if (tryFlowOil(x, y)) continue;
          } else if (id === Materials.fire.id) {
            if (tryRiseFire(x, y)) continue;
          } else if (id === Materials.smoke.id) {
            if (tryRiseSmoke(x, y)) continue;
          } else if (id === Materials.steam.id) {
            if (tryRiseSteam(x, y)) continue;
          } else if (id === Materials.lava.id) {
            if (tryFlowLava(x, y)) continue;
          } else if (id === Materials.ember.id) {
            if (tryEmber(x, y)) continue;
          }
          updated[i] = 1;
        }
      }
    }

    // Reactions pass (simple, local)
    for (let y = height - 1; y >= 0; y--) {
      for (let x = 0; x < width; x++) {
        const id = getAt(x, y);
        if (id === Materials.fire.id) spreadFire(x, y);
        if (id === Materials.lava.id) coolLava(x, y);
        if (id === Materials.ember.id) emberReactions(x, y);
      }
    }
    
    // Update people (People Playground style!)
    peopleManager.update(world);
    
    // Update bombs, explosions, blood, and gibs
    updateBombs();
    updateExplosions();
    updateBloodParticles();
    updateGibs();
  }

  // Fluids and gases
  function tryFlowOil(x, y) {
    // lighter than water: only fall into empty, not into water
    if (getAt(x, y + 1) === Materials.empty.id) { swap(x, y, x, y + 1); return true; }
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (getAt(x - dir, y + 1) === Materials.empty.id) { swap(x, y, x - dir, y + 1); return true; }
    if (getAt(x + dir, y + 1) === Materials.empty.id) { swap(x, y, x + dir, y + 1); return true; }
    const maxSpread = 4 + (Math.random() * 3) | 0;
    for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x + dx, y) === Materials.empty.id) { swap(x, y, x + dx, y); return true; }
    for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x - dx, y) === Materials.empty.id) { swap(x, y, x - dx, y); return true; }
    return false;
  }

  function tryRiseFire(x, y) {
    // Fire persists longer and aggressively ignites combustibles
    const igniteNeighbor = (xx, yy) => {
      const id = getAt(xx, yy);
      if (id === Materials.wood.id) { if (Math.random() < 0.05) setEmber(xx, yy); }
      if (id === Materials.oil.id) { if (Math.random() < 0.5) setAt(xx, yy, Materials.fire.id); }
    };
    igniteNeighbor(x+1, y); igniteNeighbor(x-1, y); igniteNeighbor(x, y+1); igniteNeighbor(x, y-1);

    const nearFuel = (
      getAt(x+1, y) === Materials.wood.id || getAt(x-1, y) === Materials.wood.id ||
      getAt(x, y+1) === Materials.wood.id || getAt(x, y-1) === Materials.wood.id ||
      getAt(x+1, y) === Materials.oil.id || getAt(x-1, y) === Materials.oil.id ||
      getAt(x, y+1) === Materials.oil.id || getAt(x, y-1) === Materials.oil.id
    );

    // Convert to smoke less often (especially if near fuel)
    const smokeChance = nearFuel ? 0.01 : 0.05;
    if (Math.random() < smokeChance) { setAt(x, y, Materials.smoke.id); return true; }

    // Rise when not close to fuel
    if (!nearFuel) {
      if (getAt(x, y - 1) === Materials.empty.id) { swap(x, y, x, y - 1); return true; }
      const dir = Math.random() < 0.5 ? -1 : 1;
      if (getAt(x + dir, y - 1) === Materials.empty.id) { swap(x, y, x + dir, y - 1); return true; }
      if (getAt(x - dir, y - 1) === Materials.empty.id) { swap(x, y, x - dir, y - 1); return true; }
    }
    return false;
  }

  function tryRiseSmoke(x, y) {
    if (Math.random() < 0.02) { setAt(x, y, Materials.empty.id); return true; }
    if (getAt(x, y - 1) === Materials.empty.id) { swap(x, y, x, y - 1); return true; }
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (getAt(x + dir, y - 1) === Materials.empty.id) { swap(x, y, x + dir, y - 1); return true; }
    if (getAt(x - dir, y - 1) === Materials.empty.id) { swap(x, y, x - dir, y - 1); return true; }
    return false;
  }

  function tryRiseSteam(x, y) {
    if (Math.random() < 0.03) { setAt(x, y, Materials.empty.id); return true; }
    if (getAt(x, y - 1) === Materials.empty.id) { swap(x, y, x, y - 1); return true; }
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (getAt(x + dir, y - 1) === Materials.empty.id) { swap(x, y, x + dir, y - 1); return true; }
    if (getAt(x - dir, y - 1) === Materials.empty.id) { swap(x, y, x - dir, y - 1); return true; }
    return false;
  }

  function tryFlowLava(x, y) {
    if (getAt(x, y + 1) === Materials.empty.id) { swap(x, y, x, y + 1); return true; }
    const dir = Math.random() < 0.5 ? -1 : 1;
    if (getAt(x - dir, y + 1) === Materials.empty.id) { swap(x, y, x - dir, y + 1); return true; }
    if (getAt(x + dir, y + 1) === Materials.empty.id) { swap(x, y, x + dir, y + 1); return true; }
    const maxSpread = 2 + (Math.random() * 2) | 0;
    for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x + dx, y) === Materials.empty.id) { swap(x, y, x + dx, y); return true; }
    for (let dx = 1; dx <= maxSpread; dx++) if (getAt(x - dx, y) === Materials.empty.id) { swap(x, y, x - dx, y); return true; }
    return false;
  }

  // Reactions
  function spreadFire(x, y) {
    // burn wood and oil, extinguish in water, create steam
    const tryIgnite = (xx, yy) => {
      const id = getAt(xx, yy);
      if (id === Materials.wood.id) {
        // wood shifts to ember first (slow burn)
        if (Math.random() < 0.003) setEmber(xx, yy);
      } else if (id === Materials.oil.id) {
        if (Math.random() < 0.4) setAt(xx, yy, Materials.fire.id);
      }
      if (id === Materials.water.id) {
        setAt(x, y, Materials.steam.id);
      }
    };
    tryIgnite(x+1, y); tryIgnite(x-1, y); tryIgnite(x, y+1); tryIgnite(x, y-1);
  }

  function coolLava(x, y) {
    // lava contacting water -> stone; air exposure may cool to stone slowly
    if (getAt(x+1, y) === Materials.water.id || getAt(x-1, y) === Materials.water.id || getAt(x, y+1) === Materials.water.id || getAt(x, y-1) === Materials.water.id) {
      setAt(x, y, Materials.stone.id);
    } else if (Math.random() < 0.002) {
      setAt(x, y, Materials.stone.id);
    }
    // lava + sand -> glass
    const glassify = (xx, yy) => { if (getAt(xx, yy) === Materials.sand.id && Math.random() < 0.3) setAt(xx, yy, Materials.glass.id); };
    glassify(x+1, y); glassify(x-1, y); glassify(x, y+1); glassify(x, y-1);
    // lava ignites wood/oil strongly
    const ignite = (xx, yy) => {
      const id = getAt(xx, yy);
      if (id === Materials.wood.id) setEmber(xx, yy);
      if (id === Materials.oil.id) setAt(xx, yy, Materials.fire.id);
    };
    ignite(x+1, y); ignite(x-1, y); ignite(x, y+1); ignite(x, y-1);
  }

  // Ember behavior: smolders, may ignite to fire rarely, eventually becomes ash
  function tryEmber(x, y) {
    // drift down slightly like powder, but slow
    if (getAt(x, y + 1) === Materials.empty.id && Math.random() < 0.5) { swap(x, y, x, y + 1); return true; }
    // occasionally puff smoke and heat neighbors
    if (Math.random() < 0.02) setAt(x, y - 1, Materials.smoke.id);
    return false;
  }

  function emberReactions(x, y) {
    // Extinguish immediately if touching water
    const touchingWater = (
      getAt(x+1, y) === Materials.water.id || getAt(x-1, y) === Materials.water.id ||
      getAt(x, y+1) === Materials.water.id || getAt(x, y-1) === Materials.water.id
    );
    if (touchingWater) { setAt(x, y, Materials.ash.id); return; }

    // Rarely ignite to fire if near oil/wood; otherwise slowly convert to ash over lifetime
    const nearFuel = (
      getAt(x+1, y) === Materials.oil.id || getAt(x-1, y) === Materials.oil.id ||
      getAt(x, y+1) === Materials.oil.id || getAt(x, y-1) === Materials.oil.id ||
      getAt(x+1, y) === Materials.wood.id || getAt(x-1, y) === Materials.wood.id ||
      getAt(x, y+1) === Materials.wood.id || getAt(x, y-1) === Materials.wood.id
    );
    const i = index(x, y);
    if (nearFuel && Math.random() < 0.001) { setAt(x, y, Materials.fire.id); return; }
    if (timer[i] > 0) {
      timer[i]--;
      if (timer[i] === 0) { setAt(x, y, Materials.ash.id); }
    }
  }

  function paintCircle(cx, cy, r, id) {
    const r2 = r * r;
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(width - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          setAt(x, y, id);
        }
      }
    }
  }

  return world;
}


