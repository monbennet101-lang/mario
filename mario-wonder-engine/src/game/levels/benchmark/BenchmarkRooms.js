/**
 * BenchmarkRooms — 5 Test Rooms for Stage 1 Verification
 * ========================================================
 * Room 1: Runway (60 flat tiles with distance markers)
 * Room 2: Gap Ladder (pits from 1 to 8 tiles wide)
 * Room 3: Jump Shaft (14 tiles high with 1-tile ledges)
 * Room 4: Wall Shaft (3 tiles wide × 14 tiles high)
 * Room 5: Slope Ramps (45° and 26.5° inclines)
 */

import TileMap from '../../../engine/physics/TileMap.js';
import MovementProfile from '../../config/MovementProfile.js';
import MovingPlatform from '../../entities/MovingPlatform.js';

const { tileTypes } = MovementProfile;
const S = tileTypes.SOLID;
const E = tileTypes.EMPTY;

/**
 * Create Room 1: Flat Runway
 * 60 flat tiles with distance markers every 5 tiles.
 */
export function createRunway() {
  const cols = 70;
  const rows = 20;
  const map = new TileMap(cols, rows);

  // Floor at row 4 (Y=4 in world space → 4 tiles up from bottom)
  map.fillRect(0, 0, cols, 4, S);

  // Walls on left and right
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // Stage 2 Crouch-Slide Test Tunnel (1.0 tile clearance above Y=4 floor)
  map.fillRect(48, 5, 7, 2, S);

  // Stage 3 Ceiling Corner-Nudge & Bonk Test Block (4 tiles above Y=4 floor)
  map.fillRect(16, 8, 1, 1, S);

  return {
    name: 'Room 1: Runway',
    map,
    spawnX: 3,
    spawnY: 5,
    floorY: 4,
    initialPowerUp: 'super',
    crouchTunnel: { xStart: 48, xEnd: 55, ceilingY: 5 },
    ceilingTestBlock: { x: 16, y: 8 },
    showDistanceMarkers: true,
    description: '60 flat tiles + ceiling block & crouch tunnel — jump arc, corner nudge & sprint testing',
  };
}

/**
 * Create Room 2: Gap Ladder
 * Platforms separated by pits of increasing width (1 to 8 tiles).
 */
export function createGapLadder() {
  const cols = 100;
  const rows = 20;
  const map = new TileMap(cols, rows);
  const gapMarkers = [];

  // Floor base
  let x = 0;
  map.fillRect(x, 0, 8, 4, S); // Starting platform
  x += 8;

  for (let gap = 1; gap <= 8; gap++) {
    gapMarkers.push({ xStart: x, width: gap, floorY: 4 });
    x += gap; // Gap
    map.fillRect(x, 0, 6, 4, S); // Landing platform
    x += 6;
  }

  // Walls
  map.fillRect(0, 0, 1, rows, S);

  return {
    name: 'Room 2: Gap Ladder',
    map,
    spawnX: 3,
    spawnY: 5,
    floorY: 4,
    initialPowerUp: 'super',
    gapMarkers,
    description: 'Pits 1→8 tiles wide — jump distance & coyote timing calibration',
  };
}

/**
 * Create Room 3: Jump Shaft
 * 14+ tiles high with climbable 1-tile ledges for vertical jump, step-up & corner nudge testing.
 */
export function createJumpShaft() {
  const cols = 20;
  const rows = 25;
  const map = new TileMap(cols, rows);

  // Floor
  map.fillRect(0, 0, cols, 2, S);

  // Walls
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // Ascending ledges (climbable with 4.10t standing jump: 3 tiles vertical step, 2-3 tiles horizontal)
  const ledges = [
    { x: 2, y: 5, w: 4 },     // 3 tiles up from floor Y=2
    { x: 9, y: 8, w: 4 },     // 3 tiles up
    { x: 3, y: 11, w: 4 },    // 3 tiles up
    { x: 10, y: 14, w: 4 },   // 3 tiles up
    { x: 4, y: 17, w: 4 },    // 3 tiles up
    { x: 9, y: 20, w: 6 },    // Top platform
  ];

  for (const ledge of ledges) {
    map.fillRect(ledge.x, ledge.y, ledge.w, 1, S);
  }

  return {
    name: 'Room 3: Jump Shaft',
    map,
    spawnX: 3,
    spawnY: 3,
    initialPowerUp: 'super',
    description: 'Vertical climb shaft — standing apex (4.10t), corner nudge & ledge step-up',
  };
}

/**
 * Create Room 4: Wall Shaft
 * 3 tiles wide × 14 tiles high for wall jump testing.
 */
export function createWallShaft() {
  const cols = 15;
  const rows = 25;
  const map = new TileMap(cols, rows);

  // Floor
  map.fillRect(0, 0, cols, 2, S);

  // Left wall of shaft
  map.fillRect(5, 2, 1, 20, S);

  // Right wall of shaft
  map.fillRect(9, 2, 1, 20, S);

  // Top cap
  map.fillRect(5, 22, 5, 1, S);

  // Outer walls
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  return {
    name: 'Room 4: Wall Shaft',
    map,
    spawnX: 7,
    spawnY: 3,
    floorY: 2,
    initialPowerUp: 'super',
    wallHeightMarkers: { leftWallX: 6, rightWallX: 9, floorY: 2, maxHeight: 20 },
    description: '3-tile wide shaft — wall slide and wall jump chain climbing',
  };
}

/**
 * Create Room 5: Slopes, Butt-Slide, Semisolids & Moving Platforms
 * Features:
 *   - 45° ascending/descending hill peak (cols 6..17)
 *   - Stacked 1-way Semisolid platforms (cols 16..20 @ Y=6, Y=10)
 *   - 26.57° ascending hill -> summit -> 8-tile 26.57° butt-slide chute -> long flat runout
 *   - Horizontal shuttle, vertical sine elevator & mid-level moving bridge
 */
