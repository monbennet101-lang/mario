/**
 * Toast and Prompt — Spec §4.11
 * =============================
 * Tokenised Toast (unlock notice, checkpoint boon, controller hotplug)
 * and Prompt (contextual button hint adapting to Keyboard / DualShock 4).
 */

import React from 'react';
import { GoldShardIcon, StarMedallionIcon } from './Icons.jsx';

export function Toast({
  title = 'Checkpoint Reached',
  message = 'Progress saved & Super Form granted',
  kind = 'boon',
  forcedState = null,
  testId = 'ui-v2-toast',
}) {
  const derivedState = forcedState || 'default';
  const classes = [
    'ui-v2-toast',
    `is-${kind}`,
    derivedState !== 'default' ? `is-${derivedState}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      role="status"
      aria-live="polite"
      className={classes}
      data-testid={testId}
      data-state={derivedState}
    >
      <span className="ui-v2-counter-icon">
        {kind === 'unlock' ? <StarMedallionIcon slotState="collected" /> : <GoldShardIcon />}
      </span>
      <span className="ui-v2-col">
        <span className="ui-v2-kicker">{title}</span>
        <span className="ui-v2-body">{message}</span>
      </span>
    </div>
  );
}

export function Prompt({
  keyLabel = 'Z',
  actionLabel = 'Jump',
  forcedState = null,
  testId = 'ui-v2-prompt',
}) {
  const derivedState = forcedState || 'default';
  const classes = [
    'ui-v2-prompt',
    derivedState !== 'default' ? `is-${derivedState}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      aria-label={`${keyLabel}: ${actionLabel}`}
    >
      <span className="ui-v2-prompt-key">{keyLabel}</span>
      <span>{actionLabel}</span>
    </div>
  );
}

export default Toast;
