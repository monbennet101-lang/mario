# UI/UX Audit — Phase 0 (`docs/UI_AUDIT.md`)

*Compiled: 2026-11-21 · Source of truth: `Mario-Style UI UX Design Spec.md`*

---

## 1. Existing Screens & HUD Elements Inventory

| # | Element / Screen | Owning File(s) | Visual Description | Game Events / State Read |
|---|---|---|---|---|
| 1 | **Minimalist Top-Bar HUD** (`DiegeticHUD`) | `mario-wonder-engine/src/ui/hud.js`, `src/index.css` | Dark translucent single-row bar top-left showing Form circle (`S/M/F`), Cap icon + `x3` lives, rotating Gold Shard + `00/100`, 3 Star Medallion circular sockets, `COURSE 1-1` + Act tag, countdown timer (`300s`, amber `<50s`), `CLEAR!` pill. | Polls `engine.subscribeUITick` -> `player.powerUpForm`, `collectibles.lives`, `collectibles.shardCount`, `collectibles.getCourseSockets()`, `currentRoom`, `levelEngine.currentActId`, `timerSeconds`, `levelKit.courseCleared`. |
| 2 | **Legacy Bottom-Left HUD** (`WonderGameplayHUD`) | `mario-wonder-engine/src/ui/hud/WonderGameplayHUD.jsx` | Unused in `App.jsx` (superseded by `hud.js`), kept for older tests. Bottom-left strip with form, coins, score, time, lives, top-left Kishōtenketsu chip. | Polls `engine.subscribeUITick` -> `player`, `levelKit`, `combat`, `levelEngine`. |
| 3 | **Action Callout Banner** (`ActionBannerHUD`) | `mario-wonder-engine/src/ui/hud/ActionBannerHUD.jsx` | Top-centre translucent toast pill surfacing transient physics moves (`SPIN JUMP!`, `WALL SLIDE`, `GROUND POUND!`, `TWIST HERALD`, etc.). | Polls `engine.subscribeUITick` -> `player.events`, `levelKit.events`, `combat.events`, `props.events`, `levelEngine.events`. |
| 4 | **Speedometer HUD** (`SpeedometerHUD`) | `mario-wonder-engine/src/ui/hud/SpeedometerHUD.jsx` | Bottom-right technical velocity bar with 8 chevrons and tier label (`IDLE`/`WALK`/`RUN`/`SPRINT`/`MAX DASH`). | Polls `engine.subscribeUITick` -> `player.vel.x`, `player.speedTier`, `player.state`. |
| 5 | **Lifecycle Overlays** (`GameLifecycleOverlays`) | `mario-wonder-engine/src/ui/overlays/GameLifecycleOverlays.jsx` | Dark slate card modals over `rgba(7,11,25,0.80–0.94)` scrim for: `TITLE_SCREEN` (Vanguard/Zephyr toggle, Start World 1, Boss Sanctum), `LEVEL_INTRO`, `PAUSE_MENU` (Resume, Restart Stage, Return to Title), `PLAYER_DEATH_RESPAWN`, `GAME_OVER`, `STAGE_CLEAR` / World Victory. | React props from `App.jsx` via `engine.onStateChange` -> `lifecycle.state`, `combat.score`, `collectibles.totalShards`, `collectibles.totalMedallionsCollected`, `combat.lives`, `lifecycle.campaignClearTimeSec`. |
| 6 | **Controller Hotplug Toast** (`ControllerToast`) | `mario-wonder-engine/src/ui/overlays/ControllerToast.jsx` | Top-centre dark toast on gamepad connect/disconnect/profile switch. | `engine.input.hardware.onToast`. |
| 7 | **Bottom Control Hint Strip** | `mario-wonder-engine/src/App.jsx` (`.mwe-bottom-hint`) | Small centered monospace keyboard/DualShock 4 control strip at bottom edge. | `controllerStatus.effectiveProfile`. |
| 8 | **Developer Command Drawer** (`DevCommandMenu`) | `mario-wonder-engine/src/ui/overlays/DevCommandMenu.jsx`, `menuModel.js` | Top-right `Menu` button opening 3-tab drawer (Rooms, Sim/Feel, Tools). | `engineRef`, React toggle states. |
| 9 | **Developer Panels & Modals** | `TelemetryHUD.jsx`, `InputVisualizer.jsx`, `TuningPanel.jsx`, `PoseInspectorPanel.jsx`, `HotkeyLegend.jsx`, `VerificationReportModal.jsx`, `EnemyGalleryModal.jsx`, `LevelAuditModal.jsx` | Dev/QA overlays (hidden by default; opened via F3/I/U/H/F7/F8/F9 or Dev Menu). | `engine.subscribeUITick`, `engine.onStateChange`. |