export function createSlopeRamps() {
  const cols = 68;
  const rows = 22;
  const map = new TileMap(cols, rows);

  // Floor base (Y = 2.0)
  map.fillRect(0, 0, cols, 2, S);

  // Outer walls
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // 1) 45° Hill Peak: Ascend (cols 6..10, Y 2->7), Summit (cols 11..12, Y=7), Descend (cols 13..17, Y 7->2)
  for (let i = 0; i < 5; i++) {
    const col = 6 + i;
    const row = 2 + i;
    map.set(col, row, tileTypes.SLOPE_45);
    if (i > 0) map.fillRect(col, 2, 1, i, S);
  }
  map.fillRect(11, 2, 2, 5, S); // Summit top = row 7.0
  for (let i = 0; i < 5; i++) {
    const col = 13 + i;
    const row = 6 - i;
    map.set(col, row, tileTypes.SLOPE_45_DOWN);
    if (row > 2) map.fillRect(col, 2, 1, row - 2, S);
  }

  // 2) Stacked One-Way Semisolid Platforms (cols 16..20, top Y=6 and Y=10)
  map.fillRect(16, 5, 5, 1, tileTypes.SEMISOLID);
  map.fillRect(16, 9, 5, 1, tileTypes.SEMISOLID);

  // 3) 26.57° Hill + 8-Tile Butt-Slide Chute
  // Ascend: cols 22..29, Y 2->6
  for (let i = 0; i < 8; i++) {
    const col = 22 + i;
    const row = 2 + Math.floor(i / 2);
    const slopeType = i % 2 === 0 ? tileTypes.SLOPE_26_UP_1 : tileTypes.SLOPE_26_UP_2;
    map.set(col, row, slopeType);
    if (row > 2) map.fillRect(col, 2, 1, row - 2, S);
  }
  // Summit plateau: cols 30..31, top Y=6.0
  map.fillRect(30, 2, 2, 4, S);
  // 8-Tile Descending 26.57° Butt-Slide Chute: cols 32..39, Y 6->2
  for (let i = 0; i < 8; i++) {
    const col = 32 + i;
    const row = 5 - Math.floor(i / 2);
    const slopeType = i % 2 === 0 ? tileTypes.SLOPE_26_DOWN_1 : tileTypes.SLOPE_26_DOWN_2;
    map.set(col, row, slopeType);
    if (row > 2) map.fillRect(col, 2, 1, row - 2, S);
  }

  // 4) Moving Platforms (updated at 60 Hz prior to player tick)
  const platforms = [
    new MovingPlatform({
      id: 'mid_bridge',
      startX: 23.0,
      startY: 8.5,
      endX: 28.0,
      endY: 8.5,
      width: 3.0,
      height: 0.45,
      periodSec: 3.6,
      mode: 'linear',
      oneWay: true,
    }),
    new MovingPlatform({
      id: 'horiz_shuttle',
      startX: 43.0,
      startY: 5.2,
      endX: 51.0,
      endY: 5.2,
      width: 3.5,
      height: 0.45,
      periodSec: 4.0,
      mode: 'linear',
      oneWay: true,
    }),
    new MovingPlatform({
      id: 'vert_elevator',
      startX: 57.5,
      startY: 2.5,
      endX: 57.5,
      endY: 9.0,
      width: 3.5,
      height: 0.45,
      periodSec: 4.5,
      mode: 'sine',
      oneWay: true,
    }),
  ];

  return {
    name: 'Room 5: Slopes & Platforms',
    map,
    spawnX: 3,
    spawnY: 3,
    floorY: 2,
    initialPowerUp: 'super',
    platforms,
    slopeCues: [
      { x: 12, y: 7.4, text: '45° HILL', color: '#4ADE80' },
      { x: 18.5, y: 10.45, text: 'SEMISOLID [↓+Z]', color: '#38BDF8' },
      { x: 31, y: 6.4, text: '26.5° BUTT-SLIDE [↓]', color: '#FACC15' },
      { x: 47.0, y: 4.2, text: 'FLAT RUNOUT', color: '#CBD5E1' },
    ],
    description: '45° & 26.57° slopes, 8-tile butt-slide chute, 1-way semisolids & moving platforms',
  };
}

/**
 * Create Room 6: Grassland Level Kit & Block Showcase
 * Combines 9-slice autotiled grassland terrain, Question Blocks [?],
 * sprint/ground-pound Brick Blocks, Hard Block pyramid, 2-tile Warp Pipes,
 * Semisolid Mushroom Platforms, Spinning Gold Coins, seamless slopes & Goal Flagpole.
 */
