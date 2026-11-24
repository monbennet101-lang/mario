# NOTES.md: Project Memory & Stage Log

## 1. Prior Groundwork & Conversational Lineage
- **Conversation 16d4f89a-7d44-49ed-be04-95b7e0741dc6:**
  - Frame-by-frame kinematic analysis of `Super Mario Bros. Wonder vs. NSMBU Animation Comparison` across 2,346 frames.
  - Discovery and proof that environment is 2D painted raster tiles (64x64px), while player is a 3D skeletal mesh with a 20° 3/4 camera yaw tilt.
  - Compiled `MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md` and `tileset_technical_spec.md`.
- **Conversation 9eaa741c-c67b-4928-b073-d5821b5eee18:**
  - Extraction and reverse-engineering of character models from Nintendo archives.
  - Solved socket coordinate space misalignment for head, facial features, and cap.
  - Generated production-ready glTF 2.0 binary files (`mario.glb` and `luigi.glb`) with 27 embedded animation clips and PBR textures in `web_assets/models/`.
  - Created working `web_assets/test_viewer.html`.

---

## 2. Active Technical Invariants
- **Engine Stack:** HTML5 / WebGL / Three.js (GLTFLoader, AnimationMixer) + 2D Canvas/Texture Tilemap.
- **Physics Engine:** Custom axis-separated swept AABB against 64px grid tiles. No rigidbodies.
- **Simulation Clock:** Fixed 60 Hz ($\Delta t = 1/60\text{ s} \approx 0.01667\text{ s}$), decoupled from render frame rate.
- **Unit Scale:** 1.0 Tile = 64.0 Pixels = 1.0 World Unit.
- **Hitbox:** Width = 0.80 tiles, Height = 1.80 tiles. Foliage penetration = 0.08 tiles (5 px).
- **Target Feel:** Super Mario Bros. Wonder momentum, explosive frame-1 startup ($v_{\text{start}} = 1.25\text{ tiles/s}$), variable height jump with 6-frame apex float, cartoon volume-preserving squash & stretch.

---

## 3. Stage Progression & Adversarial Review Log

*(Agents will append decisions, measured vs target tables, and 8-point adversarial feel reviews below after completing each stage)*

### Stage 1: Foundation, Kinematic Controller, 64px Tile Harness & Interactive UI/UX Shell
- Status: Complete
- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Simulation Clock | Fixed `60 Hz` (`dt = 1/60s`), max 5 ticks/frame | `0.016667s` fixed step, spiral clamp `5` | Pass |
| Rest Floor Jitter (600 frames) | `tolerance < 0.0001` tiles, `0` jitter | `0.0000` deltaY over 600 frames (`grounded=true`, `vy=0`) | Pass |
| Solid Wall Flush (L & R) | Flush stop, `0` oscillation / penetration | `0.0000` diff (`1.0000` left, `14.2000` right), `vx=0` | Pass |
| Anti-Tunneling (`1`-tile floor) | Survive `vy <= -25` tiles/s without tunneling | Landed flush at `y=5.0000` for `-25` & `-60` tiles/s | Pass |
| Replay Determinism | Identical state hash over `600` frames | `600/600` FNV-1a hashes identical (`headless` & `browser`) | Pass |
| Framerate Independence | Identical trajectory at `30`, `60`, `144 Hz` | Exact position, velocity, & hash match across all 3 | Pass |
| Hitbox & Foliage Inset | `0.80 × 1.80` tiles hitbox, `0.08` tile inset | `0.80 × 1.80` AABB + visual `0.08` tile grass drop | Pass |
| Gamepad Deadzone | `0.20` radial/axis deadzone | `0.20` configurable in `MovementProfile.input` | Pass |
| Live Viewport Framing | Responsive `16:9`, `~22` tiles horizontal | Auto-scaled `22.0` tiles wide, clamped to room bounds | Pass |

- 8-Point Adversarial Feel Review:
  1. **Startup Responsiveness:** Walking/running begins with an immediate `1.25 tiles/s` frame-1 impulse (`MovementProfile.locomotion.startImpulse`), avoiding mushy first-frame windup before full Stage 2 Wonder curves arrive.
  2. **Rest Floor Jitter & Grounded Stability:** Replaced earlier every-other-frame grounded flicker (caused by skipping gravity while grounded without an explicit floor probe) with `_probeGround` (`1e-4` epsilon); stationary contact now holds `grounded = true` and `vy = 0` continuously with `0` jitter.
  3. **Wall Flush & Corner Catching:** Axis-separated swept X then swept Y prevents corner snagging between horizontal runs and vertical tile seams, halting flush at tile edges with `vx = 0` and clean `wallContactDirection`.
  4. **High-Speed Tunneling Prevention:** Exact ray-to-interval sweep times (`t_entry` along velocity ray) prevent tunneling even at `-60 tiles/s` against single-tile-thick suspended platforms.
  5. **Baseline Jump Control:** Variable-height cutoff (`earlyReleaseMult = 3.0`) and asymmetric rising/falling gravity (`26.1` vs `46.5`) produce crisp short hops and deliberate descents without floaty hangtime; coyote time, jump buffer, apex float, and ceiling corner nudge remain intentionally deferred to Stage 3.
  6. **Slope Ramp Seams:** Room 5 (`45°` & `26.5°` ramps with solid earth fill underneath) resolves vertical ramp elevation smoothly on contact without jagged floating triangles or floor seam snags.
  7. **Camera & Presentation Sync:** Render positions interpolate cleanly (`lerp(prevPos, pos, alpha)`), camera clamps strictly to tilemap bounds so off-map void never leaks, and `TelemetryHUD` / `InputVisualizer` update via `GameEngine`'s render tick subscription (`0` extra rAF loops, `0` paused CPU spin).
  8. **Playtester & Tuning Ergonomics:** Perimeter toolbar (`1–5` rooms, `F3` Telemetry, `I` Input, `G` Grid, `U` Tuning, `Space/P` Pause, `.` Step, `T` TimeScale, `Rec/Replay`, `H` Help) pairs with `lil-gui` live sliders, `Reset to Defaults`, and clipboard JSON export without hijacking numeric input focus.
- Known Issues / Next Steps:
  - Stage 1 implements clean baseline Stage 1 kinematics; full Wonder horizontal acceleration curves, `180°` skid turnaround bursts, crouch (`0.95` tiles hitbox) and crouch-sliding begin next in **Stage 2**.
  - Stage 3 will wire `coyoteFrames`, `jumpBufferFrames`, `apexFloat`, and `ceilingCornerNudge` (already exposed in `MovementProfile` for tuning continuity).

---

### Stage 2: Ground Locomotion, Momentum Speedometer HUD, & Tactile Audio/VFX
- Status: Complete
- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Frame-1 Start Impulse | `1.25 tiles/s` on frame 1 from rest | `1.2500 tiles/s` exact on frame 1 | Pass |
| Walk Top Speed Ramp | `5.20 ± 0.05 tiles/s` in `0.19–0.23s` | `5.2000 tiles/s` at `13 frames` (`0.2167s`), `0` overshoot | Pass |
| Run Top Speed Ramp | `9.20 ± 0.05 tiles/s` in `0.40–0.46s` | `9.2000 tiles/s` at `26 frames` (`0.4333s`), `0` overshoot | Pass |
| Release Friction Stop | Halt in `1.85–2.05 tiles`, `0.40–0.45s` | `1.922 tiles` in `25 frames` (`0.4167s`), `vx=0` | Pass |
| High-Speed Skid Brake | Halt in `0.90–1.05 tiles`, `0.19–0.23s`, preserve facing | `0.962 tiles` in `13 frames` (`0.2167s`), facing locked until `vx=0` | Pass |
| Low-Speed Pivot Turn | `<= 4.50 tiles/s`, `4`-frame pivot at `3×` accel, no skid | `Pivot` state entered cleanly, reverses without `Skid` | Pass |
| Single-Frame Tap | `0.02–0.08 tiles`, 100% deterministic | `0.0441 tiles`, identical hash across runs | Pass |
| Crouch & 1-Tile Tunnel | `50%` height (`1.80 -> 0.90t`), feet pinned, ceiling lock & auto-stand | `0.9000t` height, `pos.y` pinned, blocked inside tunnel, auto-stands on exit | Pass |

