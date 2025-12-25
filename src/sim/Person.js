import { Materials } from './materials.js';

/**
 * PEOPLE PLAYGROUND-STYLE RAGDOLL PERSON
 * 
 * A proper physics-based ragdoll with:
 * - Verlet integration for smooth physics
 * - Connected limbs with constraints
 * - Proper ground collision (walks ON TOP of materials, never sinks)
 * - Health system with damage from hazards
 * - Walking AI that actually traverses the terrain
 */

// Solid materials the person can stand ON (not pass through)
const SOLID_MATERIALS = new Set([
  Materials.stone.id,
  Materials.concrete.id,
  Materials.wood.id,
  Materials.glass.id,
  Materials.sand.id,
  Materials.ash.id,
]);

// Hazardous materials that deal damage
const HAZARD_DAMAGE = {
  [Materials.fire.id]: 0.8,
  [Materials.lava.id]: 2.0,
  [Materials.ember.id]: 0.4,
};

// Liquid materials (person floats/swims)
const LIQUID_MATERIALS = new Set([
  Materials.water.id,
  Materials.oil.id,
]);

/**
 * A single point in the ragdoll (using Verlet integration)
 */
class Point {
  constructor(x, y, pinned = false) {
    this.x = x;
    this.y = y;
    this.oldX = x;
    this.oldY = y;
    this.pinned = pinned;
  }
  
  update(gravity, friction) {
    if (this.pinned) return;
    
    const vx = (this.x - this.oldX) * friction;
    const vy = (this.y - this.oldY) * friction;
    
    this.oldX = this.x;
    this.oldY = this.y;
    
    this.x += vx;
    this.y += vy + gravity;
  }
}

/**
 * A constraint between two points (keeps them at fixed distance)
 */
class Stick {
  constructor(p1, p2, length = null) {
    this.p1 = p1;
    this.p2 = p2;
    this.length = length ?? Math.hypot(p2.x - p1.x, p2.y - p1.y);
  }
  
  update() {
    const dx = this.p2.x - this.p1.x;
    const dy = this.p2.y - this.p1.y;
    const dist = Math.hypot(dx, dy);
    const diff = this.length - dist;
    const percent = diff / dist / 2;
    const offsetX = dx * percent;
    const offsetY = dy * percent;
    
    if (!this.p1.pinned) {
      this.p1.x -= offsetX;
      this.p1.y -= offsetY;
    }
    if (!this.p2.pinned) {
      this.p2.x += offsetX;
      this.p2.y += offsetY;
    }
  }
}

/**
 * Create a People Playground-style ragdoll person
 */
