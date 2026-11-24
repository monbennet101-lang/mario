/**
 * SpeedometerHUD — Wonder Momentum & Speed Tier Gauge
 * ====================================================
 * Compact bottom-right corner cluster showing horizontal velocity,
 * speed tier (IDLE / WALK / RUN / SPRINT / MAX DASH), and 8 dynamic
 * chevrons transitioning from soft white (Walk) -> amber (Run) ->
 * electric cyan (Max Dash). Updates purely via DOM refs on GameEngine ticks.
 */

import React, { useEffect, useRef } from 'react';
import MovementProfile from '@game/config/MovementProfile';

const CHEVRON_COUNT = 8;

function SpeedometerHUD({ engine, engineRef }) {
  const speedRef = useRef(null);
  const tierRef = useRef(null);
  const actionRef = useRef(null);
  const chevronRefs = useRef([]);
  const barRef = useRef(null);

  useEffect(() => {
    const activeEngine = engine || engineRef?.current;
    if (!activeEngine) return;

    const prev = {};
    const setText = (ref, key, val) => {
      if (ref.current && prev[key] !== val) {
        prev[key] = val;
        ref.current.textContent = val;
      }
    };

    const sync = (eng) => {
      const { player } = eng;
      const absVx = Math.abs(player.vel.x);
      const maxSpeed = MovementProfile.locomotion.runTopSpeed;
      const walkTop = MovementProfile.locomotion.walkTopSpeed;
      const ratio = Math.min(1, absVx / Math.max(0.01, maxSpeed));
      const tier = player.speedTier;

      setText(speedRef, 'speed', absVx.toFixed(1));

      let tierLabel = 'IDLE';
      let tierColor = '#94A3B8';
      let activeFill = '#F8FAFC';

      if (tier === 'MAX') {
        tierLabel = 'MAX DASH';
        tierColor = '#22D3EE';
        activeFill = '#22D3EE';
      } else if (tier === 'SPRINT') {
        tierLabel = 'SPRINT';
        tierColor = '#38BDF8';
        activeFill = '#22D3EE';
      } else if (tier === 'RUN') {
        tierLabel = 'RUN';
        tierColor = '#F59E0B';
        activeFill = '#F59E0B';
      } else if (tier === 'WALK') {
        tierLabel = 'WALK';
        tierColor = '#F8FAFC';
        activeFill = '#F8FAFC';
      }

      if (tierRef.current && prev.tierLabel !== tierLabel) {
        prev.tierLabel = tierLabel;
        tierRef.current.textContent = tierLabel;
        tierRef.current.style.color = tierColor;
      }

      // Action state callout (STAGE 2-5)
      let actionLabel = 'READY';
      let actionColor = '#64748B';
      if (player.state === 'GroundPoundWindup') {
        actionLabel = 'POUND WINDUP';
        actionColor = '#FB7185';
      } else if (player.state === 'GroundPoundFall') {
        actionLabel = 'GROUND POUND!';
        actionColor = '#F97316';
      } else if (player.state === 'GroundPoundLand') {
        actionLabel = 'POUND IMPACT';
        actionColor = '#F97316';
      } else if (player.state === 'ButtSlide') {
        actionLabel = player.isSlideLethal ? 'LETHAL SLIDE!' : 'BUTT SLIDE';
        actionColor = player.isSlideLethal ? '#4ADE80' : '#FACC15';
      } else if (player.state === 'WallSlide') {
        actionLabel = 'WALL SLIDE';
        actionColor = '#F59E0B';
      } else if (player.state === 'WallJump') {
        actionLabel = 'WALL JUMP!';
        actionColor = '#4ADE80';
      } else if (player.state === 'SpinTwirl') {
        actionLabel = 'SPIN TWIRL';
        actionColor = '#22D3EE';
      } else if (player.state === 'FlutterJump') {
        actionLabel = 'FLUTTER JUMP';
        actionColor = '#4ADE80';
      } else if (player.state === 'ApexFloat') {
        actionLabel = 'APEX FLOAT';
        actionColor = '#7DD3FC';
      } else if (player.state === 'Jump') {
        actionLabel = 'JUMPING ↑';
        actionColor = '#4ADE80';
      } else if (player.state === 'Fall') {
        actionLabel = 'FALLING ↓';
        actionColor = '#FACC15';
      } else if (player.state === 'Skid') {
        actionLabel = 'SKID BRAKE';
        actionColor = '#FB923C';
      } else if (player.state === 'Pivot') {
        actionLabel = 'PIVOT 3×';
        actionColor = '#A78BFA';
      } else if (player.state === 'CrouchSlide') {
        actionLabel = player.standingBlocked ? 'TUNNEL SLIDE' : 'CROUCH SLIDE';
        actionColor = '#38BDF8';
      } else if (player.isCrouched) {
        actionLabel = player.standingBlocked ? 'LOW CEILING' : 'CROUCH';
        actionColor = '#38BDF8';
      } else if (player.isOnSlope) {
        actionLabel = `SLOPE ${Math.abs(player.slopeAngleDeg).toFixed(0)}°`;
        actionColor = '#FACC15';
      } else if (absVx > 0.05) {
        actionLabel = player.facingRight ? 'MOVING →' : '← MOVING';
        actionColor = '#CBD5E1';
      }

      if (actionRef.current && prev.actionLabel !== actionLabel) {
        prev.actionLabel = actionLabel;
        actionRef.current.textContent = actionLabel;
        actionRef.current.style.color = actionColor;
      }

      // Update 8 chevrons
      const litCount = absVx <= 0.05 ? 0 : Math.max(1, Math.ceil(ratio * CHEVRON_COUNT));
      const key = `${litCount}:${activeFill}:${walkTop}`;
      if (prev.chevrons !== key) {
        prev.chevrons = key;
        for (let i = 0; i < CHEVRON_COUNT; i++) {
          const path = chevronRefs.current[i];
          if (!path) continue;
          if (i < litCount) {
            const segRatio = (i + 1) / CHEVRON_COUNT;
            let segColor = '#F8FAFC';
            if (segRatio > 0.80) segColor = '#22D3EE';
            else if (segRatio > walkTop / maxSpeed) segColor = '#F59E0B';
            path.setAttribute('stroke', segColor);
            path.setAttribute('opacity', '1');
          } else {
            path.setAttribute('stroke', '#334155');
            path.setAttribute('opacity', '0.55');
          }
        }
      }

      if (barRef.current) {
        const pct = Math.round(ratio * 100);
        if (prev.pct !== pct || prev.fill !== activeFill) {
          prev.pct = pct;
          prev.fill = activeFill;
          barRef.current.style.transform = `scaleX(${ratio.toFixed(3)})`;
          barRef.current.style.background = activeFill;
        }
      }
    };

    sync(activeEngine);
    return activeEngine.subscribeUITick(sync);
  }, [engine, engineRef]);

  return (
    <aside
      data-testid="speedometer-hud"
      aria-label="Momentum Speedometer"
      className="mwe-speedometer-hud"
      style={styles.container}
    >
      <div style={styles.topRow}>
        <div style={styles.numWrap}>
          <span ref={speedRef} data-testid="speedometer-value" style={styles.speedNum}>0.0</span>
          <span style={styles.unit}>t/s</span>
        </div>
        <div style={styles.metaCol}>
          <span ref={tierRef} data-testid="speedometer-tier" style={styles.tierLabel}>IDLE</span>
          <span ref={actionRef} data-testid="speedometer-action" style={styles.actionLabel}>READY</span>
        </div>
      </div>

      {/* 8-Chevron Segmented Speed Arc */}
      <svg
        viewBox="0 0 160 18"
        width="160"
        height="18"
        aria-hidden="true"
        style={styles.chevronSvg}
      >
        {Array.from({ length: CHEVRON_COUNT }, (_, i) => {
          const x = 6 + i * 19;
          return (
            <path
              key={i}
              ref={(el) => { chevronRefs.current[i] = el; }}
              d={`M ${x} 3 L ${x + 8} 9 L ${x} 15`}
              fill="none"
              stroke="#334155"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.55"
            />
          );
        })}
      </svg>

      {/* Smooth fill bar beneath chevrons */}
      <div style={styles.barTrack}>
        <div ref={barRef} style={styles.barFill} />
      </div>
    </aside>
  );
}

const styles = {
  container: {
    background: 'rgba(10, 14, 34, 0.90)',
    border: '1px solid rgba(110, 180, 255, 0.28)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    borderRadius: 10,
    padding: '8px 12px 9px',
    zIndex: 900,
    pointerEvents: 'none',
    userSelect: 'none',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontVariantNumeric: 'tabular-nums',
  },
  topRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  numWrap: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 4,
  },
  speedNum: {
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1,
    color: '#F8FAFC',
    textShadow: '0 2px 6px rgba(0, 0, 0, 0.7)',
  },
  unit: {
    fontSize: 10,
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  metaCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 1,
  },
  tierLabel: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.0,
    whiteSpace: 'nowrap',
    color: '#94A3B8',
  },
  actionLabel: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.6,
    whiteSpace: 'nowrap',
    color: '#64748B',
  },
  chevronSvg: {
    display: 'block',
    width: '100%',
    height: 16,
  },
  barTrack: {
    marginTop: 4,
    width: '100%',
    height: 3,
    borderRadius: 2,
    background: 'rgba(30, 41, 59, 0.85)',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    height: '100%',
    transformOrigin: 'left center',
    transform: 'scaleX(0)',
    background: '#F8FAFC',
  },
};

export default SpeedometerHUD;
