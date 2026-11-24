# Mario-Feel Prototype: 10-Stage Prompt Pack (UI/UX Production Master v3.0)

**Document Version:** 3.0.0 (UI/UX Integrated Production Master)  
**Target Architecture:** Hybrid 2.5D Web Engine (2D Raster Sprite Tilemap + 3D Rigged Skeletal Character Mesh)  
**Calibrated Stack:** HTML5 / WebGL / Three.js + Vite (or ES Modules), Fixed 60 Hz Kinematic Controller  
**Ready Assets:** `web_assets/models/mario.glb` & `luigi.glb` (27 baked animations), `Wii U ... Grassland Tileset.png` (64×64 px grid)  
**Reference Specs:** `CLAUDE.md`, `MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md`, `tileset_technical_spec.md`, `web_assets/README.md`

---

## Developer Guide: How to Use This Prompt Pack

1. Ensure `CLAUDE.md` is present in the workspace root.
2. Deliver the prompts to the agent **one stage at a time** in strict sequential order.
3. After the agent completes each stage:
   - Run the headless test suite to verify kinematic criteria.
   - Boot the local server (`npm run dev` or `python -m http.server 8080`) and playtest for 3–5 minutes with the debug overlay and UI tools enabled.
   - Append any tactile feedback under `PLAYTEST NOTES` at the bottom of the next stage prompt.
4. UI/UX is treated as a **first-class citizen in every single stage**: each prompt mandates both physical mechanics and player/developer UX (visual feedback, responsive HUD, audio synthesis, telemetry gauges, and live control ergonomics).

---

## Stage 1: Foundation, Kinematic Controller, 64px Tile Harness & Interactive UI/UX Shell

```text
STAGE 1 of 10: FOUNDATION, KINEMATIC CONTROLLER, 64px TILE HARNESS & INTERACTIVE UI/UX SHELL

Read CLAUDE.md and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md.
Goal: Establish the fixed 60 Hz simulation loop, swept AABB physics on a 64x64px tile grid, and a sleek, interactive developer/playtester UI/UX shell.

BUILD — CORE ENGINE & PHYSICS:
1. Fixed 60 Hz Simulation Loop:
   - Accumulator with spiral-of-death clamp (max 5 physics ticks per render frame; Delta t = 1/60s).
   - Render state interpolation: renderPos = lerp(prevSimPos, currentSimPos, alpha).
   - Time controls: Pause [Space], frame-step [.], slow-motion toggle (0.25x / 0.5x / 1.0x / 2.0x) [T].
2. Input Layer (Keyboard & Gamepad API):
   - Keyboard: Arrows / WASD, Z/J (Jump), X/K (Run/Dash), C/L (Spin), Down/S (Crouch/Pound), Esc/P (Pause).
   - Gamepad: Left stick + D-pad, A/B (Jump), X/Y (Run), Trigger/Shoulder (Spin), Start (Pause). Deadzone = 0.20.
   - Expose: held, pressedThisFrame, releasedThisFrame, framesHeld.
3. Deterministic Input Recorder & Replayer:
   - Frame-by-frame input serialization to JSON; zero-drift deterministic replay playback.
4. Tilemap Collision Harness:
   - 64x64px grid cells matching Grassland Tileset format (1 tile = 1.0 world unit = 64px).
   - Tile types: Empty (0), Solid (1), One-Way Semisolid (2), Slope 45° (3), Slope 26.5° (4), Hazard (5).
   - Custom swept AABB character collision: move X, resolve against tiles; move Y, resolve against tiles.
   - Hitbox: 0.80 tiles (51.2px) wide x 1.80 tiles (115.2px) tall.
   - Sub-tile foliage inset: Feet sink 0.08 tiles (5px) into grass top collision.
5. Benchmark Rooms (loadable via hotkeys [1]-[5]):
   - Room 1: Runway (60 flat tiles with distance markers every 5 tiles).
   - Room 2: Gap Ladder (pits from 1 to 8 tiles wide).
   - Room 3: Jump Shaft (14 tiles high with 1-tile ledges).
   - Room 4: Wall Shaft (3 tiles wide x 14 tiles high).
   - Room 5: Slope Ramps (45° and 26.5° inclines).

BUILD — UI/UX & PLAYTESTER ERGONOMICS:
1. Responsive Viewport Canvas:
   - 16:9 aspect ratio letterbox/pillarbox container centered on screen with clean dark framing.
   - Smooth resize handling and HiDPI/Retina display scaling support.
2. Glassmorphic Telemetry HUD ([F3] toggle):
   - Real-time FPS and simulation delta drift meter.
   - Kinematic readouts: X, Y position, vx, vy (tiles/s and px/f), grounded state, current state machine tag.
   - Scrolling velocity graph (last 120 frames of vx and vy curves).
3. Interactive Input Visualizer Overlay ([I] toggle):
   - On-screen controller/keyboard graphic in lower corner showing live D-Pad, Jump, Run, Spin buttons.
   - Keycap actuation highlights with instantaneous color glow upon press.
4. Hotkey Legend & Quick Help Card ([H] toggle):
   - Clean, dismissible popover card explaining all gameplay keys, debug hotkeys, and test room triggers.
5. Collapsible Live Tuning Panel (lil-gui / tweakpane):
   - Organized folders for Locomotion, Jump, Forgiveness, and Presentation.
   - Live two-way hot-reloading sliders for every variable in player.config.js.
   - "Reset to Defaults" and "Export Config to Clipboard" buttons.
6. Headless Test Suite:
   - Automated CLI test runner (npm test or standalone node/browser harness) asserting state hashes.

EXIT CRITERIA:
- Character dropped on flat floor settles at Y = 0.0000 (tolerance < 0.0001) with 0 jitter over 600 frames.
- Pushing against solid wall stops flush with zero oscillation or penetration.
- No tunneling: Falling at 25 tiles/s onto 1-tile floor never passes through.
- Replaying 600 recorded frames produces identical state hash (100% determinism).
- Identical simulation trajectory at 30, 60, and 144 Hz display refresh rates.
- Canvas resizes gracefully without stretching or distortion.
- Live tuning sliders update gameplay variables in real time.
- Conduct 8-point Adversarial Feel Review and log results in NOTES.md.
```

