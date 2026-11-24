/**
 * EnemySpriteMatrix — Original Enemy Gallery 1 Sprite Action Matrix & Baker
 * ==========================================================================
 * Explicit AI Sprite Generator specification & high-craft 2x pre-baked
 * offscreen canvas sprite sheets for:
 *   - Archetype A: "The Sproutling" (Patrol Walker)
 *       * Walk (4 frames, looping, 40×44px)
 *       * Squash (2 frames, 56×14px)
 *       * Launch Death (1 frame inverted, 40×44px)
 *   - Archetype B: "The Hoplite" (Clockwork Beetle / Recoil Projectile)
 *       * Walk (4 frames, looping, 44×44px)
 *       * Retract (2 frames, 44×44px -> 40×36px)
 *       * Shell Idle (1 frame, 40×36px)
 *       * Shell Spin Rolling (4 frames, fast loop, 40×36px)
 *       * Wakeup Shake (2 frames, 40×36px, ±2px lateral jitter)
 */

export const ENEMY_SPRITE_MATRIX = {
  sproutling: {
    id: 'sproutling',
    name: 'The Sproutling',
    archetype: 'Patrol Walker',
    lore: 'A bulbous, two-legged moss-covered bulb with wide expressive eyes and an inquisitive stem sprout.',
    palette: {
      mossDark: '#1E4D2B',
      mossMid: '#3C8C42',
      mossBright: '#78C850',
      mossHighlight: '#B8EC7A',
      bellyWarm: '#DCE8A8',
      footEarth: '#5C3A21',
      footHighlight: '#8B5A33',
      outline: '#162818',
      eyeWhite: '#FFFDF5',
      irisAmber: '#D97706',
      pupilDark: '#121826',
    },
    actions: {
      walk: {
        name: 'Walk',
        frames: 4,
        loop: true,
        fps: 8,
        frameWidth: 40,
        frameHeight: 44,
        sheetWidth: 160,
        sheetHeight: 44,
        prompt:
          '2D hand-painted platformer sprite sheet, 4 horizontal frames (160x44px, 40x44px per frame), side-3/4 view facing right, transparent background, crisp dark moss-ink outlines: bulbous moss-covered forest bulb creature with two stubby earthy feet, huge curious gleaming eyes, and a bouncing twin-leaf sprout on top; frames 1-4 cycle lively waddling stride with alternating foot lifts and springy leaf bob.',
      },
      squash: {
        name: 'Squash',
        frames: 2,
        loop: false,
        fps: 10,
        frameWidth: 56,
        frameHeight: 14,
        sheetWidth: 112,
        sheetHeight: 14,
        prompt:
          '2D platformer sprite sheet, 2 horizontal frames (112x14px, 56x14px per frame), transparent background: moss bulb creature flattened horizontally into a wide mossy pancake, eyes squeezed wide in comedic surprise, twin sprout leaves splayed outward; frame 1 impact squash peak, frame 2 settled flat compression.',
      },
      launch_death: {
        name: 'Launch Death',
        frames: 1,
        loop: false,
        fps: 1,
        inverted: true,
        frameWidth: 40,
        frameHeight: 44,
        sheetWidth: 40,
        sheetHeight: 44,
        prompt:
          '2D platformer sprite, single frame (40x44px), vertically inverted tumble pose, transparent background: startled moss bulb flipped upside-down with spiraled dizzy eyes, splayed stubby feet kicking upward, and drooping stem sprout.',
      },
    },
  },
  hoplite: {
    id: 'hoplite',
    name: 'The Hoplite',
    archetype: 'Armored Shell / Recoil Projectile',
    lore: 'A stout, spherical clockwork beetle with a segmented bronze carapace and retractable brass legs.',
    palette: {
      bronzeDark: '#4A2C12',
      bronzeMid: '#8C5423',
      bronzeBright: '#C9833C',
      bronzeSheen: '#F6C87A',
      brassMid: '#D4A12A',
      brassBright: '#FDE073',
      patinaAccent: '#2DD4BF',
      visorGlow: '#F59E0B',
      visorHot: '#FEF08A',
      chassisDark: '#231C18',
      outline: '#1A120B',
    },
    actions: {
      walk: {
        name: 'Walk',
        frames: 4,
        loop: true,
        fps: 7,
        frameWidth: 44,
        frameHeight: 44,
        sheetWidth: 176,
        sheetHeight: 44,
        prompt:
          '2D hand-painted platformer sprite sheet, 4 horizontal frames (176x44px, 44x44px per frame), side-3/4 view facing right, transparent background: stout spherical clockwork beetle with segmented riveted bronze carapace, patina turquoise seam trim, glowing amber optic slit, and articulated retractable brass tripod legs marching in crisp 4-frame mechanical stride.',
      },
      retract: {
        name: 'Retract',
        frames: 2,
        loop: false,
        fps: 15,
        frameWidth: 40,
        frameHeight: 36,
        sheetWidth: 80,
        sheetHeight: 36,
        prompt:
          '2D platformer sprite sheet, 2 horizontal frames (80x36px, 40x36px per frame), transparent background: clockwork bronze beetle folding brass legs inward into recessed lower ports; frame 1 half-tucked legs and closing carapace shutter, frame 2 fully sealed bronze dome.',
      },
      shell_idle: {
        name: 'Shell Idle',
        frames: 1,
        loop: false,
        fps: 1,
        frameWidth: 40,
        frameHeight: 36,
        sheetWidth: 40,
        sheetHeight: 36,
        prompt:
          '2D platformer sprite, single frame (40x36px), transparent background: stationary spherical segmented bronze carapace shell with brass rivets, turquoise patina band, and specular highlight dome; legs fully retracted.',
      },
      shell_spin: {
        name: 'Shell Spin Rolling',
        frames: 4,
        loop: true,
        fps: 20,
        frameWidth: 40,
        frameHeight: 36,
        sheetWidth: 160,
        sheetHeight: 36,
        prompt:
          '2D platformer sprite sheet, 4 horizontal frames (160x36px, 40x36px per frame), fast rolling loop, transparent background: high-velocity spinning bronze clockwork carapace shell with shifting segmented plate bands, rotating brass rivets, and dynamic golden kinetic spin streaks.',
      },
      wakeup_shake: {
        name: 'Wakeup Shake',
        frames: 2,
        loop: true,
        fps: 15,
        frameWidth: 40,
        frameHeight: 36,
        sheetWidth: 80,
        sheetHeight: 36,
        shakePx: 2,
        prompt:
          '2D platformer sprite sheet, 2 horizontal frames (80x36px, 40x36px per frame), transparent background: bronze clockwork shell rattling laterally with glowing amber eye slit peeking open and brass leg tips emerging from ventral sockets.',
      },
    },
  },
};

