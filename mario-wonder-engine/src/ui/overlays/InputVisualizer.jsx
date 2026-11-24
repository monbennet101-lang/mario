/**
 * InputVisualizer — Live DualShock 4, Xbox & Keyboard Overlay ([I] toggle)
 * =========================================================================
 * Subscribes to GameEngine's single render loop with DOM-ref dirty-checking
 * (zero 60 Hz React re-renders).
 *
 * When DUALSHOCK4 profile is active, automatically renders:
 *   - Authentic PlayStation geometric vector glyphs:
 *       Cross (✕ #0084FF), Square (□ #FF66B2), Circle (○ #FF3850), Triangle (△ #00E676)
 *   - 32x32px circular Analog Stick Deflection Radar with red dashed 0.15 deadzone ring
 *     and real-time live stick coordinate dot (x, y)
 *   - L2 & R2 analog trigger pressure gauges (0%–100%) with actuation threshold ticks
 *   - L1/R1 bumpers & 0-frame digital D-Pad
 */

import React, { useRef, useEffect } from 'react';
import { Actions, ControllerProfile } from '@engine/input/InputManager';

const KEYBOARD_SPECS = [
  { action: Actions.UP, color: '#38BDF8' },
  { action: Actions.LEFT, color: '#38BDF8' },
  { action: Actions.RIGHT, color: '#38BDF8' },
  { action: Actions.DOWN, color: '#38BDF8' },
  { action: Actions.JUMP, color: '#22C55E' },
  { action: Actions.RUN, color: '#F59E0B' },
  { action: Actions.SPIN, color: '#A855F7' },
];

const PS4_FACE_COLORS = {
  cross: '#0084FF',     // Deep Cyan
  square: '#FF66B2',    // Vibrant Pink
  circle: '#FF3850',    // Crimson Red
  triangle: '#00E676',  // Bright Emerald
  l1: '#38BDF8',
  r1: '#38BDF8',
  up: '#38BDF8',
  down: '#38BDF8',
  left: '#38BDF8',
  right: '#38BDF8',
};

const XBOX_FACE_COLORS = {
  cross: '#22C55E',     // A Green
  square: '#38BDF8',    // X Blue
  circle: '#EF4444',    // B Red
  triangle: '#F59E0B',  // Y Amber
  l1: '#94A3B8',
  r1: '#94A3B8',
  up: '#38BDF8',
  down: '#38BDF8',
  left: '#38BDF8',
  right: '#38BDF8',
};

function PlayStationGlyph({ type, active }) {
  const stroke = active ? '#070918' : PS4_FACE_COLORS[type];
  if (type === 'cross') {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke={stroke} strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'square') {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="3.5" y="3.5" width="9" height="9" rx="1" stroke={stroke} strokeWidth="2.2" />
      </svg>
    );
  }
  if (type === 'circle') {
    return (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="4.8" stroke={stroke} strokeWidth="2.2" />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3L13 12.2H3L8 3Z" stroke={stroke} strokeWidth="2.1" strokeLinejoin="round" />
    </svg>
  );
}