- 8-Point Adversarial Feel Review:
  1. **Frame-1 Start Impulse & Tap Micro-Control:** Snapping immediately to `1.25 tiles/s` on frame 1 eliminates sluggish startup; single-frame taps advance a crisp `0.044 tiles` (`~2.8 px`) for pixel-accurate platform edge alignment.
  2. **Non-Linear Walk/Run Acceleration:** Low-speed boost (`+16%` tapering into `5.20 t/s`) + slight sprint taper (`-5%`) hits exact Wonder targets (`0.217s` walk, `0.433s` run) with zero velocity overshoot. Releasing `Run` while holding direction smoothly bleeds down to walk speed rather than snapping harshly.
  3. **Trapezoidal Deceleration Integration:** Using `0.5 * (prevVx + newVx)` during horizontal deceleration eliminates discrete 60Hz Euler distance loss (`-0.077t`), matching analytical stopping distances (`1.922t` release, `0.962t` skid) accurately.
  4. **Skid Authority & Facing Discipline:** Reversing above `4.50 tiles/s` enters `Skid` (`44.0 t/s²`), locks facing direction in the slide direction until `vx` crosses zero, leans the character back `-14°`, emits cartoon smoke puffs, and plays an FM rubber-boot chirp.
  5. **Low-Speed Pivot Responsiveness:** Reversing at or below `4.50 tiles/s` engages a snappy 4-frame `Pivot` at `3×` acceleration without unwanted skid lock or smoke spam.
  6. **Crouch Hitbox Safety & Anti-Softlock:** Shrinking height `1.80 -> 0.90` tiles while keeping physics width `0.80` prevents wall penetration when crouching flush against walls, while visual squash (`Sy = 0.50`, `Sx = 1.32` with spring overshoot) delivers Wonder's compact ball silhouette. A slow `2.0 t/s` crouch-crawl prevents softlocking if a player halts inside a 1-tile ceiling tunnel.
  7. **Zero-GC VFX & Procedural Web Audio:** Pre-allocated 128-particle ring buffer produces 3-puff sprint foot-dust (`> 7.0 t/s`) and skid smoke with zero per-frame allocations; Web Audio synthesizes stride-synced footsteps (`±8%` pitch jitter), skid screeches, and crouch swooshes, with `[M]` mute support.
  8. **HUD Readability & Timing Parity:** Fixed initial-mount ref race in `App.jsx`/`SpeedometerHUD.jsx` and pause-frame throttle bypass in `TelemetryHUD.jsx` so both HUDs update synchronously at 60Hz and match identically when paused or frame-stepped.
- Known Issues / Next Steps:
  - Stage 3 will replace the Stage 1 baseline jump with Wonder's two-phase asymmetric jump (`v0 = 18.6`, `g_rise = 42.8`, `g_fall = 62.0`), 6-frame apex float, coyote time (`5f`), jump buffer (`6f`), and ceiling corner nudge (`0.25t`).

---

### Stage 3: Two-Phase Jump Arc, Buoyant Apex Float, Forgiveness Systems & Jump Telemetry
- Status: Complete
- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Standing Full Jump Apex | `4.05–4.15` tiles, `~0.43–0.45s` apex | `4.0552` tiles at `27 frames` (`0.4500s`), `50f` airborne / `0.8500s` full cycle (incl. `+0.04s` 6f apex float) | Pass |
| Full Sprint Jump Apex & Gap | `4.80–4.90` tiles (`+10% v0`), clears `6t` pit | `4.8987` tiles (`0.5000s` apex, `8.4333t` span); clears Room 2 `6t` gap cleanly | Pass |
| Short-Hop / Tap Jump (`1–3f`) | `1.65–1.90` tiles (`3.20x` early cutoff after `3f`) | `1.6686t` (`1f`), `1.76t` (`2f`), `1.8647t` (`3f`) | Pass |
| Buoyant Apex Float | `0.65×` gravity inside `\|vy\| < 1.80 t/s` for `<= 6f` (held only) | Exact `0.65×` gravity (`27.82`/`40.30 t/s²`), `6/6` float frames held, `0` if released | Pass |
| Coyote Time Window | Succeeds `k <= 5f` after ledge drop, fails `k = 6f`, no double-jump | `1f..5f` Pass, `6f` Fail, `coyoteFramesRemaining` cleared on jump | Pass |
| Jump Buffer Window | Fires on exact landing frame for `j <= 6f`, fails `j = 7f` | `1f..6f` Pass on exact landing tick, `7f` Fail; crouch ceiling clearance preserved | Pass |
| Ceiling Corner Nudge / Bonk | `<= 0.25t` nudges around corner preserving `vy`; `0.35t` bonks `-2.0` | `0.20t` nudges sideways cleanly (`vy > 0`); `0.35t` sets `vy = -2.0` + `blockHit` | Pass |
| Ledge Step-Up Forgiveness | `<= 0.20t` foot overlap snaps onto ledge preserving `vx` | `0.15t` snaps to top keeping `vel.x`; `0.35t` stops flush (`wallRight = true`) | Pass |
| Air Control & Drag | `0.85×` forward, `1.0×` reverse, `3.0 t/s²` drag, takeoff cap | Exact `0.85×`/`1.0×`/`3.00 t/s²`; standing air vx capped at `5.20 t/s` | Pass |

- 8-Point Adversarial Feel Review:
  1. **Trapezoidal Vertical Integration Precision:** Switching vertical integration to `0.5 * (prevVy + newVy) * dt` eliminates 60Hz semi-implicit Euler launch energy loss (`3.90t` vs `4.10t`), delivering exact `4.0552t` standing and `4.8987t` sprint peaks directly from Wonder's empirical constants (`v0 = 18.60`, `g_rise = 42.80`, `g_fall = 62.00`) with zero fudge factors.
  2. **Crisp Short-Hop Authority:** Evaluating `!jumpHeld && jumpFrames >= minRiseFrames` (instead of edge-only release) ensures ultra-brief 1-frame and 2-frame taps trigger the `3.20×` gravity cutoff right at frame 3 (`1.67–1.86t`), giving effortless precision over low hops without demanding awkward hold timings.
  3. **Buoyant Apex Hang Without Floatiness:** Triggering `0.65×` gravity exclusively while Jump is held inside `|vy| < 1.80 t/s` for up to 6 frames adds subtle hangtime for mid-air course correction (rendered with a faint sky-blue wind halo and shoulder sparkles) while snappy `62.0 t/s²` falling gravity prevents any sluggish floatiness on descent.
  4. **Seamless Ceiling Corner Nudge:** Overhead 1-tile blocks clip off-center by `<= 0.25t` (`0.20t` verified) smoothly redirect Mario sideways around the edge while preserving full upward velocity, whereas `> 0.25t` center hits perform a satisfying `-2.0 t/s` bonk and trigger the `blockHit` thud.
  5. **Floor Seam & Step-Up Forgiveness:** Feet brushing `<= 0.20t` below a platform lip while moving forward snap cleanly onto the surface without halting horizontal momentum (`vel.x` preserved), preventing frustrating toe-snags on Room 3 Jump Shaft ledges (where unreachable `9t` gaps were also corrected to `2–3t` climb steps).
  6. **Forgiveness Parity Across Jump Types:** Aligning `jumpMetrics` frame recording on `!bufferedJumpExecuted` guarantees identical 1st-frame arc telemetry across grounded, coyote, and buffered jumps; crouch-ceiling checks prevent buffered jumps from standing into 1-tile tunnels.
  7. **Responsive Air Steering & Momentum Respect:** Full `1.0×` reverse braking in mid-air lets players pull back from overshoot pits immediately, `0.85×` forward accel gives fine-tuning control, `3.0 t/s²` subtle drag prevents endless ice-drift, and clamping horizontal air speed to `max(walkTopSpeed, |vx_takeoff|)` stops stationary jumps from accelerating to full sprint speed mid-air.
  8. **Developer Telemetry, Audio/VFX & Viewport Fit:** `[F3]` Telemetry HUD displays live Jump Arc Curves plotted against dashed `4.1t`/`4.9t` reference arcs plus `COYOTE` / `BUFFER` / `NUDGE` / `STEP-UP` badges, while staying compact enough at `1280×720` and `1440×900` to leave the player sprite and Room 1 `NUDGE / BONK` block completely unobstructed alongside procedural jump chirps, landing thuds, and squash/stretch springs.
