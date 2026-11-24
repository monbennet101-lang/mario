/**
 * UI v2 Pure State Store & Progression Model (`src/ui/v2/store/uiStore.js`)
 * =========================================================================
 * Pure, deterministic state logic for:
 *   - 3 Save Files (auto-save on course clear, fresh reset, character roster)
 *   - World 1 Map Nodes (locked, new, cleared, perfect + path-unlock states)
 *   - Prism Outpost Shop & Stride Charm Loadout (transparent prices & effects,
 *     assist charms never labelled "easy mode")
 *   - 1-to-4 Player Local Roster & Multiplayer Crown Ranking
 *   - Accessibility Settings (textScale: 1.0 | 1.15 | 1.3, highContrast,
 *     timerEnabled, idleFadeEnabled, safeAreaOverlay)
 */

import { TOKENS } from '../tokens.js';

export const STORAGE_KEY = 'prism_stride_ui_v2_state_v1';

export const WORLD1_NODES = [
  {
    id: '1-1',
    stageIndex: 0,
    code: '1-1',
    name: 'Verdant Outskirts',
    worldName: 'World 1 · Sunlit Valley',
    subtitle: 'Plains, parabolic shard arcs & shell chains',
    kind: 'course',
    xPct: 14,
    yPct: 62,
    unlockRequires: null,
  },
  {
    id: '1-2',
    stageIndex: 1,
    code: '1-2',
    name: 'Deep Slate Cavern',
    worldName: 'World 1 · Sunlit Valley',
    subtitle: 'Compression springs & wall-jump chimney',
    kind: 'course',
    xPct: 37,
    yPct: 36,
    unlockRequires: '1-1',
  },
  {
    id: 'shop-1',
    stageIndex: -1,
    code: 'OUTPOST',
    name: 'Prism Outpost',
    worldName: 'World 1 · Sunlit Valley',
    subtitle: 'Trade Prism Petals for Stride Charms & Reserve items',
    kind: 'shop',
    xPct: 54,
    yPct: 68,
    unlockRequires: null,
  },
  {
    id: '1-3',
    stageIndex: 2,
    code: '1-3',
    name: 'Hydro-Pulse Ridge',
    worldName: 'World 1 · Sunlit Valley',
    subtitle: 'Pulsing water geysers & aerial jets',
    kind: 'course',
    xPct: 68,
    yPct: 34,
    unlockRequires: '1-2',
  },
  {
    id: '1-4',
    stageIndex: 3,
    code: '1-4',
    name: 'Dread-Shell Sanctum',
    worldName: 'World 1 · Sunlit Valley',
    subtitle: 'Three-phase Dread-Shell Golem fortress',
    kind: 'boss',
    xPct: 87,
    yPct: 54,
    unlockRequires: '1-3',
  },
];

export const SHOP_CATALOG = [
  {
    id: 'charm_feather_glide',
    kind: 'charm',
    name: 'Feather Glide',
    price: 0,
    currency: 'petal',
    icon: 'feather',
    category: 'Movement Charm',
    summary: 'Hold Jump at apex to extend airtime with a gentle float.',
    effect: 'Extends peak hang-time for confident gap landings.',
    defaultOwned: true,
  },
  {
    id: 'charm_magnet_pulse',
    kind: 'charm',
    name: 'Shard Magnet',
    price: 10,
    currency: 'petal',
    icon: 'magnet',
    category: 'Utility Charm',
    summary: 'Draws nearby Gold Shards smoothly toward your runner.',
    effect: '+45% Gold Shard pickup pull radius.',
    defaultOwned: false,
  },
  {
    id: 'charm_safety_cushion',
    kind: 'charm',
    name: 'Safety Cushion',
    price: 15,
    currency: 'petal',
    icon: 'cushion',
    category: 'Support Charm',
    summary: 'Breathes one extra upward recovery hop if you slip into a pit.',
    effect: 'Automatic single pit-bounce rescue per course.',
    defaultOwned: false,
  },
  {
    id: 'charm_dash_surge',
    kind: 'charm',
    name: 'Sprint Crest',
    price: 20,
    currency: 'petal',
    icon: 'surge',
    category: 'Action Charm',
    summary: 'Reaches top sprint stride sooner on straight runs.',
    effect: 'Faster initial sprint acceleration ramp.',
    defaultOwned: false,
  },
  {
    id: 'item_super_core',
    kind: 'reserve',
    reserveKey: 'super_core',
    name: 'Super Core',
    price: 8,
    currency: 'petal',
    icon: 'super_core',
    category: 'Reserve Item',
    summary: 'Stored in your Reserve Box. Press R or click to restore Super Form.',
    effect: 'Restores Super Form & 3 base vitality wedges on demand.',
    defaultOwned: false,
  },
  {
    id: 'item_flame_orb',
    kind: 'reserve',
    reserveKey: 'flame_orb',
    name: 'Flame Orb',
    price: 14,
    currency: 'petal',
    icon: 'flame_orb',
    category: 'Reserve Item',
    summary: 'Stored in your Reserve Box. Activates Fireball Form anytime.',
    effect: 'Grants Flame Form + full vitality on activation.',
    defaultOwned: false,
  },
  {
    id: 'item_life_up',
    kind: 'reserve',
    reserveKey: 'life_up',
    name: 'Vitality Bloom',
    price: 18,
    currency: 'petal',
    icon: 'life_up',
    category: 'Reserve Item',
    summary: 'Stored in your Reserve Box. Expands your LifeMeter by +3 green wedges.',
    effect: 'Expands vitality from 3 to 6 wedges until depleted.',
    defaultOwned: false,
  },
];

