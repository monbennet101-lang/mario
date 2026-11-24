/**
 * CadenceConfig — Centralized Configuration for Zero-Crop 3D-to-2D Sprite Extraction
 * ===================================================================================
 * Zero magic numbers: all frame sampling cadences, programmatic 3D rotation sequences,
 * orthographic safety margins, studio lighting parameters, foot anchors, and custom
 * animation tags are defined declaratively here.
 *
 * Tick Convention for mario.glb / luigi.glb:
 *   The glTF animations were exported from Blender at 25 Hz keyframe spacing
 *   (1 Blender tick = 0.04 seconds). Sampling tick `k` evaluates the glTF
 *   AnimationClip at `timeSec = k * TICK_SECONDS` (clamped to clip.duration).
 */

export const EXTRACTION_CONFIG = Object.freeze({
  version: '1.0.0',

  // Output sprite cell dimensions (pixels)
  frameSize: 256,

  // glTF animation sample spacing (1 Blender timeline tick = 0.04 s)
  tickSeconds: 0.04,

  // Zero-crop orthographic framing defaults (empirical mario.glb baseline)
  camera: Object.freeze({
    // Right-side profile: model rotated +90 deg around +Y faces screen-right (+X)
    // and presents the character's right-side profile toward the +Z ortho camera.
    profileYawDeg: 90,
    // Minimum orthographic view window in world units (~56.0 guarantees 15-20% border padding)
    minOrthoScale: 56.0,
    // Target safety padding ratio across the bounding box span (17.5% on each side -> ~1.35x or >=56.0)
    targetSafetyMultiplier: 1.24,
    // Minimum acceptable alpha margin on all 4 edges (pixels). Must be >= 1 to guarantee 0 crop.
    minSafeMarginPx: 4,
    // Auto-expansion factor applied if any rendered frame touches image borders
    autoExpandFactor: 1.12,
    maxAutoExpandPasses: 5,
    near: 0.1,
    far: 500,
    distance: 150,
    // Fallback empirical centroid (Three.js Y-up space, equivalent to Blender Y=-1.60, Z=15.30)
    empiricalCentroid: Object.freeze({
      x: 0.0,
      y: 15.3,
      z: 1.6,
    }),
    // Empirical torso pivot Y for mid-air pitch somersaults (GroundPound windup)
    somersaultPivotY: 15.3,
  }),

  // Canonical foot anchor point in normalized frame coordinates
  footAnchor: Object.freeze({
    x: 0.5,
    y: 0.15,
  }),

  // Alpha threshold (0..255) for bounding-box crop audit
  alphaThreshold: 8,

  // Balanced 3-point studio lighting + subtle IBL for crisp silhouette & vivid textures
  studioLighting: Object.freeze({
    exposure: 1.12,
    environmentIntensity: 0.55,
    hemi: Object.freeze({ sky: 0xf4f9ff, ground: 0x3b4454, intensity: 0.95 }),
    key: Object.freeze({ color: 0xfff8eb, intensity: 2.1, position: [45, 70, 95] }),
    fill: Object.freeze({ color: 0xdbeafe, intensity: 0.85, position: [-65, 25, 65] }),
    rim: Object.freeze({ color: 0x93c5fd, intensity: 1.25, position: [-35, 55, -80] }),
  }),

  // Default output paths relative to mario-wonder-engine root
  defaultOutputs: Object.freeze({
    atlasPng: 'public/sprites/character_atlas.png',
    atlasJson: 'public/sprites/character_atlas.json',
  }),

  // Candidate model lookup paths (first existing path is used)
  candidateModelPaths: Object.freeze([
    'web_assets/models/mario.glb',
    'public/models/mario.glb',
    'mario-wonder-engine/public/models/mario.glb',
    '../mario.glb',
    'mario.glb',
  ]),
});

/**
 * Helper to generate an inclusive stepped tick list: [start, start+step, ..., end].
 */
