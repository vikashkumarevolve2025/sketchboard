# Sketchboard

A personal, hand-drawn style whiteboard inspired by [Excalidraw](https://excalidraw.com).
It runs entirely in your browser. There's no account and no server, and your drawing
is saved to local storage as you go.

This is an original implementation, not a fork. Excalidraw is MIT-licensed, so its
source was a useful reference for how things should feel.

## Features

- Infinite canvas with pan (Space + drag, wheel, Hand tool, two-finger drag) and zoom
  (Ctrl + wheel, trackpad pinch, touch pinch)
- Tools: selection, rectangle, diamond, ellipse, arrow, line, freehand pen, text and eraser
- Hand-drawn rendering via [Rough.js](https://roughjs.com), with pressure-aware pen
  strokes via [perfect-freehand](https://github.com/steveruizok/perfect-freehand)
- Select, marquee-select, move, resize, rotate, nudge, duplicate (Ctrl+D or Alt + drag)
  and delete
- Edit line and arrow endpoints, plus click-to-place multi-point lines
- Styles: stroke and background colour, fill (hachure, cross-hatch, solid), stroke width,
  stroke style, sloppiness, sharp or round edges, arrowheads, opacity, font size,
  font family and text alignment
- Group and ungroup, and layer ordering
- Undo and redo
- Copy, cut and paste, including pasting plain text and Excalidraw clipboard data
- Save and open `.sketchboard` files. It also opens `.excalidraw` files.
- Export to PNG or SVG (fonts embedded), or copy a PNG to the clipboard
- Dark mode, optional grid with snapping, and canvas background colours
- Keyboard shortcuts for everything. Press `?` in the app to see them.

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

## Deploying

The workflow in `.github/workflows/deploy.yml` publishes `main` to GitHub Pages. To turn
it on, go to **Settings → Pages** in the repo and set **Source** to **GitHub Actions**.

## Project layout

| File | What it does |
| --- | --- |
| `src/App.tsx` | Editor state, pointer and keyboard interaction, and layout |
| `src/render.ts` | Canvas rendering, rough.js shape cache, and PNG/SVG export |
| `src/element.ts` | Element model helpers (create, update, normalise, measure text) |
| `src/geometry.ts` | Coordinate transforms, bounds and rotation maths |
| `src/hit.ts` | Hit-testing and marquee selection |
| `src/selection.ts` | Selection frame, transform handles and cursors |
| `src/storage.ts` | Local storage, file save/open, and `.excalidraw` import |
| `src/components/` | Toolbar icons, properties panel, and export/help dialogs |

## Roadmap

- Arrows that bind to shapes and follow them when moved
- Images and a personal shape library
- Offline install as a PWA
- Optional live collaboration