---

## Stage 2: Ground Locomotion, Momentum Speedometer HUD, & Tactile Audio/VFX

```text
STAGE 2 of 10: GROUND LOCOMOTION, MOMENTUM SPEEDOMETER HUD, & TACTILE AUDIO/VFX

Read CLAUDE.md, NOTES.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md (Section 1).
Goal: Implement Wonder's signature weighty-yet-explosive ground locomotion, non-linear dash ramp, skid brake, crouch ducking, accompanied by responsive HUD momentum gauges and procedural audio feedback.

BUILD — KINEMATICS & MECHANICS:
1. Walk & Run Speed Targets:
   - Walk Top Speed: 5.20 tiles/s (332.8 px/s). Reached in ~0.21s (13 frames).
   - Run Top Speed: 9.20 tiles/s (588.8 px/s with Run held). Reached in ~0.43s (26 frames).
2. Frame-1 Start Impulse (Wonder Anti-Sluggish Pop):
   - From rest (vx = 0), pressing directional input snaps vx immediately to 1.25 tiles/s on frame 1.
3. Non-Linear Ground Acceleration:
   - Base acceleration: 18.50 tiles/s^2.
4. Release Friction & Stop Threshold:
   - Release deceleration: 22.00 tiles/s^2.
   - Stopping from top sprint covers 1.92 tiles over ~0.42s (25 frames).
   - Below 0.30 tiles/s, snap vx to 0.0 to prevent endless microscopic drift.
5. High-Speed Skid Mechanic:
   - Reversing direction while moving > 4.50 tiles/s enters Skid state.
   - Skid deceleration: 44.00 tiles/s^2 (stops in ~0.21s / 12 frames, covering 0.96 tiles).
   - Character facing direction remains in original slide direction until vx crosses zero.
6. Low-Speed Pivot Turn:
   - Reversing direction below 4.50 tiles/s executes a 4-frame pivot turn at 3x acceleration without skidding.
7. Crouch & Crouch Slide:
   - Pressing Down while grounded shrinks hitbox height by 50% (1.80 -> 0.90 tiles), keeping feet pinned to floor.
   - Flat crouch slide deceleration: 14.50 tiles/s^2.
   - Ceiling raycast prevents standing if clearance < 1.80 tiles; auto-uncrouches when clear.

BUILD — UI/UX & MULTI-SENSORY FEEDBACK:
1. Modern Momentum / Speedometer HUD:
   - Subtle dynamic chevron/segmented meter beneath character or on HUD indicating current speed tier (Walk / Run / Sprint / Max).
   - Color transitions from soft white (Walk) to amber (Run) to cyan/electric (Max Dash).
2. Procedural Web Audio Sound Synthesizer:
   - Zero-external-dependency Web Audio API synthesizer for tactile physical feedback:
     * Footstep ticks: Micro-pitch variations matched to walk/run stride frequencies.
     * Skid screech: Frequency-modulated chirps when skidding.
     * Crouch duck: Short low-pass swoosh.
3. Pooled Cartoon Particle VFX (2D Canvas / WebGL):
   - Skid smoke puffs: Trailing white cartoon clouds bursting at feet during skid.
   - Sprint foot-dust: Intermittent 3-puff dust kick behind player when sprinting > 7.0 tiles/s.
4. Visual Crouch Cue:
   - Visual deformation squashes temporary sprite/box to 50% height with spring bounce.

TESTS & VERIFICATION:
- Hold Right + Run from rest: Reaches 9.20 +/- 0.05 tiles/s in 0.40–0.46s without velocity overshoot.
- Walk only: Reaches 5.20 +/- 0.05 tiles/s in 0.19–0.23s.
- Release from full run: Halts within 1.85–2.05 tiles and 0.40–0.45s.
- Skid from full run: Halts within 0.90–1.05 tiles and 0.19–0.23s without instant facing flip.
- Single-frame tap: Consistently advances 0.02–0.08 tiles deterministically.
- Crouch slide under 1-tile gap: Standing is blocked inside; auto-stands upon exit.
- Save velocity graphs to /review/stage2/. Perform 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 3: Two-Phase Jump Arc, Apex Hang, & Forgiveness Visualizer UX

```text
STAGE 3 of 10: TWO-PHASE JUMP ARC, APEX HANG, & FORGIVENESS VISUALIZER UX