export function createLevelKitShowcase() {
  const cols = 92;
  const rows = 22;
  const map = new TileMap(cols, rows);
  const Q = tileTypes.QUESTION_BLOCK;
  const B = tileTypes.BRICK_BLOCK;
  const H = tileTypes.HARD_BLOCK;
  const P = tileTypes.PIPE;
  const M = tileTypes.MUSHROOM_PLATFORM;

  // Base grassland ground (top surface Y = 2.0) + outer boundary walls
  map.fillRect(0, 0, cols, 2, S);
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // 1) Initial viewport Question & Brick block row (row=5 -> 3t above floor) + high bonus '?'
  map.set(7, 5, Q);
  map.set(8, 5, B);
  map.set(9, 5, Q);
  map.set(10, 5, B);
  map.set(11, 5, Q);
  map.set(9, 9, Q);

  // 2) Twin 2-tile Emerald Warp Pipes
  map.fillRect(15, 2, 2, 2, P); // 2t tall (top Y=4)
  map.fillRect(21, 2, 2, 3, P); // 3t tall (top Y=5)

  // 3) Semisolid Mushroom Canopy + Sprint/Pound Brick Bridge
  map.fillRect(26, 5, 5, 1, M); // Low mushroom (top Y=6)
  map.fillRect(32, 8, 6, 1, M); // High mushroom (top Y=9)
  map.fillRect(39, 5, 5, 1, M); // Right mushroom (top Y=6)

  // Overhead breakable/poundable Brick & Question shelf
  map.fillRect(27, 9, 3, 1, B);
  map.set(28, 9, Q);
  map.fillRect(45, 5, 4, 1, B); // Ground-pound or sprint-shatter Brick Bridge!

  // 4) Seamless 45° Ascent -> Summit -> 26.57° 8-Tile Descent + Tall Warp Pipe
  for (let i = 0; i < 4; i++) {
    const col = 51 + i;
    const row = 2 + i;
    map.set(col, row, tileTypes.SLOPE_45);
    if (i > 0) map.fillRect(col, 2, 1, i, S);
  }
  map.fillRect(55, 2, 2, 4, S); // Summit (top Y=6)
  map.set(55, 9, Q);
  for (let i = 0; i < 8; i++) {
    const col = 57 + i;
    const row = 5 - Math.floor(i / 2);
    const sType = i % 2 === 0 ? tileTypes.SLOPE_26_DOWN_1 : tileTypes.SLOPE_26_DOWN_2;
    map.set(col, row, sType);
    if (row > 2) map.fillRect(col, 2, 1, row - 2, S);
  }
  map.fillRect(66, 2, 2, 3, P); // 3t Warp Pipe before final pyramid

  // 5) Carved Hard Block Staircase Pyramid & Goal Flagpole Pedestal
  map.fillRect(70, 2, 1, 1, H);
  map.fillRect(71, 2, 1, 2, H);
  map.fillRect(72, 2, 1, 3, H);
  map.fillRect(73, 2, 2, 4, H); // 4t high launch ledge (top Y=6)
  map.set(80, 2, H);            // Flagpole anchor pedestal (top Y=3)

  // Collectible spinning gold coins (placed along intuitive sightlines & arcs)
  const coins = [
    // Over initial block row & pipes
    { x: 7.5, y: 6.6 },
    { x: 9.5, y: 6.6 },
    { x: 11.5, y: 6.6 },
    { x: 18.5, y: 4.5 },
    { x: 19.5, y: 5.2 },
    { x: 21.5, y: 6.2 },
    { x: 22.5, y: 6.2 },
    // Along Mushroom canopies
    { x: 27.5, y: 6.6 },
    { x: 28.5, y: 6.6 },
    { x: 29.5, y: 6.6 },
    { x: 33.5, y: 9.6 },
    { x: 34.5, y: 9.6 },
    { x: 35.5, y: 9.6 },
    { x: 36.5, y: 9.6 },
    { x: 40.5, y: 6.6 },
    { x: 41.5, y: 6.6 },
    { x: 42.5, y: 6.6 },
    // Under Brick Bridge (reward for Ground Pound or sprint run underneath)
    { x: 46.0, y: 2.7 },
    { x: 47.0, y: 2.7 },
    { x: 48.0, y: 2.7 },
    // Descending 26.5° slope coin trail
    { x: 58.5, y: 6.1 },
    { x: 60.5, y: 5.1 },
    { x: 62.5, y: 4.1 },
    { x: 64.5, y: 3.1 },
  ];

  // Decorative foreground Layer 4 (Z=+15, 1.10x) grass tufts anchored on world coords
  const foregroundProps = [
    { x: 5.5, y: 2.0 },
    { x: 13.5, y: 2.0 },
    { x: 24.5, y: 2.0 },
    { x: 44.0, y: 2.0 },
    { x: 69.0, y: 2.0 },
    { x: 83.5, y: 2.0 },
  ];

  return {
    name: 'Room 6: Grassland Kit',
    map,
    spawnX: 3,
    spawnY: 3,
    floorY: 2,
    initialPowerUp: 'super',
    coins,
    flagpole: { x: 80.5, baseY: 3, topY: 12 },
    foregroundProps,
    slopeCues: [
      { x: 9.5, y: 10.6, text: '[?] COIN BLOCKS', color: '#FACC15' },
      { x: 47.0, y: 6.6, text: 'SPRINT / POUND BRICKS', color: '#FB923C' },
      { x: 80.5, y: 12.6, text: 'GOAL FLAG', color: '#4ADE80' },
    ],
    description: 'Grassland 9-slice atlas, [?] & Brick blocks, Warp Pipes, Mushroom canopy, coins & Flagpole',
  };
}

/**
 * Create Room 7: Stage 9 Power-Ups, Hitstop Combat & Shell Bowling Arena
 * Spawns Small Mario/Luigi next to Super Mushroom & Fire Flower [?] blocks,
 * followed by Goomba patrols, 3-Goomba Active-Stomp Bounce Chain, Koopa Shell
 * Bowling Alley between pipes, Spiny bridge, and Goal Flagpole.
 */
export function createCombatShowcase() {
  const cols = 86;
  const rows = 22;
  const map = new TileMap(cols, rows);
  const Q = tileTypes.QUESTION_BLOCK;
  const B = tileTypes.BRICK_BLOCK;
  const H = tileTypes.HARD_BLOCK;
  const P = tileTypes.PIPE;
  const M = tileTypes.MUSHROOM_PLATFORM;

  // Base grassland ground (top Y = 2.0) + boundary walls
  map.fillRect(0, 0, cols, 2, S);
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // 1) Power-Up Starter Strip (Small -> Mushroom [?] -> Fire Flower [?])
  map.set(7, 5, Q);  // Super Mushroom
  map.set(8, 5, B);
  map.set(9, 5, Q);  // Fire Flower
  map.set(10, 5, B);
  map.set(11, 5, Q); // Coin

  // 2) Goomba Patrol Arena (contained between low 1t curbs at col 13 and col 25)
  map.set(13, 2, H);
  map.set(25, 2, H);

  // 3) 3-Goomba Active-Stomp Chain Gallery + high reward Mushroom Shelf (Y=7)
  map.fillRect(32, 6, 6, 1, M);
  map.set(34, 9, Q); // Adaptive power-up above active bounce shelf!
  map.set(41, 2, H);

  // 4) Koopa Shell Bowling Alley enclosed between two 3t Warp Pipes (cols 43..57)
  map.fillRect(43, 2, 2, 3, P);
  map.fillRect(56, 2, 2, 3, P);

  // 5) Spiny Bridge (use Spin Twirl or Fireballs!) + Brick target wall + Flagpole
  map.fillRect(68, 2, 1, 3, B); // Fireball / Sprint smash wall
  map.set(76, 2, H);

  const powerUpBlocks = [
    { col: 7, row: 5, item: 'mushroom' },
    { col: 9, row: 5, item: 'fire_flower' },
    { col: 34, row: 9, item: 'adaptive_powerup' },
  ];

  const enemies = [
    // Goomba Patrol Arena
    { kind: 'goomba', x: 18.0, y: 2.0, dir: -1 },
    { kind: 'goomba', x: 22.0, y: 2.0, dir: -1 },
    // 3-Goomba Active-Stomp Chain
    { kind: 'goomba', x: 29.0, y: 2.0, dir: 1, turnAtLedges: true },
    { kind: 'goomba', x: 33.5, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'goomba', x: 37.5, y: 2.0, dir: -1, turnAtLedges: true },
    // Koopa Shell Bowling Alley & Ricochet Trap
    { kind: 'koopa', x: 46.5, y: 2.0, dir: -1 },
    { kind: 'goomba', x: 50.0, y: 2.0, dir: 1 },
    { kind: 'goomba', x: 52.0, y: 2.0, dir: -1 },
    { kind: 'goomba', x: 54.0, y: 2.0, dir: -1 },
    // Spiny Fireball / Spin-Bounce Duo
    { kind: 'spiny', x: 61.5, y: 2.0, dir: -1 },
    { kind: 'spiny', x: 65.0, y: 2.0, dir: -1 },
  ];

  const coins = [
    { x: 7.5, y: 6.6 },
    { x: 11.5, y: 6.6 },
    { x: 33.0, y: 7.6 },
    { x: 34.5, y: 7.6 },
    { x: 36.0, y: 7.6 },
    { x: 49.5, y: 4.5 },
    { x: 51.5, y: 4.5 },
    { x: 53.5, y: 4.5 },
  ];

  const foregroundProps = [
    { x: 5.5, y: 2.0 },
    { x: 26.5, y: 2.0 },
    { x: 59.0, y: 2.0 },
    { x: 79.0, y: 2.0 },
  ];

  return {
    name: 'Room 7: Combat & Power-Ups',
    map,
    spawnX: 3,
    spawnY: 3,
    floorY: 2,
    initialPowerUp: 'small',
    powerUpBlocks,
    enemies,
    coins,
    flagpole: { x: 76.5, baseY: 3, topY: 12 },
    foregroundProps,
    slopeCues: [
      { x: 8.5, y: 6.8, text: 'MUSHROOM / FIRE FLOWER [?]', color: '#FACC15' },
      { x: 19.5, y: 4.8, text: 'STOMP PATROL [HOLD Z = 4t+]', color: '#FEF08A' },
      { x: 50.5, y: 6.2, text: 'SHELL BOWLING [HOLD X = CARRY]', color: '#4ADE80' },
      { x: 63.5, y: 5.0, text: 'THORN [FIRE X / SPIN E]', color: '#FB923C' },
    ],
    description: 'Stage 9 Arena: Power-Ups, Stomp Chains, Shell Carry/Bowling & Hitstop',
  };
}

