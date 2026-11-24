/**
 * App.jsx — Root React Component
 * ================================
 * Hosts the responsive 16:9 game canvas, perimeter developer toolbar,
 * Telemetry HUD ([F3]), Input Visualizer ([I]), Hotkey Legend ([H]),
 * and collapsible Live Tuning Panel ([U] / lil-gui).
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import GameEngine from '@engine/core/GameEngine';
import Renderer from '@engine/rendering/Renderer';
import TelemetryHUD from '@ui/hud/TelemetryHUD';
import SpeedometerHUD from '@ui/hud/SpeedometerHUD';
import ActionBannerHUD from '@ui/hud/ActionBannerHUD';
import DiegeticHUD from '@ui/hud.js';
import InputVisualizer from '@ui/overlays/InputVisualizer';
import HotkeyLegend from '@ui/overlays/HotkeyLegend';
import VerificationReportModal from '@ui/overlays/VerificationReportModal';
import EnemyGalleryModal from '@ui/overlays/EnemyGalleryModal';
import LevelAuditModal from '@ui/overlays/LevelAuditModal';
import TuningPanel from '@ui/panels/TuningPanel';
import PoseInspectorPanel from '@ui/panels/PoseInspectorPanel';
import DevCommandMenu from '@ui/overlays/DevCommandMenu';
import GameLifecycleOverlays from '@ui/overlays/GameLifecycleOverlays';
import ControllerToast from '@ui/overlays/ControllerToast';
import { ControllerProfile, LayoutOverride } from '@engine/input/GamepadHardware';
import { GameLifecycleState } from './core/gameLoop';
import { getActionBannerTopOffset } from '@ui/overlays/menuModel';
import './ui/v2/tokens.css';
import UIV2Shell from '@ui/v2/components/UIV2Shell';
import {
  resolveUiV2Enabled,
  persistUiV2Enabled,
  resolveInitialGalleryOpen,
  resolveInitialSafeOverlay,
} from '@ui/v2/featureFlags';

function App() {
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const inputRef = useRef(null);
  const wasPausedBeforeGalleryRef = useRef(false);
  const overlayStateRef = useRef({
    showGalleryModal: false,
    showLevelAudit: false,
    showVerify: false,
    showHelp: false,
    menuOpen: false,
  });

  const [engineInstance, setEngineInstance] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [showLevelAudit, setShowLevelAudit] = useState(false);
  const [showTuning, setShowTuning] = useState(false);
  const [showPoseInspector, setShowPoseInspector] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [showHitboxes, setShowHitboxes] = useState(true);
  const [showCamDebug, setShowCamDebug] = useState(false);
  const [characterId, setCharacterId] = useState('mario');
  const [feelPresetId, setFeelPresetId] = useState('wonder');
  const [gauntletSectionId, setGauntletSectionId] = useState('A');
  const [actId, setActId] = useState('KI');
  const [roomIndex, setRoomIndex] = useState(11);
  const [roomName, setRoomName] = useState('1-1: Verdant Outskirts');
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [useTwilight, setUseTwilight] = useState(false);
  const [timeScale, setTimeScale] = useState(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [hasReplay, setHasReplay] = useState(false);
  const [lifecycleState, setLifecycleState] = useState(GameLifecycleState.TITLE_SCREEN);
  const [isWorldVictory, setIsWorldVictory] = useState(false);
  const [campaignStageIndex, setCampaignStageIndex] = useState(0);
  const [hudSummary, setHudSummary] = useState({ score: 0, shards: 0, medallions: 0, lives: 3, clearTimeSec: 0 });
  const [controllerStatus, setControllerStatus] = useState({
    connected: false,
    activePadName: 'Keyboard',
    detectedProfile: ControllerProfile.KEYBOARD,
    effectiveProfile: ControllerProfile.KEYBOARD,
    layoutOverride: LayoutOverride.AUTO,
    isPlayStation: false,
  });
  const [controllerToast, setControllerToast] = useState(null);
  const toastTimerRef = useRef(null);
  const [uiV2Enabled, setUiV2Enabled] = useState(() => resolveUiV2Enabled());
  const [showUiGallery, setShowUiGallery] = useState(() => resolveInitialGalleryOpen());
  const [showSafeOverlay, setShowSafeOverlay] = useState(() => resolveInitialSafeOverlay());

  overlayStateRef.current = {
    showGalleryModal,
    showLevelAudit,
    showVerify,
    showHelp,
    menuOpen,
  };

  const syncState = useCallback((engine) => {
    setRoomIndex(engine.currentRoomIndex);
    setRoomName(engine.currentRoom?.name || '');
    setCharacterId(engine.characterId || 'mario');
    setFeelPresetId(engine.feelPresetId || 'wonder');
    setGauntletSectionId(engine.currentGauntletSectionId || 'A');
    setActId(engine.currentActId || engine.levelEngine?.currentActId || 'KI');
    setShowPoseInspector(Boolean(engine.poseInspector?.active));
    setIsPaused(engine.loop.isPaused || engine.lifecycle?.state === GameLifecycleState.PAUSE_MENU);
    setIsMuted(Boolean(engine.audio?.muted));
    setUseTwilight(Boolean(engine.renderer?.tileAtlas?.useTwilight));
    setTimeScale(engine.loop.timeScale);
    setShowGrid(Boolean(engine.renderer?.showGrid));
    setShowHitboxes(Boolean(engine.renderer?.showHitboxes));
    setShowCamDebug(Boolean(engine.camera?.debugOverlay));
    setIsRecording(engine.input.isRecording);
    setIsReplaying(engine.input.isReplaying);
    setHasReplay(engine.input.recordedFramesCount > 0 || Boolean(engine._lastReplay));
    const lcState = engine.lifecycle?.state || GameLifecycleState.GAMEPLAY_ACTIVE;
    setLifecycleState(lcState);
    setIsWorldVictory(Boolean(engine.lifecycle?.isWorldVictory));
    setCampaignStageIndex(engine.lifecycle?.campaignStageIndex ?? 0);
    setHudSummary({
      score: engine.combat?.score ?? 0,
      shards: engine.collectibles?.totalShards ?? 0,
      medallions: engine.collectibles?.totalMedallionsCollected ?? 0,
      lives: engine.combat?.lives ?? 3,
      clearTimeSec: engine.lifecycle?.campaignClearTimeSec ?? 0,
    });
    document.body.dataset.state =
      engine.loop.isPaused || lcState === GameLifecycleState.PAUSE_MENU ? 'paused' : lcState.toLowerCase();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new GameEngine();
    engineRef.current = engine;

    engine.onStateChange = () => syncState(engine);
    engine.init(canvas, Renderer);
    inputRef.current = engine.input;

    engine.registerUIKey('F3', () => setShowTelemetry((v) => !v));
    engine.registerUIKey('F7', () => setShowVerify((v) => !v));
    engine.registerUIKey('f7', () => setShowVerify((v) => !v));
    engine.registerUIKey('F8', () => setShowGalleryModal((v) => !v));
    engine.registerUIKey('f8', () => setShowGalleryModal((v) => !v));
    engine.registerUIKey('F9', () => setShowLevelAudit((v) => !v));
    engine.registerUIKey('f9', () => setShowLevelAudit((v) => !v));
    const dismissTopOverlay = () => {
      const st = overlayStateRef.current;
      if (st.showLevelAudit) {
        setShowLevelAudit(false);
        return true;
      }
      if (st.showGalleryModal) {
        setShowGalleryModal(false);
        return true;
      }
      if (st.showVerify) {
        setShowVerify(false);
        return true;
      }
      if (st.showHelp) {
        setShowHelp(false);
        return true;
      }
      if (st.menuOpen) {
        setMenuOpen(false);
        return true;
      }
      return false;
    };

    engine.registerUIKey('Escape', () => {
      if (dismissTopOverlay()) return;
      if (!engine.poseInspector?.active) {
        engine.togglePause();
      }
    });
    engine.registerUIKey('i', () => setShowInput((v) => !v));
    engine.registerUIKey('h', () => setShowHelp((v) => !v));
    engine.registerUIKey('u', () => setShowTuning((v) => !v));

    // Wire full DualShock 4 / Gamepad UI & Menu navigation
    engine.menuNavigator.configure({
      onBack: () => {
        if (dismissTopOverlay()) return;
        if (engine.lifecycle?.state === GameLifecycleState.PAUSE_MENU) {
          engine.togglePause();
        }
      },
      onToggleMenu: () => {
        setMenuOpen((v) => !v);
      },
      onOptions: () => {
        if (dismissTopOverlay()) return;
        if (engine.lifecycle?.state === GameLifecycleState.TITLE_SCREEN) {
          engine.startCampaign(0);
          return;
        }
        if (engine.lifecycle?.state === GameLifecycleState.LEVEL_INTRO) {
          engine.beginGameplay();
          return;
        }
        if (!engine.poseInspector?.active) {
          engine.togglePause();
        }
      },
      onPlayMoveSound: () => engine.audio?.playFootstep?.(0.35, false),
      onPlayConfirmSound: () => engine.audio?.playMenuConfirm?.(),
    });

    // Subscribe to hardware hotplug, layout overrides & diegetic connection toasts
    setControllerStatus(engine.input.hardware.getStatus());
    const unsubHardware = engine.input.hardware.onChange((status) => {
      setControllerStatus(status);
    });
    const unsubToast = engine.input.hardware.onToast((toastPayload) => {
      setControllerToast(toastPayload);
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      toastTimerRef.current = window.setTimeout(() => {
        setControllerToast(null);
      }, 3400);
    });

    // Support ?autostart=1 query parameter to jump straight into active gameplay
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        engine.startCampaign(0, { immediate: true });
        engine.beginGameplay();
      }
    } catch {
      // Ignore URLSearchParams errors in unusual environments
    }

    syncState(engine);
    setEngineInstance(engine);
    window.__GAME_ENGINE__ = engine;

    let prevSec = '';
    let prevAct = '';
    const syncSection = (eng) => {
      if (eng.currentRoom?.isGauntlet && eng.currentGauntletSectionId !== prevSec) {
        prevSec = eng.currentGauntletSectionId;
        setGauntletSectionId(prevSec);
      }
      if (eng.levelEngine?.active && eng.levelEngine.currentActId !== prevAct) {
        prevAct = eng.levelEngine.currentActId;
        eng.currentActId = prevAct;
        setActId(prevAct);
      }
    };
    const unsubSection = engine.subscribeUITick(syncSection);

    return () => {
      unsubSection();
      unsubHardware();
      unsubToast();
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      delete window.__GAME_ENGINE__;
      setEngineInstance(null);
      engine.destroy();
    };
  }, [syncState]);

  const handleSetLayoutOverride = useCallback((mode) => {
    const engine = engineRef.current;
    if (!engine?.input?.hardware) return;
    engine.input.hardware.setLayoutOverride(mode);
    setControllerStatus(engine.input.hardware.getStatus());
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (showGalleryModal) {
      wasPausedBeforeGalleryRef.current = Boolean(engine.loop.isPaused);
      if (!engine.loop.isPaused) {
        engine.togglePause();
      }
    } else if (!wasPausedBeforeGalleryRef.current && engine.loop.isPaused && !engine.poseInspector?.active) {
      engine.togglePause();
    }
  }, [showGalleryModal]);

  return (
    <main style={styles.root}>
      <div style={styles.canvasContainer}>
        <canvas
          ref={canvasRef}
          data-testid="game-canvas"
          aria-label="Prism Stride 2.5D Viewport"
          style={styles.canvas}
          tabIndex={0}
        />

        {/* Single-Button Collapsible Menu & Responsive Command Drawer */}
        <DevCommandMenu
          open={menuOpen}
          onToggle={() => setMenuOpen((v) => !v)}
          onClose={() => setMenuOpen(false)}
          engineRef={engineRef}
          canvasRef={canvasRef}
          roomIndex={roomIndex}
          roomName={roomName}
          gauntletSectionId={gauntletSectionId}
          actId={actId}
          characterId={characterId}
          feelPresetId={feelPresetId}
          useTwilight={useTwilight}
          isMuted={isMuted}
          isPaused={isPaused}
          timeScale={timeScale}
          isRecording={isRecording}
          isReplaying={isReplaying}
          hasReplay={hasReplay}
          showVerify={showVerify}
          showGalleryModal={showGalleryModal}
          showLevelAudit={showLevelAudit}
          showTelemetry={showTelemetry}
          showCamDebug={showCamDebug}
          showPoseInspector={showPoseInspector}
          showTuning={showTuning}
          showInput={showInput}
          showGrid={showGrid}
          showHitboxes={showHitboxes}
          showHelp={showHelp}
          onToggleVerify={() => setShowVerify((v) => !v)}
          onToggleGallery={() => setShowGalleryModal((v) => !v)}
          onToggleAudit={() => setShowLevelAudit((v) => !v)}
          onToggleTelemetry={() => setShowTelemetry((v) => !v)}
          onToggleTuning={() => setShowTuning((v) => !v)}
          onToggleInput={() => setShowInput((v) => !v)}
          onToggleHelp={() => setShowHelp((v) => !v)}
          uiV2Enabled={uiV2Enabled}
          onToggleUiV2={() => {
            setUiV2Enabled((prev) => persistUiV2Enabled(!prev));
          }}
          onOpenUiGallery={() => setShowUiGallery(true)}
          showSafeOverlay={showSafeOverlay}
          onToggleSafeOverlay={() => setShowSafeOverlay((v) => !v)}
        />

        {/* Legacy v1 HUD & Action Banners (active when ui.v2 flag is false) */}
        {!uiV2Enabled && (
          <>
            <DiegeticHUD
              engine={engineInstance}
              engineRef={engineRef}
              showTelemetry={showTelemetry}
            />
            <ActionBannerHUD
              engine={engineInstance}
              engineRef={engineRef}
              topOffset={getActionBannerTopOffset({ menuOpen }) + 46}
            />
          </>
        )}
        <TelemetryHUD
          visible={showTelemetry}
          engine={engineInstance}
          engineRef={engineRef}
          controllerStatus={controllerStatus}
          onSetLayoutOverride={handleSetLayoutOverride}
        />
        {!uiV2Enabled && <SpeedometerHUD engine={engineInstance} engineRef={engineRef} />}
        <InputVisualizer
          visible={showInput}
          engine={engineInstance}
          engineRef={engineRef}
          leftOffset={showTelemetry ? 304 : 12}
          controllerProfile={controllerStatus.effectiveProfile}
        />
        <TuningPanel
          visible={showTuning && !showPoseInspector}
          defaultCollapsed={false}
          engine={engineInstance}
          characterId={characterId}
          feelPresetId={feelPresetId}
        />
        <PoseInspectorPanel
          visible={showPoseInspector}
          engine={engineInstance}
          engineRef={engineRef}
        />
        <VerificationReportModal
          visible={showVerify}
          engine={engineInstance}
          onClose={() => setShowVerify(false)}
        />
        <EnemyGalleryModal
          visible={showGalleryModal}
          engine={engineInstance}
          onClose={() => setShowGalleryModal(false)}
        />
        <LevelAuditModal
          visible={showLevelAudit}
          engine={engineInstance}
          onClose={() => setShowLevelAudit(false)}
        />
        <HotkeyLegend
          visible={showHelp}
          onClose={() => setShowHelp(false)}
          controllerStatus={controllerStatus}
          onSetLayoutOverride={handleSetLayoutOverride}
        />

        {/* Diegetic Gamepad Hotplug & Layout Toast */}
        <ControllerToast toast={controllerToast} />

        {/* UI v2 Complete Overhaul vs Legacy v1 Lifecycle Overlays */}
        {uiV2Enabled ? (
          <UIV2Shell
            engine={engineInstance}
            canvasRef={canvasRef}
            lifecycleState={lifecycleState}
            isWorldVictory={isWorldVictory}
            campaignStageIndex={campaignStageIndex}
            hudSummary={hudSummary}
            isPlayStation={controllerStatus.isPlayStation}
            initialGalleryOpen={showUiGallery}
            initialSafeOverlay={showSafeOverlay}
            externalGalleryOpen={showUiGallery}
            onExternalGalleryClose={() => setShowUiGallery(false)}
            externalSafeOverlay={showSafeOverlay}
          />
        ) : (
          <>
            <GameLifecycleOverlays
              lifecycleState={lifecycleState}
              isWorldVictory={isWorldVictory}
              campaignStageIndex={campaignStageIndex}
              engineRef={engineRef}
              canvasRef={canvasRef}
              characterId={characterId}
              score={hudSummary.score}
              shards={hudSummary.shards}
              medallions={hudSummary.medallions}
              lives={hudSummary.lives}
              clearTimeSec={hudSummary.clearTimeSec}
              controllerProfile={controllerStatus.effectiveProfile}
            />
            <div className="mwe-bottom-hint">
              {controllerStatus.effectiveProfile === ControllerProfile.DUALSHOCK4
                ? 'L-Stick/D-Pad Move · ✕ Jump · □/R2 Run · ○/L1/R1 Spin · L2 Pound · Options Pause · Touchpad F3 · R3 Menu'
                : 'WASD/Arrows Move · Z/J Jump · Hold X/K Run · Tap X/K Fireball · E Spin · Space Pause · H Help'}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

const styles = {
  root: {
    width: '100vw',
    height: '100dvh',
    background: '#070918',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  canvasContainer: {
    position: 'relative',
    width: '100%',
    height: '100%',
    maxWidth: '100vw',
    maxHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    display: 'block',
    outline: 'none',
    cursor: 'crosshair',
    boxShadow: '0 0 0 1px rgba(110, 180, 255, 0.16), 0 18px 48px rgba(0, 0, 0, 0.65)',
  },
};

export default App;
