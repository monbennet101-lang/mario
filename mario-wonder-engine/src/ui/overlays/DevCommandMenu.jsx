/**
 * DevCommandMenu — Single-Button Collapsible Responsive Engine Drawer
 * =====================================================================
 * Default state is completely collapsed to a single top-right toggle button,
 * leaving the entire game canvas and corners clean for play & touch controls.
 * Expanding reveals a responsive, tabbed command panel organized into:
 *   1. Rooms & Gauntlet Warp (A–I)
 *   2. Feel Presets, Character & Simulation Controls
 *   3. Verification, Overlays & Developer Panels
 */

import React, { useState, useEffect } from 'react';
import { FEEL_PRESETS } from '@game/config/MovementProfile';
import {
  ROOM_ENTRIES,
  GAUNTLET_SECTIONS,
  KISHOTENKETSU_ACT_ENTRIES,
  DEV_MENU_TABS,
  buildMenuStatusSummary,
} from './menuModel';

function MenuIcon({ open }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 6L18 18M18 6L6 18"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7H20M4 12H20M4 17H20"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="9" cy="7" r="2" fill="#38BDF8" />
      <circle cx="15" cy="12" r="2" fill="#38BDF8" />
      <circle cx="11" cy="17" r="2" fill="#38BDF8" />
    </svg>
  );
}