export function createPerson(spawnX, spawnY) {
  // Body dimensions (in simulation pixels) - compact for pixel art
  const headRadius = 3;
  const neckLen = 2;
  const torsoLen = 6;
  const upperArmLen = 3;
  const lowerArmLen = 3;
  const upperLegLen = 4;
  const lowerLegLen = 4;
  
  // Create skeleton points (positioned relative to spawn)
  // The spawn position is where the FEET should touch ground
  const feetY = spawnY;
  const hipY = feetY - lowerLegLen - upperLegLen;
  const shoulderY = hipY - torsoLen;
  const headY = shoulderY - neckLen - headRadius;
  
  // Create all points in a PROPER UPRIGHT stance
  const points = {
    head: new Point(spawnX, headY),
    neck: new Point(spawnX, shoulderY),
    shoulder_l: new Point(spawnX - 2, shoulderY),
    shoulder_r: new Point(spawnX + 2, shoulderY),
    // Arms hang DOWN naturally (not out to the sides)
    elbow_l: new Point(spawnX - 3, shoulderY + upperArmLen),
    elbow_r: new Point(spawnX + 3, shoulderY + upperArmLen),
    hand_l: new Point(spawnX - 3, shoulderY + upperArmLen + lowerArmLen),
    hand_r: new Point(spawnX + 3, shoulderY + upperArmLen + lowerArmLen),
    hip: new Point(spawnX, hipY),
    hip_l: new Point(spawnX - 1, hipY),
    hip_r: new Point(spawnX + 1, hipY),
    // Legs straight down
    knee_l: new Point(spawnX - 1, hipY + upperLegLen),
    knee_r: new Point(spawnX + 1, hipY + upperLegLen),
    foot_l: new Point(spawnX - 1, feetY),
    foot_r: new Point(spawnX + 1, feetY),
  };
  
  // Create skeleton sticks (constraints) - these keep the body together
  const sticks = [
    // SPINE - the core structural constraints
    new Stick(points.head, points.neck, neckLen + headRadius),
    new Stick(points.neck, points.hip, torsoLen),
    
    // SHOULDERS - keep them connected to spine
    new Stick(points.neck, points.shoulder_l, 2),
    new Stick(points.neck, points.shoulder_r, 2),
    new Stick(points.shoulder_l, points.shoulder_r, 4),
    
    // CROSS BRACES for torso stability (prevents folding)
    new Stick(points.shoulder_l, points.hip, 7),
    new Stick(points.shoulder_r, points.hip, 7),
    new Stick(points.shoulder_l, points.hip_r, 8),
    new Stick(points.shoulder_r, points.hip_l, 8),
    
    // ARMS
    new Stick(points.shoulder_l, points.elbow_l, upperArmLen),
    new Stick(points.shoulder_r, points.elbow_r, upperArmLen),
    new Stick(points.elbow_l, points.hand_l, lowerArmLen),
    new Stick(points.elbow_r, points.hand_r, lowerArmLen),
    
    // HIPS
    new Stick(points.hip, points.hip_l, 1),
    new Stick(points.hip, points.hip_r, 1),
    new Stick(points.hip_l, points.hip_r, 2),
    
    // LEGS
    new Stick(points.hip_l, points.knee_l, upperLegLen),
    new Stick(points.hip_r, points.knee_r, upperLegLen),
    new Stick(points.knee_l, points.foot_l, lowerLegLen),
    new Stick(points.knee_r, points.foot_r, lowerLegLen),
    
    // LEG CROSS BRACES (prevents legs from crossing)
    new Stick(points.hip_l, points.knee_r, 5),
    new Stick(points.hip_r, points.knee_l, 5),
  ];
  
  return {
    points,
    sticks,
    pointsArray: Object.values(points),
    
    // State
    alive: true,
    health: 100,
    maxHealth: 100,
    onFire: false,
    fireTimer: 0,
    inWater: false,
    
    // Walking state
    isWalking: false,
    walkDirection: Math.random() < 0.5 ? -1 : 1,
    walkPhase: 0,
    walkCooldown: 0,
    grounded: false,
    
    // AI
    aiTimer: Math.random() * 60,
    aiState: 'idle',
    
    // Visual effects
    damageFlash: 0,
    
    // For detecting ground position
    groundY: spawnY,
  };
}

/**
 * Check if a position contains solid ground
 */
function isSolid(x, y, world) {
  const mat = world.getAt(Math.floor(x), Math.floor(y));
  return SOLID_MATERIALS.has(mat);
}

/**
 * Check if a position contains liquid
 */
function isLiquid(x, y, world) {
  const mat = world.getAt(Math.floor(x), Math.floor(y));
  return LIQUID_MATERIALS.has(mat);
}

/**
 * Check if a position contains hazard and return damage
 */
function getHazardDamage(x, y, world) {
  const mat = world.getAt(Math.floor(x), Math.floor(y));
  return HAZARD_DAMAGE[mat] || 0;
}

/**
 * Find the ground level below a position (scan downward)
 */
function findGroundBelow(x, y, world) {
  const startY = Math.floor(y);
  
  for (let checkY = startY; checkY < world.height; checkY++) {
    if (isSolid(x, checkY, world)) {
      return checkY; // Return the Y where solid ground starts
    }
  }
  
  return world.height; // Bottom of world
}

/**
 * Update a single person
 */
