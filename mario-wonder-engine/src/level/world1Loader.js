/**
 * World 1 Benchmark Course Loader (`src/level/world1Loader.js`)
 * ==============================================================
 * Compiles the declarative Stage 18 dataset (`src/data/world1.json`) into
 * playable, deterministic Kishōtenketsu rooms for GameEngine & headless testing:
 *   - Course 1-1: "Verdant Outskirts" (Stomp & 6-Enemy Shell Run)
 *   - Course 1-2: "Deep Slate Cavern" (Compression Springs & Wall-Jump Chimney)
 *   - Course 1-3: "Hydro-Pulse Ridge" (3.0s Pulsing & 14.0 t/s Horizontal Geysers)
 */

import world1Data from '../data/world1.json' with { type: 'json' };
import MovementProfile from '../game/config/MovementProfile.js';
import { KISHOTENKETSU_ACTS, buildKishotenketsuLevel } from './levelEngine.js';
import { generateParabolicShardArc } from '../entities/collectibles.js';

const { tileTypes } = MovementProfile;

/**
 * Resolve symbolic tile names from world1.json (e.g. "SOLID", "HAZARD")
 * into numeric TileMap cell codes from MovementProfile.tileTypes.
 */
function resolveTileType(typeKey) {
  if (typeof typeKey === 'number') return typeKey;
  const resolved = tileTypes[typeKey];
  if (resolved === undefined) {
    throw new Error(`Unknown World 1 tile type: "${typeKey}"`);
  }
  return resolved;
}

/**
 * Compile a raw course JSON descriptor into a full Kishōtenketsu room schema + TileMap.
 * Expands declarative parabolic `shardArcs` into Sparking Gold Shards matching true jump arcs.
 */
export function compileWorld1Course(rawCourse) {
  const acts = (rawCourse.acts || []).map((a) => ({
    ...(KISHOTENKETSU_ACTS[a.id] || {}),
    ...a,
  }));

  const tileRects = (rawCourse.tileRects || []).map((r) => ({
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    type: resolveTileType(r.type),
  }));

  const singleTiles = (rawCourse.singleTiles || []).map((t) => ({
    x: t.x,
    y: t.y,
    type: resolveTileType(t.type),
  }));

  const arcCoins = [];
  if (Array.isArray(rawCourse.shardArcs)) {
    for (let i = 0; i < rawCourse.shardArcs.length; i++) {
      const arc = rawCourse.shardArcs[i];
      arcCoins.push(
        ...generateParabolicShardArc({
          ...arc,
          arcId: arc.id || `${rawCourse.id || 'course'}_arc_${i + 1}`,
        })
      );
    }
  }

  const baseCoins = (rawCourse.coins || []).map((c) => ({ ...c, isShard: true }));

  const schema = {
    ...rawCourse,
    acts,
    tileRects,
    singleTiles,
    coins: [...baseCoins, ...arcCoins],
  };

  return buildKishotenketsuLevel(schema);
}

export const WORLD1_RAW_DATA = world1Data;

export function createCourse1_1() {
  return compileWorld1Course(world1Data.courses[0]);
}

export function createCourse1_2() {
  return compileWorld1Course(world1Data.courses[1]);
}

export function createCourse1_3() {
  return compileWorld1Course(world1Data.courses[2]);
}

export function getAllWorld1Courses() {
  return world1Data.courses.map((c) => compileWorld1Course(c));
}

export default getAllWorld1Courses;
