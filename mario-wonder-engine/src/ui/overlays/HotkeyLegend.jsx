/**
 * HotkeyLegend — Quick Help Card ([H] toggle) with PlayStation DualShock 4 Tab
 * =============================================================================
 * Dismissible popover listing Keyboard controls, a dedicated "PLAYSTATION DUALSHOCK 4"
 * ergonomic button mapping diagram tab, and the 1-click Manual UI Layout Override:
 *   Layout: [Auto-Detect | Force PlayStation (PS4) | Force Xbox]
 */

import React, { useEffect, useState } from 'react';
import { ControllerProfile, LayoutOverride } from '@engine/input/GamepadHardware';

const KEYBOARD_HOTKEYS = [
  { section: 'GAMEPLAY' },
  { key: '← → / A D', action: 'Move Left / Right / Wall Slide' },
  { key: '↑ / W', action: 'Look Up' },
  { key: '↓ / S', action: 'Crouch · Butt-Slide · Ground Pound · Warp Pipe' },
  { key: '↓ + Z / J', action: 'Drop Through 1-Way Semisolid' },
  { key: 'Z / J', action: 'Jump · Triple Jump Chain (Sprint) · Wall Jump' },
  { key: 'Hold X / K', action: 'Run / Sprint · Hold Hoplite Shell' },
  { key: 'Tap X / K', action: 'Shoot Fireball (when Fire form, max 2 active)' },
  { key: 'E / L', action: 'Spin Jump (Ground) · Mid-Air Spin Twirl (1×/air)' },

  { section: 'TIME CONTROL' },
  { key: 'SPACE / ESC', action: 'Pause / Resume' },
  { key: '.', action: 'Frame Step (while paused)' },
  { key: 'T', action: 'Cycle Time Scale (1x/0.5x/0.25x/2x)' },
  { key: 'R', action: 'Reset Current Room' },

  { section: 'DEBUG, PRESETS & VERIFICATION' },
  { key: 'C', action: 'Hot-Swap Hero (Vesper / Lumen)' },
  { key: 'P / F6', action: 'Cycle Feel Preset (Wonder / Classic / Arcade)' },
  { key: 'F7 / F8 / F9', action: 'Verify Report / Enemy Gallery / Level Audit' },
  { key: 'F3 / F4 / F5', action: 'Telemetry HUD / Camera Debug / Pose Inspector' },
  { key: 'I / U / M', action: 'Input Visualizer / Live Tuning / Mute Audio' },
  { key: 'G / B / V / H', action: 'Grid / Hitboxes / Day-Twilight / Help Card' },
];

const PS4_MAPPINGS = [
  { section: 'THUMB-ROLL FACE ERGONOMICS' },
  { key: '✕ Cross (Btn 0)', color: '#0084FF', action: 'Jump · Wall Jump · Triple Jump · Menu Confirm' },
  { key: '□ Square (Btn 2)', color: '#FF66B2', action: 'Run / Sprint · Carry / Throw Shell · Fireball' },
  { key: '○ Circle (Btn 1)', color: '#FF3850', action: 'Spin Jump · Mid-Air Twirl / Flutter · Menu Back' },
  { key: '△ Triangle (Btn 3)', color: '#00E676', action: 'Look Up · Enter Upward Warp Pipe' },

  { section: 'ANALOG TRIGGERS & SHOULDER BUMPERS' },
  { key: 'L1 / R1 (Btn 4/5)', color: '#38BDF8', action: 'Dedicated Bumper Spin · Switch Menu Tabs' },
  { key: 'R2 Trigger (>25%)', color: '#F59E0B', action: 'Index-Finger Sprint / Dash (Zero Thumb Claw)' },
  { key: 'L2 Trigger (>35%)', color: '#FB7185', action: 'Crouch · Butt-Slide · Mid-Air Ground Pound' },

  { section: 'RADIAL STICK, D-PAD & SYSTEM' },
  { key: 'Left Stick', color: '#38BDF8', action: 'Scaled Radial Deadzone (0.15) · γ=1.35 Speed Curve' },
  { key: 'D-Pad (Btn 12–15)', color: '#38BDF8', action: '0-Frame Tournament Digital Movement & Menu Cursor' },
  { key: 'Options (Btn 9)', color: '#CBD5E1', action: 'Pause / Resume Game' },
  { key: 'Touchpad / Share', color: '#CBD5E1', action: 'Toggle Telemetry HUD [F3]' },
  { key: 'L3 / R3 Click', color: '#CBD5E1', action: 'L3: Reset Room · R3: Open / Close Command Menu' },
];

