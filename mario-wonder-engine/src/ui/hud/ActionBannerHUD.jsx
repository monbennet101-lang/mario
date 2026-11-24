/**
 * ActionBannerHUD — Stage 4 Floating Acrobatic Action Callout
 * ============================================================
 * Compact top-center floating banner that surfaces transient Stage 4
 * acrobatic & combat states ("SPIN TWIRL", "WALL SLIDE", "WALL JUMP!",
 * "GROUND POUND!") via direct DOM mutation on GameEngine render ticks.
 * Zero backdrop-filter, pointer-events: none, hidden during normal walk/idle.
 */

import React, { useEffect, useRef } from 'react';
import { PlayerState } from '@game/player/PlayerState';

const ACTION_CONFIG = {
  SPIN_JUMP: {
    label: 'SPIN JUMP!',
    sub: 'SPINJUMP -> SPINAIR TO LAND · +BOOST',
    accent: '#FACC15',
    border: 'rgba(250, 204, 21, 0.80)',
    bg: 'rgba(38, 28, 6, 0.92)',
  },
  SPIN_TWIRL: {
    label: 'SPIN TWIRL',
    sub: '1080° HOVER · COMBAT',
    accent: '#22D3EE',
    border: 'rgba(34, 211, 238, 0.72)',
    bg: 'rgba(8, 28, 48, 0.90)',
  },
  DOUBLE_JUMP: {
    label: 'DOUBLE JUMP!',
    sub: '2/3 COMBO · +BOOST',
    accent: '#38BDF8',
    border: 'rgba(56, 189, 248, 0.78)',
    bg: 'rgba(8, 28, 48, 0.90)',
  },
  TRIPLE_JUMP: {
    label: 'TRIPLE JUMP!',
    sub: '3/3 MAX PROPULSION!',
    accent: '#FACC15',
    border: 'rgba(250, 204, 21, 0.85)',
    bg: 'rgba(42, 24, 6, 0.94)',
  },
  FLUTTER_JUMP: {
    label: 'FLUTTER JUMP',
    sub: 'SCUTTLE GLIDE · BUOYANCY',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.78)',
    bg: 'rgba(8, 34, 18, 0.90)',
  },
  WALL_SLIDE: {
    label: 'WALL SLIDE',
    sub: '4.20 t/s GRIP',
    accent: '#F59E0B',
    border: 'rgba(245, 158, 11, 0.72)',
    bg: 'rgba(34, 20, 6, 0.90)',
  },
  WALL_JUMP: {
    label: 'WALL JUMP!',
    sub: 'KICK OFF · 8f LOCKOUT',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.78)',
    bg: 'rgba(8, 32, 18, 0.90)',
  },
  GROUND_POUND: {
    label: 'GROUND POUND!',
    sub: '28.0 t/s IMPACT · 0.65 TRAUMA',
    accent: '#FB7185',
    border: 'rgba(251, 113, 133, 0.80)',
    bg: 'rgba(42, 10, 22, 0.92)',
  },
  BUTT_SLIDE_LETHAL: {
    label: 'BUTT SLIDE · LETHAL',
    sub: '≥ 6.0 t/s ENEMY BULLDOZE',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.80)',
    bg: 'rgba(8, 32, 18, 0.90)',
  },
  BUTT_SLIDE_SAFE: {
    label: 'BUTT SLIDE · SAFE',
    sub: 'SLOPE ACCEL · CAP 14.5 t/s',
    accent: '#FACC15',
    border: 'rgba(250, 204, 21, 0.78)',
    bg: 'rgba(34, 24, 6, 0.90)',
  },
  SEMISOLID_DROP: {
    label: 'DROP-THROUGH',
    sub: '1-WAY SEMISOLID',
    accent: '#38BDF8',
    border: 'rgba(56, 189, 248, 0.75)',
    bg: 'rgba(8, 28, 48, 0.90)',
  },
  QUESTION_COIN: {
    label: 'COIN +1',
    sub: '[?] BLOCK · 2.5t HOP',
    accent: '#FACC15',
    border: 'rgba(250, 204, 21, 0.80)',
    bg: 'rgba(38, 26, 4, 0.92)',
  },
  BRICK_SHATTER: {
    label: 'BRICK SHATTER!',
    sub: '4-SHARD DEBRIS · IMPACT',
    accent: '#FB923C',
    border: 'rgba(251, 146, 60, 0.82)',
    bg: 'rgba(42, 18, 6, 0.92)',
  },
  COURSE_CLEAR: {
    label: 'COURSE CLEAR!',
    sub: 'GOAL FLAGPOLE CAPTURED',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.85)',
    bg: 'rgba(8, 34, 18, 0.94)',
  },
  POWER_SUPER: {
    label: 'GOOD! · SUPER FORM',
    sub: '3-STAGE ELASTIC GROWTH · +1000',
    accent: '#FACC15',
    border: 'rgba(250, 204, 21, 0.85)',
    bg: 'rgba(42, 24, 6, 0.94)',
  },
  POWER_FIRE: {
    label: 'FIRE POWER!',
    sub: 'FIREBALL [X/K] · MAX 2 ACTIVE',
    accent: '#FB923C',
    border: 'rgba(251, 146, 60, 0.85)',
    bg: 'rgba(46, 16, 4, 0.94)',
  },
  ENEMY_STOMP: {
    label: 'STOMP COMBO!',
    sub: '3f HITSTOP · HOLD Z FOR 4t+ REBOUND',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.80)',
    bg: 'rgba(8, 32, 18, 0.92)',
  },
  SHELL_KICK: {
    label: 'SHELL KICK!',
    sub: 'RICOCHET BOWLING · 9.0 t/s',
    accent: '#22D3EE',
    border: 'rgba(34, 211, 238, 0.80)',
    bg: 'rgba(8, 28, 48, 0.92)',
  },
  SHELL_CARRY: {
    label: 'CARRYING SHELL',
    sub: 'RELEASE [X] TO THROW @ 10.5 t/s',
    accent: '#A3E635',
    border: 'rgba(163, 230, 53, 0.78)',
    bg: 'rgba(14, 34, 8, 0.92)',
  },
  WARP_PIPE: {
    label: 'WARP PIPE!',
    sub: 'SUBTERRANEAN PASSAGE SUCTION',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.85)',
    bg: 'rgba(6, 36, 18, 0.94)',
  },
  WARP_TRANSITION: {
    label: 'WARP TUBE TRANSIT',
    sub: '45f CONDUIT SLIDE · SUB-AREA',
    accent: '#34D399',
    border: 'rgba(52, 211, 153, 0.85)',
    bg: 'rgba(6, 34, 24, 0.94)',
  },
  SUPER_SPRING: {
    label: 'SUPER SPRING!',
    sub: 'TIMED POWER BOUNCE · +22.50 t/s',
    accent: '#FDE047',
    border: 'rgba(253, 224, 71, 0.90)',
    bg: 'rgba(46, 26, 4, 0.94)',
  },
  SPRING_BOUNCE: {
    label: 'SPRING LAUNCH',
    sub: 'REBOUND IMPULSE · +16.00 t/s',
    accent: '#38BDF8',
    border: 'rgba(56, 189, 248, 0.82)',
    bg: 'rgba(8, 28, 48, 0.92)',
  },
  DAMAGE_HIT: {
    label: 'DAMAGE RECOIL',
    sub: '6f HITSTOP · 120f I-FRAMES',
    accent: '#FB7185',
    border: 'rgba(251, 113, 133, 0.82)',
    bg: 'rgba(48, 10, 22, 0.92)',
  },
  TWIST_ANTICIPATE: {
    label: 'TWIST APPROACHING!',
    sub: 'ACT 3 · TEN HERALD · TIDE SHIFT AHEAD',
    accent: '#F59E0B',
    border: 'rgba(245, 158, 11, 0.85)',
    bg: 'rgba(44, 22, 6, 0.94)',
  },
  TWIST_HERALD: {
    label: 'ACT 3 · TEN: TIDE INVERSION!',
    sub: 'GEYSERS REVERSED · ANTI-PHASE PLATFORMS · PHYSICS INVARIANT',
    accent: '#FACC15',
    border: 'rgba(250, 204, 21, 0.90)',
    bg: 'rgba(42, 24, 6, 0.96)',
  },
  STAR_MEDALLION: {
    label: 'STAR MEDALLION!',
    sub: 'CEILING ROUTE MASTERY REWARD · +1000',
    accent: '#FDE047',
    border: 'rgba(253, 224, 71, 0.90)',
    bg: 'rgba(42, 26, 4, 0.95)',
  },
  SECRET_ONE_UP: {
    label: 'SECRET 1-UP CACHE!',
    sub: 'HIGH CEILING ROUTE BONUS · +1 LIFE',
    accent: '#4ADE80',
    border: 'rgba(74, 222, 128, 0.90)',
    bg: 'rgba(8, 38, 18, 0.95)',
  },
  ACT_ENTER: {
    label: 'KISHŌTENKETSU ACT',
    sub: '4-ACT PROGRESSION · WATER SPOUT BEACH',
    accent: '#38BDF8',
    border: 'rgba(56, 189, 248, 0.85)',
    bg: 'rgba(8, 26, 48, 0.94)',
  },
};

