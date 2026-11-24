/**
 * TransitionOverlay — Spec §4.12 & §3.4
 * ======================================
 * Course Intro Card + quick transition curtain.
 * Enforces Spec §3.4 & §7: zero transitions block input for longer than half a second.
 */

import React, { useEffect } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { LivesBadge } from './LivesBadge.jsx';
import { CollectibleTracker } from './CollectibleTracker.jsx';
import { Prompt } from './ToastPrompt.jsx';
import { PrismCrestEmblem } from './Icons.jsx';

export function TransitionOverlay({
  mode = 'intro',
  courseCode = '1-1',
  courseTitle = 'Verdant Outskirts',
  worldName = 'World 1 · Sunlit Valley',
  lives = 5,
  playerIndex = 0,
  sharedLives = false,
  medallions = [false, false, false],
  isPlayStation = false,
  onBeginCourse,
}) {
  useEffect(() => {
    if (mode !== 'wipe') return undefined;
    const id = setTimeout(() => {
      onBeginCourse?.();
    }, TOKENS.motion.transition);
    return () => clearTimeout(id);
  }, [mode, onBeginCourse]);

  if (mode === 'wipe') {
    return (
      <div
        className="ui-v2-transition-layer"
        role="status"
        aria-label="Loading course"
        data-testid="ui-v2-transition-wipe"
      >
        <div className="ui-v2-row">
          <PrismCrestEmblem size={56} />
          <div className="ui-v2-col">
            <span className="ui-v2-kicker">{worldName}</span>
            <span className="ui-v2-title-md">{courseCode} · {courseTitle}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ui-v2-transition-layer"
      role="dialog"
      aria-modal="true"
      aria-label={`Course Intro ${courseCode} ${courseTitle}`}
      data-testid="ui-v2-screen-intro"
    >
      <div className="ui-v2-card ui-v2-card-compact">
        <div className="ui-v2-row-between">
          <span className="ui-v2-kicker">{worldName}</span>
          <span className="ui-v2-status-pill is-gold">Course {courseCode}</span>
        </div>

        <div className="ui-v2-row">
          <PrismCrestEmblem size={54} />
          <h2 className="ui-v2-title-md">{courseTitle}</h2>
        </div>

        <div className="ui-v2-panel-inset ui-v2-row-between">
          <LivesBadge lives={lives} playerIndex={playerIndex} shared={sharedLives} testId="intro-v2-lives" />
          <CollectibleTracker collected={medallions} testId="intro-v2-medallions" />
        </div>

        <button
          type="button"
          data-testid="btn-begin-stage"
          className="ui-v2-btn ui-v2-btn-primary"
          onClick={(e) => {
            e.currentTarget.blur();
            uiAudio.play(UISoundHook.MENU_CONFIRM);
            onBeginCourse?.();
          }}
        >
          Begin Course {courseCode}
        </button>

        <div className="ui-v2-prompt-bar">
          <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Start Now" testId="intro-prompt-confirm" />
        </div>
      </div>
    </div>
  );
}

export default TransitionOverlay;