const LAYOUT_OPTIONS = [
  { id: LayoutOverride.AUTO, label: 'Auto-Detect' },
  { id: LayoutOverride.FORCE_PS4, label: 'Force PlayStation (PS4)' },
  { id: LayoutOverride.FORCE_XBOX, label: 'Force Xbox' },
];

function DualShockDiagram() {
  return (
    <div style={styles.diagramBox} aria-label="PlayStation DualShock 4 layout diagram">
      <svg viewBox="0 0 400 156" width="100%" height="136" style={{ display: 'block' }}>
        <g transform="translate(10, 2)">
          {/* Controller silhouette */}
          <path
            d="M84 36 C112 26 268 26 296 36 C324 46 346 86 336 118 C329 137 305 140 290 122 L264 98 L116 98 L90 122 C75 140 51 137 44 118 C34 86 56 46 84 36 Z"
            fill="#111827"
            stroke="rgba(148, 163, 184, 0.42)"
            strokeWidth="1.6"
          />
          {/* L2 / R2 Triggers */}
          <rect x="76" y="8" width="48" height="13" rx="4" fill="#1E293B" stroke="#FB7185" strokeWidth="1.2" />
          <text x="100" y="17.5" textAnchor="middle" fill="#FB7185" fontSize="8" fontWeight="700">L2 · DOWN</text>
          <rect x="256" y="8" width="48" height="13" rx="4" fill="#1E293B" stroke="#F59E0B" strokeWidth="1.2" />
          <text x="280" y="17.5" textAnchor="middle" fill="#F59E0B" fontSize="8" fontWeight="700">R2 · RUN</text>

          {/* L1 / R1 Bumpers */}
          <rect x="81" y="24" width="38" height="10" rx="3" fill="#0F172A" stroke="#38BDF8" strokeWidth="1" />
          <text x="100" y="31.5" textAnchor="middle" fill="#38BDF8" fontSize="7" fontWeight="700">L1 SPIN</text>
          <rect x="261" y="24" width="38" height="10" rx="3" fill="#0F172A" stroke="#38BDF8" strokeWidth="1" />
          <text x="280" y="31.5" textAnchor="middle" fill="#38BDF8" fontSize="7" fontWeight="700">R1 SPIN</text>

          {/* Touchpad */}
          <rect x="148" y="38" width="84" height="32" rx="5" fill="#0B1220" stroke="rgba(148, 163, 184, 0.45)" strokeWidth="1.2" />
          <text x="190" y="53" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="700">TOUCHPAD</text>
          <text x="190" y="63" textAnchor="middle" fill="#38BDF8" fontSize="7">TELEMETRY [F3]</text>

          {/* Share & Options */}
          <rect x="132" y="44" width="10" height="16" rx="4" fill="#1E293B" stroke="#64748B" strokeWidth="1" />
          <rect x="238" y="44" width="10" height="16" rx="4" fill="#1E293B" stroke="#38BDF8" strokeWidth="1" />
          <text x="243" y="40" textAnchor="middle" fill="#CBD5E1" fontSize="6.5">OPT</text>

          {/* D-Pad */}
          <g transform="translate(88, 68)">
            <rect x="-5" y="-14" width="10" height="28" rx="2" fill="#1E293B" stroke="#38BDF8" strokeWidth="1" />
            <rect x="-14" y="-5" width="28" height="10" rx="2" fill="#1E293B" stroke="#38BDF8" strokeWidth="1" />
          </g>
          <text x="58" y="148" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="600">D-PAD (0f)</text>

          {/* Left & Right Analog Sticks */}
          <g transform="translate(144, 90)">
            <circle cx="0" cy="0" r="14" fill="#0B1220" stroke="#38BDF8" strokeWidth="1.2" />
            <circle cx="0" cy="0" r="4.5" fill="none" stroke="#EF4444" strokeWidth="0.9" strokeDasharray="2 1.5" />
          </g>
          <text x="144" y="148" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="600">L-STICK / L3</text>

          <g transform="translate(236, 90)">
            <circle cx="0" cy="0" r="14" fill="#0B1220" stroke="rgba(148, 163, 184, 0.45)" strokeWidth="1.2" />
          </g>
          <text x="236" y="148" textAnchor="middle" fill="#94A3B8" fontSize="7.5" fontWeight="600">R3 MENU</text>

          {/* PlayStation Face Buttons Diamond */}
          <g transform="translate(292, 68)">
            {/* Triangle */}
            <circle cx="0" cy="-16" r="8.5" fill="#0B1220" stroke="#00E676" strokeWidth="1.5" />
            <path d="M0 -20 L4 -13 L-4 -13 Z" fill="none" stroke="#00E676" strokeWidth="1.4" />
            {/* Square */}
            <circle cx="-16" cy="0" r="8.5" fill="#0B1220" stroke="#FF66B2" strokeWidth="1.5" />
            <rect x="-19.5" y="-3.5" width="7" height="7" fill="none" stroke="#FF66B2" strokeWidth="1.4" />
            {/* Circle */}
            <circle cx="16" cy="0" r="8.5" fill="#0B1220" stroke="#FF3850" strokeWidth="1.5" />
            <circle cx="16" cy="0" r="3.6" fill="none" stroke="#FF3850" strokeWidth="1.4" />
            {/* Cross */}
            <circle cx="0" cy="16" r="8.5" fill="#0B1220" stroke="#0084FF" strokeWidth="1.5" />
            <path d="M-3.5 12.5 L3.5 19.5 M3.5 12.5 L-3.5 19.5" stroke="#0084FF" strokeWidth="1.5" strokeLinecap="round" />
          </g>
          <text x="358" y="148" textAnchor="end" fill="#CBD5E1" fontSize="7.5" fontWeight="700">□+✕ THUMB ROLL</text>
        </g>
      </svg>
    </div>
  );
}

