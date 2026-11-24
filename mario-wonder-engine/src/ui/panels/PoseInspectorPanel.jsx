/**
 * PoseInspectorPanel — Stage 8 Pose & Animation Inspector Mode ([F5] toggle)
 * =============================================================================
 * Pauses gameplay to inspect all 27 skeletal clips across Mario & Luigi,
 * scrub animation frames/normalized time, adjust playback speed & 3/4 yaw,
 * and toggle THREE.SkeletonHelper + wireframe visualization.
 * Zero backdrop-filter over canvas/WebGL; docked right without obstructing center.
 */

import React, { useEffect, useState } from 'react';
import MovementProfile from '@game/config/MovementProfile';

const CLIP_GROUPS = [
  {
    title: 'LOCOMOTION (6)',
    clips: ['Idle', 'Walk', 'Run', 'Sprint', 'Skid', 'TurnAround'],
  },
  {
    title: 'AERIAL (8)',
    clips: ['Jump', 'DoubleJump', 'TripleJump', 'FlutterJump', 'SpinJump', 'SpinAir', 'WallSlide', 'WallJump'],
  },
  {
    title: 'COMBAT & REACTIONS (13)',
    clips: [
      'CrouchStart', 'Crouch', 'GroundPound', 'GroundPoundLand',
      'Fireball', 'FireballAir', 'CarryWalk', 'Throw',
      'Climb', 'Swim', 'Damage', 'Defeat', 'Victory',
    ],
  },
];

