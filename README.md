# Infinite Canvas

An infinite 3D canvas of floating images and color cards, navigable in all directions.

## Features

- Infinite chunk-based 3D space with depth fog and depth-of-field
- Fade-in intro followed by auto-scrolling with ease-in motion
- Keyboard navigation — arrow keys change scroll direction; any key takes full control
- Mix of images and colorful cards with randomised aspect ratios and corner radii
- Two modes: **Default** (images + color cards) and **Minimal** (color cards only)
- Runtime controls via lil-gui: background, fog, DoF, scroll speed, scale, density, spread, colors
- PNG export

## Getting started

```bash
npm install
npm run dev
```

## Adding images

Place images in `public/images/` and add entries to `src/artworks/manifest.json`:

```json
{ "url": "/images/filename.jpg", "width": 1920, "height": 1080 }
```

## Build & deploy

```bash
npm run build   # output in dist/
```

Pushes to `main` deploy automatically to GitHub Pages via the included Actions workflow.

## Stack

React 19 · TypeScript · React Three Fiber · Three.js · Vite

## Credits

Based on [edoardolunardi/infinite-canvas](https://github.com/edoardolunardi/infinite-canvas) — original concept and article on [Codrops](https://tympanus.net/codrops/?p=106679).
