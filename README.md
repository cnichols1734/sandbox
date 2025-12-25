# Particle Simulator (Falling Sand)

A fast, pixel-style falling sand and fluid simulator that runs in modern browsers.

## Features

- Sand, water, stone, concrete materials
- Material picker and eraser
- Adjustable brush size
- Play/Pause, Step, Clear, Save PNG
- High-DPI aware rendering, smooth input, deterministic fixed-step sim

## Local Run

This is a static site. You can open `index.html` directly, or serve it locally for correct module loading and cache headers:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000
```

Or using Node:

```bash
npx http-server -p 8000 -c-1
```

## Deploy to GitHub Pages

1. Commit the repository contents.
2. Push to GitHub.
3. In the repo settings → Pages, set Source: `Deploy from a branch`, Branch: `main` (or default), folder: `/root`.
4. Save. Your site will be available at `https://<your-username>.github.io/<repo-name>/`.

No build step is required.

## Controls

- Click/drag to paint selected material
- E to select Eraser
- S: Sand, W: Water, T: Stone, C: Concrete
- Space: Play/Pause, [: Decrease brush, ]: Increase brush
- Step, Clear, Save via toolbar

## Tech

- Vanilla JS modules
- Canvas 2D with offscreen buffer and nearest-neighbor scaling
- Fixed-step cellular update loop

## Notes

- Simulation resolution defaults to 320×180 (upscaled). Increase in `src/main.js` for higher fidelity (costs CPU).
- Rendering adds subtle per-cell color jitter to avoid flat colors.