function DevCommandMenu({
  open,
  onToggle,
  onClose,
  engineRef,
  canvasRef,
  roomIndex,
  roomName,
  gauntletSectionId,
  actId,
  characterId,
  feelPresetId,
  useTwilight,
  isMuted,
  isPaused,
  timeScale,
  isRecording,
  isReplaying,
  hasReplay,
  showVerify,
  showGalleryModal,
  showLevelAudit,
  showTelemetry,
  showCamDebug,
  showPoseInspector,
  showTuning,
  showInput,
  showGrid,
  showHitboxes,
  showHelp,
  onToggleVerify,
  onToggleGallery,
  onToggleAudit,
  onToggleTelemetry,
  onToggleTuning,
  onToggleInput,
  onToggleHelp,
  uiV2Enabled = true,
  onToggleUiV2,
  onOpenUiGallery,
  showSafeOverlay = false,
  onToggleSafeOverlay,
}) {
  const [activeTab, setActiveTab] = useState('rooms');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      const target = e.target;
      if (!target) return;
      if (target.closest?.('[data-testid="dev-command-menu"]')) return;
      if (target.closest?.('[data-testid="dev-menu-toggle"]')) return;
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose]);

  const act = (fn, { closeAfter = false } = {}) => (e) => {
    e.currentTarget.blur();
    const engine = engineRef.current;
    if (engine) {
      fn(engine);
    }
    if (closeAfter) {
      onClose();
    }
    canvasRef.current?.focus();
  };

  const uiAct = (fn, { closeAfter = false } = {}) => (e) => {
    e.currentTarget.blur();
    fn();
    if (closeAfter) {
      onClose();
    }
    canvasRef.current?.focus();
  };

  const activeRoom = ROOM_ENTRIES[roomIndex] || ROOM_ENTRIES[0];
  const summary = buildMenuStatusSummary({
    roomName: roomName || activeRoom.name,
    characterId,
    feelPresetId,
    isPaused,
    timeScale,
  });

  return (
    <>
      {/* Single Persistent Toggle Button */}
      <button
        type="button"
        tabIndex={-1}
        data-testid="dev-menu-toggle"
        aria-expanded={open}
        aria-controls="dev-command-drawer"
        aria-label={open ? 'Close Menu and Tools' : 'Open Menu and Tools'}
        onClick={(e) => {
          e.currentTarget.blur();
          onToggle();
          if (open) canvasRef.current?.focus();
        }}
        className={`mwe-menu-toggle ${open ? 'is-open' : ''}`}
      >
        <MenuIcon open={open} />
        <span>{open ? 'Close' : 'Menu'}</span>
      </button>

      {/* Responsive Collapsible Command Drawer */}
      {open && (
        <section
          id="dev-command-drawer"
          data-testid="dev-command-menu"
          aria-label="Rooms, Presets, and Debug Tools"
          className="mwe-drawer"
        >
          {/* Drawer Header */}
          <div className="mwe-drawer-header">
            <div className="mwe-drawer-header-top">
              <h2 data-testid="room-name" className="mwe-drawer-title">
                {summary.title}
              </h2>
              <span className="mwe-drawer-status">{summary.meta}</span>
            </div>
            <p className="mwe-drawer-hint">{activeRoom.hint}</p>
          </div>

          {/* Category Tabs */}
          <div role="tablist" aria-label="Menu Categories" className="mwe-tablist">
            {DEV_MENU_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  tabIndex={-1}
                  aria-selected={active}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    setActiveTab(tab.id);
                  }}
                  className={`mwe-tab-btn ${active ? 'is-active' : ''}`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div className="mwe-drawer-body">
            {activeTab === 'rooms' && (
              <div className="mwe-section-stack">
                <div className="mwe-section" data-testid="world1-course-bar">
                  <div className="mwe-section-label">World 1 Benchmark Courses (1-1 · 1-2 · 1-3)</div>
                  <div className="mwe-room-grid">
                    {ROOM_ENTRIES.filter((r) => r.isWorld1).map((room) => {
                      const active = room.index === roomIndex;
                      return (
                        <button
                          key={room.index}
                          type="button"
                          tabIndex={-1}
                          data-testid={`world1-course-${room.courseCode}`}
                          aria-pressed={active}
                          aria-label={`Switch to ${room.name}`}
                          onClick={act((engine) => engine.loadRoom(room.index))}
                          className={`mwe-item-btn mwe-room-btn ${active ? 'is-active' : ''}`}
                        >
                          <span className="mwe-item-num">{room.courseCode}</span>
                          <span className="mwe-item-text">{room.name.split(': ')[1] || room.short}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {roomIndex >= 10 && (
                  <div
                    data-testid="kishotenketsu-act-bar"
                    aria-label="Kishōtenketsu 4-Act Teleporter"
                    className="mwe-section mwe-gauntlet-box"
                  >
                    <div className="mwe-section-label mwe-gauntlet-label">
                      Kishōtenketsu Act Warp (起 · 承 · 転 · 結)
                    </div>
                    <div className="mwe-action-grid">
                      {KISHOTENKETSU_ACT_ENTRIES.map((entry) => {
                        const active = actId === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            tabIndex={-1}
                            data-testid={`act-warp-${entry.id}`}
                            aria-pressed={active}
                            onClick={act((engine) => engine.teleportAct(entry.id), { closeAfter: true })}
                            className={`mwe-item-btn mwe-sec-btn ${active ? 'is-gauntlet-active' : ''}`}
                          >
                            <span className="mwe-item-num">{entry.number}:{entry.kanji}</span>
                            <span className="mwe-item-text">{entry.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mwe-section">
                  <div className="mwe-section-label">Benchmark Sandbox Rooms (1–11)</div>
                  <div className="mwe-room-grid">
                    {ROOM_ENTRIES.filter((r) => !r.isWorld1).map((room) => {
                      const active = room.index === roomIndex;
                      return (
                        <button
                          key={room.index}
                          type="button"
                          tabIndex={-1}
                          aria-pressed={active}
                          aria-label={`Switch to ${room.name}`}
                          onClick={act((engine) => engine.loadRoom(room.index))}
                          className={`mwe-item-btn mwe-room-btn ${active ? 'is-active' : ''}`}
                        >
                          <span className="mwe-item-num">{room.number}</span>
                          <span className="mwe-item-text">{room.short}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {roomIndex === 7 && (
                  <div
                    data-testid="gauntlet-section-bar"
                    aria-label="Gauntlet Section Teleporter"
                    className="mwe-section mwe-gauntlet-box"
                  >
                    <div className="mwe-section-label mwe-gauntlet-label">
                      Gauntlet Warp (Sections A–I)
                    </div>
                    <div className="mwe-gauntlet-grid">
                      {GAUNTLET_SECTIONS.map((sec) => {
                        const active = gauntletSectionId === sec.id;
                        return (
                          <button
                            key={sec.id}
                            type="button"
                            tabIndex={-1}
                            data-testid={`gauntlet-sec-${sec.id}`}
                            aria-pressed={active}
                            onClick={act((engine) => engine.teleportGauntletSection(sec.id))}
                            className={`mwe-item-btn mwe-sec-btn ${active ? 'is-gauntlet-active' : ''}`}
                          >
                            <span className="mwe-item-num">{sec.keyNum}:{sec.id}</span>
                            <span className="mwe-item-text">{sec.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'sim' && (
              <div className="mwe-section-stack">
                <div className="mwe-two-col">
                  <div className="mwe-section">
                    <div className="mwe-section-label">Character [C]</div>
                    <div className="mwe-segmented">
                      {[
                        { id: 'mario', label: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? 'Vesper' : 'Mario' },
                        { id: 'luigi', label: (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ? 'Lumen' : 'Luigi' },
                      ].map((char) => {
                        const active = characterId === char.id;
                        return (
                          <button
                            key={char.id}
                            type="button"
                            tabIndex={-1}
                            data-testid={active ? 'character-switcher-btn' : undefined}
                            aria-pressed={active}
                            onClick={act((engine) => engine.setCharacter(char.id))}
                            className={`mwe-seg-btn ${active ? `is-char-${char.id}` : ''}`}
                          >
                            {char.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mwe-section">
                    <div className="mwe-section-label">Sky & Audio</div>
                    <div className="mwe-segmented">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-pressed={useTwilight}
                        onClick={act((engine) => engine.toggleTwilight())}
                        className={`mwe-seg-btn ${useTwilight ? 'is-accent' : ''}`}
                      >
                        {useTwilight ? 'Dusk [V]' : 'Day [V]'}
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-pressed={!isMuted}
                        onClick={act((engine) => engine.toggleMute())}
                        className={`mwe-seg-btn ${isMuted ? 'is-warn' : 'is-active'}`}
                      >
                        {isMuted ? 'Muted [M]' : 'SFX On [M]'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mwe-section">
                  <div className="mwe-section-label">Feel Preset [P]</div>
                  <div
                    role="group"
                    aria-label="Live Feel Preset"
                    data-testid="feel-preset-select"
                    className="mwe-segmented mwe-preset-group"
                  >
                    {Object.values(FEEL_PRESETS).map((preset) => {
                      const active = feelPresetId === preset.id;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          tabIndex={-1}
                          aria-pressed={active}
                          onClick={act((engine) => engine.setFeelPreset(preset.id))}
                          className={`mwe-seg-btn ${active ? 'is-active' : ''}`}
                        >
                          {preset.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mwe-section">
                  <div className="mwe-section-label">Simulation & Replay</div>
                  <div className="mwe-action-grid">
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={isPaused}
                      onClick={act((engine) => engine.togglePause())}
                      className={`mwe-item-btn ${isPaused ? 'is-warn' : ''}`}
                    >
                      {isPaused ? 'Resume [Space]' : 'Pause [Space]'}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      disabled={!isPaused}
                      onClick={act((engine) => engine.stepFrame())}
                      className="mwe-item-btn"
                    >
                      Step 1f [.]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={act((engine) => engine.cycleTimeScale())}
                      className={`mwe-item-btn ${timeScale !== 1.0 ? 'is-active' : ''}`}
                    >
                      Speed {timeScale}× [T]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={act((engine) => engine.resetRoom())}
                      className="mwe-item-btn"
                    >
                      Reset Room [R]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={isRecording}
                      onClick={act((engine) =>
                        engine.input.isRecording ? engine.stopRecording() : engine.startRecording()
                      )}
                      className={`mwe-item-btn ${isRecording ? 'is-danger' : ''}`}
                    >
                      {isRecording ? 'Stop Rec' : 'Record Input'}
                    </button>
                    {hasReplay && !isRecording && (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-pressed={isReplaying}
                        onClick={act((engine) => engine.playReplay())}
                        className={`mwe-item-btn ${isReplaying ? 'is-active' : ''}`}
                      >
                        {isReplaying ? 'Replaying…' : 'Play Replay'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tools' && (
              <div className="mwe-section-stack">
                <div className="mwe-section">
                  <div className="mwe-section-label">Verification & Guides</div>
                  <div className="mwe-action-grid">
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="verify-report-btn"
                      aria-pressed={showVerify}
                      onClick={uiAct(onToggleVerify, { closeAfter: true })}
                      className={`mwe-item-btn mwe-verify-btn ${showVerify ? 'is-active' : ''}`}
                    >
                      Verify Report [F7]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="enemy-gallery-btn"
                      aria-pressed={showGalleryModal}
                      onClick={uiAct(onToggleGallery, { closeAfter: true })}
                      className={`mwe-item-btn mwe-gallery-btn ${showGalleryModal ? 'is-active' : ''}`}
                    >
                      Enemy Gallery [F8]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="level-audit-btn"
                      aria-pressed={showLevelAudit}
                      onClick={uiAct(onToggleAudit, { closeAfter: true })}
                      className={`mwe-item-btn mwe-verify-btn ${showLevelAudit ? 'is-active' : ''}`}
                    >
                      Level Audit [F9]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showHelp}
                      onClick={uiAct(onToggleHelp, { closeAfter: true })}
                      className={`mwe-item-btn ${showHelp ? 'is-active' : ''}`}
                    >
                      <span className="mwe-item-text">Controls [H]</span>
                    </button>
                  </div>
                </div>

                <div className="mwe-section">
                  <div className="mwe-section-label">Interface Overhaul (ui.v2 Flag)</div>
                  <div className="mwe-action-grid">
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="toggle-ui-v2-btn"
                      aria-pressed={uiV2Enabled}
                      onClick={uiAct(() => onToggleUiV2?.())}
                      className={`mwe-item-btn ${uiV2Enabled ? 'is-active' : ''}`}
                    >
                      {uiV2Enabled ? 'UI v2: Active' : 'Legacy UI v1'}
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="open-ui-gallery-btn"
                      onClick={uiAct(() => onOpenUiGallery?.(), { closeAfter: true })}
                      className="mwe-item-btn"
                    >
                      UI Gallery
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="toggle-safe-overlay-btn"
                      aria-pressed={showSafeOverlay}
                      onClick={uiAct(() => onToggleSafeOverlay?.())}
                      className={`mwe-item-btn ${showSafeOverlay ? 'is-active' : ''}`}
                    >
                      {showSafeOverlay ? 'Safe Margin: On' : 'Safe Margin: Off'}
                    </button>
                  </div>
                </div>

                <div className="mwe-section">
                  <div className="mwe-section-label">Debug Overlays & Live Panels</div>
                  <div className="mwe-action-grid">
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showTelemetry}
                      onClick={uiAct(onToggleTelemetry)}
                      className={`mwe-item-btn ${showTelemetry ? 'is-active' : ''}`}
                    >
                      Telemetry [F3]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showCamDebug}
                      onClick={act((engine) => engine.toggleCameraDebug())}
                      className={`mwe-item-btn ${showCamDebug ? 'is-active' : ''}`}
                    >
                      Camera Debug [F4]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      data-testid="pose-inspector-btn"
                      aria-pressed={showPoseInspector}
                      onClick={act((engine) => engine.togglePoseInspector())}
                      className={`mwe-item-btn ${showPoseInspector ? 'is-active' : ''}`}
                    >
                      Pose Inspector [F5]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showTuning}
                      onClick={uiAct(onToggleTuning)}
                      className={`mwe-item-btn ${showTuning ? 'is-active' : ''}`}
                    >
                      Live Tuning [U]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showInput}
                      onClick={uiAct(onToggleInput)}
                      className={`mwe-item-btn ${showInput ? 'is-active' : ''}`}
                    >
                      Input Display [I]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showGrid}
                      onClick={act((engine) => engine.toggleGrid())}
                      className={`mwe-item-btn ${showGrid ? 'is-active' : ''}`}
                    >
                      Tile Grid [G]
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-pressed={showHitboxes}
                      onClick={act((engine) => engine.toggleHitboxes())}
                      className={`mwe-item-btn ${showHitboxes ? 'is-active' : ''}`}
                    >
                      Hitboxes [B]
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

export default DevCommandMenu;
