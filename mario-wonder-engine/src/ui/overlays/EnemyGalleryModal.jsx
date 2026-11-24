/**
 * EnemyGalleryModal — Original Enemy Gallery 1 Sprite Action Matrix & Kinematics
 * ===============================================================================
 * Interactive modal ([F8]) displaying live animated sprite strips for every action
 * state of Archetype A ("The Sproutling") and Archetype B ("The Hoplite"), exact
 * pixel dimensions, frame counts, kinematic curves, and AI Sprite Generator prompts.
 */

import React, { useEffect, useRef, useState } from 'react';
import EnemySpriteSheetBank, { ENEMY_SPRITE_MATRIX } from '@game/entities/EnemySpriteMatrix';
import MovementProfile from '@game/config/MovementProfile';

function SpriteStripPreview({ bank, enemyKey, actionKey, spec }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bank) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewW = 92;
    const viewH = 68;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let rafId = 0;
    const startMs = performance.now();

    const draw = (now) => {
      const elapsedSec = (now - startMs) / 1000;
      const frameIdx =
        spec.frames > 1
          ? Math.floor(elapsedSec * (spec.fps || 8)) % spec.frames
          : 0;

      ctx.clearRect(0, 0, viewW, viewH);

      // Subtle checkerboard pixel grid backdrop
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, viewW, viewH);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.08)';
      for (let gx = 0; gx < viewW; gx += 12) {
        for (let gy = 0; gy < viewH; gy += 12) {
          if (((gx + gy) / 12) % 2 === 0) ctx.fillRect(gx, gy, 12, 12);
        }
      }

      // Baseline floor guide
      const floorY = viewH - 10;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, floorY);
      ctx.lineTo(viewW - 8, floorY);
      ctx.stroke();

      const frameCanvas = bank.getFrameCanvas(enemyKey, actionKey, frameIdx);
      if (frameCanvas) {
        const scale = Math.min((viewW - 18) / spec.frameWidth, (viewH - 18) / spec.frameHeight, 1.4);
        const dw = spec.frameWidth * scale;
        const dh = spec.frameHeight * scale;
        const shakeX = spec.shakePx ? (frameIdx % 2 === 0 ? spec.shakePx : -spec.shakePx) * scale : 0;
        const cx = viewW * 0.5 + shakeX;
        const cy = floorY - dh * 0.5;

        ctx.save();
        ctx.translate(cx, cy);
        if (spec.inverted && actionKey !== 'launch_death') ctx.scale(1, -1);
        ctx.drawImage(frameCanvas, -dw * 0.5, -dh * 0.5, dw, dh);
        ctx.restore();
      }

      // Frame indicator
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`F${frameIdx + 1}/${spec.frames}`, viewW - 5, 4);

      if (spec.frames > 1) {
        rafId = requestAnimationFrame(draw);
      }
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [bank, enemyKey, actionKey, spec]);

  return (
    <div style={styles.clipCard}>
      <canvas
        ref={canvasRef}
        aria-label={`${enemyKey} ${spec.name} preview`}
        style={styles.previewCanvas}
      />
      <div style={styles.clipMeta}>
        <div style={styles.clipTitle}>{spec.name}</div>
        <div style={styles.clipSpecs}>
          {spec.frames}f {spec.loop ? 'loop' : 'once'} · {spec.frameWidth}×{spec.frameHeight}px
        </div>
        <div style={styles.clipSheet}>
          Sheet {spec.sheetWidth}×{spec.sheetHeight}px · {spec.fps} FPS
        </div>
      </div>
    </div>
  );
}