export function createEmptySaveFile(slotNumber) {
  return {
    slot: slotNumber,
    label: `Journal ${slotNumber}`,
    isEmpty: true,
    characterId: 'mario',
    playerCount: 1,
    lives: 5,
    petals: 15,
    shards: 0,
    score: 0,
    crownHolderIndex: 0,
    equippedCharmId: 'charm_feather_glide',
    ownedCharmIds: ['charm_feather_glide'],
    reserveItem: 'super_core',
    courses: {
      '1-1': { cleared: false, topFlag: false, medallions: [false, false, false] },
      '1-2': { cleared: false, topFlag: false, medallions: [false, false, false] },
      '1-3': { cleared: false, topFlag: false, medallions: [false, false, false] },
      '1-4': { cleared: false, topFlag: false, medallions: [false, false, false] },
    },
    lastUnlockedNodeId: '1-1',
    updatedAt: null,
  };
}

export function createInitialUIState() {
  const file1 = createEmptySaveFile(1);
  file1.isEmpty = false;
  file1.updatedAt = 'Ready';
  return {
    activeFileIndex: 0,
    files: [file1, createEmptySaveFile(2), createEmptySaveFile(3)],
    settings: {
      textScale: 1.0,
      highContrast: false,
      timerEnabled: true,
      idleFadeEnabled: false,
      safeAreaOverlay: false,
    },
  };
}

export function resolveMapNodeState(node, file) {
  if (!node) return 'locked';
  if (node.kind === 'shop') return 'cleared';
  const courses = file?.courses || {};
  const record = courses[node.id] || { cleared: false, topFlag: false, medallions: [false, false, false] };
  if (node.unlockRequires) {
    const prev = courses[node.unlockRequires];
    if (!prev?.cleared) return 'locked';
  }
  if (!record.cleared) return 'new';
  const allMedallions = Array.isArray(record.medallions) && record.medallions.length === 3 && record.medallions.every(Boolean);
  if (allMedallions && record.topFlag) return 'perfect';
  return 'cleared';
}

export function countFileMedallions(file) {
  if (!file?.courses) return { collected: 0, total: 12 };
  let collected = 0;
  let total = 0;
  for (const c of Object.values(file.courses)) {
    const arr = c.medallions || [false, false, false];
    total += arr.length;
    for (const v of arr) {
      if (v) collected++;
    }
  }
  return { collected, total };
}

