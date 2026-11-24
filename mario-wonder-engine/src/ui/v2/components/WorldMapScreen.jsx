/**
 * WorldMapScreen — Spec §4.8 & §3.6
 * ==================================
 * World 1 Map showing:
 *   - MapHUD header (shared lives, Prism Petals, total Star Medallions, equipped Charm)
 *   - Interactive course & outpost nodes with states: locked, new (flashing), cleared, perfect
 *   - Connecting SVG path trail showing unlocked vs locked routes
 *   - Focused Course Header Card displaying course name, subtitle & 3 Star Medallion chips
 */

import React, { useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { WORLD1_NODES, SHOP_CATALOG, resolveMapNodeState, countFileMedallions } from '../store/uiStore.js';
import { LivesBadge } from './LivesBadge.jsx';
import { CounterChip } from './CounterChip.jsx';
import { CollectibleTracker } from './CollectibleTracker.jsx';
import { Prompt } from './ToastPrompt.jsx';
import { PrismCrestEmblem, LockIcon, CheckFlagIcon, CrownIcon, CharmIcon } from './Icons.jsx';

const MAP_CONNECTIONS = [
  ['1-1', '1-2'],
  ['1-1', 'shop-1'],
  ['1-2', '1-3'],
  ['1-3', '1-4'],
];

export function WorldMapScreen({
  file,
  isPlayStation = false,
  onEnterCourse,
  onOpenShop,
  onBackToTitle,
}) {
  const initialFocus = file?.lastUnlockedNodeId || '1-1';
  const [focusedId, setFocusedId] = useState(initialFocus);

  const focusedNode = WORLD1_NODES.find((n) => n.id === focusedId) || WORLD1_NODES[0];
  const focusedState = resolveMapNodeState(focusedNode, file);
  const focusedRecord = file?.courses?.[focusedNode.id] || { cleared: false, topFlag: false, medallions: [false, false, false] };
  const totalMed = countFileMedallions(file);
  const equippedCharm = SHOP_CATALOG.find((c) => c.id === file?.equippedCharmId) || SHOP_CATALOG[0];

  const act = (fn, sound = UISoundHook.MENU_CONFIRM) => (e) => {
    e.currentTarget.blur();
    uiAudio.play(sound);
    fn?.();
  };

  const handleEnterFocused = () => {
    if (focusedState === 'locked') {
      uiAudio.play(UISoundHook.MENU_BACK);
      return;
    }
    if (focusedNode.kind === 'shop') {
      onOpenShop?.();
    } else {
      onEnterCourse?.(focusedNode);
    }
  };

  return (
    <div
      className="ui-v2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="World 1 Map"
      data-testid="ui-v2-screen-map"
    >
      <div className="ui-v2-card ui-v2-card-wide">
        {/* MapHUD Header (§4.8) */}
        <div className="ui-v2-row-between" data-testid="ui-v2-map-hud">
          <div className="ui-v2-row">
            <PrismCrestEmblem size={44} />
            <div className="ui-v2-col">
              <span className="ui-v2-kicker">{file?.label || 'Journal 1'}</span>
              <h2 className="ui-v2-title-md">World 1 · Sunlit Valley</h2>
            </div>
          </div>

          <div className="ui-v2-row">
            <LivesBadge
              lives={file?.lives ?? 5}
              playerIndex={file?.characterId === 'luigi' ? 1 : 0}
              shared={(file?.playerCount || 1) > 1}
              testId="map-v2-lives"
            />
            <CounterChip
              value={file?.petals ?? 0}
              maxValue={TOKENS.rules.maxSpecialCurrency}
              padDigits={3}
              variant="purple"
              label="Prism Petals"
              testId="map-v2-petals"
            />
            <span className="ui-v2-status-pill is-gold" data-testid="map-v2-medallion-total">
              ★ {totalMed.collected}/{totalMed.total} Medallions
            </span>
          </div>
        </div>

        {/* Interactive Node Trail Canvas */}
        <div className="ui-v2-map-stage" data-testid="ui-v2-map-canvas">
          <svg className="ui-v2-map-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {MAP_CONNECTIONS.map(([fromId, toId]) => {
              const a = WORLD1_NODES.find((n) => n.id === fromId);
              const b = WORLD1_NODES.find((n) => n.id === toId);
              if (!a || !b) return null;
              const targetState = resolveMapNodeState(b, file);
              const unlocked = targetState !== 'locked';
              return (
                <line
                  key={`${fromId}-${toId}`}
                  x1={a.xPct}
                  y1={a.yPct}
                  x2={b.xPct}
                  y2={b.yPct}
                  stroke={unlocked ? 'var(--ui-color-gold)' : 'var(--ui-color-disabled-fg)'}
                  strokeWidth={unlocked ? '2.4' : '1.6'}
                  strokeDasharray={unlocked ? undefined : '3 3'}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          {WORLD1_NODES.map((node) => {
            const nodeState = resolveMapNodeState(node, file);
            const isFocused = node.id === focusedNode.id;
            const classes = [
              'ui-v2-map-node',
              `is-${nodeState}`,
              isFocused ? 'is-focused' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={node.id}
                className="ui-v2-map-node-anchor"
                style={{ left: `${node.xPct}%`, top: `${node.yPct}%` }}
              >
                <button
                  type="button"
                  data-testid={`ui-v2-map-node-${node.id}`}
                  data-node-state={nodeState}
                  aria-pressed={isFocused}
                  aria-label={`${node.code} ${node.name}, status ${nodeState}`}
                  className={classes}
                  onClick={() => {
                    uiAudio.play(UISoundHook.MENU_MOVE);
                    setFocusedId(node.id);
                  }}
                  onDoubleClick={() => {
                    setFocusedId(node.id);
                    if (nodeState !== 'locked') {
                      uiAudio.play(UISoundHook.MENU_CONFIRM);
                      if (node.kind === 'shop') onOpenShop?.();
                      else onEnterCourse?.(node);
                    }
                  }}
                >
                  <span className="ui-v2-row">
                    {nodeState === 'locked' && <LockIcon />}
                    {nodeState === 'cleared' && node.kind !== 'shop' && <CheckFlagIcon />}
                    {nodeState === 'perfect' && <CrownIcon />}
                    {node.kind === 'shop' && <CharmIcon icon="surge" />}
                    <span className="ui-v2-display-num-sm">{node.code}</span>
                  </span>
                  <span className="ui-v2-kicker">
                    {nodeState === 'new' ? 'NEW' : node.kind === 'shop' ? 'SHOP' : nodeState.toUpperCase()}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        {/* Focused Course / Outpost Detail Banner */}
        <div className="ui-v2-panel-inset ui-v2-row-between" data-testid="ui-v2-map-detail">
          <div className="ui-v2-col">
            <div className="ui-v2-row">
              <span className="ui-v2-title-sm">
                {focusedNode.code} · {focusedNode.name}
              </span>
              <span
                className={`ui-v2-status-pill ${
                  focusedState === 'perfect'
                    ? 'is-gold'
                    : focusedState === 'cleared'
                      ? 'is-green'
                      : focusedState === 'new'
                        ? 'is-blue'
                        : 'is-muted'
                }`}
              >
                {focusedState}
              </span>
            </div>
            <span className="ui-v2-body">{focusedNode.subtitle}</span>
            <span className="ui-v2-kicker">Equipped Charm: {equippedCharm?.name || 'None'}</span>
          </div>

          <div className="ui-v2-row">
            {focusedNode.kind !== 'shop' && (
              <CollectibleTracker
                collected={focusedRecord.medallions}
                testId="map-v2-focused-medallions"
              />
            )}
            <button
              type="button"
              data-testid="btn-map-shop"
              className="ui-v2-btn ui-v2-btn-accent"
              onClick={act(onOpenShop)}
            >
              Outpost Shop
            </button>
            <button
              type="button"
              data-testid="btn-map-enter"
              disabled={focusedState === 'locked'}
              className="ui-v2-btn ui-v2-btn-primary"
              onClick={act(handleEnterFocused)}
            >
              {focusedState === 'locked'
                ? 'Locked'
                : focusedNode.kind === 'shop'
                  ? 'Enter Outpost'
                  : `Play ${focusedNode.code}`}
            </button>
          </div>
        </div>

        <div className="ui-v2-row-between">
          <button
            type="button"
            data-testid="btn-map-back"
            className="ui-v2-btn ui-v2-btn-ghost"
            onClick={act(onBackToTitle, UISoundHook.MENU_BACK)}
          >
            Back to Title
          </button>
          <div className="ui-v2-prompt-bar">
            <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Enter Course" testId="map-prompt-confirm" />
            <Prompt keyLabel={isPlayStation ? '○' : 'Esc'} actionLabel="Title" testId="map-prompt-back" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default WorldMapScreen;
