/**
 * CourseHUD — Phase 3 Composed Gameplay HUD (`src/ui/v2/components/CourseHUD.jsx`)
 * =================================================================================
 * Follows Spec §3.1 grouping rule & safe-area margin band (4vh):
 *   - Top-Left   (Survival):  LivesBadge + LifeMeter + ReserveItemBox (+ 2-4P compact strip)
 *   - Top-Centre (Objective): CollectibleTracker (3 Star Medallion slots incl. ghosted)
 *   - Top-Right  (Wealth & Context): Gold Shards CounterChip + Prism Petals CounterChip + Course Chip + optional Timer
 *   - Bottom-Left (Prompt):   Contextual control prompt (adapts to Keyboard / DualShock 4)
 *   - Bottom-Right (Toast):   Active non-blocking boon/unlock/checkpoint toast
 *
 * Subscribes to `engine.uiBus`:
 *   - Pickups spawn a flying token toward their counter BEFORE the counter number rolls.
 *   - Supports opt-in idle-fade (`settings.idleFadeEnabled`).
 *   - Supports 1–4P replicated compact per-player clusters without shrinking 1P HUD.
 *   - Supports optional Safe-Area & 70% Centre-Clear verification overlay.
 */

import React, { useEffect, useRef, useState } from 'react';
import { TOKENS } from '../tokens.js';
import { UIEvents } from '../../../engine/core/UIEventBus.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { CounterChip } from './CounterChip.jsx';
import { LifeMeter } from './LifeMeter.jsx';
import { LivesBadge } from './LivesBadge.jsx';
import { CollectibleTracker } from './CollectibleTracker.jsx';
import { Timer } from './Timer.jsx';
import { ReserveItemBox } from './ReserveItemBox.jsx';
import { Toast, Prompt } from './ToastPrompt.jsx';
import { GoldShardIcon, PrismPetalIcon, StarMedallionIcon, RunnerPortraitIcon, CrownIcon } from './Icons.jsx';

