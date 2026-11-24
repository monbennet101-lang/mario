/**
 * TileAtlas — Grassland Tileset Loader, Chroma Keyer & Modular Kit Sprites
 * =========================================================================
 * 1. Loads `/tilesets/Grassland_Tileset.png` (1876×3230 px, 10px #00AAFF border,
 *    Atlas 1 Daytime Y=10..1609, Atlas 2 Twilight Y=1620..3219, 29×25 × 64px tiles).
 * 2. Strips opaque #00AAFF RGB(0, 170, 255) chroma-key pixels to alpha=0 on an
 *    offscreen canvas so corners, slopes & rounded edges never show blue artifacts.
 * 3. Provides exact half-texel-inset UVs per 06_TILESET_TECHNICAL_SPEC.md Section 5.4
 *    and maps every AutotileRole to pixel-audited (row, col) atlas slots.
 * 4. Pre-bakes crisp 64×64 offscreen Nintendo-styled sprites for Question Blocks [?],
 *    Brick Blocks, Hard Blocks, Used Blocks, 2-Tile Warp Pipes, Mushroom Platforms,
 *    4-frame Spinning Coins, and Foreground Foliage Tufts (zero runtime GC).
 */

import MovementProfile from '../../game/config/MovementProfile.js';
import { AutotileRole } from './TileAutotiler.js';

const { tilemap: tileConfig } = MovementProfile;

/**
 * Pixel-verified (row, col) coordinates inside Grassland_Tileset.png (C00..C13 Earth family).
 * Each slot was pixel-audited against Grassland_Tileset.png to guarantee exact slope curves
 * and matching left/right edge RGB transitions.
 */
export const GRASSLAND_ATLAS_SLOTS = {
  [AutotileRole.TOP_GRASS]: [
    { row: 4, col: 0 },
    { row: 12, col: 5 },
    { row: 17, col: 3 },
    { row: 23, col: 3 },
  ],
  [AutotileRole.TOP_LEFT_CORNER]: [{ row: 2, col: 0 }],
  [AutotileRole.TOP_RIGHT_CORNER]: [{ row: 13, col: 6 }],
  [AutotileRole.LEFT_CLIFF]: [{ row: 10, col: 7 }, { row: 20, col: 1 }],
  [AutotileRole.RIGHT_CLIFF]: [{ row: 21, col: 1 }],
  [AutotileRole.BOTTOM_DIRT]: [{ row: 5, col: 3 }, { row: 8, col: 6 }],
  [AutotileRole.BOT_LEFT_CORNER]: [{ row: 12, col: 2 }],
  [AutotileRole.BOT_RIGHT_CORNER]: [{ row: 1, col: 4 }],
  [AutotileRole.INTERIOR_EARTH]: [
    { row: 4, col: 1 },
    { row: 9, col: 4 },
    { row: 13, col: 0 },
    { row: 0, col: 7 },
  ],
  [AutotileRole.ISLAND_SINGLE]: [{ row: 4, col: 0 }],

  // Verified pixel height slopes:
  [AutotileRole.SLOPE_45_UP]: [{ row: 14, col: 0 }],    // 0 -> 64 ascending L->R
  [AutotileRole.SLOPE_45_DOWN]: [{ row: 3, col: 7 }],   // 64 -> 0 descending L->R
  [AutotileRole.SLOPE_26_UP_1]: [{ row: 20, col: 6 }],  // 0 -> 32 ascending low half
  [AutotileRole.SLOPE_26_UP_2]: [{ row: 7, col: 5 }],   // 32 -> 64 ascending high half
  [AutotileRole.SLOPE_26_DOWN_1]: [{ row: 15, col: 2 }],// 64 -> 32 descending high half
  [AutotileRole.SLOPE_26_DOWN_2]: [{ row: 19, col: 5 }],// 32 -> 0 descending low half
};

class TileAtlas {
  constructor() {
    this.loaded = false;
    this.error = null;
    this.useTwilight = false;

    this._keyedAtlasCanvas = null;
    this._preSlicedAtlas = [new Map(), new Map()];
    this._kitSprites = null;

    if (typeof document !== 'undefined') {
      this._bakeProceduralKitSprites();
    }
  }