function EnemyGalleryModal({ visible, engine = null, onClose }) {
  const bankRef = useRef(null);
  const [selectedEnemy, setSelectedEnemy] = useState('sproutling');
  const [copied, setCopied] = useState(false);

  if (!bankRef.current && typeof document !== 'undefined') {
    bankRef.current = new EnemySpriteSheetBank();
  }

  useEffect(() => {
    if (!visible) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const sCfg = MovementProfile.enemyGallery.sproutling;
  const hCfg = MovementProfile.enemyGallery.hoplite;
  const activeSpec = ENEMY_SPRITE_MATRIX[selectedEnemy];

  const handleCopyMatrix = async () => {
    const payload = JSON.stringify(ENEMY_SPRITE_MATRIX, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      console.info('ENEMY_SPRITE_MATRIX:\n', payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  const handleLoadRoom9 = (e) => {
    e.currentTarget.blur();
    engine?.loadRoom(8);
    onClose?.();
  };

  return (
    <div
      data-testid="enemy-gallery-modal"
      role="dialog"
      aria-label="Original Enemy Gallery 1 Sprite Action Matrix"
      style={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <div>
            <div style={styles.eyebrow}>ORIGINAL ENEMY GALLERY 1 · SPRITE ACTION MATRIX</div>
            <h2 style={styles.title}>The Sproutling Walker &amp; The Hoplite Roller</h2>
          </div>
          <div style={styles.headerActions}>
            <button
              type="button"
              tabIndex={-1}
              onClick={handleLoadRoom9}
              style={styles.primaryBtn}
            >
              Play Room 9 Gallery
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={handleCopyMatrix}
              style={styles.secondaryBtn}
            >
              {copied ? 'Copied Matrix JSON' : 'Copy Matrix JSON'}
            </button>
            <button
              type="button"
              tabIndex={-1}
              onClick={onClose}
              aria-label="Close Enemy Gallery Modal"
              style={styles.closeBtn}
            >
              Close [F8]
            </button>
          </div>
        </div>

        {/* Archetype Selector Tabs */}
        <div style={styles.tabRow}>
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={selectedEnemy === 'sproutling'}
            onClick={() => setSelectedEnemy('sproutling')}
            style={{
              ...styles.tabBtn,
              ...(selectedEnemy === 'sproutling' ? styles.tabSproutlingActive : null),
            }}
          >
            Archetype A · The Sproutling (Patrol Walker · 3 Actions)
          </button>
          <button
            type="button"
            tabIndex={-1}
            aria-pressed={selectedEnemy === 'hoplite'}
            onClick={() => setSelectedEnemy('hoplite')}
            style={{
              ...styles.tabBtn,
              ...(selectedEnemy === 'hoplite' ? styles.tabHopliteActive : null),
            }}
          >
            Archetype B · The Hoplite (Clockwork Shell · 5 Actions)
          </button>
        </div>

        {/* Lore + Kinematic Summary Strip */}
        <div style={styles.summaryRow}>
          <div style={styles.loreBlock}>
            <div style={styles.sectionLabel}>DESIGN IDENTITY</div>
            <div style={styles.loreText}>{activeSpec.lore}</div>
          </div>

          <div style={styles.statsGrid}>
            {selectedEnemy === 'sproutling' ? (
              <>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>AABB</span>
                  <span style={styles.statVal}>{sCfg.widthPx}×{sCfg.heightPx}px</span>
                </div>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>PATROL VX</span>
                  <span style={styles.statVal}>{sCfg.patrolSpeed.toFixed(2)} t/s</span>
                </div>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>SQUASH</span>
                  <span style={styles.statVal}>{sCfg.squashedWidthPx}×{sCfg.squashedHeightPx}px · {sCfg.squashFrames}f</span>
                </div>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>REBOUND</span>
                  <span style={styles.statVal}>+{sCfg.reboundPassiveVy.toFixed(2)} / +{sCfg.reboundActiveVy.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>WALK / SHELL</span>
                  <span style={styles.statVal}>{hCfg.walkWidthPx}×{hCfg.walkHeightPx} / {hCfg.shellWidthPx}×{hCfg.shellHeightPx}px</span>
                </div>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>WALK / SLIDE</span>
                  <span style={styles.statVal}>{hCfg.walkSpeed.toFixed(2)} / {hCfg.shellSpeed.toFixed(2)} t/s</span>
                </div>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>DORMANCY</span>
                  <span style={styles.statVal}>{hCfg.dormancyFrames}f (shake @{hCfg.wakeupTelegraphFrame}f ±{hCfg.wakeupShakePx}px)</span>
                </div>
                <div style={styles.statCell}>
                  <span style={styles.statKey}>MULTI-KILL</span>
                  <span style={styles.statVal}>100→200→400→800→1K→2K→4K→1-UP</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live Animated Action Clips */}
        <div style={styles.sectionLabel}>LIVE SPRITE ACTION MATRIX</div>
        <div style={styles.clipsGrid}>
          {Object.entries(activeSpec.actions).map(([actionKey, spec]) => (
            <SpriteStripPreview
              key={`${selectedEnemy}-${actionKey}`}
              bank={bankRef.current}
              enemyKey={selectedEnemy}
              actionKey={actionKey}
              spec={spec}
            />
          ))}
        </div>

        {/* Explicit AI Sprite Generator Prompt Specs */}
        <div style={styles.sectionLabel}>AI SPRITE GENERATOR SPECIFICATION TABLE</div>
        <div style={styles.promptList}>
          {Object.entries(activeSpec.actions).map(([actionKey, spec]) => (
            <div key={actionKey} style={styles.promptRow}>
              <div style={styles.promptHeader}>
                <span style={styles.promptName}>{spec.name}</span>
                <span style={styles.promptDims}>
                  {spec.frames} frame{spec.frames > 1 ? 's' : ''} ({spec.loop ? 'looping' : 'non-looping'}) · {spec.frameWidth}×{spec.frameHeight}px · Strip {spec.sheetWidth}×{spec.sheetHeight}px
                </span>
              </div>
              <div style={styles.promptText}>{spec.prompt}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(5, 8, 22, 0.84)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1400,
    padding: 20,
    pointerEvents: 'auto',
  },
  modal: {
    width: 'min(920px, 95vw)',
    maxHeight: '88vh',
    overflowY: 'auto',
    background: '#0B1120',
    border: '1px solid rgba(148, 163, 184, 0.30)',
    borderRadius: 12,
    padding: '18px 20px',
    color: '#F1F5F9',
    fontFamily: '"JetBrains Mono", monospace',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.65)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.2,
    color: '#86EFAC',
    marginBottom: 4,
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 800,
    color: '#F8FAFC',
  },
  headerActions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  primaryBtn: {
    background: '#15803D',
    border: '1px solid #4ADE80',
    borderRadius: 6,
    color: '#F0FDF4',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'inherit',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  secondaryBtn: {
    background: '#1E293B',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 6,
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'inherit',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  closeBtn: {
    background: '#0F172A',
    border: '1px solid rgba(248, 113, 113, 0.45)',
    borderRadius: 6,
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'inherit',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  tabRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
    marginBottom: 14,
  },
  tabBtn: {
    background: '#111827',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: 8,
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: 700,
    fontFamily: 'inherit',
    padding: '8px 12px',
    cursor: 'pointer',
    textAlign: 'left',
  },
  tabSproutlingActive: {
    background: '#12291A',
    borderColor: '#4ADE80',
    color: '#DCFCE7',
  },
  tabHopliteActive: {
    background: '#271A0E',
    borderColor: '#F59E0B',
    color: '#FEF3C7',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: '1.15fr 1.45fr',
    gap: 12,
    marginBottom: 14,
    padding: 12,
    borderRadius: 8,
    background: '#0F172A',
    border: '1px solid rgba(148, 163, 184, 0.16)',
  },
  loreBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  loreText: {
    fontSize: 11.5,
    lineHeight: 1.5,
    color: '#CBD5E1',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
    fontVariantNumeric: 'tabular-nums',
  },
  statCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 8px',
    borderRadius: 6,
    background: '#090E1A',
    border: '1px solid rgba(148, 163, 184, 0.14)',
  },
  statKey: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.9,
    color: '#94A3B8',
  },
  statVal: {
    fontSize: 11,
    fontWeight: 700,
    color: '#F8FAFC',
  },
  sectionLabel: {
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 1.1,
    color: '#38BDF8',
    marginBottom: 8,
  },
  clipsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 10,
    marginBottom: 14,
  },
  clipCard: {
    background: '#0F172A',
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 8,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  previewCanvas: {
    width: 92,
    height: 68,
    borderRadius: 6,
    border: '1px solid rgba(148, 163, 184, 0.20)',
    display: 'block',
  },
  clipMeta: {
    width: '100%',
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  clipTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#F8FAFC',
  },
  clipSpecs: {
    fontSize: 10,
    color: '#93C5FD',
    marginTop: 2,
  },
  clipSheet: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  promptList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  promptRow: {
    background: '#0F172A',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: 8,
    padding: '8px 10px',
  },
  promptHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  promptName: {
    fontSize: 11,
    fontWeight: 700,
    color: '#FDE047',
  },
  promptDims: {
    fontSize: 10,
    color: '#7DD3FC',
    fontVariantNumeric: 'tabular-nums',
  },
  promptText: {
    fontSize: 11,
    lineHeight: 1.45,
    color: '#CBD5E1',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
};

export default EnemyGalleryModal;
