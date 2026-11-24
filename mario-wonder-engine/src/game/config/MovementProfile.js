/**
 * MovementProfile — Centralized Kinematic Configuration
 * ======================================================
 * ALL kinematic constants, thresholds, gravity curves, and timings.
 * Zero magic numbers in gameplay or collision logic.
 * 
 * Source: MASTER_MOVEMENT_MECHANICS_SPECIFICATION.md v2.0.0
 * Calibrated against Super Mario Bros. Wonder frame-by-frame analysis.
 * 
 * Units:
 *   - Distances: tiles (1 tile = 64 pixels)
 *   - Velocities: tiles/second
 *   - Accelerations: tiles/second²
 *   - Time: seconds (simulation at 60 Hz, Δt ≈ 0.01667s)
 *   - Frames: at 60 Hz
 */

const MovementProfile = {

  // ─── SIMULATION ──────────────────────────────────────────────
  simulation: {
    fixedTimeStep: 1 / 60,                    // s — Fixed 60 Hz physics tick
    maxTicksPerFrame: 5,                      // Spiral-of-death clamp
    pixelsPerTile: 64,                        // px — 1 tile = 64 pixels = 1.0 world unit
  },

  // ─── PLAYER HITBOX ───────────────────────────────────────────
  hitbox: {
    width: 0.80,                              // tiles — Standing width
    height: 1.80,                             // tiles — Standing height
    crouchHeight: 0.90,                       // tiles — Crouched height (50% reduction)
    crouchWidth: 1.10,                        // tiles — Crouched width (Wonder ball form)
    foliageInset: 0.08,                       // tiles — Feet sink 5px into grass
  },

  // ─── GROUND LOCOMOTION ───────────────────────────────────────
  locomotion: {
    walkTopSpeed: 5.20,                       // tiles/s — Max walk speed (no Run held)
    runTopSpeed: 9.20,                        // tiles/s — Max sprint speed (Run held)
    startImpulse: 1.25,                       // tiles/s — Frame-1 anti-sluggish pop from rest
    groundAccel: 18.50,                       // tiles/s² — Base horizontal acceleration
    lowSpeedAccelBoost: 0.16,                 // scalar — Non-linear boost below walkTopSpeed (hits 5.20 in ~0.21s)
    highSpeedAccelTaper: 0.05,                // scalar — Gentle taper approaching runTopSpeed (hits 9.20 in ~0.43s)
    groundFriction: 22.00,                    // tiles/s² — Release deceleration
    stopThreshold: 0.30,                      // tiles/s — Below this, snap vx to 0
    crouchCrawlSpeed: 2.00,                   // tiles/s — Slow crawl when trapped under 1-tile ceiling
  },

  // ─── SKID & PIVOT ───────────────────────────────────────────
  skid: {
    threshold: 4.50,                          // tiles/s — Speed required to trigger skid
    decel: 44.00,                             // tiles/s² — Skid deceleration
    pivotAccelMultiplier: 3.0,                // × — Low-speed pivot turn acceleration factor
    pivotFrames: 4,                           // frames — Pivot turn duration
  },

  // ─── CROUCH & SLIDE ──────────────────────────────────────────
  crouch: {
    heightReduction: 0.50,                    // scalar — 50% height reduction
    flatSlideDecel: 14.50,                    // tiles/s² — Flat-ground crouch slide friction
  },

  // ─── VFX & AUDIO TIMING ──────────────────────────────────────
  vfx: {
    sprintDustMinSpeed: 7.00,                 // tiles/s — Minimum speed for sprint foot-dust
    sprintDustIntervalFrames: 6,              // frames — 3-puff dust kick cadence
    skidSmokeIntervalFrames: 3,               // frames — Skid smoke puff cadence
    footstepStrideWalk: 1.65,                 // tiles — Distance between walk footstep ticks
    footstepStrideRun: 2.05,                  // tiles — Distance between run/sprint footstep ticks
    landingDustMinSpeed: 4.00,                // tiles/s — Min downward speed for landing shockwave dust
    apexSparkleIntervalFrames: 2,             // frames — Wind/star glint spawn cadence during apex float
  },

  // ─── JUMP (Two-Phase Asymmetric Arc) ─────────────────────────
  jump: {
    apexHeight: 4.10,                         // tiles — Standing full jump target height
    timeToApex: 0.43,                         // s — Time from launch to apex (26 frames)
    launchVelocity: 18.60,                    // tiles/s — v0 = 2h/t
    gravityRising: 42.80,                     // tiles/s² — g_rise = 2h/t²
    gravityFalling: 62.00,                    // tiles/s² — g_fall = 1.45 × g_rise
    terminalFallSpeed: 23.50,                 // tiles/s — Maximum downward speed
    minRiseFrames: 3,                         // frames — Minimum rise before early cutoff
    earlyReleaseMult: 3.20,                   // × — Gravity multiplier on early jump release
    runBoostFactor: 0.10,                     // scalar — v0 scales by (1 + 0.10 × |vx|/runTop)
    comboGraceFrames: 14,                     // frames — Ground landing window (0.23s) to chain Jump -> DoubleJump -> TripleJump
    comboMinSpeed: 2.00,                      // tiles/s — Minimum horizontal speed to advance Triple Jump combo
    doubleJumpVyMult: 1.08,                   // × — Jump 2 (DoubleJump) vertical launch multiplier
    doubleJumpVxMult: 1.05,                   // × — Jump 2 air speed cap & forward distance multiplier
    doubleJumpVxImpulse: 0.35,                // tiles/s — Jump 2 forward momentum kick
    tripleJumpVyMult: 1.18,                   // × — Jump 3 (TripleJump) vertical launch multiplier
    tripleJumpVxMult: 1.14,                   // × — Jump 3 air speed cap & forward distance multiplier
    tripleJumpVxImpulse: 0.85,                // tiles/s — Jump 3 forward propulsion boost
  },

  // ─── APEX FLOAT (Buoyant Hang) ──────────────────────────────
  apexFloat: {
    vyThreshold: 1.80,                        // tiles/s — |vy| below which float activates
    gravityMultiplier: 0.65,                  // × — Gravity reduction during float
    maxFrames: 6,                             // frames — Maximum float duration
  },

  // ─── AIR CONTROL ─────────────────────────────────────────────
  airControl: {
    withVelocityMult: 0.85,                   // × — Pushing with velocity
    reverseInAirMult: 1.00,                   // × — Reversing in air
    noDragDecel: 3.00,                        // tiles/s² — No-input air drag
  },

  // ─── FORGIVENESS MECHANICS ───────────────────────────────────
  forgiveness: {
    coyoteFrames: 5,                          // frames — Ledge grace period (0.083s)
    jumpBufferFrames: 6,                      // frames — Pre-landing jump buffer (0.10s)
    ceilingCornerNudge: 0.25,                 // tiles — Max nudge to steer around ceiling corners
    ledgeStepUp: 0.20,                        // tiles — Snap-onto-platform tolerance
    ledgeStepUpMaxVy: 4.0,                    // tiles/s — Max upward velocity allowed for ledge step-up snap
    ceilingBonkVy: -2.0,                      // tiles/s — Downward velocity after ceiling bonk
  },

  // ─── MID-AIR SPIN TWIRL ─────────────────────────────────────
  spinTwirl: {
    upwardImpulse: 1.60,                      // tiles/s — Instant upward boost
    hoverVyClampMin: -1.50,                   // tiles/s — Clamp min during hover
    hoverVyClampMax: 1.50,                    // tiles/s — Clamp max during hover
    hoverDuration: 18,                        // frames — 0.30s helicopter hover
    hoverGravityMult: 0.04,                   // × — Near-zero helicopter hover gravity during 18f spin (extends airtime +0.30s)
    totalRotationDeg: 1080,                   // ° — 3 full rotations across hoverDuration (60°/frame)
    rotationSpeed: 1080,                      // °/s — Reference angular label
  },

  // ─── GROUNDED SPIN JUMP (SpinJump -> SpinAir until landing) ─
  spinJump: {
    launchVelocity: 19.60,                    // tiles/s — Grounded Spin Jump upward launch velocity
    runBoostFactor: 0.16,                     // scalar — Running Spin Jump boosts v0 up to +16% (beats normal jump)
    horizontalBoostFactor: 0.16,              // scalar — Running Spin Jump expands horizontal air speed cap up to +16%
    fallGravityMult: 0.42,                    // × — Buoyant helicopter descent while spinning in SpinAir until landing
    earlyReleaseMult: 2.40,                   // × — Gravity multiplier on early Spin release
    launchClipFrames: 12,                     // frames — Frames of initial SpinJump takeoff clip before SpinAir loop
    spinDegPerFrame: 26.0,                    // °/frame — Continuous yaw rotation rate throughout airborne SpinJump/SpinAir
  },

  // ─── WALL MECHANICS ──────────────────────────────────────────
  wall: {
    slideSpeed: 4.20,                         // tiles/s — Max wall slide descent
    jumpVx: 8.50,                             // tiles/s — Outward horizontal launch
    jumpVy: 16.80,                            // tiles/s — Upward vertical launch
    steeringLockFrames: 8,                    // frames — Input lockout toward wall after jump
    coyoteFrames: 5,                          // frames — Wall coyote window
  },

  // ─── GROUND POUND ───────────────────────────────────────────
  groundPound: {
    minClearance: 1.0,                        // tiles — Min ground clearance to initiate
    windupFrames: 10,                         // frames — Frozen mid-air before dive
    diveSpeed: 28.00,                         // tiles/s — Terminal dive velocity
    recoveryFrames: 10,                       // frames — Post-impact lockout
    screenTrauma: 0.65,                       // scalar — Screen shake trauma added on impact
    traumaDecay: 0.40,                        // s — Trauma decay duration from 0.65 to 0
    traumaMaxOffset: 0.42,                    // tiles — Max camera shake displacement at trauma=1
    traumaMaxAngleDeg: 1.4,                   // ° — Max camera shake roll perturbation at trauma=1
  },

  // ─── SLOPES ──────────────────────────────────────────────────
  slopes: {
    adhesionSnapDistance: 0.40,               // tiles — Max downhill ground adhesion snap
    buttSlideMinAngle: 14.0,                  // ° — Minimum slope angle for butt-slide
    buttSlideFrictionCoeff: 0.04,             // scalar — μ_slide kinetic friction
    buttSlideMaxSpeed: 14.50,                 // tiles/s — Max butt-slide velocity
    flatRunoutDecel: 11.20,                   // tiles/s² — Flat-ground slide runout friction
    enemyDefeatMinSpeed: 6.00,                // tiles/s — Min speed to defeat enemies while sliding
    uphillSpeedMult: 0.88,                    // × — 45° uphill walk/run speed factor
    downhillSpeedMult: 1.15,                  // × — 45° downhill walk/run speed factor
  },

  // ─── PLATFORMS & SEMISOLIDS ─────────────────────────────────
  platforms: {
    dropThroughFrames: 12,                    // frames — Semisolid drop-through grace window
    dropThroughNudgeY: 0.02,                  // tiles — Initial downward nudge on drop-through
  },

  // ─── COMBAT & ENEMIES (Stage 9) ───────────────────────────────
  combat: {
    stompZonePercent: 0.20,                   // scalar — Top 20% of enemy AABB
    stompPassiveVy: 10.50,                    // tiles/s — Rebound (jump released, ~2.1t height)
    stompActiveVy: 17.50,                     // tiles/s — Rebound (jump held, ~4.0t+ height)
    stompPassiveGravityMult: 0.63,            // × — Ascent gravity factor on passive stomp rebound (2.1t peak)
    stompActiveGravityMult: 0.86,             // × — Ascent gravity factor on active stomp rebound (4.2t peak)
    stompHitstopFrames: 3,                    // frames — Impact freeze on enemy stomp
    damageRecoilVx: -6.50,                    // tiles/s — Horizontal knockback opposite facing
    damageRecoilVy: 8.00,                     // tiles/s — Vertical knockback pop
    damageRecoilLockFrames: 14,               // frames — Brief airborne knockback lock before full air steering
    damageHitstopFrames: 8,                   // frames (133ms) — Stage 20 heavy impact freeze on taking damage
    invulnerabilityFrames: 90,                // frames (1.5s at 60 Hz) — Stage 20 post-damage flashing window
    invulnerabilityFlickerFrames: 4,          // frames — Alpha flicker toggle period (0.30 <-> 1.00)
    invulnerabilityAlphaLow: 0.30,            // scalar — Minimum alpha during flicker
    invulnerabilityAlphaHigh: 1.00,           // scalar — Maximum alpha during flicker
    defeatPopVy: 12.50,                       // tiles/s — Upward defeat bounce when Small Mario is KO'd
    defeatResetFrames: 64,                    // frames — Frames before room resets after defeat fall
    shellStompGraceFrames: 8,                 // frames — Grace after stomping Koopa into shell
    shellKickSafetyFrames: 10,                // frames — Grace after kicking/throwing shell
    shellThrowSpeed: 10.50,                   // tiles/s — Forward speed when releasing held shell
    carryTopSpeedFactor: 0.85,                // × — Max carry speed multiplier (85% of 9.20 = 7.82 t/s)
    carryLeanBackDeg: 10.0,                   // ° — Backward spine counterbalance when carrying shell
    throwAnimFrames: 14,                      // frames — Duration of Throw clip display
  },

  // ─── POWER-UPS (Stage 9) ────────────────────────────────────
  powerups: {
    mushroomHitstopFrames: 6,                 // frames — 6-frame freeze on Super Mushroom collection
    mushroomHopVy: 6.00,                      // tiles/s — Celebratory upward hop after growth
    emergeFrames: 18,                         // frames — Emerge rise animation out of [?] block
    growthOscillationFrames: 18,              // frames — 3-stage non-linear elastic growth (0.30s)
    growthStage1Sx: 1.30,                     // scalar — Stage 1 wide squash
    growthStage1Sy: 0.90,
    growthStage2Sx: 0.80,                     // scalar — Stage 2 tall stretch
    growthStage2Sy: 1.40,
    smallVisualScale: 0.86,                   // scalar — Visual presentation scale for Small form (hitbox stays 1.80t)
    goodStarburstDurationSec: 0.80,           // s — Duration of comic "Good!" starburst behind player
    fireUpgradeLeapVy: 5.50,                  // tiles/s — Joyful hop on Fire Flower pickup
    fireUpgradeHitstopFrames: 6,              // frames — 6-frame freeze on Fire Flower collection
  },

  // ─── PROJECTILES (Fireball) ─────────────────────────────────
  fireball: {
    speed: 14.00,                             // tiles/s — Horizontal velocity
    initialVy: -3.50,                         // tiles/s — Slight downward flick so arc clears 1t bumps cleanly
    gravity: 38.00,                           // tiles/s² — Fireball gravity
    bounceRestitution: 0.85,                  // scalar — Elastic floor bounce (|preVy| * 0.85)
    maxActive: 2,                             // count — Max simultaneous fireballs
    spawnOffsetX: 0.6,                        // tiles — Spawn X offset from player center
    spawnOffsetY: 0.8,                        // tiles — Spawn Y offset from player feet
    windupFrames: 3,                          // frames — Throw anticipation windup (Frames 1–3)
    recoveryFrames: 6,                        // frames — Throw recovery cooldown (6f)
    radius: 0.22,                             // tiles — Collision radius (0.44t diameter)
    torsoSnapDeg: 30.0,                       // ° — Forward torso lean on fireball release
  },

  // ─── ENEMIES ─────────────────────────────────────────────────
  enemies: {
    goombaSpeed: 1.80,                        // tiles/s — Patrol walk speed
    goombaWidth: 0.84,                        // tiles — Goomba AABB width
    goombaHeight: 0.90,                       // tiles — Goomba AABB height
    goombaFlattenRatio: 0.15,                 // scalar — Pancaked height fraction (15%)
    goombaSquashFrames: 22,                   // frames — Pancake linger before despawn (~0.37s)
    koopaSpeed: 1.45,                         // tiles/s — Walking Koopa patrol speed
    koopaWidth: 0.84,                         // tiles — Koopa AABB width
    koopaHeight: 1.15,                        // tiles — Standing Koopa height
    shellHeight: 0.82,                        // tiles — Retracted shell height
    koopashellSpeed: 9.00,                    // tiles/s — Kicked shell velocity
    mushroomSpeed: 2.50,                      // tiles/s — Super Mushroom drift speed
    itemSize: 0.86,                           // tiles — Power-up item AABB size
    knockoutFrames: 42,                       // frames — Defeated flip-offscreen animation duration
    spinySpeed: 1.40,                         // tiles/s — Spiked hazard walker (vulnerable to fireball/shell/spin)
  },

  // ─── ORIGINAL ENEMY GALLERY 1: SPROUTLING & HOPLITE ──────────
  enemyGallery: {
    sproutling: {
      widthPx: 40,                            // px — Standing patrol width
      heightPx: 44,                           // px — Standing patrol height
      width: 40 / 64,                         // tiles (0.625t) — AABB: [cx - 20px, y, cx + 20px, y + 44px]
      height: 44 / 64,                        // tiles (0.6875t)
      squashedWidthPx: 56,                    // px — Expanded horizontal width on stomp
      squashedHeightPx: 14,                   // px — Compressed vertical height on stomp
      squashedWidth: 56 / 64,                 // tiles (0.875t)
      squashedHeight: 14 / 64,                // tiles (0.21875t)
      patrolSpeed: 1.25,                      // tiles/s — Constant horizontal patrol speed
      stompMarginPx: 8,                       // px — player.bottom >= enemy.top - 8px
      stompMarginTiles: 8 / 64,               // tiles (0.125t)
      squashFrames: 15,                       // frames — SQUASHED linger before despawn
      reboundPassiveVy: 11.50,                // tiles/s — Standard jump rebound
      reboundActiveVy: 15.50,                 // tiles/s — Held-JUMP rebound
      stompScore: 200,                        // pts — Floating score pop-up on stomp
      launchDeathVx: 2.50,                    // tiles/s — Horizontal launch on Fireball/Shell strike
      launchDeathVy: 8.00,                    // tiles/s — Upward vertical pop on Fireball/Shell strike
      launchDeathFrames: 60,                  // frames — Inverted fall-through lifetime
      contactDamage: 1,                       // damage points dealt on side/underbody contact
    },
    hoplite: {
      walkWidthPx: 44,                        // px — Walking beetle width
      walkHeightPx: 44,                       // px — Walking beetle height
      walkWidth: 44 / 64,                     // tiles (0.6875t)
      walkHeight: 44 / 64,                    // tiles (0.6875t)
      shellWidthPx: 40,                       // px — Retracted carapace shell width
      shellHeightPx: 36,                      // px — Retracted carapace shell height
      shellWidth: 40 / 64,                    // tiles (0.625t)
      shellHeight: 36 / 64,                   // tiles (0.5625t)
      walkSpeed: 1.00,                        // tiles/s — Phase 1 walking patrol speed
      shellSpeed: 12.00,                      // tiles/s — High-velocity kicked/thrown shell speed
      stompMarginPx: 8,                       // px — Stomp forgiveness margin from above
      stompMarginTiles: 8 / 64,               // tiles (0.125t)
      reboundPassiveVy: 11.50,                // tiles/s — Standard stomp rebound
      reboundActiveVy: 15.50,                 // tiles/s — Held-JUMP stomp rebound
      retractAnimFrames: 2,                   // frames — Retract leg-tuck visual transition
      dormancyFrames: 300,                    // frames — 5.0s stationary shell dormancy
      wakeupTelegraphFrame: 240,              // frame — Lateral +/-2px shake starts at frame 240
      wakeupShakePx: 2,                       // px — +/-2px lateral telegraph jitter
      wallBounceRestitution: 1.00,            // scalar — 100% elastic wall velocity inversion
      wallBounceTraumaPx: 2,                  // px — 2px camera trauma shake target on wall hit
      wallBounceTrauma: Math.sqrt((2 / 64) / 0.42), // scalar (~0.273) -> trauma² * 0.42t * 64px ≈ 2.0px
      shellSubsteps: 4,                       // substeps — Swept AABB substeps per 60 Hz tick
      stompScore: 100,                        // pts — Stomp retract/halt score
      kickScore: 100,                         // pts — Step 0 shell kick score
      multiKillScores: [200, 400, 800, 1000, 2000, 4000], // Escalating chain; 6th enemy awards 4000 + 1-UP
      multiKillOneUpThreshold: 6,             // count — Miyamoto's 6-enemy multi-stomp 1-UP threshold
      handsOffsetX: 0.56,                     // tiles — Forward alignment offset for player.hands
      handsOffsetY: 0.36,                     // tiles — Vertical alignment offset for player.hands
      launchDeathVx: 2.50,                    // tiles/s — Horizontal launch on Fireball/Shell strike
      launchDeathVy: 8.00,                    // tiles/s — Vertical launch on Fireball/Shell strike
      launchDeathFrames: 60,                  // frames
      contactDamage: 1,                       // damage points dealt on walking/moving-shell side contact
    },
  },

  // ─── WONDER GAMEPLAY HUD & SCORING ──────────────────────────
  hud: {
    initialTimeSeconds: 300,                  // s — 3-digit countdown timer
    scoreMushroom: 1000,                      // pts — Super Mushroom pickup ("Good!")
    scoreFireFlower: 1000,                    // pts — Fire Flower pickup
    scoreCoin: 100,                           // pts — World or [?] block coin
    scoreBrick: 50,                           // pts — Brick block shatter
    scoreStompBase: 100,                      // pts — Goomba/Koopa base stomp
    scoreComboLadder: [100, 200, 400, 800, 1000, 2000, 4000, 8000],
    scoreFireballKill: 200,                   // pts — Enemy defeated via fireball
    scoreShellCombo: [200, 400, 800, 1000, 2000, 4000, 8000],
    popupLifetimeSec: 0.85,                   // s — Floating score popup duration
  },

  // ─── PRESENTATION (Squash & Stretch) ─────────────────────────
  presentation: {
    jumpStretchSy: 1.28,                      // scalar — Takeoff vertical stretch
    landingSquashSy: 0.74,                    // scalar — Landing impact squash
    landingRecoveryFrames: 5,                 // frames — Squash recovery duration
    crouchSquashSy: 0.50,                     // scalar — Crouch compression
    cameraYawTilt: 20.0,                      // ° — 3/4 perspective tilt toward camera
  },

  // ─── CAMERA (Dynamic Platformer Camera Kinematics) ───────────
  camera: {
    fov: 30,                                  // ° — Base vertical FOV (PerspectiveCamera)
    positionZ: 18.0,                          // tiles — Distance from gameplay plane
    downPitch: 4.0,                           // ° — Downward pitch

    // 1. Dual-Axis Deadzone (Focus Window)
    deadzoneWidthPx: 48,                      // px — 48px wide horizontal deadzone (±24px = ±0.375t)
    deadzoneHeightPx: 64,                     // px — 64px tall vertical deadzone (1.00t; absorbs 1-block steps)
    deadzone: 24 / 64,                        // tiles — Half-width alias (0.375t = 24px)

    // 2. Dynamic Velocity Look-Ahead (Lead Bias)
    lookAheadVelocityGainPx: 18.0,            // px per (tiles/s) — Lx = sign(vx) * min(|vx| * 18.0, 160px)
    lookAheadMaxPx: 160,                      // px — Max forward lead (160px = 2.50 tiles)
    maxLookAhead: 160 / 64,                   // tiles — 2.50 tiles alias
    lookAheadAlphaNormal: 0.05,               // scalar — Per-tick look-ahead lerp alpha during normal run
    lookAheadAlphaSkid: 0.12,                 // scalar — Per-tick look-ahead lerp alpha during skid/turnaround
    skidHysteresisFrames: 8,                  // frames — Turnaround commitment gate preventing rapid skid oscillation
    springTimeConstant: 0.16,                 // s — Critically damped elastic horizontal follow time constant
    reversalEaseTime: 0.40,                   // s — Reference reversal ease duration

    // 3. Vertical Fall Catch & Ceiling Tracking
    baselineScreenY: 0.35,                    // viewport — Grounded eye-level baseline (35% from bottom)
    upwardJumpAlpha: 0.08,                    // scalar — Exponential lag during upward ascents
    fallAnticipationVy: -6.0,                 // tiles/s — Downward fall speed threshold for pit anticipation
    fallAnticipationFrames: 12,               // frames — Consecutive frames below vy threshold before expanding
    fallAnticipationOffsetPx: 120,            // px — Downward look window expansion (120px = 1.875 tiles)
    fallAnticipationAlpha: 0.09,              // scalar — Smooth expansion factor for fall anticipation
    groundSnapFrames: 15,                     // frames — Gentle restoration to eye-level baseline on ground contact
    verticalRecentreTime: 15 / 60,            // s — 15-frame ground snap duration (0.25s)
    verticalUpperClamp: 0.78,                 // viewport — Aerial upper safety ceiling
    verticalLowerClamp: 0.18,                 // viewport — Aerial lower safety floor
    fastFallThreshold: -6.0,                  // tiles/s — Alias for fall anticipation threshold
    fastFallLookDown: 120 / 64,               // tiles — Alias for 120px (1.875t) downward shift

    // 4. Sprint Momentum Lens Expansion (Canvas Transform Zoom)
    sprintZoomSpeedThreshold: 9.20,           // tiles/s — |vx| >= 9.20 tiles/s sustains sprint zoom timer
    sprintZoomDelayFrames: 30,                // frames — > 30 sustained sprint frames triggers 8% lens expansion
    sprintZoomTarget: 0.925,                  // scalar — Z = 0.925 (~8.1% wider viewport via canvas transform)
    sprintZoomInAlpha: 0.08,                  // scalar — Smooth zoom-out lerp factor during sustained sprint
    sprintZoomRestoreFrames: 20,              // frames — Restore to Z = 1.000 over 20 frames on deceleration
    sprintVignetteSpeed: 8.0,                 // tiles/s — Peripheral speed-line vignette trigger speed
    sprintFovBoost: 2.0,                      // ° — Perspective camera FOV expansion sync
  },

  // ─── TILEMAP ─────────────────────────────────────────────────
  tilemap: {
    tileSize: 64,                             // px — Tile dimensions
    atlasWidth: 1876,                         // px — Master spritesheet width
    atlasHeight: 3230,                        // px — Master spritesheet height
    atlasContentX: 10,                        // px — Left margin offset
    atlasContentY: 10,                        // px — Top margin offset (Atlas 1 / Daytime)
    atlas2ContentY: 1620,                     // px — Top margin offset (Atlas 2 / Twilight)
    gridColumns: 29,                          // count — Tiles per row
    gridRows: 25,                             // count — Tiles per column per atlas
  },

  // ─── STAGE 6 & 12: LEVEL KIT, GEOMETRIC BLOCKS & PARALLAX ─────
  stage6: {
    blockBumpHeight: 6 / 64,                  // tiles — 6px upward bump peak (6 / 64 = 0.09375)
    blockBumpFrames: 4,                       // frames — 4-frame sine-wave bump duration
    brickBreakMinSpeed: 15.0,                 // tiles/s — Upward impact velocity or sprint speed enabling shatter
    brickBreakMinHorizSpeed: 5.5,             // tiles/s — Sprint speed enabling brick shatter on head hit
    coinHopHeight: 2.5,                       // tiles — Spawned coin vertical hop peak above block
    coinHopDurationFrames: 28,                // frames — Question-block coin hop lifespan
    coinSpinFrames: 4,                        // count — 4-frame spinning gold coin sheet
    coinSpinFps: 10,                          // Hz — World coin rotation cadence
    coinPickupRadius: 0.52,                   // tiles — Forgiving coin pickup radius around center
    foliageOverhangPx: 5,                     // px — Visual overhang reference (~0.08t)
    flagpoleSlideSpeed: 8.5,                  // tiles/s — Flag descent rate when captured
    parallaxFactors: {
      sky: 0.10,                              // Layer 0: Sky & Horizon Grid (Z = -200)
      hills: 0.40,                            // Layer 1: Distant Geometric Ridges (Z = -75)
      cliffs: 0.85,                           // Layer 2: Midground Architectural Silhouettes (Z = -20)
      world: 1.00,                            // Layer 3: Main Gameplay Plane (Z = 0.0)
      foreground: 1.10,                       // Layer 4: Foreground Framing Plane (Z = +15)
    },
  },

  // ─── STAGE 12: CLEAN GEOMETRIC 2D SHAPE BLOCK PALETTE ─────────
  geometricTiles: {
    solidFill: '#252836',                     // Matte Dark Slate solid terrain fill
    solidBevel: '#3d4359',                    // 2px crisp inner bevel border
    solidBevelPx: 2,                          // px — Inner bevel border width
    solidInteriorGrid: 'rgba(61, 67, 89, 0.28)', // Faint seam line inside multi-tile solid mass
    solidTopStripe: '#4e9df5',                // 3px walkable solid footing accent stripe
    solidTopStripePx: 3,                      // px — Walkable top stripe thickness
    solidGridDotColor: 'rgba(148, 163, 184, 0.15)', // Subtle 8x8px distance-estimation grid dots
    solidGridDotStepPx: 8,                    // px — Distance dot pitch (8x8px at 1:1)

    semisolidHeightPx: 12,                    // px — Floating one-way slab thickness
    semisolidFill: '#2d3246',                 // Semisolid slab body fill
    semisolidTopLine: '#00d2d3',              // Cyan/teal top highlight ("solid above, passable below")
    semisolidTopLinePx: 2.5,                  // px — Top highlight line thickness
    semisolidFadePx: 14,                      // px — Underside downward transparency fade height
    semisolidStanchionFill: '#1b1f2c',        // Geometric support pillar for elevated spans
    semisolidStanchionEdge: '#3d4359',

    slopeHypotenusePx: 2,                     // px — Slanted hypotenuse outline thickness (#4e9df5)

    questionFill: '#f5a623',                  // Vibrant golden amber interactive block
    questionBevel: '#b9770e',                 // Inner bevel border
    questionHighlight: '#fde68a',             // Top rim highlight
    questionCutout: '#1c1f2e',                // Minimalist center diamond cutout
    spentFill: '#795548',                     // Inert dark bronze spent block
    spentBevel: '#5d4037',                    // Muted spent bevel
    spentCutout: '#4e342e',                   // Subdued spent center mark

    brickFill: '#c25e36',                     // Warm terracotta brick-orange
    brickHighlight: '#de7d55',                // Crisp upper shard / brick edge highlight
    brickLine: '#7a3319',                     // Mortar dividing lines
    brickHorizontalLines: 2,                  // 2 horizontal dividing lines
    brickVerticalLines: 1,                    // 1 vertical dividing line

    hazardFill: '#ff4757',                    // High-contrast warning crimson
    hazardHighlight: '#ff7b87',               // Facet highlight
    hazardStroke: '#a81c29',                  // Crisp triangle edge
    spikesPerTile: 3,                         // 3 sharp triangular poly-spikes per 64px tile

    hardFill: '#34394d',                      // Reinforced unbreakable slate block
    hardBevel: '#525a75',                     // Reinforced bevel & corner brackets

    pipeBody: '#252836',                      // Geometric warp conduit body
    pipeBevel: '#3d4359',                     // Conduit bevel edge
    pipeAccent: '#10b981',                    // Conduit vertical telemetry stripe
    pipeHighlight: '#00d2d3',                 // Top portal lip highlight

    coinFill: '#f5a623',                      // Geometric diamond coin fill
    coinRim: '#fde047',                       // Coin outer bevel
    coinCutout: '#78350f',                    // Inner diamond cutout

    platformFill: '#2d3246',                  // Moving platform body
    platformTopLine: '#00d2d3',               // Default top highlight
    platformActiveLine: '#4e9df5',            // Ridden top highlight

    debugNormalColor: '#00d2d3',              // F1 collision normal vector arrow
    debugSlopeNormalColor: '#f5a623',         // F1 slope surface normal arrow
    debugContactColor: '#ff4757',             // F1 raw contact point marker
    debugTileBoxColor: 'rgba(78, 157, 245, 0.42)', // F1 colliding tile AABB outline
  },

  // ─── TILE TYPES ──────────────────────────────────────────────
  tileTypes: {
    EMPTY: 0,
    SOLID: 1,
    SEMISOLID: 2,
    SLOPE_45: 3,                              // 45° ascending L->R (alias of SLOPE_45_UP)
    SLOPE_26: 4,                              // 26.57° ascending L->R (auto-pairs 1st/2nd tile)
    HAZARD: 5,
    SLOPE_45_DOWN: 6,                         // 45° descending L->R (1 - u)
    SLOPE_26_UP_1: 7,                         // 26.57° ascending low half (0.5u)
    SLOPE_26_UP_2: 8,                         // 26.57° ascending high half (0.5 + 0.5u)
    SLOPE_26_DOWN_1: 9,                       // 26.57° descending high half (1.0 - 0.5u)
    SLOPE_26_DOWN_2: 10,                      // 26.57° descending low half (0.5 - 0.5u)
    QUESTION_BLOCK: 11,                       // Solid interactive [?] block -> spawns hopping coin & turns USED
    BRICK_BLOCK: 12,                          // Solid brick block -> 6f bump or 4-fragment shatter
    HARD_BLOCK: 13,                           // Unbreakable carved stone block
    USED_BLOCK: 14,                           // Spent [?] bronze block
    PIPE: 15,                                 // 2-tile wide solid Warp Pipe
    MUSHROOM_PLATFORM: 16,                    // One-way semisolid Mushroom cap + background stalk
  },

  // ─── INPUT & DUALSHOCK 4 RADIAL KINEMATICS ──────────────────
  input: {
    gamepadDeadzone: 0.15,                    // scalar — Inner scaled radial deadzone (r_inner = 0.15)
    radialInnerDeadzone: 0.15,                // scalar — Explicit alias for r_inner
    radialOuterSaturation: 0.95,              // scalar — Outer saturation envelope (r_outer = 0.95)
    analogResponseGamma: 1.35,                // exponent — Non-linear velocity curve |x_filt|^1.35
    digitalThresholdX: 0.20,                  // scalar — Filtered X threshold for LEFT / RIGHT digital OR
    digitalThresholdY: 0.30,                  // scalar — Filtered Y threshold for UP / DOWN digital OR
    precisionBandMax: 0.55,                   // scalar — Precision low-speed deflection band upper bound
    precisionMinSpeed: 1.25,                  // tiles/s — Micro-step floor speed in precision band
    precisionMaxSpeed: 3.50,                  // tiles/s — Precision band top speed for ledge maneuvers
    r2RunThreshold: 0.25,                     // scalar — R2 analog trigger threshold for Actions.RUN
    l2DownThreshold: 0.35,                    // scalar — L2 analog trigger threshold for Actions.DOWN (Crouch / Ground Pound)
    menuStickThreshold: 0.50,                 // scalar — Left stick deflection for discrete UI menu steps
    menuNavRepeatDelayFrames: 18,             // frames — Initial hold delay before UI cursor repeat (0.30s)
    menuNavRepeatIntervalFrames: 7,           // frames — Repeat cadence while holding D-pad/stick in menus
  },

  // ─── ASYMMETRIC DUAL-MOTOR HAPTICS (W3C vibrationActuator) ──
  haptics: {
    minCooldownMs: 20,                        // ms — Minimum cooldown between sequential actuator calls
    skidPulseIntervalFrames: 4,               // frames — Gritty skid friction pulse cadence (every 4 frames)
    wallSlideIntervalFrames: 4,               // frames — Continuous subtle wall-slide rumble refresh cadence
    profiles: {
      stompSproutling: { duration: 45, weakMagnitude: 0.85, strongMagnitude: 0.15 },
      groundPound: { duration: 130, weakMagnitude: 0.20, strongMagnitude: 1.00 },
      hopliteShellKick: { duration: 60, weakMagnitude: 0.65, strongMagnitude: 0.70 },
      skidDecel: { duration: 35, weakMagnitude: 0.35, strongMagnitude: 0.40 },
      wallSlide: { duration: 40, weakMagnitude: 0.12, strongMagnitude: 0.00 },
      playerDamage: { duration: 250, weakMagnitude: 0.95, strongMagnitude: 0.90, doublePulse: true },
      coinCollect: { duration: 25, weakMagnitude: 0.40, strongMagnitude: 0.00 },
      superSpring: { duration: 80, weakMagnitude: 0.80, strongMagnitude: 0.40 },
    },
  },

  // ─── STAGE 8: CHARACTER PROFILES & 3D SKELETAL RIG ───────────
  activeCharacter: 'mario',                   // 'mario' | 'luigi'

  characters: {
    mario: {
      id: 'mario',
      displayName: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? 'Vesper' : 'Mario',
      modelPath: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? null : '/models/mario.glb',
      accentColor: '#EF4444',
      restModelHeight: 33.80,                 // Native GLB mesh height (units)
      visualHeightTiles: 1.80,                // Matches standing hitbox height (1.80t)
      walkTopSpeed: 5.20,                     // tiles/s
      runTopSpeed: 9.20,                      // tiles/s
      groundAccel: 18.50,                     // tiles/s²
      groundFriction: 22.00,                  // tiles/s²
      skidDecel: 44.00,                       // tiles/s²
      launchVelocity: 18.60,                  // tiles/s
      gravityRising: 42.80,                   // tiles/s²
      gravityFalling: 62.00,                  // tiles/s²
      canFlutterJump: true,
      flutterGravityMult: 0.35,               // × — Scuttle buoyancy while holding Jump during descent
      flutterMaxFrames: 28,                   // frames (~0.47s flutter scuttle window)
      flutterTargetVy: -1.35,                 // tiles/s — gentle flutter descent ceiling
    },
    luigi: {
      id: 'luigi',
      displayName: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? 'Lumen' : 'Luigi',
      modelPath: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? null : '/models/luigi.glb',
      accentColor: '#22C55E',
      restModelHeight: 36.28,                 // Native GLB mesh height (units)
      visualHeightTiles: 1.89,                // ~5% taller visual silhouette while physics hitbox stays 1.80t
      walkTopSpeed: 5.20,                     // tiles/s
      runTopSpeed: 9.20,                      // tiles/s
      groundAccel: 17.80,                     // tiles/s² — slightly looser startup ramp
      groundFriction: 19.00,                  // tiles/s² — Stage 8 spec: lower ground traction (19.0 vs 22.0)
      skidDecel: 38.00,                       // tiles/s² — slightly longer skid slide
      launchVelocity: 18.45,                  // tiles/s — paired with g_rise=40.0 yields ~4.27t (+5% apex)
      gravityRising: 40.00,                   // tiles/s² — Stage 8 spec: floatier jump gravity
      gravityFalling: 57.50,                  // tiles/s² — proportionally floatier descent
      canFlutterJump: true,
      flutterGravityMult: 0.35,               // × — Scuttle buoyancy while holding Jump during descent
      flutterMaxFrames: 28,                   // frames (~0.47s flutter scuttle window)
      flutterTargetVy: -1.35,                 // tiles/s — gentle flutter descent ceiling
    },
  },

  stage8: {
    crossFadeSec: 0.12,                       // s — AnimationMixer crossfade (0.10–0.15s)
    quickFadeSec: 0.08,                       // s — Fast transition for Jump/Skid/Land
    cameraYawTiltDeg: 20.0,                   // ° — Wonder 3/4 facial gaze tilt toward camera
    boneYawBiasRatio: 0.35,                   // fraction of 20° tilt applied additively to spine/head
    squashPelvisShare: 0.55,                  // scalar — Pelvis bone share of dynamic Sy
    squashSpineShare: 0.45,                   // scalar — Spine bone share of dynamic Sy
    volumeTolerance: 0.02,                    // ±2% Sx * Sy * Sz = 1.00 tolerance
    walkClipBaseSpeed: 4.0,                   // tiles/s — Base speed for Walk playback
    runClipBaseSpeed: 7.2,                   // tiles/s — Base speed for Run playback
    sprintClipBaseSpeed: 9.2,                 // tiles/s — Base speed for Sprint playback
    idlePlaybackScale: 5.0,                   // × — 5x faster Idle playback speed
    walkPlaybackScale: 5.0,                   // × — 5x faster Walk playback speed
    runPlaybackScale: 5.0,                    // × — 5x faster Run playback speed
    sprintPlaybackScale: 10.0,                // × — 2x faster Sprint playback speed (10x)
    runFootstepStrikePhases: [0.18, 0.68],    // normalized [0..1] phases for Run dust sync
    sprintFootstepStrikePhases: [0.16, 0.66], // normalized [0..1] phases for Sprint dust sync
    wallSlideOutwardTiltDeg: 22.0,            // ° — Outward body angle during WallSlide
    allClips: [
      'Idle', 'Walk', 'Run', 'Sprint', 'Skid', 'TurnAround',
      'Jump', 'DoubleJump', 'TripleJump', 'FlutterJump', 'SpinJump', 'SpinAir',
      'WallSlide', 'WallJump', 'Fireball', 'FireballAir', 'GroundPound', 'GroundPoundLand',
      'CrouchStart', 'Crouch', 'CarryWalk', 'Throw', 'Climb', 'Swim',
      'Damage', 'Defeat', 'Victory',
    ],
  },

  // ─── STAGE 10: WARP PIPES & BENCHMARK GAUNTLET ──────────────
  warpPipe: {
    enterFrames: 18,                          // frames — 0.30s suction descent into pipe
    exitFrames: 6,                            // frames — brief emergence stabilization
    sinkSpeed: 3.4,                           // tiles/s — downward visual/physics sink speed
    toleranceX: 0.72,                         // tiles — forgiving horizontal alignment on pipe top
    toleranceY: 0.25,                         // tiles — vertical foot match tolerance on pipe top
  },

  // ─── INTERACTIVE ENVIRONMENTAL PROPS (Platforms, Springs, Warp Tubes) ─
  props: {
    platform: {
      fallAwayDelaySec: 1.0,                  // s — Drops 1.0s after player weight detected
      fallAwayDelayFrames: 60,                // frames — Exact 60 Hz weight countdown (1.00s)
      fallAwayShakeStartFrame: 12,            // frames — Begin lateral shudder warning telegraph
      fallAwayShakeAmpPx: 2.5,                // px — Horizontal warning shudder amplitude
      fallAwayGravity: 28.00,                 // tiles/s² — Downward acceleration once detached
      fallAwayTerminalVy: 20.00,              // tiles/s — Max fall-away descent velocity
      fallAwayRespawnSec: 3.0,                // s — Cooldown before returning to start anchor
      fallAwayRespawnFrames: 180,             // frames — Deterministic 60 Hz respawn delay
      fallAwayMaxDropDist: 16.0,              // tiles — Vertical fall distance before respawn
    },
    spring: {
      widthPx: 64,                            // px — 64×32px base pad width
      heightPx: 32,                           // px — 64×32px base pad height
      width: 64 / 64,                         // tiles (1.00t)
      height: 32 / 64,                        // tiles (0.50t)
      compressionPx: 16,                      // px — Downward compression travel on landing
      compressionTiles: 16 / 64,              // tiles (0.25t)
      squashRatio: 0.50,                      // scalar — Compressed height / base height (16/32 = 0.50)
      compressFrames: 4,                      // frames — Compresses downward 16px over 4 frames
      powerBounceWindowFrames: 4,             // frames — Timed JUMP press window for Super Spring
      normalBounceVy: 16.00,                  // tiles/s — Automatic normal spring upward impulse
      superBounceVy: 22.50,                   // tiles/s — Timed Power Bounce Super Spring impulse
      reboundVisualFrames: 12,                // frames — Post-launch visual coil overshoot duration
      reboundStretchRatio: 1.38,              // scalar — Peak coil extension ratio on fire
      superCameraTrauma: 0.22,                // scalar — Subtle punchy shake on Super Spring launch
    },
    warpTube: {
      headWidthPx: 128,                       // px — 128×128px entrance pipe head width
      headHeightPx: 128,                      // px — 128×128px entrance pipe head height
      headWidth: 128 / 64,                    // tiles (2.00t)
      headHeight: 128 / 64,                   // tiles (2.00t)
      slideInFrames: 45,                      // frames — Smooth 45-frame sliding interpolation into interior
      fadeOutFrames: 18,                      // frames — Screen fade-to-black before relocation
      holdBlackFrames: 6,                     // frames — Hold black during subterranean camera snap
      fadeInFrames: 18,                       // frames — Screen fade-from-black at destination
      slideOutFrames: 24,                     // frames — Smooth emergence out of destination pipe
      verticalToleranceX: 0.78,               // tiles — Centering tolerance for DOWN / UP entry
      verticalToleranceY: 0.28,               // tiles — Vertical contact tolerance for DOWN / UP entry
      lateralToleranceX: 0.32,                // tiles — Horizontal contact tolerance for LEFT / RIGHT entry
      lateralToleranceY: 0.55,                // tiles — Vertical footing tolerance for LEFT / RIGHT entry
      slideDepthTiles: 1.90,                  // tiles — Sliding distance into tube interior over 45 frames
      cooldownFrames: 24,                     // frames — Post-exit cooldown before re-entering
    },
  },

  // ─── STAGE 17: KISHŌTENKETSU & DUAL-SKILL LEVEL ENGINE ───────
  levelEngine: {
    floorRouteMaxWalkSpeed: 4.50,             // tiles/s — Novice accessibility ceiling (Miyamoto Floor Law)
    ceilingRouteMinSprintSpeed: 9.20,         // tiles/s — Expert momentum mastery speed (Miyamoto Ceiling Law)
    ceilingRouteMinElevationDelta: 2.50,      // tiles — Min vertical clearance separating Ceiling from Floor route
    safeguardMinTelegraphFrames: 24,          // frames — Minimum advance telegraph for falling/elevated threats
    starMedallionCount: 3,                    // count — Exact 3 mastery Star Medallions per level
    starMedallionRadius: 0.68,                // tiles — Forgiving Star Medallion pickup radius
    starMedallionScore: 1000,                 // pts — Score reward for collecting a Star Medallion
    secretCacheRadius: 0.68,                  // tiles — Forgiving 1-UP Secret Cache pickup radius
    heraldAnticipationRangeTiles: 6.50,       // tiles — Sightline anticipation window before Act 3 Twist Herald
    heraldTriggerHalfWidth: 0.90,             // tiles — Trigger corridor half-width at Twist Herald gate
    heraldTrauma: 0.24,                       // scalar — Anticipation rumble camera shake on Twist Herald trigger
    antiPhaseOffset: 0.50,                    // cycles — Exact 180° (π rad) anti-phase platform oscillation offset
    geyser: {
      crestHeight: 0.45,                      // tiles — Solid one-way water crest platform thickness
      defaultWidth: 2.60,                     // tiles — Default rhythmic water column width
      defaultPeriodSec: 3.40,                 // s — Default harmonic spout cycle duration
      invertedSpeedMult: 1.25,                // × — Brisker inverted cascade tempo in Act 3 Ten (physics invariant)
      demoCoinHoverOffset: 1.25,              // tiles — Act 1 Ki visual demonstration coin height above crest
    },
  },

  // ─── STAGE 18: BENCHMARK WORLD 1 COURSES (1-1, 1-2, 1-3) ─────
  world1: {
    geyserPulsePeriodSec: 3.00,               // s — Exact 3.0-second pulsing cycle for 1-3 Shō water spouts
    horizontalJetSpeed: 14.00,                // tiles/s — Ultra-high horizontal geyser jet velocity (1-3 Ten)
    horizontalJetLiftVy: 2.20,                // tiles/s — Buoyant vertical sustain inside horizontal jet stream
    horizontalJetExitFlutterFrames: 28,       // frames — Timed flutter jump window after exiting horizontal jet
    horizontalJetExitFlutterTargetVy: -0.95,  // tiles/s — Buoyant glide descent rate during jet-exit flutter
    horizontalJetExitFlutterGravityMult: 0.18,// × — Reduced gravity during jet-exit flutter across spike abyss
    flagpoleMinBonus: 400,                    // pts — Minimum flagpole grab bonus at base
    flagpoleMaxBonus: 5000,                   // pts — Maximum flagpole finial elevation bonus
    pinnacleGoalRadius: 1.05,                 // tiles — Forgiving pinnacle goal medallion capture radius
    pinnacleGoalBonus: 5000,                  // pts — Maximum summit bonus for 1-3 Ketsu Pinnacle Goal Medallion
    exitPipeBonus: 2500,                      // pts — Course clear bonus for 1-2 Ketsu Exit Pipe
    fallAwayOscAmpY: 0.45,                    // tiles — Vertical oscillation amplitude for 1-2 Ketsu fall-away platforms
    fallAwayOscPeriodSec: 2.40,               // s — Oscillation period for 1-2 Ketsu fall-away platforms
    spikeRescueHopVy: 13.50,                  // tiles/s — Safe upward recoil impulse on spike hazard contact
    themes: {
      plains: {
        skyTop: '#0284C7',
        skyMid: '#38BDF8',
        skyLow: '#BAE6FD',
        skyHorizon: '#FEF08A',
        hillFar: '#34D399',
        hillMid: '#10B981',
        hillNear: '#15803D',
        plateauRim: '#38BDF8',
      },
      cavern: {
        skyTop: '#050814',
        skyMid: '#0B1124',
        skyLow: '#111A33',
        skyHorizon: '#0F2942',
        ribColor: 'rgba(34, 211, 238, 0.14)',
        solidFill: '#182032',
        solidInteriorGrid: 'rgba(34, 211, 238, 0.08)',
        solidBevel: '#2B3954',
        solidTopStripe: '#22D3EE',
        semisolidFill: '#1E293B',
        semisolidTopLine: '#06B6D4',
        neonCyan: '#22D3EE',
        spikeFill: '#F43F5E',
        spikeRim: '#FDA4AF',
      },
      ridge: {
        skyTop: '#0C2D6B',
        skyMid: '#1D4ED8',
        skyLow: '#60A5FA',
        skyHorizon: '#E0F2FE',
        peakFar: '#1E3A8A',
        peakMid: '#334155',
        peakNear: '#1E293B',
        snowCap: '#F8FAFC',
        mistColor: 'rgba(224, 242, 254, 0.28)',
      },
    },
  },

  // ─── STAGE 19: COLLECTIBLE ECONOMY, SECRETS & DIEGETIC HUD ───
  collectibles: {
    shardsPerOneUp: 100,                      // count — 100 Sparking Gold Shards -> +1 Life (1-UP)
    shardScore: 100,                          // pts — Score per Sparking Gold Shard collected
    starMedallionScore: 1000,                 // pts — Score per Star Medallion collected
    starMedallionCount: 3,                    // count — Exact 3 Star Medallions per course
    oneUpRingParticleCount: 18,               // count — Expanding 1-UP particle ring segments
    oneUpRingSpeed: 4.40,                     // tiles/s — Particle ring expansion velocity
    timerWarningThresholdSec: 50,             // s — Amber warning flash threshold (< 50s)
    timerWarningFlashHz: 4.0,                 // Hz — Amber timer warning pulse rate
    combatTextRisePx: 24,                     // px — Exact vertical rise for floating combat numerals (24px)
    combatTextFrames: 20,                     // frames — Exact fade duration for floating combat numerals (20f)
    shardRotateDegPerSec: 180,                // °/s — Diegetic HUD geometric shard rotation cadence
    shardGlintHz: 3.6,                        // Hz — World Sparking Gold Shard shimmer frequency
    medallionGhostAlpha: 0.34,                // scalar — Translucent alpha when revisiting already-collected medallion
    shellBrickBreakEnabled: true,             // flag — Moving Hoplite shell shatters breakable BRICK_BLOCK walls
    arcDefaultLaunchVx: 5.20,                 // tiles/s — Baseline horizontal speed for parabolic jump-arc shard teaching
    arcMaxHeightRatio: 0.92,                  // scalar — Clamp parabolic shard apex comfortably below max jump height
  },

  // ─── STAGE 20: MULTI-SENSORY "JUICE" (Hitstops, T² Trauma & Directional Particles) ─
  juice: {
    hitstop: {
      enemyStompFrames: 3,                    // frames (50ms) — Micro-freeze on enemy stomp
      shellKickFrames: 4,                     // frames (66ms) — Micro-freeze on shell kick / throw
      playerDamageFrames: 8,                  // frames (133ms) — Heavy micro-freeze on player damage
      solidBlockBonkFrames: 2,                // frames (33ms) — Crisp micro-freeze on solid block head-bonk
      invulnerabilityFrames: 90,              // frames (1.5s at 60 Hz) — Invulnerability flashing duration
    },
    trauma: {
      decayRatePerSec: 1.2,                   // 1/s — Linear trauma decay: T = max(0, T - 1.2 * dt)
      maxOffsetPx: 12,                        // px — Max quadratic translation offset (Δ = T² * 12px * noise)
      noiseFrequencyHz: 28.0,                 // Hz — Smooth continuous 1D value-noise sampling speed
      heavyBlockSmash: 0.3,                   // +0.3 trauma on brick / heavy block smash
      shellWallRebound: 0.4,                  // +0.4 trauma on shell wall rebound
      bossGroundSlam: 0.8,                    // +0.8 trauma on boss ground slam
      groundPoundImpact: 0.65,                // +0.65 trauma on player hard ground pound land
      playerDamage: 0.50,                     // +0.50 trauma on player taking damage
      enemyStomp: 0.18,                       // +0.18 trauma on enemy stomp
    },
    particles: {
      poolCapacity: 256,                      // count — Fixed zero-GC pre-allocated pool capacity (50+ concurrent headroom)
      turnaroundDustCount: 4,                 // count — Exact 4 small white/smoke dust puffs shooting forward from feet
      turnaroundForwardSpeedMin: 1.80,        // tiles/s — Minimum forward velocity for turnaround puffs
      turnaroundForwardSpeedMax: 3.40,        // tiles/s — Maximum forward velocity for turnaround puffs
      groundPoundShockwaveSpeed: 6.0,         // tiles/s — Bilateral shockwave left/right expansion speed
      wallSlideEmitIntervalFrames: 1,         // frames — Continuous upward-scraping friction particles every tick
      wallSlideUpwardSpeedMin: 1.85,          // tiles/s — Minimum upward scrape speed along wall contact plane
      wallSlideUpwardSpeedMax: 3.10,          // tiles/s — Maximum upward scrape speed along wall contact plane
    },
    squashStretch: {
      stiffness: 240,                         // N/m — Presentation-only damped spring stiffness
      damping: 18,                            // N·s/m — Presentation-only damped spring damping
      minSy: 0.36,                            // scalar — Lower vertical squash clamp
      maxSy: 1.38,                            // scalar — Upper vertical stretch clamp
      blockBonkSquashSy: 0.80,                // scalar — Subtle vertical squash on solid block head-bonk
      damageSquashSy: 0.72,                   // scalar — Recoil squash on taking damage
      groundPoundSquashSy: 0.56,              // scalar — Heavy pancake squash on ground pound impact
    },
  },

  // ─── STAGE 21: MULTI-PHASE BOSS ("THE DREAD-SHELL GOLEM") & GAME LIFECYCLE ─
  boss: {
    arenaWidthTiles: 20,                      // tiles — Exact 20-tile wide enclosed stone chamber interior
    arenaLeftX: 2,                            // tiles — Inner left blast-door wall plane (x = 2.0)
    arenaRightX: 22,                          // tiles — Inner right blast-door wall plane (x = 22.0)
    floorY: 3,                                // tiles — Stone chamber floor elevation
    initialCeilingY: 14,                      // tiles — Phase 1 & 2 chamber ceiling elevation
    phase3CeilingDropTiles: 2,                // tiles — Phase 3 ceiling drops by exact 2 tiles (14 -> 12)
    alcoveY: 7,                               // tiles — Upper wall-jump alcove height (4t above floor)
    alcoveWidth: 3,                           // tiles — Left (2..4) and Right (19..21) alcove span
    maxHp: 3,                                 // hits — 3-strike multi-phase encounter
    width: 2.2,                               // tiles — Golem armored carapace width
    height: 2.4,                              // tiles — Golem standing height
    boulderHeight: 1.85,                      // tiles — Retracted spiked boulder height during Phase 2 Spin Dash
    patrolSpeed: 2.40,                        // tiles/s — Phase 1 deliberate heavy patrol
    patrolFramesPhase1: 48,                   // frames (0.80s) — Phase 1 patrol cadence before leap
    patrolFramesPhase3: 30,                   // frames (0.50s) — Phase 3 accelerated overdrive cadence
    leapVy: 16.50,                            // tiles/s — Initial upward leap velocity
    leapGravity: 42.00,                       // tiles/s² — Gravity during upward leap ascent
    hoverFrames: 20,                          // frames (0.33s) — Exact 20-frame midair hover telegraph before slam
    slamVy: -26.00,                           // tiles/s — Heavy downward slam velocity
    shockwaveSpeed: 7.50,                     // tiles/s — Room-wide bilateral ground shockwave speed
    shockwaveWidth: 0.85,                     // tiles — Shockwave crest hitbox width
    shockwaveHeight: 0.72,                    // tiles — Low ground-hugging wave (cleanly jumpable)
    vulnerabilityFrames: 240,                 // frames (4.00s) — Core exposure & shell kick window
    spinWindupFrames: 28,                     // frames — Crimson carapace charge & retraction telegraph
    spinDashSpeed: 14.00,                     // tiles/s — Exact 14.0 tiles/s Phase 2 Enraged Spin Dash
    spinDashBounces: 4,                       // count — Wall rebounds across 20-tile chamber per cycle
    steamCooldownFrames: 220,                 // frames (3.67s) — Phase 2 steam exhaust vulnerability window
    hitStunFrames: 24,                        // frames — Stagger reaction after taking a shell core strike
    strikeHitstopFrames: 6,                   // frames (100ms) — Heavy boss core impact hitstop
    strikeScore: 2000,                        // pts — Score per core strike
    defeatScore: 10000,                       // pts — Climax shatter bonus score
    debrisCount: 28,                          // count — Harmless geometric shatter shards on Strike 3
    exitPortalX: 19.2,                        // tiles — World Exit Portal left X inside stone chamber
    exitPortalY: 3.0,                         // tiles — World Exit Portal base Y on chamber floor
    exitPortalWidth: 2.0,                     // tiles — World Exit Portal width
    exitPortalHeight: 3.0,                    // tiles — World Exit Portal height
  },

  lifecycle: {
    wipeCloseFrames: 18,                      // frames (0.30s) — Smooth screen wipe close duration
    wipeHoldFrames: 6,                        // frames (0.10s) — Brief peak wipe hold during swap
    wipeOpenFrames: 18,                       // frames (0.30s) — Smooth screen wipe reveal duration
    levelIntroFrames: 75,                     // frames (1.25s) — Stage intro title card display duration
    respawnFrames: 54,                        // frames (0.90s) — Death-to-respawn staging duration
    stageClearAutoFrames: 150,                // frames (2.50s) — Stage clear celebration display duration
    duckActiveGain: 1.0,                      // scalar — Full 100% audio gain during GAMEPLAY_ACTIVE
    duckMenuGain: 0.35,                       // scalar — Ducked 35% gain during Title/Pause/Intro/GameOver
    duckClearGain: 0.85,                      // scalar — Bright 85% gain during Stage Clear fanfare
    initialLives: 3,                          // count — Standard campaign starting lives
  },

  activeFeelPreset: 'wonder',                 // 'wonder' | 'nsmbu' | 'arcade'
};

