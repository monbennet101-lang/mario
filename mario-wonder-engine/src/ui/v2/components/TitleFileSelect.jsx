/**
 * TitleFileSelect — Spec §4.12 & Phase 4
 * =======================================
 * Calm, animated Title Screen with Prism Crest flourish, 3 Save File cards,
 * 1–4 Player roster & runner picker, inline Accessibility bar (Text Scale,
 * High Contrast, Course Timer), Start Campaign & World Map actions, and UI Gallery.
 */

import React from 'react';
import { TOKENS } from '../tokens.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import { countFileMedallions } from '../store/uiStore.js';
import { PrismCrestEmblem, RunnerPortraitIcon, StarMedallionIcon, PrismPetalIcon } from './Icons.jsx';
import { Prompt } from './ToastPrompt.jsx';

export function TitleFileSelect({
  files = [],
  activeFileIndex = 0,
  settings = {},
  isPlayStation = false,
  onSelectFile,
  onEraseFile,
  onSelectCharacter,
  onSelectPlayerCount,
  onUpdateSettings,
  onPlayNow,
  onOpenMap,
  onOpenGallery,
}) {
  const activeFile = files[activeFileIndex] || files[0];

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
      aria-label="Prism Stride Title and File Select"
      data-testid="ui-v2-screen-title"
    >
      <div className="ui-v2-card ui-v2-card-wide">
        {/* Title Hero with Prism Crest Flourish (flourish lives ONLY on Title/Map/Results) */}
        <div className="ui-v2-row-between">
          <div className="ui-v2-row">
            <PrismCrestEmblem size={64} />
            <div className="ui-v2-col">
              <span className="ui-v2-kicker">World 1 · Sunlit Valley</span>
              <h1 className="ui-v2-title-lg">Prism Stride</h1>
            </div>
          </div>

          <div className="ui-v2-row">
            <button
              type="button"
              data-testid="btn-open-gallery"
              className="ui-v2-btn ui-v2-btn-ghost"
              onClick={act(onOpenGallery)}
            >
              UI Gallery
            </button>
          </div>
        </div>

        {/* 3 Save Files */}
        <div className="ui-v2-col">
          <div className="ui-v2-row-between">
            <span className="ui-v2-kicker">Select Adventure Journal</span>
            <span className="ui-v2-body">Auto-saves on course clear & outpost purchase</span>
          </div>
          <div className="ui-v2-file-grid" data-testid="ui-v2-file-grid">
            {files.map((file, idx) => {
              const selected = idx === activeFileIndex;
              const med = countFileMedallions(file);
              const clearedCount = Object.values(file.courses || {}).filter((c) => c.cleared).length;
              return (
                <div
                  key={file.slot}
                  role="button"
                  tabIndex={0}
                  data-testid={`ui-v2-file-slot-${idx}`}
                  aria-pressed={selected}
                  className={`ui-v2-file-card${selected ? ' is-selected' : ''}`}
                  onClick={act(() => onSelectFile?.(idx), UISoundHook.MENU_MOVE)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      uiAudio.play(UISoundHook.MENU_MOVE);
                      onSelectFile?.(idx);
                    }
                  }}
                >
                  <div className="ui-v2-row-between">
                    <span className="ui-v2-title-sm">{file.label}</span>
                    <span className={`ui-v2-status-pill ${file.isEmpty ? 'is-muted' : 'is-gold'}`}>
                      {file.isEmpty ? 'New' : `${clearedCount}/4 Cleared`}
                    </span>
                  </div>
                  <div className="ui-v2-row">
                    <span className="ui-v2-row">
                      <span className="ui-v2-counter-icon">
                        <StarMedallionIcon slotState={med.collected > 0 ? 'collected' : 'empty'} />
                      </span>
                      <span className="ui-v2-display-num-sm">{med.collected}/{med.total}</span>
                    </span>
                    <span className="ui-v2-row">
                      <span className="ui-v2-counter-icon">
                        <PrismPetalIcon />
                      </span>
                      <span className="ui-v2-display-num-sm">{file.petals}</span>
                    </span>
                  </div>
                  <div className="ui-v2-row-between">
                    <span className="ui-v2-kicker">
                      {file.playerCount}P · Lives ×{String(file.lives).padStart(2, '0')}
                    </span>
                    {!file.isEmpty && selected && (
                      <button
                        type="button"
                        className="ui-v2-seg-btn"
                        data-testid={`btn-erase-slot-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          uiAudio.play(UISoundHook.MENU_BACK);
                          onEraseFile?.(idx);
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Runner & Party Size Selector */}
        <div className="ui-v2-panel-inset ui-v2-col">
          <div className="ui-v2-row-between">
            <span className="ui-v2-kicker">Lead Runner & Party Size</span>
            <div className="ui-v2-seg-group" role="group" aria-label="Player Count" data-testid="ui-v2-player-count-picker">
              {[1, 2, 3, 4].map((count) => {
                const active = (activeFile?.playerCount || 1) === count;
                return (
                  <button
                    key={count}
                    type="button"
                    data-testid={`btn-players-${count}`}
                    aria-pressed={active}
                    className={`ui-v2-seg-btn${active ? ' is-active' : ''}`}
                    onClick={act(() => onSelectPlayerCount?.(count), UISoundHook.MENU_MOVE)}
                  >
                    {count}P
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ui-v2-roster-grid" data-testid="ui-v2-runner-picker">
            {TOKENS.players.map((p, idx) => {
              const selectable = idx < 2;
              const isSelected = selectable && activeFile?.characterId === p.characterId;
              const isInParty = idx < (activeFile?.playerCount || 1);
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`btn-runner-${p.id}`}
                  aria-pressed={isSelected}
                  className={`ui-v2-roster-card${isSelected || isInParty ? ' is-selected' : ''}`}
                  onClick={act(() => {
                    if (selectable) {
                      onSelectCharacter?.(p.characterId);
                    } else if ((activeFile?.playerCount || 1) <= idx) {
                      onSelectPlayerCount?.(idx + 1);
                    }
                  }, UISoundHook.MENU_MOVE)}
                >
                  <span className="ui-v2-portrait-ring">
                    <RunnerPortraitIcon
                      emblem={p.emblem}
                      colorToken={p.colorToken}
                      accentToken={p.accentToken}
                    />
                  </span>
                  <span className="ui-v2-col">
                    <span className="ui-v2-kicker">{p.short}</span>
                    <span>{p.name}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Inline Accessibility Controls (Text Scale, High Contrast, Timer) */}
        <div className="ui-v2-row-between">
          <div className="ui-v2-row">
            <span className="ui-v2-kicker">Text Scale</span>
            <div className="ui-v2-seg-group" role="group" aria-label="Text Scale">
              {TOKENS.rules.textScales.map((scale) => {
                const active = Math.abs((settings.textScale || 1) - scale) < 0.02;
                return (
                  <button
                    key={scale}
                    type="button"
                    data-testid={`btn-scale-${Math.round(scale * 100)}`}
                    aria-pressed={active}
                    className={`ui-v2-seg-btn${active ? ' is-active' : ''}`}
                    onClick={act(() => onUpdateSettings?.({ textScale: scale }), UISoundHook.MENU_MOVE)}
                  >
                    {Math.round(scale * 100)}%
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              data-testid="btn-high-contrast"
              aria-pressed={Boolean(settings.highContrast)}
              className={`ui-v2-btn ${settings.highContrast ? 'ui-v2-btn-success' : 'ui-v2-btn-secondary'}`}
              onClick={act(() => onUpdateSettings?.({ highContrast: !settings.highContrast }), UISoundHook.MENU_MOVE)}
            >
              {settings.highContrast ? 'High Contrast: On' : 'High Contrast: Off'}
            </button>
          </div>

          <div className="ui-v2-row">
            <button
              type="button"
              data-testid="btn-open-map"
              className="ui-v2-btn ui-v2-btn-secondary"
              onClick={act(onOpenMap)}
            >
              World Map
            </button>
            <button
              type="button"
              data-testid="btn-start-world1"
              data-start="true"
              className="ui-v2-btn ui-v2-btn-primary"
              onClick={act(onPlayNow)}
            >
              Start Course 1-1
            </button>
          </div>
        </div>

        <div className="ui-v2-divider" />
        <div className="ui-v2-prompt-bar">
          <Prompt keyLabel={isPlayStation ? '✕' : 'Enter'} actionLabel="Confirm" testId="title-prompt-confirm" />
          <Prompt keyLabel={isPlayStation ? 'D-Pad' : 'Tab'} actionLabel="Move Focus" testId="title-prompt-move" />
        </div>
      </div>
    </div>
  );
}

export default TitleFileSelect;