export function updatePerson(person, world) {
  if (!person.alive) {
    updateRagdollPhysics(person, world, 0.25, 0.98);
    applyWorldCollisions(person, world);
    return;
  }
  
  // Decay effects
  if (person.damageFlash > 0) person.damageFlash--;
  if (person.fireTimer > 0) {
    person.fireTimer--;
    if (person.fireTimer <= 0) person.onFire = false;
  }
  
  // Check environment and apply damage
  checkEnvironment(person, world);
  
  // Check for death
  if (person.health <= 0) {
    person.alive = false;
    person.health = 0;
    return;
  }
  
  // Find ground level for feet
  const footL = person.points.foot_l;
  const footR = person.points.foot_r;
  const avgFootX = (footL.x + footR.x) / 2;
  const avgFootY = Math.max(footL.y, footR.y);
  
  // Check if grounded
  const groundBelow = findGroundBelow(avgFootX, avgFootY, world);
  const distToGround = groundBelow - avgFootY;
  person.grounded = distToGround <= 1 && distToGround >= -1;
  person.groundY = groundBelow;
  
  // Check if in liquid
  person.inWater = isLiquid(avgFootX, avgFootY - 5, world);
  
  // Update AI
  updateAI(person, world);
  
  // Apply physics based on state
  if (person.inWater) {
    // Swimming - reduced gravity, more friction
    updateRagdollPhysics(person, world, 0.05, 0.92);
    
    // Bob upward occasionally
    if (Math.random() < 0.1) {
      for (const pt of person.pointsArray) {
        pt.y -= 0.3;
      }
    }
  } else if (person.grounded && person.isWalking) {
    // Walking on ground - keep upright!
    updateRagdollPhysics(person, world, 0.15, 0.95);
    keepUpright(person, world);
    applyWalking(person, world);
  } else if (person.grounded) {
    // Standing still - also keep upright
    updateRagdollPhysics(person, world, 0.15, 0.9);
    keepUpright(person, world);
  } else {
    // Falling
    updateRagdollPhysics(person, world, 0.25, 0.99);
  }
  
  // Apply world collisions (keep person ON TOP of ground)
  applyWorldCollisions(person, world);
  
  // Keep person in bounds
  keepInBounds(person, world);
}

/**
 * Apply Verlet physics to the ragdoll
 */
function updateRagdollPhysics(person, world, gravity, friction) {
  // Update points
  for (const pt of person.pointsArray) {
    pt.update(gravity, friction);
  }
  
  // Solve constraints multiple times for stability - MORE iterations for stiffer body
  for (let i = 0; i < 8; i++) {
    for (const stick of person.sticks) {
      stick.update();
    }
  }
}

/**
 * Keep the person upright - RIGID skeleton for proper walking
 * This forces a proper standing/walking pose
 */
function keepUpright(person, world) {
  const pts = person.points;
  const feetY = person.groundY - 1;
  
  // VERY STRONG constraints - skeleton, not jelly!
  const RIGID = 0.6;   // Very stiff
  const STRONG = 0.4;  // Strong  
  const MEDIUM = 0.25; // Medium
  
  // === FEET FIRST - anchor to ground ===
  // Feet stay planted at ground level
  pts.foot_l.y = feetY;
  pts.foot_r.y = feetY;
  // Kill vertical velocity on feet
  pts.foot_l.oldY = pts.foot_l.y;
  pts.foot_r.oldY = pts.foot_r.y;
  
  // === HIP - fixed height above feet ===
  const hipY = feetY - 8;
  const hipX = (pts.foot_l.x + pts.foot_r.x) / 2; // Center between feet
  pts.hip.y = hipY;
  pts.hip.x += (hipX - pts.hip.x) * RIGID;
  pts.hip.oldY = pts.hip.y;
  
  // === SPINE - perfectly vertical ===
  pts.neck.x = pts.hip.x;
  pts.neck.y = hipY - 6;
  pts.neck.oldX = pts.neck.x;
  pts.neck.oldY = pts.neck.y;
  
  pts.head.x = pts.hip.x;
  pts.head.y = pts.neck.y - 5;
  pts.head.oldX = pts.head.x;
  pts.head.oldY = pts.head.y;
  
  // === SHOULDERS - level, attached to neck ===
  pts.shoulder_l.x = pts.hip.x - 2;
  pts.shoulder_l.y = pts.neck.y;
  pts.shoulder_r.x = pts.hip.x + 2;
  pts.shoulder_r.y = pts.neck.y;
  
  // === HIPS - level, attached to center hip ===
  pts.hip_l.x = pts.hip.x - 1;
  pts.hip_l.y = hipY;
  pts.hip_r.x = pts.hip.x + 1;
  pts.hip_r.y = hipY;
  
  // === KNEES - between hips and feet, slight bend ===
  const kneeY = hipY + 4;
  pts.knee_l.x += (pts.foot_l.x - pts.knee_l.x) * STRONG;
  pts.knee_l.y = kneeY;
  pts.knee_r.x += (pts.foot_r.x - pts.knee_r.x) * STRONG;
  pts.knee_r.y = kneeY;
  
  // === ARMS - hang at sides ===
  pts.elbow_l.x = pts.hip.x - 3;
  pts.elbow_l.y = pts.neck.y + 3;
  pts.elbow_r.x = pts.hip.x + 3;
  pts.elbow_r.y = pts.neck.y + 3;
  
  pts.hand_l.x = pts.hip.x - 3;
  pts.hand_l.y = pts.neck.y + 6;
  pts.hand_r.x = pts.hip.x + 3;
  pts.hand_r.y = pts.neck.y + 6;
}

