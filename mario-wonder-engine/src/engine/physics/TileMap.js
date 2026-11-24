/**
 * TileMap — 64×64px Grid Collision Data Structure
 * =================================================
 * Stores tile type data for collision queries.
 * No rendering logic — purely physics data.
 */

import MovementProfile from '../../game/config/MovementProfile.js';

const { tileTypes } = MovementProfile;

class TileMap {
  /**
   * @param {number} cols — Grid columns
   * @param {number} rows — Grid rows  
   * @param {Uint8Array|Array} [data] — Flat array of tile types
   */
  constructor(cols, rows, data = null) {
    this.cols = cols;
    this.rows = rows;
    this.data = data ? new Uint8Array(data) : new Uint8Array(cols * rows);
  }

  get width() {
    return this.cols;
  }

  get height() {
    return this.rows;
  }

  /**
   * Get tile type at grid coordinate (col, row).
   * Returns EMPTY for out-of-bounds queries.
   */
  get(col, row) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return tileTypes.EMPTY;
    }
    return this.data[row * this.cols + col];
  }

  /**
   * Set tile type at grid coordinate.
   */
  set(col, row, type) {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return;
    this.data[row * this.cols + col] = type;
  }

  setTile(col, row, type) {
    this.set(col, row, type);
  }

  /**
   * Fill a rectangular region with a tile type.
   */
  fillRect(col, row, width, height, type) {
    for (let r = row; r < row + height; r++) {
      for (let c = col; c < col + width; c++) {
        this.set(c, r, type);
      }
    }
  }

  /**
   * Query: is a tile type solid (blocks AABB movement)?
   */
  static isSolidType(t) {
    return (
      t === tileTypes.SOLID ||
      t === tileTypes.HAZARD ||
      t === tileTypes.QUESTION_BLOCK ||
      t === tileTypes.BRICK_BLOCK ||
      t === tileTypes.HARD_BLOCK ||
      t === tileTypes.USED_BLOCK ||
      t === tileTypes.PIPE
    );
  }

  /**
   * Query: is a tile type a one-way semisolid platform?
   */
  static isSemisolidType(t) {
    return t === tileTypes.SEMISOLID || t === tileTypes.MUSHROOM_PLATFORM;
  }

  /**
   * Query: is a tile type an interactive overhead/poundable block?
   */
  static isInteractiveBlockType(t) {
    return t === tileTypes.QUESTION_BLOCK || t === tileTypes.BRICK_BLOCK;
  }

  /**
   * Query: is tile at (col, row) solid (blocks movement)?
   */
  isSolid(col, row) {
    return TileMap.isSolidType(this.get(col, row));
  }

  /**
   * Query: is tile at (col, row) a one-way semisolid platform?
   */
  isSemisolid(col, row) {
    return TileMap.isSemisolidType(this.get(col, row));
  }

  /**
   * Query: is a tile type a slope?
   */
  static isSlopeType(t) {
    return (
      t === tileTypes.SLOPE_45 ||
      t === tileTypes.SLOPE_26 ||
      t === tileTypes.SLOPE_45_DOWN ||
      t === tileTypes.SLOPE_26_UP_1 ||
      t === tileTypes.SLOPE_26_UP_2 ||
      t === tileTypes.SLOPE_26_DOWN_1 ||
      t === tileTypes.SLOPE_26_DOWN_2
    );
  }

  isSlope(col, row) {
    return TileMap.isSlopeType(this.get(col, row));
  }

  /**
   * Get the slope height function and exact unit normal for a slope tile.
   * Normal formula: n = normalize(-dy/du, 1).
   * Returns null for non-slope tiles.
   * @returns {{
   *   heightAt: (u: number) => number,
   *   derivative: number,
   *   normal: [number, number],
   *   angleDeg: number,
   *   hLeft: number,
   *   hRight: number
   * } | null}
   */
  getSlopeInfo(col, row) {
    const t = this.get(col, row);
    if (!TileMap.isSlopeType(t)) return null;

    const makeSlope = (h0, d) => {
      const invLen = 1 / Math.hypot(-d, 1);
      const angleDeg = (Math.atan(d) * 180) / Math.PI;
      return {
        heightAt: (u) => h0 + d * u,
        derivative: d,
        normal: [-d * invLen, invLen],
        angleDeg,
        hLeft: h0,
        hRight: h0 + d,
      };
    };

    if (t === tileTypes.SLOPE_45) {
      return makeSlope(0.0, 1.0);
    }
    if (t === tileTypes.SLOPE_45_DOWN) {
      return makeSlope(1.0, -1.0);
    }
    if (t === tileTypes.SLOPE_26) {
      // Auto-pair 2x1 gentle slope: 1st tile [0..0.5], 2nd tile [0.5..1.0]
      const leftSame = this.get(col - 1, row) === tileTypes.SLOPE_26;
      return makeSlope(leftSame ? 0.5 : 0.0, 0.5);
    }
    if (t === tileTypes.SLOPE_26_UP_1) {
      return makeSlope(0.0, 0.5);
    }
    if (t === tileTypes.SLOPE_26_UP_2) {
      return makeSlope(0.5, 0.5);
    }
    if (t === tileTypes.SLOPE_26_DOWN_1) {
      return makeSlope(1.0, -0.5);
    }
    if (t === tileTypes.SLOPE_26_DOWN_2) {
      return makeSlope(0.5, -0.5);
    }
    return null;
  }

  /**
   * Convert world position (tiles) to grid coordinate.
   */
  worldToGrid(worldX, worldY) {
    return {
      col: Math.floor(worldX),
      row: Math.floor(worldY),
    };
  }

  /**
   * Get world-space bounds of a grid cell.
   * Note: Y increases upward in world space but rows increase downward in grid.
   * We use a flipped Y: row 0 = top of level, increasing row = going down.
   * World Y = (totalRows - row - 1) for the bottom edge of the tile.
   */
  gridToWorld(col, row) {
    return {
      x: col,
      y: row,
      width: 1.0,
      height: 1.0,
    };
  }

  /**
   * Serialize map data to JSON (for deterministic replay verification).
   */
  toJSON() {
    return {
      cols: this.cols,
      rows: this.rows,
      data: Array.from(this.data),
    };
  }

  /**
   * Deserialize from JSON.
   */
  static fromJSON(json) {
    return new TileMap(json.cols, json.rows, json.data);
  }
}

export default TileMap;