function HotkeyLegend({
  visible,
  onClose,
  controllerStatus,
  onSetLayoutOverride,
}) {
  const [activeTab, setActiveTab] = useState(
    controllerStatus?.effectiveProfile === ControllerProfile.DUALSHOCK4 ? 'ps4' : 'keyboard'
  );

  useEffect(() => {
    if (visible && controllerStatus?.effectiveProfile === ControllerProfile.DUALSHOCK4) {
      setActiveTab('ps4');
    }
  }, [visible, controllerStatus?.effectiveProfile]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const currentOverride = controllerStatus?.layoutOverride || LayoutOverride.AUTO;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Controls and Hotkeys"
      data-testid="hotkey-legend-modal"
      style={styles.overlay}
      onClick={onClose}
    >
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>CONTROLS & HOTKEYS</h2>
          <button
            type="button"
            aria-label="Close controls help"
            style={styles.closeBtn}
            onClick={(e) => {
              e.currentTarget.blur();
              onClose();
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Bar: Keyboard vs PlayStation DualShock 4 */}
        <div role="tablist" aria-label="Control Guide Tabs" style={styles.tabBar}>
          <button
            type="button"
            role="tab"
            data-testid="tab-controls-keyboard"
            aria-selected={activeTab === 'keyboard'}
            onClick={() => setActiveTab('keyboard')}
            style={activeTab === 'keyboard' ? styles.tabActive : styles.tabBtn}
          >
            KEYBOARD
          </button>
          <button
            type="button"
            role="tab"
            data-testid="tab-controls-ps4"
            aria-selected={activeTab === 'ps4'}
            onClick={() => setActiveTab('ps4')}
            style={activeTab === 'ps4' ? styles.tabActivePS4 : styles.tabBtn}
          >
            PLAYSTATION DUALSHOCK 4
          </button>
        </div>

        {/* Manual 1-Click Controller Layout Override */}
        <div style={styles.overrideBar} data-testid="layout-override-bar">
          <span style={styles.overrideLabel}>Layout:</span>
          <div style={styles.overrideGroup} role="group" aria-label="Controller Layout Override">
            {LAYOUT_OPTIONS.map((opt) => {
              const selected = currentOverride === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`layout-opt-${opt.id}`}
                  aria-pressed={selected}
                  onClick={() => onSetLayoutOverride?.(opt.id)}
                  style={selected ? styles.overrideBtnActive : styles.overrideBtn}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={styles.body}>
          {activeTab === 'ps4' ? (
            <>
              <DualShockDiagram />
              {PS4_MAPPINGS.map((item, i) =>
                item.section ? (
                  <div key={i} style={styles.section}>{item.section}</div>
                ) : (
                  <div key={i} style={styles.row}>
                    <span style={{ ...styles.key, color: item.color || '#38BDF8', minWidth: 145 }}>
                      {item.key}
                    </span>
                    <span style={styles.action}>{item.action}</span>
                  </div>
                )
              )}
            </>
          ) : (
            KEYBOARD_HOTKEYS.map((item, i) =>
              item.section ? (
                <div key={i} style={styles.section}>{item.section}</div>
              ) : (
                <div key={i} style={styles.row}>
                  <span style={styles.key}>{item.key}</span>
                  <span style={styles.action}>{item.action}</span>
                </div>
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(4, 6, 18, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  card: {
    background: 'rgba(12, 16, 40, 0.97)',
    border: '1px solid rgba(110, 180, 255, 0.35)',
    boxShadow: '0 20px 48px rgba(0, 0, 0, 0.65)',
    borderRadius: 14,
    padding: '18px 22px',
    maxWidth: 530,
    width: '92%',
    maxHeight: '86vh',
    overflowY: 'auto',
    fontFamily: '"JetBrains Mono", monospace',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#38BDF8',
    letterSpacing: 1.5,
  },
  closeBtn: {
    background: 'rgba(30, 41, 59, 0.85)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: 6,
    color: '#E2E8F0',
    fontSize: 14,
    cursor: 'pointer',
    padding: '4px 10px',
    minHeight: 32,
  },
  tabBar: {
    display: 'grid',
    gridTemplateColumns: '1fr 1.3fr',
    gap: 6,
    padding: 4,
    borderRadius: 9,
    background: 'rgba(5, 8, 22, 0.85)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    marginBottom: 10,
  },
  tabBtn: {
    minHeight: 34,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'transparent',
    color: '#94A3B8',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabActive: {
    minHeight: 34,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #38BDF8',
    background: 'rgba(14, 116, 144, 0.85)',
    color: '#F8FAFC',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  tabActivePS4: {
    minHeight: 34,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid #0084FF',
    background: 'rgba(0, 132, 255, 0.28)',
    color: '#E0F2FE',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  overrideBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    padding: '6px 8px',
    marginBottom: 10,
    borderRadius: 8,
    background: 'rgba(7, 11, 25, 0.82)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
  },
  overrideLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#CBD5E1',
  },
  overrideGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
  },
  overrideBtn: {
    minHeight: 28,
    padding: '4px 8px',
    borderRadius: 5,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#94A3B8',
    fontFamily: 'inherit',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  overrideBtnActive: {
    minHeight: 28,
    padding: '4px 8px',
    borderRadius: 5,
    border: '1px solid #0084FF',
    background: 'rgba(0, 132, 255, 0.35)',
    color: '#F8FAFC',
    fontFamily: 'inherit',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  diagramBox: {
    marginBottom: 10,
    padding: '6px 4px',
    borderRadius: 10,
    background: 'rgba(5, 8, 22, 0.85)',
    border: '1px solid rgba(110, 180, 255, 0.20)',
  },
  body: {
    fontSize: 11.5,
  },
  section: {
    color: '#FACC15',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.8,
    marginTop: 10,
    marginBottom: 5,
    borderBottom: '1px solid rgba(250, 204, 21, 0.25)',
    paddingBottom: 3,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
    padding: '2px 0',
  },
  key: {
    color: '#38BDF8',
    fontWeight: 'bold',
    minWidth: 110,
    flexShrink: 0,
  },
  action: {
    color: '#CBD5E1',
    textAlign: 'right',
  },
};

export default HotkeyLegend;