/**
 * Create Room 8: Stage 10 Master Integration — The Gauntlet
 * Seamless 294-tile end-to-end benchmark course uniting all 9 sections (A–I):
 *   A: Flat Runway & Power-Up Warmup (40t)
 *   B: Gap Ladder (2, 3, 4, 5, 6, 7, 8 tiles)
 *   C: Vertical Step Course (1, 2, 3, 4t ledges + corner-nudge traps)
 *   D: Wall-Jump Shaft (3t wide x 14t climb)
 *   E: Slope Hill (45° + 26.57° butt-slide chute into Goombas)
 *   F: Semisolid & Moving Platform Chasm
 *   G: Enemy Playground (Stomp chains, Koopa bowling, Fire Flower & Spinies)
 *   H: Warp Pipe Passage -> 1-Tile Cap-Snatch Crawl Tunnel
 *   I: Goal Pole Finale
 */
export function createGauntlet() {
  const cols = 294;
  const rows = 26;
  const map = new TileMap(cols, rows);
  const Q = tileTypes.QUESTION_BLOCK;
  const B = tileTypes.BRICK_BLOCK;
  const H = tileTypes.HARD_BLOCK;
  const P = tileTypes.PIPE;
  const M = tileTypes.MUSHROOM_PLATFORM;

  // Outer boundary walls
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // ── Section A: Flat Runway (cols 0..45, top Y=2) ──
  map.fillRect(0, 0, 45, 2, S);
  map.set(12, 5, Q); // Super Mushroom
  map.set(13, 5, B);
  map.set(14, 5, Q); // Fire Flower
  map.set(28, 5, Q); // Coin bonus

  // ── Section B: Gap Ladder (2, 3, 4, 5, 6, 7, 8 tiles across cols 45..122) ──
  const gapSpec = [
    { start: 45, width: 2, landWidth: 4 }, // pad 47..51
    { start: 51, width: 3, landWidth: 4 }, // pad 54..58
    { start: 58, width: 4, landWidth: 5 }, // pad 62..67
    { start: 67, width: 5, landWidth: 6 }, // pad 72..78
    { start: 78, width: 6, landWidth: 7 }, // pad 84..91
    { start: 91, width: 7, landWidth: 8 }, // pad 98..106
    { start: 106, width: 8, landWidth: 8 }, // pad 114..122
  ];
  const gapMarkers = [];
  for (const g of gapSpec) {
    gapMarkers.push({ xStart: g.start, width: g.width, floorY: 2 });
    const landCol = g.start + g.width;
    map.fillRect(landCol, 0, g.landWidth, 2, S);
  }

  // ── Section C: Vertical Step Course (cols 122..152) ──
  map.fillRect(122, 0, 30, 2, S);
  map.fillRect(125, 2, 3, 1, S); // 1t ledge (Y=3)
  map.fillRect(130, 2, 3, 2, S); // 2t ledge (Y=4)
  map.fillRect(135, 2, 3, 3, S); // 3t ledge (Y=5)
  map.fillRect(140, 2, 4, 4, S); // 4t ledge (Y=6)
  // Corner nudge test overhangs (1t wide ceilings catching edge jumps)
  map.set(132, 8, H);
  map.set(142, 10, H);

  // ── Section D: Wall-Jump Shaft (cols 152..167, 3-tile inner chimney: 156..158) ──
  map.fillRect(152, 0, 50, 2, S); // continuous solid base through D & E (cols 152..202)
  map.fillRect(155, 5, 1, 13, S); // Left chimney wall (3t entry arch below at rows 2..4)
  map.fillRect(159, 2, 8, 14, S); // Right shaft wall + summit deck (top Y=16 at cols 159..166)

  // ── Section E: Slope Hill (45° + 26.57° Butt-Slide Chute -> Goombas, cols 167..202) ──
  for (let i = 0; i < 4; i++) {
    const col = 167 + i;
    const row = 15 - i;
    map.set(col, row, tileTypes.SLOPE_45_DOWN);
    map.fillRect(col, 2, 1, row - 2, S);
  }
  map.fillRect(171, 2, 3, 10, S); // Mid landing shelf (top Y=12)
  for (let i = 0; i < 16; i++) {
    const col = 174 + i;
    const row = 11 - Math.floor(i / 2);
    const sType = i % 2 === 0 ? tileTypes.SLOPE_26_DOWN_1 : tileTypes.SLOPE_26_DOWN_2;
    map.set(col, row, sType);
    if (row > 2) map.fillRect(col, 2, 1, row - 2, S);
  }
  // Gentle 2-tile 45° run-off onto flat Y=2 (cols 190..191)
  map.set(190, 3, tileTypes.SLOPE_45_DOWN);
  map.fillRect(190, 2, 1, 1, S);
  map.set(191, 2, tileTypes.SLOPE_45_DOWN);

  // ── Section F: Semisolid & Moving Platform Chasm (cols 202..226 open pit) ──
  map.fillRect(204, 4, 4, 1, M); // Mushroom canopy (top Y=5)
  map.fillRect(216, 5, 4, 1, tileTypes.SEMISOLID); // Semisolid ledge (top Y=6)

  const platforms = [
    new MovingPlatform({
      id: 'gauntlet_shuttle',
      startX: 209.0,
      startY: 4.8,
      endX: 213.8,
      endY: 4.8,
      width: 3.4,
      height: 0.45,
      periodSec: 3.8,
      mode: 'linear',
      oneWay: true,
    }),
    new MovingPlatform({
      id: 'gauntlet_elevator',
      startX: 221.0,
      startY: 2.5,
      endX: 221.0,
      endY: 7.5,
      width: 3.4,
      height: 0.45,
      periodSec: 4.0,
      mode: 'sine',
      oneWay: true,
    }),
  ];

  // ── Sections G, H, I Solid Base (cols 226..294) ──
  map.fillRect(226, 0, cols - 226, 2, S);

  // Section G: Enemy Playground
  map.set(229, 5, Q); // Fire Flower [?]
  map.set(241, 2, H); // Curb separator before Koopa arena
  map.fillRect(251, 2, 2, 3, P); // Emerald bowling backstop pipe (top Y=5)

  // Section H: Warp Pipe Passage -> 1-Tile Cap-Snatch Crawl Tunnel
  map.fillRect(257, 2, 2, 2, P); // Warp Pipe Entry (cols 257..258, top Y=4)
  map.fillRect(260, 2, 1, 4, H); // Divider post at tunnel mouth
  map.fillRect(261, 3, 11, 3, S); // 1.0t ceiling crawl tunnel (open floor row 2, ceiling rows 3..5)

  // Section I: Goal Pole Staircase & Pedestal
  map.fillRect(276, 2, 1, 1, H);
  map.fillRect(277, 2, 1, 2, H);
  map.fillRect(278, 2, 1, 3, H);
  map.fillRect(279, 2, 2, 4, H);
  map.set(285, 2, H);

  const sections = [
    { id: 'A', key: '1', name: 'Flat Runway', spawnX: 3.0, spawnY: 3.0 },
    { id: 'B', key: '2', name: 'Gap Ladder (2–8t)', spawnX: 43.0, spawnY: 3.0 },
    { id: 'C', key: '3', name: 'Vertical Step & Nudge', spawnX: 122.5, spawnY: 3.0 },
    { id: 'D', key: '4', name: 'Wall-Jump Shaft', spawnX: 152.8, spawnY: 3.0 },
    { id: 'E', key: '5', name: 'Slope & Butt-Slide', spawnX: 165.5, spawnY: 16.5 },
    { id: 'F', key: '6', name: 'Platform Chasm', spawnX: 200.5, spawnY: 3.0 },
    { id: 'G', key: '7', name: 'Enemy Playground', spawnX: 227.0, spawnY: 3.0, grantPowerUp: 'fire' },
    { id: 'H', key: '8', name: 'Warp Pipe & Crawl', spawnX: 255.2, spawnY: 3.0 },
    { id: 'I', key: '9', name: 'Goal Pole Finale', spawnX: 274.0, spawnY: 3.0 },
  ];

  const warpPipes = [
    {
      id: 'pipe_crawl',
      enterX: 258.0,
      enterY: 4.0,
      exitX: 261.25,
      exitY: 2.0,
      exitDir: 1,
      exitVx: 0,
      exitCrouched: true,
    },
  ];

  const powerUpBlocks = [
    { col: 12, row: 5, item: 'mushroom' },
    { col: 14, row: 5, item: 'fire_flower' },
    { col: 229, row: 5, item: 'fire_flower' },
  ];

  const enemies = [
    // Section E butt-slide runout targets (bulldozeable at >= 6.0 t/s!)
    { kind: 'goomba', x: 194.5, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'goomba', x: 196.8, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'goomba', x: 199.0, y: 2.0, dir: -1, turnAtLedges: true },
    // Section G 3-Goomba stomp chain
    { kind: 'goomba', x: 233.0, y: 2.0, dir: 1, turnAtLedges: true },
    { kind: 'goomba', x: 235.8, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'goomba', x: 238.6, y: 2.0, dir: -1, turnAtLedges: true },
    // Section G Koopa Bowling & Spiny
    { kind: 'koopa', x: 244.5, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'goomba', x: 247.2, y: 2.0, dir: 1, turnAtLedges: true },
    { kind: 'goomba', x: 249.0, y: 2.0, dir: -1, turnAtLedges: true },
    { kind: 'spiny', x: 254.0, y: 2.0, dir: -1, turnAtLedges: true },
  ];

  const coins = [
    // Section A sprint line
    { x: 18, y: 3.0 }, { x: 21, y: 3.0 }, { x: 24, y: 3.0 }, { x: 32, y: 3.0 }, { x: 35, y: 3.0 },
    // Section B gap apex arcs
    { x: 46.0, y: 5.0 }, { x: 52.5, y: 5.4 }, { x: 60.0, y: 5.8 },
    { x: 69.5, y: 6.2 }, { x: 81.0, y: 6.4 }, { x: 94.5, y: 6.6 }, { x: 110.0, y: 6.8 },
    // Section C ledges
    { x: 126.5, y: 4.0 }, { x: 131.5, y: 5.0 }, { x: 136.5, y: 6.0 }, { x: 142.0, y: 7.0 },
    // Section D shaft
    { x: 157.5, y: 6.0 }, { x: 157.5, y: 10.0 }, { x: 157.5, y: 14.0 },
    // Section E slope arc
    { x: 176.5, y: 12.1 }, { x: 180.5, y: 10.1 }, { x: 184.5, y: 8.1 }, { x: 188.5, y: 6.1 },
    // Section F chasm
    { x: 205.5, y: 6.0 }, { x: 217.5, y: 7.0 },
    // Section H 1t crawl tunnel breadcrumbs
    { x: 263.5, y: 2.5 }, { x: 265.5, y: 2.5 }, { x: 267.5, y: 2.5 }, { x: 269.5, y: 2.5 },
  ];

  const markers = [10, 20, 30, 40];

  const foregroundProps = [
    { x: 5.0, y: 2.0 },
    { x: 22.0, y: 2.0 },
    { x: 123.5, y: 2.0 },
    { x: 193.0, y: 2.0 },
    { x: 228.0, y: 2.0 },
    { x: 274.5, y: 2.0 },
    { x: 288.0, y: 2.0 },
  ];

  return {
    name: 'Room 8: The Gauntlet',
    isGauntlet: true,
    map,
    spawnX: 3.0,
    spawnY: 3.0,
    floorY: 2,
    initialPowerUp: 'small',
    sections,
    warpPipes,
    crouchTunnel: { xStart: 262, xEnd: 272, ceilingY: 3 },
    gapMarkers,
    wallHeightMarkers: {
      leftWallX: 156,
      rightWallX: 159,
      floorY: 2,
      maxHeight: 16,
    },
    platforms,
    powerUpBlocks,
    enemies,
    coins,
    markers,
    flagpole: { x: 285.5, baseY: 3, topY: 12 },
    foregroundProps,
    slopeCues: [
      { x: 8.0, y: 7.2, text: 'A · RUNWAY & POWER-UPS', color: '#38BDF8' },
      { x: 47.0, y: 7.2, text: 'B · GAP LADDER (2–8t)', color: '#FACC15' },
      { x: 132.0, y: 9.2, text: 'C · STEPS & 0.25t NUDGE', color: '#38BDF8' },
      { x: 157.5, y: 17.8, text: 'D · 3t WALL CHIMNEY', color: '#4ADE80' },
      { x: 181.0, y: 12.6, text: 'E · 26.5° BUTT-SLIDE [↓]', color: '#FACC15' },
      { x: 211.0, y: 8.4, text: 'F · CHASM PLATFORMS', color: '#A5B4FC' },
      { x: 236.0, y: 6.8, text: 'G · COMBAT PLAYGROUND', color: '#FB923C' },
      { x: 266.5, y: 6.8, text: 'H · WARP PIPE -> CRAWL', color: '#4ADE80' },
      { x: 285.5, y: 12.8, text: 'I · GOAL POLE FINALE', color: '#FACC15' },
    ],
    description: 'Stage 10 Master Gauntlet (Sections A–I): Runway, Gap Ladder, Nudge Steps, Wall Chimney, Butt-Slide, Platforms, Combat, Warp Pipe & Goal Pole',
  };
}

