/**
 * LivesBadge — Spec §4.3
 * ======================
 * Expressive runner portrait + tabular life count (cap 99), with a shared-lives
 * variant for 2–4P local co-op and all 7 states.
 */

import React, { useEffect, useRef, useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { RunnerPortraitIcon } from './Icons.jsx';

export function computeLivesBadgeState(lives = 3, shared = false) {
  const safe = Math.max(0, Math.min(TOKENS.rules.maxLives, Math.floor(Number.isFinite(lives) ? lives : 3)));
  return {
    lives: safe,
    text: `×${String(safe).padStart(2, '0')}`,
    shared: Boolean(shared),
    isEmpty: safe === 0,
    isMaximum: safe >= TOKENS.rules.maxLives,
  };
}

export function LivesBadge({
  lives = 3,
  playerIndex = 0,
  shared = false,
  forcedState = null,
  testId = 'ui-v2-lives-badge',
}) {
  const info = computeLivesBadgeState(lives, shared);
  const player = TOKENS.players[playerIndex] || TOKENS.players[0];
  const [popping, setPopping] = useState(false);
  const prevRef = useRef(info.lives);
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = info.lives;
    if (info.lives > prev) {
      uiAudio.play(UISoundHook.LIFE_UP);
      setPopping(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setPopping(false), TOKENS.motion.pop);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [info.lives]);

  const derivedState =
    forcedState ||
    (popping ? 'updating' : info.isMaximum ? 'maximum' : info.isEmpty ? 'empty' : 'default');

  const classes = [
    'ui-v2-lives-badge',
    derivedState !== 'default' ? `is-${derivedState}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      data-lives={info.lives}
      aria-label={`${info.shared ? 'Shared lives' : `${player.name} lives`}: ${info.lives}`}
    >
      <span className="ui-v2-portrait-ring">
        <RunnerPortraitIcon
          emblem={player.emblem}
          colorToken={player.colorToken}
          accentToken={player.accentToken}
        />
      </span>
      <span className="ui-v2-col">
        {info.shared && <span className="ui-v2-kicker">SHARED</span>}
        <span className="ui-v2-display-num">{info.text}</span>
      </span>
    </div>
  );
}

export default LivesBadge;