---

## 2. Gap Table vs. Spec Section 4 Component Library

| Spec Component (§4) | Current Equivalent | Verdict | Notes & Gaps |
|---|---|---|---|
| **1. CounterChip** | Shard span inside `hud.js` | **Rebuild** | Needs tokenised rounded chunky chip, fixed-width tabular numerals (`>= 5%` viewport height), 250–400ms roll animation, 120% pop settle (150ms), max clamp (999 / 100), icon + colour semantics (gold shards, purple Prism Petals), all 7 interactive/visual states, sound hook. |
| **2. LifeMeter** | Form circle (`S`/`M`/`F`) in `hud.js` | **New** | Spec requires wedge-based LifeMeter (3 base wedges + expandable bonus ring in distinct green colour), damage shake + single pulse, one-hit low-health flash, paired with shape/icon semantics. |
| **3. LivesBadge** | Cap icon + `x3` in `hud.js` | **Rebuild** | Needs expressive character portrait badge + tabular count (cap 99), shared-lives multiplayer variant, 1-UP pop feedback, all 7 states. |
| **4. CollectibleTracker** | 3 Star Medallion sockets in `hud.js` | **Rebuild** | Needs 3 slots with **empty**, **collected**, and **ghosted-from-checkpoint** (translucent banked-but-uncompleted) states, pop animation, sound hook. |
| **5. Timer** | Timer span in `hud.js` | **Rebuild** | Existing warns at `<50s` amber; spec requires **warning below 100s** (red + pulse + non-colour glyph), optional final-10s beep hook, **expired** state, and **optional/hidden mode** for timerless courses. |
| **6. ReserveItemBox** | *None* | **New** | Stored power-up/item frame (`empty`, `stored`, `activate` press/hotkey), dedicated button/touch trigger. |
| **7. PauseMenu** | `PAUSE_MENU` in `GameLifecycleOverlays.jsx` | **Rebuild** | Must open/close instantaneously (`<100ms`) with one button, dim world without mutating state, display course collectible status (3 Star Medallion slots + Shards + Petals + active Charm), consistent confirm/cancel positions, wrapped focus. |
| **8. WorldMapNode & MapHUD** | *None* | **New** | Free-navigation World 1 map (`1-1` through `1-4` + Outpost Shop node) with node states (`locked`, `new/flashing`, `cleared`, `perfect`), focused course name & status chips, path-unlock animation, MapHUD bar. |
| **9. ResultsScreen** | `STAGE_CLEAR` in `GameLifecycleOverlays.jsx` | **Rebuild** | Needs animated score/shard/petal/time tally roll, Star Medallion display, multiplayer ranking + crown bonus carry-over, clear primary Next Course / Map CTA. |
| **10. Shop and Loadout** | *None* | **New** | Calm pre-play Prism Outpost Shop & Stride Charm Loadout: item grid, detail pane showing price & exact effect *before* confirmation, purchase with Prism Petals, visible equip state, assist charms (never labelled "easy mode"). |
| **11. Toast and Prompt** | `ControllerToast.jsx` + `ActionBannerHUD.jsx` | **Rebuild** | Tokenised Toast (unlock notice, checkpoint boon, controller hotplug) & Prompt (contextual button hint matching active keyboard/gamepad profile). |
| **12. Transition** | Canvas iris/curtain wipe + `LEVEL_INTRO` | **Rebuild** | Tokenised Course Intro Card + wipe/fade transitions with hard `<= 500ms` input-blocking budget. |
| **13. TitleScreen and FileSelect** | `TITLE_SCREEN` in `GameLifecycleOverlays.jsx` | **Rebuild** | Calm animated Title Screen with bespoke Prism Crest motif, 3 Save File slots (auto-save + clear), Character Select (1–4P Vanguard/Zephyr/Ember/Tide), Text Scale & High-Contrast accessibility settings, UI Gallery launcher. |
| **Dev Tools (`DevCommandMenu`, Telemetry, etc.)** | Existing dev overlays | **Keep** | Kept intact behind dev menu & hotkeys (`F3`, `I`, `U`, `H`, `F7–F9`); non-intrusive toggle button adds `ui.v2` flag & UI Gallery shortcut. |

