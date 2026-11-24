/**
 * menuModel.js — Pure Metadata & Layout Helpers for DevCommandMenu
 * ==================================================================
 * Decouples room definitions, Gauntlet section data, tab registry, and
 * responsive status/offset calculations from React rendering.
 */

export const ROOM_ENTRIES = [
  { index: 0, number: 1, short: 'Runway', name: 'Room 1: Runway', hint: '60t flat sprint & crouch tunnel' },
  { index: 1, number: 2, short: 'Gap Ladder', name: 'Room 2: Gap Ladder', hint: '1–8t pits & coyote jump calibration' },
  { index: 2, number: 3, short: 'Jump Shaft', name: 'Room 3: Jump Shaft', hint: 'Vertical ledges, nudge & step-up' },
  { index: 3, number: 4, short: 'Wall Shaft', name: 'Room 4: Wall Shaft', hint: '3t chimney wall slide & wall jump' },
  { index: 4, number: 5, short: 'Slopes & Plats', name: 'Room 5: Slopes & Platforms', hint: '45°/26.5° slopes, butt-slide & semisolids' },
  { index: 5, number: 6, short: 'Grassland', name: 'Room 6: Grassland Kit', hint: '[?] blocks, bricks, coins & flagpole' },
  { index: 6, number: 7, short: 'Combat Arena', name: 'Room 7: Combat & Power-Ups', hint: 'Power-Ups, Stomp Chains & Shell Bowling' },
  { index: 7, number: 8, short: 'The Gauntlet', name: 'Room 8: The Gauntlet', hint: '9-section integration course (A–I)' },
  { index: 8, number: 9, short: 'Enemy Gallery', name: 'Room 9: Enemy Gallery 1', hint: 'Sproutling, Hoplite & 1-UP bowling alley' },
  { index: 9, number: 10, short: 'Props Lab', name: 'Room 10: Interactive Props Lab', hint: 'Moving platforms, springs & warp tubes' },
  { index: 10, number: 11, short: 'Water Spout', name: 'Room 11: Water Spout Beach', hint: 'Stage 17 Kishōtenketsu 4-Act & Dual-Skill course' },
  { index: 11, number: 12, courseCode: '1-1', isWorld1: true, short: '1-1 Flats', name: '1-1: Verdant Outskirts', hint: 'Plains plateaus, stomp, 6-enemy shell 1-UP & flagpole pyramid' },
  { index: 12, number: 13, courseCode: '1-2', isWorld1: true, short: '1-2 Cavern', name: '1-2: Deep Slate Cavern', hint: 'Slate springs, 3t spike pits, wall-jump chimney & fall-away pipe' },
  { index: 13, number: 14, courseCode: '1-3', isWorld1: true, short: '1-3 Geysers', name: '1-3: Hydro-Pulse Ridge', hint: '3.0s pulsing geysers, 14.0 t/s hydro-jets & pinnacle medallion' },
  { index: 14, number: 15, courseCode: '1-4', isWorld1: true, isBoss: true, short: '1-4 Boss', name: '1-4: Dread-Shell Sanctum', hint: '20t stone chamber · 3-phase Dread-Shell Golem & Exit Portal' },
];

export const KISHOTENKETSU_ACT_ENTRIES = [
  { id: 'KI', number: 1, kanji: '起', label: 'Ki · Intro' },
  { id: 'SHO', number: 2, kanji: '承', label: 'Shō · Dev' },
  { id: 'TEN', number: 3, kanji: '転', label: 'Ten · Twist' },
  { id: 'KETSU', number: 4, kanji: '結', label: 'Ketsu · Goal' },
];

export const GAUNTLET_SECTIONS = [
  { id: 'A', keyNum: 1, label: 'Run' },
  { id: 'B', keyNum: 2, label: 'Gap' },
  { id: 'C', keyNum: 3, label: 'Step' },
  { id: 'D', keyNum: 4, label: 'Wall' },
  { id: 'E', keyNum: 5, label: 'Slope' },
  { id: 'F', keyNum: 6, label: 'Plat' },
  { id: 'G', keyNum: 7, label: 'Cmb' },
  { id: 'H', keyNum: 8, label: 'Pipe' },
  { id: 'I', keyNum: 9, label: 'Goal' },
];

export const DEV_MENU_TABS = [
  { id: 'rooms', label: 'Rooms' },
  { id: 'sim', label: 'Feel & Sim' },
  { id: 'tools', label: 'Tools' },
];

/**
 * Resolve concise unboxed status text shown in the drawer header.
 */
export function buildMenuStatusSummary({
  roomName = '',
  characterId = 'mario',
  feelPresetId = 'wonder',
  isPaused = false,
  timeScale = 1.0,
}) {
  const isCleanRelease = typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__;
  const charLabel =
    characterId === 'luigi'
      ? isCleanRelease ? 'Lumen' : 'Luigi'
      : isCleanRelease ? 'Vesper' : 'Mario';
  const presetMap = {
    wonder: 'Wonder',
    nsmbu: isCleanRelease ? 'Classic' : 'NSMBU',
    arcade: 'Arcade',
  };
  const presetLabel = presetMap[feelPresetId] || 'Wonder';
  const parts = [charLabel, presetLabel];
  if (timeScale !== 1.0) {
    parts.push(`${timeScale}×`);
  }
  if (isPaused) {
    parts.push('Paused');
  }
  return {
    title: roomName || 'Benchmark Sandbox',
    meta: parts.join(' · '),
  };
}

/**
 * Keep ActionBannerHUD tucked cleanly at the top center when the bar is collapsed.
 */
export function getActionBannerTopOffset({ menuOpen = false, isCompactViewport = false } = {}) {
  if (!menuOpen) return 12;
  return isCompactViewport ? 12 : 12;
}
