/**
 * Timer — Spec §4.5
 * =================
 * Optional course countdown timer:
 *   - Normal (> 100 s)
 *   - Warning (< 100 s): turns red + pulse + explicit `!` urgency glyph
 *   - Optional final 10 s beep sound hook (`timerWarning`)
 *   - Expired (0 s): explicit `TIME` status
 *   - Optional mode (`enabled={false}` renders nothing for timerless modes)
 */

import React, { useEffect, useRef } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { ClockIcon } from './Icons.jsx';

export function computeTimerState(seconds = 300, maxSeconds = 300) {
  const safe = Math.max(0, Math.min(999, Math.floor(Number.isFinite(seconds) ? seconds : 300)));
  const isExpired = safe === 0;
  const isWarning = !isExpired && safe < TOKENS.rules.timerWarningSec;
  const isFinalTen = !isExpired && safe <= TOKENS.rules.timerFinalBeepSec;
  const isMaximum = safe >= maxSeconds;
  return {
    seconds: safe,
    text: String(safe).padStart(3, '0'),
    isWarning,
    isFinalTen,
    isExpired,
    isMaximum,
  };
}

export function Timer({
  seconds = 300,
  maxSeconds = 300,
  enabled = true,
  beepFinalTen = true,
  forcedState = null,
  testId = 'ui-v2-timer',
}) {
  const info = computeTimerState(seconds, maxSeconds);
  const lastBeepedRef = useRef(-1);

  useEffect(() => {
    if (!enabled || !beepFinalTen) return;
    if (info.isFinalTen && lastBeepedRef.current !== info.seconds) {
      lastBeepedRef.current = info.seconds;
      uiAudio.play(UISoundHook.TIMER_WARNING);
    }
  }, [enabled, beepFinalTen, info.isFinalTen, info.seconds]);

  if (!enabled && !forcedState) {
    return null;
  }

  const derivedState =
    forcedState ||
    (info.isExpired
      ? 'expired'
      : info.isWarning
        ? 'warning'
        : info.isMaximum
          ? 'maximum'
          : 'default');

  const classes = [
    'ui-v2-timer',
    derivedState !== 'default' ? `is-${derivedState}` : '',
    info.isWarning && derivedState !== 'disabled' ? 'is-warning' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      data-seconds={info.seconds}
      aria-label={`Time remaining: ${info.seconds} seconds${info.isWarning ? ' low time warning' : ''}`}
    >
      <span className="ui-v2-counter-icon">
        <ClockIcon />
      </span>
      {(info.isWarning || info.isExpired || derivedState === 'warning') && (
        <span className="ui-v2-timer-warn-mark" aria-hidden="true">
          !
        </span>
      )}
      <span className="ui-v2-display-num ui-v2-counter-digits is-three">
        {info.isExpired ? '000' : info.text}
      </span>
    </div>
  );
}

export default Timer;