export function rangeTicks(start, end, step = 1) {
  const ticks = [];
  for (let t = start; t <= end; t += step) {
    ticks.push(t);
  }
  return ticks;
}

/**
 * High-Density 60 Hz Cadence Mapping (All 27 GLB Animation Clips)
 * ---------------------------------------------------------------
 * Each entry defines either:
 *   - `ticks`: ordered animation sample indices to extract from the glTF clip
 *   - `programmaticFrames`: explicit pose overrides (yawOffsetDeg / pitchDeg)
 *     for clips that are static 1-frame poses in glTF (SpinJump, SpinAir, GroundPound).
 */
export const ANIMATION_CADENCE_SPECS = Object.freeze([
  // 1. Ultra-Smooth Breathing Idle (31 frames: 0, 5, 10, ..., 150 -> 12 FPS breathing loop)
  {
    name: 'Idle',
    sourceClip: 'Idle',
    category: 'locomotion',
    fps: 12,
    loop: true,
    cadenceDescription: 'Every 5 ticks across 154 frames (0..150) — 12 FPS silky breathing cycle',
    ticks: rangeTicks(0, 150, 5), // 31 frames
  },

  // 2. Locomotion Loops
  {
    name: 'Walk',
    sourceClip: 'Walk',
    category: 'locomotion',
    fps: 15,
    loop: true,
    cadenceDescription: 'Every 4 ticks (0..56)',
    ticks: rangeTicks(0, 56, 4), // 15 frames
  },
  {
    name: 'Run',
    sourceClip: 'Run',
    category: 'locomotion',
    fps: 18,
    loop: true,
    cadenceDescription: 'Every 4 ticks (0..56)',
    ticks: rangeTicks(0, 56, 4), // 15 frames
  },
  {
    name: 'Sprint',
    sourceClip: 'Sprint',
    category: 'locomotion',
    fps: 24,
    loop: true,
    cadenceDescription: 'Every 4 ticks (0..56)',
    ticks: rangeTicks(0, 56, 4), // 15 frames
  },
  {
    name: 'Skid',
    sourceClip: 'Skid',
    category: 'locomotion',
    fps: 30,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..10) — full 60 Hz braking slide',
    ticks: rangeTicks(0, 10, 1), // 11 frames
  },
  {
    name: 'TurnAround',
    sourceClip: 'TurnAround',
    category: 'locomotion',
    fps: 30,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..4)',
    ticks: rangeTicks(0, 4, 1), // 5 frames
  },
  {
    name: 'CrouchStart',
    sourceClip: 'CrouchStart',
    category: 'locomotion',
    fps: 24,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..1)',
    ticks: [0, 1], // 2 frames
  },
  {
    name: 'Crouch',
    sourceClip: 'Crouch',
    category: 'locomotion',
    fps: 8,
    loop: true,
    cadenceDescription: 'Every 15 ticks (0..90)',
    ticks: rangeTicks(0, 90, 15), // 7 frames
  },

  // 3. Aerial Acrobatics
  {
    name: 'Jump',
    sourceClip: 'Jump',
    category: 'aerial',
    fps: 30,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..11)',
    ticks: rangeTicks(0, 11, 1), // 12 frames
  },
  {
    name: 'DoubleJump',
    sourceClip: 'DoubleJump',
    category: 'aerial',
    fps: 30,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..11)',
    ticks: rangeTicks(0, 11, 1), // 12 frames
  },
  {
    name: 'TripleJump',
    sourceClip: 'TripleJump',
    category: 'aerial',
    fps: 30,
    loop: false,
    cadenceDescription: 'Every 2 ticks (0..32) — full 360° somersault roll',
    ticks: rangeTicks(0, 32, 2), // 17 frames
  },
  {
    name: 'FlutterJump',
    sourceClip: 'FlutterJump',
    category: 'aerial',
    fps: 24,
    loop: true,
    cadenceDescription: 'Every 2 ticks across 0..19 (plus endpoint 19)',
    ticks: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 19], // 11 frames
  },
  {
    name: 'WallSlide',
    sourceClip: 'WallSlide',
    category: 'aerial',
    fps: 12,
    loop: true,
    cadenceDescription: 'Every 6 ticks (0..84)',
    ticks: rangeTicks(0, 84, 6), // 15 frames
  },
  {
    name: 'WallJump',
    sourceClip: 'WallJump',
    category: 'aerial',
    fps: 30,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..8)',
    ticks: rangeTicks(0, 8, 1), // 9 frames
  },

  // 4. Programmatic 3D Rotation Solver (360° Turnaround & Pitch Somersault)
  {
    name: 'SpinJump',
    sourceClip: 'SpinJump',
    category: 'acrobatic_rotation',
    fps: 30,
    loop: true,
    cadenceDescription: 'Programmatic 360° yaw turnaround in 30° increments (0°..330°)',
    programmaticFrames: rangeTicks(0, 330, 30).map((yawDeg) => ({
      tick: 0,
      yawOffsetDeg: yawDeg,
      pitchDeg: 0,
    })), // 12 frames
  },
  {
    name: 'SpinAir',
    sourceClip: 'SpinAir',
    category: 'acrobatic_rotation',
    fps: 30,
    loop: true,
    cadenceDescription: 'Programmatic 360° yaw turnaround in 30° increments (0°..330°)',
    programmaticFrames: rangeTicks(0, 330, 30).map((yawDeg) => ({
      tick: 0,
      yawOffsetDeg: yawDeg,
      pitchDeg: 0,
    })), // 12 frames
  },
  {
    name: 'GroundPound',
    sourceClip: 'GroundPound',
    category: 'acrobatic_rotation',
    fps: 24,
    loop: false,
    cadenceDescription: 'Programmatic pitch front-flip somersault (0°, 90°, 180°, 270°) + downward terminal dive poses',
    programmaticFrames: [
      { tick: 0, yawOffsetDeg: 0, pitchDeg: 0, phase: 'windup_flip_0' },
      { tick: 0, yawOffsetDeg: 0, pitchDeg: 90, phase: 'windup_flip_90' },
      { tick: 1, yawOffsetDeg: 0, pitchDeg: 180, phase: 'windup_flip_180' },
      { tick: 1, yawOffsetDeg: 0, pitchDeg: 270, phase: 'windup_flip_270' },
      { tick: 1, yawOffsetDeg: 0, pitchDeg: 330, phase: 'dive_snap_in' },
      { tick: 1, yawOffsetDeg: 0, pitchDeg: 0, phase: 'dive_descent' },
      { tick: 2, yawOffsetDeg: 0, pitchDeg: 0, phase: 'dive_terminal' },
    ], // 7 frames
  },
  {
    name: 'GroundPoundLand',
    sourceClip: 'GroundPoundLand',
    category: 'combat',
    fps: 24,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..5)',
    ticks: rangeTicks(0, 5, 1), // 6 frames
  },

  // 5. Combat, Actions & Reactions
  {
    name: 'Fireball',
    sourceClip: 'Fireball',
    category: 'combat',
    fps: 24,
    loop: false,
    cadenceDescription: 'Every 2 ticks (0..18)',
    ticks: rangeTicks(0, 18, 2), // 10 frames
  },
  {
    name: 'FireballAir',
    sourceClip: 'FireballAir',
    category: 'combat',
    fps: 24,
    loop: false,
    cadenceDescription: 'Every 1 tick (0..12)',
    ticks: rangeTicks(0, 12, 1), // 13 frames
  },
  {
    name: 'CarryWalk',
    sourceClip: 'CarryWalk',
    category: 'action',
    fps: 18,
    loop: true,
    cadenceDescription: 'Every 4 ticks (0..56)',
    ticks: rangeTicks(0, 56, 4), // 15 frames
  },
  {
    name: 'Throw',
    sourceClip: 'Throw',
    category: 'action',
    fps: 24,
    loop: false,
    cadenceDescription: 'Every 2 ticks (0..28)',
    ticks: rangeTicks(0, 28, 2), // 15 frames
  },
  {
    name: 'Climb',
    sourceClip: 'Climb',
    category: 'action',
    fps: 16,
    loop: true,
    cadenceDescription: 'Every 2 ticks (0..20)',
    ticks: rangeTicks(0, 20, 2), // 11 frames
  },
  {
    name: 'Swim',
    sourceClip: 'Swim',
    category: 'action',
    fps: 15,
    loop: true,
    cadenceDescription: 'Every 2 ticks (0..16)',
    ticks: rangeTicks(0, 16, 2), // 9 frames
  },
  {
    name: 'Damage',
    sourceClip: 'Damage',
    category: 'reaction',
    fps: 24,
    loop: false,
    cadenceDescription: 'Every 2 ticks (0..22)',
    ticks: rangeTicks(0, 22, 2), // 12 frames
  },
  {
    name: 'Defeat',
    sourceClip: 'Defeat',
    category: 'reaction',
    fps: 20,
    loop: false,
    cadenceDescription: 'Every 8 ticks (0..144)',
    ticks: rangeTicks(0, 144, 8), // 19 frames
  },
  {
    name: 'Victory',
    sourceClip: 'Victory',
    category: 'reaction',
    fps: 18,
    loop: true,
    cadenceDescription: 'Every 3 ticks (0..48)',
    ticks: rangeTicks(0, 48, 3), // 17 frames
  },
]);