Read CLAUDE.md, NOTES.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md (Section 1, Segment 01).
Goal: Construct Mario's signature two-phase asymmetric jump arc, variable height cutoff, buoyant apex float, and invisible forgiveness mechanisms, supported by telemetry gauges and forgiveness feedback cues.

BUILD — KINEMATICS & DERIVATIONS:
1. Exact Mathematical Targets:
   - Target Standing Apex Height: h = 4.10 tiles (262.4 px).
   - Target Time to Apex: t = 0.43 s (26 frames at 60 Hz).
   - Launch Velocity: v0 = 2h / t = 18.60 tiles/s (19.84 px/f).
   - Rising Gravity: g_rise = 2h / t^2 = 42.80 tiles/s^2 (0.76 px/f^2).
2. Running Sprint Jump Boost:
   - Launch velocity scales with horizontal momentum: v0_boosted = v0 * (1.0 + 0.10 * |vx| / runTopSpeed).
   - Full sprint jump launches at 20.46 tiles/s, reaching apex height of 4.85 tiles (covers 6+ tile gaps).
3. Asymmetric Falling Gravity:
   - Falling Gravity: g_fall = 1.45 * g_rise = 62.00 tiles/s^2.
   - Terminal Fall Velocity: Capped at 23.50 tiles/s (25.07 px/f).
4. Buoyant Apex Hang Float Window:
   - When |vy| < 1.80 tiles/s with Jump button held: Gravity is multiplied by 0.65x for up to 6 frames (~0.10s float).
5. Variable Height Early Cutoff:
   - If Jump button is released while rising (after minimum 3-frame rise), multiply gravity by 3.20x until vy <= 0.
   - Tap-jump apex reaches 1.65–1.90 tiles.
6. Forgiveness Mechanics:
   - Coyote Time: Jump remains valid for 5 frames (0.083s) after walking off a ledge.
   - Jump Buffer: Jump pressed within 6 frames (0.10s) prior to landing executes on the exact landing frame.
   - Ceiling Corner Correction: If head overlaps ceiling corner by < 0.25 tiles (16px), nudge player sideways around obstacle without killing upward velocity.
   - Ledge Step-Up: If feet are within 0.20 tiles (12.8px) of platform top while moving toward it, snap onto platform.
   - Ceiling Bonk: Hitting flat ceiling sets vy = -2.0 tiles/s and emits BlockHit event.
7. Air Control:
   - Pushing with velocity: 0.85x ground acceleration.
   - Reversing in air: 1.0x ground acceleration.
   - Air drag with no input: 3.00 tiles/s^2. Horizontal air speed clamped to takeoff speed.

BUILD — UI/UX & FORGIVENESS TELEMETRY:
1. Jump Arc Telemetry Gauge (Debug HUD):
   - Real-time display showing Peak Apex Reached, Time-to-Apex, and Airtime Duration of last jump.
   - Real-time curve visualization tracking the parabolic trajectory against reference curves.
2. Forgiveness Indicator Cues ([F3] / Playtest mode):
   - Coyote indicator: Subtle green ghost silhouette / HUD badge when jump succeeds via coyote window.
   - Buffer indicator: Subtle yellow flash on landing when jump fires via input buffer.
   - Corner correction marker: Micro-nudge vector arrow showing where player was steered around block.
3. Multi-Sensory Audio & VFX:
   - Procedural Web Audio Jump Chirp: Frequency modulates upward proportional to launch velocity (higher pitch for sprint jump).
   - Apex Float Sparkle: Faint cartoon wind streak / star glint at apex of full jump.
   - Landing Shockwave Dust: Left and right horizontal dust bursts on ground contact.

TESTS & VERIFICATION:
- Standing full jump apex: 4.05–4.15 tiles. Total airtime: 0.76–0.82s.
- Full running jump apex: 4.80–4.90 tiles (clears 6-tile gap on Gap Ladder).
- Tap jump apex: 1.65–1.90 tiles.
- Coyote Time: Jump at k frames after leaving ledge succeeds for k <= 5, fails for k = 6.
- Jump Buffer: Jump pressed j frames before landing fires for j <= 6, fails for j = 7.
- Corner correction: Nudges player at 0.20 overlap, bonks head at 0.35 overlap.
- Save jump arc plots to /review/stage3/. Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 4: Advanced Move Set, Action Combat UI & Screen Trauma Shake

