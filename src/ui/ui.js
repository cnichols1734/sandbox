export function initUI({ onSelectMaterial, onChangeBrush, onPlayPause, onStep, onClear, onSave, onToggleRain, onToggleSpawnMode, onToggleBombMode }) {
  // Material buttons (new class names)
  const materialButtons = Array.from(document.querySelectorAll('.material-btn'));
  const eraserButton = document.querySelector('.tool-btn.eraser');
  const spawnPersonBtn = document.getElementById('spawnPerson');
  const spawnBombBtn = document.getElementById('spawnBomb');
  const brushSlider = document.getElementById('brushSize');
  const brushValue = document.getElementById('brushSizeValue');
  const brushPreview = document.getElementById('brushPreview');
  const playPauseBtn = document.getElementById('playPause');
  const stepBtn = document.getElementById('step');
  const clearBtn = document.getElementById('clear');
  const saveBtn = document.getElementById('save');
  const rainBtn = document.getElementById('rain');
  const canvasOverlay = document.getElementById('canvasOverlay');

  function setActive(btn) {
    // Clear all active states
    for (const b of materialButtons) b.classList.remove('active');
    if (eraserButton) eraserButton.classList.remove('active');
    if (spawnPersonBtn) spawnPersonBtn.classList.remove('active');
    if (spawnBombBtn) spawnBombBtn.classList.remove('active');
    document.body.classList.remove('spawn-mode');
    document.body.classList.remove('bomb-mode');
    if (canvasOverlay) canvasOverlay.classList.remove('active');
    
    // Set new active
    if (btn) btn.classList.add('active');
  }

  // Material button handlers
  for (const btn of materialButtons) {
    btn.addEventListener('click', () => {
      setActive(btn);
      onSelectMaterial(btn.dataset.material);
      if (onToggleSpawnMode) onToggleSpawnMode(false);
    });
  }
  
  // Eraser button
  if (eraserButton) {
    eraserButton.addEventListener('click', () => {
      setActive(eraserButton);
      onSelectMaterial('erase');
      if (onToggleSpawnMode) onToggleSpawnMode(false);
    });
  }
  
  // Spawn Person button (People Playground style!)
  if (spawnPersonBtn) {
    spawnPersonBtn.addEventListener('click', () => {
      const isActive = spawnPersonBtn.classList.contains('active');
      setActive(null); // Clear material selection
      
      if (!isActive) {
        spawnPersonBtn.classList.add('active');
        document.body.classList.add('spawn-mode');
        if (canvasOverlay) canvasOverlay.classList.add('active');
        if (onToggleSpawnMode) onToggleSpawnMode(true);
        if (onToggleBombMode) onToggleBombMode(false);
      } else {
        if (onToggleSpawnMode) onToggleSpawnMode(false);
      }
    });
  }
  
  // Spawn Bomb button
  if (spawnBombBtn) {
    spawnBombBtn.addEventListener('click', () => {
      const isActive = spawnBombBtn.classList.contains('active');
      setActive(null); // Clear material selection
      
      if (!isActive) {
        spawnBombBtn.classList.add('active');
        document.body.classList.add('bomb-mode');
        if (canvasOverlay) {
          canvasOverlay.classList.add('active');
          canvasOverlay.querySelector('.overlay-text').textContent = 'Click anywhere to place a bomb!';
        }
        if (onToggleBombMode) onToggleBombMode(true);
        if (onToggleSpawnMode) onToggleSpawnMode(false);
      } else {
        if (onToggleBombMode) onToggleBombMode(false);
        if (canvasOverlay) {
          canvasOverlay.querySelector('.overlay-text').textContent = 'Click anywhere to spawn a person';
        }
      }
    });
  }

  // Default selection: sand
  const sandBtn = materialButtons.find(b => b.dataset.material === 'sand');
  if (sandBtn) {
    setActive(sandBtn);
    onSelectMaterial('sand');
  }

  // Rain toggle
  if (rainBtn) {
    rainBtn.addEventListener('click', () => {
      const enabled = onToggleRain();
      rainBtn.classList.toggle('active', enabled);
    });
  }

  // Brush slider
  function updateBrushPreview() {
    const size = parseInt(brushSlider.value, 10);
    brushValue.textContent = size;
    
    // Update preview circle size
    if (brushPreview) {
      const minSize = 16;
      const maxSize = 40;
      const scale = minSize + (size / 40) * (maxSize - minSize);
      brushPreview.style.width = `${scale}px`;
      brushPreview.style.height = `${scale}px`;
    }
    
    onChangeBrush(size);
  }
  
  brushSlider.addEventListener('input', updateBrushPreview);
  updateBrushPreview();

  // Play/Pause button
  function updatePlayPauseButton(running) {
    const icon = playPauseBtn.querySelector('.btn-icon');
    const label = playPauseBtn.querySelector('.btn-label');
    
    if (running) {
      if (icon) icon.textContent = '⏸';
      if (label) label.textContent = 'PAUSE';
      playPauseBtn.classList.remove('paused');
    } else {
      if (icon) icon.textContent = '▶';
      if (label) label.textContent = 'PLAY';
      playPauseBtn.classList.add('paused');
    }
  }
  
  playPauseBtn.addEventListener('click', () => {
    const running = onPlayPause();
    updatePlayPauseButton(running);
  });
  
  stepBtn.addEventListener('click', onStep);
  clearBtn.addEventListener('click', onClear);
  saveBtn.addEventListener('click', onSave);

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === 'INPUT') return;
    
    if (e.key === ' ') { 
      e.preventDefault(); 
      const running = onPlayPause(); 
      updatePlayPauseButton(running); 
    }
    if (e.key === 's') { 
      onSelectMaterial('sand'); 
      setActive(materialButtons.find(b => b.dataset.material === 'sand')); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 'w') { 
      onSelectMaterial('water'); 
      setActive(materialButtons.find(b => b.dataset.material === 'water')); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 't') { 
      onSelectMaterial('stone'); 
      setActive(materialButtons.find(b => b.dataset.material === 'stone')); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 'c') { 
      onSelectMaterial('concrete'); 
      setActive(materialButtons.find(b => b.dataset.material === 'concrete')); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 'e') { 
      onSelectMaterial('erase'); 
      if (eraserButton) setActive(eraserButton); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 'o') { 
      onSelectMaterial('oil'); 
      setActive(materialButtons.find(b => b.dataset.material === 'oil')); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 'f') { 
      onSelectMaterial('fire'); 
      setActive(materialButtons.find(b => b.dataset.material === 'fire')); 
      if (onToggleSpawnMode) onToggleSpawnMode(false); 
    }
    if (e.key === 'r') { 
      const enabled = onToggleRain(); 
      if (rainBtn) rainBtn.classList.toggle('active', enabled); 
    }
    if (e.key === '[') { 
      const v = Math.max(1, parseInt(brushSlider.value, 10) - 1); 
      brushSlider.value = v; 
      brushSlider.dispatchEvent(new Event('input')); 
    }
    if (e.key === ']') { 
      const v = Math.min(parseInt(brushSlider.max, 10), parseInt(brushSlider.value, 10) + 1); 
      brushSlider.value = v; 
      brushSlider.dispatchEvent(new Event('input')); 
    }
    // P for Person spawn mode!
    if (e.key === 'p') { 
      if (spawnPersonBtn) {
        spawnPersonBtn.click();
      }
    }
    // B for Bomb mode!
    if (e.key === 'b') {
      if (spawnBombBtn) {
        spawnBombBtn.click();
      }
    }
  });
  
  // Expose functions to deactivate modes from outside
  return {
    deactivateSpawnMode: () => {
      if (spawnPersonBtn) spawnPersonBtn.classList.remove('active');
      document.body.classList.remove('spawn-mode');
      if (canvasOverlay) canvasOverlay.classList.remove('active');
    },
    deactivateBombMode: () => {
      if (spawnBombBtn) spawnBombBtn.classList.remove('active');
      document.body.classList.remove('bomb-mode');
      if (canvasOverlay) canvasOverlay.classList.remove('active');
    }
  };
}
