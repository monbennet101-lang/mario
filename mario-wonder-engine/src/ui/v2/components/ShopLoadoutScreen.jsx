/**
 * ShopLoadoutScreen — Spec §4.9 & §3.6
 * =====================================
 * Calm pre-play Prism Outpost shop & Stride Charm loadout screen:
 *   - Item grid + right-hand detail pane
 *   - Shows exact Prism Petal price and exact gameplay effect BEFORE confirming
 *   - Visible EQUIPPED / OWNED / INSUFFICIENT PETALS states
 *   - Support charms are framed positively (never labelled "easy mode")
 */

import React, { useState } from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { SHOP_CATALOG } from '../store/uiStore.js';
import { CounterChip } from './CounterChip.jsx';
import { ReserveItemBox } from './ReserveItemBox.jsx';
import { Prompt } from './ToastPrompt.jsx';
import { CharmIcon, PrismPetalIcon, ReserveItemIcon } from './Icons.jsx';

export function ShopLoadoutScreen({
  file,
  isPlayStation = false,
  onPurchaseOrEquip,
  onClose,
}) {
  const [selectedId, setSelectedId] = useState(file?.equippedCharmId || SHOP_CATALOG[0].id);
  const [statusMessage, setStatusMessage] = useState('Select a Stride Charm or Reserve Item to inspect its effect.');

  const selected = SHOP_CATALOG.find((item) => item.id === selectedId) || SHOP_CATALOG[0];
  const isOwned = selected.kind === 'charm' && (file?.ownedCharmIds || []).includes(selected.id);
  const isEquipped = selected.kind === 'charm' && file?.equippedCharmId === selected.id;
  const isStoredReserve = selected.kind === 'reserve' && file?.reserveItem === selected.reserveKey;
  const canAfford = (file?.petals ?? 0) >= selected.price;

  const handleConfirm = (e) => {
    e.currentTarget.blur();
    if (isEquipped) {
      uiAudio.play(UISoundHook.MENU_MOVE);
      setStatusMessage(`${selected.name} is already equipped.`);
      return;
    }
    const result = onPurchaseOrEquip?.(selected.id);
    if (result?.ok) {
      uiAudio.play(result.action === 'equipped' ? UISoundHook.MENU_CONFIRM : UISoundHook.SPECIAL_COIN_CHIME);
      if (result.action === 'equipped') {
        setStatusMessage(`Equipped ${selected.name}.`);
      } else if (result.action === 'purchased_charm') {
        setStatusMessage(`Unlocked & equipped ${selected.name}!`);
      } else {
        setStatusMessage(`Stored ${selected.name} in your Reserve Box!`);
      }
    } else {
      uiAudio.play(UISoundHook.MENU_BACK);
      setStatusMessage(`Need ${selected.price} Prism Petals (have ${file?.petals ?? 0}).`);
    }
  };

  return (
    <div
      className="ui-v2-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Prism Outpost Shop and Loadout"
      data-testid="ui-v2-screen-shop"
    >
      <div className="ui-v2-card ui-v2-card-wide">
        <div className="ui-v2-row-between">
          <div className="ui-v2-col">
            <span className="ui-v2-kicker">Pre-Play Preparation</span>
            <h2 className="ui-v2-title-md">Prism Outpost · Charms & Reserve</h2>
          </div>
          <div className="ui-v2-row">
            <CounterChip
              value={file?.petals ?? 0}
              maxValue={TOKENS.rules.maxSpecialCurrency}
              padDigits={3}
              variant="purple"
              label="Prism Petals"
              testId="shop-v2-petals"
            />
            <ReserveItemBox
              item={file?.reserveItem || null}
              hotkeyLabel={isPlayStation ? '△' : 'R'}
              disabled
              testId="shop-v2-reserve-preview"
            />
          </div>
        </div>

        <div className="ui-v2-shop-layout">
          {/* Left: Item Grid */}
          <div className="ui-v2-shop-grid" data-testid="ui-v2-shop-grid">
            {SHOP_CATALOG.map((item) => {
              const owned = item.kind === 'charm' && (file?.ownedCharmIds || []).includes(item.id);
              const equipped = item.kind === 'charm' && file?.equippedCharmId === item.id;
              const stored = item.kind === 'reserve' && file?.reserveItem === item.reserveKey;
              const isSel = item.id === selected.id;
              const affordable = owned || (file?.petals ?? 0) >= item.price;

              const classes = [
                'ui-v2-shop-item',
                isSel ? 'is-selected' : '',
                equipped || stored ? 'is-equipped' : '',
                !affordable ? 'is-disabled' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`shop-item-${item.id}`}
                  aria-pressed={isSel}
                  className={classes}
                  onClick={() => {
                    uiAudio.play(UISoundHook.MENU_MOVE);
                    setSelectedId(item.id);
                  }}
                >
                  <div className="ui-v2-row-between">
                    {item.kind === 'reserve' ? (
                      <span className="ui-v2-counter-icon">
                        <ReserveItemIcon item={item.reserveKey} />
                      </span>
                    ) : (
                      <CharmIcon icon={item.icon} />
                    )}
                    {equipped && <span className="ui-v2-status-pill is-green">Equipped</span>}
                    {!equipped && owned && <span className="ui-v2-status-pill is-blue">Owned</span>}
                    {stored && <span className="ui-v2-status-pill is-gold">Stored</span>}
                    {!owned && !stored && (
                      <span className="ui-v2-status-pill is-purple">{item.price} Petals</span>
                    )}
                  </div>
                  <span className="ui-v2-title-sm">{item.name}</span>
                  <span className="ui-v2-kicker">{item.category}</span>
                </button>
              );
            })}
          </div>

          {/* Right: Detail Pane (price & effect visible BEFORE confirming) */}
          <div className="ui-v2-shop-detail" data-testid="ui-v2-shop-detail">
            <div className="ui-v2-row-between">
              <span className="ui-v2-kicker">{selected.category}</span>
              <span className={`ui-v2-status-pill ${isEquipped ? 'is-green' : isOwned ? 'is-blue' : 'is-purple'}`}>
                {isEquipped ? 'Equipped' : isOwned ? 'Owned' : `${selected.price} Prism Petals`}
              </span>
            </div>

            <div className="ui-v2-row">
              {selected.kind === 'reserve' ? (
                <span className="ui-v2-counter-icon">
                  <ReserveItemIcon item={selected.reserveKey} />
                </span>
              ) : (
                <CharmIcon icon={selected.icon} />
              )}
              <h3 className="ui-v2-title-sm">{selected.name}</h3>
            </div>

            <p className="ui-v2-body">{selected.summary}</p>

            <div className="ui-v2-panel-inset ui-v2-col">
              <span className="ui-v2-kicker">Gameplay Effect</span>
              <span className="ui-v2-body">{selected.effect}</span>
            </div>

            <div className="ui-v2-row-between">
              <span className="ui-v2-kicker">Cost</span>
              <span className="ui-v2-row">
                <span className="ui-v2-counter-icon">
                  <PrismPetalIcon />
                </span>
                <span className="ui-v2-display-num-sm">
                  {isOwned ? 'FREE (Owned)' : selected.price}
                </span>
              </span>
            </div>

            <button
              type="button"
              data-testid="btn-shop-confirm"
              disabled={!isOwned && !canAfford}
              className={`ui-v2-btn ${isEquipped ? 'ui-v2-btn-success' : 'ui-v2-btn-primary'}`}
              onClick={handleConfirm}
            >
              {isEquipped
                ? 'Currently Equipped'
                : isOwned
                  ? 'Equip Stride Charm'
                  : !canAfford
                    ? 'Need More Prism Petals'
                    : selected.kind === 'reserve'
                      ? `Buy & Store (${selected.price} Petals)`
                      : `Buy & Equip (${selected.price} Petals)`}
            </button>

            <span className="ui-v2-body" role="status" data-testid="shop-v2-status">
              {statusMessage}
            </span>
          </div>
        </div>

        <div className="ui-v2-divider" />
        <div className="ui-v2-row-between">
          <button
            type="button"
            data-testid="btn-shop-close"
            className="ui-v2-btn ui-v2-btn-secondary"
            onClick={(e) => {
              e.currentTarget.blur();
              uiAudio.play(UISoundHook.MENU_BACK);
              onClose?.();
            }}
          >
            Done · Return
          </button>
          <div className="ui-v2-prompt-bar">
            <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Confirm" testId="shop-prompt-confirm" />
            <Prompt keyLabel={isPlayStation ? '○' : 'Esc'} actionLabel="Back" testId="shop-prompt-back" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ShopLoadoutScreen;
