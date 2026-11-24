# 🍄 Mario Wonder Engine — 2.5D Prototype

> **Super Mario Bros. Wonder-Feel 2.5D Prototype**
> Hybrid 2D Raster Sprite Tilemap + 3D Rigged Skeletal Character Mesh

## Architecture

**Rendering:** 2D painted raster sprites (64×64 tile grid) + 3D rigged skeletal mesh (Three.js)
**Physics:** Custom swept AABB kinematic controller — zero rigidbodies, zero physics engines
**Simulation:** Fixed 60 Hz deterministic loop, decoupled from render frame rate
**Calibration:** Frame-by-frame measured kinematics from Super Mario Bros. Wonder

## Quick Start

```bash
cd mario-wonder-engine
npm install
npm run dev
```

Navigate to `http://localhost:3000`

## Controls

| Key | Action |
|-----|--------|
| ← → / A D | Move |
| Z / J | Jump |
| X / K | Run / Dash |
| C / L | Spin Twirl |
| ↓ / S | Crouch / Ground Pound |
| **SPACE** | Pause / Resume |
| **.** | Frame Step (paused) |
| **T** | Cycle Time Scale |
| **F3** | Telemetry HUD |
| **I** | Input Visualizer |
| **H** | Hotkey Legend |
| **G** | Grid Overlay |
| **1-5** | Switch Test Room |

## Project Structure

```
mario-wonder-engine/
├── public/
│   ├── models/          # mario.glb, luigi.glb (27 animations each)
│   ├── tilesets/         # Grassland_Tileset.png (1876×3230)
│   └── textures/         # Character PBR textures
├── src/
│   ├── engine/
│   │   ├── core/         # GameLoop, GameEngine
│   │   ├── physics/      # TileMap, CollisionSystem (swept AABB)
│   │   ├── input/        # InputManager (keyboard + gamepad + recording)
│   │   ├── rendering/    # 2D Canvas Renderer (3D via Three.js in Stage 8)
│   │   ├── audio/        # Procedural Web Audio synthesizer
│   │   └── camera/       # 2.5D dynamic camera controller
│   ├── game/
│   │   ├── player/       # PlayerController, PlayerState FSM
│   │   ├── config/       # MovementProfile (all kinematic constants)
│   │   ├── levels/       # Benchmark rooms, level data
│   │   ├── entities/     # Enemies, blocks, items (future)
│   │   └── powerups/     # Mushroom, Fire Flower (future)
│   ├── ui/
│   │   ├── hud/          # TelemetryHUD
│   │   ├── overlays/     # InputVisualizer, HotkeyLegend
│   │   ├── debug/        # Debug panels
│   │   └── panels/       # Live tuning (lil-gui integration)
│   ├── utils/            # MathUtils, hashing
│   └── tests/            # Headless verification suite
├── review/               # Stage review artifacts & velocity graphs
└── package.json
```

## Development Stages

| Stage | Focus |
|-------|-------|
| **1** | Foundation, 60 Hz loop, swept AABB, tile harness, UI shell |
| **2** | Ground locomotion, momentum HUD, audio/VFX |
| **3** | Two-phase jump, apex float, forgiveness |
| **4** | Advanced moves (spin, wall, ground pound) |
| **5** | Slopes, butt-slide, semisolids |
| **6** | 2D sprite environment, parallax, blocks |
| **7** | 2.5D camera, cinematography |
| **8** | 3D character (Three.js GLB), animation rig |
| **9** | Power-ups, combat, gameplay HUD |
| **10** | Master integration, Gauntlet benchmark |

## Specifications

- `01_TEN_STAGE_PROMPT_PACK.md` — Stage roadmap
- `02_QUICK_START_GUIDE.md` — Developer kickoff
- `03_3D_ASSETS_DOCUMENTATION.md` — GLB model architecture & 27 animation tracks
- `04_MASTER_MOVEMENT_SPEC.md` — Frame-by-frame kinematic targets
- `05_NOTES_STAGE_LOG.md` — Project memory & stage progression
- `06_TILESET_TECHNICAL_SPEC.md` — Atlas slicing, slope math, collision spec
