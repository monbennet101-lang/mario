/**
 * ReserveItemBox — Spec §4.6
 * ==========================
 * Stored power-up/item frame with `empty`, `stored`, and `activate` states,
 * dedicated button/touch trigger, hotkey badge, and sound hook.
 */

import React, { useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { ReserveItemIcon } from './Icons.jsx';

const ITEM_LABELS = {
  super_core: 'Super Core',
  flame_orb: 'Flame Orb',
  life_up: 'Vitality Bloom',
};

export function ReserveItemBox({
  item = null,
  hotkeyLabel = 'R',
  onActivate = null,
  forcedState = null,
  disabled = false,
  testId = 'ui-v2-reserve-box',
}) {
  const [activating, setActivating] = useState(false);
  const isEmpty = !item;

  const derivedState =
    forcedState ||
    (disabled
      ? 'disabled'
      : activating
        ? 'updating'
        : isEmpty
          ? 'empty'
          : 'stored');

  const classes = [
    'ui-v2-reserve-box',
    !isEmpty && derivedState !== 'empty' ? 'is-stored' : 'is-empty',
    derivedState !== 'default' && derivedState !== 'stored' ? `is-${derivedState}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handleClick = (e) => {
    e.currentTarget.blur();
    if (disabled || isEmpty) return;
    uiAudio.play(UISoundHook.RESERVE_ACTIVATE);
    setActivating(true);
    setTimeout(() => setActivating(false), TOKENS.motion.pop);
    if (onActivate) onActivate(item);
  };

  const itemName = item ? ITEM_LABELS[item] || 'Stored Item' : 'Empty';

  return (
    <button
      type="button"
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      data-item={item || 'none'}
      disabled={disabled || derivedState === 'disabled'}
      onClick={handleClick}
      aria-label={`Reserve Item Box: ${itemName}${!isEmpty ? `. Press ${hotkeyLabel} to use` : ''}`}
      title={`Reserve: ${itemName} [${hotkeyLabel}]`}
    >
      <ReserveItemIcon item={derivedState === 'empty' ? null : item} />
      <span className="ui-v2-reserve-key" aria-hidden="true">
        {hotkeyLabel}
      </span>
    </button>
  );
}

export default ReserveItemBox;