---

## 3. Framework & Architecture Facts

- **UI Stack**: React 19 (`react` + `react-dom` 19.3.1) layered over a single full-viewport `<canvas>` (2D tilemap/sprites + Three.js WebGL 3D character rig composited cleanly). Bundled with Vite 8 (`vite.config.js` outputs self-contained IIFE `dist/bundle.js` + `dist/assets/style.css`, zero external CDNs, `< 1.5 MB` uncompressed release budget enforced by `stage21.test.js`).
- **Resolution & Scaling**: Full-bleed responsive container (`100vw x 100dvh`), canvas dynamically fits viewport with `ResizeObserver` and aspect framing. All v2 HUD measurements use viewport-relative CSS tokens (`4vh` safe margin band, `clamp(...)` display numerals scaled by user `--ui-text-scale`).
- **Input System**:
  - `InputManager.js`: Keyboard (WASD/Arrows, Z/J Jump, X/K Run/Fire, E Spin, Escape/P Pause, Tab/R Reserve Item) + Web Gamepad API with DualShock 4 / DualSense / Standard auto-detection (`GamepadHardware.js`).
  - `GamepadMenuNavigator.js`: 2D spatial focus navigation with focus wrapping (`findNextSpatialTarget`), Cross/Enter confirm, Circle/Escape cancel, L1/R1 tab cycling.
- **Game State Exposure**:
  - `engine.combat`: `lives` (default 3, cap 99), `score`, `enemies`, `events` (`damage`, `powerUp`, `stomp`, etc.)
  - `engine.collectibles`: `shardCount` (0..99 rollover to +1 life), `totalShards`, `medallionsByCourse` (3 booleans per course), `events` (`shardCollected`, `medallionCollected`, `oneUpFromShards`)
  - `engine.player`: `powerUpForm` (`small` / `super` / `fire`), `characterId`, `state`, `pos`, `vel`
  - `engine.levelKit`: `coinsCollected`, `courseCleared`, `flagpole`, `events` (`coinCollect`, `flagpole`)
  - `engine.levelEngine`: `currentActId`, `starMedallions`, `events`
  - `engine.timerSeconds`: integer seconds countdown (starts at 300s)
  - `engine.lifecycle`: `GameLifecycleController` (7 states + deterministic wipe)
  - **Missing hooks added for UI v2**: `engine.uiBus` (`UIEventBus`), `engine.health` / `engine.maxHealth` / `engine.bonusHealth` (3 base + 3 Life-Up wedges synced to form/damage), `engine.prismPetals` (special purple currency, cap 999), `engine.reserveItem` + `activateReserveItem()`, `engine.checkpointState` (tracks banked/ghosted Star Medallions per course).

---

## 4. Event Bus Architecture (`src/engine/core/UIEventBus.js`)

Previously no formal event bus existed; HUD components polled mutable arrays inside `engine.subscribeUITick`. We introduce a minimal, deterministic, zero-allocation-in-steady-state `UIEventBus` attached to `engine.uiBus` emitting:

- `coinCollected` — `{ amount, shardCount, totalShards, worldX, worldY, screenX, screenY, currency: 'gold' | 'petal' }`
- `specialCollected` — `{ slotIndex, totalCollected, worldX, worldY, screenX, screenY, courseCode, kind: 'medallion' | 'petal' }`
- `damageTaken` — `{ hp, maxHp, bonusHp, form, defeated, worldX, worldY }`
- `lifeLost` — `{ livesRemaining, penaltyCoins, courseCode }`
- `lifeGained` — `{ lives, source }`
- `checkpointReached` — `{ checkpointId, courseCode, boonGranted, bankedMedallions, worldX, worldY }`
- `courseCleared` — `{ courseCode, score, shards, petals, medallions, clearTimeSec, isWorldVictory, flagpoleHeightRatio }`
- `pauseToggled` — `{ paused, courseCode, timestampMs }`
- `timerWarning` — `{ secondsRemaining, isFinalTen, expired }`
- `reserveItemChanged` — `{ item, action: 'stored' | 'activated' | 'cleared' }`
- `toastRequested` — `{ kind, title, message, buttonHint }`
