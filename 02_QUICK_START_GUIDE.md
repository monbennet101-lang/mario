# 🚀 Super Mario 2.5D Prototype: Developer Drop Kit & Kickoff Pack

This document contains **everything you should drop to the agent** to kick off development of the 2.5D Mario prototype, followed by the complete step-by-step development protocol.

---

## 📦 What to Drop for Turn 1 (Kickoff Prompt)

Copy and paste the prompt below directly into the AI agent to begin the project.

```text
You are beginning development on the Super Mario 2.5D "Wonder Feel" Prototype.

PRIOR WORK & GROUNDING:
- Standing Architecture & Working Rules: Read `CLAUDE.md`.
- Master Movement Mechanics & Kinematic Targets: Read `MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md`.
- Tileset Technical Specifications: Read `tileset_technical_spec.md`.
- 3D Model Architecture & 27 Animation Tracks: Read `web_assets/README.md`.
- Step-by-Step Roadmap: Read `Mario-Feel Prototype 10-Stage Prompt Pack.md`.

READY ASSETS IN REPO:
- 3D Mario Model (GLB with 27 animations): `web_assets/models/mario.glb`
- 3D Luigi Model (GLB with 27 animations): `web_assets/models/luigi.glb`
- 2D Grassland Tileset Atlas (64x64px grid): `Wii U - New Super Mario Bros. U _ New Super Luigi U - Tilesets (New Super Mario Bros. U) - Grassland Tileset.png`
- Working 3D Animation Viewer: `web_assets/test_viewer.html`

YOUR MANDATE FOR TURN 1:
1. Review the files above to understand the 2.5D hybrid architecture (2D raster sprite tilemap + 3D skeletal mesh with 20° 3/4 camera yaw tilt, fixed 60 Hz kinematic simulation step decoupled from rendering).
2. Set up the development project harness (e.g. Vite + Three.js or lightweight modern WebGL/HTML5 ES module structure with zero bloat). Ensure `web_assets` and the tileset atlas are properly served.
3. Implement STAGE 1 of the prompt pack:
   - Fixed 60 Hz accumulator loop with render interpolation.
   - Swept AABB kinematic character controller against a 64x64px tilemap (Hitbox 0.80 x 1.80 tiles, 0.08-tile foliage inset).
   - Input layer (Keyboard & Gamepad API) and deterministic input recorder/replayer.
   - 5 benchmark rooms (Runway, Gap Ladder, Jump Shaft, Wall Shaft, Slope Ramps).
   - Interactive UI/UX Shell: 16:9 responsive canvas, glassmorphic telemetry HUD ([F3]), live input visualizer ([I]), hotkey legend card ([H]), and collapsible live-tuning panel (lil-gui).
   - Automated headless tests proving zero jitter at rest, flush wall collision, tunneling prevention, and determinism.
4. Launch the local dev server and provide the live playtest URL.
5. Create `NOTES.md` logging your setup, measured kinematic values, and the 8-point Adversarial Feel Review.
```

---

## 🗂️ Verified Assets & Technical References

| File / Asset | Relative Path | Purpose |
| :--- | :--- | :--- |
| **Architectural Rules** | `CLAUDE.md` | Non-negotiable engine rules, coordinate system, kinematics, UI/UX standards |
| **10-Stage Prompt Pack** | `Mario-Feel Prototype 10-Stage Prompt Pack.md` | Stages 1 through 10 with kinematics, UI/UX requirements, and exit criteria |
| **Kinematic Spec** | `MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md` | Frame-by-frame measured velocities, accelerations, and timings from Wonder |
| **Tileset Tech Spec** | `tileset_technical_spec.md` | 64×64 px atlas slicing, 10px borders, slope math, autotiling formulas |
| **Mario 3D GLB** | `web_assets/models/mario.glb` | Complete Mario mesh + 27 animations + embedded PBR textures (~682 KB) |
| **Luigi 3D GLB** | `web_assets/models/luigi.glb` | Complete Luigi mesh + 27 animations + embedded PBR textures (~685 KB) |
| **Grassland Tileset** | `Wii U - New Super Mario Bros. U _ New Super Luigi U - Tilesets (New Super Mario Bros. U) - Grassland Tileset.png` | 1876×3230 px master PNG atlas |
| **3D Asset Reference** | `web_assets/README.md` | Socket alignment fix, glTF track list, and Three.js state machine code |
| **Animation Viewer** | `web_assets/test_viewer.html` | Working Three.js test viewer demonstrating all 27 animations |

---

## 🕹️ Step-by-Step Prompting Workflow

To guarantee high quality without code drift or hallucination:

```
[Drop Kickoff Prompt + Stage 1]
         │
         ▼
[Agent Builds & Runs Headless Tests]
         │
         ▼
[You Playtest 3–5 min in Browser using HUD & Live Tuning Panel]
         │
         ▼
[Paste any tactile notes under Stage 2 prompt]
         │
         ▼
[Repeat sequentially for Stages 2 through 10]
```

### Hotkeys Built into the Prototype:
- `[F3]`: Toggle Glassmorphic Telemetry HUD ($v_x, v_y$, state flags, velocity curve graph).
- `[I]`: Toggle Live-Input Visualizer overlay (on-screen gamepad/keyboard keycaps).
- `[H]`: Toggle Hotkey Legend & Help Card.
- `[Space]`: Pause / Resume simulation.
- `[.]`: Step simulation by exactly 1 frame (when paused).
- `[T]`: Toggle Slow-Motion (1x -> 0.5x -> 0.25x -> 2.0x).
- `[1]`–`[5]`: Instant Room Teleport (Runway, Gap Ladder, Jump Shaft, Wall Shaft, Slopes).
- `[C]`: Instant Hot-Swap Character between Mario and Luigi (unlocked in Stage 8).