```text
STAGE 4 of 10: ADVANCED MOVE SET, ACTION COMBAT UI & SCREEN TRAUMA SHAKE

Read CLAUDE.md, NOTES.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md (Segments 02, 17, 18).
Goal: Implement the complete acrobatic move set (Mid-Air Spin Twirl, Wall Slide, Wall Jump, Ground Pound), robust state arbitration, cinematic screen trauma shake, and action feedback banners.

BUILD — KINEMATICS & MOVES:
1. Mid-Air Spin Twirl (R/ZR / Spin Key):
   - Can be triggered once per airtime during ascent or descent.
   - Gives instant upward impulse of +1.60 tiles/s.
   - Clamps vertical velocity to [-1.50, +1.50] tiles/s for 18 frames (0.30s helicopter hover).
   - Sets spinning combat flag (allowing bounce on spiked hazards in Stage 9).
2. Wall Slide:
   - Activated when airborne, falling (vy < 0), touching a vertical solid wall, and pressing directional stick toward wall.
   - Clamps falling speed to 4.20 tiles/s (slow controlled descent).
   - Releasing direction away from wall disengages slide into normal fall.
3. Wall Jump:
   - Pressed Jump while wall sliding or within 5 frames of leaving wall (wall coyote window).
   - Launches away from wall: vx = 8.50 tiles/s (opposite wall normal), vy = 16.80 tiles/s upward (launch angle ~63.2°).
   - Input lockout: Directional input toward the wall is locked out for 8 frames (0.133s) to prevent instant accidental re-sticking.
4. Ground Pound:
   - Initiated by pressing Down while airborne with at least 1.0 tile ground clearance.
   - Phase 1: PoundWindup — Frozen mid-air (vx = 0, vy = 0) for 10 frames while executing front flip.
   - Phase 2: PoundFall — Rocket downward at terminal dive speed of 28.00 tiles/s.
   - Phase 3: PoundImpact & Recover — On ground contact, trigger GroundPoundImpact event; player locked in recovery for 10 frames (buffered jump allowed).
5. State Arbitration Matrix:
   - Document full transition matrix in NOTES.md.
   - Explicitly guard against illegal transitions (e.g., cannot Ground Pound during Wall Slide; cannot Wall Slide during Ground Pound fall; cannot Spin Twirl after Ground Pound starts).

BUILD — UI/UX & SCREEN FEEL:
1. Screen Shake System (Trauma-Based Decay):
   - Stress-tested trauma model: offset = trauma^2 * maxOffset * noise(t).
   - Ground Pound impact adds 0.65 trauma; decays to 0 over 0.40s.
2. Action State UI Banners:
   - Compact floating action badge in HUD displaying current acrobatic state ("SPIN TWIRL", "WALL SLIDE", "GROUND POUND!").
3. Visual & Audio Effects:
   - Spin Twirl: Dual horizontal ribbon trail / blur disk around character during the 18-frame hover; procedural whoosh sound.
   - Wall Slide: Vertical spark/dust particles scraping upward along wall contact line; procedural stone rasp sound.
   - Ground Pound: Impact shockwave ring expanding horizontally along floor; deep procedural bass impact thud.

TESTS & VERIFICATION:
- Spin Twirl extends airtime by 0.28–0.32s; vertical hover holds for exactly 18 frames.
- Wall slide descent speed is clamped to 4.10–4.30 tiles/s.
- Wall jump launch vx = 8.50 +/- 0.20 tiles/s, vy = 16.80 +/- 0.20 tiles/s.
- 3-tile-wide Wall Shaft: Player can wall-jump chain climb 12 vertical tiles in under 7 seconds.
- Ground Pound windup = 10 frames, dive speed = 28.00 tiles/s, impact fires on contact frame.
- Prior stage tests pass. Save state-machine diagram to /review/stage4/. Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 5: 2D Terrain Slopes, Butt-Slide, & Incline Telemetry UX

```text
STAGE 5 of 10: 2D TERRAIN SLOPES, BUTT-SLIDE, & INCLINE TELEMETRY UX

Read CLAUDE.md, NOTES.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md (Segment 18).
Goal: Implement exact 45° and 26.5° slope collision, ground adhesion downhill snapping, high-speed butt-sliding, one-way semisolids, and surface incline telemetry.

BUILD — KINEMATICS & TERRAIN:
1. Slope Math & Profiles:
   - 45° Slope (1x1 tile): Height function y = f(u) where dy/du = +/-1.0.
   - 26.57° Gentle Slope (2x1 tiles): Height function across 2 tiles with dy/du = +/-0.5.
   - Exact surface normal computation: n = normalize(-dy/du, 1).
2. Ground Adhesion (Anti-Bouncing Downhill):
   - When moving downhill on a slope while grounded, project player Y down to slope surface by up to 0.40 tiles per frame, preventing unwanted airborne launching across tile seams.