/**
 * Get all benchmark rooms, indexed 1-8.
 */
export function getAllRooms() {
  return [
    createRunway(),
    createGapLadder(),
    createJumpShaft(),
    createWallShaft(),
    createSlopeRamps(),
    createLevelKitShowcase(),
    createCombatShowcase(),
    createGauntlet(),
  ];
}

/**
 * Create Room 9: Original Enemy Gallery 1 — The Sproutling & The Hoplite
 * Showcases both original enemy archetypes:
 *   - Zone 1 (cols 1..31): Opening Sproutling patrol, ledge-turning patrol deck, Hoplite demo,
 *     Fire Flower [?] blocks, and cliff-drop Sproutling (turnAtLedges: false)
 *   - Zone 2 (cols 32..61): Miyamoto's 6-Sproutling Hoplite Bowling Alley enclosed by 3t Warp Pipes
 *     (stomp Hoplite -> kick right at 12.00 t/s -> 100->200->400->800->1000->2000->4000->1-UP!)
 *   - Zone 3 (cols 62..95): Dormancy / Wakeup Shake / Carry & Throw Deck + Goal Flagpole
 */
export function createEnemyGallery1() {
  const cols = 96;
  const rows = 22;
  const map = new TileMap(cols, rows);
  const Q = tileTypes.QUESTION_BLOCK;
  const B = tileTypes.BRICK_BLOCK;
  const P = tileTypes.PIPE;

  // Base floor (Y = 2.0) & outer walls
  map.fillRect(0, 0, cols, 2, S);
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // Zone 1: Power-Up [?] Blocks (Super Mushroom & Fire Flower for Launch Death test)
  map.set(6, 5, Q);
  map.set(7, 5, B);
  map.set(8, 5, Q);

  // Raised Patrol Platform (turnAtLedges = true Sproutling)
  map.fillRect(12, 5, 6, 1, S);

  // Cliff-Drop Step (turnAtLedges = false Sproutling walks cleanly off the edge)
  map.fillRect(22, 2, 4, 2, S);

  // Zone 2: Miyamoto 6-Sproutling Hoplite Bowling Alley (enclosed between two 3t pipes)
  map.fillRect(32, 2, 2, 3, P);
  map.fillRect(60, 2, 2, 3, P);
  // Overhead coins guide above bowling alley
  map.fillRect(43, 6, 1, 1, B);
  map.fillRect(44, 6, 1, 1, Q);
  map.fillRect(45, 6, 1, 1, B);

  // Zone 3: Carry & Throw Elevated Deck + Target Pit
  map.fillRect(69, 5, 5, 1, B);
  map.fillRect(74, 2, 2, 2, S);
  map.fillRect(85, 2, 2, 2, P);

  const powerUpBlocks = [
    { col: 6, row: 5, item: 'super_mushroom' },
    { col: 8, row: 5, item: 'fire_flower' },
    { col: 44, row: 6, item: 'fire_flower' },
  ];

  const enemies = [
    // Opening viewport showcase (immediately visible on first paint!)
    { kind: 'sproutling', x: 10.5, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 14.5, y: 6, dir: 1, turnAtLedges: true },
    { kind: 'hoplite', x: 18.2, y: 2, dir: -1, turnAtLedges: false },

    // Cliff-drop demonstration Sproutling
    { kind: 'sproutling', x: 23.8, y: 4, dir: 1, turnAtLedges: false },

    // Miyamoto's 6-Sproutling Hoplite Bowling Alley (100 -> 200 -> 400 -> 800 -> 1000 -> 2000 -> 4000 -> 1-UP)
    { kind: 'hoplite', x: 36.2, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 42.0, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 44.5, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 47.0, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 49.5, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 52.0, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 54.5, y: 2, dir: -1, turnAtLedges: false },

    // Carry & Throw + Dormancy Zone
    { kind: 'hoplite', x: 66.0, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 78.0, y: 2, dir: -1, turnAtLedges: false },
    { kind: 'sproutling', x: 81.5, y: 2, dir: -1, turnAtLedges: false },
  ];

  const coins = [
    { x: 13.5, y: 7.5 },
    { x: 15.0, y: 7.5 },
    { x: 16.5, y: 7.5 },
    { x: 42.5, y: 4.5 },
    { x: 45.0, y: 4.5 },
    { x: 47.5, y: 4.5 },
    { x: 50.0, y: 4.5 },
    { x: 52.5, y: 4.5 },
    { x: 55.0, y: 4.5 },
    { x: 70.5, y: 7.0 },
    { x: 71.5, y: 7.0 },
    { x: 72.5, y: 7.0 },
  ];

  return {
    name: 'Room 9: Enemy Gallery 1',
    map,
    spawnX: 3,
    spawnY: 2.5,
    floorY: 2,
    initialPowerUp: 'super',
    powerUpBlocks,
    enemies,
    coins,
    flagpole: { x: 90.5, baseY: 2, topY: 11 },
    slopeCues: [
      { x: 14.5, y: 8.6, text: 'SPROUTLING · LEDGE PATROL (1.25 t/s)', color: '#86EFAC' },
      { x: 24.0, y: 6.2, text: 'CLIFF DROP (turnAtLedges=false)', color: '#BEF264' },
      { x: 47.0, y: 8.2, text: 'HOPLITE 6-SPROUTLING 1-UP ALLEY (12.0 t/s)', color: '#FDE047' },
      { x: 71.5, y: 8.4, text: 'HOLD RUN [X/K] TO CARRY & THROW SHELL', color: '#38BDF8' },
    ],
    description: 'Original Enemy Gallery 1: The Sproutling Walker (40×44px) & The Hoplite Roller (44×44px / 40×36px shell) with 6-enemy 1-UP bowling alley',
  };
}

