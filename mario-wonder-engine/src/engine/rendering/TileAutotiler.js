/**
 * TileAutotiler — Pure Deterministic 9-Slice, Slope & Kit Role Resolver
 * ======================================================================
 * Converts raw TileMap physics cells into canonical visual sprite roles
 * without DOM dependencies, enabling deterministic GeometryLint checks in Node.
 *
 * Coordinate convention:
 *   row + 1 = ABOVE (world +Y)
 *   row - 1 = BELOW (world -Y)
 *   col - 1 = LEFT  (world -X)
 *   col + 1 = RIGHT (world +X)
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import TileMap from '../physics/TileMap.js';

const { tileTypes } = MovementProfile;
const EPS = 1e-4;

export const AutotileRole = {
  EMPTY: 'EMPTY',
  TOP_GRASS: 'TOP_GRASS',
  TOP_LEFT_CORNER: 'TOP_LEFT_CORNER',
  TOP_RIGHT_CORNER: 'TOP_RIGHT_CORNER',
  LEFT_CLIFF: 'LEFT_CLIFF',
  RIGHT_CLIFF: 'RIGHT_CLIFF',
  BOTTOM_DIRT: 'BOTTOM_DIRT',
  BOT_LEFT_CORNER: 'BOT_LEFT_CORNER',
  BOT_RIGHT_CORNER: 'BOT_RIGHT_CORNER',
  INTERIOR_EARTH: 'INTERIOR_EARTH',
  ISLAND_SINGLE: 'ISLAND_SINGLE',

  SLOPE_45_UP: 'SLOPE_45_UP',
  SLOPE_45_DOWN: 'SLOPE_45_DOWN',
  SLOPE_26_UP_1: 'SLOPE_26_UP_1',
  SLOPE_26_UP_2: 'SLOPE_26_UP_2',
  SLOPE_26_DOWN_1: 'SLOPE_26_DOWN_1',
  SLOPE_26_DOWN_2: 'SLOPE_26_DOWN_2',

  SEMISOLID_LEDGE: 'SEMISOLID_LEDGE',
  MUSHROOM_LEFT: 'MUSHROOM_LEFT',
  MUSHROOM_MID: 'MUSHROOM_MID',
  MUSHROOM_RIGHT: 'MUSHROOM_RIGHT',

  QUESTION: 'QUESTION',
  BRICK: 'BRICK',
  HARD: 'HARD',
  USED: 'USED',
  HAZARD: 'HAZARD',

  PIPE_CAP_L: 'PIPE_CAP_L',
  PIPE_CAP_R: 'PIPE_CAP_R',
  PIPE_BODY_L: 'PIPE_BODY_L',
  PIPE_BODY_R: 'PIPE_BODY_R',
};

/**
 * Resolve visual sprite role & metadata for a single tilemap cell.
 */