3. Slope Butt-Slide:
   - Initiated by crouching while on a slope with angle >= 14°.
   - Downhill Acceleration: a = g * sin(theta) - 0.04 * g * cos(theta).
   - Maximum slide velocity capped at 14.50 tiles/s.
   - Uphill input is ignored during slide; Jump button executes a high-speed slide jump preserving slide velocity.
4. Flat Runout Deceleration:
   - Exiting slope onto flat ground continues sliding in crouch with deceleration of 11.20 tiles/s^2 (covers ~2.4 tiles).
   - Player hitbox defeats enemies while slide velocity >= 6.00 tiles/s.
5. One-Way Semisolid Platforms:
   - Passable from below and sides; solid only when falling from above and previous feet Y >= platform top.
   - Pressing Down + Jump drops through semisolid platform cleanly.
6. Moving Platforms:
   - Platform updates position prior to character tick, transferring displacement delta to player.
   - Jumping off platform inherits platform's horizontal velocity vector.

BUILD — UI/UX & TERRAIN TELEMETRY:
1. Incline / Surface Telemetry Overlay ([F3] mode):
   - Visual display of current slope angle (degrees), surface normal vector, and adhesion snap status.
   - Visual indicator showing whether current speed is sufficient to defeat enemies via slide (Green = Lethal >= 6 tiles/s, Yellow = Safe).
2. Butt-Slide Audio & VFX:
   - Friction speed lines along character flanks during steep slides.
   - Trailing dirt spray bursting from rear of sliding character.
   - Procedural grinding slide audio modulated by velocity.
3. Semisolid Platform Drop-Through Visual:
   - Subtle downward arrow prompt or ghost fade when standing on drop-through semisolids.

TESTS & VERIFICATION:
- 100 downhill traversals of 45° and 26.5° slopes at varying speeds: zero unwanted airborne disconnects; vy never spikes > 1.0 tiles/s across seams.
- Slide down 8-tile 26.5° slope: Accelerates past 12.0 tiles/s, transitions onto flat terrain, and halts after ~2.4 tiles.
- Semisolids: 100/100 pass through from below, 100/100 land from above, drop-through operates reliably.
- Fuzz Test: 10,000 automated random input frames across mixed slope/semisolid terrain: zero tunneling, zero NaN, zero stuck states.
- Prior tests pass. Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 6: 2D Sprite Environment Level Kit, Scenic Atmosphere & Block Interaction UX

```text
STAGE 6 of 10: 2D SPRITE ENVIRONMENT LEVEL KIT, SCENIC ATMOSPHERE & BLOCK INTERACTION UX

Read CLAUDE.md, NOTES.md, and tileset_technical_spec.md.
Goal: Construct the game environment using the 2D Grassland sprite atlas, modular 64px level kit components, multi-plane parallax depth, and tactile block interaction UX.

BUILD — SPRITE TILEMAP & PARALLAX ENGINE:
1. Grassland Tileset Atlas Loader:
   - Load 'Wii U - New Super Mario Bros. U _ New Super Luigi U - Tilesets (New Super Mario Bros. U) - Grassland Tileset.png' (1876x3230px).
   - Implement atlas slicer parsing 64x64px tiles with 10px outer borders according to tileset_technical_spec.md.
2. 9-Slice Autotiler & Slopes:
   - Generate terrain with outer grass caps, left/right cliff faces, inner cavern fill, and corner transitions.
   - Map 45° and 26.5° slope tiles with seamless visual seams.
3. Modular Kit Elements (64px Grid Aligned):
   - Ground tiles, Question Blocks [?], Brick Blocks, Hard Blocks, Warp Pipes (2-tile diameter with collar rim), Semisolid Mushroom Platforms, Coins, Goal Flagpole.
4. Multi-Layer Parallax Staging:
   - Sky & Cloud Plane (Z = -200, scroll factor 0.10x).
   - Distant Rolling Hills (Z = -75, scroll factor 0.40x).
   - Cavern / Cliff Backdrops (Z = -20, scroll factor 0.85x).
   - Main Gameplay Plane (Z = 0.0, solid geometry, player, actors).
   - Foreground Foliage Tufts & Pipe Rims (Z = +15, scroll factor 1.10x).
5. Foliage Visual Overhang:
   - Visual grass edge extends 5px (0.08 tiles) above solid collision line Y = 0.

BUILD — UI/UX & BLOCK INTERACTION POLISH:
1. Dynamic Block Bumping UX:
   - Hitting a Question Block or Brick Block from below triggers a juicy 6-frame sine-wave bump animation (block pops up 12px and settles down).
   - Question Block spawns a spinning gold coin that hops upward 2.5 tiles and disappears with a classic chime.
   - Brick block struck while large/sprinting shatters into 4 spinning debris fragments.
2. Spinning Coin Animations:
   - 4-frame rotating gold coin sprite with shimmer glint.
3. Atmospheric Visual Depth:
   - Subtle vignette around screen borders.
   - Atmospheric sky gradient transitioning from vibrant Nintendo cyan to warm horizon gold.
4. Geometry Lint Verification Tool:
   - Automated script verifying that every rendered tile has 100% matched collision data. No invisible barriers, no phantom walls.

TESTS & VERIFICATION:
- Geometry lint passes with zero mismatches.
- Parallax layers scroll without tearing or jitter across all speeds.
- Block bump physics and coin hop animations complete with zero simulation desync.
- Frame rate holds steady at 60 FPS. Prior stage tests pass.
- Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 7: 2.5D Camera System, Cinematography & Viewport Dynamics

```text
STAGE 7 of 10: 2.5D CAMERA SYSTEM, CINEMATOGRAPHY & VIEWPORT DYNAMICS

