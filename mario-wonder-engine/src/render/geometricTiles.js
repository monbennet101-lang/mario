/**
 * geometricTiles.js — Clean Geometric 2D Shape Block Engine (Stage 12)
 * =====================================================================
 * Pure Canvas 2D vector tile & collision-normal renderer decoupled from any
 * external raster sprite sheets or copyrighted tilesets.
 *
 * All tile bounds match the exact 64x64px (1.0t x 1.0t) grid used by the
 * 60 Hz swept AABB + analytical slope kinematic solver.
 */

import MovementProfile from '../game/config/MovementProfile.js';
import TileMap from '../engine/physics/TileMap.js';

const { tileTypes, stage6 } = MovementProfile;

export function getGeometricPalette() {
  return MovementProfile.geometricTiles;
}

/**
 * Draw subtle 8x8px (scaled with ppt/64) grid dots inside solid & slope interiors
 * for crisp spatial distance estimation without visual clutter.
 */
function drawInteriorDots(ctx, x, y, ppt, palette) {
  const step = Math.max(5, ppt * (palette.solidGridDotStepPx / 64));
  const dotSize = Math.max(1, ppt / 48);
  ctx.fillStyle = palette.solidGridDotColor;
  const halfStep = step * 0.5;
  for (let dy = halfStep; dy < ppt - 1; dy += step) {
    for (let dx = halfStep; dx < ppt - 1; dx += step) {
      ctx.fillRect(x + dx, y + dy, dotSize, dotSize);
    }
  }
}

/**
 * Draw a Solid Terrain Block (#252836 Slate fill, 2px #3d4359 inner bevel,
 * 8x8 faint grid dots, and 3px #4e9df5 walkable top surface stripe).
 */
function drawSolidBlock(ctx, tilemap, col, row, x, y, ppt, palette) {
  const scaleFactor = ppt / 64;
  const bevel = Math.max(1.5, palette.solidBevelPx * scaleFactor);
  const topStripe = Math.max(2, palette.solidTopStripePx * scaleFactor);

  // Base Matte Dark Slate fill (tiny 0.5 overlap prevents subpixel hairlines)
  ctx.fillStyle = palette.solidFill;
  ctx.fillRect(x, y, ppt + 0.5, ppt + 0.5);

  // Faint 8x8px distance-estimation grid dots
  drawInteriorDots(ctx, x, y, ppt, palette);

  // Check exposed neighbors for crisp perimeter bevel & walkable top stripe
  const upType = tilemap.get(col, row + 1);
  const downType = tilemap.get(col, row - 1);
  const leftType = tilemap.get(col - 1, row);
  const rightType = tilemap.get(col + 1, row);

  const upOpen = upType !== tileTypes.SOLID && !TileMap.isSlopeType(upType);
  const downOpen = downType !== tileTypes.SOLID && !TileMap.isSlopeType(downType);
  const leftOpen = leftType !== tileTypes.SOLID && !TileMap.isSlopeType(leftType);
  const rightOpen = rightType !== tileTypes.SOLID && !TileMap.isSlopeType(rightType);

  // Subtle internal 1px grid seam so adjacent solid tiles remain countable
  ctx.strokeStyle = palette.solidInteriorGrid;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, ppt - 1, ppt - 1);

  // Crisp 2px inner bevel border (#3d4359) on exposed sides & corners
  ctx.fillStyle = palette.solidBevel;
  if (downOpen) ctx.fillRect(x, y + ppt - bevel, ppt, bevel);
  if (leftOpen) ctx.fillRect(x, y, bevel, ppt);
  if (rightOpen) ctx.fillRect(x + ppt - bevel, y, bevel, ppt);
  if (upOpen) {
    // 2px bevel directly below the 3px top walkable stripe
    ctx.fillRect(x, y + topStripe, ppt, bevel);
    // 3px clean accent stripe (#4e9df5) indicating walkable solid footing
    ctx.fillStyle = palette.solidTopStripe;
    ctx.fillRect(x, y, ppt + 0.5, topStripe);
  }
}