  /**
   * Compute normalized half-texel-inset UVs per 06_TILESET_TECHNICAL_SPEC.md Section 5.4.
   * Pure math — works in Node headless tests.
   */
  static getTileUV(col, row, atlasIndex = 0) {
    const W = tileConfig.atlasWidth;
    const H = tileConfig.atlasHeight;
    const S = tileConfig.tileSize;
    const x0 = tileConfig.atlasContentX;
    const y0 = atlasIndex === 1 ? tileConfig.atlas2ContentY : tileConfig.atlasContentY;

    return {
      uMin: (x0 + col * S + 0.5) / W,
      uMax: (x0 + (col + 1) * S - 0.5) / W,
      vMin: (y0 + row * S + 0.5) / H,
      vMax: (y0 + (row + 1) * S - 0.5) / H,
    };
  }

  /**
   * Get pixel source rectangle on the master spritesheet with slight sub-pixel inset
   * to eliminate bilinear neighbor bleed.
   */
  static getSourcePixelRect(col, row, atlasIndex = 0) {
    const S = tileConfig.tileSize;
    const x0 = tileConfig.atlasContentX;
    const y0 = atlasIndex === 1 ? tileConfig.atlas2ContentY : tileConfig.atlasContentY;
    return {
      sx: x0 + col * S + 0.25,
      sy: y0 + row * S + 0.25,
      sw: S - 0.5,
      sh: S - 0.5,
    };
  }

  /**
   * Look up (row, col) slot coordinates for a resolved AutotileRole.
   */
  static getSlotForRole(role, variant = 0) {
    const list = GRASSLAND_ATLAS_SLOTS[role];
    if (!list || list.length === 0) return null;
    return list[variant % list.length];
  }