Read CLAUDE.md, NOTES.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md.
Goal: Build a responsive 2.5D perspective camera that dynamically leads player motion horizontally, maintains calm stability during vertical jumps, and frames action cleanly.

BUILD — CAMERA KINEMATICS & PROJECTION:
1. Perspective Camera Setup:
   - Perspective camera with 30° vertical FOV positioned at Z = +18.0 tiles.
   - Downward pitch of 4° toward the Z = 0.0 gameplay plane, framing ~22 tiles horizontally in 16:9.
2. Dynamic Horizontal Lead (Look-Ahead):
   - Critically damped spring follow (time constant = 0.20s, 0.50-tile central deadzone).
   - Dynamic look-ahead: Leads player by up to 3.0 tiles in facing direction, scaled linearly by |vx| / runTopSpeed.
   - Reversal easing: When reversing direction, look-ahead eases smoothly across 0.40s without jarring jerks.
3. Vertical Calm (Anti-Nausea Jump Dampening):
   - Camera remains vertically locked during standard jumps on flat ground (does not bob up and down with every hop).
   - Vertical re-centering initiates only after player lands on a surface at a different elevation (eased over 0.60s).
   - Aerial safety clamp: If player rises above 75% or drops below 20% of viewport, vertical camera tracking engages immediately.
4. Fast-Fall Look-Down:
   - When vy < -14.0 tiles/s (fast fall / ground pound), shift camera downward by up to 2.0 tiles so landing floor is visible.
5. Boundary Clamping:
   - Clamps camera viewport within level bounding box; frustum never reveals empty void past start, end, or bottom pit boundaries.

BUILD — UI/UX & CINEMATOGRAPHY ENHANCEMENTS:
1. High-Speed Sprint Vignette UX:
   - At sprint speeds > 8.0 tiles/s, introduce subtle screen edge speed-line vignettes and gentle FOV expansion (+2° FOV) for exhilarating sense of speed.
2. Camera Debug Visualization Mode ([F4] toggle):
   - Viewport overlay showing deadzone rectangle, look-ahead target crosshair, and elevation anchor line.
3. Unified Camera Shake API:
   - Integrates trauma shake from Stage 4 (Ground Pound, pipe entry, explosive impacts) with directional pitch and roll perturbation.

TESTS & VERIFICATION:
- Full sprint across flat runway: Player screen position settles reliably between 35% and 48% of screen width.
- Full standing jump on flat ground: Camera vertical displacement is < 0.25 tiles.
- Jump onto 6-tile-high ledge: Camera eases to new height smoothly without player breaching top 15% of viewport.
- Fast fall / Ground pound: Landing ground is framed with >= 2.5 tiles of advance visibility.
- Save tracking curves to /review/stage7/. Prior tests pass. Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 8: 3D Rigged Character Integration, Expressive Skeletal Rig & Character Switcher UX

