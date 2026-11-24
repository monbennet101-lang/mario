/**
 * GameLifecycleOverlays — Stage 21 Full Game State Machine UI
 * ============================================================
 * Renders clean, high-contrast, WebGL-safe (zero backdrop-filter) overlays for:
 *   - TITLE_SCREEN
 *   - LEVEL_INTRO
 *   - PAUSE_MENU
 *   - PLAYER_DEATH_RESPAWN
 *   - GAME_OVER
 *   - STAGE_CLEAR (Stage Summary & World 1 Victory Screen)
 */

import React, { useEffect } from 'react';
import { GameLifecycleState, WORLD1_CAMPAIGN_COURSES } from '../../core/gameLoop.js';

function formatTime(totalSec = 0) {
  const s = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function GameLifecycleOverlays({
  lifecycleState,
  isWorldVictory,
  campaignStageIndex,
  engineRef,
  canvasRef,
  characterId,
  score = 0,
  shards = 0,
  medallions = 0,
  lives = 3,
  clearTimeSec = 0,
  controllerProfile = 'KEYBOARD',
}) {
  const course = WORLD1_CAMPAIGN_COURSES[campaignStageIndex] || WORLD1_CAMPAIGN_COURSES[0];
  const isPS4 = controllerProfile === 'DUALSHOCK4';

  useEffect(() => {
    const onKeyDown = (e) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (e.key === 'Enter') {
        if (lifecycleState === GameLifecycleState.TITLE_SCREEN) {
          e.preventDefault();
          engine.startCampaign(0);
          canvasRef.current?.focus();
        } else if (lifecycleState === GameLifecycleState.LEVEL_INTRO) {
          e.preventDefault();
          engine.beginGameplay();
          canvasRef.current?.focus();
        } else if (lifecycleState === GameLifecycleState.STAGE_CLEAR) {
          e.preventDefault();
          if (isWorldVictory) {
            engine.startCampaign(0);
          } else {
            engine.advanceToNextStage();
          }
          canvasRef.current?.focus();
        } else if (lifecycleState === GameLifecycleState.GAME_OVER) {
          e.preventDefault();
          engine.startCampaign(0);
          canvasRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lifecycleState, isWorldVictory, engineRef, canvasRef]);

  if (lifecycleState === GameLifecycleState.GAMEPLAY_ACTIVE) {
    return null;
  }

  const runAction = (fn) => (e) => {
    e.currentTarget.blur();
    const engine = engineRef.current;
    if (engine) fn(engine);
    canvasRef.current?.focus();
  };

  if (lifecycleState === GameLifecycleState.TITLE_SCREEN) {
    return (
      <section style={styles.scrim} data-testid="lifecycle-title-screen" aria-label="Title Screen">
        <div style={styles.titleCard}>
          <div style={styles.kicker}>World 1 · Kinematic Platformer Showcase</div>
          <h1 style={styles.heroTitle}>Prism Stride</h1>
          <p style={styles.subtitle}>
            Traverse Verdant Outskirts, Deep Slate Cavern, and Hydro-Pulse Ridge to confront the Dread-Shell Golem.
          </p>

          <div style={styles.metaRow}>
            <span>60 Hz Deterministic Engine</span>
            <span aria-hidden="true">·</span>
            <span>4 Handcrafted Stages</span>
            <span aria-hidden="true">·</span>
            <span>Original Procedural Audio &amp; 3D Rig</span>
          </div>

          <div style={styles.characterToggleRow}>
            <span style={styles.toggleLabel}>Runner</span>
            <div style={styles.segmentedControl}>
              <button
                type="button"
                onClick={runAction((eng) => eng.setCharacter('mario'))}
                style={characterId === 'mario' ? styles.segBtnActive : styles.segBtn}
              >
                Vanguard
              </button>
              <button
                type="button"
                onClick={runAction((eng) => eng.setCharacter('luigi'))}
                style={characterId === 'luigi' ? styles.segBtnActive : styles.segBtn}
              >
                Zephyr
              </button>
            </div>
          </div>

          <div style={styles.ctaRow}>
            <button
              type="button"
              data-testid="btn-start-world1"
              onClick={runAction((eng) => eng.startCampaign(0))}
              style={styles.primaryBtn}
            >
              Start World 1
            </button>
            <button
              type="button"
              data-testid="btn-boss-rush"
              onClick={runAction((eng) => eng.startCampaign(3))}
              style={styles.secondaryBtn}
            >
              Boss Sanctum (1-4)
            </button>
          </div>

          <div style={styles.keyHint}>
            {isPS4
              ? 'D-Pad / Stick Navigate · ✕ Confirm · □ Run · ○ Spin · L2 Pound · R2 Sprint · Options Pause'
              : 'Press Enter to begin · Arrow Keys / WASD to Move · Z / J to Jump · X / K to Run'}
          </div>
        </div>
      </section>
    );
  }

  if (lifecycleState === GameLifecycleState.LEVEL_INTRO) {
    return (
      <section style={styles.scrimSolid} data-testid="lifecycle-level-intro" aria-label="Stage Introduction">
        <div style={styles.compactCard}>
          <div style={styles.kicker}>Course {course.courseCode}</div>
          <h2 style={styles.stageTitle}>{course.title}</h2>
          <p style={styles.stageDesc}>{course.subtitle}</p>
          <div style={styles.metaRow}>
            <span style={styles.tabular}>Lives: {lives}</span>
            <span aria-hidden="true">·</span>
            <span style={styles.tabular}>Score: {score.toLocaleString()}</span>
          </div>
          <div style={styles.ctaRow}>
            <button
              type="button"
              data-testid="btn-begin-stage"
              onClick={runAction((eng) => eng.beginGameplay())}
              style={styles.primaryBtn}
            >
              Begin Stage
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (lifecycleState === GameLifecycleState.PAUSE_MENU) {
    return (
      <section style={styles.scrim} data-testid="lifecycle-pause-menu" aria-label="Pause Menu">
        <div style={styles.compactCard}>
          <div style={styles.kicker}>Game Paused · Audio Ducked</div>
          <h2 style={styles.stageTitle}>{course.courseCode}: {course.title}</h2>
          <div style={styles.metaRow}>
            <span style={styles.tabular}>Score {score.toLocaleString()}</span>
            <span aria-hidden="true">·</span>
            <span style={styles.tabular}>Shards {shards}</span>
            <span aria-hidden="true">·</span>
            <span style={styles.tabular}>Lives {lives}</span>
          </div>
          <div style={styles.verticalActions}>
            <button
              type="button"
              data-testid="btn-resume"
              onClick={runAction((eng) => eng.togglePause())}
              style={styles.primaryBtn}
            >
              Resume
            </button>
            <button
              type="button"
              data-testid="btn-restart-stage"
              onClick={runAction((eng) => eng.resetRoom())}
              style={styles.secondaryBtn}
            >
              Restart Stage
            </button>
            <button
              type="button"
              data-testid="btn-return-title"
              onClick={runAction((eng) => eng.returnToTitle())}
              style={styles.ghostBtn}
            >
              Return to Title
            </button>
          </div>
          {isPS4 && (
            <div style={{ ...styles.keyHint, marginTop: 14 }}>
              D-Pad / Stick Select · ✕ Confirm · ○ / Options Resume · R3 Menu
            </div>
          )}
        </div>
      </section>
    );
  }

  if (lifecycleState === GameLifecycleState.PLAYER_DEATH_RESPAWN) {
    return (
      <section style={styles.scrim} data-testid="lifecycle-respawn" aria-label="Respawning">
        <div style={styles.compactCard}>
          <div style={styles.kicker}>Course {course.courseCode}</div>
          <h2 style={styles.stageTitle}>{lives > 0 ? 'Preparing Respawn' : 'Last Life Lost'}</h2>
          <div style={styles.metaRow}>
            <span style={styles.tabular}>Lives Remaining: {lives}</span>
          </div>
        </div>
      </section>
    );
  }

  if (lifecycleState === GameLifecycleState.GAME_OVER) {
    return (
      <section style={styles.scrimSolid} data-testid="lifecycle-game-over" aria-label="Game Over">
        <div style={styles.compactCard}>
          <div style={{ ...styles.kicker, color: '#F87171' }}>World 1 Halted</div>
          <h2 style={styles.stageTitle}>Game Over</h2>
          <p style={styles.stageDesc}>
            Final Score <span style={styles.tabular}>{score.toLocaleString()}</span> · Shards{' '}
            <span style={styles.tabular}>{shards}</span>
          </p>
          <div style={styles.ctaRow}>
            <button
              type="button"
              data-testid="btn-retry-world1"
              onClick={runAction((eng) => eng.startCampaign(0))}
              style={styles.primaryBtn}
            >
              Retry World 1
            </button>
            <button
              type="button"
              data-testid="btn-gameover-title"
              onClick={runAction((eng) => eng.returnToTitle())}
              style={styles.secondaryBtn}
            >
              Return to Title
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (lifecycleState === GameLifecycleState.STAGE_CLEAR) {
    return (
      <section style={styles.scrim} data-testid="lifecycle-stage-clear" aria-label={isWorldVictory ? 'World 1 Victory' : 'Stage Clear'}>
        <div style={styles.titleCard}>
          <div style={{ ...styles.kicker, color: isWorldVictory ? '#FDE047' : '#38BDF8' }}>
            {isWorldVictory ? 'World 1 Complete · Dread-Shell Golem Shattered' : `Course ${course.courseCode} Complete`}
          </div>
          <h2 style={styles.heroTitle}>{isWorldVictory ? 'Victory!' : 'Stage Clear'}</h2>
          <p style={styles.subtitle}>
            {isWorldVictory
              ? 'You conquered all four World 1 trials and unlocked the World Exit Portal.'
              : `${course.title} cleared. Ready for the next course.`}
          </p>

          <div style={styles.statsGrid}>
            <div style={styles.statCell}>
              <div style={styles.statLabel}>Total Score</div>
              <div style={styles.statValue}>{score.toLocaleString()}</div>
            </div>
            <div style={styles.statCell}>
              <div style={styles.statLabel}>Gold Shards</div>
              <div style={styles.statValue}>{shards}</div>
            </div>
            <div style={styles.statCell}>
              <div style={styles.statLabel}>Star Medallions</div>
              <div style={styles.statValue}>{medallions}</div>
            </div>
            <div style={styles.statCell}>
              <div style={styles.statLabel}>Clear Time</div>
              <div style={styles.statValue}>{formatTime(clearTimeSec)}</div>
            </div>
          </div>

          <div style={styles.ctaRow}>
            {isWorldVictory ? (
              <button
                type="button"
                data-testid="btn-play-again"
                onClick={runAction((eng) => eng.startCampaign(0))}
                style={styles.primaryBtn}
              >
                Play Again
              </button>
            ) : (
              <button
                type="button"
                data-testid="btn-next-stage"
                onClick={runAction((eng) => eng.advanceToNextStage())}
                style={styles.primaryBtn}
              >
                Next Stage
              </button>
            )}
            <button
              type="button"
              data-testid="btn-victory-title"
              onClick={runAction((eng) => eng.returnToTitle())}
              style={styles.secondaryBtn}
            >
              Return to Title
            </button>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

const styles = {
  scrim: {
    position: 'absolute',
    inset: 0,
    zIndex: 45,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(7, 11, 25, 0.80)',
    padding: 24,
  },
  scrimSolid: {
    position: 'absolute',
    inset: 0,
    zIndex: 45,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(7, 11, 25, 0.94)',
    padding: 24,
  },
  titleCard: {
    width: 'min(580px, 92vw)',
    background: '#111827',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: 16,
    padding: '32px 36px',
    color: '#F8FAFC',
    textAlign: 'center',
    fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
  },
  compactCard: {
    width: 'min(440px, 90vw)',
    background: '#111827',
    border: '1px solid rgba(148, 163, 184, 0.24)',
    borderRadius: 16,
    padding: '28px 32px',
    color: '#F8FAFC',
    textAlign: 'center',
    fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif',
    boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
  },
  kicker: {
    fontSize: 13,
    fontWeight: 600,
    color: '#38BDF8',
    letterSpacing: '0.02em',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 'clamp(2.1rem, 4vw, 3.1rem)',
    fontWeight: 700,
    lineHeight: 1.1,
    margin: '0 0 12px',
    color: '#F8FAFC',
    textWrap: 'balance',
  },
  stageTitle: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.15,
    margin: '0 0 10px',
    color: '#F8FAFC',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 1.55,
    color: '#CBD5E1',
    margin: '0 auto 18px',
    maxWidth: '46ch',
  },
  stageDesc: {
    fontSize: 14,
    lineHeight: 1.5,
    color: '#CBD5E1',
    margin: '0 0 18px',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 22,
  },
  tabular: {
    fontVariantNumeric: 'tabular-nums',
  },
  characterToggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  toggleLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: 600,
  },
  segmentedControl: {
    display: 'inline-flex',
    gap: 4,
    padding: 4,
    borderRadius: 10,
    background: '#0B1220',
    border: '1px solid rgba(148, 163, 184, 0.18)',
  },
  segBtn: {
    padding: '7px 14px',
    borderRadius: 7,
    border: 'none',
    background: 'transparent',
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  segBtnActive: {
    padding: '7px 14px',
    borderRadius: 7,
    border: 'none',
    background: '#1E293B',
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  ctaRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  verticalActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    marginTop: 12,
  },
  primaryBtn: {
    padding: '12px 24px',
    borderRadius: 10,
    border: 'none',
    background: '#F59E0B',
    color: '#0F172A',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    minHeight: 44,
  },
  secondaryBtn: {
    padding: '12px 22px',
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.32)',
    background: '#1E293B',
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    minHeight: 44,
  },
  ghostBtn: {
    padding: '10px 20px',
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.18)',
    background: 'transparent',
    color: '#CBD5E1',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    minHeight: 42,
  },
  keyHint: {
    marginTop: 20,
    fontSize: 12,
    color: '#94A3B8',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 24,
    paddingTop: 16,
    borderTop: '1px solid rgba(148, 163, 184, 0.16)',
  },
  statCell: {
    padding: '10px 12px',
    background: '#0B1220',
    borderRadius: 10,
  },
  statLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 700,
    color: '#F8FAFC',
    fontVariantNumeric: 'tabular-nums',
  },
};

export default GameLifecycleOverlays;
