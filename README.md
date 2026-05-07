# Portfolio Game

`portfolio-game` is an interactive developer portfolio built as a 3D FPS-style experience.
Instead of scrolling a classic portfolio page, visitors move inside a cyberpunk city, discover stations, and open your profile content (About, Experience, Education, Projects, Contact, Location).

## What This Project Does

- Renders a real-time 3D world with `Three.js`
- Uses React UI overlays for menus, HUD, modals, and flow control
- Stores game/UI state with `Zustand`
- Opens an embedded map view for location and education entries (MapLibre)
- Turns your portfolio into gameplay: shoot stations to unlock and read content

## Tech Stack

- React 18
- TypeScript
- Vite
- Three.js
- Zustand
- MapLibre GL

## Controls

- `W A S D` or arrow keys: move
- `Shift`: sprint
- `Space`: jump
- Mouse: look around
- Left click: shoot / interact
- `Esc`: open pause flow or exit active modal context

## Project Structure

- `src/engine/GameEngine.ts`: core 3D game logic, movement, combat, world, minimap
- `src/App.tsx`: main app flow, overlays, start/pause/death handling
- `src/data/portfolio.ts`: editable portfolio content and station definitions
- `src/components/`: UI components (HUD, modals, loader, start screen, pause menu)

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start dev server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   ```
4. Preview production build:
   ```bash
   npm run preview
   ```

## Customize Your Portfolio Data

Edit:

- `src/data/portfolio.ts`

Update:

- `PORTFOLIO.name`, `tagline`, `about`
- `experience`, `education`, and `projects` entries
- `contact` links and location
- `STATIONS` labels/colors/positions if you want a different map layout

## Notes

- The repo includes `.gitignore` to avoid pushing generated/local files (`node_modules`, `dist`, logs, local env files).
- `public/models/ferrari.glb` is used as a world asset.