function PoseInspectorPanel({ visible, engine, engineRef }) {
  const [inspector, setInspector] = useState({
    clipName: 'Idle',
    playing: true,
    normalizedTime: 0,
    speed: 1.0,
    showSkeleton: false,
    wireframe: false,
    previewYawDeg: MovementProfile.stage8.cameraYawTiltDeg,
  });
  const [characterId, setCharacterId] = useState('mario');
  const [rigTel, setRigTel] = useState({
    volumeProduct: 1.0,
    headAttached: true,
    loadedClipsCount: 27,
  });

  useEffect(() => {
    const eng = engine || engineRef?.current;
    if (!visible || !eng) return;

    const syncFromEngine = () => {
      setCharacterId(eng.characterId || 'mario');
      setInspector({ ...eng.poseInspector });
      const t = eng.renderer?.rig3D?.telemetry;
      if (t) {
        setRigTel({
          volumeProduct: t.volumeProduct ?? 1.0,
          headAttached: t.headAttached ?? true,
          loadedClipsCount: t.loadedClipsCount ?? 27,
        });
      }
    };

    syncFromEngine();
    return eng.subscribeUITick(syncFromEngine);
  }, [visible, engine, engineRef]);

  if (!visible) return null;

  const activeEngine = engine || engineRef?.current;
  const updateInspector = (patch) => {
    if (!activeEngine) return;
    activeEngine.setPoseInspectorState(patch);
    setInspector({ ...activeEngine.poseInspector });
  };

  return (
    <aside
      data-testid="pose-inspector-panel"
      aria-label="Pose and Animation Inspector"
      style={styles.panel}
    >
      <div style={styles.header}>
        <div>
          <div style={styles.title}>POSE INSPECTOR</div>
          <div style={styles.subTitle}>27 CLIPS · {rigTel.loadedClipsCount} LOADED</div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close Pose Inspector"
          onClick={(e) => {
            e.currentTarget.blur();
            activeEngine?.togglePoseInspector(false);
          }}
          style={styles.closeBtn}
        >
          ✕
        </button>
      </div>

      {/* Character Switcher */}
      <div style={styles.charRow}>
        {[
          { id: 'mario', label: 'MARIO', color: '#EF4444' },
          { id: 'luigi', label: 'LUIGI', color: '#22C55E' },
        ].map((c) => {
          const active = characterId === c.id;
          return (
            <button
              key={c.id}
              type="button"
              tabIndex={-1}
              data-testid={`inspector-char-${c.id}`}
              aria-pressed={active}
              onClick={(e) => {
                e.currentTarget.blur();
                activeEngine?.setCharacter(c.id);
                setCharacterId(c.id);
              }}
              style={{
                ...styles.charBtn,
                borderColor: active ? c.color : 'rgba(148, 163, 184, 0.25)',
                background: active ? `${c.color}28` : 'rgba(15, 23, 42, 0.72)',
                color: active ? '#F8FAFC' : '#94A3B8',
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Playback Controls & Frame Scrubber */}
      <div style={styles.controlsBox}>
        <div style={styles.controlRow}>
          <button
            type="button"
            tabIndex={-1}
            data-testid="inspector-play-toggle"
            onClick={(e) => {
              e.currentTarget.blur();
              updateInspector({ playing: !inspector.playing });
            }}
            style={styles.playBtn}
          >
            {inspector.playing ? '⏸ Pause Clip' : '▶ Play Clip'}
          </button>
          <span style={styles.monoReadout}>
            {Math.round((inspector.normalizedTime || 0) * 100)}%
          </span>
        </div>

        <label style={styles.sliderLabel}>
          <span>Frame Scrub</span>
          <input
            type="range"
            data-testid="inspector-scrub"
            min={0}
            max={1}
            step={0.01}
            value={inspector.normalizedTime ?? 0}
            onChange={(e) => {
              updateInspector({
                playing: false,
                normalizedTime: parseFloat(e.target.value),
              });
            }}
            style={styles.slider}
          />
        </label>

        <label style={styles.sliderLabel}>
          <span>Speed ({(inspector.speed ?? 1).toFixed(2)}×)</span>
          <input
            type="range"
            min={0.25}
            max={2.0}
            step={0.05}
            value={inspector.speed ?? 1.0}
            onChange={(e) => updateInspector({ speed: parseFloat(e.target.value) })}
            style={styles.slider}
          />
        </label>

        <label style={styles.sliderLabel}>
          <span>3/4 Yaw ({Math.round(inspector.previewYawDeg ?? 20)}°)</span>
          <input
            type="range"
            min={-45}
            max={45}
            step={1}
            value={inspector.previewYawDeg ?? 20}
            onChange={(e) => updateInspector({ previewYawDeg: parseFloat(e.target.value) })}
            style={styles.slider}
          />
        </label>

        <div style={styles.toggleRow}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              data-testid="inspector-skeleton-toggle"
              checked={Boolean(inspector.showSkeleton)}
              onChange={(e) => updateInspector({ showSkeleton: e.target.checked })}
            />
            <span>Skeleton Rig</span>
          </label>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              data-testid="inspector-wireframe-toggle"
              checked={Boolean(inspector.wireframe)}
              onChange={(e) => updateInspector({ wireframe: e.target.checked })}
            />
            <span>Wireframe</span>
          </label>
        </div>
      </div>

      {/* 27 Clip Selector */}
      <div style={styles.clipsScroll}>
        {CLIP_GROUPS.map((grp) => (
          <div key={grp.title} style={styles.groupBlock}>
            <div style={styles.groupTitle}>{grp.title}</div>
            <div style={styles.clipGrid}>
              {grp.clips.map((clip) => {
                const active = inspector.clipName === clip;
                return (
                  <button
                    key={clip}
                    type="button"
                    tabIndex={-1}
                    data-testid={`clip-btn-${clip}`}
                    aria-pressed={active}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      updateInspector({ clipName: clip, playing: true, normalizedTime: 0 });
                    }}
                    style={{
                      ...styles.clipBtn,
                      ...(active ? styles.clipBtnActive : null),
                    }}
                  >
                    {clip}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={styles.footer}>
        <span>HEAD (face_1): {rigTel.headAttached ? 'AFFIXED' : 'CHECK'}</span>
        <span>VOL: {rigTel.volumeProduct.toFixed(3)}</span>
      </div>
    </aside>
  );
}

const styles = {
  panel: {
    position: 'absolute',
    top: 58,
    right: 12,
    width: 294,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'calc(100dvh - 140px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'rgba(10, 14, 34, 0.94)',
    border: '1px solid rgba(56, 189, 248, 0.42)',
    borderRadius: 10,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.55)',
    padding: '10px 12px',
    color: '#E2E8F0',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 10.5,
    zIndex: 1120,
    pointerEvents: 'auto',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid rgba(110, 180, 255, 0.18)',
    paddingBottom: 6,
  },
  title: {
    fontSize: 11.5,
    fontWeight: 800,
    color: '#38BDF8',
    letterSpacing: 1.2,
  },
  subTitle: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 1,
  },
  closeBtn: {
    background: 'rgba(30, 41, 59, 0.85)',
    border: '1px solid rgba(148, 163, 184, 0.3)',
    borderRadius: 6,
    color: '#E2E8F0',
    fontSize: 12,
    padding: '2px 7px',
    cursor: 'pointer',
  },
  charRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
  },
  charBtn: {
    padding: '5px 8px',
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: 'solid',
    fontFamily: 'inherit',
    fontSize: 10.5,
    fontWeight: 800,
    letterSpacing: 1.0,
    cursor: 'pointer',
  },
  controlsBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    padding: '7px 8px',
    borderRadius: 7,
    background: 'rgba(5, 8, 22, 0.65)',
    border: '1px solid rgba(110, 180, 255, 0.14)',
  },
  controlRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  playBtn: {
    flex: 1,
    padding: '4px 8px',
    borderRadius: 5,
    border: '1px solid rgba(56, 189, 248, 0.45)',
    background: 'rgba(14, 116, 144, 0.55)',
    color: '#F8FAFC',
    fontFamily: 'inherit',
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
  },
  monoReadout: {
    fontSize: 10,
    fontWeight: 700,
    color: '#FACC15',
    minWidth: 34,
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  sliderLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    fontSize: 9.5,
    color: '#CBD5E1',
  },
  slider: {
    width: 132,
    accentColor: '#38BDF8',
    cursor: 'pointer',
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 10,
    color: '#CBD5E1',
    cursor: 'pointer',
  },
  clipsScroll: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    paddingRight: 2,
  },
  groupBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  groupTitle: {
    fontSize: 9,
    fontWeight: 800,
    color: '#FACC15',
    letterSpacing: 0.9,
  },
  clipGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 4,
  },
  clipBtn: {
    padding: '4px 6px',
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(71, 85, 105, 0.4)',
    background: 'rgba(15, 23, 42, 0.78)',
    color: '#CBD5E1',
    fontFamily: 'inherit',
    fontSize: 9.5,
    fontWeight: 600,
    textAlign: 'left',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    cursor: 'pointer',
  },
  clipBtnActive: {
    borderColor: '#38BDF8',
    background: 'rgba(14, 116, 144, 0.72)',
    color: '#F8FAFC',
    fontWeight: 800,
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    borderTop: '1px solid rgba(110, 180, 255, 0.16)',
    paddingTop: 5,
    fontSize: 9.5,
    fontWeight: 700,
    color: '#4ADE80',
  },
};

export default PoseInspectorPanel;