function InputVisualizer({
  visible,
  engine,
  engineRef,
  leftOffset = 12,
  controllerProfile = ControllerProfile.KEYBOARD,
}) {
  const elRefs = useRef({});
  const prevStates = useRef({});
  const stickDotRef = useRef(null);
  const stickCoordRef = useRef(null);
  const l2FillRef = useRef(null);
  const r2FillRef = useRef(null);
  const l2PctRef = useRef(null);
  const r2PctRef = useRef(null);

  const isPS4 = controllerProfile === ControllerProfile.DUALSHOCK4;
  const isXbox = controllerProfile === ControllerProfile.XBOX;
  const isGamepadView = isPS4 || isXbox || controllerProfile === ControllerProfile.GENERIC;
  const palette = isXbox ? XBOX_FACE_COLORS : PS4_FACE_COLORS;

  useEffect(() => {
    const activeEngine = engine || engineRef?.current;
    if (!visible || !activeEngine) {
      prevStates.current = {};
      return;
    }

    prevStates.current = {};

    const paintButton = (key, active, color, isFaceGlyph = false) => {
      const el = elRefs.current[key];
      if (!el) return;
      if (prevStates.current[key] === active) return;
      prevStates.current[key] = active;

      el.dataset.active = active ? 'true' : 'false';
      el.style.background = active ? color : 'rgba(18, 25, 48, 0.88)';
      el.style.borderColor = active ? color : isFaceGlyph ? `${color}88` : 'rgba(148, 163, 184, 0.25)';
      el.style.color = active ? '#070918' : isFaceGlyph ? color : '#94A3B8';
      el.style.transform = active ? 'scale(0.92)' : 'scale(1)';

      // Swap SVG stroke color cleanly without React re-render
      if (isFaceGlyph) {
        const shapes = el.querySelectorAll('path, rect, circle');
        for (let i = 0; i < shapes.length; i++) {
          shapes[i].setAttribute('stroke', active ? '#070918' : color);
        }
      }
    };

    const sync = (eng) => {
      const input = eng.input;
      if (!input) return;

      if (!isGamepadView) {
        for (const spec of KEYBOARD_SPECS) {
          paintButton(spec.action, input.held(spec.action), spec.color, false);
        }
        return;
      }

      const analog = input.getAnalogState();
      const fb = analog.faceButtons;
      const dpad = analog.dpad;

      // D-Pad & digital fallback directions
      paintButton('up', dpad.up || input.held(Actions.UP), palette.up, false);
      paintButton('down', dpad.down || input.held(Actions.DOWN), palette.down, false);
      paintButton('left', dpad.left || input.held(Actions.LEFT), palette.left, false);
      paintButton('right', dpad.right || input.held(Actions.RIGHT), palette.right, false);

      // Face buttons (also light up when keyboard equivalents fire for clear feedback)
      paintButton('cross', fb.cross || input.held(Actions.JUMP), palette.cross, isPS4);
      paintButton('square', fb.square || input.held(Actions.RUN), palette.square, isPS4);
      paintButton('circle', fb.circle || input.held(Actions.SPIN), palette.circle, isPS4);
      paintButton('triangle', fb.triangle, palette.triangle, isPS4);
      paintButton('l1', fb.l1, palette.l1, false);
      paintButton('r1', fb.r1, palette.r1, false);

      // 32x32px Circular Analog Stick Deflection Radar
      if (stickDotRef.current) {
        const sx = Math.max(-1, Math.min(1, analog.rawX || analog.filteredX || 0));
        const sy = Math.max(-1, Math.min(1, analog.rawY || analog.filteredY || 0));
        const cx = 16 + sx * 12.5;
        const cy = 16 + sy * 12.5;
        stickDotRef.current.setAttribute('cx', cx.toFixed(1));
        stickDotRef.current.setAttribute('cy', cy.toFixed(1));
        stickDotRef.current.setAttribute('fill', analog.inDeadzone ? '#94A3B8' : '#38BDF8');
      }
      if (stickCoordRef.current) {
        const coordText = `${analog.filteredX.toFixed(2)},${analog.filteredY.toFixed(2)}`;
        if (prevStates.current._coords !== coordText) {
          prevStates.current._coords = coordText;
          stickCoordRef.current.textContent = coordText;
        }
      }

      // L2 / R2 Analog Trigger Pressure Gauges (0% - 100%)
      const l2Pct = Math.round(Math.max(0, Math.min(1, analog.l2Pressure || 0)) * 100);
      const r2Pct = Math.round(Math.max(0, Math.min(1, analog.r2Pressure || 0)) * 100);

      if (l2FillRef.current && prevStates.current._l2 !== l2Pct) {
        prevStates.current._l2 = l2Pct;
        l2FillRef.current.style.width = `${l2Pct}%`;
        l2FillRef.current.style.background = l2Pct > 35 ? '#F43F5E' : '#64748B';
        if (l2PctRef.current) l2PctRef.current.textContent = `${l2Pct}%`;
      }
      if (r2FillRef.current && prevStates.current._r2 !== r2Pct) {
        prevStates.current._r2 = r2Pct;
        r2FillRef.current.style.width = `${r2Pct}%`;
        r2FillRef.current.style.background = r2Pct > 25 ? '#F59E0B' : '#64748B';
        if (r2PctRef.current) r2PctRef.current.textContent = `${r2Pct}%`;
      }
    };

    sync(activeEngine);
    return activeEngine.subscribeUITick(sync);
  }, [visible, engine, engineRef, isGamepadView, isPS4, palette]);

  if (!visible) return null;

  const setRef = (key) => (el) => {
    elRefs.current[key] = el;
  };

  if (!isGamepadView) {
    return (
      <aside
        data-testid="input-visualizer"
        data-profile="KEYBOARD"
        aria-label="Live Input Visualizer"
        style={{ ...styles.container, left: leftOffset }}
      >
        <div style={styles.title}>LIVE INPUT · KEYBOARD</div>
        <div style={styles.layout}>
          <div style={styles.dpad}>
            <div style={styles.dpadRow}>
              <div ref={setRef(Actions.UP)} data-action="up" style={styles.dpadBtn}>▲</div>
            </div>
            <div style={styles.dpadRow}>
              <div ref={setRef(Actions.LEFT)} data-action="left" style={styles.dpadBtn}>◄</div>
              <div style={styles.dpadCenter} />
              <div ref={setRef(Actions.RIGHT)} data-action="right" style={styles.dpadBtn}>►</div>
            </div>
            <div style={styles.dpadRow}>
              <div ref={setRef(Actions.DOWN)} data-action="down" style={styles.dpadBtn}>▼</div>
            </div>
          </div>

          <div style={styles.actions}>
            <div ref={setRef(Actions.JUMP)} data-action="jump" style={styles.actionBtn}>JUMP · Z/J</div>
            <div ref={setRef(Actions.RUN)} data-action="run" style={styles.actionBtn}>RUN · X/K</div>
            <div ref={setRef(Actions.SPIN)} data-action="spin" style={styles.actionBtn}>SPIN · E/L</div>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      data-testid="input-visualizer"
      data-profile={controllerProfile}
      aria-label={isPS4 ? 'Live PlayStation DualShock 4 Input Visualizer' : 'Live Gamepad Input Visualizer'}
      style={{ ...styles.container, left: leftOffset, minWidth: 278 }}
    >
      <div style={styles.headerRow}>
        <span style={styles.title}>
          {isPS4 ? 'DUALSHOCK 4 · LIVE INPUT' : isXbox ? 'XBOX PAD · LIVE INPUT' : 'GAMEPAD · LIVE INPUT'}
        </span>
      </div>

      {/* Shoulder Bumpers & Analog Trigger Pressure Gauges */}
      <div style={styles.shoulderRow}>
        <div style={styles.triggerCol}>
          <div style={styles.triggerTop}>
            <div ref={setRef('l1')} data-action="l1" style={styles.bumperBtn}>{isXbox ? 'LB' : 'L1'}</div>
            <span style={styles.triggerLabel}>{isXbox ? 'LT' : 'L2'}</span>
            <span ref={l2PctRef} data-testid="l2-pressure-pct" style={styles.triggerPct}>0%</span>
          </div>
          <div style={styles.triggerTrack} aria-label="L2 trigger pressure gauge">
            <div ref={l2FillRef} data-testid="l2-pressure-bar" style={styles.triggerFill} />
            <div style={{ ...styles.triggerMark, left: '35%' }} title="35% Crouch/Pound threshold" />
          </div>
        </div>

        <div style={styles.triggerCol}>
          <div style={styles.triggerTop}>
            <span style={styles.triggerLabel}>{isXbox ? 'RT' : 'R2'}</span>
            <span ref={r2PctRef} data-testid="r2-pressure-pct" style={styles.triggerPct}>0%</span>
            <div ref={setRef('r1')} data-action="r1" style={styles.bumperBtn}>{isXbox ? 'RB' : 'R1'}</div>
          </div>
          <div style={styles.triggerTrack} aria-label="R2 trigger pressure gauge">
            <div ref={r2FillRef} data-testid="r2-pressure-bar" style={styles.triggerFill} />
            <div style={{ ...styles.triggerMark, left: '25%' }} title="25% Sprint threshold" />
          </div>
        </div>
      </div>

      {/* Main Controller Row: D-Pad · 32x32 Analog Radar · Face Button Diamond */}
      <div style={styles.gamepadBody}>
        {/* Digital D-Pad */}
        <div style={styles.dpad}>
          <div style={styles.dpadRow}>
            <div ref={setRef('up')} data-action="up" style={styles.dpadBtnSmall}>▲</div>
          </div>
          <div style={styles.dpadRow}>
            <div ref={setRef('left')} data-action="left" style={styles.dpadBtnSmall}>◄</div>
            <div style={styles.dpadCenterSmall} />
            <div ref={setRef('right')} data-action="right" style={styles.dpadBtnSmall}>►</div>
          </div>
          <div style={styles.dpadRow}>
            <div ref={setRef('down')} data-action="down" style={styles.dpadBtnSmall}>▼</div>
          </div>
        </div>

        {/* 32x32px Analog Stick Deflection Radar */}
        <div style={styles.radarWrap}>
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            data-testid="analog-stick-radar"
            aria-label="Analog stick deflection radar with 0.15 deadzone ring"
            style={styles.radarSvg}
          >
            {/* Outer housing */}
            <circle cx="16" cy="16" r="14.5" fill="rgba(7, 11, 25, 0.92)" stroke="rgba(148, 163, 184, 0.35)" strokeWidth="1" />
            {/* Crosshair axes */}
            <line x1="16" y1="2.5" x2="16" y2="29.5" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="0.75" />
            <line x1="2.5" y1="16" x2="29.5" y2="16" stroke="rgba(148, 163, 184, 0.16)" strokeWidth="0.75" />
            {/* Outer saturation envelope (0.95 -> r ≈ 12.5) */}
            <circle cx="16" cy="16" r="12.5" fill="none" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="0.75" />
            {/* Red dashed inner deadzone ring (0.15 -> r = 0.15 * 13.5 ≈ 2.2px, rendered at clear 3.2px visual scale for crisp legibility) */}
            <circle
              cx="16"
              cy="16"
              r="3.2"
              fill="rgba(239, 68, 68, 0.10)"
              stroke="#EF4444"
              strokeWidth="0.9"
              strokeDasharray="1.8 1.2"
              data-testid="radar-deadzone-ring"
            />
            {/* Live Stick Deflection Dot */}
            <circle
              ref={stickDotRef}
              data-testid="radar-stick-dot"
              cx="16"
              cy="16"
              r="2.4"
              fill="#94A3B8"
            />
          </svg>
          <span ref={stickCoordRef} data-testid="radar-coords" style={styles.radarCoords}>0.00,0.00</span>
        </div>

        {/* PlayStation / Xbox Diamond Face Cluster */}
        <div style={styles.diamond} data-testid="ps4-face-cluster">
          <div style={styles.diamondTop}>
            <div
              ref={setRef('triangle')}
              data-action="triangle"
              data-testid="btn-glyph-triangle"
              title="Triangle (△) — Look Up"
              style={{ ...styles.faceBtn, borderColor: `${palette.triangle}88`, color: palette.triangle }}
            >
              {isPS4 ? <PlayStationGlyph type="triangle" active={false} /> : 'Y'}
            </div>
          </div>
          <div style={styles.diamondMid}>
            <div
              ref={setRef('square')}
              data-action="square"
              data-testid="btn-glyph-square"
              title="Square (□) — Run / Dash"
              style={{ ...styles.faceBtn, borderColor: `${palette.square}88`, color: palette.square }}
            >
              {isPS4 ? <PlayStationGlyph type="square" active={false} /> : 'X'}
            </div>
            <div
              ref={setRef('circle')}
              data-action="circle"
              data-testid="btn-glyph-circle"
              title="Circle (○) — Spin / Flutter"
              style={{ ...styles.faceBtn, borderColor: `${palette.circle}88`, color: palette.circle }}
            >
              {isPS4 ? <PlayStationGlyph type="circle" active={false} /> : 'B'}
            </div>
          </div>
          <div style={styles.diamondBot}>
            <div
              ref={setRef('cross')}
              data-action="cross"
              data-testid="btn-glyph-cross"
              title="Cross (✕) — Jump"
              style={{ ...styles.faceBtn, borderColor: `${palette.cross}88`, color: palette.cross }}
            >
              {isPS4 ? <PlayStationGlyph type="cross" active={false} /> : 'A'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

const styles = {
  container: {
    position: 'absolute',
    bottom: 40,
    left: 12,
    background: 'rgba(10, 14, 34, 0.92)',
    border: '1px solid rgba(110, 180, 255, 0.30)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.50)',
    borderRadius: 10,
    padding: '9px 12px 10px',
    zIndex: 1000,
    pointerEvents: 'none',
    userSelect: 'none',
    fontFamily: '"JetBrains Mono", monospace',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 7,
  },
  title: {
    fontSize: 9.5,
    color: '#94A3B8',
    letterSpacing: 1.5,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 6,
  },
  layout: {
    display: 'flex',
    gap: 16,
    alignItems: 'center',
  },
  shoulderRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
    marginBottom: 8,
  },
  triggerCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  triggerTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  bumperBtn: {
    padding: '2px 6px',
    borderRadius: 4,
    fontSize: 9,
    fontWeight: 800,
    background: 'rgba(18, 25, 48, 0.88)',
    border: '1px solid rgba(148, 163, 184, 0.28)',
    color: '#94A3B8',
    lineHeight: 1.1,
  },
  triggerLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: '#CBD5E1',
  },
  triggerPct: {
    fontSize: 9,
    fontWeight: 700,
    color: '#94A3B8',
    fontVariantNumeric: 'tabular-nums',
    minWidth: 26,
    textAlign: 'right',
  },
  triggerTrack: {
    position: 'relative',
    height: 6,
    borderRadius: 3,
    background: 'rgba(15, 23, 42, 0.95)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    overflow: 'hidden',
  },
  triggerFill: {
    height: '100%',
    width: '0%',
    background: '#64748B',
    transition: 'width 40ms linear',
  },
  triggerMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    background: 'rgba(248, 250, 252, 0.55)',
  },
  gamepadBody: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  dpad: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
  },
  dpadRow: {
    display: 'flex',
    gap: 2,
    justifyContent: 'center',
  },
  dpadCenter: {
    width: 26,
    height: 26,
  },
  dpadCenterSmall: {
    width: 20,
    height: 20,
  },
  dpadBtn: {
    width: 26,
    height: 26,
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 'bold',
    background: 'rgba(30, 41, 59, 0.78)',
    color: '#94A3B8',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  dpadBtnSmall: {
    width: 20,
    height: 20,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 9,
    fontWeight: 'bold',
    background: 'rgba(18, 25, 48, 0.88)',
    color: '#94A3B8',
    border: '1px solid rgba(148, 163, 184, 0.25)',
  },
  radarWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
  },
  radarSvg: {
    display: 'block',
  },
  radarCoords: {
    fontSize: 8.5,
    color: '#94A3B8',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.2px',
  },
  diamond: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
  },
  diamondTop: {
    display: 'flex',
    justifyContent: 'center',
  },
  diamondMid: {
    display: 'flex',
    gap: 20,
    justifyContent: 'center',
  },
  diamondBot: {
    display: 'flex',
    justifyContent: 'center',
  },
  faceBtn: {
    width: 24,
    height: 24,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 11,
    fontWeight: 800,
    background: 'rgba(18, 25, 48, 0.88)',
    border: '1.5px solid rgba(148, 163, 184, 0.35)',
    transition: 'transform 60ms ease',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  actionBtn: {
    minWidth: 84,
    height: 24,
    padding: '0 8px',
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 'bold',
    background: 'rgba(30, 41, 59, 0.78)',
    color: '#94A3B8',
    border: '1px solid rgba(255,255,255,0.12)',
  },
};

export default InputVisualizer;