/**
 * Collision with the world - keeps person ON TOP of materials
 */
function applyWorldCollisions(person, world) {
  for (const pt of person.pointsArray) {
    const px = Math.floor(pt.x);
    const py = Math.floor(pt.y);
    
    // Check if point is inside solid material
    if (isSolid(px, py, world)) {
      // Check if this is a WALL (solid to the side) vs GROUND (solid below)
      const solidLeft = isSolid(px - 1, py, world);
      const solidRight = isSolid(px + 1, py, world);
      const solidAbove = isSolid(px, py - 1, world);
      const solidBelow = isSolid(px, py + 1, world);
      
      // If solid above, this is a wall - push horizontally, not vertically!
      if (solidAbove) {
        // Find which direction is clear
        if (!solidLeft && solidRight) {
          // Push left
          pt.x = px - 0.5;
          pt.oldX = pt.x + 0.5; // Bounce back
        } else if (solidLeft && !solidRight) {
          // Push right  
          pt.x = px + 1.5;
          pt.oldX = pt.x - 0.5; // Bounce back
        } else if (!solidLeft) {
          pt.x = px - 0.5;
          pt.oldX = pt.x + 0.5;
        } else if (!solidRight) {
          pt.x = px + 1.5;
          pt.oldX = pt.x - 0.5;
        }
      } else {
        // This is ground - push UP normally
        let surfaceY = py;
        while (surfaceY > 0 && isSolid(px, surfaceY - 1, world)) {
          surfaceY--;
        }
        
        if (!isSolid(px, surfaceY - 1, world)) {
          pt.y = surfaceY - 0.5;
          pt.oldY = pt.y;
          
          // Friction
          const vx = pt.x - pt.oldX;
          pt.oldX = pt.x - vx * 0.7;
        }
      }
    }
    
    // World boundaries
    if (pt.y > world.height - 1) {
      pt.y = world.height - 1;
      pt.oldY = pt.y;
    }
    if (pt.y < 1) {
      pt.y = 1;
      pt.oldY = pt.y;
    }
  }
}

/**
 * Keep person in world bounds
 */
function keepInBounds(person, world) {
  for (const pt of person.pointsArray) {
    // Left boundary
    if (pt.x < 3) {
      pt.x = 3;
      pt.oldX = pt.x;
    }
    // Right boundary
    if (pt.x > world.width - 3) {
      pt.x = world.width - 3;
      pt.oldX = pt.x;
    }
    // TOP boundary - prevent flying off screen!
    if (pt.y < 5) {
      pt.y = 5;
      pt.oldY = pt.y - 0.5; // Push back down with some velocity
    }
    // Bottom boundary
    if (pt.y > world.height - 2) {
      pt.y = world.height - 2;
      pt.oldY = pt.y;
    }
  }
}