```text
STAGE 8 of 10: 3D RIGGED CHARACTER INTEGRATION, EXPRESSIVE SKELETAL RIG & CHARACTER SWITCHER UX

Read CLAUDE.md, NOTES.md, web_assets/README.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md.
Goal: Load the ready 3D models ('web_assets/models/mario.glb' and 'luigi.glb'), map the 27 baked animations via Three.js AnimationMixer, enforce 20° 3/4 camera yaw tilt, implement volume-preserving dynamic squash & stretch, and provide a live Mario/Luigi character switcher UI.

BUILD — 3D SKELETAL INTEGRATION & ANIMATION:
1. glTF Binary Loading & Mesh Architecture:
   - Load 'web_assets/models/mario.glb' and 'luigi.glb' using Three.js GLTFLoader.
   - Character root placed at (X, Y, Z = 0.0) on the 2D physics plane.
   - Head and worn cap are already aligned to face_1 bone via socket matrix fix.
2. Camera Yaw Tilt (Wonder 3/4 Facial Gaze):
   - Rotate character torso and head bones by 20° toward camera about Y-axis.
   - Breaks 2D profile lock, presenting face, eyes, and mustache to the player.
3. 27 Animation Clip State Mapping:
   - Drive Three.js AnimationMixer with cross-fading (0.10–0.15s cross-fade) based on controller state:
     * Locomotion: 'Idle' (loop), 'Walk' (loop), 'Run' (loop), 'Sprint' (b_dash, loop), 'Skid' (slip, once), 'TurnAround' (turn, once).
     * Aerial: 'Jump' (jump, clamp), 'DoubleJump' (2jump1), 'TripleJump' (2jumped somersault), 'FlutterJump' (LB_jump_stoop, Luigi scuttle), 'SpinJump' / 'SpinAir', 'WallSlide' (wall_wait), 'WallJump' (w_jump1).
     * Combat/Reactions: 'GroundPound' (hipat) / 'GroundPoundLand' (hiped), 'CrouchStart' / 'Crouch' (stoop), 'CarryWalk' / 'Throw', 'Damage' (damF), 'Defeat' (dead), 'Victory' (goal_glad).
4. Dynamic Volume-Preserving Squash & Stretch:
   - Scale Pelvis and Spine bones: Sy scaled dynamically; Sx = Sz = 1.0 / sqrt(Sy).
   - Jump Takeoff: Sy = 1.28 stretch.
   - Landing Impact: Sy = 0.74 squash, recovering over 5 frames.
   - Crouch Ducking: Sy collapses to 0.50 (compact ball silhouette).
   - Physics hitboxes remain 100% constant; presentation never modifies physics.

BUILD — UI/UX & CHARACTER SWITCHER:
1. Character Hot-Swap Switcher ([C] key / HUD button):
   - Instant live toggle between Mario and Luigi.
   - Physics profiles diverge realistically:
     * Luigi features slightly floatier jump gravity (g_rise = 40.0 tiles/s^2), 5% higher jump apex, lower ground traction (friction = 19.0 tiles/s^2), and iconic 'FlutterJump' scuttle animation on jump hold.
     * Mario features tighter, punchier momentum and snappy turning.
2. Pose & Animation Inspector Mode ([F5] toggle):
   - Playtest tool pausing gameplay to inspect all 27 clips, scrub frames, view bone skeletons, and toggle wireframe.
3. Visual Dust & Stride VFX:
   - Synchronize cartoon dust puffs to footstep strike frames in 'Run' and 'Sprint' clips.

TESTS & VERIFICATION:
- Head and worn cap remain 100% affixed to neck during all 27 animations with zero detachment.
- Simulation state hashes identical with 3D rendering enabled vs disabled (zero presentation desync).
- Dynamic squash & stretch preserves volume (Sx * Sy * Sz = 1.00 +/- 0.02).
- Character boots sink into grass foliage by exactly 5px (0.08 tiles) at rest.
- Switching between Mario and Luigi occurs instantaneously with zero asset hitching.
- 60 FPS verified with skeletal deformation active. Prior tests pass.
- Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 9: Power-Ups, Hitstop Combat, & Wonder-Styled Gameplay HUD

```text
STAGE 9 of 10: POWER-UPS, HITSTOP COMBAT, & WONDER-STYLED GAMEPLAY HUD

Read CLAUDE.md, NOTES.md, and MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md (Segments 08, 09, 10, 15, 16).
Goal: Implement Super Mushroom, Fire Flower, Goomba stomp combat, Koopa shell physics, hitstop freeze-frames, and a polished, bouncy Wonder-inspired gameplay HUD.

BUILD — COMBAT & POWER-UPS:
1. Super Mushroom:
   - Spawns from hit question block, moves at 2.50 tiles/s, bounces off walls.
   - Contact triggers 6-frame Hitstop Freeze, 3-stage elastic growth squash/stretch, and celebratory +6.0 tiles/s hop with starburst particles.
2. Fire Flower & Fireball Throw:
   - Transforms outfit palette.
   - Fireball attack (X / K key): Windup pose, launches fireball at vx = 14.0 tiles/s, gravity = 38.0 tiles/s^2, 0.85 restitution floor bounce, bursts into spark flare on wall contact (max 2 active).
3. Walker (Goomba) Combat:
   - Patrols at 1.80 tiles/s, reverses at walls.
   - Stomp Detection: Contact detected when player feet are within top 20% of Goomba AABB.
   - Stomp Impact: Triggers 3-frame Hitstop Freeze; Goomba flattens to 15% height with cartoon eyes.
   - Rebound Impulses:
     * Passive Rebound (Jump released): vy = 10.50 tiles/s (2.1-tile bounce).
     * Active Rebound (Jump held): vy = 17.50 tiles/s (4.0-tile high leap).
4. Shell (Koopa) Mechanics:
   - Stomp retracts Koopa into shell.
   - Kicking shell launches it at 9.00 tiles/s; bounces off solid walls indefinitely.
   - Holding Run picks up stationary shell; release throws shell forward.
5. Damage, Recoil, & Invulnerability:
   - Side contact with enemy triggers damage recoil (vx = -6.50 tiles/s, vy = +8.00 tiles/s).
   - 120 frames (2.0s) of invulnerability with 4-frame alpha flicker (0.30 to 1.00).

