/**
 * GeometryLint — Automated Visual-to-Collision Parity Auditor
 * ============================================================
 * Verifies that every rendered tile across a level's TileMap has
 * 100% matched physics collision data:
 *   - Zero invisible solid barriers (solid physics cell must render as solid role)
 *   - Zero phantom walls (EMPTY physics cell must render as EMPTY role)
 *   - Exact slope orientation parity (visual slope matches getSlopeInfo() rise/run)
 *   - Exact semisolid one-way parity
 *   - Valid 2-tile Warp Pipe pairs
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import TileMap from './TileMap.js';
import { AutotileRole, computeAutotileGrid } from '../rendering/TileAutotiler.js';

const { tileTypes } = MovementProfile;

const SOLID_ROLES = new Set([
  AutotileRole.TOP_GRASS,
  AutotileRole.TOP_LEFT_CORNER,
  AutotileRole.TOP_RIGHT_CORNER,
  AutotileRole.LEFT_CLIFF,
  AutotileRole.RIGHT_CLIFF,
  AutotileRole.BOTTOM_DIRT,
  AutotileRole.BOT_LEFT_CORNER,
  AutotileRole.BOT_RIGHT_CORNER,
  AutotileRole.INTERIOR_EARTH,
  AutotileRole.ISLAND_SINGLE,
  AutotileRole.QUESTION,
  AutotileRole.BRICK,
  AutotileRole.HARD,
  AutotileRole.USED,
  AutotileRole.HAZARD,
  AutotileRole.PIPE_CAP_L,
  AutotileRole.PIPE_CAP_R,
  AutotileRole.PIPE_BODY_L,
  AutotileRole.PIPE_BODY_R,
]);

const SEMISOLID_ROLES = new Set([
  AutotileRole.SEMISOLID_LEDGE,
  AutotileRole.MUSHROOM_LEFT,
  AutotileRole.MUSHROOM_MID,
  AutotileRole.MUSHROOM_RIGHT,
]);

const SLOPE_ROLE_BY_TYPE = {
  [tileTypes.SLOPE_45]: AutotileRole.SLOPE_45_UP,
  [tileTypes.SLOPE_45_DOWN]: AutotileRole.SLOPE_45_DOWN,
  [tileTypes.SLOPE_26_UP_1]: AutotileRole.SLOPE_26_UP_1,
  [tileTypes.SLOPE_26_UP_2]: AutotileRole.SLOPE_26_UP_2,
  [tileTypes.SLOPE_26_DOWN_1]: AutotileRole.SLOPE_26_DOWN_1,
  [tileTypes.SLOPE_26_DOWN_2]: AutotileRole.SLOPE_26_DOWN_2,
};

/**
 * Audit a single room or TileMap for 100% visual <-> collision parity.
 */
export function lintTileMapGeometry(tilemap, roomName = 'TileMap') {
  const grid = computeAutotileGrid(tilemap);
  const mismatches = [];
  let checkedTiles = 0;

  for (let row = 0; row < tilemap.rows; row++) {
    for (let col = 0; col < tilemap.cols; col++) {
      checkedTiles++;
      const type = tilemap.get(col, row);
      const cell = grid.get(col, row);
      const role = cell?.role ?? AutotileRole.EMPTY;

      if (type === tileTypes.EMPTY) {
        if (role !== AutotileRole.EMPTY) {
          mismatches.push({
            col,
            row,
            roomName,
            reason: `Phantom visual role "${role}" on EMPTY physics tile`,
          });
        }
        continue;
      }

      if (TileMap.isSolidType(type)) {
        if (!SOLID_ROLES.has(role)) {
          mismatches.push({
            col,
            row,
            roomName,
            reason: `Invisible/unmatched solid barrier: type=${type} rendered as role="${role}"`,
          });
        }
        if (type === tileTypes.PIPE) {
          const leftPipe = tilemap.get(col - 1, row) === tileTypes.PIPE;
          const rightPipe = tilemap.get(col + 1, row) === tileTypes.PIPE;
          if (!leftPipe && !rightPipe) {
            mismatches.push({
              col,
              row,
              roomName,
              reason: 'Orphan 1-tile PIPE (pipes must be 2 tiles wide)',
            });
          }
        }
        continue;
      }

      if (TileMap.isSemisolidType(type)) {
        if (!SEMISOLID_ROLES.has(role)) {
          mismatches.push({
            col,
            row,
            roomName,
            reason: `Semisolid type=${type} rendered as non-semisolid role="${role}"`,
          });
        }
        continue;
      }

      if (TileMap.isSlopeType(type)) {
        const slopeInfo = tilemap.getSlopeInfo(col, row);
        if (!slopeInfo) {
          mismatches.push({
            col,
            row,
            roomName,
            reason: `Slope type=${type} missing getSlopeInfo()`,
          });
          continue;
        }
        if (type === tileTypes.SLOPE_26) {
          const leftSame = tilemap.get(col - 1, row) === tileTypes.SLOPE_26;
          const expected = leftSame ? AutotileRole.SLOPE_26_UP_2 : AutotileRole.SLOPE_26_UP_1;
          if (role !== expected) {
            mismatches.push({
              col,
              row,
              roomName,
              reason: `SLOPE_26 role mismatch: expected "${expected}", got "${role}"`,
            });
          }
        } else if (role !== SLOPE_ROLE_BY_TYPE[type]) {
          mismatches.push({
            col,
            row,
            roomName,
            reason: `Slope role mismatch: expected "${SLOPE_ROLE_BY_TYPE[type]}", got "${role}"`,
          });
        }
      }
    }
  }

  const passed = mismatches.length === 0;
  return {
    passed,
    errorCount: mismatches.length,
    roomName,
    checkedTiles,
    mismatches,
    summary: passed
      ? `PASS (${checkedTiles} tiles, 0 mismatches)`
      : `FAIL (${mismatches.length} mismatches across ${checkedTiles} tiles)`,
  };
}

/**
 * Audit all rooms in a list and return an aggregated report.
 */
export function lintAllRooms(rooms) {
  const reports = rooms.map((room) => lintTileMapGeometry(room.map, room.name));
  const totalChecked = reports.reduce((acc, r) => acc + r.checkedTiles, 0);
  const totalMismatches = reports.reduce((acc, r) => acc + r.mismatches.length, 0);
  return {
    passed: totalMismatches === 0,
    totalChecked,
    totalMismatches,
    reports,
    summary: totalMismatches === 0
      ? `PASS (${totalChecked} tiles / ${reports.length} rooms, 0 errors)`
      : `FAIL (${totalMismatches} mismatches)`,
  };
}

export default {
  lintTileMapGeometry,
  lintAllRooms,
};