export function resolveTileRole(tilemap, col, row) {
  const type = tilemap.get(col, row);
  const variant = ((col * 7 + row * 13) & 0x7fffffff) % 4;

  if (type === tileTypes.EMPTY) {
    return { col, row, type, role: AutotileRole.EMPTY, variant, hasFoliageOverhang: false };
  }

  if (type === tileTypes.QUESTION_BLOCK) {
    return { col, row, type, role: AutotileRole.QUESTION, variant, hasFoliageOverhang: false };
  }
  if (type === tileTypes.BRICK_BLOCK) {
    return { col, row, type, role: AutotileRole.BRICK, variant, hasFoliageOverhang: false };
  }
  if (type === tileTypes.HARD_BLOCK) {
    return { col, row, type, role: AutotileRole.HARD, variant, hasFoliageOverhang: false };
  }
  if (type === tileTypes.USED_BLOCK) {
    return { col, row, type, role: AutotileRole.USED, variant, hasFoliageOverhang: false };
  }
  if (type === tileTypes.HAZARD) {
    return { col, row, type, role: AutotileRole.HAZARD, variant, hasFoliageOverhang: false };
  }

  // Pipes (2-tile wide vertical tubes with collar cap on top row)
  if (type === tileTypes.PIPE) {
    const isTopCap = tilemap.get(col, row + 1) !== tileTypes.PIPE;
    const isLeftHalf = tilemap.get(col - 1, row) !== tileTypes.PIPE && tilemap.get(col + 1, row) === tileTypes.PIPE;
    let role;
    if (isTopCap) {
      role = isLeftHalf ? AutotileRole.PIPE_CAP_L : AutotileRole.PIPE_CAP_R;
    } else {
      role = isLeftHalf ? AutotileRole.PIPE_BODY_L : AutotileRole.PIPE_BODY_R;
    }
    return { col, row, type, role, variant, hasFoliageOverhang: false };
  }

  // Semisolids
  if (type === tileTypes.SEMISOLID) {
    return { col, row, type, role: AutotileRole.SEMISOLID_LEDGE, variant, hasFoliageOverhang: true };
  }

  if (type === tileTypes.MUSHROOM_PLATFORM) {
    const sameLeft = tilemap.get(col - 1, row) === tileTypes.MUSHROOM_PLATFORM;
    const sameRight = tilemap.get(col + 1, row) === tileTypes.MUSHROOM_PLATFORM;
    let role = AutotileRole.MUSHROOM_MID;
    if (!sameLeft && sameRight) role = AutotileRole.MUSHROOM_LEFT;
    else if (sameLeft && !sameRight) role = AutotileRole.MUSHROOM_RIGHT;
    return { col, row, type, role, variant, hasFoliageOverhang: false };
  }

  // Exact slopes matching physical slope height definitions
  if (TileMap.isSlopeType(type)) {
    let role = AutotileRole.SLOPE_45_UP;
    if (type === tileTypes.SLOPE_45) {
      role = AutotileRole.SLOPE_45_UP;
    } else if (type === tileTypes.SLOPE_45_DOWN) {
      role = AutotileRole.SLOPE_45_DOWN;
    } else if (type === tileTypes.SLOPE_26_UP_1) {
      role = AutotileRole.SLOPE_26_UP_1;
    } else if (type === tileTypes.SLOPE_26_UP_2) {
      role = AutotileRole.SLOPE_26_UP_2;
    } else if (type === tileTypes.SLOPE_26_DOWN_1) {
      role = AutotileRole.SLOPE_26_DOWN_1;
    } else if (type === tileTypes.SLOPE_26_DOWN_2) {
      role = AutotileRole.SLOPE_26_DOWN_2;
    } else if (type === tileTypes.SLOPE_26) {
      const leftSame = tilemap.get(col - 1, row) === tileTypes.SLOPE_26;
      role = leftSame ? AutotileRole.SLOPE_26_UP_2 : AutotileRole.SLOPE_26_UP_1;
    }
    return { col, row, type, role, variant, hasFoliageOverhang: false };
  }

  // Standard 9-Slice Earth Terrain (tileTypes.SOLID)
  const upType = tilemap.get(col, row + 1);
  const downType = tilemap.get(col, row - 1);
  const leftType = tilemap.get(col - 1, row);
  const rightType = tilemap.get(col + 1, row);

  const slopeLeft = tilemap.getSlopeInfo(col - 1, row);
  const slopeRight = tilemap.getSlopeInfo(col + 1, row);

  const hasUp =
    upType === tileTypes.SOLID ||
    TileMap.isSlopeType(upType);

  const hasDown =
    row === 0 ||
    downType === tileTypes.SOLID ||
    downType === tileTypes.PIPE ||
    TileMap.isSlopeType(downType);

  const hasLeft =
    col === 0 ||
    leftType === tileTypes.SOLID ||
    leftType === tileTypes.PIPE ||
    (slopeLeft !== null && slopeLeft.hRight >= 1.0 - EPS);

  const hasRight =
    col === tilemap.cols - 1 ||
    rightType === tileTypes.SOLID ||
    rightType === tileTypes.PIPE ||
    (slopeRight !== null && slopeRight.hLeft >= 1.0 - EPS);

  let role = AutotileRole.INTERIOR_EARTH;
  let hasFoliageOverhang = false;

  if (!hasUp && !hasDown && !hasLeft && !hasRight) {
    role = AutotileRole.ISLAND_SINGLE;
    hasFoliageOverhang = true;
  } else if (!hasUp && !hasLeft) {
    role = AutotileRole.TOP_LEFT_CORNER;
    hasFoliageOverhang = true;
  } else if (!hasUp && !hasRight) {
    role = AutotileRole.TOP_RIGHT_CORNER;
    hasFoliageOverhang = true;
  } else if (!hasUp) {
    role = AutotileRole.TOP_GRASS;
    hasFoliageOverhang = true;
  } else if (!hasDown && !hasLeft) {
    role = AutotileRole.BOT_LEFT_CORNER;
  } else if (!hasDown && !hasRight) {
    role = AutotileRole.BOT_RIGHT_CORNER;
  } else if (!hasDown) {
    role = AutotileRole.BOTTOM_DIRT;
  } else if (!hasLeft) {
    role = AutotileRole.LEFT_CLIFF;
  } else if (!hasRight) {
    role = AutotileRole.RIGHT_CLIFF;
  }

  return { col, row, type, role, variant, hasFoliageOverhang };
}

/**
 * Precompute the full autotile resolution grid for a TileMap.
 */
export function computeAutotileGrid(tilemap) {
  const cells = new Array(tilemap.cols * tilemap.rows);
  for (let row = 0; row < tilemap.rows; row++) {
    for (let col = 0; col < tilemap.cols; col++) {
      cells[row * tilemap.cols + col] = resolveTileRole(tilemap, col, row);
    }
  }
  return {
    cols: tilemap.cols,
    rows: tilemap.rows,
    cells,
    get(col, row) {
      if (col < 0 || col >= tilemap.cols || row < 0 || row >= tilemap.rows) return null;
      return cells[row * tilemap.cols + col];
    },
  };
}

export default {
  AutotileRole,
  resolveTileRole,
  computeAutotileGrid,
};