/**
 * Default custom / repurposed animation tags (extensible via user config JSON).
 * Maps engine-specific gameplay state aliases onto extracted animation slices.
 */
export const DEFAULT_CUSTOM_TAGS = Object.freeze({
  Fall: { sourceAnimation: 'Jump', frameIndices: [9, 10, 11], fps: 12, loop: false },
  ApexFloat: { sourceAnimation: 'Jump', frameIndices: [6, 7, 8], fps: 12, loop: true },
  ButtSlide: { sourceAnimation: 'Crouch', frameIndices: [0, 1, 2, 3], fps: 12, loop: true },
  CrouchSlide: { sourceAnimation: 'Crouch', frameIndices: [0, 1, 2], fps: 12, loop: true },
  SpinTwirl: { sourceAnimation: 'SpinAir', frameIndices: null, fps: 30, loop: true },
  GroundPoundWindup: { sourceAnimation: 'GroundPound', frameIndices: [0, 1, 2, 3], fps: 24, loop: false },
  GroundPoundFall: { sourceAnimation: 'GroundPound', frameIndices: [4, 5, 6], fps: 24, loop: true },
  Pivot: { sourceAnimation: 'TurnAround', frameIndices: null, fps: 30, loop: false },
});

/**
 * Flatten ANIMATION_CADENCE_SPECS into an ordered list of frame extraction jobs.
 * Pure, deterministic function used by both the renderer and headless unit tests.
 */
export function expandExtractionJobs(specs = ANIMATION_CADENCE_SPECS) {
  const jobs = [];
  let globalIndex = 0;

  for (const spec of specs) {
    const entries = spec.programmaticFrames
      ? spec.programmaticFrames
      : spec.ticks.map((tick) => ({ tick, yawOffsetDeg: 0, pitchDeg: 0, phase: null }));

    entries.forEach((entry, localIdx) => {
      const paddedIdx = String(localIdx).padStart(2, '0');
      const key = `${spec.name}_${paddedIdx}`;
      jobs.push({
        globalIndex,
        key,
        animation: spec.name,
        sourceClip: spec.sourceClip,
        frameIndex: localIdx,
        tick: entry.tick,
        timeSec: Number((entry.tick * EXTRACTION_CONFIG.tickSeconds).toFixed(4)),
        yawOffsetDeg: entry.yawOffsetDeg || 0,
        pitchDeg: entry.pitchDeg || 0,
        phase: entry.phase || null,
      });
      globalIndex += 1;
    });
  }

  return jobs;
}

export default EXTRACTION_CONFIG;