/**
 * Apply walking movement - REALISTIC stepping motion
 * The whole body moves together, feet step properly
 */
function applyWalking(person, world) {
  if (person.walkCooldown > 0) {
    person.walkCooldown--;
    return;
  }
  
  const dir = person.walkDirection;
  const pts = person.points;
  
  // Walking speed
  let stepSize = 0.3;
  if (person.aiState === 'panic') stepSize = 0.6;
  
  // === OBSTACLE DETECTION - Look further ahead to turn earlier ===
  // Check at different heights and distances
  const dist = 8; // Look 8 pixels ahead
  const obstacleAtFeet = checkObstacleAhead(person, world, dist, 0);      // Ground level
  const obstacleAtKnee = checkObstacleAhead(person, world, dist, -3);     // Knee height
  const obstacleAtWaist = checkObstacleAhead(person, world, dist, -6);    // Waist height
  const obstacleAtChest = checkObstacleAhead(person, world, dist, -10);   // Chest height
  const obstacleAtHead = checkObstacleAhead(person, world, dist, -14);    // Head height
  
  // TALL WALL = obstacle at waist or higher - CAN'T JUMP OVER, MUST TURN AROUND
  const tallWall = obstacleAtWaist || obstacleAtChest || obstacleAtHead;
  
  // LOW OBSTACLE = only at feet level, completely clear above knee - safe to step over (no jump needed)
  const lowObstacle = obstacleAtFeet && !obstacleAtKnee && !obstacleAtWaist && !obstacleAtChest;
  
  const hasGroundAhead = checkGroundAhead(person, world, 10);
  const nearLeftEdge = pts.hip.x < 15;
  const nearRightEdge = pts.hip.x > world.width - 15;
  const atEdge = (dir < 0 && nearLeftEdge) || (dir > 0 && nearRightEdge);
  
  // === DECISION MAKING ===
  
  // TALL WALL or EDGE: Turn around, don't even try to jump!
  if (tallWall || atEdge) {
    person.walkDirection *= -1;
    person.walkCooldown = 40;
    person.isWalking = false;
    person.aiState = 'idle';
    person.aiTimer = 30;
    return;
  }
  
  // LOW OBSTACLE: Just step over it (no jumping - too risky!)
  // The walking physics will naturally lift feet over small bumps
  // Only do a small hop if truly stuck
  if (lowObstacle && person.grounded && person.walkCooldown <= 0) {
    // Small step-up, not a jump
    for (const pt of person.pointsArray) {
      pt.y -= 1; // Tiny lift
    }
    person.walkCooldown = 10;
  }
  
  if (!hasGroundAhead) {
    person.walkDirection *= -1;
    person.walkCooldown = 35;
    person.isWalking = false;
    person.aiState = 'idle';
    person.aiTimer = 25;
    return;
  }
  
  // === WALKING: Move ALL body parts together ===
  // This is the key - move feet, and body follows
  
  // Advance the walk cycle
  person.walkPhase += 0.12;
  
  // Calculate foot positions for stepping motion
  const stepLength = 3; // How far each foot steps
  const phase = person.walkPhase;
  
  // Alternating foot positions - one forward, one back
  const leftFootOffset = Math.sin(phase) * stepLength * dir;
  const rightFootOffset = Math.sin(phase + Math.PI) * stepLength * dir;
  
  // Move feet to create stepping
  const centerX = pts.hip.x + dir * stepSize; // Where we're walking to
  
  // Update foot positions
  pts.foot_l.x = centerX - 1 + leftFootOffset;
  pts.foot_r.x = centerX + 1 + rightFootOffset;
  
  // Lock feet X velocity (no sliding!)
  pts.foot_l.oldX = pts.foot_l.x;
  pts.foot_r.oldX = pts.foot_r.x;
  
  // Arm swing - opposite to legs
  const armSwing = Math.sin(phase) * 2 * dir;
  pts.hand_l.x = pts.shoulder_l.x + armSwing;
  pts.hand_r.x = pts.shoulder_r.x - armSwing;
}

