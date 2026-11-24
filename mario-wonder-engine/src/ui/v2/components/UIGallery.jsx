/**
 * UIGallery — Phase 1 & Phase 2 Live Component Review Surface (`src/ui/v2/components/UIGallery.jsx`)
 * ===================================================================================================
 * Renders every UI v2 component across ALL 7 spec states:
 *   default, updating, empty, maximum, disabled, focused, pressed
 * Plus interactive controls for:
 *   - Text Scale (100% / 115% / 130%)
 *   - High Contrast theme toggle
 *   - 1–4 Player HUD preview
 *   - Safe-Area & 70% Centre-Clear overlay toggle
 *   - Sound Hook audition buttons
 */

import React, { useState } from 'react';
import { TOKENS, COMPONENT_STATES } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { CounterChip } from './CounterChip.jsx';
import { LifeMeter } from './LifeMeter.jsx';
import { LivesBadge } from './LivesBadge.jsx';
import { CollectibleTracker } from './CollectibleTracker.jsx';
import { Timer } from './Timer.jsx';
import { ReserveItemBox } from './ReserveItemBox.jsx';
import { Toast, Prompt } from './ToastPrompt.jsx';
import { PrismCrestEmblem, CharmIcon, CrownIcon, LockIcon, CheckFlagIcon } from './Icons.jsx';

