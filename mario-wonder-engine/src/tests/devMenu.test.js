/**
 * DevCommandMenu Model & Metadata Unit Tests
 * ===========================================
 * Verifies parity between menuModel.js room/gauntlet metadata and GameEngine rooms,
 * status summary formatting, and ActionBannerHUD top offset behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROOM_ENTRIES,
  GAUNTLET_SECTIONS,
  KISHOTENKETSU_ACT_ENTRIES,
  DEV_MENU_TABS,
  buildMenuStatusSummary,
  getActionBannerTopOffset,
} from '../ui/overlays/menuModel.js';
import { getAllRooms, createEnemyGallery1, createPropsPlayground } from '../game/levels/benchmark/BenchmarkRooms.js';
import { createWaterSpoutBeach } from '../level/levelEngine.js';
import { getAllWorld1Courses } from '../level/world1Loader.js';
import { createDreadShellBossRoom } from '../entities/boss.js';

describe('DevCommandMenu — Pure Model & Metadata Parity', () => {
  it('matches all 15 engine rooms (Rooms 1–11 + World 1 Courses 1-1, 1-2, 1-3, 1-4 Boss) by index and name', () => {
    const engineRooms = [
      ...getAllRooms(),
      createEnemyGallery1(),
      createPropsPlayground(),
      createWaterSpoutBeach(),
      ...getAllWorld1Courses(),
      createDreadShellBossRoom(),
    ];
    assert.equal(ROOM_ENTRIES.length, engineRooms.length);

    ROOM_ENTRIES.forEach((entry, idx) => {
      assert.equal(entry.index, idx);
      assert.equal(entry.number, idx + 1);
      assert.equal(entry.name, engineRooms[idx].name);
      assert.ok(entry.short.length > 0);
      assert.ok(entry.hint.length > 0);
    });
  });

  it('matches all 4 Kishōtenketsu Acts (Ki, Shō, Ten, Ketsu) in Room 11 and all 3 World 1 courses', () => {
    const courses = [createWaterSpoutBeach(), ...getAllWorld1Courses()];
    for (const course of courses) {
      const acts = course.levelSchema.acts;
      assert.equal(KISHOTENKETSU_ACT_ENTRIES.length, acts.length);

      KISHOTENKETSU_ACT_ENTRIES.forEach((entry, idx) => {
        assert.equal(entry.id, acts[idx].id);
        assert.equal(entry.number, idx + 1);
        assert.ok(entry.label.length > 0);
      });
    }
  });

  it('matches all 9 Gauntlet sections (A–I) in Room 8', () => {
    const rooms = getAllRooms();
    const gauntlet = rooms[7];
    assert.equal(GAUNTLET_SECTIONS.length, gauntlet.sections.length);

    GAUNTLET_SECTIONS.forEach((sec, idx) => {
      assert.equal(sec.id, gauntlet.sections[idx].id);
      assert.equal(sec.keyNum, idx + 1);
      assert.ok(sec.label.length > 0);
    });
  });

  it('exposes the 3 expected drawer tabs with concise mobile-safe labels', () => {
    assert.deepEqual(
      DEV_MENU_TABS.map((t) => ({ id: t.id, label: t.label })),
      [
        { id: 'rooms', label: 'Rooms' },
        { id: 'sim', label: 'Feel & Sim' },
        { id: 'tools', label: 'Tools' },
      ]
    );
  });

  it('formats concise drawer status summaries across character, preset, speed, and pause state', () => {
    const base = buildMenuStatusSummary({
      roomName: 'Room 9: Enemy Gallery 1',
      characterId: 'mario',
      feelPresetId: 'wonder',
      isPaused: false,
      timeScale: 1.0,
    });
    assert.equal(base.title, 'Room 9: Enemy Gallery 1');
    assert.equal(base.meta, 'Mario · Wonder');

    const modified = buildMenuStatusSummary({
      roomName: 'Room 8: The Gauntlet',
      characterId: 'luigi',
      feelPresetId: 'arcade',
      isPaused: true,
      timeScale: 0.5,
    });
    assert.equal(modified.title, 'Room 8: The Gauntlet');
    assert.equal(modified.meta, 'Luigi · Arcade · 0.5× · Paused');
  });

  it('keeps ActionBannerHUD tucked cleanly at 12px when top bar is collapsed', () => {
    assert.equal(getActionBannerTopOffset({ menuOpen: false }), 12);
    assert.equal(getActionBannerTopOffset({ menuOpen: true }), 12);
  });
});