export const FEEL_PRESETS = {
  wonder: {
    id: 'wonder',
    label: 'Wonder Momentum',
    shortLabel: 'Wonder',
    description: 'Default Wonder feel: Frame-1 pop 1.25, 6f apex float, 50% crouch squash, 20° 3/4 tilt',
    startImpulse: 1.25,
    groundAccel: 18.50,
    skidDecel: 44.00,
    skidThreshold: 4.50,
    gravityRising: 42.80,
    gravityFalling: 62.00,
    apexFloatMaxFrames: 6,
    crouchSquashSy: 0.50,
    cameraYawTiltDeg: 20.0,
    respectsCharacterDeltas: true,
  },
  nsmbu: {
    id: 'nsmbu',
    label: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? 'Classic Momentum' : 'NSMBU Classic',
    shortLabel: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? 'Classic' : 'NSMBU',
    description:
      (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__)
        ? 'Classic feel: zero Frame-1 pop, 3f apex float, 28% squash, 0° side-profile lock'
        : 'Wii U feel: zero Frame-1 pop, 3f apex float, 28% squash, 0° side-profile lock',
    startImpulse: 0.0,
    groundAccel: 16.00,
    skidDecel: 36.00,
    skidThreshold: 4.50,
    gravityRising: 43.30,
    gravityFalling: 59.50,
    apexFloatMaxFrames: 3,
    crouchSquashSy: 0.72,
    cameraYawTiltDeg: 0.0,
    respectsCharacterDeltas: false,
  },
  arcade: {
    id: 'arcade',
    label: 'Snappy Arcade',
    shortLabel: 'Arcade',
    description: 'Instant pivot turnarounds, crisp 2.0 start pop, 24 accel, 52 fall gravity',
    startImpulse: 2.00,
    groundAccel: 24.00,
    skidDecel: 64.00,
    skidThreshold: 12.00,
    gravityRising: 42.80,
    gravityFalling: 52.00,
    apexFloatMaxFrames: 6,
    crouchSquashSy: 0.50,
    cameraYawTiltDeg: 20.0,
    respectsCharacterDeltas: false,
  },
};