  /**
   * Async load `/tilesets/Grassland_Tileset.png` and strip opaque #00AAFF borders/backgrounds.
   */
  load(
    src = (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? null : '/tilesets/Grassland_Tileset.png',
    onLoaded = null
  ) {
    if (!src || typeof Image === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
    if (this.loaded && this._keyedAtlasCanvas) return Promise.resolve(true);

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || tileConfig.atlasWidth;
          canvas.height = img.naturalHeight || tileConfig.atlasHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          // Key out Spriters Resource opaque #00AAFF chroma background -> alpha 0
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imgData.data;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            if (r < 28 && g >= 145 && g <= 195 && b >= 225) {
              d[i + 3] = 0;
            }
          }
          ctx.putImageData(imgData, 0, 0);

          this._keyedAtlasCanvas = canvas;
          this._sliceVerifiedAtlasTiles(canvas);
          this.loaded = true;
          this.error = null;
          if (onLoaded) onLoaded(this);
          resolve(true);
        } catch (err) {
          this.error = err;
          resolve(false);
        }
      };
      img.onerror = (err) => {
        this.error = err || new Error(`Failed to load ${src}`);
        resolve(false);
      };
      img.src = src;
    });
  }

  _sliceVerifiedAtlasTiles(masterCanvas) {
    const S = tileConfig.tileSize;
    for (const atlasIdx of [0, 1]) {
      const map = this._preSlicedAtlas[atlasIdx];
      map.clear();
      for (const slots of Object.values(GRASSLAND_ATLAS_SLOTS)) {
        for (const slot of slots) {
          const key = `${slot.col},${slot.row}`;
          if (map.has(key)) continue;
          const rect = TileAtlas.getSourcePixelRect(slot.col, slot.row, atlasIdx);
          const tileCanvas = document.createElement('canvas');
          tileCanvas.width = S;
          tileCanvas.height = S;
          const tctx = tileCanvas.getContext('2d');
          tctx.drawImage(masterCanvas, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, S, S);
          map.set(key, tileCanvas);
        }
      }
    }
  }

  getAtlasTileSprite(col, row, atlasIndex = 0) {
    return this._preSlicedAtlas[atlasIndex === 1 ? 1 : 0]?.get(`${col},${row}`) || null;
  }

  get atlasCanvas() {
    return this._keyedAtlasCanvas;
  }

  get kitSprites() {
    return this._kitSprites;
  }

  /**
   * Pre-bake 64×64 offscreen canvases for all Stage 6 modular kit props once at startup.
   */
  _bakeProceduralKitSprites() {
    const makeCanvas = (w = 64, h = 64) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };

    const sprites = {};

    // 1. Question Block [?] (3 animation brightness frames)
    sprites.question = [0, 1, 2].map((frame) => {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      const glow = frame === 1 ? '#FEF08A' : frame === 2 ? '#FDE047' : '#FACC15';
      const mid = frame === 1 ? '#F59E0B' : '#EAB308';

      // Outer beveled casing
      ctx.fillStyle = '#78350F';
      ctx.beginPath();
      ctx.roundRect(0, 0, 64, 64, 7);
      ctx.fill();

      const grad = ctx.createLinearGradient(0, 4, 0, 60);
      grad.addColorStop(0, glow);
      grad.addColorStop(0.65, mid);
      grad.addColorStop(1, '#B45309');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(3, 3, 58, 58, 5);
      ctx.fill();

      // Top-left rim highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(6, 4, 52, 3);

      // 4 Corner rivets
      ctx.fillStyle = '#78350F';
      for (const [rx, ry] of [[8, 8], [52, 8], [8, 52], [52, 52]]) {
        ctx.fillRect(rx, ry, 4, 4);
      }

      // Iconic '?' glyph with crisp drop shadow
      ctx.font = '900 40px "Arial Black", "Impact", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#78350F';
      ctx.fillText('?', 34, 36);
      ctx.fillStyle = '#FFFBEB';
      ctx.fillText('?', 31, 33);
      return c;
    });

    // 2. Brick Block (terracotta masonry)
    {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#451A03';
      ctx.fillRect(0, 0, 64, 64);

      const brickGrad = ctx.createLinearGradient(0, 0, 0, 64);
      brickGrad.addColorStop(0, '#EA580C');
      brickGrad.addColorStop(1, '#9A3412');
      ctx.fillStyle = brickGrad;
      ctx.fillRect(1, 1, 62, 62);

      // Specular bevels on each brick course
      ctx.fillStyle = '#FDBA74';
      ctx.fillRect(2, 2, 28, 3);
      ctx.fillRect(34, 2, 28, 3);
      ctx.fillRect(2, 23, 12, 3);
      ctx.fillRect(18, 23, 28, 3);
      ctx.fillRect(50, 23, 12, 3);
      ctx.fillRect(2, 44, 28, 3);
      ctx.fillRect(34, 44, 28, 3);

      // Dark mortar joints
      ctx.fillStyle = '#431407';
      ctx.fillRect(0, 20, 64, 3);
      ctx.fillRect(0, 41, 64, 3);
      ctx.fillRect(30, 0, 3, 21);
      ctx.fillRect(15, 22, 3, 20);
      ctx.fillRect(46, 22, 3, 20);
      ctx.fillRect(30, 43, 3, 21);
      sprites.brick = c;
    }

    // 3. Hard Block (chiseled carved stone)
    {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#78350F';
      ctx.fillRect(0, 0, 64, 64);

      ctx.fillStyle = '#D97706';
      ctx.fillRect(4, 4, 56, 56);
      ctx.fillStyle = '#FCD34D';
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(64, 0); ctx.lineTo(54, 10); ctx.lineTo(10, 10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(10, 10); ctx.lineTo(10, 54); ctx.lineTo(0, 64);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#92400E';
      ctx.beginPath();
      ctx.moveTo(64, 0); ctx.lineTo(64, 64); ctx.lineTo(54, 54); ctx.lineTo(54, 10);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 64); ctx.lineTo(64, 64); ctx.lineTo(54, 54); ctx.lineTo(10, 54);
      ctx.closePath(); ctx.fill();

      ctx.fillStyle = '#B45309';
      ctx.fillRect(14, 14, 36, 36);
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 2;
      ctx.strokeRect(14, 14, 36, 36);
      sprites.hard = c;
    }

    // 4. Used Block (bronzed spent '?')
    {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#451A03';
      ctx.beginPath();
      ctx.roundRect(0, 0, 64, 64, 6);
      ctx.fill();

      const grad = ctx.createLinearGradient(0, 4, 0, 60);
      grad.addColorStop(0, '#B45309');
      grad.addColorStop(1, '#78350F');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(3, 3, 58, 58, 4);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.fillRect(6, 5, 52, 3);
      ctx.fillStyle = '#451A03';
      for (const [rx, ry] of [[8, 8], [52, 8], [8, 52], [52, 52]]) {
        ctx.fillRect(rx, ry, 4, 4);
      }
      sprites.used = c;
    }

    // 5. Emerald 2-Tile Warp Pipe (cap left/right + body left/right, 128px full width shaded across split)
    const bakePipeHalf = (isCap, isRight) => {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      // Cylindrical gradient across 128px pipe width mapped into left (0..64) or right (64..128)
      const g = ctx.createLinearGradient(isRight ? -64 : 0, 0, isRight ? 64 : 128, 0);
      g.addColorStop(0.0, '#14532D');
      g.addColorStop(0.14, '#22C55E');
      g.addColorStop(0.28, '#BBF7D0');
      g.addColorStop(0.42, '#4ADE80');
      g.addColorStop(0.75, '#16A34A');
      g.addColorStop(0.92, '#15803D');
      g.addColorStop(1.0, '#052E16');

      if (isCap) {
        // Collar rim (full 64px width per half, 50px top + dark shadow groove under lip)
        ctx.fillStyle = '#052E16';
        ctx.fillRect(0, 0, 64, 52);
        ctx.fillStyle = g;
        ctx.fillRect(isRight ? 0 : 2, 2, 62, 46);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(isRight ? 0 : 3, 3, 61, 4);

        // Neck below collar (slightly inset 6px on outer edge)
        const inset = 6;
        ctx.fillStyle = '#052E16';
        ctx.fillRect(isRight ? 0 : inset, 50, 64 - inset, 14);
        ctx.fillStyle = g;
        ctx.fillRect(isRight ? 0 : inset + 2, 52, 64 - inset - 2, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(isRight ? 0 : inset + 2, 50, 64 - inset - 2, 6);
      } else {
        const inset = 6;
        ctx.fillStyle = '#052E16';
        ctx.fillRect(isRight ? 0 : inset, 0, 64 - inset, 64);
        ctx.fillStyle = g;
        ctx.fillRect(isRight ? 0 : inset + 2, 0, 64 - inset - 2, 64);
      }
      return c;
    };
    sprites.pipeCapL = bakePipeHalf(true, false);
    sprites.pipeCapR = bakePipeHalf(true, true);
    sprites.pipeBodyL = bakePipeHalf(false, false);
    sprites.pipeBodyR = bakePipeHalf(false, true);

    // 6. Semisolid Mushroom Platform Caps + Background Stalk
    const bakeMushroomCap = (side) => {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      ctx.save();
      ctx.beginPath();
      if (side === 'left') {
        ctx.roundRect(4, 2, 62, 34, [18, 0, 0, 12]);
      } else if (side === 'right') {
        ctx.roundRect(-2, 2, 62, 34, [0, 18, 12, 0]);
      } else {
        ctx.rect(0, 2, 64, 34);
      }
      ctx.clip();

      const grad = ctx.createLinearGradient(0, 2, 0, 36);
      grad.addColorStop(0, '#FB7185');
      grad.addColorStop(0.5, '#E11D48');
      grad.addColorStop(1, '#9F1239');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 40);

      // Creamy Mario spots
      ctx.fillStyle = '#FFFBEB';
      if (side === 'left') {
        ctx.beginPath(); ctx.arc(24, 18, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(54, 14, 7, 0, Math.PI * 2); ctx.fill();
      } else if (side === 'right') {
        ctx.beginPath(); ctx.arc(38, 18, 9, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(10, 14, 7, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(20, 16, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(48, 22, 7, 0, Math.PI * 2); ctx.fill();
      }

      // Glossy top rim
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillRect(0, 3, 64, 4);
      ctx.restore();

      // Dark bottom rim outline + gill shadow
      ctx.fillStyle = '#FDE68A';
      const xStart = side === 'left' ? 12 : 0;
      const wSpan = side === 'mid' ? 64 : 52;
      ctx.fillRect(xStart, 35, wSpan, 7);
      ctx.fillStyle = '#881337';
      ctx.fillRect(xStart, 35, wSpan, 2);
      return c;
    };
    sprites.mushroomLeft = bakeMushroomCap('left');
    sprites.mushroomMid = bakeMushroomCap('mid');
    sprites.mushroomRight = bakeMushroomCap('right');

    // Mushroom Stem / Stalk
    {
      const c = makeCanvas(64, 64);
      const ctx = c.getContext('2d');
      const stemGrad = ctx.createLinearGradient(16, 0, 48, 0);
      stemGrad.addColorStop(0, '#D6D3D1');
      stemGrad.addColorStop(0.35, '#FFFBEB');
      stemGrad.addColorStop(0.75, '#FDE68A');
      stemGrad.addColorStop(1, '#A8A29E');
      ctx.fillStyle = stemGrad;
      ctx.fillRect(16, 0, 32, 64);
      ctx.fillStyle = 'rgba(120, 53, 15, 0.25)';
      ctx.fillRect(16, 0, 3, 64);
      ctx.fillRect(45, 0, 3, 64);
      sprites.mushroomStalk = c;
    }

    // 7. 4-Frame Rotating Gold Coin Sprite with Shimmer Glint
    const coinWidths = [1.0, 0.65, 0.24, 0.65];
    sprites.coinFrames = coinWidths.map((wScale, idx) => {
      const c = makeCanvas(48, 48);
      const ctx = c.getContext('2d');
      const cx = 24;
      const cy = 24;
      const rx = Math.max(4, 16 * wScale);
      const ry = 19;

      // Outer gold rim
      ctx.fillStyle = '#B45309';
      ctx.beginPath();
      ctx.ellipse(cx + 1.5, cy + 1, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      const coinGrad = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
      coinGrad.addColorStop(0, '#FEF08A');
      coinGrad.addColorStop(0.5, '#FACC15');
      coinGrad.addColorStop(1, '#D97706');
      ctx.fillStyle = coinGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#92400E';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Inner coin slot detail
      if (wScale > 0.35) {
        ctx.fillStyle = '#FEF9C3';
        ctx.fillRect(cx - rx * 0.22, cy - ry * 0.45, Math.max(2, rx * 0.44), ry * 0.9);
        ctx.strokeStyle = '#B45309';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - rx * 0.22, cy - ry * 0.45, Math.max(2, rx * 0.44), ry * 0.9);
      }

      // 4-point shimmer glint on frames 0 & 2
      if (idx === 0 || idx === 2) {
        ctx.fillStyle = '#FFFFFF';
        const gx = idx === 0 ? cx - rx * 0.55 : cx;
        const gy = idx === 0 ? cy - ry * 0.52 : cy - ry * 0.3;
        ctx.fillRect(gx - 1, gy - 4, 2, 8);
        ctx.fillRect(gx - 4, gy - 1, 8, 2);
      }
      return c;
    });

    // 8. Foreground Foliage Tuft Cluster (64×48) for Layer 4 (Z = +15, 1.10x parallax)
    {
      const c = makeCanvas(96, 48);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(24, 34, 18, Math.PI, 0);
      ctx.arc(48, 26, 22, Math.PI, 0);
      ctx.arc(72, 34, 17, Math.PI, 0);
      ctx.lineTo(90, 48);
      ctx.lineTo(6, 48);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4ADE80';
      ctx.beginPath();
      ctx.arc(24, 36, 13, Math.PI, 0);
      ctx.arc(48, 28, 17, Math.PI, 0);
      ctx.arc(72, 36, 12, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      sprites.foliageTuft = c;
    }

    this._kitSprites = sprites;
  }
}

export default TileAtlas;