function ActionBannerHUD({ engine, engineRef, topOffset = 44 }) {
  const rootRef = useRef(null);
  const labelRef = useRef(null);
  const subRef = useRef(null);
  const iconRef = useRef(null);

  useEffect(() => {
    const activeEngine = engine || engineRef?.current;
    if (!activeEngine) return;

    let holdKey = null;
    let holdUntilMs = 0;
    let lastTickSeen = -1;
    let prevRendered = '';

    const sync = (eng) => {
      const { player, loop } = eng;
      const now = performance.now();

      // Capture transient impact/launch/level-kit events once per simulation tick
      if (loop.tickCount !== lastTickSeen) {
        lastTickSeen = loop.tickCount;
        for (let i = 0; i < player.events.length; i++) {
          const ev = player.events[i];
          if (ev.type === 'jump' && ev.combo === 3) {
            holdKey = 'TRIPLE_JUMP';
            holdUntilMs = now + 520;
          } else if (ev.type === 'jump' && ev.combo === 2) {
            holdKey = 'DOUBLE_JUMP';
            holdUntilMs = now + 420;
          } else if (ev.type === 'spinJump') {
            holdKey = 'SPIN_JUMP';
            holdUntilMs = now + 460;
          } else if (ev.type === 'wallJump') {
            holdKey = 'WALL_JUMP';
            holdUntilMs = now + 380;
          } else if (ev.type === 'groundPoundImpact') {
            holdKey = 'GROUND_POUND';
            holdUntilMs = now + 440;
          } else if (ev.type === 'spinTwirl') {
            holdKey = 'SPIN_TWIRL';
            holdUntilMs = now + 320;
          } else if (ev.type === 'semisolidDrop') {
            holdKey = 'SEMISOLID_DROP';
            holdUntilMs = now + 300;
          } else if (ev.type === 'warpPipeEnter' || ev.type === 'warpPipeExit') {
            holdKey = 'WARP_PIPE';
            holdUntilMs = now + 520;
          }
        }
        const kitEvents = eng.levelKit?.events;
        if (kitEvents) {
          for (let i = 0; i < kitEvents.length; i++) {
            const lev = kitEvents[i];
            if (lev.type === 'flagpole') {
              holdKey = 'COURSE_CLEAR';
              holdUntilMs = now + 1500;
            } else if (lev.type === 'brickBreak') {
              holdKey = 'BRICK_SHATTER';
              holdUntilMs = now + 480;
            } else if (lev.type === 'questionBlockCoin') {
              holdKey = 'QUESTION_COIN';
              holdUntilMs = now + 420;
            }
          }
        }
        const combatEvents = eng.combat?.events;
        if (combatEvents) {
          for (let i = 0; i < combatEvents.length; i++) {
            const cev = combatEvents[i];
            if (cev.type === 'powerUp') {
              holdKey = cev.powerUpType === 'fire_flower' ? 'POWER_FIRE' : 'POWER_SUPER';
              holdUntilMs = now + 700;
            } else if (cev.type === 'stomp') {
              holdKey = 'ENEMY_STOMP';
              holdUntilMs = now + 420;
            } else if (cev.type === 'shellKick') {
              holdKey = 'SHELL_KICK';
              holdUntilMs = now + 440;
            } else if (cev.type === 'damage') {
              holdKey = 'DAMAGE_HIT';
              holdUntilMs = now + 520;
            }
          }
        }
        const propEvents = eng.props?.events;
        if (propEvents) {
          for (let i = 0; i < propEvents.length; i++) {
            const pev = propEvents[i];
            if (pev.type === 'springBounce') {
              holdKey = pev.isSuper ? 'SUPER_SPRING' : 'SPRING_BOUNCE';
              holdUntilMs = now + (pev.isSuper ? 640 : 420);
            }
          }
        }
        const levelEvents = eng.levelEngine?.events;
        if (levelEvents) {
          for (let i = 0; i < levelEvents.length; i++) {
            const lev = levelEvents[i];
            if (lev.type === 'twistHerald') {
              holdKey = 'TWIST_HERALD';
              holdUntilMs = now + 1800;
            } else if (lev.type === 'twistAnticipate') {
              holdKey = 'TWIST_ANTICIPATE';
              holdUntilMs = now + 950;
            } else if (lev.type === 'starMedallion') {
              holdKey = 'STAR_MEDALLION';
              holdUntilMs = now + 950;
            } else if (lev.type === 'secretOneUp') {
              holdKey = 'SECRET_ONE_UP';
              holdUntilMs = now + 1050;
            } else if (lev.type === 'actEnter' && !holdKey) {
              ACTION_CONFIG.ACT_ENTER.label = lev.label || 'KISHŌTENKETSU ACT';
              holdKey = 'ACT_ENTER';
              holdUntilMs = now + 900;
            }
          }
        }
      }

      let activeKey = null;
      if (player.state === PlayerState.IN_WARP_TRANSITION) {
        activeKey = 'WARP_TRANSITION';
      } else if (player.state === PlayerState.WARP_PIPE) {
        activeKey = 'WARP_PIPE';
      } else if (
        player.state === PlayerState.GROUND_POUND_WINDUP ||
        player.state === PlayerState.GROUND_POUND_FALL ||
        player.state === PlayerState.GROUND_POUND_LAND
      ) {
        activeKey = 'GROUND_POUND';
      } else if (player.state === PlayerState.WALL_SLIDE) {
        activeKey = 'WALL_SLIDE';
      } else if (player.state === PlayerState.SPIN_JUMP) {
        activeKey = 'SPIN_JUMP';
      } else if (player.state === PlayerState.SPIN_TWIRL) {
        activeKey = 'SPIN_TWIRL';
      } else if (player.state === PlayerState.FLUTTER_JUMP) {
        activeKey = 'FLUTTER_JUMP';
      } else if (player.state === PlayerState.WALL_JUMP) {
        activeKey = 'WALL_JUMP';
      } else if (player.state === PlayerState.BUTT_SLIDE) {
        activeKey = player.isSlideLethal ? 'BUTT_SLIDE_LETHAL' : 'BUTT_SLIDE_SAFE';
      } else if (player.carriedEntity) {
        activeKey = 'SHELL_CARRY';
      } else if (holdKey && now < holdUntilMs) {
        activeKey = holdKey;
      } else {
        holdKey = null;
      }

      const renderSignature = activeKey || 'NONE';
      if (renderSignature === prevRendered) return;
      prevRendered = renderSignature;

      const el = rootRef.current;
      if (!el) return;

      if (!activeKey) {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(-6px) scale(0.96)';
        el.dataset.action = '';
        return;
      }

      const cfg = ACTION_CONFIG[activeKey];
      el.style.opacity = '1';
      el.style.transform = 'translateX(-50%) translateY(0px) scale(1)';
      el.style.background = cfg.bg;
      el.style.borderColor = cfg.border;
      el.dataset.action = activeKey;

      if (labelRef.current) {
        labelRef.current.textContent = cfg.label;
        labelRef.current.style.color = cfg.accent;
      }
      if (subRef.current) {
        subRef.current.textContent = cfg.sub;
      }
      if (iconRef.current) {
        iconRef.current.style.background = cfg.accent;
      }
    };

    sync(activeEngine);
    return activeEngine.subscribeUITick(sync);
  }, [engine, engineRef]);

  return (
    <div
      ref={rootRef}
      data-testid="action-banner-hud"
      data-action=""
      aria-live="polite"
      style={{ ...styles.banner, top: topOffset }}
    >
      <span ref={iconRef} style={styles.dot} />
      <span ref={labelRef} data-testid="action-banner-label" style={styles.label}>
        SPIN TWIRL
      </span>
      <span ref={subRef} style={styles.sub}>1080° HOVER · COMBAT</span>
    </div>
  );
}

const styles = {
  banner: {
    position: 'absolute',
    top: 44,
    left: '50%',
    transform: 'translateX(-50%) translateY(-6px) scale(0.96)',
    opacity: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 14px',
    borderRadius: 8,
    border: '1px solid rgba(34, 211, 238, 0.72)',
    background: 'rgba(8, 28, 48, 0.90)',
    boxShadow: '0 8px 22px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'none',
    userSelect: 'none',
    zIndex: 850,
    transition: 'opacity 90ms ease-out, transform 90ms ease-out',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    whiteSpace: 'nowrap',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    background: '#22D3EE',
    flexShrink: 0,
  },
  label: {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 1.4,
    color: '#22D3EE',
  },
  sub: {
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: 0.7,
    color: '#CBD5E1',
    opacity: 0.85,
  },
};

export default ActionBannerHUD;
