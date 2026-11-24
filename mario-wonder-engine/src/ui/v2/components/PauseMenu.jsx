/**
 * PauseMenu — Spec §4.7
 * ======================
 * Instant pause overlay (target under one tenth of a second), dims world
 * without mutating simulation state, displays course collectible status,
 * equipped Stride Charm, accessibility settings, and consistent Confirm/Cancel prompts.
 */

import React, { useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { CollectibleTracker } from './CollectibleTracker.jsx';
import { CounterChip } from './CounterChip.jsx';
import { Prompt } from './ToastPrompt.jsx';
import { SHOP_CATALOG } from '../store/uiStore.js';

export function PauseMenu({
  courseCode = '1-1',
  courseTitle = 'Verdant Outskirts',
  medallions = [false, false, false],
  ghostedMedallions = [false, false, false],
  shards = 0,
  petals = 0,
  equippedCharmId = 'charm_feather_glide',
  settings = {},
  isPlayStation = false,
  onResume,
  onRestart,
  onOpenShop,
  onOpenMap,
  onOpenGallery,
  onReturnTitle,
  onUpdateSettings,
}) {
  const [showSettings, setShowSettings] = useState(false);
  const equippedCharm = SHOP_CATALOG.find((item) => item.id === equippedCharmId) || SHOP_CATALOG[0];

  const handleAction = (fn, sound = UISoundHook.MENU_CONFIRM) => (e) => {
    e.currentTarget.blur();
    uiAudio.play(sound);
    fn?.();
  };

  return (
    <div
      className="ui-v2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Course Paused"
      data-testid="ui-v2-screen-pause"
    >
      <div className="ui-v2-card ui-v2-card-compact">
        <div className="ui-v2-row-between">
          <div className="ui-v2-col">
            <span className="ui-v2-kicker">Course {courseCode}</span>
            <h2 className="ui-v2-title-md">Paused</h2>
          </div>
          <span className="ui-v2-status-pill is-blue">{courseTitle}</span>
        </div>

        {/* Course Collectible & Wealth Status */}
        <div className="ui-v2-panel-inset ui-v2-col" data-testid="ui-v2-pause-collectibles">
          <div className="ui-v2-row-between">
            <span className="ui-v2-kicker">Star Medallions</span>
            <CollectibleTracker
              collected={medallions}
              ghosted={ghostedMedallions}
              testId="pause-v2-medallions"
            />
          </div>
          <div className="ui-v2-row-between">
            <CounterChip value={shards} maxValue={TOKENS.rules.maxCoins} padDigits={2} variant="gold" label="Gold Shards" testId="pause-v2-shards" />
            <CounterChip value={petals} maxValue={TOKENS.rules.maxSpecialCurrency} padDigits={3} variant="purple" label="Prism Petals" testId="pause-v2-petals" />
          </div>
          <div className="ui-v2-row-between">
            <span className="ui-v2-kicker">Equipped Charm</span>
            <span className="ui-v2-status-pill is-purple">{equippedCharm?.name || 'None'}</span>
          </div>
        </div>

        {showSettings ? (
          <div className="ui-v2-panel-inset ui-v2-col" data-testid="ui-v2-pause-settings">
            <div className="ui-v2-row-between">
              <span className="ui-v2-kicker">Text Scale</span>
              <div className="ui-v2-seg-group" role="group" aria-label="Text Scale">
                {TOKENS.rules.textScales.map((scale) => {
                  const active = Math.abs((settings.textScale || 1) - scale) < 0.02;
                  return (
                    <button
                      key={scale}
                      type="button"
                      className={`ui-v2-seg-btn${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={handleAction(() => onUpdateSettings?.({ textScale: scale }), UISoundHook.MENU_MOVE)}
                    >
                      {Math.round(scale * 100)}%
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="ui-v2-row-between">
              <span className="ui-v2-kicker">High Contrast</span>
              <button
                type="button"
                className={`ui-v2-btn ${settings.highContrast ? 'ui-v2-btn-success' : 'ui-v2-btn-secondary'}`}
                aria-pressed={Boolean(settings.highContrast)}
                onClick={handleAction(() => onUpdateSettings?.({ highContrast: !settings.highContrast }), UISoundHook.MENU_MOVE)}
              >
                {settings.highContrast ? 'On' : 'Off'}
              </button>
            </div>
            <div className="ui-v2-row-between">
              <span className="ui-v2-kicker">Course Timer</span>
              <button
                type="button"
                className={`ui-v2-btn ${settings.timerEnabled !== false ? 'ui-v2-btn-success' : 'ui-v2-btn-secondary'}`}
                aria-pressed={settings.timerEnabled !== false}
                onClick={handleAction(() => onUpdateSettings?.({ timerEnabled: settings.timerEnabled === false }), UISoundHook.MENU_MOVE)}
              >
                {settings.timerEnabled !== false ? 'Visible' : 'Timerless'}
              </button>
            </div>
            <div className="ui-v2-row-between">
              <span className="ui-v2-kicker">Idle-Fade HUD</span>
              <button
                type="button"
                className={`ui-v2-btn ${settings.idleFadeEnabled ? 'ui-v2-btn-success' : 'ui-v2-btn-secondary'}`}
                aria-pressed={Boolean(settings.idleFadeEnabled)}
                onClick={handleAction(() => onUpdateSettings?.({ idleFadeEnabled: !settings.idleFadeEnabled }), UISoundHook.MENU_MOVE)}
              >
                {settings.idleFadeEnabled ? 'On' : 'Off'}
              </button>
            </div>
            <button
              type="button"
              className="ui-v2-btn ui-v2-btn-primary"
              onClick={handleAction(() => setShowSettings(false), UISoundHook.MENU_BACK)}
            >
              Back to Pause Menu
            </button>
          </div>
        ) : (
          <div className="ui-v2-col">
            <button
              type="button"
              data-testid="btn-resume"
              className="ui-v2-btn ui-v2-btn-primary"
              onClick={handleAction(onResume, UISoundHook.MENU_CONFIRM)}
            >
              Resume Course
            </button>
            <div className="ui-v2-btn-grid-2">
              <button
                type="button"
                data-testid="btn-pause-restart"
                className="ui-v2-btn ui-v2-btn-secondary"
                onClick={handleAction(onRestart)}
              >
                Restart Course
              </button>
              <button
                type="button"
                data-testid="btn-pause-shop"
                className="ui-v2-btn ui-v2-btn-accent"
                onClick={handleAction(onOpenShop)}
              >
                Charms & Shop
              </button>
            </div>
            <div className="ui-v2-btn-grid-2">
              <button
                type="button"
                data-testid="btn-pause-map"
                className="ui-v2-btn ui-v2-btn-secondary"
                onClick={handleAction(onOpenMap)}
              >
                World Map
              </button>
              <button
                type="button"
                data-testid="btn-pause-settings"
                className="ui-v2-btn ui-v2-btn-secondary"
                onClick={handleAction(() => setShowSettings(true))}
              >
                Display & Assist
              </button>
            </div>
            <div className="ui-v2-btn-grid-2">
              <button
                type="button"
                data-testid="btn-pause-gallery"
                className="ui-v2-btn ui-v2-btn-ghost"
                onClick={handleAction(onOpenGallery)}
              >
                UI Gallery
              </button>
              <button
                type="button"
                data-testid="btn-pause-title"
                className="ui-v2-btn ui-v2-btn-ghost"
                onClick={handleAction(onReturnTitle, UISoundHook.MENU_BACK)}
              >
                Title Screen
              </button>
            </div>
          </div>
        )}

        <div className="ui-v2-divider" />
        <div className="ui-v2-prompt-bar">
          <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Confirm" testId="pause-prompt-confirm" />
          <Prompt keyLabel={isPlayStation ? '○' : 'Esc'} actionLabel="Resume" testId="pause-prompt-back" />
        </div>
      </div>
    </div>
  );
}

export default PauseMenu;
