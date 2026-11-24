/**
 * AlphaAudit — Pure Alpha Bounding-Box Analyzer, Grid Packer & Manifest Builder
 * ==============================================================================
 * Zero DOM/WebGL dependencies: executes identically in Node.js unit tests and
 * inside the headless Chromium extraction harness.
 */

import { DEFAULT_CUSTOM_TAGS, EXTRACTION_CONFIG } from './CadenceConfig.js';

/**
 * Scan an RGBA pixel buffer (Uint8Array / Uint8ClampedArray) and return exact
 * non-transparent alpha bounds plus border-contact audit flags.
 *
 * Returns bbox in PIL-compatible half-open convention:
 *   [minX, minY, maxXExclusive, maxYExclusive]
 * so zero-crop assertion is:
 *   bbox[0] > 0 && bbox[1] > 0 && bbox[2] < width && bbox[3] < height
 */
export function analyzeAlphaBounds(rgba, width, height, alphaThreshold = EXTRACTION_CONFIG.alphaThreshold) {
  if (!rgba || rgba.length < width * height * 4) {
    throw new Error(`Invalid RGBA buffer length (${rgba?.length}) for ${width}x${height}`);
  }

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let pixelCount = 0;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x++) {
      const alpha = rgba[rowOffset + x * 4 + 3];
      if (alpha > alphaThreshold) {
        pixelCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (pixelCount === 0) {
    return {
      empty: true,
      pixelCount: 0,
      bbox: [0, 0, 0, 0],
      width: 0,
      height: 0,
      margins: { left: width, top: height, right: width, bottom: height },
      minMarginPx: 0,
      touchesBorder: true,
      borderEdges: ['empty'],
    };
  }

  const maxXExcl = maxX + 1;
  const maxYExcl = maxY + 1;
  const left = minX;
  const top = minY;
  const right = width - maxXExcl;
  const bottom = height - maxYExcl;

  const borderEdges = [];
  if (minX <= 0) borderEdges.push('left');
  if (minY <= 0) borderEdges.push('top');
  if (maxXExcl >= width) borderEdges.push('right');
  if (maxYExcl >= height) borderEdges.push('bottom');

  return {
    empty: false,
    pixelCount,
    bbox: [minX, minY, maxXExcl, maxYExcl],
    width: maxXExcl - minX,
    height: maxYExcl - minY,
    margins: { left, top, right, bottom },
    minMarginPx: Math.min(left, top, right, bottom),
    touchesBorder: borderEdges.length > 0,
    borderEdges,
  };
}

/**
 * Aggregate crop & margin audit across all rendered frames.
 */
export function auditFrames(frameAudits, frameSize = EXTRACTION_CONFIG.frameSize, minSafeMarginPx = 1) {
  const croppedFrames = [];
  const tightMarginFrames = [];
  const emptyFrames = [];

  let globalMinX = frameSize;
  let globalMinY = frameSize;
  let globalMaxX = 0;
  let globalMaxY = 0;
  let minMarginPx = frameSize;

  for (const item of frameAudits) {
    const a = item.audit;
    if (a.empty) {
      emptyFrames.push(item.key);
      croppedFrames.push({ key: item.key, bbox: a.bbox, edges: a.borderEdges });
      minMarginPx = 0;
      continue;
    }

    const [x0, y0, x1, y1] = a.bbox;
    if (x0 < globalMinX) globalMinX = x0;
    if (y0 < globalMinY) globalMinY = y0;
    if (x1 > globalMaxX) globalMaxX = x1;
    if (y1 > globalMaxY) globalMaxY = y1;
    if (a.minMarginPx < minMarginPx) minMarginPx = a.minMarginPx;

    const strictClean = x0 > 0 && y0 > 0 && x1 < frameSize && y1 < frameSize;
    if (!strictClean || a.touchesBorder) {
      croppedFrames.push({ key: item.key, bbox: a.bbox, edges: a.borderEdges });
    } else if (a.minMarginPx < minSafeMarginPx) {
      tightMarginFrames.push({ key: item.key, bbox: a.bbox, minMarginPx: a.minMarginPx });
    }
  }

  return {
    totalFrames: frameAudits.length,
    passed: croppedFrames.length === 0 && emptyFrames.length === 0 && frameAudits.length > 0,
    meetsSafeMargin: croppedFrames.length === 0 && tightMarginFrames.length === 0 && emptyFrames.length === 0,
    croppedCount: croppedFrames.length,
    emptyCount: emptyFrames.length,
    tightMarginCount: tightMarginFrames.length,
    croppedFrames,
    tightMarginFrames,
    emptyFrames,
    minMarginPx: frameAudits.length > 0 ? minMarginPx : 0,
    globalBBox: frameAudits.length > 0 ? [globalMinX, globalMinY, globalMaxX, globalMaxY] : [0, 0, 0, 0],
    maxCoverageRatio:
      frameAudits.length > 0
        ? Number((Math.max(globalMaxX - globalMinX, globalMaxY - globalMinY) / frameSize).toFixed(4))
        : 0,
  };
}

/**
 * Compute an expanded orthographic view scale whenever any frame touches
 * a border or falls below the desired safety margin.
 */
export function computeAutoExpandedOrthoScale(
  currentScale,
  auditSummary,
  frameSize = EXTRACTION_CONFIG.frameSize,
  expandFactor = EXTRACTION_CONFIG.camera.autoExpandFactor
) {
  if (!auditSummary || (auditSummary.passed && auditSummary.meetsSafeMargin)) {
    return currentScale;
  }
  const requiredRatio = Math.max(expandFactor, 1.0 + (EXTRACTION_CONFIG.camera.minSafeMarginPx * 2) / frameSize);
  return Number((currentScale * requiredRatio).toFixed(3));
}

/**
 * Compute near-square grid packing dimensions for N square frames.
 */
export function computeAtlasGrid(frameCount, frameSize = EXTRACTION_CONFIG.frameSize) {
  if (frameCount <= 0) {
    throw new Error(`frameCount must be positive, received ${frameCount}`);
  }
  const cols = Math.ceil(Math.sqrt(frameCount));
  const rows = Math.ceil(frameCount / cols);
  const atlasWidth = cols * frameSize;
  const atlasHeight = rows * frameSize;
  const totalSlots = cols * rows;

  return {
    cols,
    rows,
    frameSize,
    atlasWidth,
    atlasHeight,
    totalSlots,
    unusedSlots: totalSlots - frameCount,
    utilization: Number((frameCount / totalSlots).toFixed(4)),
  };
}

/**
 * Resolve custom / repurposed animation tags against the extracted animation dictionary.
 */
export function resolveCustomTags(animationFrameKeys, customTagDefs = DEFAULT_CUSTOM_TAGS) {
  const resolved = {};
  if (!customTagDefs || typeof customTagDefs !== 'object') return resolved;

  for (const [tagName, def] of Object.entries(customTagDefs)) {
    if (!def || !def.sourceAnimation) continue;
    const sourceKeys = animationFrameKeys[def.sourceAnimation];
    if (!Array.isArray(sourceKeys) || sourceKeys.length === 0) continue;

    let selected;
    if (Array.isArray(def.frameIndices) && def.frameIndices.length > 0) {
      selected = def.frameIndices
        .map((idx) => sourceKeys[Math.max(0, Math.min(sourceKeys.length - 1, idx))])
        .filter(Boolean);
    } else {
      selected = sourceKeys.slice();
    }

    resolved[tagName] = {
      sourceAnimation: def.sourceAnimation,
      frames: selected,
      frameCount: selected.length,
      fps: def.fps ?? 18,
      loop: Boolean(def.loop),
      repurposed: true,
    };
  }

  return resolved;
}

/**
 * Build the complete character_atlas.json manifest.
 */
export function buildAtlasManifest({
  specs,
  frameRecords,
  grid,
  frameSize = EXTRACTION_CONFIG.frameSize,
  footAnchor = EXTRACTION_CONFIG.footAnchor,
  survey,
  auditSummary,
  orthoScale,
  cameraCenter,
  toolInfo,
  customTagDefs = DEFAULT_CUSTOM_TAGS,
  groundFootAnchorMeasured = null,
}) {
  const frames = {};
  const animationFrameKeys = {};

  for (const rec of frameRecords) {
    const col = rec.atlasIndex % grid.cols;
    const row = Math.floor(rec.atlasIndex / grid.cols);
    const x = col * frameSize;
    const y = row * frameSize;

    frames[rec.key] = {
      x,
      y,
      w: frameSize,
      h: frameSize,
      uv: {
        u0: Number((x / grid.atlasWidth).toFixed(6)),
        v0: Number((y / grid.atlasHeight).toFixed(6)),
        u1: Number(((x + frameSize) / grid.atlasWidth).toFixed(6)),
        v1: Number(((y + frameSize) / grid.atlasHeight).toFixed(6)),
      },
      anchor: { x: footAnchor.x, y: footAnchor.y },
      sourceClip: rec.sourceClip,
      tick: rec.tick,
      yawOffsetDeg: rec.yawOffsetDeg || 0,
      pitchDeg: rec.pitchDeg || 0,
      alphaBBox: rec.audit.bbox,
      margins: rec.audit.margins,
    };

    if (!animationFrameKeys[rec.animation]) {
      animationFrameKeys[rec.animation] = [];
    }
    animationFrameKeys[rec.animation].push(rec.key);
  }

  const animations = {};
  const animationMeta = {};
  for (const spec of specs) {
    const keys = animationFrameKeys[spec.name] || [];
    animations[spec.name] = keys;
    animationMeta[spec.name] = {
      sourceClip: spec.sourceClip,
      category: spec.category,
      frameCount: keys.length,
      fps: spec.fps,
      loop: spec.loop,
      cadence: spec.cadenceDescription,
      frames: keys,
    };
  }

  const customTags = resolveCustomTags(animationFrameKeys, customTagDefs);
  for (const [tagName, tagInfo] of Object.entries(customTags)) {
    if (!animations[tagName]) {
      animations[tagName] = tagInfo.frames;
      animationMeta[tagName] = {
        sourceClip: tagInfo.sourceAnimation,
        category: 'custom_tag',
        frameCount: tagInfo.frameCount,
        fps: tagInfo.fps,
        loop: tagInfo.loop,
        repurposed: true,
        frames: tagInfo.frames,
      };
    }
  }

  return {
    meta: {
      schemaVersion: '1.0.0',
      image: 'character_atlas.png',
      format: 'RGBA8888',
      size: { w: grid.atlasWidth, h: grid.atlasHeight },
      cellSize: { w: frameSize, h: frameSize },
      grid: { cols: grid.cols, rows: grid.rows, utilization: grid.utilization },
      totalFrames: frameRecords.length,
      animationCount: specs.length,
      customTagCount: Object.keys(customTags).length,
      footAnchor: { x: footAnchor.x, y: footAnchor.y },
      groundFootAnchorMeasured,
      orthoScale,
      cameraCenter,
      boundingBoxSurvey: survey,
      audit: {
        passed: auditSummary.passed,
        croppedCount: auditSummary.croppedCount,
        minMarginPx: auditSummary.minMarginPx,
        globalBBox: auditSummary.globalBBox,
        maxCoverageRatio: auditSummary.maxCoverageRatio,
      },
      extractionTool: toolInfo,
    },
    animations,
    animationMeta,
    customTags,
    frames,
  };
}
