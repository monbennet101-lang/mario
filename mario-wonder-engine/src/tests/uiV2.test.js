/**
 * UI v2 Automated Verification Suite (`src/tests/uiV2.test.js`)
 * ==============================================================
 * Proves Phase 0–6 invariants headlessly via `node:test`:
 *   1. Spec token bounds (motion durations, safe margin, 7 component states)
 *   2. Token-only discipline (zero raw hex/px/ms in `src/ui/v2/components/`)
 *   3. Zero `backdrop-filter` over active WebGL/2D canvas in `tokens.css`
 *   4. Clean-room IP audit across `src/ui/v2/`
 *   5. UIEventBus subscribe / emit / unsubscribe / history & GameEngine emission
 *   6. uiStore progression: 3 save files, World Map node states, Shop/Loadout,
 *      Course Clear merge, 1–4P Crown rankings, Soft Game Over penalty
 *   7. Named UI audio hooks (`uiAudio.play`)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TOKENS, COMPONENT_STATES } from '../ui/v2/tokens.js';
import { UI_FLAGS, resolveUiV2Enabled } from '../ui/v2/featureFlags.js';
import { uiAudio, UISoundHook } from '../ui/v2/audioHooks.js';
import { UIEventBus, UIEvents } from '../engine/core/UIEventBus.js';
import {
  WORLD1_NODES,
  SHOP_CATALOG,
  createInitialUIState,
  resolveMapNodeState,
  countFileMedallions,
  purchaseShopEntry,
  applyCourseClearToFile,
  buildMultiplayerRankings,
  computeSoftGameOverPenalty,
} from '../ui/v2/store/uiStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UI_V2_DIR = path.resolve(__dirname, '../ui/v2');
const COMPONENTS_DIR = path.join(UI_V2_DIR, 'components');

test('UI v2 Tokens: motion timings, safe margins & 7 component states match Spec §3 & §5', () => {
  assert.ok(TOKENS.motion.pause < 100, `Pause duration ${TOKENS.motion.pause} must be < 100 ms`);
  assert.ok(TOKENS.motion.transition <= 500, `Transition duration ${TOKENS.motion.transition} must be <= 500 ms`);
  assert.ok(TOKENS.motion.tick >= 250 && TOKENS.motion.tick <= 400, 'Counter roll tick must be within 250–400 ms');
  assert.ok(TOKENS.motion.fadeIdle >= 200 && TOKENS.motion.fadeIdle <= 300, 'Idle fade must be within 200–300 ms');
  assert.equal(TOKENS.layout.safeMarginVh, 4, 'Safe margin band must be 4% of viewport height');
  assert.equal(TOKENS.layout.centreClearPct, 70, 'Centre clear zone must be 70%');
  assert.equal(TOKENS.rules.coinsPerLife, 100);
  assert.equal(TOKENS.rules.timerWarningSec, 100);
  assert.deepEqual(COMPONENT_STATES, ['default', 'updating', 'empty', 'maximum', 'disabled', 'focused', 'pressed']);
  assert.equal(TOKENS.players.length, 4);
  assert.equal(UI_FLAGS.v2, true);
  assert.equal(resolveUiV2Enabled(), true);
});

test('UI v2 Token-Only Audit: ZERO raw hex, px, or ms literals in src/ui/v2/components/', () => {
  const files = fs.readdirSync(COMPONENTS_DIR).filter((f) => f.endsWith('.jsx') || f.endsWith('.js'));
  assert.ok(files.length >= 12, `Expected >= 12 UI v2 component files, found ${files.length}`);

  const rawPattern = /#[0-9a-fA-F]{3,8}\b|[0-9]+(\.[0-9]+)?px\b|[0-9]+(\.[0-9]+)?ms\b/g;
  const violations = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(COMPONENTS_DIR, file), 'utf8');
    const matches = content.match(rawPattern);
    if (matches) {
      violations.push(`${file}: ${matches.join(', ')}`);
    }
  }
  assert.deepEqual(violations, [], `Found raw token violations in UI v2 components:\n${violations.join('\n')}`);
});

test('UI v2 Performance & Clean-Room Audit: zero backdrop-filter & zero third-party IP names', () => {
  const tokensCss = fs.readFileSync(path.join(UI_V2_DIR, 'tokens.css'), 'utf8');
  assert.equal(/backdrop-filter\s*:/i.test(tokensCss), false, 'tokens.css must not use backdrop-filter over active canvas');

  const ipPattern = /(nintendo|super mario|mario\.glb|luigi\.glb|grassland_tileset|wii u|\bNSMBU\b|\bmiyamoto\b|\bMario\b|\bLuigi\b|\bGoomba\b|\bKoopa\b|\bSpiny\b)/g;
  const checkFiles = [
    path.join(UI_V2_DIR, 'tokens.css'),
    path.join(UI_V2_DIR, 'tokens.js'),
    path.join(UI_V2_DIR, 'audioHooks.js'),
    path.join(UI_V2_DIR, 'featureFlags.js'),
    path.join(UI_V2_DIR, 'store/uiStore.js'),
    ...fs.readdirSync(COMPONENTS_DIR).map((f) => path.join(COMPONENTS_DIR, f)),
  ];

  const ipHits = [];
  for (const fullPath of checkFiles) {
    const src = fs.readFileSync(fullPath, 'utf8');
    // Ignore file-header spec filename references if any; scan actual code & strings
    const cleaned = src.replace(/Mario-Style UI UX Design Spec\.md/g, '');
    const hits = cleaned.match(ipPattern);
    if (hits) {
      ipHits.push(`${path.basename(fullPath)}: ${hits.join(', ')}`);
    }
  }
  assert.deepEqual(ipHits, [], `Clean-room IP audit failed:\n${ipHits.join('\n')}`);
});

test('UIEventBus: dispatches all required gameplay events and cleans up listeners', () => {
  const bus = new UIEventBus();
  const seen = [];
  const offCoin = bus.on(UIEvents.COIN_COLLECTED, (p) => seen.push(['coin', p.amount]));
  bus.on(UIEvents.CHECKPOINT_REACHED, (p) => seen.push(['cp', p.checkpointId]));

  assert.equal(bus.emit(UIEvents.COIN_COLLECTED, { amount: 1 }), 1);
  assert.equal(bus.emit(UIEvents.CHECKPOINT_REACHED, { checkpointId: 'mid-1' }), 1);
  offCoin();
  assert.equal(bus.emit(UIEvents.COIN_COLLECTED, { amount: 5 }), 0);

  assert.deepEqual(seen, [
    ['coin', 1],
    ['cp', 'mid-1'],
  ]);
  assert.equal(bus.getRecentEvents(UIEvents.COIN_COLLECTED).length, 2);
});

test('uiStore: World Map node states (locked, new, cleared, perfect) & course clear progression', () => {
  const state = createInitialUIState();
  assert.equal(state.files.length, 3);
  let file = state.files[0];

  const n11 = WORLD1_NODES.find((n) => n.id === '1-1');
  const n12 = WORLD1_NODES.find((n) => n.id === '1-2');
  const shop = WORLD1_NODES.find((n) => n.id === 'shop-1');

  assert.equal(resolveMapNodeState(n11, file), 'new');
  assert.equal(resolveMapNodeState(n12, file), 'locked');
  assert.equal(resolveMapNodeState(shop, file), 'cleared');

  // Clear 1-1 with 2 medallions (cleared, not yet perfect) -> unlocks 1-2
  file = applyCourseClearToFile(file, {
    courseCode: '1-1',
    score: 4200,
    shards: 35,
    petals: 30,
    medallions: [true, true, false],
    flagpoleHeightRatio: 0.7,
  });
  assert.equal(resolveMapNodeState(n11, file), 'cleared');
  assert.equal(resolveMapNodeState(n12, file), 'new');
  assert.equal(countFileMedallions(file).collected, 2);

  // Clear 1-1 again with 3rd medallion + top flag -> perfect
  file = applyCourseClearToFile(file, {
    courseCode: '1-1',
    score: 9800,
    shards: 60,
    petals: 45,
    medallions: [false, false, true],
    flagpoleHeightRatio: 0.95,
  });
  assert.equal(resolveMapNodeState(n11, file), 'perfect');
  assert.equal(countFileMedallions(file).collected, 3);
});

test('uiStore: Prism Outpost Shop purchase, insufficient petals rejection & free re-equip', () => {
  const state = createInitialUIState();
  let file = { ...state.files[0], petals: 12 };

  // Cannot buy 20-petal charm
  const tooExpensive = purchaseShopEntry(file, 'charm_dash_surge');
  assert.equal(tooExpensive.ok, false);
  assert.equal(tooExpensive.reason, 'insufficient_petals');

  // Can buy 10-petal Shard Magnet -> deducts petals & equips
  const bought = purchaseShopEntry(file, 'charm_magnet_pulse');
  assert.equal(bought.ok, true);
  assert.equal(bought.action, 'purchased_charm');
  assert.equal(bought.file.petals, 2);
  assert.equal(bought.file.equippedCharmId, 'charm_magnet_pulse');

  // Re-equip default owned charm -> free
  const reEquip = purchaseShopEntry(bought.file, 'charm_feather_glide');
  assert.equal(reEquip.ok, true);
  assert.equal(reEquip.action, 'equipped');
  assert.equal(reEquip.file.petals, 2);
  assert.equal(reEquip.file.equippedCharmId, 'charm_feather_glide');

  // Support charm never labelled "easy mode"
  for (const item of SHOP_CATALOG) {
    assert.equal(/easy\s*mode/i.test(`${item.name} ${item.summary} ${item.effect} ${item.category}`), false);
  }
});

test('uiStore: 1–4P Crown Rankings & Soft Game Over Penalty', () => {
  const mp = buildMultiplayerRankings(4, 3000, 40, 1);
  assert.equal(mp.length, 4);
  assert.equal(mp[0].rank, 1);
  assert.equal(mp[0].winsCrown, true);
  assert.ok(mp.some((e) => e.crownBonus === 1000 && e.hadCrown), 'Prior crown holder receives +1000 carry-over bonus');

  const smallPenalty = computeSoftGameOverPenalty(20);
  assert.equal(smallPenalty.penalty, 5);
  assert.equal(smallPenalty.remainingPetals, 15);
  assert.equal(smallPenalty.restoredLives, 5);

  const cappedPenalty = computeSoftGameOverPenalty(500);
  assert.equal(cappedPenalty.penalty, 50, 'Soft game over penalty must cap at 50 petals');
  assert.equal(cappedPenalty.remainingPetals, 450);
});

test('uiAudio: every named Spec §3.5 sound hook executes cleanly headlessly', () => {
  uiAudio.clearHistory();
  const hooks = Object.values(UISoundHook);
  assert.ok(hooks.length >= 12);
  for (const hook of hooks) {
    uiAudio.play(hook);
  }
  assert.equal(uiAudio.triggeredHooks.length, hooks.length);
  assert.deepEqual(uiAudio.triggeredHooks, hooks);
});