const SPRITE_SCALE = 2; // Pre-bake at 2x resolution for crisp rendering at high DPI

function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w * SPRITE_SCALE;
  c.height = h * SPRITE_SCALE;
  return c;
}

/**
 * Draw one frame of The Sproutling (40×44 logical px for walk/launch_death, 56×14 for squash).
 */
function drawSproutlingFrame(ctx, action, frameIdx) {
  const pal = ENEMY_SPRITE_MATRIX.sproutling.palette;
  ctx.save();
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (action === 'squash') {
    // 56 × 14 logical px
    const w = 56;
    const h = 14;
    const widen = frameIdx === 0 ? 1.0 : 0.96;
    const padX = (w * (1 - widen)) * 0.5;

    // Splayed stubby feet peeking at outer rims
    ctx.fillStyle = pal.footEarth;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(padX + 7, h - 2.5, 5.5, 2.2, 0, 0, Math.PI * 2);
    ctx.ellipse(w - padX - 7, h - 2.5, 5.5, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Flattened moss bulb body
    const bodyGrad = ctx.createLinearGradient(0, 2, 0, h - 1);
    bodyGrad.addColorStop(0, pal.mossBright);
    bodyGrad.addColorStop(0.55, pal.mossMid);
    bodyGrad.addColorStop(1, pal.mossDark);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.roundRect(padX + 2, 3.5, w - padX * 2 - 4, h - 4.8, 5.5);
    ctx.fill();
    ctx.stroke();

    // Splayed stem sprout pressed sideways on top
    ctx.strokeStyle = pal.mossDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(28, 4.2);
    ctx.quadraticCurveTo(32, 1.5, 38, 2.4);
    ctx.stroke();
    ctx.fillStyle = pal.mossHighlight;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(21, 2.8, 5.2, 1.9, -0.18, 0, Math.PI * 2);
    ctx.ellipse(38, 2.5, 5.4, 1.9, 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Comedic wide-eyed squeezed pupils
    ctx.fillStyle = pal.eyeWhite;
    ctx.beginPath();
    ctx.ellipse(21, 8.6, 4.2, 2.6, 0, 0, Math.PI * 2);
    ctx.ellipse(35, 8.6, 4.2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = pal.pupilDark;
    ctx.lineWidth = 1.6;
    if (frameIdx === 0) {
      // > < squint on frame 0
      ctx.beginPath();
      ctx.moveTo(19, 7.6);
      ctx.lineTo(22.5, 8.6);
      ctx.lineTo(19, 9.6);
      ctx.moveTo(37, 7.6);
      ctx.lineTo(33.5, 8.6);
      ctx.lineTo(37, 9.6);
      ctx.stroke();
    } else {
      // Wide dizzy dots on frame 1
      ctx.fillStyle = pal.pupilDark;
      ctx.beginPath();
      ctx.arc(21.4, 8.6, 1.5, 0, Math.PI * 2);
      ctx.arc(34.6, 8.6, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    return;
  }

  // Walk (4 frames) or Launch Death (1 frame, inverted) — 40 × 44 logical px
  const isDeath = action === 'launch_death';
  if (isDeath) {
    ctx.translate(20, 22);
    ctx.scale(1, -1);
    ctx.translate(-20, -22);
  }

  // Stride cycle offsets across 4 walk frames
  const stridePhase = [0, 1, 0, -1][frameIdx % 4];
  const bobY = isDeath ? 0 : [0, -2.0, 0, -1.6][frameIdx % 4];
  const sproutTilt = isDeath ? 0.35 : [0.08, -0.14, -0.06, 0.16][frameIdx % 4];

  const leftFootX = 14 + (isDeath ? -3 : stridePhase * 4.2);
  const rightFootX = 26 - (isDeath ? -3 : stridePhase * 4.2);
  const leftFootY = 40.5 - (isDeath ? 3.5 : Math.max(0, stridePhase) * 3.0);
  const rightFootY = 40.5 - (isDeath ? 2.0 : Math.max(0, -stridePhase) * 3.0);

  // Back foot
  ctx.fillStyle = pal.footEarth;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(leftFootX, leftFootY, 5.2, 3.3, isDeath ? -0.35 : 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Stem sprout on crown
  ctx.save();
  ctx.translate(20, 12.5 + bobY);
  ctx.rotate(sproutTilt);
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(0, 1);
  ctx.quadraticCurveTo(1.5, -5.5, 0.5, -9.5);
  ctx.stroke();
  ctx.strokeStyle = pal.mossBright;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Twin inquisitive leaves
  ctx.fillStyle = pal.mossBright;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.ellipse(-4.6, -8.8, 5.2, 2.7, -0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = pal.mossHighlight;
  ctx.beginPath();
  ctx.ellipse(5.2, -9.6, 5.6, 2.8, 0.36, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Bulbous moss-covered body
  const bodyGrad = ctx.createRadialGradient(16, 17 + bobY, 3, 20, 26 + bobY, 17);
  bodyGrad.addColorStop(0, pal.mossHighlight);
  bodyGrad.addColorStop(0.35, pal.mossBright);
  bodyGrad.addColorStop(0.78, pal.mossMid);
  bodyGrad.addColorStop(1, pal.mossDark);
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(6.5, 31 + bobY);
  ctx.bezierCurveTo(4.5, 19 + bobY, 11, 11 + bobY, 20, 11 + bobY);
  ctx.bezierCurveTo(29.5, 11 + bobY, 35.5, 19 + bobY, 33.5, 31 + bobY);
  ctx.bezierCurveTo(32, 37.5 + bobY, 26.5, 38.5 + bobY, 20, 38.5 + bobY);
  ctx.bezierCurveTo(13.5, 38.5 + bobY, 8, 37.5 + bobY, 6.5, 31 + bobY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Soft pale belly patch & moss tuft texture dots
  ctx.fillStyle = pal.bellyWarm;
  ctx.beginPath();
  ctx.ellipse(22.5, 33.2 + bobY, 7.2, 4.0, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = pal.mossDark;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(10.5, 22 + bobY, 2.0, 0, Math.PI * 2);
  ctx.arc(13.2, 16.5 + bobY, 1.5, 0, Math.PI * 2);
  ctx.arc(28.5, 16.2 + bobY, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Front foot
  ctx.fillStyle = pal.footHighlight;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(rightFootX, rightFootY, 5.4, 3.4, isDeath ? 0.35 : 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Wide expressive eyes (3/4 shifted right to show forward gaze)
  const eyeY = 24.0 + bobY;
  ctx.fillStyle = pal.eyeWhite;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(17.0, eyeY, 4.4, 5.4, 0, 0, Math.PI * 2);
  ctx.ellipse(26.8, eyeY, 4.2, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (isDeath) {
    // Dizzy X eyes on inverted launch death
    ctx.strokeStyle = pal.pupilDark;
    ctx.lineWidth = 1.6;
    for (const ex of [17.0, 26.8]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.2, eyeY - 2.2);
      ctx.lineTo(ex + 2.2, eyeY + 2.2);
      ctx.moveTo(ex + 2.2, eyeY - 2.2);
      ctx.lineTo(ex - 2.2, eyeY + 2.2);
      ctx.stroke();
    }
  } else {
    // Warm amber iris + gleaming dark pupil + white catchlight
    for (const ex of [18.1, 27.9]) {
      ctx.fillStyle = pal.irisAmber;
      ctx.beginPath();
      ctx.arc(ex, eyeY + 0.3, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.pupilDark;
      ctx.beginPath();
      ctx.arc(ex + 0.4, eyeY + 0.2, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ex - 0.6, eyeY - 1.2, 0.95, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Draw one frame of The Hoplite (44×44 logical px for walk, 40×36 for shell states).
 */
function drawHopliteFrame(ctx, action, frameIdx) {
  const pal = ENEMY_SPRITE_MATRIX.hoplite.palette;
  ctx.save();
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  if (action === 'walk') {
    // 44 × 44 logical px
    const stride = [0, 1, 0, -1][frameIdx % 4];
    const bobY = [0, -1.2, 0, -1.0][frameIdx % 4];

    // Retractable brass mechanical legs (back pair + front pair)
    const drawLeg = (hipX, footX, lift, bright) => {
      const hipY = 30 + bobY;
      const kneeX = (hipX + footX) * 0.5 + (footX >= hipX ? 2 : -2);
      const kneeY = 35.5 + bobY - lift * 0.6;
      const footY = 41.5 - lift;

      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();

      ctx.strokeStyle = bright ? pal.brassBright : pal.brassMid;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Brass foot pad & knee rivet
      ctx.fillStyle = pal.brassMid;
      ctx.strokeStyle = pal.outline;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(kneeX, kneeY, 1.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = bright ? pal.brassBright : pal.bronzeBright;
      ctx.beginPath();
      ctx.roundRect(footX - 3.6, footY - 1.8, 7.2, 3.2, 1.5);
      ctx.fill();
      ctx.stroke();
    };

    // Back legs
    drawLeg(14, 11 - stride * 3.5, Math.max(0, -stride) * 2.8, false);
    drawLeg(30, 32 + stride * 3.5, Math.max(0, stride) * 2.8, false);

    // Dark mechanical underbelly chassis
    ctx.fillStyle = pal.chassisDark;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(22, 29.5 + bobY, 16.5, 8.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spherical segmented bronze carapace dome
    const domeGrad = ctx.createRadialGradient(16, 12 + bobY, 3, 22, 21 + bobY, 19);
    domeGrad.addColorStop(0, pal.bronzeSheen);
    domeGrad.addColorStop(0.35, pal.bronzeBright);
    domeGrad.addColorStop(0.75, pal.bronzeMid);
    domeGrad.addColorStop(1, pal.bronzeDark);
    ctx.fillStyle = domeGrad;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.arc(22, 24.5 + bobY, 18.2, Math.PI, Math.PI * 2);
    ctx.lineTo(40.2, 29.0 + bobY);
    ctx.quadraticCurveTo(22, 33.2 + bobY, 3.8, 29.0 + bobY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Segmented carapace rib bands
    ctx.strokeStyle = pal.bronzeDark;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, 7.8 + bobY);
    ctx.quadraticCurveTo(13, 18 + bobY, 12.5, 28.5 + bobY);
    ctx.moveTo(27, 7.2 + bobY);
    ctx.quadraticCurveTo(29.5, 18 + bobY, 30.2, 28.5 + bobY);
    ctx.stroke();

    // Patina turquoise equatorial trim rim
    ctx.fillStyle = pal.patinaAccent;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(3.6, 25.5 + bobY, 36.8, 3.8, 1.8);
    ctx.fill();
    ctx.stroke();

    // Brass rivets across carapace segments
    ctx.fillStyle = pal.brassBright;
    ctx.strokeStyle = pal.bronzeDark;
    ctx.lineWidth = 0.9;
    for (const [rx, ry] of [[9.5, 20.5], [20.5, 13.0], [21.5, 21.0], [33.5, 19.5]]) {
      ctx.beginPath();
      ctx.arc(rx, ry + bobY, 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Glowing amber clockwork optic visor facing right
    ctx.fillStyle = pal.chassisDark;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(26.5, 28.5 + bobY, 10.5, 5.4, 2.4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = pal.visorGlow;
    ctx.beginPath();
    ctx.ellipse(32.5, 31.2 + bobY, 3.2, 1.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pal.visorHot;
    ctx.beginPath();
    ctx.arc(33.4, 30.9 + bobY, 1.0, 0, Math.PI * 2);
    ctx.fill();

    // Front brass legs
    drawLeg(18, 16 + stride * 4.2, Math.max(0, stride) * 3.0, true);
    drawLeg(27, 29 - stride * 4.2, Math.max(0, -stride) * 3.0, true);

    ctx.restore();
    return;
  }

  // Retract / Shell Idle / Shell Spin / Wakeup Shake — 40 × 36 logical px
  const cx = 20;
  const cy = 19.5;
  const rx = 17.8;
  const ry = 14.8;

  // Frame 0 of retract shows half-tucked brass legs; wakeup_shake shows leg tips peeking
  if (action === 'retract' && frameIdx === 0) {
    ctx.fillStyle = pal.brassMid;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(8, 30, 7, 4.5, 2);
    ctx.roundRect(25, 30, 7, 4.5, 2);
    ctx.fill();
    ctx.stroke();
  } else if (action === 'wakeup_shake') {
    const poke = frameIdx === 0 ? 1.5 : 3.2;
    ctx.fillStyle = pal.brassBright;
    ctx.strokeStyle = pal.outline;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(8, 29.5 + poke * 0.4, 6.2, 3.6 + poke * 0.3, 1.6);
    ctx.roundRect(25.8, 29.5 + poke * 0.4, 6.2, 3.6 + poke * 0.3, 1.6);
    ctx.fill();
    ctx.stroke();
  }

  // Lower metallic rim base
  ctx.fillStyle = pal.chassisDark;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.roundRect(3.2, 23.5, 33.6, 9.8, 4.8);
  ctx.fill();
  ctx.stroke();

  // Main segmented bronze carapace dome
  const shellGrad = ctx.createRadialGradient(14, 10, 2, cx, cy, 19);
  shellGrad.addColorStop(0, pal.bronzeSheen);
  shellGrad.addColorStop(0.35, pal.bronzeBright);
  shellGrad.addColorStop(0.75, pal.bronzeMid);
  shellGrad.addColorStop(1, pal.bronzeDark);
  ctx.fillStyle = shellGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + rx, 25.2);
  ctx.quadraticCurveTo(cx, 28.6, cx - rx, 25.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Rotating vertical plate seams & rivets for shell_spin (4 fast frames)
  const spinOffset = action === 'shell_spin' ? ((frameIdx % 4) / 4) : 0.25;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx - 1, ry - 1, 0, Math.PI, Math.PI * 2);
  ctx.lineTo(cx + rx - 1, 25.0);
  ctx.lineTo(cx - rx + 1, 25.0);
  ctx.closePath();
  ctx.clip();

  ctx.strokeStyle = pal.bronzeDark;
  ctx.lineWidth = 1.7;
  for (let s = -1; s <= 2; s++) {
    const u = (s + spinOffset) * 0.5;
    const sx = cx + (u - 0.5) * 26;
    ctx.beginPath();
    ctx.moveTo(sx, 4);
    ctx.quadraticCurveTo(sx + (sx - cx) * 0.22, 15, sx + (sx - cx) * 0.14, 26);
    ctx.stroke();

    // Specular highlight bar & rivet per plate
    ctx.fillStyle = pal.brassBright;
    ctx.beginPath();
    ctx.arc(sx + 4.5, 16.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Kinetic gold spin streaks during high-speed roll
  if (action === 'shell_spin') {
    ctx.strokeStyle = 'rgba(253, 224, 115, 0.72)';
    ctx.lineWidth = 1.8;
    const streakY = frameIdx % 2 === 0 ? 12.5 : 18.0;
    ctx.beginPath();
    ctx.moveTo(5, streakY);
    ctx.lineTo(35, streakY);
    ctx.stroke();
  }
  ctx.restore();

  // Equatorial turquoise patina & brass lock band
  ctx.fillStyle = action === 'shell_spin' ? pal.brassBright : pal.patinaAccent;
  ctx.strokeStyle = pal.outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.roundRect(2.6, 22.4, 34.8, 3.9, 1.8);
  ctx.fill();
  ctx.stroke();

  // Wakeup shake glowing amber eye slit peeking open
  if (action === 'wakeup_shake') {
    ctx.fillStyle = frameIdx === 0 ? pal.visorGlow : pal.visorHot;
    ctx.beginPath();
    ctx.roundRect(12.5, 27.6, 15, 3.2, 1.5);
    ctx.fill();
  }

  ctx.restore();
}

export class EnemySpriteSheetBank {
  constructor() {
    this.sheets = {
      sproutling: {},
      hoplite: {},
    };
    this._baked = false;
    if (typeof document !== 'undefined') {
      this.bakeAll();
    }
  }

  bakeAll() {
    if (this._baked || typeof document === 'undefined') return;
    this._baked = true;

    for (const [actionKey, spec] of Object.entries(ENEMY_SPRITE_MATRIX.sproutling.actions)) {
      const frames = [];
      for (let f = 0; f < spec.frames; f++) {
        const c = makeCanvas(spec.frameWidth, spec.frameHeight);
        const ctx = c.getContext('2d');
        drawSproutlingFrame(ctx, actionKey, f);
        frames.push(c);
      }
      this.sheets.sproutling[actionKey] = { spec, frames };
    }

    for (const [actionKey, spec] of Object.entries(ENEMY_SPRITE_MATRIX.hoplite.actions)) {
      const frames = [];
      for (let f = 0; f < spec.frames; f++) {
        const c = makeCanvas(spec.frameWidth, spec.frameHeight);
        const ctx = c.getContext('2d');
        drawHopliteFrame(ctx, actionKey, f);
        frames.push(c);
      }
      this.sheets.hoplite[actionKey] = { spec, frames };
    }
  }

  getFrameCanvas(enemyKey, actionKey, frameIndex = 0) {
    if (!this._baked) this.bakeAll();
    const entry = this.sheets[enemyKey]?.[actionKey];
    if (!entry || !entry.frames.length) return null;
    const idx = ((frameIndex % entry.frames.length) + entry.frames.length) % entry.frames.length;
    return entry.frames[idx];
  }
}

export default EnemySpriteSheetBank;