/**
 * Draw a One-Way Semisolid Platform:
 * 12px tall floating slab (#2d3246), vibrant cyan/teal top highlight (#00d2d3),
 * and soft transparency gradient fading downward.
 */
function drawSemisolidBlock(ctx, tilemap, col, row, x, y, ppt, palette) {
  const scaleFactor = ppt / 64;
  const slabH = Math.max(6, palette.semisolidHeightPx * scaleFactor);
  const topLineH = Math.max(2, palette.semisolidTopLinePx * scaleFactor);
  const fadeH = Math.max(6, palette.semisolidFadePx * scaleFactor);

  // Soft downward fade below the 12px slab signaling drop-through affordance
  const fadeGrad = ctx.createLinearGradient(0, y + slabH, 0, y + slabH + fadeH);
  fadeGrad.addColorStop(0, 'rgba(45, 50, 70, 0.42)');
  fadeGrad.addColorStop(1, 'rgba(45, 50, 70, 0.0)');
  ctx.fillStyle = fadeGrad;
  ctx.fillRect(x, y + slabH, ppt + 0.5, fadeH);

  // 12px horizontal floating slab (#2d3246)
  ctx.fillStyle = palette.semisolidFill;
  ctx.fillRect(x, y, ppt + 0.5, slabH);

  // Subtle side caps when leftmost/rightmost tile of platform
  const sameLeft = tilemap.get(col - 1, row) === tilemap.get(col, row);
  const sameRight = tilemap.get(col + 1, row) === tilemap.get(col, row);
  ctx.fillStyle = palette.solidBevel;
  if (!sameLeft) ctx.fillRect(x, y, Math.max(2, 2 * scaleFactor), slabH);
  if (!sameRight) ctx.fillRect(x + ppt - Math.max(2, 2 * scaleFactor), y, Math.max(2, 2 * scaleFactor), slabH);

  // Crisp cyan/teal top highlight line (#00d2d3)
  ctx.fillStyle = palette.semisolidTopLine;
  ctx.fillRect(x, y, ppt + 0.5, topLineH);
}

/**
 * Draw clean legal-neutral geometric support stanchions beneath elevated MUSHROOM_PLATFORM runs.
 */
function drawSemisolidStanchions(ctx, tilemap, startCol, endCol, worldToScreen, ppt, palette) {
  const typeM = tileTypes.MUSHROOM_PLATFORM;
  for (let row = 1; row < tilemap.rows; row++) {
    let col = Math.max(0, startCol - 4);
    const limit = Math.min(tilemap.cols, endCol + 4);
    while (col < limit) {
      if (tilemap.get(col, row) === typeM && tilemap.get(col - 1, row) !== typeM) {
        let runEnd = col;
        while (runEnd + 1 < tilemap.cols && tilemap.get(runEnd + 1, row) === typeM) {
          runEnd++;
        }
        const midX = (col + runEnd + 1) * 0.5;
        const pillarW = Math.max(8, ppt * 0.34);
        for (let r = row - 1; r >= 0; r--) {
          if (TileMap.isSolidType(tilemap.get(Math.floor(midX), r))) break;
          const { x: cx, y: topY } = worldToScreen(midX, r + 1);
          ctx.fillStyle = palette.semisolidStanchionFill;
          ctx.fillRect(cx - pillarW * 0.5, topY, pillarW, ppt + 0.5);
          ctx.fillStyle = palette.semisolidStanchionEdge;
          ctx.fillRect(cx - pillarW * 0.5, topY, 2, ppt + 0.5);
          ctx.fillRect(cx + pillarW * 0.5 - 2, topY, 2, ppt + 0.5);
        }
        col = runEnd + 1;
      } else {
        col++;
      }
    }
  }
}

/**
 * Draw 45° and 26.5° right-angled vector slope wedges:
 * Slate fill (#252836) + clipped 8x8 dots + 2px slanted hypotenuse accent (#4e9df5).
 */
