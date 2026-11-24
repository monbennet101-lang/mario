/**
 * ResultsScreen & SoftGameOverCard — Spec §4.10 & §3.7
 * =====================================================
 * Course Clear results:
 *   - Animated tally roll for Score, Gold Shards, Prism Petals & Clear Time
 *   - 3 Star Medallion summary + Prism Crest flourish
 *   - Multiplayer 2–4P ranking table with Crown winner & carry-over +1000 bonus
 *   - Clear primary Next Course / World Map / Replay actions
 *
 * Soft Game Over recovery (Spec §3.7):
 *   - No dead ends, retry in <= 2 button presses
 *   - Restores 5 lives with a gentle capped Prism Petal penalty
 */

import React, { useEffect, useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { buildMultiplayerRankings, computeSoftGameOverPenalty } from '../store/uiStore.js';
import { CollectibleTracker } from './CollectibleTracker.jsx';
import { Prompt } from './ToastPrompt.jsx';
import { PrismCrestEmblem, CrownIcon, RunnerPortraitIcon } from './Icons.jsx';

function formatClock(totalSec = 0) {
  const safe = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ResultsScreen({
  courseCode = '1-1',
  courseTitle = 'Verdant Outskirts',
  isWorldVictory = false,
  score = 0,
  shards = 0,
  petals = 0,
  clearTimeSec = 0,
  medallions = [false, false, false],
  playerCount = 1,
  crownHolderIndex = 0,
  isPlayStation = false,
  onNextCourse,
  onOpenMap,
  onReplayCourse,
}) {
  const [shownScore, setShownScore] = useState(0);
  const [shownShards, setShownShards] = useState(0);
  const [shownPetals, setShownPetals] = useState(0);

  useEffect(() => {
    uiAudio.play(UISoundHook.COURSE_CLEAR_FANFARE);
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = TOKENS.motion.tick;
    let rafId = null;

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / Math.max(1, duration));
      const eased = 1 - Math.pow(1 - t, 3);
      setShownScore(Math.round(score * eased));
      setShownShards(Math.round(shards * eased));
      setShownPetals(Math.round(petals * eased));
      if (t < 1 && typeof requestAnimationFrame !== 'undefined') {
        rafId = requestAnimationFrame(step);
      } else {
        setShownScore(score);
        setShownShards(shards);
        setShownPetals(petals);
      }
    };

    if (typeof requestAnimationFrame !== 'undefined') {
      rafId = requestAnimationFrame(step);
    } else {
      setShownScore(score);
      setShownShards(shards);
      setShownPetals(petals);
    }

    return () => {
      if (rafId && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId);
      }
    };
  }, [score, shards, petals]);

  const rankings = buildMultiplayerRankings(playerCount, score, shards, crownHolderIndex);
  const isMultiplayer = rankings.length > 1;

  const act = (fn, sound = UISoundHook.MENU_CONFIRM) => (e) => {
    e.currentTarget.blur();
    uiAudio.play(sound);
    fn?.();
  };

  return (
    <div
      className="ui-v2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={isWorldVictory ? 'World 1 Complete' : 'Course Clear Results'}
      data-testid="ui-v2-screen-results"
    >
      <div className="ui-v2-card ui-v2-card-wide">
        <div className="ui-v2-row-between">
          <div className="ui-v2-row">
            <PrismCrestEmblem size={60} />
            <div className="ui-v2-col">
              <span className="ui-v2-kicker">
                {isWorldVictory ? 'World 1 Champion' : `Course ${courseCode} Cleared`}
              </span>
              <h2 className="ui-v2-title-lg">
                {isWorldVictory ? 'Sunlit Valley Complete!' : courseTitle}
              </h2>
            </div>
          </div>
          <CollectibleTracker collected={medallions} testId="results-v2-medallions" />
        </div>

        {/* Tally Roll Summary */}
        <div className="ui-v2-tally-grid" data-testid="results-v2-tally">
          <div className="ui-v2-tally-box">
            <span className="ui-v2-kicker">Total Score</span>
            <span className="ui-v2-display-num">{String(shownScore).padStart(6, '0')}</span>
          </div>
          <div className="ui-v2-tally-box">
            <span className="ui-v2-kicker">Gold Shards</span>
            <span className="ui-v2-display-num">{String(shownShards).padStart(2, '0')}</span>
          </div>
          <div className="ui-v2-tally-box">
            <span className="ui-v2-kicker">Prism Petals</span>
            <span className="ui-v2-display-num">{String(shownPetals).padStart(3, '0')}</span>
          </div>
          <div className="ui-v2-tally-box">
            <span className="ui-v2-kicker">Clear Time</span>
            <span className="ui-v2-display-num">{formatClock(clearTimeSec)}</span>
          </div>
        </div>

        {/* Multiplayer 2–4P Rankings & Crown Carry-Over */}
        {isMultiplayer && (
          <div className="ui-v2-col" data-testid="results-v2-mp-rankings">
            <span className="ui-v2-kicker">Party Ranking · Winner Carries the Crown (+1000 Bonus)</span>
            <div className="ui-v2-rank-list">
              {rankings.map((entry) => (
                <div
                  key={entry.player.id}
                  className={`ui-v2-rank-row${entry.winsCrown ? ' is-winner' : ''}`}
                  data-testid={`results-v2-rank-${entry.rank}`}
                >
                  <div className="ui-v2-row">
                    <span className="ui-v2-display-num-sm">#{entry.rank}</span>
                    <span className="ui-v2-portrait-ring">
                      <RunnerPortraitIcon
                        emblem={entry.player.emblem}
                        colorToken={entry.player.colorToken}
                        accentToken={entry.player.accentToken}
                      />
                    </span>
                    <span className="ui-v2-title-sm">{entry.player.name}</span>
                    {entry.winsCrown && (
                      <span className="ui-v2-status-pill is-gold">
                        <CrownIcon /> Crown Winner
                      </span>
                    )}
                    {entry.crownBonus > 0 && (
                      <span className="ui-v2-status-pill is-green">+{entry.crownBonus} Crown Bonus</span>
                    )}
                  </div>
                  <span className="ui-v2-display-num-sm">{String(entry.score).padStart(6, '0')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Primary & Secondary Actions */}
        <div className="ui-v2-row-between">
          <div className="ui-v2-row">
            <button
              type="button"
              data-testid="btn-results-replay"
              className="ui-v2-btn ui-v2-btn-secondary"
              onClick={act(onReplayCourse)}
            >
              Replay Course
            </button>
            <button
              type="button"
              data-testid="btn-results-map"
              className="ui-v2-btn ui-v2-btn-secondary"
              onClick={act(onOpenMap)}
            >
              World Map
            </button>
          </div>
          <button
            type="button"
            data-testid={isWorldVictory ? 'btn-play-again' : 'btn-next-stage'}
            className="ui-v2-btn ui-v2-btn-primary"
            onClick={act(onNextCourse)}
          >
            {isWorldVictory ? 'Return to World Map' : 'Next Course'}
          </button>
        </div>

        <div className="ui-v2-divider" />
        <div className="ui-v2-prompt-bar">
          <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Continue" testId="results-prompt-confirm" />
        </div>
      </div>
    </div>
  );
}

export function SoftGameOverCard({
  courseCode = '1-1',
  petals = 0,
  isPlayStation = false,
  onQuickRetry,
  onOpenMap,
}) {
  const recovery = computeSoftGameOverPenalty(petals);

  const act = (fn, sound = UISoundHook.MENU_CONFIRM) => (e) => {
    e.currentTarget.blur();
    uiAudio.play(sound);
    fn?.();
  };

  return (
    <div
      className="ui-v2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Continue From Checkpoint"
      data-testid="ui-v2-screen-gameover"
    >
      <div className="ui-v2-card ui-v2-card-compact">
        <span className="ui-v2-kicker">Course {courseCode} · Recovery</span>
        <h2 className="ui-v2-title-md">Out of Lives — Ready to Go Again?</h2>
        <p className="ui-v2-body">
          All Star Medallions and unlocked courses are safe. Restoring {recovery.restoredLives} lives costs a gentle{' '}
          {recovery.penalty} Prism Petals.
        </p>

        <div className="ui-v2-panel-inset ui-v2-row-between">
          <span className="ui-v2-status-pill is-green">+{recovery.restoredLives} Lives Restored</span>
          <span className="ui-v2-status-pill is-purple">-{recovery.penalty} Prism Petals</span>
        </div>

        <div className="ui-v2-col">
          <button
            type="button"
            data-testid="btn-retry-world1"
            className="ui-v2-btn ui-v2-btn-primary"
            onClick={act(onQuickRetry)}
          >
            Retry Course {courseCode} Now
          </button>
          <button
            type="button"
            data-testid="btn-gameover-map"
            className="ui-v2-btn ui-v2-btn-secondary"
            onClick={act(onOpenMap, UISoundHook.MENU_BACK)}
          >
            Return to World Map
          </button>
        </div>

        <div className="ui-v2-divider" />
        <div className="ui-v2-prompt-bar">
          <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Quick Retry" testId="gameover-prompt-confirm" />
        </div>
      </div>
    </div>
  );
}

export default ResultsScreen;