export function purchaseShopEntry(file, entryId) {
  const entry = SHOP_CATALOG.find((item) => item.id === entryId);
  if (!entry || !file) return { ok: false, reason: 'not_found', file };

  if (entry.kind === 'charm' && file.ownedCharmIds.includes(entry.id)) {
    return {
      ok: true,
      action: 'equipped',
      file: { ...file, equippedCharmId: entry.id },
    };
  }

  if (file.petals < entry.price) {
    return { ok: false, reason: 'insufficient_petals', file };
  }

  const nextPetals = Math.max(0, file.petals - entry.price);
  if (entry.kind === 'charm') {
    return {
      ok: true,
      action: 'purchased_charm',
      file: {
        ...file,
        petals: nextPetals,
        ownedCharmIds: [...file.ownedCharmIds, entry.id],
        equippedCharmId: entry.id,
      },
    };
  }

  return {
    ok: true,
    action: 'purchased_reserve',
    file: {
      ...file,
      petals: nextPetals,
      reserveItem: entry.reserveKey,
    },
  };
}

export function applyCourseClearToFile(file, payload) {
  const code = payload?.courseCode || '1-1';
  const prevCourse = file.courses?.[code] || { cleared: false, topFlag: false, medallions: [false, false, false] };
  const incomingMedallions = Array.isArray(payload?.medallions) ? payload.medallions : [false, false, false];
  const mergedMedallions = [0, 1, 2].map((i) => Boolean(prevCourse.medallions?.[i] || incomingMedallions[i]));
  const topFlag = Boolean(prevCourse.topFlag || (payload?.flagpoleHeightRatio ?? 0) >= 0.85 || code === '1-4');

  const nextCourseIdx = WORLD1_NODES.findIndex((n) => n.unlockRequires === code);
  const nextUnlocked = nextCourseIdx >= 0 ? WORLD1_NODES[nextCourseIdx].id : file.lastUnlockedNodeId;

  return {
    ...file,
    isEmpty: false,
    score: Math.max(file.score || 0, Math.floor(payload?.score ?? 0)),
    petals: Math.min(TOKENS.rules.maxSpecialCurrency, Math.max(file.petals || 0, Math.floor(payload?.petals ?? file.petals ?? 0))),
    shards: Math.floor(payload?.shards ?? file.shards ?? 0),
    courses: {
      ...file.courses,
      [code]: {
        cleared: true,
        topFlag,
        medallions: mergedMedallions,
      },
    },
    lastUnlockedNodeId: !prevCourse.cleared ? nextUnlocked : file.lastUnlockedNodeId,
    updatedAt: 'Saved',
  };
}

export function buildMultiplayerRankings(playerCount = 1, baseScore = 0, shards = 0, crownHolderIndex = 0) {
  const count = Math.max(1, Math.min(4, Math.floor(playerCount)));
  const entries = [];
  for (let i = 0; i < count; i++) {
    const p = TOKENS.players[i];
    const crownBonus = count > 1 && i === crownHolderIndex ? 1000 : 0;
    const score = i === 0
      ? Math.max(0, Math.floor(baseScore)) + crownBonus
      : Math.max(200, Math.floor(baseScore * (0.86 - i * 0.11))) + crownBonus;
    entries.push({
      index: i,
      player: p,
      score,
      shards: i === 0 ? shards : Math.max(0, Math.floor(shards * (0.75 - i * 0.12))),
      hadCrown: count > 1 && i === crownHolderIndex,
      crownBonus,
    });
  }
  entries.sort((a, b) => b.score - a.score);
  return entries.map((entry, rankIdx) => ({
    ...entry,
    rank: rankIdx + 1,
    winsCrown: count > 1 && rankIdx === 0,
  }));
}

export function computeSoftGameOverPenalty(petals = 0) {
  const safe = Math.max(0, Math.floor(petals));
  const penalty = Math.min(TOKENS.rules.gameOverPetalPenaltyCap, Math.floor(safe * 0.25));
  return {
    penalty,
    remainingPetals: Math.max(0, safe - penalty),
    restoredLives: TOKENS.rules.gameOverRetryLives,
  };
}

export function loadPersistedUIState() {
  const fallback = createInitialUIState();
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.files) || parsed.files.length !== 3) return fallback;
    return {
      activeFileIndex: Math.max(0, Math.min(2, Number(parsed.activeFileIndex) || 0)),
      files: parsed.files.map((f, idx) => ({ ...createEmptySaveFile(idx + 1), ...f })),
      settings: { ...fallback.settings, ...(parsed.settings || {}) },
    };
  } catch {
    return fallback;
  }
}

export function savePersistedUIState(state) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors
  }
}