export function CourseHUD({
  engine = null,
  playerCount = 1,
  activeCharacterId = 'mario',
  crownHolderIndex = 0,
  settings = {},
  isPlayStation = false,
  isRespawning = false,
  respawnPenaltyCoins = 0,
  onActivateReserve = null,
}) {
  const [snapshot, setSnapshot] = useState({
    lives: 5,
    hp: 3,
    maxHp: 3,
    bonusHp: 0,
    shards: 0,
    petals: 15,
    medallions: [false, false, false],
    ghostedMedallions: [false, false, false],
    reserveItem: 'super_core',
    timerSec: 300,
    courseCode: '1-1',
    courseTitle: 'Verdant Outskirts',
  });

  const [flyingPickups, setFlyingPickups] = useState([]);
  const [activeToast, setActiveToast] = useState(null);
  const [isIdleHidden, setIsIdleHidden] = useState(false);

  const pendingShardDeltaRef = useRef(0);
  const pendingPetalDeltaRef = useRef(0);
  const flySeqRef = useRef(0);
  const idleTimerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const timersRef = useRef(new Set());

  const scheduleTimer = (fn, delay) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, delay);
    timersRef.current.add(id);
    return id;
  };

  const resetIdleClock = () => {
    setIsIdleHidden(false);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (settings.idleFadeEnabled) {
      idleTimerRef.current = setTimeout(() => {
        setIsIdleHidden(true);
      }, TOKENS.motion.idleDelay);
    }
  };

  useEffect(() => {
    resetIdleClock();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [settings.idleFadeEnabled]);

  useEffect(() => {
    if (!engine) return undefined;

    const readEngineSnapshot = () => {
      const sockets = engine.collectibles?.getCourseSockets?.() || [false, false, false];
      const banked = engine.checkpointState?.reached &&
        engine.checkpointState?.courseCode === (engine.currentRoom?.courseCode || '1-1')
        ? engine.checkpointState.bankedMedallions || [false, false, false]
        : [false, false, false];

      const rawShards = engine.collectibles?.shardCount ?? 0;
      const rawPetals = engine.prismPetals ?? 0;
      const displayShards = Math.max(0, rawShards - pendingShardDeltaRef.current);
      const displayPetals = Math.max(0, rawPetals - pendingPetalDeltaRef.current);

      const courseCode = engine.currentRoom?.courseCode || '1-1';
      const rawName = engine.currentRoom?.name || 'Verdant Outskirts';
      const courseTitle = rawName.includes(': ') ? rawName.split(': ')[1] : rawName;

      setSnapshot((prev) => {
        const nextTimer = Math.ceil(engine.levelKit?.timerSec ?? 300);
        const nextLives = engine.combat?.lives ?? prev.lives;
        const nextHp = engine.health ?? prev.hp;
        const nextMaxHp = engine.maxHealth ?? prev.maxHp;
        const nextBonusHp = engine.bonusHealth ?? prev.bonusHp;
        const nextReserve = engine.reserveItem ?? null;

        if (
          prev.lives === nextLives &&
          prev.hp === nextHp &&
          prev.maxHp === nextMaxHp &&
          prev.bonusHp === nextBonusHp &&
          prev.shards === displayShards &&
          prev.petals === displayPetals &&
          prev.reserveItem === nextReserve &&
          prev.timerSec === nextTimer &&
          prev.courseCode === courseCode &&
          prev.medallions[0] === Boolean(sockets[0]) &&
          prev.medallions[1] === Boolean(sockets[1]) &&
          prev.medallions[2] === Boolean(sockets[2]) &&
          prev.ghostedMedallions[0] === Boolean(banked[0]) &&
          prev.ghostedMedallions[1] === Boolean(banked[1]) &&
          prev.ghostedMedallions[2] === Boolean(banked[2])
        ) {
          return prev;
        }
        return {
          lives: nextLives,
          hp: nextHp,
          maxHp: nextMaxHp,
          bonusHp: nextBonusHp,
          shards: displayShards,
          petals: displayPetals,
          medallions: [Boolean(sockets[0]), Boolean(sockets[1]), Boolean(sockets[2])],
          ghostedMedallions: [Boolean(banked[0]), Boolean(banked[1]), Boolean(banked[2])],
          reserveItem: nextReserve,
          timerSec: nextTimer,
          courseCode,
          courseTitle,
        };
      });
    };

    readEngineSnapshot();
    const unsubTick = engine.subscribeUITick(readEngineSnapshot);

    const pushToast = (toast) => {
      setActiveToast(toast);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setActiveToast(null), TOKENS.motion.idleDelay);
    };

    const spawnFlyingPickup = (kind, screenX = 0.5, screenY = 0.55) => {
      const id = ++flySeqRef.current;
      const startX = Math.max(8, Math.min(92, Math.round(screenX * 100)));
      const startY = Math.max(12, Math.min(86, Math.round(screenY * 100)));
      const targetX = kind === 'medallion' ? 50 : kind === 'petal' ? 78 : 72;
      const targetY = 7;

      const entry = {
        id,
        kind,
        startX,
        startY,
        dxVw: targetX - startX,
        dyVh: targetY - startY,
      };
      setFlyingPickups((list) => [...list.slice(-7), entry]);
      scheduleTimer(() => {
        setFlyingPickups((list) => list.filter((item) => item.id !== id));
      }, TOKENS.motion.pickupFly);
    };

    const bus = engine.uiBus;
    const unsubs = [];

    if (bus) {
      unsubs.push(
        bus.on(UIEvents.COIN_COLLECTED, (payload) => {
          resetIdleClock();
          const currency = payload.currency === 'petal' ? 'petal' : 'gold';
          const amount = Math.max(1, Number(payload.amount) || 1);
          if (currency === 'gold') {
            pendingShardDeltaRef.current += amount;
          } else {
            pendingPetalDeltaRef.current += amount;
          }
          spawnFlyingPickup(currency, payload.screenX, payload.screenY);
          scheduleTimer(() => {
            if (currency === 'gold') {
              pendingShardDeltaRef.current = Math.max(0, pendingShardDeltaRef.current - amount);
            } else {
              pendingPetalDeltaRef.current = Math.max(0, pendingPetalDeltaRef.current - amount);
            }
            readEngineSnapshot();
          }, TOKENS.motion.pickupFly);
        })
      );

      unsubs.push(
        bus.on(UIEvents.SPECIAL_COLLECTED, (payload) => {
          resetIdleClock();
          spawnFlyingPickup('medallion', payload.screenX, payload.screenY);
          pushToast({
            kind: 'unlock',
            title: 'Star Medallion',
            message: `Collected ${payload.totalCollected || 1} of ${TOKENS.rules.collectibleSlots} (+10 Prism Petals)`,
          });
        })
      );

      unsubs.push(
        bus.on(UIEvents.CHECKPOINT_REACHED, (payload) => {
          resetIdleClock();
          uiAudio.play(UISoundHook.CHECKPOINT_CHIME);
          pushToast({
            kind: 'boon',
            title: 'Checkpoint Saved',
            message: payload.boonGranted ? 'Super Form restored & medallions banked' : 'Vitality restored & medallions banked',
          });
        })
      );

      unsubs.push(
        bus.on(UIEvents.DAMAGE_TAKEN, () => {
          resetIdleClock();
          readEngineSnapshot();
        })
      );

      unsubs.push(
        bus.on(UIEvents.LIFE_GAINED, (payload) => {
          resetIdleClock();
          pushToast({
            kind: 'boon',
            title: 'Extra Life',
            message: payload.source === 'shards100' ? '100 Gold Shards banked (+1 Life)' : 'Secret 1-Up discovered',
          });
        })
      );

      unsubs.push(
        bus.on(UIEvents.TIMER_WARNING, () => {
          resetIdleClock();
          uiAudio.play(UISoundHook.TIMER_WARNING);
          pushToast({
            kind: 'warning',
            title: 'Time Low',
            message: 'Less than 100 seconds remaining',
          });
        })
      );

      unsubs.push(
        bus.on(UIEvents.TOAST_REQUESTED, (payload) => {
          resetIdleClock();
          pushToast({
            kind: payload.kind || 'info',
            title: payload.title || 'Notice',
            message: payload.message || '',
          });
        })
      );
    }

    return () => {
      unsubTick?.();
      unsubs.forEach((u) => u());
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      timersRef.current.forEach((id) => clearTimeout(id));
      timersRef.current.clear();
    };
  }, [engine, settings.idleFadeEnabled]);

  const p1Index = activeCharacterId === 'luigi' ? 1 : 0;
  const clampedPlayers = Math.max(1, Math.min(4, Number(playerCount) || 1));
  const isMultiplayer = clampedPlayers > 1;

  const reserveHotkey = isPlayStation ? '△' : 'R';
  const pauseHotkey = isPlayStation ? 'Options' : 'Esc';

  return (
    <>
      {/* Flying Pickups Layer (pickups arrive at counter BEFORE number rolls) */}
      <div className="ui-v2-flying-layer" aria-hidden="true" data-testid="ui-v2-flying-layer">
        {flyingPickups.map((item) => (
          <span
            key={item.id}
            className="ui-v2-flying-pickup"
            style={{
              left: `${item.startX}%`,
              top: `${item.startY}%`,
              '--fly-dx': `${item.dxVw}vw`,
              '--fly-dy': `${item.dyVh}vh`,
            }}
          >
            {item.kind === 'medallion' ? (
              <StarMedallionIcon slotState="collected" />
            ) : item.kind === 'petal' ? (
              <PrismPetalIcon />
            ) : (
              <GoldShardIcon />
            )}
          </span>
        ))}
      </div>

      {/* Main HUD Safe-Area Container (4vh margin band, 70% centre clear) */}
      <div
        className={`ui-v2-hud-layer${isIdleHidden ? ' is-idle-hidden' : ''}`}
        data-testid="ui-v2-course-hud"
        data-player-count={clampedPlayers}
      >
        <div className="ui-v2-hud-top-stack">
          <div className="ui-v2-hud-top-band">
            {/* Top-Left: Survival Cluster */}
            <div className="ui-v2-slot-top-left" data-testid="ui-v2-slot-survival">
              <div className="ui-v2-cluster">
                <LivesBadge
                  lives={snapshot.lives}
                  playerIndex={p1Index}
                  shared={isMultiplayer}
                  testId="hud-v2-lives"
                />
                {!isMultiplayer && (
                  <LifeMeter
                    hp={snapshot.hp}
                    maxHp={snapshot.maxHp}
                    bonusHp={snapshot.bonusHp}
                    testId="hud-v2-life-meter"
                  />
                )}
                <ReserveItemBox
                  item={snapshot.reserveItem}
                  hotkeyLabel={reserveHotkey}
                  onActivate={onActivateReserve}
                  testId="hud-v2-reserve"
                />
              </div>
            </div>

            {/* Top-Centre: Objective Cluster */}
            <div className="ui-v2-slot-top-centre" data-testid="ui-v2-slot-objective">
              <CollectibleTracker
                collected={snapshot.medallions}
                ghosted={snapshot.ghostedMedallions}
                testId="hud-v2-medallions"
              />
            </div>

            {/* Top-Right: Wealth & Context Cluster */}
            <div className="ui-v2-slot-top-right" data-testid="ui-v2-slot-wealth">
              <CounterChip
                value={snapshot.shards}
                maxValue={TOKENS.rules.maxCoins}
                padDigits={2}
                variant="gold"
                label="Gold Shards"
                testId="hud-v2-shards"
              />
              <CounterChip
                value={snapshot.petals}
                maxValue={TOKENS.rules.maxSpecialCurrency}
                padDigits={3}
                variant="purple"
                label="Prism Petals"
                testId="hud-v2-petals"
              />
              <div className="ui-v2-course-chip" data-testid="hud-v2-course-chip" aria-label={`Course ${snapshot.courseCode} ${snapshot.courseTitle}`}>
                <span className="ui-v2-course-code">{snapshot.courseCode}</span>
              </div>
              <Timer
                seconds={snapshot.timerSec}
                enabled={settings.timerEnabled !== false}
                testId="hud-v2-timer"
              />
            </div>
          </div>

          {/* 2–4P Replicated Per-Player Compact Clusters (clean row below top band, never crowds Top-Right) */}
          {isMultiplayer && (
            <div className="ui-v2-mp-strip" data-testid="hud-v2-mp-strip" aria-label="Player vitality strip">
              {TOKENS.players.slice(0, clampedPlayers).map((player, idx) => (
                <div key={player.id} className="ui-v2-mp-card" data-testid={`hud-v2-mp-card-${idx}`}>
                  <span className="ui-v2-portrait-ring">
                    <RunnerPortraitIcon
                      emblem={player.emblem}
                      colorToken={player.colorToken}
                      accentToken={player.accentToken}
                    />
                  </span>
                  <span className="ui-v2-kicker">{player.short}</span>
                  {idx === crownHolderIndex && <CrownIcon />}
                  <LifeMeter
                    hp={idx === 0 ? snapshot.hp : 3}
                    maxHp={idx === 0 ? snapshot.maxHp : 3}
                    bonusHp={idx === 0 ? snapshot.bonusHp : 0}
                    compact
                    testId={`hud-v2-mp-life-${idx}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Band: Prompt (Bottom-Left) & Toast (Bottom-Right) */}
        <div className="ui-v2-hud-bottom-band">
          <div className="ui-v2-slot-bottom-left" data-testid="ui-v2-slot-prompt">
            <Prompt keyLabel={pauseHotkey} actionLabel="Pause" testId="hud-v2-prompt-pause" />
            {snapshot.reserveItem && (
              <Prompt keyLabel={reserveHotkey} actionLabel="Use Reserve" testId="hud-v2-prompt-reserve" />
            )}
          </div>
          <div className="ui-v2-slot-bottom-right" data-testid="ui-v2-slot-toast">
            {activeToast && (
              <Toast
                title={activeToast.title}
                message={activeToast.message}
                kind={activeToast.kind}
                testId="hud-v2-active-toast"
              />
            )}
          </div>
        </div>
      </div>

      {/* Fast Death & Checkpoint Respawn Recovery Banner (no dead ends, soft penalty) */}
      {isRespawning && (
        <div className="ui-v2-respawn-banner" role="status" data-testid="ui-v2-respawn-banner">
          <span className="ui-v2-title-sm">Back to Checkpoint</span>
          {respawnPenaltyCoins > 0 && (
            <span className="ui-v2-status-pill is-gold">-{respawnPenaltyCoins} Shards</span>
          )}
        </div>
      )}

      {/* Optional Safe-Area & 70% Centre-Clear Verification Overlay */}
      {settings.safeAreaOverlay && (
        <div className="ui-v2-safe-overlay" data-testid="ui-v2-safe-overlay" aria-hidden="true">
          <div className="ui-v2-safe-margin-box" />
          <div className="ui-v2-centre-clear-box">
            <span className="ui-v2-status-pill is-blue">70% Centre Clear Zone · 4vh Safe Margin</span>
          </div>
        </div>
      )}
    </>
  );
}

export default CourseHUD;
