/**
 * CollectibleTracker — Spec §4.4
 * ==============================
 * 3-slot Star Medallion tracker supporting:
 *   - empty (uncollected hollow socket)
 *   - collected (bright gold star medallion)
 *   - ghosted (translucent banked-from-checkpoint state per spec §2.1)
 */

import React, { useEffect, useRef, useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { StarMedallionIcon } from './Icons.jsx';

export function computeCollectibleSlots(collected = [false, false, false], ghosted = [false, false, false]) {
  const count = TOKENS.rules.collectibleSlots;
  const slots = [];
  let collectedCount = 0;
  for (let i = 0; i < count; i++) {
    const isCollected = Boolean(collected[i]);
    const isGhosted = !isCollected && Boolean(ghosted[i]);
    if (isCollected) collectedCount++;
    slots.push({
      index: i,
      state: isCollected ? 'collected' : isGhosted ? 'ghosted' : 'empty',
    });
  }
  return {
    slots,
    collectedCount,
    isEmpty: collectedCount === 0 && !slots.some((s) => s.state === 'ghosted'),
    isMaximum: collectedCount >= count,
  };
}

export function CollectibleTracker({
  collected = [false, false, false],
  ghosted = [false, false, false],
  forcedState = null,
  testId = 'ui-v2-collectible-tracker',
}) {
  const info = computeCollectibleSlots(collected, ghosted);
  const [poppingSlot, setPoppingSlot] = useState(-1);
  const prevRef = useRef(info.slots.map((s) => s.state));
  const timerRef = useRef(null);

  useEffect(() => {
    const prev = prevRef.current;
    for (let i = 0; i < info.slots.length; i++) {
      if (prev[i] !== 'collected' && info.slots[i].state === 'collected') {
        uiAudio.play(UISoundHook.SPECIAL_COIN_CHIME);
        setPoppingSlot(i);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setPoppingSlot(-1), TOKENS.motion.pop);
      }
    }
    prevRef.current = info.slots.map((s) => s.state);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [info.slots]);

  const derivedState =
    forcedState ||
    (poppingSlot >= 0 ? 'updating' : info.isMaximum ? 'maximum' : info.isEmpty ? 'empty' : 'default');

  const classes = [
    'ui-v2-collectible-tracker',
    derivedState !== 'default' ? `is-${derivedState}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      data-testid={testId}
      data-state={derivedState}
      data-collected-count={info.collectedCount}
      aria-label={`Star Medallions: ${info.collectedCount} of ${TOKENS.rules.collectibleSlots}`}
    >
      {info.slots.map((slot) => {
        const isPop = poppingSlot === slot.index || (forcedState === 'updating' && slot.index === 0);
        const slotClass = [
          'ui-v2-medallion-slot',
          `is-${slot.state}`,
          isPop ? 'is-updating' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <span
            key={slot.index}
            className={slotClass}
            data-testid={`${testId}-slot-${slot.index}`}
            data-slot-state={slot.state}
            title={`Star Medallion ${slot.index + 1}: ${slot.state}`}
          >
            <StarMedallionIcon slotState={slot.state} />
          </span>
        );
      })}
    </div>
  );
}

export default CollectibleTracker;