- Known Issues / Next Steps:
  - Stage 4 will layer advanced aerial mobility: **Mid-Air Spin Twirl**, **Wall Slide**, **Wall Jump**, and **Ground Pound**, plus Room 4 (`Wall Shaft`) chain climbing.

---

### Stage 4: Advanced Move Set, Action Combat UI & Screen Trauma Shake
- Status: Complete
- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Mid-Air Spin Twirl Hover | `+1.60 t/s` impulse, `[-1.50, +1.50]` clamp for `18f` (`0.30s`), `+0.28–0.32s` airtime, `1×`/airtime | `18/18` hover frames, `vy` clamped `[-1.50, +1.50]`, `+0.3000s` airtime extension, `1080°` spin, `isSpinningCombat = true`, blocks 2nd spin until land | Pass |
| Wall Slide Clamp & Release | `4.20 ± 0.10 t/s` descent on `SOLID` wall, disengages on release, ignores `HAZARD` | `4.2000 t/s` clamped descent, exits cleanly to `Fall` on release, `HAZARD` walls ignored | Pass |
| Wall Jump & 8f Lockout | `vx = ±8.50 ± 0.20`, `vy = 16.80 ± 0.20`, `8f` lockout toward wall, `5f` wall coyote | `vx = ±8.5000`, `vy = 16.8000`, `8/8f` steering lockout, `k=1..5f` coyote pass / `k=6f` fail | Pass |
| Room 4 Wall Shaft Climb | Chain climb `>= 12` vertical tiles in `< 7.0s` | `+12.259t` climbed in `1.80s` (`108` frames) across shaft kicks | Pass |
| Ground Pound 3-Phase Flow | `>= 1.0t` clearance, `10f` frozen windup, `28.00 t/s` dive, `10f` land lock w/ buffered jump | Rejects `< 1.0t`, exact `10f` (`vx=0,vy=0`), `-28.00 t/s` dive, emits `groundPoundImpact`, `10f` recovery + buffered jump launches immediately on end | Pass |
| State Arbitration Matrix | Block GP in WallSlide, WallSlide in GP, Spin in WallSlide/GP, double Spin | All forbidden transitions verified blocked in headless arbitration tests | Pass |
| Screen Trauma Shake | `+0.65` trauma on `groundPoundImpact`, quadratic `trauma^2` offset, decays to `0` in `0.40s` | `0.6500` peak -> `0.325` @ `12f` -> `0.0000` @ `24f` (`0.40s`) | Pass |

- **State Arbitration Matrix:**
  - `Jump / ApexFloat / Fall` $\to$ `SpinTwirl` (only if `!hasSpunThisAirtime && groundPoundPhase === null`)
  - `Fall` (touching `SOLID` wall, pressing toward wall) $\to$ `WallSlide` (clamps `vy >= -4.20`, sets `5f` wall coyote)
  - `WallSlide` (or within `5f` wall coyote) + `Jump` $\to$ `WallJump` (`±8.50 vx, +16.80 vy`, `8f` toward-wall lockout)
  - `Jump / ApexFloat / Fall / SpinTwirl / WallJump` + `Down` (if `groundClearance >= 1.0t`) $\to$ `GroundPoundWindup` (`10f`) $\to$ `GroundPoundFall` (`-28.00 t/s`) $\to$ `GroundPoundLand` (`10f` lock, emits `groundPoundImpact`)
  - **Blocked Guards:** `WallSlide` $\not\to$ `GroundPound`, `WallSlide` $\not\to$ `SpinTwirl`, `GroundPound*` $\not\to$ `WallSlide`, `GroundPound*` $\not\to$ `SpinTwirl`, `SpinTwirl` $\not\to$ 2nd `SpinTwirl` before landing.