/**
 * Update AI behavior - SMART and REALISTIC
 */
function updateAI(person, world) {
  person.aiTimer--;
  
  // Only make new decisions when timer expires
  if (person.aiTimer <= 0) {
    const rand = Math.random();
    
    if (person.onFire) {
      // PANIC! Run around!
      person.aiState = 'panic';
      person.isWalking = true;
      person.aiTimer = 30 + Math.random() * 40;
    } else if (rand < 0.6) {
      // Walk - most common behavior
      person.aiState = 'walk';
      person.isWalking = true;
      person.aiTimer = 90 + Math.random() * 150; // Walk for longer periods
    } else if (rand < 0.9) {
      // Idle - stand still and "look around"
      person.aiState = 'idle';
      person.isWalking = false;
      person.aiTimer = 60 + Math.random() * 90;
    } else {
      // Random jump for fun
      person.aiState = 'jump';
      person.isWalking = false;
      person.aiTimer = 40;
      
      if (person.grounded) {
        doJump(person, 3);
      }
    }
  }
}

/**
 * Make the person jump - with reasonable limits!
 */
function doJump(person, power) {
  // Limit jump power to prevent flying off screen
  const maxPower = 4;
  const safePower = Math.min(power, maxPower);
  
  for (const pt of person.pointsArray) {
    pt.oldY = pt.y + safePower;
  }
}

/**
 * Check if there's an obstacle ahead at a certain height
 */
function checkObstacleAhead(person, world, distance, heightOffset) {
  const hipX = person.points.hip.x;
  const hipY = person.points.hip.y;
  const dir = person.walkDirection;
  
  const checkX = hipX + dir * distance;
  const checkY = hipY + heightOffset;
  
  return isSolid(checkX, checkY, world);
}

/**
 * Check if there's ground ahead to walk on
 */
function checkGroundAhead(person, world, distance) {
  const hipX = person.points.hip.x;
  const dir = person.walkDirection;
  
  const checkX = hipX + dir * distance;
  const groundY = findGroundBelow(checkX, person.groundY - 10, world);
  
  // No ground if it's at the bottom of the world
  return groundY < world.height - 2;
}

/**
 * Check environment for hazards and apply damage
 */
function checkEnvironment(person, world) {
  let totalDamage = 0;
  let touchingFire = false;
  let touchingWater = false;
  
  // Check all body points for hazards
  for (const pt of person.pointsArray) {
    const damage = getHazardDamage(pt.x, pt.y, world);
    if (damage > 0) {
      totalDamage += damage;
      touchingFire = true;
    }
    
    if (isLiquid(pt.x, pt.y, world)) {
      touchingWater = true;
    }
  }
  
  // Apply damage
  if (totalDamage > 0) {
    person.health -= totalDamage * 0.1;
    person.damageFlash = 5;
    
    if (!person.onFire) {
      person.onFire = true;
      person.fireTimer = 180;
    }
  }
  
  // Fire damage over time
  if (person.onFire) {
    person.health -= 0.1;
    if (Math.random() < 0.3) person.damageFlash = 3;
  }
  
  // Water puts out fire and heals slightly
  if (touchingWater) {
    person.onFire = false;
    person.fireTimer = 0;
    if (person.health < person.maxHealth) {
      person.health = Math.min(person.maxHealth, person.health + 0.03);
    }
  }
}

/**
 * Get the center position of the person (for camera/UI)
 */
export function getPersonCenter(person) {
  const hip = person.points.hip;
  return { x: hip.x, y: hip.y - 8 };
}

/**
 * Manage multiple people
 */
export function createPeopleManager() {
  const people = [];
  
  return {
    people,
    
    spawn(x, y) {
      const person = createPerson(x, y);
      people.push(person);
      return person;
    },
    
    update(world) {
      for (const person of people) {
        updatePerson(person, world);
      }
    },
    
    clear() {
      people.length = 0;
    },
    
    getAll() {
      return people;
    },
  };
}