function drawSlopeWedge(ctx, x, y, ppt, hLeftNorm, hRightNorm, palette) {
  const scaleFactor = ppt / 64;
  const yBottom = y + ppt;
  const yLeft = yBottom - hLeftNorm * ppt;
  const yRight = yBottom - hRightNorm * ppt;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, yBottom);
  ctx.lineTo(x, yLeft);
  ctx.lineTo(x + ppt, yRight);
  ctx.lineTo(x + ppt, yBottom);
  ctx.closePath();

  ctx.fillStyle = palette.solidFill;
  ctx.fill();

  // Clip 8x8 dots strictly inside the polygonal slope wedge
  ctx.clip();
  drawInteriorDots(ctx, x, y, ppt, palette);

  // Subtle base bevel inside vertical/bottom edges
  ctx.strokeStyle = palette.solidBevel;
  ctx.lineWidth = Math.max(1.5, palette.solidBevelPx * scaleFactor);
  ctx.beginPath();
  ctx.moveTo(x, yBottom - 0.5);
  ctx.lineTo(x + ppt, yBottom - 0.5);
  ctx.stroke();
  ctx.restore();

  // Slanted hypotenuse surface outlined with 2px accent line (#4e9df5)
  ctx.save();
  ctx.strokeStyle = palette.solidTopStripe;
  ctx.lineWidth = Math.max(2, palette.slopeHypotenusePx * scaleFactor + 0.5);
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(x, yLeft + 0.75);
  ctx.lineTo(x + ppt, yRight + 0.75);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw Interactive Question / Item Block:
 * Vibrant golden amber (#f5a623) square with minimalist center diamond cutout.
 */
function drawQuestionBlock(ctx, x, y, ppt, animTime, palette) {
  const scaleFactor = ppt / 64;
  const bevel = Math.max(1.5, 2 * scaleFactor);
  const cx = x + ppt * 0.5;
  const cy = y + ppt * 0.5;
  const pulse = 0.88 + 0.12 * Math.sin(animTime * 6.0);
  const r = ppt * 0.24 * pulse;

  ctx.fillStyle = palette.questionFill;
  ctx.fillRect(x, y, ppt, ppt);

  // Crisp inner bevel & top rim highlight
  ctx.strokeStyle = palette.questionBevel;
  ctx.lineWidth = bevel;
  ctx.strokeRect(x + bevel * 0.5, y + bevel * 0.5, ppt - bevel, ppt - bevel);

  ctx.fillStyle = palette.questionHighlight;
  ctx.fillRect(x + bevel, y + bevel, ppt - bevel * 2, Math.max(2, 2.5 * scaleFactor));

  // Minimalist diamond cutout in center
  ctx.fillStyle = palette.questionCutout;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();

  // Inner bright center pip
  const innerR = r * 0.36;
  ctx.fillStyle = palette.questionHighlight;
  ctx.beginPath();
  ctx.moveTo(cx, cy - innerR);
  ctx.lineTo(cx + innerR, cy);
  ctx.lineTo(cx, cy + innerR);
  ctx.lineTo(cx - innerR, cy);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw inert dark bronze Spent Block (#795548) after Question Block hit.
 */
function drawUsedBlock(ctx, x, y, ppt, palette) {
  const scaleFactor = ppt / 64;
  const bevel = Math.max(1.5, 2 * scaleFactor);
  const cx = x + ppt * 0.5;
  const cy = y + ppt * 0.5;
  const r = ppt * 0.18;

  ctx.fillStyle = palette.spentFill;
  ctx.fillRect(x, y, ppt, ppt);

  ctx.strokeStyle = palette.spentBevel;
  ctx.lineWidth = bevel;
  ctx.strokeRect(x + bevel * 0.5, y + bevel * 0.5, ppt - bevel, ppt - bevel);

  ctx.fillStyle = palette.spentCutout;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx + r, cy);
  ctx.lineTo(cx, cy + r);
  ctx.lineTo(cx - r, cy);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw Breakable Brick Block:
 * Warm terracotta brick-orange (#c25e36) with 2 horizontal and 1 vertical dividing line.
 */
function drawBrickBlock(ctx, x, y, ppt, palette) {
  const scaleFactor = ppt / 64;
  const bevel = Math.max(1.5, 2 * scaleFactor);
  const lineW = Math.max(1.5, 2 * scaleFactor);

  ctx.fillStyle = palette.brickFill;
  ctx.fillRect(x, y, ppt, ppt);

  // Crisp top highlight & inner bevel
  ctx.fillStyle = palette.brickHighlight;
  ctx.fillRect(x + bevel, y + bevel, ppt - bevel * 2, Math.max(1.5, 2 * scaleFactor));

  // 2 horizontal dividing lines (at 1/3 and 2/3) and 1 vertical dividing line (center)
  ctx.fillStyle = palette.brickLine;
  const h1 = y + ppt / 3;
  const h2 = y + (ppt * 2) / 3;
  const vMid = x + ppt * 0.5;

  ctx.fillRect(x, h1 - lineW * 0.5, ppt, lineW);
  ctx.fillRect(x, h2 - lineW * 0.5, ppt, lineW);
  ctx.fillRect(vMid - lineW * 0.5, y, lineW, ppt);

  // Outer crisp border
  ctx.strokeStyle = palette.brickLine;
  ctx.lineWidth = bevel;
  ctx.strokeRect(x + bevel * 0.5, y + bevel * 0.5, ppt - bevel, ppt - bevel);
}

/**
 * Draw Hard Block (unbreakable reinforced slate block).
 */
function drawHardBlock(ctx, x, y, ppt, palette) {
  const scaleFactor = ppt / 64;
  const bevel = Math.max(1.5, 2 * scaleFactor);

  ctx.fillStyle = palette.hardFill;
  ctx.fillRect(x, y, ppt, ppt);

  ctx.strokeStyle = palette.hardBevel;
  ctx.lineWidth = bevel;
  ctx.strokeRect(x + bevel * 0.5, y + bevel * 0.5, ppt - bevel, ppt - bevel);

  const inset = ppt * 0.22;
  ctx.strokeRect(x + inset, y + inset, ppt - inset * 2, ppt - inset * 2);
}

/**
 * Draw 2-tile Legal-Neutral Geometric Warp Conduit.
 */
function drawPipeTile(ctx, tilemap, col, row, x, y, ppt, palette) {
  const scaleFactor = ppt / 64;
  const bevel = Math.max(1.5, 2 * scaleFactor);
  const isTopCap = tilemap.get(col, row + 1) !== tileTypes.PIPE;
  const isLeftHalf = tilemap.get(col - 1, row) !== tileTypes.PIPE && tilemap.get(col + 1, row) === tileTypes.PIPE;
  const inset = ppt * 0.08;

  if (isTopCap) {
    const capH = ppt * 0.42;
    const bodyX = isLeftHalf ? x + inset : x;
    const bodyW = ppt - inset;

    // Lower neck
    ctx.fillStyle = palette.pipeBody;
    ctx.fillRect(bodyX, y + capH, bodyW, ppt - capH + 0.5);
    ctx.fillStyle = palette.pipeBevel;
    ctx.fillRect(isLeftHalf ? bodyX : bodyX + bodyW - bevel, y + capH, bevel, ppt - capH);

    // Top flange lip
    ctx.fillStyle = palette.solidBevel;
    ctx.fillRect(x, y, ppt + 0.5, capH);
    ctx.fillStyle = palette.pipeAccent;
    ctx.fillRect(x, y, ppt + 0.5, Math.max(3, 4 * scaleFactor));
    ctx.fillStyle = palette.pipeHighlight;
    ctx.fillRect(x, y, ppt + 0.5, Math.max(1.5, 2 * scaleFactor));

    ctx.strokeStyle = palette.pipeBevel;
    ctx.lineWidth = bevel;
    ctx.strokeRect(x + bevel * 0.5, y + bevel * 0.5, ppt - bevel, capH - bevel);
  } else {
    const bodyX = isLeftHalf ? x + inset : x;
    const bodyW = ppt - inset;
    ctx.fillStyle = palette.pipeBody;
    ctx.fillRect(bodyX, y, bodyW, ppt + 0.5);

    ctx.fillStyle = palette.pipeBevel;
    ctx.fillRect(isLeftHalf ? bodyX : bodyX + bodyW - bevel, y, bevel, ppt + 0.5);

    // Center conduit telemetry stripe on left edge of pipe body
    if (isLeftHalf) {
      ctx.fillStyle = 'rgba(16, 185, 129, 0.32)';
      ctx.fillRect(bodyX + bodyW * 0.35, y, Math.max(3, ppt * 0.12), ppt + 0.5);
    }
  }
}

/**
 * Draw Hazard Spikes:
 * High-contrast warning crimson (#ff4757) sharp triangular poly-spikes (3 per 64px tile).
 */
function drawHazardSpikes(ctx, x, y, ppt, palette) {
  const count = palette.spikesPerTile; // 3 spikes per 64px tile
  const spikeW = ppt / count;
  const baseH = Math.max(3, ppt * 0.08);
  const baseY = y + ppt;
  const tipY = y + Math.max(2, ppt * 0.06);

  // Dark warning base bar along tile bottom
  ctx.fillStyle = palette.hazardStroke;
  ctx.fillRect(x, baseY - baseH, ppt, baseH);

  for (let i = 0; i < count; i++) {
    const sx = x + i * spikeW;
    const midX = sx + spikeW * 0.5;
    const ex = sx + spikeW;

    // Main crimson triangle (#ff4757)
    ctx.fillStyle = palette.hazardFill;
    ctx.beginPath();
    ctx.moveTo(sx + 0.5, baseY - baseH * 0.5);
    ctx.lineTo(midX, tipY);
    ctx.lineTo(ex - 0.5, baseY - baseH * 0.5);
    ctx.closePath();
    ctx.fill();

    // Left bevel highlight facet for immediate 3D clarity
    ctx.fillStyle = palette.hazardHighlight;
    ctx.beginPath();
    ctx.moveTo(sx + 1, baseY - baseH * 0.5);
    ctx.lineTo(midX, tipY);
    ctx.lineTo(midX, baseY - baseH * 0.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = palette.hazardStroke;
    ctx.lineWidth = Math.max(1, ppt / 48);
    ctx.beginPath();
    ctx.moveTo(sx + 0.5, baseY - baseH * 0.5);
    ctx.lineTo(midX, tipY);
    ctx.lineTo(ex - 0.5, baseY - baseH * 0.5);
    ctx.stroke();
  }
}

/**
 * Render all visible tilemap blocks using pure geometric 2D vector geometry.
 */
export function drawGeometricTileMap({
  ctx,
  tilemap,
  worldToScreen,
  ppt,
  startCol,
  endCol,
  startRow,
  endRow,
  levelKit = null,
  animTime = 0,
}) {
  const palette = getGeometricPalette();

  // 1. Background Pass: Minimalist geometric support stanchions for elevated canopies
  drawSemisolidStanchions(ctx, tilemap, startCol, endCol, worldToScreen, ppt, palette);

  // 2. Two-Pass Tile Rendering (interiors/blocks first, walkable top surfaces & slopes on top)
  const topPassQueue = [];

  const renderCell = (col, row, type) => {
    const bumpOffset = levelKit ? levelKit.getBumpOffsetY(col, row) : 0;
    const { x, y: baseY } = worldToScreen(col, row + 1);
    const y = baseY - bumpOffset * ppt;

    if (type === tileTypes.SOLID) {
      drawSolidBlock(ctx, tilemap, col, row, x, y, ppt, palette);
    } else if (type === tileTypes.SEMISOLID || type === tileTypes.MUSHROOM_PLATFORM) {
      drawSemisolidBlock(ctx, tilemap, col, row, x, y, ppt, palette);
    } else if (TileMap.isSlopeType(type)) {
      const slope = tilemap.getSlopeInfo(col, row);
      if (slope) {
        drawSlopeWedge(ctx, x, y, ppt, slope.hLeft, slope.hRight, palette);
      }
    } else if (type === tileTypes.QUESTION_BLOCK) {
      drawQuestionBlock(ctx, x, y, ppt, animTime, palette);
    } else if (type === tileTypes.USED_BLOCK) {
      drawUsedBlock(ctx, x, y, ppt, palette);
    } else if (type === tileTypes.BRICK_BLOCK) {
      drawBrickBlock(ctx, x, y, ppt, palette);
    } else if (type === tileTypes.HARD_BLOCK) {
      drawHardBlock(ctx, x, y, ppt, palette);
    } else if (type === tileTypes.PIPE) {
      drawPipeTile(ctx, tilemap, col, row, x, y, ppt, palette);
    } else if (type === tileTypes.HAZARD) {
      drawHazardSpikes(ctx, x, y, ppt, palette);
    }
  };

  for (let row = startRow; row < endRow; row++) {
    for (let col = startCol; col < endCol; col++) {
      const type = tilemap.get(col, row);
      if (type === tileTypes.EMPTY) continue;

      const isTopPass =
        TileMap.isSlopeType(type) ||
        (type === tileTypes.SOLID && tilemap.get(col, row + 1) === tileTypes.EMPTY);

      if (isTopPass) {
        topPassQueue.push({ col, row, type });
      } else {
        renderCell(col, row, type);
      }
    }
  }

  for (let i = 0; i < topPassQueue.length; i++) {
    const item = topPassQueue[i];
    renderCell(item.col, item.row, item.type);
  }
}

/**
 * Render geometric Goal Flagpole (sleek metallic mast, geometric pennant & diamond finial).
 */
export function drawGeometricFlagpole({ ctx, flagpole, worldToScreen, ppt, animTime }) {
  const palette = getGeometricPalette();
  const topPos = worldToScreen(flagpole.x, flagpole.topY);
  const botPos = worldToScreen(flagpole.x, flagpole.baseY);
  const flagPos = worldToScreen(flagpole.x, flagpole.flagY);

  ctx.save();
  const poleW = Math.max(4, ppt * 0.12);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(topPos.x - poleW * 0.5, topPos.y, poleW, botPos.y - topPos.y);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(topPos.x - poleW * 0.25, topPos.y, poleW * 0.4, botPos.y - topPos.y);

  // Geometric pennant banner
  const flagW = ppt * 1.15;
  const flagH = ppt * 0.72;
  const wave = Math.sin(animTime * 6.5) * 2.5;
  ctx.fillStyle = flagpole.reached ? palette.questionFill : palette.pipeAccent;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(flagPos.x, flagPos.y);
  ctx.lineTo(flagPos.x - flagW, flagPos.y + flagH * 0.42 + wave);
  ctx.lineTo(flagPos.x, flagPos.y + flagH);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Geometric finial diamond on top
  const orbR = Math.max(6, ppt * 0.22);
  ctx.fillStyle = palette.questionFill;
  ctx.strokeStyle = palette.questionBevel;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(topPos.x, topPos.y - orbR);
  ctx.lineTo(topPos.x + orbR, topPos.y);
  ctx.lineTo(topPos.x, topPos.y + orbR);
  ctx.lineTo(topPos.x - orbR, topPos.y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/**
 * Render spinning geometric coins and 4 angular tumbling brick debris fragments.
 */
export function drawGeometricCoinsAndDebris({ ctx, levelKit, worldToScreen, ppt, animTime }) {
  const palette = getGeometricPalette();

  const drawGeometricCoin = (cx, cy, size, spinPhase, alpha = 1.0) => {
    const wScale = Math.max(0.24, Math.abs(Math.cos(spinPhase)));
    const rx = size * 0.36 * wScale;
    const ry = size * 0.42;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.coinFill;
    ctx.strokeStyle = palette.coinRim;
    ctx.lineWidth = Math.max(1.5, ppt * 0.035);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (wScale > 0.4) {
      const drx = rx * 0.42;
      const dry = ry * 0.48;
      ctx.fillStyle = palette.coinCutout;
      ctx.beginPath();
      ctx.moveTo(cx, cy - dry);
      ctx.lineTo(cx + drx, cy);
      ctx.lineTo(cx, cy + dry);
      ctx.lineTo(cx - drx, cy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };

  // 1. World Coins
  for (let i = 0; i < levelKit.worldCoins.length; i++) {
    const c = levelKit.worldCoins[i];
    if (c.collected && c.collectAge >= 0.25) continue;
    const bob = c.collected ? c.collectAge * 3.5 : Math.sin(animTime * 4.2 + c.id * 0.8) * 0.06;
    const { x, y } = worldToScreen(c.x, c.y + bob);
    const alpha = c.collected ? Math.max(0, 1 - c.collectAge / 0.25) : 1.0;
    const phase = animTime * 5.2 + c.id * 0.7;
    drawGeometricCoin(x, y, ppt * 0.72, phase, alpha);
  }

  // 2. Question-Block Hopping Coins
  for (let i = 0; i < levelKit.hoppingCoins.length; i++) {
    const hc = levelKit.hoppingCoins[i];
    const p = hc.frame / hc.totalFrames;
    const { x, y } = worldToScreen(hc.x, hc.y);
    const alpha = p > 0.75 ? Math.max(0, 1 - (p - 0.75) / 0.25) : 1.0;
    drawGeometricCoin(x, y, ppt * 0.76, animTime * 14 + hc.frame * 0.4, alpha);
  }

  // 3. 4 Angular Tumbling Brick Debris Fragments (#c25e36)
  if (levelKit.brickDebris.length > 0) {
    const fragR = ppt * 0.22;
    ctx.save();
    for (let i = 0; i < levelKit.brickDebris.length; i++) {
      const d = levelKit.brickDebris[i];
      const { x, y } = worldToScreen(d.x, d.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - (d.life / d.maxLife) * 0.6);
      ctx.translate(x, y);
      ctx.rotate(d.rot);

      // Angular polygonal shard shape
      ctx.fillStyle = palette.brickFill;
      ctx.strokeStyle = palette.brickLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-fragR * 0.9, -fragR * 0.6);
      ctx.lineTo(fragR * 0.85, -fragR * 0.85);
      ctx.lineTo(fragR * 0.95, fragR * 0.65);
      ctx.lineTo(-fragR * 0.55, fragR * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Lit upper bevel facet
      ctx.fillStyle = palette.brickHighlight;
      ctx.beginPath();
      ctx.moveTo(-fragR * 0.8, -fragR * 0.5);
      ctx.lineTo(fragR * 0.75, -fragR * 0.75);
      ctx.lineTo(fragR * 0.2, -fragR * 0.1);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }
}

/**
 * F1 Debug Toggle: Draw raw AABB collision bounds, slope contact surfaces,
 * contact points, and directional normal arrows around the player.
 */
export function drawCollisionDebugOverlay({ ctx, player, tilemap, platforms = [], worldToScreen, ppt }) {
  if (!player || !tilemap) return;
  const palette = getGeometricPalette();

  ctx.save();

  // 1. Nearby tile & slope AABB bounds around player
  const minCol = Math.max(0, Math.floor(player.pos.x - 2));
  const maxCol = Math.min(tilemap.cols - 1, Math.floor(player.pos.x + player.currentWidth + 2));
  const minRow = Math.max(0, Math.floor(player.pos.y - 2));
  const maxRow = Math.min(tilemap.rows - 1, Math.floor(player.pos.y + player.currentHeight + 2));

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const type = tilemap.get(col, row);
      if (type === tileTypes.EMPTY) continue;
      const { x, y } = worldToScreen(col, row + 1);

      if (TileMap.isSlopeType(type)) {
        const slope = tilemap.getSlopeInfo(col, row);
        if (slope) {
          const yBot = y + ppt;
          const yL = yBot - slope.hLeft * ppt;
          const yR = yBot - slope.hRight * ppt;
          ctx.strokeStyle = palette.debugSlopeNormalColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, yBot);
          ctx.lineTo(x, yL);
          ctx.lineTo(x + ppt, yR);
          ctx.lineTo(x + ppt, yBot);
          ctx.closePath();
          ctx.stroke();

          // Draw analytical slope normal at midpoint
          const midScreenX = x + ppt * 0.5;
          const midScreenY = (yL + yR) * 0.5;
          const nLen = ppt * 0.42;
          ctx.strokeStyle = 'rgba(245, 166, 35, 0.72)';
          ctx.beginPath();
          ctx.moveTo(midScreenX, midScreenY);
          ctx.lineTo(midScreenX + slope.normal[0] * nLen, midScreenY - slope.normal[1] * nLen);
          ctx.stroke();
        }
      } else if (TileMap.isSemisolidType(type)) {
        ctx.strokeStyle = palette.semisolidTopLine;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ppt, y);
        ctx.stroke();
      } else if (type === tileTypes.HAZARD) {
        ctx.strokeStyle = palette.debugContactColor;
        ctx.lineWidth = 1.25;
        ctx.strokeRect(x + 0.5, y + 0.5, ppt - 1, ppt - 1);
      } else {
        ctx.strokeStyle = palette.debugTileBoxColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, ppt - 1, ppt - 1);
      }
    }
  }

  // 2. Moving platform AABB bounds
  for (let i = 0; i < platforms.length; i++) {
    const plat = platforms[i];
    const { x, y } = worldToScreen(plat.pos.x, plat.pos.y + plat.height);
    ctx.strokeStyle = palette.semisolidTopLine;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, plat.width * ppt, plat.height * ppt);
  }

  // 3. Raw Player Physics AABB (un-interpolated current tick bounds)
  const { x: px, y: py } = worldToScreen(player.pos.x, player.pos.y + player.currentHeight);
  const pw = player.currentWidth * ppt;
  const ph = player.currentHeight * ppt;
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px, py, pw, ph);

  // 4. Active Collision Contact Points & Outward Normal Arrows
  const contacts = player.debugContacts || [];
  const normalArrowLen = Math.max(22, ppt * 0.55);
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    const { x: cx, y: cy } = worldToScreen(c.x, c.y);
    const tipX = cx + c.nx * normalArrowLen;
    const tipY = cy - c.ny * normalArrowLen; // Y-up world -> Y-down screen
    const arrowColor = c.kind === 'slope' ? palette.debugSlopeNormalColor : palette.debugNormalColor;

    // Normal shaft
    ctx.strokeStyle = arrowColor;
    ctx.fillStyle = arrowColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(tipY - cy, tipX - cx);
    const headLen = 7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - headLen * Math.cos(angle - 0.45), tipY - headLen * Math.sin(angle - 0.45));
    ctx.lineTo(tipX - headLen * Math.cos(angle + 0.45), tipY - headLen * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();

    // Contact point dot
    ctx.fillStyle = palette.debugContactColor;
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Compact normal vector coordinate tag
    const label = `${c.kind} (${c.nx.toFixed(2)},${c.ny.toFixed(2)})`;
    const tx = tipX + (c.nx >= 0 ? 6 : -6);
    const ty = tipY + (c.ny >= 0 ? -8 : 8);
    ctx.textAlign = c.nx < -0.2 ? 'right' : 'left';
    const tw = ctx.measureText(label).width;
    const bgX = c.nx < -0.2 ? tx - tw - 4 : tx - 2;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fillRect(bgX, ty - 7, tw + 6, 14);
    ctx.fillStyle = arrowColor;
    ctx.fillText(label, tx, ty);
  }

  ctx.restore();
}

export default {
  getGeometricPalette,
  drawGeometricTileMap,
  drawGeometricFlagpole,
  drawGeometricCoinsAndDebris,
  drawCollisionDebugOverlay,
};