- 8-Point Adversarial Feel Review:
  1. **Air Cap & Wall Kick Preservation:** Because `PlayerController` caps airborne horizontal speed at `max(walkTopSpeed, takeoffMaxSpeed)` (`5.20 t/s` from rest), `_executeWallJump` updates `takeoffMaxSpeed` to `8.50 t/s` and sets `isWallJumping = true` (bypassing Stage 3's early tap-release cutoff), preventing wall kicks from feeling clipped or falling short in 3-tile shafts.
  2. **8-Frame Lockout + Opposite Wall Grab Fluidity:** Locking steering strictly toward the *kicked* wall for 8 frames (`0.133s`) stops players from accidentally re-latching onto the same face while leaving steering *away* toward the opposite shaft wall responsive from frame 1.
  3. **Helicopter Spin Hover Weight (`0.04×` Gravity):** Tuning `hoverGravityMult` to `0.04` inside `[-1.50, +1.50]` gives Wonder's buoyant mid-air pause (+`0.3000s` net airtime extension) rather than dropping through the hover window prematurely when canceling `ApexFloat`, paired with dual cyan/gold ellipse trails and a 1080° (`60°/frame`) 3-turn twist.
  4. **Clearance-Safe Ground Pound & Recovery Jump Fix:** Full-width `groundClearance` prevents accidental Ground Pounds within `1.0` tile of floors/semisolids, while fixing a recovery-exit flag clash (`executeRecoveryJump` evaluated before `inPoundRecovery`) ensures a jump buffered during the 10-frame impact lock launches crisply on frame 11.
  5. **Solid-Only Wall Latch Safety:** `moveAndCollide` exports `wallLeftSolid` / `wallRightSolid` separately from hazards, and `hasWallContact` probes flush `SOLID` neighbors, guaranteeing Wall Slide never clings to hazard walls while engaging reliably even at zero horizontal velocity beside a wall.
  6. **Quadratic Camera Trauma Without State Leakage:** `ScreenShake` computes `trauma^2 * maxOffset * noise(t)` solely inside `Renderer.beginWorldPass()`/`endWorldPass()`, keeping physics coordinates, deterministic FNV-1a state hashes, and tile seams unaffected during heavy Ground Pound impacts.
  7. **Legible Acrobatic & Combat UI:** Floating top-center `ActionBannerHUD` surfaces transient moves (`SPIN TWIRL`, `WALL SLIDE`, `WALL JUMP!`, `GROUND POUND!`) cleanly without `backdrop-filter`, `SpeedometerHUD` tracks all Stage 4 states, `TelemetryHUD` adds compact `SPIN`/`WALL`/`LOCK`/`PND` badges + live trauma, and `TuningPanel` adds a collapsible Stage 4 folder.
  8. **Shaft Legibility in Room 4:** Adding vertical elevation markers (`+4t`, `+8t`, `+12t`, `+16t`) inside Room 4 makes chain-climbing height gains immediately readable to playtesters without cluttering the playfield.
- Known Issues / Next Steps:
  - Stage 5 will implement **Slopes, Butt-Slide Physics & Enemy Bulldoze**, activating Room 5's `45°` and `26.5°` ramps cleanly.

---

### Stage 5: 2D Terrain Slopes, Butt-Slide, One-Way Semisolids & Moving Platforms
- Status: Complete
- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Slope Profiles & Normals | Exact `45°` (`dy/du = ±1.0`) & `26.57°` (`dy/du = ±0.5`), unit `n = normalize(-dy/du, 1)` | Exact `±45.000°` (`±0.7071, 0.7071`) & `±26.565°` (`±0.4472, 0.8944`) | Pass |
| Downhill Ground Adhesion | `<= 0.40t` frame projection, `100` traversals (`45°` & `26.5°`), `0` disconnects, `\|vy\| <= 1.0` | `100/100` downhill trials + full Room 5 hill traversal: `0` disconnects, `\|vy\| <= 1.0` | Pass |
| Slope Butt-Slide (`>= 14°`) | `a = g*sin(theta) - 0.04*g*cos(theta)`, cap `14.50 t/s`, ignores uphill input | Reaches `> 12.0 t/s` (`<= 14.50` cap) on 8-tile `26.57°` chute; uphill input ignored | Pass |
| Flat Runout & Slide Lethality | Flat crouch slide decel `11.20 t/s²`; `isSlideLethal` at `>= 6.00 t/s`; slide jump keeps `vx` | `11.20 t/s²` frame-exact runout decel; `LETHAL` activates at `6.00 t/s`; slide jump preserves `vx` (`< 0.05` delta) | Pass |
| One-Way Semisolid Platforms | `100/100` pass from below, `100/100` land from above, `Down+Jump` drops 1 layer | `100/100` below (`0` ceiling bonks), `100/100` above, `Y=10.0 -> 6.0` clean drop-through | Pass |
| Moving Platform Carry & Inherit | 60 Hz update pre-player, exact `(deltaX, deltaY)` carry, jump inherits platform `vel.x` | Zero relative slip (`< 1e-5` t) on linear shuttle & 270f sine elevator; jump adds `5.00 t/s` `vel.x` | Pass |
| Mixed Terrain Fuzz & Parity | `10,000` random-input frames in Room 5: `0` NaN, `0` tunneling, `100%` deterministic | `10,000/10,000` frames safe, exact identical `stateHash` & coordinates across runs | Pass |

- **8-Point Adversarial Feel Review:**
  1. **Slope Earth-Fill Seam Sealing:** Initially, ascending `45°` tiles `(6,2)->(7,3)` stalled when the player's leading right edge touched the sealed solid earth fill `(7,2)` directly underneath `(7,3)` inside `_resolveSlopes`'s upward overlap check. Adding `_overlapsSolidOnSlope` (ignoring solid tiles on `slopeRow` sealed by `hRight >= 1.0` / `hLeft >= 1.0` or buried beneath `isSlope(col, row + 1)`) plus lowering `_isFaceSealedBySlope`'s base threshold to `row - 0.05` delivered completely seamless uphill & downhill crest transitions across both `45°` and `26.57°` hills.
  2. **Downhill Ground Adhesion Without Airborne Pop:** Projecting grounded feet up to `0.40 tiles/frame` onto descending slope wedges and onto `slope -> flat` exits keeps Mario glued across `45°` and `26.57°` descents from `3.0 t/s` to `14.5 t/s` with zero airborne flicker and zero `vy` spikes (`<= 1.0 t/s`).
  3. **Explosive Slope Butt-Slide & Slide Jump:** Crouching on `>= 14°` inclines drives tangential downhill acceleration `g*sin(theta) - 0.04*g*cos(theta)` up to `14.50 t/s`, locks out opposite uphill input during the slide, carries momentum seamlessly into the `11.20 t/s²` flat runout, and preserves exact pre-jump horizontal velocity when launching a slide jump.
  4. **Clear Lethal Bulldoze Feedback:** Once slide speed reaches `6.00 t/s`, `isSlideLethal` triggers a glowing emerald aura, high-speed trailing dirt spray particles, pitch-modulated grind audio, top-center `BUTT SLIDE · LETHAL` banner, `LETHAL SLIDE!` speedometer callout, and green `LETHAL` telemetry badge.
  5. **Stacked One-Way Semisolid Discipline:** Separating `standingOnSemisolid` from `standingOnSolid` ensures `Down + Jump` drops cleanly through a single semisolid layer (`dropThroughFloorY` window) onto lower semisolids (`Y=10.0 -> Y=6.0` verified in headless & Playwright browser runs) while preventing accidental drops when straddling adjacent solid tiles.
  6. **Pre-Tick Moving Platform Carry & Momentum Transfer:** Advancing `MovingPlatform` entities strictly prior to `player.update` inside `_fixedUpdate`, transferring `(deltaX, deltaY)` via `applyPlatformCarry`, and inheriting `plat.vel.x` on jump (including `5f` coyote platform grace) gives rock-solid rider lock on horizontal linear shuttles and vertical sine elevators.
  7. **10,000-Frame Mixed Terrain Robustness:** Deterministic fuzzing across Room 5 (`45°`, `26.57°`, stacked semisolids, horizontal & vertical platforms) confirmed `0` NaN, `0` solid overlaps, `0` out-of-bounds tunneling, and byte-identical FNV-1a final state hashes.
  8. **HUD & World-Space Prompt Clarity (Browser-Verified):** Fixed `SLIDE SAFE` badge line-wrapping in `TelemetryHUD` (`18px` uniform badge row), widened `SpeedometerHUD` for single-line `LETHAL SLIDE!`, and raised Room 5's `SEMISOLID [↓+Z]` world cue (`Y=12.1`) clear of Mario's head at `1440×900` and `1280×720` with zero console errors.
- Known Issues / Next Steps:
  - Stage 6 will load the raster `Grassland_Tileset.png` atlas (`TileAtlas.js`) with `9`-slice autotiling, slope tile UVs, parallax backdrops, and foliage inset visual alignment.

---

### Stage 6: 2D Sprite Environment Level Kit, Scenic Atmosphere & Block Interaction UX
- Status: Complete
- Architecture & Atlas Audit Additions:
  - `TileAtlas.js` (`/tilesets/Grassland_Tileset.png`, `1876×3230` px, `10px` `#00AAFF` outer borders, Atlas 1 Day `Y=10..1609`, Atlas 2 Twilight `Y=1620..3219`) performs `#00AAFF` chroma-keying to `alpha=0`, half-texel UV inset clamping (`u0/v0 + 0.5/w`, `u1/v1 - 0.5/w`), and pre-slices verified `64×64` slot canvases (`GRASSLAND_ATLAS_SLOTS`) for O(1) runtime blitting (`0.5ms` render frame).
  - Empirical pixel audit verified actual `64×64` slot coordinates inside `Grassland_Tileset.png` (`[1,0]` `TOP_GRASS`, `[0,0]`/`[2,0]` grass corners, `[1,1]` `INTERIOR_EARTH`, `[0,1]`/`[2,1]` cliff walls, `[12..19, 1..2]` `45°` & `26.57°` slope/transition wedges), while pre-baking crisp `64×64` offscreen sprites for `[?]` (3-frame), Brick, Hard, Used, 2-tile Warp Pipes, Semisolid Mushroom Caps & Stalks, 4-frame Spinning Coins, and Foreground Foliage Tufts.
  - `TileAutotiler.js` implements 9-slice role assignment across Rooms 1–6 (excluding `PIPE` from blocking `hasUp` so meadow grass runs unbroken underneath Warp Pipes) and routes into `GeometryLint.js` (`lintAllRooms`) verifying 100% tile-to-collider parity.
  - `LevelKitSystem.js`, `AudioManager.js`, and `ParticleSystem.js` deliver deterministic `60 Hz` `6`-frame sine-wave bumps (`12px = 0.1875t`), `[?] -> USED` + `2.5t` hopping coins, sprint (`|vx| >= 5.5 t/s`) / Ground Pound 4-fragment brick shatters, 24 world coin pickups, Goal Flagpole capture & descent, and procedural Web Audio chimes.

- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Grassland Atlas & Half-Texel UVs | `1876×3230` px, `10px` borders, Atlas 1 `Y=10` / Atlas 2 `Y=1620`, `#00AAFF` keyed out, half-texel UVs | Exact pixel rects verified for Day/Twilight `SLOPE_45`/`SLOPE_26`/9-slice slots; zero bleed or `#00AAFF` pixels | Pass |
| Geometry Lint Parity | `0` rendered-vs-collision mismatches across all benchmark rooms | `0` mismatches across all 6 rooms (`Runway`, `Gaps`, `Jump`, `Wall`, `Slopes`, `Grassland Kit`) | Pass |
| Question Block Bump & Coin Hop | `6`-frame sine bump (`12px = 0.1875t`), `[?]->USED`, `2.50t` hopping coin + chime | `6/6` bump frames peaking `+0.1875t`, `[?]->USED_BLOCK`, coin arc peak `2.500t`, `coinsCollected +1` | Pass |
| Brick Bump vs 4-Shard Shatter | Gentle walk bump keeps Brick intact; sprint (`>= 5.5 t/s`) or Ground Pound shatters into `4` shards | Walk bump keeps `BRICK_BLOCK` (`6f` bump); Sprint head-hit & Ground Pound both spawn `4` rotating shards & clear tile | Pass |
| 5-Plane Parallax & Atmosphere | `0.10x` sky/clouds, `0.40x` hills, `0.85x` cliffs, `1.00x` world, `1.10x` foreground foliage, subtle vignette, `[V]` Day/Twilight | All 5 parallax layers scroll smoothly without tearing; baked cloud sprites eliminate Dusk seams; vignette frames viewport | Pass |
| 5px Foliage Overhang Alignment | Grass blade tips extend `5px` (`~0.08t`) above `Y=0`, matching `foliageInset` | `_drawFoliageOverhang` draws quadratic grass tips `+5px` above top ground/semisolid faces | Pass |
| 60 Hz Determinism & Browser Check | Twin 600-frame Room 6 runs bit-identical; `1440×900` & `1280×720` zero UI overlaps & `0` console errors | Bit-identical FNV-1a hashes (`0` drift); `42/42` automated Stage 1–6 unit tests pass; Playwright checks `0` errors | Pass |

- **8-Point Adversarial Feel Review:**
  1. **Tilemap Reset Discipline & Determinism:** Breaking bricks or spending `[?]` blocks mutates the live `TileMap`; cloning the template blueprint inside `GameEngine.loadRoom()` ensures pressing `[R]` or toggling rooms deterministically restores every broken brick, `[?]` block, world coin, and Goal Flagpole state.
  2. **Pre-Sliced Atlas Caching (`0.5ms` Render Budget):** Slicing `ctx.drawImage` across a 6MB `1876×3230` PNG hundreds of times per frame caused slow SwiftShader software paints; pre-slicing verified `64×64` slot tiles into cached offscreen `<canvas>` surfaces inside `_sliceVerifiedAtlasTiles` dropped full-scene render cost to `~0.5ms` and locked 60fps.
  3. **Forgiving Brick Shatter Conditions:** Requiring both `absVx >= 5.5 t/s` (achieved easily during sprint runs) OR `fromGroundPound` ensures players can bust Brick Bridges either horizontally from underneath at speed or explosively from above with a Ground Pound, while gentle standing bumps playfully bounce bricks instead of accidentally deleting platforms.
  4. **6-Frame Bump + Non-Disruptive Presentation:** Applying the `sin(progress * Math.PI) * 0.1875t` offset purely in `Renderer.drawTileMap` preserves crisp swept AABB ceiling/floor queries (`GeometryLint` `0` mismatches) with zero phantom collision snags during bumps.
  5. **Warp Pipe Meadow Continuity:** Initially treating `PIPE` tiles as an upper occluder broke top grass right underneath pipes (`TileAutotiler`). Excluding `PIPE` from `hasUp` lets NSMBU grass blades flow uninterrupted under every Warp Pipe collar/shaft.
  6. **Twilight Cloud Silhouette Purity & Semisolid Harmony:** Semi-transparent multi-circle Dusk clouds exposed internal Venn-diagram seams; baking Day and Dusk cloud sprites onto opaque offscreen canvases stamped once with `globalAlpha` plus harmonizing Dusk semisolid moss (`#134E4A` / `#2DD4BF`) keeps `[V]` Twilight visually cohesive.
  7. **Foliage Overhang (`5px`) Without Neon Boxiness:** Rendering tapered dual-tone quadratic grass blades (`#2AA818`/`#58D628` Day, `#0F766E`/`#2DD4BF` Dusk) instead of flat bars keeps Mario's boots nestled organically into grass tips (`0.08t` match).
  8. **Responsive `1280×720` & `1440×900` Top Bar + Zero-Re-Render Coin HUD:** Merging the room switcher and debug controls into a flex `topHeader` fixed `Room 5: Slopes & Platforms` clipping at `1280px`, while direct DOM ref updates (`subscribeUITick`) keep bottom-left coin increments (`00 / 24`) and `CLEAR!` badges completely free of React re-renders.
- Known Issues / Next Steps:
  - Stage 7 will implement the **2.5D Perspective Camera, Look-Ahead Springs & Viewport Dynamics** (`30°` FOV projection framing, `0.20s` critically damped horizontal follow, vertical dead-zone stability, and sprint FOV expansion).

---

### Stage 7: 2.5D Camera System, Cinematography & Viewport Dynamics
- Status: Complete
- Architecture & Audit Additions:
  - Audited and repaired all regressions left by an earlier unfinished Stage 7 attempt: moved `CameraController` ownership into `GameEngine` so camera kinematics update strictly inside the fixed `60 Hz` `_fixedUpdate(dt)` loop (with sub-frame render interpolation `getRenderState(alpha)` in `_render(alpha)`), eliminated double trauma decay per tick, and replaced no-op `if (engine.renderer)` test guards with 8 real headless test suites.
  - `CameraController.js` configures a `THREE.PerspectiveCamera` (`30°` vertical FOV at rest, `Z = +18.0` tiles, `4°` downward pitch toward the `Z = 0.0` gameplay plane, framing `22.0` tiles horizontally in `16:9`), synchronized with the 2.5D viewport renderer.
  - Dynamic Horizontal Lead (`+3.00` tiles scaled linearly by `|vx| / runTopSpeed`, `0.50`-tile central deadzone, `0.20s` critically damped spring + velocity feedforward, `0.40s` smooth reversal easing) settles the player at `42.22%` of screen width during full right sprints (`35%–48%` target band).
  - Vertical Calm anchors grounded elevation at `35%` of base viewport height (`baseViewH`), keeping camera vertical drift at `0.0000` tiles (`< 0.25t` target) during both full standing (`4.10t`) and full sprint (`4.85t`) jumps on flat ground, while easing to new ledge elevations over `0.60s` via a cubic Hermite smoothstep curve on landing and enforcing a `20%–75%` aerial safety clamp.
  - Fast-Fall Look-Down (`vy < -14.0 t/s` below anchor elevation or during Ground Pound) pans downward up to `2.0` tiles so the landing floor is framed with `>= 2.5` tiles (`4.20t` measured) of advance visibility.
  - Unified Camera Shake API (`ScreenShake.js`) combines quadratic translational shake (`offsetX`, `offsetY`) with rotational roll (`rollDeg`) and directional pitch (`pitchDeg`) perturbation (`0.65` trauma decaying linearly to `0.00` over `0.40s`).
  - Added `[F4]` Camera Debug Visualization Mode (world-space deadzone box, `20%/75%` aerial safety lines, elevation anchor line, and look-ahead target crosshair), peripheral high-speed sprint vignettes + `+2.0°` FOV expansion (`30.0° -> 32.0°` above `8.0 t/s`), `TelemetryHUD` camera readouts, and a live `Camera (Stage 7)` folder in `TuningPanel`.

- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Perspective Camera Setup | `THREE.PerspectiveCamera` `30°` FOV, `Z = +18.0t`, `-4°` downward pitch, `~22t` (`16:9`) | `30.0°` FOV (`32.0°` sprint), `Z = +18.00t`, `-4.00°` pitch, `22.00t × 12.38t` framing | Pass |
| Full Sprint Horizontal Framing | Dynamic look-ahead up to `3.0t`, `0.20s` spring, `0.50t` deadzone; player `35%–48%` screen X | `+3.000t` look-ahead; player settles at `42.22%` screen X; `0.0000t` drift inside `0.50t` deadzone | Pass |
| Direction Reversal Easing | Smooth look-ahead reversal across `0.40s` without jarring camera jerks | Smooth `+3.00t -> -3.00t` transition over `0.40s` (`max Δlook = 0.27t/f`, `max ΔcamX = 0.29t/f`) | Pass |
| Vertical Calm (Flat Jumps) | `< 0.25` tiles vertical camera displacement during standing (`4.10t`) & sprint (`4.85t`) jumps | `0.0000` tiles vertical camera displacement on both standing (`4.10t`) and sprint (`4.85t`) jumps | Pass |
| 6-Tile Ledge Jump & Re-Centering | Never breaches top `15%` (`<= 85%`) of viewport; eases to new elevation over `0.60s` upon landing | Max screen Y `82.73%` (`<= 85%`); cubic Hermite elevation ease settles `+6.00t` in `0.60s` (`36f`) | Pass |
| Fast-Fall / Ground Pound Look-Down | `vy < -14.0 t/s` pans down up to `2.0t`; frames landing floor with `>= 2.5t` advance visibility | Pans down `1.88t` (`<= 2.0t`); frames floor with `4.20t` (`>= 2.5t`) advance visibility | Pass |
| Boundary Clamping & Shake Parity | Zero off-map void across Rooms 1–6; `0.65` trauma decays in `0.40s`; `30/60/144 Hz` bit-identical | Zero negative/off-map void across Rooms 1–6; `0.40s` decay; `0.0000` drift across `30/60/144 Hz` | Pass |

- **8-Point Adversarial Feel Review:**
  1. **Strict 60 Hz Camera Simulation vs Render Interpolation:** Previously, updating `CameraController` inside `_render(alpha)` caused camera springs and screen trauma to run faster on 144 Hz monitors and continue mutating while paused. Moving `camera.updateFromPlayer()` strictly into `_fixedUpdate(dt)` and reading `camera.getRenderState(alpha)` in `_render(alpha)` guarantees bit-identical camera trajectories across 30 Hz, 60 Hz, and 144 Hz displays.
  2. **True Vertical Calm During Normal Jump Descent:** A standard `4.10t` jump reaches `vy = -18.5 t/s` right before returning to its launch floor, which naively trips a raw `vy < -14.0 t/s` fast-fall check on flat ground. Gating fast-fall look-down on `isGroundPound || (vy < -14.0 && playerY < anchorElevationY - 0.15)` keeps flat-ground standing and sprint jumps 100% vertically locked (`0.0000t` drift) while still engaging immediately when diving or dropping below ledge level.
  3. **Symmetric Sprint FOV Expansion (`+2.0°` Above `8.0 t/s`):** Computing vertical calm targets from `baseViewH` (`30°` reference frustum height) ensures that the `+2.0°` sprint FOV zoom expands symmetrically around the optical axis without shifting the grounded baseline elevation.
  4. **Velocity-Feedforward Spring Follow (`42.22%` Screen X):** Pure spring lag on a moving target can let a sprinting character drift past the center of the screen; combining the `0.20s` critically damped spring with velocity feedforward locks steady-state right sprint framing at `42.22%` of viewport width, giving `57.78%` (`~12.7` tiles) of forward sightline.
  5. **Jerk-Free `0.40s` Turnaround Easing:** Reversing from full right sprint (`+3.0t` lead) to full left sprint (`-3.0t` lead) routes through a dedicated critically damped look-ahead filter (`reversalEaseTime = 0.40s`) before feeding the `0.50t` deadzone, eliminating turnaround snap.
  6. **Two-Stage Vertical Ledge Framing (`75%` Clamp + `0.60s` Landing Ease):** Jumping onto a `6.0`-tile-high ledge smoothly engages the `75%` upper aerial safety clamp near the apex so Mario never breaches the top `15%` (`max = 82.73%`), then finishes re-centering to the new `35%` grounded baseline via a `0.60s` cubic Hermite curve upon landing.
  7. **Narrow-Shaft Boundary Safety (Rooms 3 & 4):** When a vertical shaft room (`cols = 15` or `20`) is narrower than the `22.0`-tile reference frustum, clamping `camera.x = 0` prevents negative world X coordinates on the left wall.
  8. **First-Class Cinematography & Debug Tooling (`[F4]`):** Pressing `[F4]` (or clicking `F4 Cam`) renders the live deadzone rectangle, `20%/75%` aerial safety lines, gold elevation anchor line, and rose look-ahead target crosshair directly in world space, paired with live `CAM`/`LOOK`/`SCR X/Y`/`FOV` telemetry in `[F3]` and 14 live tuning sliders in `[U]`.
- Known Issues / Next Steps:
  - Stage 8 will replace the procedural 2D character placeholder with the 3D rigged skeletal meshes (`mario.glb` & `luigi.glb`), implementing socket alignment, `20°` 3/4 yaw presentation tilt, and the 27-track animation state machine.

---

### Stage 8: 3D Rigged Character Integration, Expressive Rig & Character Switcher
- Status: Complete
- Architecture & Rig Integration Additions:
  - `CharacterRig3D.js` integrates Three.js `GLTFLoader` + `RoomEnvironment` IBL + warm key / cool rim / sky-ground hemisphere 3-point lighting on a transparent WebGL `<canvas>` composited seamlessly between world tiles/particles (`drawTileMap` / `drawParticles`) and foreground meadow overhang (`drawForegroundParallax`), locking `0.08t` (`5px`) boot inset into grass blades while grounded.
  - Both `/models/mario.glb` and `/models/luigi.glb` load all `27` baked skeletal animation clips across the verified `Mario_Armature -> mario_all_root -> skl_root -> spin -> face_1` hierarchy (`headAttached: true`, keeping head & cap 100% affixed to `face_1` across all 27 states), normalized cleanly to `visualHeightTiles = 1.80` at `(feetX, feetY, Z=0.0)` with `±20°` Wonder 3/4 camera yaw tilt (`±70°` yaw).
  - `AnimationMixer` crossfades across all `27` clips (`0.10–0.15s` smooth blends, `0.08s` snappy blends for `Jump`/`Skid`/`Land`, plus combo chains `Jump`/`DoubleJump`/`TripleJump`, `TurnAround`, `GroundPound`/`GroundPoundLand`, and `Victory`).
  - Volume-preserving Squash & Stretch (`computeVolumePreservingSquash`) scales `skl_root` (`pelvisBone`) and `spin` (`spineBone`) along their verified glTF bone-local vertical `X` axis (`scale.set(sy, sxz, sxz)`) with `Sx = Sz = 1 / sqrt(Sy)` (`Sx * Sy * Sz = 1.000`, `±0.02` bound) on Jump takeoff (`Sy = 1.28`), 5-frame Landing impact (`Sy = 0.74`), and Crouch (`Sy = 0.50`), while keeping physics hitboxes (`0.80×1.80` / `0.80×0.90`) strictly decoupled.
  - Instant `[C]` / HUD Character Hot-Swap (`PlayerController.setCharacter`, `GameEngine.toggleCharacter`) switches between **Mario** (`g_rise = 42.80`, `groundFriction = 22.0`) and **Luigi** (`g_rise = 40.00`, `launchVelocity = 18.45` for `~5%` higher standing apex, `groundFriction = 19.0` lower traction, and active `FlutterJump` scuttle animation + buoyant fall clamp when holding Jump on descent) with zero position/velocity hitch.
  - `[F5]` Pose & Animation Inspector (`PoseInspectorPanel.jsx`) pauses physics while keeping the 3D WebGL viewport active to scrub all `27` clips grouped by Locomotion/Aerial/Combat, switch Mario/Luigi, preview 3/4 yaw (`-45°..+45°`), toggle world-aligned `THREE.SkeletonHelper` (`updateMatrixWorld(true)` at scene root), and toggle PBR wireframe mode.
  - Normalized `Run` & `Sprint` clip footstep strike phases (`0.12`/`0.62` and `0.15`/`0.65`) emit synchronized boot-heel dust puffs behind the character.

- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| GLB Integrity & Hierarchy | `27` clips in `mario.glb` & `luigi.glb`; `skl_root -> spin -> face_1` unbroken | `27/27` clips verified in both GLBs; `headAttached: true` across all clips | Pass |
| 2.5D Placement & Gaze | Root `(feetX, feetY, Z=0.0)`, `0.08t` (`5px`) foliage inset, `20°` 3/4 tilt (`±70°` yaw) | `foliageInset = 0.08t` (`5px` rounded); `cameraYawTiltDeg = 20.0°` (`±70°` yaw) | Pass |
| Volume-Preserving Squash | Pelvis/Spine `Sx = Sz = 1/sqrt(Sy)`, `Sx * Sy * Sz = 1.00 ± 0.02`; Jump `1.28`, Land `0.74` (`5f`), Crouch `0.50` | `combinedVolume = 1.000` (`0.000` drift); hitboxes unchanged (`0.80×1.80` / `0.80×0.90`) | Pass |
| Presentation Decoupling | `0` physics drift when toggling 3D queries (`600f` determinism) | Twin `600`-frame state hashes bit-identical with presentation queries on vs off | Pass |
| Mario vs Luigi & Hot-Swap | `[C]` zero-hitch swap; Luigi `g_rise=40.0`, `friction=19.0`, `~5%` higher apex, `FlutterJump` | Zero `(x,y,vx,vy)` hitch; Luigi `+5%` apex & longer slide verified; `FlutterJump` active (`10+` frames buoyant) | Pass |
| `[F5]` Pose Inspector & Browser | All `27` clips scrubbable, `SkeletonHelper` & wireframe toggles, `0` console errors at `1440×900` & `1280×720` | Instant paused clip switch (`Victory`), aligned `SkeletonHelper`, wireframe, live `FlutterJump` video, `56/56` tests, `0` console errors | Pass |

- **8-Point Adversarial Feel Review:**
  1. **Zero-Hitch Character Hot-Swap (`[C]`):** Re-binding `MovementProfile` character parameters via `applyCharacterProfile` updates `gravityRising`, `launchVelocity`, and `groundFriction` in place without resetting `pos`, `vel`, or momentum timers—even mid-jump or mid-sprint—so comparing Mario vs Luigi feel takes a single tap.
  2. **GlTF Bone-Local Axis Verification (`localX = Up`):** Initial assumptions that Three.js bone `Y` equals vertical stretch deform characters sideways in `mario.glb`/`luigi.glb`. Auditing actual bind matrices confirmed `localX` points world-up (`[0,1,0]`), so applying `scale.set(sy, sxz, sxz)` to `skl_root` and `spin` yields true vertical volume-preserving squash & stretch without lateral pinching.
  3. **Boot-Planted Landing Root Compensation:** Compressing `skl_root` downward lifts or sinks the mesh unless compensated; offsetting `modelPivot.position.y` by `(squash.pelvisSy - 1.0) * hipHeightTiles * 0.45` keeps Mario and Luigi's boots anchored cleanly behind the `5px` grass overhang during impact squash.
  4. **Luigi `FlutterJump` Expressiveness & Agency:** Requiring descending state (`vy < 0.5`) while actively holding Jump prevents accidental flutter triggers on takeoff while immediately clamping downward velocity cleanly (`FlutterJump` scuttle + emerald wind halo), giving Luigi distinct aerial rescue feel from Mario's crisper arc.
  5. **Clean `SkeletonHelper` World Alignment:** Parenting `THREE.SkeletonHelper` under a scaled/rotated container doubles its world transform matrix; parenting `skeletonHelper` directly at `scene` root and calling `skeletonHelper.updateMatrixWorld(true)` aligns every cyan bone line squarely over Mario and Luigi's live joints.
  6. **Instant Paused Clip Inspection (`[F5]`):** Standard `0.06s`–`0.15s` `AnimationMixer` crossfades stall when gameplay is paused (`dt = 0`). Zeroing fade weights of inactive clips and setting `effectiveWeight = 1.0` when paused in Pose Inspector makes clicking `Victory`, `FlutterJump`, or `WallSlide` snap into pose immediately for frame scrubbing.
  7. **Top-Bar Compactness & SwiftShader Pacing (`1280×720`):** Compacting toolbar pills prevented `. Step` (shown when paused) from wrapping onto a second line and colliding with the `PoseInspectorPanel` close button, while SwiftShader `fenceSync` (`afterDraw`) + `GameLoop` pacing keeps 3D + 2D dual-canvas rendering smooth in software-GL Chromium (`0` console errors/warnings).
  8. **Footstep Dust & Audio-Visual Synchronization:** Tying Run/Sprint heel dust emissions directly to normalized clip footstep strike crossings rather than arbitrary timers locks visual puffs visually to Luigi and Mario's alternating boot plants across speed transitions.
- Known Issues / Next Steps:
  - Stage 9 will populate the world with active gameplay entities (Goomba patrols, stomp rebounds, Super Mushroom & Fire Flower power-ups, and Brick/Fireball interactions).

---

### Stage 9: Power-Ups, Combat Hitstop, Fireballs, Koopa Shells & Wonder HUD
- Status: Complete
- Architecture & Gameplay System Additions:
  - Added deterministic `CombatSystem` (`Goomba`, `Koopa Troopa` / `Shell`, `Spiny`), `PowerUpSystem` (`SuperMushroom`, `FireFlower`), `ProjectileSystem` (`Fireball`), and floating Wonder-style starburst callouts (`"Good!"`, `"Great!"`, `"Super!"`, `"Wonderful!"`) synchronized cleanly inside the 60 Hz simulation loop.
  - **Enemy Kinematics & Stomp Generosity:** Goomba patrols at `1.80 t/s` with wall & optional ledge turnarounds; Koopa patrols and retracts cleanly into a kickable shell (`10.50 t/s`, infinite wall-bounce sweeps with zero tunneling); Spiny rejects top stomps (requires Fireball, kicked shell, or Butt-Slide KO). All top stomps enforce the generous `20%` top overlap window (`+ 3f` combat hitstop, `15%` Goomba pancake squash, `~2.1t` passive rebound vs `>= 4.0t` active Jump-held chain rebound).
  - **Power-Up Progression & Hitstop Feedback:** Bump-spawning `[?]` blocks yield `SuperMushroom` (Small → Super with `6f` freeze hitstop, `18f` 3-stage elastic growth scale, and hitbox expansion) or `FireFlower` (enabling max `2` active bouncing fireballs at `±14.0 t/s`, `g = 38.0`, `0.85` floor bounce restitution, and brick/enemy sparks).
  - **Carryable Shell & Damage I-Frames:** Holding Run near a stationary Koopa shell picks it up (`85%` carry speed cap); releasing Run throws it forward at `10.50 t/s` for multi-enemy bowling combos. Taking damage triggers `120f` invincibility with deterministic `4f`-cadence alpha flicker and steps Fire → Super → Small → Defeat cleanly.
  - **Wonder HUD & Room 7 (`7 Cmb`):** Top-left arcade HUD (`M×Lives`, `Score`, `Coins`, `Form`, Stage/Clock, Sound) and Room 7 (`Enemy & Power-Up Arena`) let playtesters exercise stomp chains, fireball arcs, mushroom growth, and Koopa shell bowling right away.

- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Goomba Patrol & Stomp | `1.80 t/s`, top-20% stomp, `15%` pancake squash | `1.80 t/s` wall turn; `100/100` top-20% stomps pancake to `15%` | Pass |
| Passive vs Active Rebound | Passive `~2.1t` vs Jump-held `>= 4.0t` + `3f` hitstop | Passive `~2.1t`; Active `>= 4.0t`; 3-Goomba chain + `3f` hitstop | Pass |
| Super Mushroom Growth | Small → Super, `6f` hitstop, `18f` 3-stage elastic scale | `6f` hitstop, `18f` elastic scale, `"Good!"` starburst, `0.80×1.80` box | Pass |
| Fire Flower & Fireballs | Max `2` active, `±14.0 t/s`, `g=38.0`, `0.85` bounce | Max `2` enforced, `14.0 t/s`, `g=38`, `0.85` bounce + wall sparks | Pass |
| Koopa Shell Physics | `>= 10` wall bounces zero tunnel, `85%` carry, `10.50 t/s` throw | `>= 10` bounces verified zero tunnel; `85%` carry; `10.50 t/s` kick | Pass |
| Damage I-Frames & Flicker | `120f` i-frames, `4f` alpha flicker, clean downgrade | `120f` invincibility, `4f` flicker after `6f` hitstop, clean Defeat | Pass |

- **8-Point Adversarial Feel Review:**
  1. **Generous Top-20% Stomp Box & Coyote-Forgiving Chains:** Computing stomp eligibility across `playerFeet >= enemyTop - topRatio * enemyH` while descending ensures grazing mid-air jumps onto marching Goombas award joyous chain rebounds instead of cheap side hits.
  2. **Tactile `3f`/`6f` Combat & Growth Hitstop:** Freezing enemy/player integration for `3f` on stomp/shell-kick and `6f` on damage/mushroom growth punctuates impact weight without dropping held Jump inputs on rebound exit.
  3. **Fireball Arc Rhythm (`14.0 t/s`, `g=38`, `0.85` Bounce):** High forward velocity paired with crisp `0.85` floor bounce keeps fireballs hugging gentle terrain dips and clearing single-tile curbs cleanly.
  4. **Zero-Tunneling Shell Sweep:** Sub-stepping fast `10.50 t/s` Koopa shells inside swept AABB tile queries guarantees `10+` consecutive corridor wall bounces without ever slipping through 1-tile bricks or pipes.
  5. **Seamless Shell Pickup & Throw Agency:** Holding Run (`Shift`/`J`) cleanly cradles a stationary shell at `85%` walk/run speed and releases it horizontally on Run release with zero accidental self-damage frames.
  6. **Escalating Wonder Starbursts (`"Good!"` → `"Wonderful!"`):** Multi-stomp chains and Koopa bowling streaks increment combo tiers smoothly, rewarding skillful aerial chaining with crisp visual starbursts and Web Audio rising pitch chimes.
  7. **Legible `4f` Damage Flicker Beyond Hitstop:** Advancing invulnerability alpha flicker immediately after the `6f` damage hitstop clears ensures hurt-state visibility matches classic Nintendo invincibility cadence cleanly.
  8. **Isolated Room 7 Arena Calibration (`7 Cmb`):** Dedicated mushroom/fire `[?]` blocks, 3-Goomba stomp lane, Koopa bowling corridor, and Spiny hazard let testers validate every combat verb within seconds of spawning.
- Known Issues / Next Steps:
  - Stage 10 integrates Room 8 (`The Gauntlet`), live Feel Presets, HUD Performance Telemetry, and the automated 12/12 headless + interactive Verification Report Suite (`[F7]`).

---

### Stage 10: Master Integration, The Gauntlet Benchmark & Playtest Verification Suite
- Status: Complete
- Final Master Architecture & Verification Additions:
  - **Room 8 (`8 Gnt` — The Gauntlet):** End-to-end 295-tile master obstacle course uniting all 9 Sections **A–I** with instant `[1]`–`[9]` / top-bar **A–I** Section Teleport (`teleportGauntletSection`): A Flat Runway, B 2–8t Gap Ladder, C 1–4t Vertical Step & Corner Nudge, D 3-Wide Wall-Jump Shaft, E Slope Hill & Butt-Slide Chute through Goombas, F Semisolid + Horizontal/Vertical Moving Platform Chasm, G Enemy Playground + Fire Flower + Koopa Bowling + Spiny, H Warp Pipe Suction (`[↓/S]`) into 1.0t Crawl Tunnel (`pipe_crawl` drops cleanly onto `exitX=261.25` crouched beneath col `261..271`), and I Goal Flagpole Staircase Finale.
  - **Live Feel Preset Switcher (`[P]` / Dropdown):** Instant zero-reset hot-swap across **Wonder Momentum** (`1.25 t/s` pop, `18.50` accel, `g_rise=42.80`, `6f` apex float, `50%` squash, `20°` yaw), **NSMBU Classic** (`0.00` pop, `16.00` accel, `g_rise=43.30`, `3f` float, `28%` squash, `0°` yaw), and **Snappy Arcade** (`2.00` pop, `24.00` accel, `g_rise=42.80`, `6f` float, `50%` squash, `20°` yaw).
  - **1-Click Automated Verification Modal (`[F7]` / `F7 Verify`) & `GauntletVerifier.js`:** Runs all `12/12` deterministic kinematic, geometry-lint (`17,331` tiles across Rooms 1–8), feel-preset (`Δpos=0`), and full Section **A–I** scripted Gauntlet completion + tick-0 replay desync checks (`2963` frames / `49.38s` @ 60 Hz, terminal FNV-1a hash `0xcb20d49a`, `0` desync), surfacing scorecard telemetry in-app and exporting `/PROTOTYPE_REPORT.md`.
  - **Performance Telemetry (`[F3]`):** Reports `FPS`, `SIM ms`, `DRAWS`, `HEAP`, `PRESET`, `HASH`, `POS`, `VEL`, and collision flags at throttled HUD cadence (`<= 12 Hz`, zero 60 Hz React re-renders).

- Measured vs Target Table:

| Metric | Target | Measured | Status |
| :--- | :--- | :--- | :--- |
| Visual-Collision Parity | `0` mismatches across Rooms 1–8 | `17,331` tiles · `0` errors across all `8` rooms | Pass |
| Gauntlet Section Teleport | Clean jump to Sections `A–I` (`1–9`) | Instant warp across all `9` sections (`A–I`) verified | Pass |
| Live Feel Preset Hot-Swap | Wonder / NSMBU / Arcade switch with `Δpos = 0` | `NSMBU:true`, `Arcade:true`, `Δpos = 0.000` | Pass |
| Warp Pipe & `1t` Tunnel | `[↓/S]` suction -> exit crouched -> clear `1.0t` tunnel | `Pipe:true`, `Exit:true`, `Clear:true` (`exitX=261.25`) | Pass |
| Full Gauntlet E2E Replay | Clear Section I Goal Pole & `0` replay desync | Cleared in `2963f` (`49.38s`), `26` coins, `3000` pts, `0-DESYNC` (`0xcb20d49a`) | Pass |
| Suite-Wide Verification | `100%` tests across Stages 1–10 + `[F7]` modal + `0` console errs | `65/65` tests pass (`stage1`–`stage10`); `12/12` GauntletVerifier PASS | Pass |

- **8-Point Adversarial Feel Review (Final Master Audit):**
  1. **Zero-Friction Full-Course Flow (Sections A–I):** Every transition from Section A's sprint runway through Section I's staircase links at natural player speed without dead-end traps or blind leaps; pipe exit (`exitX=261.25`) lands squarely beneath the `1.0t` crawl ceiling (`cols 261..271`) so crouched exit release preserves cap-snatch momentum.
  2. **Contrastive Feel Preset Expressiveness (`[P]`):** Toggling between Wonder Momentum, NSMBU Classic, and Snappy Arcade mid-run makes frame-1 start pop (`1.25` vs `0.00` vs `2.00`), crouch depth (`50%` vs `28%`), apex hang (`6f` vs `3f`), and 3/4 yaw (`20°` vs `0°`) immediately palpable without breaking position continuity.
  3. **Unbroken Deterministic Determinism:** Full 2,963-frame Room 8 automated clear replayed from tick 0 on a fresh `GameEngine` reproduces the exact FNV-1a terminal state hash (`0xcb20d49a`) bit-for-bit across all 9 obstacle sections.
  4. **Zero-Tunneling Across Extreme Combinations:** Sprint jumps (`6t+`), butt-slide Goomba bulldozing (`14.50 t/s`), moving platforms, wall-jump shaft kicks, fireball bounces, and warp pipes execute cleanly without corner snagging or tile seam friction.
  5. **Warp Pipe Suction Readability:** Standing atop `pipe_crawl` and holding `[↓/S]` delivers crisp downward slide interpolation before ejecting crouched inside the brick tunnel, matching authentic Mario pipe transition cadence.
  6. **1-Click Diagnostic & `[F7]` Report Transparency:** Any engineer or playtester can press `[F7]` at any frame to execute the entire 12-check suite directly in Chromium and inspect measured vs target deltas alongside live FPS/draw/heap telemetry (`[F3]`).
  7. **Balanced Dual-Canvas + Three.js Memory Hygiene:** Geometry instancing/batching (`WorldRenderer`) + single dual-rig `CharacterRig3D` keep draw calls lean and frame pacing steady at both `1440×900` and `1280×720` with zero WebGL leaks.
  8. **Final Cleanliness & Error Isolation:** Verified `0` app `fetch` monkey-patches or unhandled errors in codebase; all `65/65` unit/integration tests and `12/12` Gauntlet checks pass cleanly.
- Status Summary: All **10/10** stages complete and verified.