BUILD — UI/UX & GAMEPLAY HUD:
1. Super Mario Wonder-Inspired HUD:
   - Coins Counter: Golden spinning coin icon with 2-digit numeral that bounces playfully on coin collection.
   - Score Tally: Retro 6-digit score readout with floating score popups ("+100", "+200", "+1000", "1-UP!") rising and fading from defeated enemies.
   - Level Countdown Timer: 3-digit retro timer ticking down cleanly.
   - Power-Up Status Badge: Sleek circular portrait badge showing current form (Small / Super / Fire).
2. Hitstop Freeze-Frame Feel UX:
   - Global simulation freeze (3 frames on stomp, 6 frames on Mushroom pickup) delivers unmistakable Nintendo tactile impact punch.
3. Multi-Sensory Audio & VFX:
   - Procedural stomp boing sound, power-up growth chime, fireball pop, and shell ricochet clink.

TESTS & VERIFICATION:
- 100 Goomba stomps from varied angles: Top 20% stomps succeed 100/100; side contact applies damage recoil.
- Active stomp chain of 3 consecutive Goombas rebounds 4+ tiles on every hit with Jump held.
- Hitstop halts simulation for exactly specified frames before resuming.
- Damage invulnerability lasts exactly 120 frames with flawless flicker.
- Shell bounces off walls >= 10 times without tunneling.
- Prior stage tests pass. Run 8-point Adversarial Feel Review and update NOTES.md.
```

---

## Stage 10: Master Integration, The Gauntlet Benchmark & Playtest Verification Suite

```text
STAGE 10 of 10: MASTER INTEGRATION, THE GAUNTLET BENCHMARK & PLAYTEST VERIFICATION SUITE

Read CLAUDE.md, NOTES.md, and all prior stage deliverables.
Goal: Assemble the comprehensive Gauntlet Benchmark Level, integrate automated headless verification replays, deploy a live feel preset switcher, and polish developer/playtester UX.

BUILD — GAUNTLET BENCHMARK LEVEL:
Assemble a seamless master obstacle course incorporating every developed mechanic:
1. Section A — Flat Runway: 40 tiles flat with sprint markers, coin lines, and speed test zone.
2. Section B — Gap Ladder: Chasms of 2, 3, 4, 5, 6, 7, and 8 tiles testing jump distances.
3. Section C — Vertical Step Course: 1, 2, 3, and 4-tile ledges with ceiling corner traps.
4. Section D — Wall-Jump Shaft: 3-tile wide x 14-tile high vertical climb course.
5. Section E — Slope Hill: 45° and 26.5° ramps with butt-slide runout into a row of Goombas.
6. Section F — Semisolid & Moving Platform Chasm: Traversal over a bottomless pit.
7. Section G — Enemy Playground: Stomp chains, Koopa shell bowling, Fire Flower target range.
8. Section H — Warp Pipe Passage: Vertical duck-in suction and horizontal cap-snatch crawl.
9. Section I — Goal Pole: Flagpole grab, victory slide, and cheer pose ('Victory').

BUILD — UI/UX & PLAYTEST SUITE:
1. Section Teleport Bar ([1]-[9] hotkeys / HUD tabs):
   - One-click navigation allowing playtesters to instantly warp to any of the 9 Gauntlet sections.
2. Live Feel Preset Switcher (Dropdown / [P] hotkey):
   - 'Wonder Momentum' (Production Target): Heavy momentum, vx_start=1.25, ground_accel=18.5, skid_decel=44.0, g_rise=42.8, g_fall=62.0, 6-frame apex hang, 50% crouch squash, 3/4 camera tilt.
   - 'NSMBU Classic': Crisp linear momentum, ground_accel=16.0, g_rise=43.3, g_fall=59.5, 3-frame apex hang, 28% crouch squash, 90° profile lock.
   - 'Snappy Arcade': Ultra-agile (accel=24.0, instant turnarounds, reduced fall gravity 52.0).
3. One-Click Automated Verification Replay Suite:
   - Runs headless scripted replays across the full Gauntlet course.
   - Generates a visual Verification Report Card in HUD (Green checkmarks / Red failure badges for every mechanic).
4. Performance & Telemetry Monitor:
   - Displays real-time FPS, draw calls, memory heap, and simulation drift across the entire level.
   - Generates and saves PROTOTYPE_REPORT.md with final measured-vs-target tables and playtest notes.

FINAL EXIT CRITERIA:
- All automated headless replays clear the Gauntlet level with zero desync.
- Feel verification metrics pass 100%:
  * Sprint jump clears 6-tile gap; walk jump clears 3-tile gap.
  * Standing full jump reaches 4.10-tile ledge; tap jump clears 1-tile block.
  * Coyote time passes at 5 frames, fails at 6 frames.
  * Jump buffer passes at 6 frames, fails at 7 frames.
  * Wall jump climbs 3-wide shaft cleanly.
- Live preset switching transitions smoothly without resetting position.
- Solid 60 FPS performance maintained across full Gauntlet level.
- Complete PROTOTYPE_REPORT.md compiled. Conduct final 8-point Adversarial Feel Review and update NOTES.md.
```
