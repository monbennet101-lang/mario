/**
 * CollisionSystem — Custom Swept AABB vs Tilemap, Slopes, Semisolids & Platforms
 * ==============================================================================
 * Axis-separated swept collision resolution:
 *   1. Sweep X -> resolve against solid tiles (with sealed slope joints & ledge step-up)
 *   2. Sweep Y -> resolve against solid, hazard, and one-way semisolid tiles (with drop-through & corner nudge)
 *   3. Resolve 45° / 26.57° slopes + downhill ground adhesion (0.40t) + slope->flat seams
 *   4. Resolve moving platforms (one-way & solid carry/landing)
 *   5. Zero-jitter ground probe + ground support classification
 *
 * Zero physics engine. Zero rigidbodies. Pure kinematic control.
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import TileMap from './TileMap.js';

const { tileTypes } = MovementProfile;
const EPS = 1e-6;
const GROUND_PROBE_EPS = 1e-4;

class CollisionSystem {
  /**
   * @param {import('./TileMap.js').default} tilemap
   */
  constructor(tilemap) {
    this.tilemap = tilemap;
  }

  /**
   * Resolve moving platform carry displacement against solid walls before player movement.
   */
  applyPlatformCarry(pos, width, height, deltaX, deltaY, solidBoxes = []) {
    if (deltaX !== 0) {
      const targetX = pos.x + deltaX;
      if (!this.overlapsSolid(targetX, pos.y + 0.02, width, Math.max(0.1, height - 0.04), solidBoxes)) {
        pos.x = targetX;
      }
    }
    if (deltaY !== 0) {
      const targetY = pos.y + deltaY;
      if (!this.overlapsSolid(pos.x, targetY, width, height, solidBoxes)) {
        pos.y = targetY;
      }
    }
  }

  /**
   * Resolve character movement against the tilemap, slopes, semisolids, and moving platforms.
   * Modifies position and velocity in-place.
   *
   * @param {{ x: number, y: number }} pos — Character bottom-left position (tiles)
   * @param {{ x: number, y: number }} vel — Character velocity (tiles/s)
   * @param {number} width — Hitbox width (tiles)
   * @param {number} height — Hitbox height (tiles)
   * @param {number} dt — Time step (seconds)
   * @param {object} [options]
   * @param {boolean} [options.wasGrounded=false]
   * @param {boolean} [options.wasOnSlope=false]
   * @param {number|null} [options.dropThroughFloorY=null]
   * @param {Array} [options.platforms=[]]
   * @param {object|null} [options.ridingPlatform=null]
   */
  moveAndCollide(pos, vel, width, height, dt, options = {}) {
    const {
      wasGrounded = false,
      wasOnSlope = false,
      dropThroughFloorY = null,
      platforms = [],
      ridingPlatform = null,
      solidBoxes = [],
    } = options;

    const result = {
      grounded: false,
      ceilingHit: false,
      wallLeft: false,
      wallRight: false,
      wallLeftSolid: false,
      wallRightSolid: false,
      hazardHit: false,
      groundNormalX: 0,
      groundNormalY: 1,
      cornerCorrected: false,
      cornerNudgeDir: 0,
      cornerNudgeAmount: 0,
      cornerNudgeX: 0,
      cornerNudgeY: 0,
      steppedUp: false,
      stepUpAmount: 0,
      // Stage 5 terrain & platform telemetry
      onSlope: false,
      slopeAngleDeg: 0,
      slopeDerivative: 0,
      slopeAdhesion: false,
      standingOnSemisolid: false,
      standingOnSolid: false,
      ridingPlatform: null,
      // Stage 6 interactive overhead block hit
      ceilingHitTile: null,
    };

    // ── Step 1: Sweep X, Resolve X (with sealed slope seams, solidBoxes & Ledge Step-Up) ──
    const prevX = pos.x;
    const nextX = prevX + vel.x * dt;
    this._sweepX(pos, vel, prevX, nextX, width, height, result, solidBoxes, platforms, ridingPlatform);

    // ── Step 2: Sweep Y, Resolve Y (with drop-through, solidBoxes & Ceiling Corner Correction) ──
    const prevY = pos.y;
    const nextY = prevY + vel.y * dt;
    this._sweepY(pos, vel, prevY, nextY, width, height, options, result);

    // ── Step 3: Slope resolution & downhill ground adhesion (0.40t) ──
    this._resolveSlopes(pos, vel, prevY, width, height, options, result);

    // ── Step 4: Moving platforms resolution (top carry + solid underside) ──
    if (platforms && platforms.length > 0) {
      this._resolveMovingPlatforms(pos, vel, prevY, width, height, platforms, options, result);
    }

    // ── Step 5: Zero-jitter flat ground support probe ──
    if (!result.grounded && vel.y <= 0) {
      this._probeGround(pos, vel, width, dropThroughFloorY, result, solidBoxes);
    }

    // ── Step 6: Classify supporting surface for drop-through & HUD telemetry ──
    if (result.grounded) {
      this._classifyGroundSupport(pos, width, dropThroughFloorY, result, solidBoxes);
    }

    return result;
  }

  /**
   * Check whether a vertical face of SOLID tile (col, row) facing `neighborCol`
   * is sealed internally by an adjacent slope tile that reaches top `row + 1`.
   */
  _isFaceSealedBySlope(col, row, neighborCol, posY) {
    if (posY < row - 0.05) return false;
    const slope = this.tilemap.getSlopeInfo(neighborCol, row);
    if (!slope) return false;
    if (neighborCol === col - 1) {
      return slope.hRight >= 1.0 - EPS;
    }
    if (neighborCol === col + 1) {
      return slope.hLeft >= 1.0 - EPS;
    }
    return false;
  }

  /**
   * Check solid overlap while ignoring earth-fill/plateau faces sealed by the active slope.
   */
  _overlapsSolidOnSlope(x, y, width, height, slopeCol, slopeRow, slope) {
    const left = Math.floor(x + EPS);
    const right = Math.floor(x + width - EPS);
    const bottom = Math.floor(y + EPS);
    const top = Math.floor(y + height - EPS);

    for (let row = bottom; row <= top; row++) {
      for (let col = left; col <= right; col++) {
        if (!this.tilemap.isSolid(col, row)) continue;
        if (row === slopeRow) {
          if (col === slopeCol + 1 && slope.hRight >= 1.0 - EPS) continue;
          if (col === slopeCol - 1 && slope.hLeft >= 1.0 - EPS) continue;
          if (this.tilemap.isSlope(col, row + 1)) continue;
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Check whether `footCenterX` is currently on a slope whose surface is near `[prevY, nextY]`
   * and therefore takes priority over adjacent SOLID crest/earth-fill tiles.
   */
  _findActiveSlopeAtFoot(footCenterX, prevY, nextY) {
    const col = Math.floor(footCenterX);
    const maxSnap = MovementProfile.slopes.adhesionSnapDistance;
    const topRow = Math.floor(Math.max(prevY, nextY) + 0.55);
    const botRow = Math.floor(Math.min(prevY, nextY) - maxSnap - 0.15);

    for (let row = topRow; row >= botRow; row--) {
      const slope = this.tilemap.getSlopeInfo(col, row);
      if (!slope) continue;
      const u = Math.max(0, Math.min(1, footCenterX - col));
      const surfaceY = row + slope.heightAt(u);
      return { col, row, slope, surfaceY };
    }
    return null;
  }

  /**
   * Swept horizontal collision against solid tiles.
   * Includes slope seam sealing and Stage 3 Ledge Step-Up forgiveness (<= 0.20 tiles).
   */
  _sweepX(pos, vel, prevX, nextX, width, height, result, solidBoxes = [], platforms = [], ridingPlatform = null) {
    if (vel.x === 0) {
      pos.x = nextX;
      return;
    }

    const bottom = Math.floor(pos.y + EPS);
    const top = Math.floor(pos.y + height - EPS);

    if (vel.x > 0) {
      const prevRight = prevX + width;
      const nextRight = nextX + width;
      const colStart = Math.floor(prevRight - EPS);
      const colEnd = Math.floor(nextRight - EPS);

      let closestLeft = nextX;
      let hitCol = -1;
      let hitType = tileTypes.EMPTY;
      let hit = false;
      let hitWasBox = false;

      for (let col = colStart; col <= colEnd; col++) {
        for (let row = bottom; row <= top; row++) {
          const type = this.tilemap.get(col, row);
          if (!TileMap.isSolidType(type)) continue;
          if (this._isFaceSealedBySlope(col, row, col - 1, pos.y)) continue;

          const tileLeft = col;
          if (prevRight <= tileLeft + GROUND_PROBE_EPS && nextRight > tileLeft) {
            const clampedX = tileLeft - width;
            if (!hit || clampedX < closestLeft) {
              closestLeft = clampedX;
              hitCol = col;
              hitType = type;
              hit = true;
              hitWasBox = false;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          } else if (nextRight > tileLeft && prevX < col + 1) {
            const clampedX = tileLeft - width;
            if (!hit || clampedX < closestLeft) {
              closestLeft = clampedX;
              hitCol = col;
              hitType = type;
              hit = true;
              hitWasBox = false;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          }
        }
      }

      // Check dynamic solidBoxes (e.g. WarpAccessTubes) and solid (non-one-way) moving platforms
      for (let i = 0; i < solidBoxes.length; i++) {
        const box = solidBoxes[i];
        if (pos.y + height <= box.y + EPS || pos.y >= box.y + box.height - EPS) continue;
        if (prevRight <= box.x + 0.05 && nextRight > box.x) {
          const clampedX = box.x - width;
          if (!hit || clampedX < closestLeft) {
            closestLeft = clampedX;
            hit = true;
            hitWasBox = true;
            hitType = tileTypes.SOLID;
          }
        }
      }
      for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (plat.oneWay || plat.solidActive === false || plat === ridingPlatform) continue;
        if (pos.y + height <= plat.pos.y + EPS || pos.y >= plat.pos.y + plat.height - 0.05) continue;
        if (prevRight <= plat.pos.x + 0.08 && nextRight > plat.pos.x) {
          const clampedX = plat.pos.x - width;
          if (!hit || clampedX < closestLeft) {
            closestLeft = clampedX;
            hit = true;
            hitWasBox = true;
            hitType = tileTypes.SOLID;
          }
        }
      }

      if (hit) {
        if (!hitWasBox && this._tryLedgeStepUp(pos, vel, nextX, width, height, hitCol, bottom, top, result)) {
          return;
        }
        pos.x = closestLeft;
        vel.x = 0;
        result.wallRight = true;
        result.wallRightSolid = hitType !== tileTypes.HAZARD;
      } else {
        pos.x = nextX;
      }
    } else {
      const colStart = Math.floor(prevX + EPS);
      const colEnd = Math.floor(nextX + EPS);

      let closestX = nextX;
      let hitCol = -1;
      let hitType = tileTypes.EMPTY;
      let hit = false;
      let hitWasBox = false;

      for (let col = colStart; col >= colEnd; col--) {
        for (let row = bottom; row <= top; row++) {
          const type = this.tilemap.get(col, row);
          if (!TileMap.isSolidType(type)) continue;
          if (this._isFaceSealedBySlope(col, row, col + 1, pos.y)) continue;

          const tileRight = col + 1;
          if (prevX >= tileRight - GROUND_PROBE_EPS && nextX < tileRight) {
            if (!hit || tileRight > closestX) {
              closestX = tileRight;
              hitCol = col;
              hitType = type;
              hit = true;
              hitWasBox = false;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          } else if (nextX < tileRight && prevX + width > col) {
            if (!hit || tileRight > closestX) {
              closestX = tileRight;
              hitCol = col;
              hitType = type;
              hit = true;
              hitWasBox = false;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          }
        }
      }

      for (let i = 0; i < solidBoxes.length; i++) {
        const box = solidBoxes[i];
        if (pos.y + height <= box.y + EPS || pos.y >= box.y + box.height - EPS) continue;
        const boxRight = box.x + box.width;
        if (prevX >= boxRight - 0.05 && nextX < boxRight) {
          if (!hit || boxRight > closestX) {
            closestX = boxRight;
            hit = true;
            hitWasBox = true;
            hitType = tileTypes.SOLID;
          }
        }
      }
      for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (plat.oneWay || plat.solidActive === false || plat === ridingPlatform) continue;
        if (pos.y + height <= plat.pos.y + EPS || pos.y >= plat.pos.y + plat.height - 0.05) continue;
        const platRight = plat.pos.x + plat.width;
        if (prevX >= platRight - 0.08 && nextX < platRight) {
          if (!hit || platRight > closestX) {
            closestX = platRight;
            hit = true;
            hitWasBox = true;
            hitType = tileTypes.SOLID;
          }
        }
      }

      if (hit) {
        if (!hitWasBox && this._tryLedgeStepUp(pos, vel, nextX, width, height, hitCol, bottom, top, result)) {
          return;
        }
        pos.x = closestX;
        vel.x = 0;
        result.wallLeft = true;
        result.wallLeftSolid = hitType !== tileTypes.HAZARD;
      } else {
        pos.x = nextX;
      }
    }
  }

  /**
   * Ledge Step-Up: If feet are within `ledgeStepUp` (0.20 tiles) of a platform top
   * while moving horizontally into it, snap onto the platform preserving horizontal velocity.
   */
  _tryLedgeStepUp(pos, vel, nextX, width, height, hitCol, bottom, top, result) {
    const maxStep = MovementProfile.forgiveness.ledgeStepUp;
    if (maxStep <= 0 || vel.y > MovementProfile.forgiveness.ledgeStepUpMaxVy) {
      return false;
    }

    let maxTileTop = -Infinity;
    for (let row = bottom; row <= top; row++) {
      const type = this.tilemap.get(hitCol, row);
      if (type === tileTypes.HAZARD) {
        return false; // Never step onto hazards
      } else if (TileMap.isSolidType(type)) {
        const tileTop = row + 1;
        if (tileTop > maxTileTop) maxTileTop = tileTop;
      }
    }

    const deltaY = maxTileTop - pos.y;
    if (deltaY <= 0 || deltaY > maxStep + EPS) {
      return false;
    }

    if (this.overlapsSolid(nextX, maxTileTop, width, height)) {
      return false;
    }

    pos.x = nextX;
    pos.y = maxTileTop;
    vel.y = 0;
    result.steppedUp = true;
    result.stepUpAmount = deltaY;
    result.grounded = true;
    result.groundNormalX = 0;
    result.groundNormalY = 1;
    return true;
  }

  /**
   * Swept vertical collision against solid, hazard, and semisolid tiles.
   * Respects dropThroughFloorY for semisolids and yields internal slope fill/crests to _resolveSlopes.
   */
  _sweepY(pos, vel, prevY, nextY, width, height, options, result) {
    const { wasGrounded = false, dropThroughFloorY = null, solidBoxes = [] } = options;
    const left = Math.floor(pos.x + EPS);
    const right = Math.floor(pos.x + width - EPS);

    if (vel.y < 0) {
      const rowStart = Math.floor(prevY + EPS);
      const rowEnd = Math.floor(nextY + EPS);
      const footCenterX = pos.x + width * 0.5;
      const activeSlope = this._findActiveSlopeAtFoot(footCenterX, prevY, nextY);

      let highestFloor = nextY;
      let hit = false;

      for (let row = rowStart; row >= rowEnd; row--) {
        for (let col = left; col <= right; col++) {
          const type = this.tilemap.get(col, row);
          if (type === tileTypes.EMPTY) continue;

          if (TileMap.isSemisolidType(type)) {
            const platformTop = row + 1;
            if (dropThroughFloorY !== null && platformTop >= dropThroughFloorY - 0.05) {
              continue;
            }
            if (prevY >= platformTop - GROUND_PROBE_EPS && nextY <= platformTop) {
              if (!hit || platformTop > highestFloor) {
                highestFloor = platformTop;
                hit = true;
              }
            }
            continue;
          }

          if (!TileMap.isSolidType(type)) continue;

          // Never snap to solid earth fill buried directly under another slope tile
          if (this.tilemap.isSlope(col, row + 1)) continue;

          const tileTop = row + 1;
          // If footCenterX is actively over an adjacent connected slope, yield trailing-heel / lower seam
          if (activeSlope && col !== activeSlope.col && row === activeSlope.row) {
            const slopeAtTileEdge = activeSlope.col === col - 1
              ? activeSlope.slope.hRight >= 1.0 - EPS
              : (activeSlope.col === col + 1 && activeSlope.slope.hLeft >= 1.0 - EPS);
            if (slopeAtTileEdge && (wasGrounded || prevY < tileTop - GROUND_PROBE_EPS)) {
              continue;
            }
          }

          if (prevY >= tileTop - GROUND_PROBE_EPS && nextY <= tileTop) {
            if (!hit || tileTop > highestFloor) {
              highestFloor = tileTop;
              hit = true;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          } else if (nextY < tileTop && prevY + height > row && prevY >= row + 0.5) {
            if (!hit || tileTop > highestFloor) {
              highestFloor = tileTop;
              hit = true;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          }
        }
      }

      // Check solidBoxes top faces (e.g., WarpAccessTubes)
      for (let i = 0; i < solidBoxes.length; i++) {
        const box = solidBoxes[i];
        if (pos.x + width <= box.x + EPS || pos.x >= box.x + box.width - EPS) continue;
        const boxTop = box.y + box.height;
        if (prevY >= boxTop - 0.05 && nextY <= boxTop) {
          if (!hit || boxTop > highestFloor) {
            highestFloor = boxTop;
            hit = true;
          }
        }
      }

      if (hit) {
        pos.y = highestFloor;
        vel.y = 0;
        result.grounded = true;
        result.groundNormalX = 0;
        result.groundNormalY = 1;
      } else {
        pos.y = nextY;
      }
    } else if (vel.y > 0) {
      const prevTop = prevY + height;
      const nextTop = nextY + height;
      const rowStart = Math.floor(prevTop - EPS);
      const rowEnd = Math.floor(nextTop - EPS);

      let lowestY = nextY;
      let hitRow = Infinity;
      let hit = false;
      let hitWasBox = false;

      for (let row = rowStart; row <= rowEnd; row++) {
        for (let col = left; col <= right; col++) {
          const type = this.tilemap.get(col, row);
          if (!TileMap.isSolidType(type)) continue;

          const tileBottom = row;
          if (prevTop <= tileBottom + GROUND_PROBE_EPS && nextTop > tileBottom) {
            const clampedY = tileBottom - height;
            if (!hit || clampedY < lowestY) {
              lowestY = clampedY;
              hitRow = row;
              hit = true;
              hitWasBox = false;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          } else if (nextTop > tileBottom && prevY < row + 1) {
            const clampedY = tileBottom - height;
            if (!hit || clampedY < lowestY) {
              lowestY = clampedY;
              hitRow = row;
              hit = true;
              hitWasBox = false;
              if (type === tileTypes.HAZARD) result.hazardHit = true;
            }
          }
        }
      }

      // Check solidBoxes undersides (e.g., overhead UP WarpAccessTubes)
      for (let i = 0; i < solidBoxes.length; i++) {
        const box = solidBoxes[i];
        if (pos.x + width <= box.x + EPS || pos.x >= box.x + box.width - EPS) continue;
        if (prevTop <= box.y + 0.08 && nextTop > box.y) {
          const clampedY = box.y - height;
          if (!hit || clampedY < lowestY) {
            lowestY = clampedY;
            hit = true;
            hitWasBox = true;
          }
        }
      }

      if (hit) {
        if (!hitWasBox && this._tryCeilingCornerNudge(pos, prevY, nextY, width, height, hitRow, left, right, result)) {
          return;
        }
        pos.y = lowestY;
        vel.y = MovementProfile.forgiveness.ceilingBonkVy;
        result.ceilingHit = true;

        if (!hitWasBox) {
          // Pick the solid block on hitRow closest to the player's horizontal center
          const centerX = pos.x + width * 0.5;
          let bestCol = null;
          let bestType = tileTypes.EMPTY;
          let bestDist = Infinity;
          for (let col = left; col <= right; col++) {
            const t = this.tilemap.get(col, hitRow);
            if (!TileMap.isSolidType(t)) continue;
            const dist = Math.abs((col + 0.5) - centerX);
            if (
              bestCol === null ||
              (TileMap.isInteractiveBlockType(t) && !TileMap.isInteractiveBlockType(bestType)) ||
              (TileMap.isInteractiveBlockType(t) === TileMap.isInteractiveBlockType(bestType) && dist < bestDist)
            ) {
              bestCol = col;
              bestType = t;
              bestDist = dist;
            }
          }
          if (bestCol !== null) {
            result.ceilingHitTile = { col: bestCol, row: hitRow, type: bestType };
          }
        }
      } else {
        pos.y = nextY;
      }
    } else {
      pos.y = nextY;
    }
  }

  /**
   * Ceiling Corner Correction: If head overlaps ceiling corner by <= 0.25 tiles (16px),
   * nudge player sideways around obstacle without killing upward velocity.
   */
  _tryCeilingCornerNudge(pos, prevY, nextY, width, height, hitRow, left, right, result) {
    const maxNudge = MovementProfile.forgiveness.ceilingCornerNudge;
    if (maxNudge <= 0 || !Number.isFinite(hitRow)) return false;

    let minSolidLeft = Infinity;
    let maxSolidRight = -Infinity;
    let hasHazard = false;

    for (let col = left; col <= right; col++) {
      const type = this.tilemap.get(col, hitRow);
      if (type === tileTypes.HAZARD) {
        hasHazard = true;
      }
      if (TileMap.isSolidType(type)) {
        if (col < minSolidLeft) minSolidLeft = col;
        if (col + 1 > maxSolidRight) maxSolidRight = col + 1;
      }
    }

    if (hasHazard || minSolidLeft === Infinity) return false;

    const leftOverlap = maxSolidRight - pos.x;
    let canNudgeRight = false;
    if (leftOverlap > 0 && leftOverlap <= maxNudge + EPS) {
      const targetX = maxSolidRight;
      if (
        !this.overlapsSolid(targetX, pos.y, width, height) &&
        !this.overlapsSolid(targetX, nextY, width, height)
      ) {
        canNudgeRight = true;
      }
    }

    const rightOverlap = (pos.x + width) - minSolidLeft;
    let canNudgeLeft = false;
    if (rightOverlap > 0 && rightOverlap <= maxNudge + EPS) {
      const targetX = minSolidLeft - width;
      if (
        !this.overlapsSolid(targetX, pos.y, width, height) &&
        !this.overlapsSolid(targetX, nextY, width, height)
      ) {
        canNudgeLeft = true;
      }
    }

    if (!canNudgeRight && !canNudgeLeft) return false;

    const nudgeRight = canNudgeRight && (!canNudgeLeft || leftOverlap <= rightOverlap);
    if (nudgeRight) {
      pos.x = maxSolidRight;
      pos.y = nextY;
      result.cornerCorrected = true;
      result.cornerNudgeDir = 1;
      result.cornerNudgeAmount = leftOverlap;
      result.cornerNudgeX = maxSolidRight;
      result.cornerNudgeY = hitRow;
    } else {
      pos.x = minSolidLeft - width;
      pos.y = nextY;
      result.cornerCorrected = true;
      result.cornerNudgeDir = -1;
      result.cornerNudgeAmount = rightOverlap;
      result.cornerNudgeX = minSolidLeft;
      result.cornerNudgeY = hitRow;
    }

    return true;
  }

  /**
   * Slope surface resolution with anti-tunneling sweep, 0.40t downhill ground adhesion,
   * and smooth slope <-> flat floor seam continuity.
   */
  _resolveSlopes(pos, vel, prevY, width, height, options, result) {
    if (vel.y > 0) return;

    const { wasGrounded = false, wasOnSlope = false, dropThroughFloorY = null } = options;
    const adhesionMax = MovementProfile.slopes.adhesionSnapDistance;
    const footCenterX = pos.x + width * 0.5;
    const col = Math.floor(footCenterX);

    const searchTopRow = Math.floor(Math.max(prevY, pos.y) + 0.55);
    const searchBottomRow = Math.floor(pos.y - adhesionMax - 0.15);

    for (let row = searchTopRow; row >= searchBottomRow; row--) {
      const slope = this.tilemap.getSlopeInfo(col, row);
      if (!slope) continue;

      const u = Math.max(0, Math.min(1, footCenterX - col));
      const surfaceY = row + slope.heightAt(u);

      // Direct contact / uphill ramp / falling interception
      const directHit = pos.y <= surfaceY + GROUND_PROBE_EPS && prevY >= surfaceY - 0.35;
      // Downhill adhesion snap (<= 0.40 tiles/frame when grounded)
      const downhillAdhesion =
        wasGrounded &&
        pos.y > surfaceY + GROUND_PROBE_EPS &&
        pos.y <= surfaceY + adhesionMax + GROUND_PROBE_EPS;

      if (directHit || downhillAdhesion) {
        if (surfaceY > pos.y && this._overlapsSolidOnSlope(pos.x, surfaceY, width, height, col, row, slope)) {
          continue;
        }
        const beforeSnapY = pos.y;
        pos.y = surfaceY;
        vel.y = 0;
        result.grounded = true;
        result.onSlope = true;
        result.slopeAngleDeg = slope.angleDeg;
        result.slopeDerivative = slope.derivative;
        result.groundNormalX = slope.normal[0];
        result.groundNormalY = slope.normal[1];
        result.slopeAdhesion = downhillAdhesion && (beforeSnapY - surfaceY > 1e-4);
        return;
      }
    }

    // Slope -> Flat continuity (only when exiting a slope while grounded, never off normal flat ledges)
    if (!result.grounded && wasGrounded && wasOnSlope && vel.y <= 0) {
      const left = Math.floor(pos.x + EPS);
      const right = Math.floor(pos.x + width - EPS);
      let bestTop = -Infinity;
      let foundDownhill = false;
      let foundUphillCrest = false;

      const minRow = Math.floor(pos.y - adhesionMax - 0.1);
      const maxRow = Math.floor(pos.y + 0.25);

      for (let c = left; c <= right; c++) {
        for (let r = maxRow; r >= minRow; r--) {
          const type = this.tilemap.get(c, r);
          if (TileMap.isSemisolidType(type)) {
            if (dropThroughFloorY !== null && r + 1 >= dropThroughFloorY - 0.05) continue;
          } else if (!TileMap.isSolidType(type)) {
            continue;
          }

          const tileTop = r + 1;
          const dyDown = pos.y - tileTop;
          const dyUp = tileTop - pos.y;

          if (dyDown >= -GROUND_PROBE_EPS && dyDown <= adhesionMax + GROUND_PROBE_EPS) {
            if (tileTop > bestTop) {
              bestTop = tileTop;
              foundDownhill = dyDown > 1e-4;
              foundUphillCrest = false;
            }
          } else if (
            dyUp > 0 &&
            dyUp <= 0.25 + GROUND_PROBE_EPS &&
            TileMap.isSolidType(type) &&
            (this.tilemap.getSlopeInfo(c - 1, r)?.hRight >= 1 - EPS ||
              this.tilemap.getSlopeInfo(c + 1, r)?.hLeft >= 1 - EPS) &&
            !this.overlapsSolid(pos.x, tileTop, width, height)
          ) {
            if (tileTop > bestTop) {
              bestTop = tileTop;
              foundDownhill = false;
              foundUphillCrest = true;
            }
          }
        }
      }

      if (bestTop > -Infinity && (foundDownhill || foundUphillCrest || Math.abs(pos.y - bestTop) <= GROUND_PROBE_EPS)) {
        pos.y = bestTop;
        vel.y = 0;
        result.grounded = true;
        result.groundNormalX = 0;
        result.groundNormalY = 1;
        if (foundDownhill) result.slopeAdhesion = true;
      }
    }
  }

  /**
   * Resolve landing/riding onto moving platforms (one-way & solid) + solid underside bonk.
   */
  _resolveMovingPlatforms(pos, vel, prevY, width, height, platforms, options, result) {
    const { dropThroughFloorY = null, ridingPlatform = null } = options;

    // Solid moving platform underside ceiling bonk when rising
    if (vel.y > 0) {
      const prevTop = prevY + height;
      const curTop = pos.y + height;
      for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (plat.oneWay || plat.solidActive === false || plat === ridingPlatform) continue;
        if (pos.x + width <= plat.pos.x + EPS || pos.x >= plat.pos.x + plat.width - EPS) continue;
        const prevPlatBottom = plat.prevPos?.y ?? plat.pos.y;
        const platBottom = plat.pos.y;
        if (prevTop <= prevPlatBottom + 0.08 && curTop > platBottom) {
          pos.y = platBottom - height;
          vel.y = MovementProfile.forgiveness.ceilingBonkVy;
          result.ceilingHit = true;
        }
      }
      return;
    }

    let bestTop = -Infinity;
    let bestPlatform = null;

    for (let i = 0; i < platforms.length; i++) {
      const plat = platforms[i];
      if (plat.solidActive === false) continue;

      const platLeft = plat.pos.x;
      const platRight = plat.pos.x + plat.width;
      const platTop = plat.pos.y + plat.height;
      const prevPlatTop = (plat.prevPos?.y ?? plat.pos.y) + plat.height;

      // Horizontal footprint overlap
      if (pos.x + width <= platLeft + EPS || pos.x >= platRight - EPS) continue;

      if (plat.oneWay && dropThroughFloorY !== null && platTop >= dropThroughFloorY - 0.05) {
        continue;
      }

      const wasOnThisPlat = ridingPlatform === plat;
      const cameFromAbove = prevY >= prevPlatTop - 0.08;
      const withinTopBand = wasOnThisPlat
        ? (pos.y <= platTop + 0.14 && pos.y >= platTop - 0.42)
        : (cameFromAbove && pos.y <= platTop + GROUND_PROBE_EPS);

      if (withinTopBand && platTop >= pos.y - 0.42) {
        if (!result.grounded || platTop >= pos.y - GROUND_PROBE_EPS) {
          if (platTop > bestTop) {
            bestTop = platTop;
            bestPlatform = plat;
          }
        }
      }
    }

    if (bestPlatform && (!result.grounded || bestTop >= pos.y - GROUND_PROBE_EPS)) {
      pos.y = bestTop;
      vel.y = 0;
      result.grounded = true;
      result.onSlope = false;
      result.slopeAngleDeg = 0;
      result.slopeDerivative = 0;
      result.groundNormalX = 0;
      result.groundNormalY = 1;
      result.ridingPlatform = bestPlatform;
    }
  }

  /**
   * Probe directly beneath feet so resting on flat ground or solidBoxes stays grounded
   * with 0.0000 jitter and exact Y alignment across arbitrary frames.
   */
  _probeGround(pos, vel, width, dropThroughFloorY, result, solidBoxes = []) {
    const left = Math.floor(pos.x + EPS);
    const right = Math.floor(pos.x + width - EPS);
    const probeRow = Math.floor(pos.y - GROUND_PROBE_EPS);

    for (let col = left; col <= right; col++) {
      const type = this.tilemap.get(col, probeRow);
      if (TileMap.isSemisolidType(type)) {
        const tileTop = probeRow + 1;
        if (dropThroughFloorY !== null && tileTop >= dropThroughFloorY - 0.05) {
          continue;
        }
        if (Math.abs(pos.y - tileTop) <= GROUND_PROBE_EPS) {
          pos.y = tileTop;
          vel.y = 0;
          result.grounded = true;
          result.groundNormalX = 0;
          result.groundNormalY = 1;
          return;
        }
      } else if (TileMap.isSolidType(type)) {
        const tileTop = probeRow + 1;
        if (Math.abs(pos.y - tileTop) <= GROUND_PROBE_EPS) {
          pos.y = tileTop;
          vel.y = 0;
          result.grounded = true;
          result.groundNormalX = 0;
          result.groundNormalY = 1;
          if (type === tileTypes.HAZARD) result.hazardHit = true;
          return;
        }
      }
    }

    for (let i = 0; i < solidBoxes.length; i++) {
      const box = solidBoxes[i];
      if (pos.x + width <= box.x + EPS || pos.x >= box.x + box.width - EPS) continue;
      const boxTop = box.y + box.height;
      if (Math.abs(pos.y - boxTop) <= GROUND_PROBE_EPS + 0.005) {
        pos.y = boxTop;
        vel.y = 0;
        result.grounded = true;
        result.groundNormalX = 0;
        result.groundNormalY = 1;
        return;
      }
    }
  }

  /**
   * Determine whether the supporting floor includes a solid tile and/or a one-way semisolid.
   */
  _classifyGroundSupport(pos, width, dropThroughFloorY, result, solidBoxes = []) {
    if (result.onSlope) {
      result.standingOnSolid = true;
      return;
    }

    if (result.ridingPlatform) {
      if (result.ridingPlatform.oneWay) {
        result.standingOnSemisolid = true;
      } else {
        result.standingOnSolid = true;
      }
      return;
    }

    for (let i = 0; i < solidBoxes.length; i++) {
      const box = solidBoxes[i];
      if (pos.x + width <= box.x + EPS || pos.x >= box.x + box.width - EPS) continue;
      if (Math.abs((box.y + box.height) - pos.y) <= 0.03) {
        result.standingOnSolid = true;
      }
    }

    const left = Math.floor(pos.x + EPS);
    const right = Math.floor(pos.x + width - EPS);
    const probeRow = Math.floor(pos.y - 0.02);

    for (let col = left; col <= right; col++) {
      const type = this.tilemap.get(col, probeRow);
      if (Math.abs((probeRow + 1) - pos.y) > 0.03) continue;

      if (TileMap.isSolidType(type)) {
        result.standingOnSolid = true;
      } else if (TileMap.isSemisolidType(type)) {
        if (dropThroughFloorY === null || (probeRow + 1) < dropThroughFloorY - 0.05) {
          result.standingOnSemisolid = true;
        }
      }
    }
  }

  /**
   * Check if a position overlaps any solid tile or solidBox (for ceiling check during uncrouch).
   */
  overlapsSolid(x, y, width, height, solidBoxes = []) {
    const left = Math.floor(x + EPS);
    const right = Math.floor(x + width - EPS);
    const bottom = Math.floor(y + EPS);
    const top = Math.floor(y + height - EPS);

    for (let row = bottom; row <= top; row++) {
      for (let col = left; col <= right; col++) {
        if (this.tilemap.isSolid(col, row)) {
          return true;
        }
      }
    }
    for (let i = 0; i < solidBoxes.length; i++) {
      const b = solidBoxes[i];
      if (
        x + width > b.x + EPS &&
        x < b.x + b.width - EPS &&
        y + height > b.y + EPS &&
        y < b.y + b.height - EPS
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check whether a crouched player has full vertical clearance to stand up.
   */
  hasStandingClearance(x, y, width, standingHeight) {
    return !this.overlapsSolid(x, y, width, standingHeight);
  }

  /**
   * Raycast upward from both top corners of an AABB to measure headroom above feet `y`.
   */
  ceilingClearance(x, y, width, maxDistance = 4) {
    const leftCol = Math.floor(x + EPS);
    const rightCol = Math.floor(x + width - EPS);
    const startRow = Math.floor(y + EPS);
    const endRow = Math.floor(y + maxDistance);

    let minCeilingY = y + maxDistance;
    for (let row = startRow; row <= endRow; row++) {
      for (let col = leftCol; col <= rightCol; col++) {
        if (this.tilemap.isSolid(col, row)) {
          const tileBottom = row;
          if (tileBottom >= y + EPS && tileBottom < minCeilingY) {
            minCeilingY = tileBottom;
          }
        }
      }
    }
    return Math.max(0, minCeilingY - y);
  }

  /**
   * Probe whether a solid wall face is directly adjacent in direction `dir` (-1 left, +1 right).
   */
  hasWallContact(x, y, width, height, dir, probeDist = 0.02) {
    if (dir === 0) return false;
    const probeX = dir < 0 ? x - probeDist : x + width;
    const col = Math.floor(dir < 0 ? probeX : probeX + probeDist - EPS);
    const bottom = Math.floor(y + EPS);
    const top = Math.floor(y + height - EPS);
    for (let row = bottom; row <= top; row++) {
      const type = this.tilemap.get(col, row);
      if (TileMap.isSolidType(type) && type !== tileTypes.HAZARD) {
        return true;
      }
    }
    return false;
  }

  /**
   * Raycast downward from a point to find the ground Y (including slope surfaces).
   */
  raycastDown(x, y, maxDistance = 20) {
    const col = Math.floor(x);
    const startRow = Math.floor(y - EPS);
    const endRow = Math.floor(y - maxDistance);
    const u = Math.max(0, Math.min(1, x - col));

    for (let row = startRow; row >= endRow; row--) {
      const type = this.tilemap.get(col, row);
      if (TileMap.isSolidType(type) || TileMap.isSemisolidType(type)) {
        return row + 1;
      }
      const slope = this.tilemap.getSlopeInfo(col, row);
      if (slope) {
        const surfY = row + slope.heightAt(u);
        if (surfY <= y + EPS) return surfY;
      }
    }
    return null;
  }

  /**
   * Measure minimum vertical ground clearance beneath a full hitbox AABB (including platforms).
   */
  groundClearance(x, y, width, maxDistance = 20, platforms = []) {
    const leftCol = Math.floor(x + EPS);
    const rightCol = Math.floor(x + width - EPS);
    let highestFloorY = null;

    for (let col = leftCol; col <= rightCol; col++) {
      const sampleX = Math.max(x + EPS, Math.min(x + width - EPS, col + 0.5));
      const floorY = this.raycastDown(sampleX, y, maxDistance);
      if (floorY !== null && (highestFloorY === null || floorY > highestFloorY)) {
        highestFloorY = floorY;
      }
    }

    if (platforms && platforms.length > 0) {
      for (let i = 0; i < platforms.length; i++) {
        const plat = platforms[i];
        if (plat.solidActive === false) continue;
        const platTop = plat.pos.y + plat.height;
        if (x + width > plat.pos.x + EPS && x < plat.pos.x + plat.width - EPS && platTop <= y + EPS) {
          if (highestFloorY === null || platTop > highestFloorY) {
            highestFloorY = platTop;
          }
        }
      }
    }

    return highestFloorY === null ? Infinity : Math.max(0, y - highestFloorY);
  }
}

export default CollisionSystem;
