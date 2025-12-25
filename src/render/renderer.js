import { MaterialList, jitterColor } from '../sim/materials.js';
import { getPersonCenter } from '../sim/Person.js';

export function createRenderer(canvas, simWidth, simHeight, dpr) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const imageData = new ImageData(simWidth, simHeight);
  const pixels = imageData.data;
  const palette = new Array(MaterialList.length);
  let needsFullRedraw = true;

  // Precompute base colors per material
  for (const m of MaterialList) palette[m.id] = m.color;

  function requestFullRedraw() { needsFullRedraw = true; }

  function draw(world) {
    const { width, height, cells, noise } = world;

    // Write pixel buffer from cells
    // Small noise-based color jitter applied for variety
    for (let i = 0; i < cells.length; i++) {
      const id = cells[i];
      const base = palette[id];
      const n = noise[i];
      const [r, g, b, a] = jitterColor(base, n);
      const p = i * 4;
      pixels[p + 0] = r;
      pixels[p + 1] = g;
      pixels[p + 2] = b;
      pixels[p + 3] = a;
    }
    
    // Draw people onto the pixel buffer (People Playground style ragdolls!)
    const people = world.getPeople();
    for (const person of people) {
      drawRagdollPerson(person, width, height, pixels);
    }

    // Draw gibs in pixel buffer (same style as people!)
    drawGibsPixelStyle(world.gibs, width, height, pixels);

    // Put image at 1:1 pixel into an offscreen, then scale to canvas size
    const off = ensureOffscreen(width, height);
    off.ctx.putImageData(imageData, 0, 0);

    // Draw scaled with nearest-neighbor look
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off.canvas, 0, 0, off.canvas.width, off.canvas.height, 0, 0, canvas.width, canvas.height);
    
    // Draw bombs, explosions, blood, and gibs in screen space
    const scaleX = canvas.width / simWidth;
    const scaleY = canvas.height / simHeight;
    
    drawBombs(ctx, world.bombs, scaleX, scaleY);
    drawExplosions(ctx, world.explosions, scaleX, scaleY);
    drawBloodParticles(ctx, world.bloodParticles, scaleX, scaleY);
    // Gibs are now drawn in pixel buffer above, not here
    drawWeapons(ctx, world.getWeapons(), scaleX, scaleY);
    drawProjectiles(ctx, world.getProjectiles(), scaleX, scaleY);
    drawVehicles(ctx, world.getVehicles(), scaleX, scaleY);
    
    // Draw health bars and effects in screen space
    drawPersonUI(ctx, people, simWidth, simHeight, canvas.width, canvas.height);

    needsFullRedraw = false;
  }
  
  // Draw a pixel at position with color
  function setPixel(pixels, width, height, x, y, r, g, b, a = 255) {
    const px = Math.floor(x);
    const py = Math.floor(y);
    if (px >= 0 && px < width && py >= 0 && py < height) {
      const i = (py * width + px) * 4;
      pixels[i + 0] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }
  
  // Draw a line between two points (Bresenham's)
  function drawLine(pixels, width, height, x0, y0, x1, y1, r, g, b, thickness = 1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    
    let x = x0;
    let y = y0;
    
    while (true) {
      // Draw with thickness
      for (let tx = -thickness + 1; tx < thickness; tx++) {
        for (let ty = -thickness + 1; ty < thickness; ty++) {
          setPixel(pixels, width, height, x + tx, y + ty, r, g, b);
        }
      }
      
      if (Math.abs(x - x1) < 1 && Math.abs(y - y1) < 1) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  
  // Draw a filled circle
  function drawCircle(pixels, width, height, cx, cy, radius, r, g, b) {
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= r2) {
          setPixel(pixels, width, height, cx + dx, cy + dy, r, g, b);
        }
      }
    }
  }
  
  // People Playground style ragdoll rendering - ENHANCED VISIBILITY
  function drawRagdollPerson(person, width, height, pixels) {
    const pts = person.points;
    
    // Determine colors based on state
    let skinR = 255, skinG = 200, skinB = 170;
    let shirtR = 65, shirtG = 105, shirtB = 180;  // Blue shirt
    let pantsR = 50, pantsG = 60, pantsB = 120;   // Dark blue pants
    let shoeR = 40, shoeG = 30, shoeB = 25;       // Brown shoes
    
    // Damage flash - bright red
    if (person.damageFlash > 0) {
      skinR = 255; skinG = 100; skinB = 100;
      shirtR = 220; shirtG = 60; shirtB = 60;
      pantsR = 180; pantsG = 40; pantsB = 40;
    }
    
    // On fire - orange/yellow flickering
    if (person.onFire) {
      const flicker = Math.random();
      if (flicker > 0.3) {
        skinR = 255;
        skinG = Math.floor(150 + flicker * 80);
        skinB = Math.floor(50 + flicker * 50);
        shirtR = 255;
        shirtG = Math.floor(100 + flicker * 60);
        shirtB = 30;
        pantsR = 200;
        pantsG = Math.floor(80 + flicker * 40);
        pantsB = 20;
      }
    }
    
    // Dead - gray/pale
    if (!person.alive) {
      skinR = 160; skinG = 150; skinB = 140;
      shirtR = 90; shirtG = 85; shirtB = 80;
      pantsR = 70; pantsG = 65; pantsB = 60;
      shoeR = 50; shoeG = 45; shoeB = 40;
    }
    
    // In water - blue tint
    if (person.inWater && person.alive) {
      skinB = Math.min(255, skinB + 40);
      shirtB = Math.min(255, shirtB + 40);
    }
    
    // Draw order: back to front (legs, torso, arms, head)
    
    // === LEGS (thicker, more visible) ===
    // Upper legs (thighs)
    drawThickLine(pixels, width, height, pts.hip_l.x, pts.hip_l.y, pts.knee_l.x, pts.knee_l.y, pantsR, pantsG, pantsB, 2);
    drawThickLine(pixels, width, height, pts.hip_r.x, pts.hip_r.y, pts.knee_r.x, pts.knee_r.y, pantsR, pantsG, pantsB, 2);
    // Lower legs (shins)
    drawThickLine(pixels, width, height, pts.knee_l.x, pts.knee_l.y, pts.foot_l.x, pts.foot_l.y, pantsR, pantsG, pantsB, 2);
    drawThickLine(pixels, width, height, pts.knee_r.x, pts.knee_r.y, pts.foot_r.x, pts.foot_r.y, pantsR, pantsG, pantsB, 2);
    // Knees (joint circles)
    drawCircle(pixels, width, height, pts.knee_l.x, pts.knee_l.y, 1, pantsR + 20, pantsG + 20, pantsB + 20);
    drawCircle(pixels, width, height, pts.knee_r.x, pts.knee_r.y, 1, pantsR + 20, pantsG + 20, pantsB + 20);
    // Feet (shoes)
    drawCircle(pixels, width, height, pts.foot_l.x, pts.foot_l.y, 2, shoeR, shoeG, shoeB);
    drawCircle(pixels, width, height, pts.foot_r.x, pts.foot_r.y, 2, shoeR, shoeG, shoeB);
    
    // === TORSO ===
    // Main body (thicker)
    drawThickLine(pixels, width, height, pts.neck.x, pts.neck.y, pts.hip.x, pts.hip.y, shirtR, shirtG, shirtB, 3);
    // Shoulders
    drawThickLine(pixels, width, height, pts.shoulder_l.x, pts.shoulder_l.y, pts.shoulder_r.x, pts.shoulder_r.y, shirtR, shirtG, shirtB, 2);
    // Hips
    drawThickLine(pixels, width, height, pts.hip_l.x, pts.hip_l.y, pts.hip_r.x, pts.hip_r.y, pantsR, pantsG, pantsB, 2);
    
    // === ARMS ===
    // Upper arms
    drawThickLine(pixels, width, height, pts.shoulder_l.x, pts.shoulder_l.y, pts.elbow_l.x, pts.elbow_l.y, skinR, skinG, skinB, 2);
    drawThickLine(pixels, width, height, pts.shoulder_r.x, pts.shoulder_r.y, pts.elbow_r.x, pts.elbow_r.y, skinR, skinG, skinB, 2);
    // Lower arms
    drawThickLine(pixels, width, height, pts.elbow_l.x, pts.elbow_l.y, pts.hand_l.x, pts.hand_l.y, skinR, skinG, skinB, 2);
    drawThickLine(pixels, width, height, pts.elbow_r.x, pts.elbow_r.y, pts.hand_r.x, pts.hand_r.y, skinR, skinG, skinB, 2);
    // Elbows
    drawCircle(pixels, width, height, pts.elbow_l.x, pts.elbow_l.y, 1, skinR - 20, skinG - 20, skinB - 20);
    drawCircle(pixels, width, height, pts.elbow_r.x, pts.elbow_r.y, 1, skinR - 20, skinG - 20, skinB - 20);
    // Hands
    drawCircle(pixels, width, height, pts.hand_l.x, pts.hand_l.y, 2, skinR, skinG, skinB);
    drawCircle(pixels, width, height, pts.hand_r.x, pts.hand_r.y, 2, skinR, skinG, skinB);
    
    // === HEAD ===
    const headRadius = 4;
    // Neck
    drawThickLine(pixels, width, height, pts.head.x, pts.head.y + headRadius - 1, pts.neck.x, pts.neck.y, skinR - 30, skinG - 30, skinB - 30, 2);
    // Head circle
    drawCircle(pixels, width, height, pts.head.x, pts.head.y, headRadius, skinR, skinG, skinB);
    // Hair (darker top of head)
    for (let dx = -2; dx <= 2; dx++) {
      setPixel(pixels, width, height, pts.head.x + dx, pts.head.y - headRadius + 1, 60, 40, 30);
      setPixel(pixels, width, height, pts.head.x + dx, pts.head.y - headRadius, 60, 40, 30);
    }
    
    // Face
    if (person.alive) {
      // Eyes - two dark dots positioned based on walk direction
      const eyeOffsetX = person.walkDirection > 0 ? 1 : -1;
      setPixel(pixels, width, height, pts.head.x + eyeOffsetX - 1, pts.head.y - 1, 20, 20, 20);
      setPixel(pixels, width, height, pts.head.x + eyeOffsetX + 1, pts.head.y - 1, 20, 20, 20);
      // Mouth - small line
      setPixel(pixels, width, height, pts.head.x + eyeOffsetX, pts.head.y + 1, 180, 100, 100);
    } else {
      // X X eyes when dead (People Playground style!)
      // Left X
      setPixel(pixels, width, height, pts.head.x - 2, pts.head.y - 2, 80, 20, 20);
      setPixel(pixels, width, height, pts.head.x - 2, pts.head.y, 80, 20, 20);
      setPixel(pixels, width, height, pts.head.x - 1, pts.head.y - 1, 80, 20, 20);
      // Right X  
      setPixel(pixels, width, height, pts.head.x + 2, pts.head.y - 2, 80, 20, 20);
      setPixel(pixels, width, height, pts.head.x + 2, pts.head.y, 80, 20, 20);
      setPixel(pixels, width, height, pts.head.x + 1, pts.head.y - 1, 80, 20, 20);
      // Dead mouth
      for (let dx = -1; dx <= 1; dx++) {
        setPixel(pixels, width, height, pts.head.x + dx, pts.head.y + 2, 100, 50, 50);
      }
    }
  }
  
  // Draw gibs in pixel buffer style (matching the living humans)
  function drawGibsPixelStyle(gibs, width, height, pixels) {
    for (const gib of gibs) {
      const x = Math.floor(gib.x);
      const y = Math.floor(gib.y);
      const alpha = Math.min(1, gib.life / 60);

      // Skip nearly invisible gibs
      if (alpha < 0.1) continue;

      // Get base colors from gib
      let r = gib.color[0];
      let g = gib.color[1];
      let b = gib.color[2];

      // Fade colors based on life
      r = Math.floor(r * alpha);
      g = Math.floor(g * alpha);
      b = Math.floor(b * alpha);

      // Blood color (dark red)
      const bloodR = Math.floor(120 * alpha);
      const bloodG = Math.floor(0 * alpha);
      const bloodB = Math.floor(0 * alpha);

      switch (gib.type) {
        case 'head':
          // Draw head circle (matches living human head)
          drawCircle(pixels, width, height, x, y, 4, r, g, b);
          // Hair on top
          for (let dx = -2; dx <= 2; dx++) {
            setPixel(pixels, width, height, x + dx, y - 4, 60, 40, 30);
            setPixel(pixels, width, height, x + dx, y - 3, 60, 40, 30);
          }
          // Dead X eyes
          setPixel(pixels, width, height, x - 2, y - 2, 80, 20, 20);
          setPixel(pixels, width, height, x - 2, y, 80, 20, 20);
          setPixel(pixels, width, height, x - 1, y - 1, 80, 20, 20);
          setPixel(pixels, width, height, x + 2, y - 2, 80, 20, 20);
          setPixel(pixels, width, height, x + 2, y, 80, 20, 20);
          setPixel(pixels, width, height, x + 1, y - 1, 80, 20, 20);
          // Neck stump (bloody)
          drawCircle(pixels, width, height, x, y + 4, 2, bloodR, bloodG, bloodB);
          break;

        case 'torso':
          // Blue shirt torso (matches living human)
          const shirtR = Math.floor(65 * alpha);
          const shirtG = Math.floor(105 * alpha);
          const shirtB = Math.floor(180 * alpha);
          drawThickLine(pixels, width, height, x, y - 5, x, y + 5, shirtR, shirtG, shirtB, 3);
          // Shoulder line
          drawThickLine(pixels, width, height, x - 4, y - 4, x + 4, y - 4, shirtR, shirtG, shirtB, 2);
          // Hip line (pants color)
          const pantsR = Math.floor(50 * alpha);
          const pantsG = Math.floor(60 * alpha);
          const pantsB = Math.floor(120 * alpha);
          drawThickLine(pixels, width, height, x - 3, y + 5, x + 3, y + 5, pantsR, pantsG, pantsB, 2);
          // Bloody ends
          drawCircle(pixels, width, height, x, y - 5, 1, bloodR, bloodG, bloodB);
          drawCircle(pixels, width, height, x, y + 5, 1, bloodR, bloodG, bloodB);
          break;

        case 'arm':
          // Skin colored arm segment
          drawThickLine(pixels, width, height, x, y - 4, x, y + 4, r, g, b, 2);
          // Elbow joint
          drawCircle(pixels, width, height, x, y, 1, Math.floor(r * 0.8), Math.floor(g * 0.8), Math.floor(b * 0.8));
          // Hand at one end
          drawCircle(pixels, width, height, x, y - 4, 2, r, g, b);
          // Bloody stump at other end
          drawCircle(pixels, width, height, x, y + 4, 2, bloodR, bloodG, bloodB);
          break;

        case 'leg':
          // Pants colored leg segment
          const legPantsR = Math.floor(50 * alpha);
          const legPantsG = Math.floor(60 * alpha);
          const legPantsB = Math.floor(120 * alpha);
          drawThickLine(pixels, width, height, x, y - 5, x, y + 5, legPantsR, legPantsG, legPantsB, 2);
          // Knee joint
          drawCircle(pixels, width, height, x, y, 1, Math.floor(legPantsR * 1.2), Math.floor(legPantsG * 1.2), Math.floor(legPantsB * 1.2));
          // Shoe at one end
          const shoeR = Math.floor(40 * alpha);
          const shoeG = Math.floor(30 * alpha);
          const shoeB = Math.floor(25 * alpha);
          drawCircle(pixels, width, height, x, y + 5, 2, shoeR, shoeG, shoeB);
          // Bloody stump at other end
          drawCircle(pixels, width, height, x, y - 5, 2, bloodR, bloodG, bloodB);
          break;
      }

      // Blood splatter around gib
      if (Math.random() < 0.3) {
        const bloodOffsetX = Math.floor((Math.random() - 0.5) * 6);
        const bloodOffsetY = Math.floor((Math.random() - 0.5) * 6);
        setPixel(pixels, width, height, x + bloodOffsetX, y + bloodOffsetY, bloodR, bloodG, bloodB);
      }
    }
  }

  // Draw a thicker line (People Playground style limbs)
  function drawThickLine(pixels, width, height, x0, y0, x1, y1, r, g, b, thickness) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      
      // Draw a filled circle at each step for consistent thickness
      const radius = thickness / 2;
      for (let py = -radius; py <= radius; py++) {
        for (let px = -radius; px <= radius; px++) {
          if (px * px + py * py <= radius * radius) {
            setPixel(pixels, width, height, x + px, y + py, r, g, b);
          }
        }
      }
    }
  }
  
  // Draw health bars and UI for people
  function drawPersonUI(ctx, people, simW, simH, canvasW, canvasH) {
    const scaleX = canvasW / simW;
    const scaleY = canvasH / simH;
    
    for (const person of people) {
      const center = getPersonCenter(person);
      const screenX = center.x * scaleX;
      const screenY = (center.y - 12) * scaleY;
      
      // Health bar dimensions
      const barWidth = 28 * scaleX;
      const barHeight = 4 * scaleY;
      const healthPercent = Math.max(0, person.health / person.maxHealth);
      
      // Only show health bar if alive or recently died
      if (person.alive || person.health > -10) {
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(screenX - barWidth / 2 - 1, screenY - 1, barWidth + 2, barHeight + 2);
        
        // Health fill
        if (person.alive) {
          const r = Math.floor(220 * (1 - healthPercent));
          const g = Math.floor(200 * healthPercent);
          ctx.fillStyle = `rgb(${r}, ${g}, 40)`;
          ctx.fillRect(screenX - barWidth / 2, screenY, barWidth * healthPercent, barHeight);
        } else {
          // Dead - gray bar
          ctx.fillStyle = '#444';
          ctx.fillRect(screenX - barWidth / 2, screenY, barWidth, barHeight);
        }
        
        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(screenX - barWidth / 2, screenY, barWidth, barHeight);
      }
      
      // Fire indicator
      if (person.onFire) {
        ctx.font = `${Math.max(12, Math.floor(10 * scaleY))}px sans-serif`;
        ctx.fillText('🔥', screenX + barWidth / 2 + 4, screenY + barHeight);
      }
      
      // Water indicator
      if (person.inWater && person.alive) {
        ctx.font = `${Math.max(12, Math.floor(10 * scaleY))}px sans-serif`;
        ctx.fillText('💧', screenX - barWidth / 2 - 16, screenY + barHeight);
      }
    }
  }

  // ===== BOMB DRAWING =====
  function drawBombs(ctx, bombs, scaleX, scaleY) {
    for (const bomb of bombs) {
      const x = bomb.x * scaleX;
      const y = bomb.y * scaleY;
      const size = bomb.size * scaleX;
      
      // Bomb body (black sphere)
      ctx.fillStyle = '#1a1a1a';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      
      // Bomb highlight
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      
      // Fuse (wick) on top
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size * 0.5, y - size * 1.5);
      ctx.stroke();
      
      // Fuse spark/flame (blinks when about to explode)
      if (bomb.fuse < 60 || Math.random() > 0.5) {
        const sparkSize = 3 + Math.random() * 3;
        const gradient = ctx.createRadialGradient(
          x + size * 0.5, y - size * 1.5, 0,
          x + size * 0.5, y - size * 1.5, sparkSize
        );
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(0.3, '#ff0');
        gradient.addColorStop(0.6, '#f80');
        gradient.addColorStop(1, 'transparent');
        ctx.fillStyle = gradient;
        ctx.fillRect(
          x + size * 0.5 - sparkSize, 
          y - size * 1.5 - sparkSize, 
          sparkSize * 2, 
          sparkSize * 2
        );
      }
      
      // Timer text when close to exploding
      if (bomb.fuse < 90) {
        const seconds = Math.ceil(bomb.fuse / 60);
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.fillStyle = bomb.fuse < 30 ? '#ff0000' : '#ffff00';
        ctx.textAlign = 'center';
        ctx.fillText(seconds.toString(), x, y - size * 2.5);
      }
    }
  }
  
  // ===== EXPLOSION DRAWING =====
  function drawExplosions(ctx, explosions, scaleX, scaleY) {
    for (const exp of explosions) {
      const x = exp.x * scaleX;
      const y = exp.y * scaleY;
      const radius = exp.radius * scaleX;
      const progress = exp.age / exp.maxAge;
      
      // Outer shockwave ring
      ctx.strokeStyle = `rgba(255, 200, 50, ${1 - progress})`;
      ctx.lineWidth = 4 * (1 - progress);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
      
      // Inner fireball
      const innerRadius = radius * (1 - progress * 0.5);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, innerRadius);
      gradient.addColorStop(0, `rgba(255, 255, 200, ${0.8 * (1 - progress)})`);
      gradient.addColorStop(0.2, `rgba(255, 200, 50, ${0.6 * (1 - progress)})`);
      gradient.addColorStop(0.5, `rgba(255, 100, 0, ${0.4 * (1 - progress)})`);
      gradient.addColorStop(0.8, `rgba(200, 50, 0, ${0.2 * (1 - progress)})`);
      gradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, innerRadius, 0, Math.PI * 2);
      ctx.fill();
      
      // Random sparks
      if (progress < 0.5) {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + progress * 2;
          const sparkDist = radius * (0.5 + Math.random() * 0.5);
          const sparkX = x + Math.cos(angle) * sparkDist;
          const sparkY = y + Math.sin(angle) * sparkDist;
          
          ctx.fillStyle = `rgba(255, 255, 100, ${0.8 * (1 - progress * 2)})`;
          ctx.beginPath();
          ctx.arc(sparkX, sparkY, 2 + Math.random() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  
  // ===== BLOOD PARTICLE DRAWING =====
  function drawBloodParticles(ctx, particles, scaleX, scaleY) {
    for (const p of particles) {
      const x = p.x * scaleX;
      const y = p.y * scaleY;
      const size = p.size * scaleX;
      const alpha = Math.min(1, p.life / 30);
      
      // Dark red blood color with slight variation
      const r = 120 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${r}, 0, 0, ${alpha})`;
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  
  // ===== GIB (BODY PART) DRAWING =====
  function drawGibs(ctx, gibs, scaleX, scaleY) {
    for (const gib of gibs) {
      const x = gib.x * scaleX;
      const y = gib.y * scaleY;
      const alpha = Math.min(1, gib.life / 60);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(gib.rotation);

      // Draw different detailed body parts based on gib type
      switch (gib.type) {
        case 'head':
          // Detailed severed head with face and hair
          ctx.fillStyle = `rgba(${gib.color[0]}, ${gib.color[1]}, ${gib.color[2]}, ${alpha})`;

          // Main head shape (more oval than circle)
          ctx.beginPath();
          ctx.ellipse(0, 0, 4.5 * scaleX, 5 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Hair on top
          ctx.fillStyle = `rgba(30, 20, 10, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(0, -4 * scaleY, 4 * scaleX, 2.5 * scaleY, 0, Math.PI, Math.PI * 2);
          ctx.fill();

          // Eyes (black holes)
          ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(-1.5 * scaleX, -0.5 * scaleY, 0.8 * scaleX, 0.6 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(1.5 * scaleX, -0.5 * scaleY, 0.8 * scaleX, 0.6 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Mouth (open in horror)
          ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(0, 1 * scaleY, 1.5 * scaleX, 0, Math.PI);
          ctx.stroke();

          break;

        case 'torso':
          // Bloody torso with ribs showing
          ctx.fillStyle = `rgba(${gib.color[0]}, ${gib.color[1]}, ${gib.color[2]}, ${alpha})`;

          // Main torso shape
          ctx.beginPath();
          ctx.ellipse(0, 0, 5 * scaleX, 6 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Ribcage outline
          ctx.strokeStyle = `rgba(200, 200, 200, ${alpha * 0.8})`;
          ctx.lineWidth = 1;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(0, (-2 + i) * scaleY, 3.5 * scaleX, 2 * scaleY, 0, 0, Math.PI);
            ctx.stroke();
          }

          // Intestines hanging out (gory detail)
          ctx.fillStyle = `rgba(150, 100, 50, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(2 * scaleX, 2 * scaleY, 2 * scaleX, 1.5 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Bloody chunks
          ctx.fillStyle = `rgba(120, 0, 0, ${alpha * 0.7})`;
          for (let i = 0; i < 3; i++) {
            const angle = (i * Math.PI * 2) / 3;
            const dist = 3 * scaleX;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, 1.5 * scaleX, 0, Math.PI * 2);
            ctx.fill();
          }

          break;

        case 'arm':
          // Severed arm with bone protruding
          ctx.fillStyle = `rgba(${gib.color[0]}, ${gib.color[1]}, ${gib.color[2]}, ${alpha})`;

          // Arm flesh
          ctx.beginPath();
          ctx.ellipse(0, 0, 2.5 * scaleX, 6 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Bone sticking out (white)
          ctx.fillStyle = `rgba(240, 240, 240, ${alpha})`;
          ctx.fillRect(-0.5 * scaleX, -6 * scaleY, 1 * scaleX, 3 * scaleY);

          // Bloody stump
          ctx.fillStyle = `rgba(120, 0, 0, ${alpha * 0.8})`;
          ctx.beginPath();
          ctx.ellipse(0, 5 * scaleY, 2 * scaleX, 1.5 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Hand at the end
          ctx.fillStyle = `rgba(${gib.color[0] - 20}, ${gib.color[1] - 20}, ${gib.color[2] - 20}, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(0, -6 * scaleY, 1.8 * scaleX, 2 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          break;

        case 'leg':
          // Severed leg with bone and muscle
          ctx.fillStyle = `rgba(${gib.color[0]}, ${gib.color[1]}, ${gib.color[2]}, ${alpha})`;

          // Leg flesh
          ctx.beginPath();
          ctx.ellipse(0, 0, 3 * scaleX, 7 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Muscle definition
          ctx.fillStyle = `rgba(${gib.color[0] - 30}, ${gib.color[1] - 30}, ${gib.color[2] - 30}, ${alpha * 0.6})`;
          ctx.beginPath();
          ctx.ellipse(-1 * scaleX, -2 * scaleY, 1.5 * scaleX, 4 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Bone fragments
          ctx.fillStyle = `rgba(240, 240, 240, ${alpha})`;
          ctx.fillRect(-0.3 * scaleX, -7 * scaleY, 0.6 * scaleX, 4 * scaleY);

          // Bloody foot
          ctx.fillStyle = `rgba(${gib.color[0] - 20}, ${gib.color[1] - 20}, ${gib.color[2] - 20}, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(0, 6 * scaleY, 2.5 * scaleX, 2 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          // Blood pooling
          ctx.fillStyle = `rgba(120, 0, 0, ${alpha * 0.5})`;
          ctx.beginPath();
          ctx.ellipse(0, 7 * scaleY, 3 * scaleX, 1 * scaleY, 0, 0, Math.PI * 2);
          ctx.fill();

          break;
      }

      // Enhanced blood and gore effects
      ctx.fillStyle = `rgba(120, 0, 0, ${alpha * 0.8})`;
      // Blood splatters around the gib
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 8 * scaleX;
        const size = (0.5 + Math.random()) * scaleX;
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Dripping blood effect
      ctx.strokeStyle = `rgba(120, 0, 0, ${alpha * 0.6})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 15 * scaleY);
      ctx.stroke();

      ctx.restore();
    }
  }

  let offscreen = null;
  function ensureOffscreen(w, h) {
    if (!offscreen || offscreen.canvas.width !== w || offscreen.canvas.height !== h) {
      const oc = document.createElement('canvas');
      oc.width = w; oc.height = h;
      const ocx = oc.getContext('2d', { alpha: true });
      offscreen = { canvas: oc, ctx: ocx };
    }
    return offscreen;
  }

  function drawWeapons(ctx, weapons, scaleX, scaleY) {
    for (const weapon of weapons) {
      ctx.save();
      ctx.translate(weapon.x * scaleX, weapon.y * scaleY);

      if (weapon.type === 'gun') {
        // Draw pistol
        ctx.fillStyle = '#4a4a4a';
        ctx.fillRect(-3, -2, 6, 4);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(-1, -3, 2, 2);
        ctx.fillStyle = '#ffff00';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔫', 0, 6);
      } else if (weapon.type === 'grenade') {
        // Draw grenade
        ctx.fillStyle = '#2d5016';
        ctx.fillRect(-2, -3, 4, 6);
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(-1, -1, 2, 2);
        ctx.fillStyle = '#ffff00';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('💣', 0, 8);
        // Fuse countdown
        if (weapon.fuse < 120) {
          ctx.fillStyle = '#ff0000';
          ctx.font = '4px monospace';
          ctx.fillText(Math.ceil(weapon.fuse / 60), 0, -4);
        }
      } else if (weapon.type === 'sword') {
        // Draw sword
        ctx.strokeStyle = '#c0c0c0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(0, 4);
        ctx.stroke();
        ctx.fillStyle = '#ffd700';
        ctx.fillRect(-1, 4, 2, 2);
        ctx.fillStyle = '#ffff00';
        ctx.font = '6px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⚔️', 0, 10);
      }

      ctx.restore();
    }
  }

  function drawProjectiles(ctx, projectiles, scaleX, scaleY) {
    for (const proj of projectiles) {
      ctx.save();
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(proj.x * scaleX, proj.y * scaleY, 2, 0, Math.PI * 2);
      ctx.fill();

      // Bullet trail
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const trailLength = 8;
      const dx = proj.vx * trailLength;
      const dy = proj.vy * trailLength;
      ctx.moveTo(proj.x * scaleX, proj.y * scaleY);
      ctx.lineTo((proj.x - dx) * scaleX, (proj.y - dy) * scaleY);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawVehicles(ctx, vehicles, scaleX, scaleY) {
    for (const vehicle of vehicles) {
      ctx.save();
      ctx.translate(vehicle.x * scaleX, vehicle.y * scaleY);
      ctx.rotate(vehicle.angle);

      if (vehicle.type === 'car') {
        // Draw car body
        ctx.fillStyle = vehicle.driver ? '#ff4757' : '#3742fa';
        ctx.fillRect(-vehicle.width/2 * scaleX, -vehicle.height/2 * scaleY,
                    vehicle.width * scaleX, vehicle.height * scaleY);

        // Draw wheels
        ctx.fillStyle = '#2f3542';
        ctx.fillRect((-vehicle.width/2 + 1) * scaleX, (-vehicle.height/2 - 1) * scaleY, 2 * scaleX, 2 * scaleY);
        ctx.fillRect((vehicle.width/2 - 3) * scaleX, (-vehicle.height/2 - 1) * scaleY, 2 * scaleX, 2 * scaleY);
        ctx.fillRect((-vehicle.width/2 + 1) * scaleX, (vehicle.height/2 - 1) * scaleY, 2 * scaleX, 2 * scaleY);
        ctx.fillRect((vehicle.width/2 - 3) * scaleX, (vehicle.height/2 - 1) * scaleY, 2 * scaleX, 2 * scaleY);

        // Engine indicator
        if (vehicle.engineOn) {
          ctx.fillStyle = '#ffa502';
          ctx.beginPath();
          ctx.arc(0, -vehicle.height/2 * scaleY - 3, 2, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (vehicle.type === 'boat') {
        // Draw boat hull
        ctx.fillStyle = vehicle.driver ? '#ffa502' : '#2f3542';
        ctx.beginPath();
        ctx.ellipse(0, vehicle.height/4 * scaleY, vehicle.width/2 * scaleX, vehicle.height/2 * scaleY, 0, 0, Math.PI * 2);
        ctx.fill();

        // Draw boat top
        ctx.fillStyle = '#3742fa';
        ctx.fillRect(-vehicle.width/4 * scaleX, -vehicle.height/2 * scaleY,
                    vehicle.width/2 * scaleX, vehicle.height/3 * scaleY);

        // Engine indicator
        if (vehicle.engineOn) {
          ctx.fillStyle = '#ffa502';
          ctx.beginPath();
          ctx.arc(0, vehicle.height/2 * scaleY + 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }

      } else if (vehicle.type === 'plane') {
        // Draw plane body
        ctx.fillStyle = vehicle.driver ? '#ff6348' : '#ff4757';
        ctx.fillRect(-vehicle.width/2 * scaleX, -vehicle.height/2 * scaleY,
                    vehicle.width * scaleX, vehicle.height * scaleY);

        // Draw wings
        ctx.fillStyle = '#3742fa';
        ctx.fillRect(-vehicle.width * scaleX, -vehicle.height/4 * scaleY, vehicle.width/2 * scaleX, 1 * scaleY);
        ctx.fillRect(vehicle.width/2 * scaleX, -vehicle.height/4 * scaleY, vehicle.width/2 * scaleX, 1 * scaleY);

        // Draw tail
        ctx.fillRect(-1 * scaleX, -vehicle.height * scaleY, 2 * scaleX, vehicle.height/2 * scaleY);

        // Engine indicator
        if (vehicle.engineOn) {
          ctx.fillStyle = '#ffa502';
          ctx.beginPath();
          ctx.arc(vehicle.width/2 * scaleX + 2, 0, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Altitude indicator
        if (vehicle.altitude > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('↑', 0, -vehicle.height/2 * scaleY - 5);
        }
      }

      // Health bar
      if (vehicle.health < 100) {
        const barWidth = vehicle.width * scaleX;
        const barHeight = 3;
        const healthPercent = vehicle.health / 100;

        ctx.fillStyle = '#000000';
        ctx.fillRect(-barWidth/2, -vehicle.height/2 * scaleY - 8, barWidth, barHeight);

        ctx.fillStyle = healthPercent > 0.5 ? '#00ff00' : healthPercent > 0.25 ? '#ffff00' : '#ff0000';
        ctx.fillRect(-barWidth/2, -vehicle.height/2 * scaleY - 8, barWidth * healthPercent, barHeight);
      }

      ctx.restore();
    }
  }

  function savePNG() {
    // Temporarily render at native sim resolution to a temp canvas and save
    const temp = document.createElement('canvas');
    temp.width = simWidth; temp.height = simHeight;
    const tctx = temp.getContext('2d');
    const off = ensureOffscreen(simWidth, simHeight);
    tctx.drawImage(off.canvas, 0, 0);
    const url = temp.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'particle-sim.png';
    a.click();
  }

  return { draw, requestFullRedraw, savePNG };
}