export const DEFAULT_MOVEMENT_PROFILE = structuredClone(MovementProfile);

export function applyCharacterProfile(characterId = 'mario') {
  const key = characterId === 'luigi' ? 'luigi' : 'mario';
  const charCfg = MovementProfile.characters[key];
  if (!charCfg) return MovementProfile.characters.mario;

  MovementProfile.activeCharacter = key;
  MovementProfile.locomotion.walkTopSpeed = charCfg.walkTopSpeed;
  MovementProfile.locomotion.runTopSpeed = charCfg.runTopSpeed;
  MovementProfile.locomotion.groundFriction = charCfg.groundFriction;
  MovementProfile.jump.launchVelocity = charCfg.launchVelocity;

  if (MovementProfile.activeFeelPreset === 'wonder') {
    MovementProfile.locomotion.groundAccel = charCfg.groundAccel;
    MovementProfile.skid.decel = charCfg.skidDecel;
    MovementProfile.jump.gravityRising = charCfg.gravityRising;
    MovementProfile.jump.gravityFalling = charCfg.gravityFalling;
  } else {
    applyFeelPreset(MovementProfile.activeFeelPreset);
  }
  return charCfg;
}

export function applyFeelPreset(presetId = 'wonder') {
  const preset = FEEL_PRESETS[presetId] || FEEL_PRESETS.wonder;
  MovementProfile.activeFeelPreset = preset.id;

  const charCfg = MovementProfile.characters[MovementProfile.activeCharacter] || MovementProfile.characters.mario;

  MovementProfile.locomotion.startImpulse = preset.startImpulse;
  MovementProfile.skid.threshold = preset.skidThreshold;
  MovementProfile.apexFloat.maxFrames = preset.apexFloatMaxFrames;
  MovementProfile.presentation.crouchSquashSy = preset.crouchSquashSy;
  MovementProfile.presentation.cameraYawTilt = preset.cameraYawTiltDeg;
  MovementProfile.stage8.cameraYawTiltDeg = preset.cameraYawTiltDeg;

  if (preset.respectsCharacterDeltas && charCfg) {
    MovementProfile.locomotion.groundAccel = charCfg.groundAccel;
    MovementProfile.skid.decel = charCfg.skidDecel;
    MovementProfile.jump.gravityRising = charCfg.gravityRising;
    MovementProfile.jump.gravityFalling = charCfg.gravityFalling;
  } else {
    MovementProfile.locomotion.groundAccel = preset.groundAccel;
    MovementProfile.skid.decel = preset.skidDecel;
    MovementProfile.jump.gravityRising = preset.gravityRising;
    MovementProfile.jump.gravityFalling = preset.gravityFalling;
  }

  return preset;
}

export function resetMovementProfile() {
  for (const section of Object.keys(DEFAULT_MOVEMENT_PROFILE)) {
    const val = DEFAULT_MOVEMENT_PROFILE[section];
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      MovementProfile[section] = structuredClone(val);
    } else {
      MovementProfile[section] = val;
    }
  }
}

export default MovementProfile;