export function UIGallery({
  settings = {},
  onUpdateSettings,
  onClose,
}) {
  const [liveCount, setLiveCount] = useState(42);
  const [liveHp, setLiveHp] = useState(3);
  const [liveBonusHp, setLiveBonusHp] = useState(0);
  const [lastSound, setLastSound] = useState('Click any sound hook to audition');

  const triggerSound = (hook) => {
    uiAudio.play(hook);
    setLastSound(`Played: ${hook}`);
  };

  return (
    <div
      className="ui-v2-gallery-screen"
      role="dialog"
      aria-modal="true"
      aria-label="UI v2 Component Gallery"
      data-testid="ui-v2-screen-gallery"
    >
      <div className="ui-v2-gallery-container">
        {/* Header & Live Accessibility Controls */}
        <div className="ui-v2-gallery-section">
          <div className="ui-v2-row-between">
            <div className="ui-v2-row">
              <PrismCrestEmblem size={48} />
              <div className="ui-v2-col">
                <span className="ui-v2-kicker">Prism Stride · Design System v2</span>
                <h1 className="ui-v2-title-md">Component & State Gallery</h1>
              </div>
            </div>
            <button
              type="button"
              data-testid="btn-gallery-close"
              className="ui-v2-btn ui-v2-btn-primary"
              onClick={() => {
                uiAudio.play(UISoundHook.MENU_BACK);
                onClose?.();
              }}
            >
              Close Gallery
            </button>
          </div>

          <div className="ui-v2-row-between">
            <div className="ui-v2-row">
              <span className="ui-v2-kicker">Text Scale</span>
              <div className="ui-v2-seg-group" role="group" aria-label="Gallery Text Scale">
                {TOKENS.rules.textScales.map((scale) => {
                  const active = Math.abs((settings.textScale || 1) - scale) < 0.02;
                  return (
                    <button
                      key={scale}
                      type="button"
                      data-testid={`gallery-scale-${Math.round(scale * 100)}`}
                      aria-pressed={active}
                      className={`ui-v2-seg-btn${active ? ' is-active' : ''}`}
                      onClick={() => {
                        uiAudio.play(UISoundHook.MENU_MOVE);
                        onUpdateSettings?.({ textScale: scale });
                      }}
                    >
                      {Math.round(scale * 100)}%
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                data-testid="gallery-toggle-hc"
                aria-pressed={Boolean(settings.highContrast)}
                className={`ui-v2-btn ${settings.highContrast ? 'ui-v2-btn-success' : 'ui-v2-btn-secondary'}`}
                onClick={() => {
                  uiAudio.play(UISoundHook.MENU_MOVE);
                  onUpdateSettings?.({ highContrast: !settings.highContrast });
                }}
              >
                {settings.highContrast ? 'High Contrast: On' : 'High Contrast: Off'}
              </button>
              <button
                type="button"
                data-testid="gallery-toggle-safe"
                aria-pressed={Boolean(settings.safeAreaOverlay)}
                className={`ui-v2-btn ${settings.safeAreaOverlay ? 'ui-v2-btn-accent' : 'ui-v2-btn-secondary'}`}
                onClick={() => {
                  uiAudio.play(UISoundHook.MENU_MOVE);
                  onUpdateSettings?.({ safeAreaOverlay: !settings.safeAreaOverlay });
                }}
              >
                {settings.safeAreaOverlay ? 'Safe-Area Overlay: On' : 'Safe-Area Overlay: Off'}
              </button>
            </div>
          </div>
        </div>

        {/* 1. CounterChip across all 7 states + interactive roll */}
        <section className="ui-v2-gallery-section" data-testid="gallery-section-counter">
          <div className="ui-v2-row-between">
            <h2 className="ui-v2-title-sm">1. CounterChip (Gold Shards & Prism Petals)</h2>
            <div className="ui-v2-row">
              <button
                type="button"
                className="ui-v2-btn ui-v2-btn-secondary"
                onClick={() => setLiveCount((v) => Math.min(99, v + 7))}
              >
                +7 Live Roll
              </button>
              <CounterChip value={liveCount} maxValue={99} padDigits={2} variant="gold" testId="gallery-counter-live" />
              <CounterChip value={liveCount * 4} maxValue={999} padDigits={3} variant="purple" testId="gallery-counter-purple" />
            </div>
          </div>
          <div className="ui-v2-gallery-grid">
            {COMPONENT_STATES.map((st) => (
              <div key={st} className="ui-v2-gallery-cell">
                <span className="ui-v2-kicker">{st}</span>
                <CounterChip
                  value={st === 'empty' ? 0 : st === 'maximum' ? 99 : 28}
                  maxValue={99}
                  padDigits={2}
                  variant="gold"
                  forcedState={st}
                  testId={`gallery-counter-${st}`}
                />
              </div>
            ))}
          </div>
        </section>

        {/* 2. LifeMeter across all 7 states + expandable Life-Up demo */}
        <section className="ui-v2-gallery-section" data-testid="gallery-section-lifemeter">
          <div className="ui-v2-row-between">
            <h2 className="ui-v2-title-sm">2. LifeMeter (3 Base + 3 Expandable Life-Up Wedges)</h2>
            <div className="ui-v2-row">
              <button
                type="button"
                className="ui-v2-btn ui-v2-btn-danger"
                onClick={() => {
                  if (liveBonusHp > 0) setLiveBonusHp((b) => b - 1);
                  else setLiveHp((h) => Math.max(0, h - 1));
                }}
              >
                Hit (-1)
              </button>
              <button
                type="button"
                className="ui-v2-btn ui-v2-btn-success"
                onClick={() => {
                  setLiveHp(3);
                  setLiveBonusHp(3);
                }}
              >
                Expand (+3 Green)
              </button>
              <LifeMeter hp={liveHp} maxHp={3} bonusHp={liveBonusHp} testId="gallery-lifemeter-live" />
            </div>
          </div>
          <div className="ui-v2-gallery-grid">
            {COMPONENT_STATES.map((st) => (
              <div key={st} className="ui-v2-gallery-cell">
                <span className="ui-v2-kicker">{st}</span>
                <LifeMeter
                  hp={st === 'empty' ? 0 : st === 'updating' ? 1 : 3}
                  maxHp={3}
                  bonusHp={st === 'maximum' ? 3 : 0}
                  forcedState={st}
                  testId={`gallery-lifemeter-${st}`}
                />
              </div>
            ))}
          </div>
        </section>

        {/* 3. LivesBadge & 4. CollectibleTracker */}
        <section className="ui-v2-gallery-section" data-testid="gallery-section-lives-collectible">
          <h2 className="ui-v2-title-sm">3. LivesBadge & 4. CollectibleTracker (with Ghosted Checkpoint Slot)</h2>
          <div className="ui-v2-gallery-grid">
            {COMPONENT_STATES.map((st) => (
              <div key={st} className="ui-v2-gallery-cell">
                <span className="ui-v2-kicker">Lives · {st}</span>
                <LivesBadge
                  lives={st === 'empty' ? 0 : st === 'maximum' ? 99 : 5}
                  shared={st === 'focused'}
                  forcedState={st}
                  testId={`gallery-lives-${st}`}
                />
              </div>
            ))}
          </div>
          <div className="ui-v2-gallery-grid">
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Empty</span>
              <CollectibleTracker collected={[false, false, false]} forcedState="empty" />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">1 Collected + 1 Ghosted (Checkpoint)</span>
              <CollectibleTracker collected={[true, false, false]} ghosted={[false, true, false]} />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Updating Pop</span>
              <CollectibleTracker collected={[true, true, false]} forcedState="updating" />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Maximum (3/3)</span>
              <CollectibleTracker collected={[true, true, true]} forcedState="maximum" />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Disabled / Focused / Pressed</span>
              <CollectibleTracker collected={[true, false, false]} forcedState="focused" />
            </div>
          </div>
        </section>

        {/* 5. Timer & 6. ReserveItemBox */}
        <section className="ui-v2-gallery-section" data-testid="gallery-section-timer-reserve">
          <h2 className="ui-v2-title-sm">5. Timer & 6. ReserveItemBox</h2>
          <div className="ui-v2-gallery-grid">
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Timer · Normal</span>
              <Timer seconds={248} beepFinalTen={false} />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Timer · Warning (&lt; 100s)</span>
              <Timer seconds={64} beepFinalTen={false} />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Timer · Expired</span>
              <Timer seconds={0} beepFinalTen={false} />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Timer · Disabled</span>
              <Timer seconds={300} forcedState="disabled" beepFinalTen={false} />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Reserve · Empty</span>
              <ReserveItemBox item={null} />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Reserve · Super Core</span>
              <ReserveItemBox item="super_core" />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Reserve · Flame Orb (Focused)</span>
              <ReserveItemBox item="flame_orb" forcedState="focused" />
            </div>
            <div className="ui-v2-gallery-cell">
              <span className="ui-v2-kicker">Reserve · Vitality Bloom (Disabled)</span>
              <ReserveItemBox item="life_up" disabled />
            </div>
          </div>
        </section>

        {/* 7. Toast, Prompt, Map Node States & Buttons */}
        <section className="ui-v2-gallery-section" data-testid="gallery-section-toast-nodes">
          <h2 className="ui-v2-title-sm">7. Toast, Prompt, Map Nodes & Interactive States</h2>
          <div className="ui-v2-row">
            <Toast title="Checkpoint Saved" message="Super Form restored & medallions banked" kind="boon" />
            <Toast title="Star Medallion" message="Collected 2 of 3 (+10 Prism Petals)" kind="unlock" />
            <Toast title="Time Low" message="Under 100 seconds remaining" kind="warning" />
          </div>
          <div className="ui-v2-row">
            <Prompt keyLabel="Z" actionLabel="Jump" />
            <Prompt keyLabel="✕" actionLabel="Confirm" forcedState="focused" />
            <Prompt keyLabel="○" actionLabel="Cancel" forcedState="pressed" />
            <Prompt keyLabel="R" actionLabel="Use Reserve" forcedState="disabled" />
          </div>
          <div className="ui-v2-row">
            <span className="ui-v2-map-node is-locked"><LockIcon /><span className="ui-v2-kicker">LOCKED</span></span>
            <span className="ui-v2-map-node is-new"><span className="ui-v2-display-num-sm">1-1</span><span className="ui-v2-kicker">NEW</span></span>
            <span className="ui-v2-map-node is-cleared"><CheckFlagIcon /><span className="ui-v2-kicker">CLEARED</span></span>
            <span className="ui-v2-map-node is-perfect"><CrownIcon /><span className="ui-v2-kicker">PERFECT</span></span>
            <span className="ui-v2-map-node is-focused"><CharmIcon icon="feather" /><span className="ui-v2-kicker">FOCUSED</span></span>
          </div>
        </section>

        {/* 8. Sound Hooks Audition Bar */}
        <section className="ui-v2-gallery-section" data-testid="gallery-section-audio">
          <div className="ui-v2-row-between">
            <h2 className="ui-v2-title-sm">8. Named UI Sound Hooks (Spec §3.5)</h2>
            <span className="ui-v2-status-pill is-blue" data-testid="gallery-audio-status">{lastSound}</span>
          </div>
          <div className="ui-v2-row">
            {Object.values(UISoundHook).map((hook) => (
              <button
                key={hook}
                type="button"
                className="ui-v2-btn ui-v2-btn-secondary"
                onClick={() => triggerSound(hook)}
              >
                {hook}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default UIGallery;