/**
 * Create Room 10: Interactive Props Lab
 * Showcases all dynamic environmental props in one continuous course + Subterranean Sub-Level:
 *   - Zone 1 (cols 1..22, Opening Viewport):
 *       * Compression Launch Spring #1 (64×32px) under 6t Super Spring high ledge
 *       * Linear Horizontal Moving Platform (vx = 3.0 t/s) over chasm
 *       * 128×128px Warp Access Tube (DOWN entry) -> Subterranean Sub-Level
 *   - Zone 2 (cols 23..43):
 *       * Linear Vertical Rising Platform (vy = 4.0 t/s) for Jump Launch Boost
 *       * Circular Orbit Dual-Platform Wheel over open chasm
 *   - Zone 3 (cols 44..64):
 *       * Three Fall-Away Platforms (drop 1.0s after weight, then respawn)
 *       * Compression Launch Spring #2 -> Overhead UP-entry Warp Access Tube
 *   - Zone 4 (cols 65..84):
 *       * Lateral RIGHT-entry Warp Access Tube + Goal Flagpole
 *   - Zone 5 (cols 88..125, Subterranean Sub-Level):
 *       * Enclosed underground cavern with coin vault, spring, and return Warp Tube
 */
export function createPropsPlayground() {
  const cols = 128;
  const rows = 22;
  const map = new TileMap(cols, rows);
  const Q = tileTypes.QUESTION_BLOCK;
  const B = tileTypes.BRICK_BLOCK;

  // Outer perimeter walls
  map.fillRect(0, 0, 1, rows, S);
  map.fillRect(cols - 1, 0, 1, rows, S);

  // Surface Zone 1 floor (cols 1..11) + chasm (cols 12..18) + landing island (cols 19..24)
  map.fillRect(1, 0, 11, 2, S);
  map.fillRect(19, 0, 6, 2, S);

  // High Super Spring target ledge above Spring #1 (semisolid top at y = 8.0 -> 5.50t above spring top 2.50t)
  // Normal Bounce (+16.00 t/s) peaks at y=5.49; Timed Super Spring (+22.50 t/s) blasts through to y=8.41 and lands cleanly!
  map.fillRect(5, 7, 5, 1, tileTypes.SEMISOLID);
  map.set(7, 11, Q);

  // Zone 2: Vertical boost chasm (cols 25..29), high boost deck (cols 29..32 at y=10), orbit chasm (cols 30..41), island (cols 42..44)
  map.fillRect(29, 10, 3, 1, B);
  map.fillRect(42, 0, 3, 2, S);

  // Zone 3: Fall-Away bridge chasm (cols 45..56) + spring & overhead UP pipe pad (cols 57..64)
  map.fillRect(57, 0, 8, 2, S);

  // Zone 4: Lateral RIGHT Warp Tube & Goal Flagpole deck (cols 65..85)
  map.fillRect(65, 0, 21, 2, S);
  map.fillRect(72, 2, 3, 4, S); // Backing wall behind lateral pipe stem

  // Thick stone partition separating Surface [0..85] from Subterranean Sub-Level [89..126]
  map.fillRect(86, 0, 3, rows, S);

  // Zone 5: Enclosed Subterranean Sub-Level (cols 89..126)
  map.fillRect(89, 0, 38, 2, S);   // Subterranean floor (y = 2)
  map.fillRect(89, 13, 38, 9, S);  // Subterranean thick stone ceiling (y = 13..21)
  map.fillRect(99, 6, 7, 1, B);    // Mid-air brick shelf reachable by underground spring
  map.set(102, 6, Q);
  map.fillRect(120, 2, 7, 4, S);   // Backing wall behind return lateral pipe

  const propPlatforms = [
    // Linear Horizontal Platform: exact vx = 3.0 tiles/s
    {
      id: 'plat_linear_h',
      mode: 'linear',
      startX: 11.5,
      startY: 3.0,
      endX: 16.5,
      endY: 3.0,
      speed: 3.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
      label: 'vx=3.0',
    },
    // Linear Vertical Rising Platform: exact vy = 4.0 tiles/s
    {
      id: 'plat_linear_v',
      mode: 'linear',
      startX: 25.2,
      startY: 2.2,
      endX: 25.2,
      endY: 8.2,
      speed: 4.0,
      width: 3.0,
      height: 0.5,
      oneWay: false,
      label: 'vy=4.0',
    },
    // Circular Orbit Dual-Platform Wheel
    {
      id: 'plat_orbit_a',
      mode: 'circular',
      centerX: 35.8,
      centerY: 5.8,
      radius: 2.8,
      periodSec: 5.5,
      startAngle: 0,
      width: 2.8,
      height: 0.5,
      oneWay: false,
    },
    {
      id: 'plat_orbit_b',
      mode: 'circular',
      centerX: 35.8,
      centerY: 5.8,
      radius: 2.8,
      periodSec: 5.5,
      startAngle: Math.PI,
      width: 2.8,
      height: 0.5,
      oneWay: false,
    },
    // Fall-Away Bridge (drops exactly 1.0s / 60 frames after weight detected)
    {
      id: 'plat_fall_1',
      mode: 'fall_away',
      startX: 45.8,
      startY: 3.2,
      width: 2.8,
      height: 0.5,
      oneWay: false,
    },
    {
      id: 'plat_fall_2',
      mode: 'fall_away',
      startX: 49.6,
      startY: 3.8,
      width: 2.8,
      height: 0.5,
      oneWay: false,
    },
    {
      id: 'plat_fall_3',
      mode: 'fall_away',
      startX: 53.4,
      startY: 3.2,
      width: 2.8,
      height: 0.5,
      oneWay: false,
    },
  ];

  const springs = [
    // Opening viewport Compression Launch Spring (64×32px) under 6t Super Spring ledge
    { id: 'spring_opening', x: 7.0, y: 2.0, label: 'SUPER' },
    // Zone 3 Spring aligned below Overhead UP-entry Warp Access Tube
    { id: 'spring_up_pipe', x: 60.0, y: 2.0, label: 'UP' },
    // Subterranean Sub-Level Spring
    { id: 'spring_sub', x: 108.0, y: 2.0, label: 'SUB' },
  ];

  const warpTubes = [
    // 1. DOWN entry Warp Access Tube (128×128px) visible cleanly inside the opening viewport
    {
      id: 'tube_down_entry',
      x: 19.6,
      y: 2.0,
      entryVector: 'DOWN',
      stemLength: 0,
      destX: 93.0,
      destY: 2.0,
      destSubArea: true,
      exitFacingRight: true,
      label: 'SUB-1',
      color: '#10B981',
      accentColor: '#6EE7B7',
    },
    // 2. UP entry Overhead Warp Access Tube (128×128px) reachable via Spring #2
    {
      id: 'tube_up_entry',
      x: 59.5,
      y: 9.2,
      entryVector: 'UP',
      stemLength: 4.0,
      destX: 102.0,
      destY: 7.0,
      destSubArea: true,
      exitFacingRight: true,
      label: 'UP',
      color: '#06B6D4',
      accentColor: '#67E8F9',
    },
    // 3. RIGHT Lateral entry Warp Access Tube (128×128px)
    {
      id: 'tube_right_entry',
      x: 69.5,
      y: 2.0,
      entryVector: 'RIGHT',
      stemLength: 0.5,
      destX: 96.0,
      destY: 2.0,
      destSubArea: true,
      exitFacingRight: true,
      label: 'SIDE',
      color: '#10B981',
      accentColor: '#6EE7B7',
    },
    // 4. Subterranean Return Warp Access Tube (RIGHT lateral entry back to surface)
    {
      id: 'tube_sub_return',
      x: 117.5,
      y: 2.0,
      entryVector: 'RIGHT',
      stemLength: 0.5,
      destX: 19.9,
      destY: 4.2,
      destSubArea: false,
      exitFacingRight: true,
      label: 'EXIT',
      color: '#F59E0B',
      accentColor: '#FDE68A',
    },
  ];

  const coins = [
    // Super Spring reward arc above Opening Spring
    { x: 6.2, y: 8.8 },
    { x: 7.5, y: 8.8 },
    { x: 8.8, y: 8.8 },
    // Above Linear Horizontal Platform
    { x: 14.0, y: 5.0 },
    { x: 15.5, y: 5.0 },
    // Above Vertical Boost Deck
    { x: 30.0, y: 11.6 },
    { x: 31.0, y: 11.6 },
    // Around Circular Orbit Wheel
    { x: 35.8, y: 9.6 },
    // Above Fall-Away Bridge
    { x: 47.2, y: 5.2 },
    { x: 51.0, y: 5.8 },
    { x: 54.8, y: 5.2 },
    // Subterranean Sub-Level Coin Vault
    { x: 96.0, y: 4.0 },
    { x: 97.5, y: 4.0 },
    { x: 100.5, y: 8.0 },
    { x: 102.0, y: 8.5 },
    { x: 103.5, y: 8.0 },
    { x: 108.5, y: 6.5 },
    { x: 108.5, y: 8.5 },
    { x: 112.5, y: 4.0 },
    { x: 114.0, y: 4.0 },
  ];

  return {
    name: 'Room 10: Interactive Props Lab',
    map,
    spawnX: 3.0,
    spawnY: 2.5,
    floorY: 2,
    chasmRescue: true,
    initialPowerUp: 'small',
    propPlatforms,
    springs,
    warpTubes,
    subAreaBounds: { x: 89, y: 2, width: 37, height: 11 },
    cameraLocks: [
      { id: 'subarea_partition', axis: 'vertical', x: 88.0, side: 'auto', active: true },
    ],
    coins,
    flagpole: { x: 81.5, baseY: 2, topY: 11 },
    slopeCues: [
      { x: 7.5, y: 10.35, text: 'SPRING · TAP [Z] ON REBOUND FOR SUPER (+22.5 t/s)', color: '#FDE047' },
      { x: 15.0, y: 6.2, text: 'LINEAR CARRY (vx = 3.0 t/s)', color: '#38BDF8' },
      { x: 26.8, y: 9.8, text: 'RISING LAUNCH BOOST (+4.0 t/s)', color: '#4ADE80' },
      { x: 35.8, y: 10.6, text: 'CIRCULAR ORBIT WHEEL', color: '#38BDF8' },
      { x: 51.0, y: 6.8, text: 'FALL-AWAY BRIDGE (1.0s DROP)', color: '#F59E0B' },
      { x: 60.5, y: 7.8, text: 'SUPER SPRING -> UP WARP [↑]', color: '#67E8F9' },
      { x: 69.5, y: 5.4, text: 'LATERAL WARP TUBE [→]', color: '#6EE7B7' },
      { x: 98.5, y: 10.5, text: 'SUBTERRANEAN SUB-LEVEL · COIN VAULT & EXIT PIPE [→]', color: '#38BDF8' },
    ],
    description: 'Interactive Environmental Props: Moving Platforms (Linear, Vertical Boost, Circular Orbit, Fall-Away 1.0s), 64×32px Compression Springs (Normal +16.0 & Super +22.5 t/s), and 128×128px Warp Access Tubes (DOWN/UP/RIGHT) to Subterranean Sub-Level',
  };
}

export default getAllRooms;

