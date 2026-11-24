/**
 * UIV2Shell — Master UI v2 Orchestrator (`src/ui/v2/components/UIV2Shell.jsx`)
 * =============================================================================
 * Replaces the legacy HUD & lifecycle screens when feature flag `ui.v2` is true.
 * Coordinates:
 *   - Persisted 3-slot Save Files, World Map, Prism Outpost Shop/Loadout
 *   - Accessibility tokens (`--ui-text-scale`, `.ui-v2-hc` high-contrast theme)
 *   - CourseHUD during gameplay + instant PauseMenu + ResultsScreen + SoftGameOverCard
 *   - Fast TransitionOverlay + Course Intro Card
 *   - Live Component & State Gallery (`?gallery=1` or menu button)
 *   - Audio bridge (`uiAudio.attach(engine.audio)`) & Event Bus subscriptions
 */

import React, { useCallback, useEffect, useState } from 'react';
import { GameLifecycleState } from '../../../core/gameLoop.js';
import { UIEvents } from '../../../engine/core/UIEventBus.js';
import { uiAudio, UISoundHook } from '../audioHooks.js';
import {
  WORLD1_NODES,
  createEmptySaveFile,
  loadPersistedUIState,
  savePersistedUIState,
  purchaseShopEntry,
  applyCourseClearToFile,
  computeSoftGameOverPenalty,
} from '../store/uiStore.js';
import { CourseHUD } from './CourseHUD.jsx';
import { PauseMenu } from './PauseMenu.jsx';
import { TitleFileSelect } from './TitleFileSelect.jsx';
import { WorldMapScreen } from './WorldMapScreen.jsx';
import { ShopLoadoutScreen } from './ShopLoadoutScreen.jsx';
import { ResultsScreen, SoftGameOverCard } from './ResultsScreen.jsx';
import { TransitionOverlay } from './TransitionOverlay.jsx';
import { UIGallery } from './UIGallery.jsx';

export function UIV2Shell({
  engine = null,
  canvasRef = null,
  lifecycleState = GameLifecycleState.TITLE_SCREEN,
  isWorldVictory = false,
  campaignStageIndex = 0,
  hudSummary = { score: 0, shards: 0, medallions: 0, lives: 5, clearTimeSec: 0 },
  isPlayStation = false,
  initialGalleryOpen = false,
  initialSafeOverlay = false,
  externalGalleryOpen = false,
  onExternalGalleryClose = null,
  externalSafeOverlay = null,
}) {
  const [store, setStore] = useState(() => {
    const loaded = loadPersistedUIState();
    if (initialSafeOverlay) {
      loaded.settings = { ...loaded.settings, safeAreaOverlay: true };
    }
    return loaded;
  });

  // Sub-screens layered over Title / Map / Pause
  const [subScreen, setSubScreen] = useState(initialGalleryOpen ? 'gallery' : null); // null | 'map' | 'shop' | 'gallery'
  const [shopReturnTo, setShopReturnTo] = useState('map');
  const [respawnPenalty, setRespawnPenalty] = useState(0);
  const [wipePendingCourse, setWipePendingCourse] = useState(null);

  const activeFile = store.files[store.activeFileIndex] || store.files[0];

  const effectiveSettings = {
    ...store.settings,
    safeAreaOverlay: externalSafeOverlay !== null ? externalSafeOverlay : store.settings.safeAreaOverlay,
  };

  useEffect(() => {
    if (externalGalleryOpen) {
      setSubScreen('gallery');
    }
  }, [externalGalleryOpen]);

  // Persist save files & accessibility settings
  useEffect(() => {
    savePersistedUIState(store);
  }, [store]);

  // Attach procedural audio manager & sync active file values into engine on init
  useEffect(() => {
    if (!engine) return undefined;
    uiAudio.attach(engine.audio);

    if (activeFile) {
      engine.prismPetals = activeFile.petals ?? engine.prismPetals;
      engine.reserveItem = activeFile.reserveItem ?? engine.reserveItem;
    }

    const unsubs = [];
    if (engine.uiBus) {
      unsubs.push(
        engine.uiBus.on(UIEvents.COURSE_CLEARED, (payload) => {
          setStore((prev) => {
            const idx = prev.activeFileIndex;
            const nextFiles = prev.files.slice();
            nextFiles[idx] = applyCourseClearToFile(nextFiles[idx], payload);
            return { ...prev, files: nextFiles };
          });
        })
      );

      unsubs.push(
        engine.uiBus.on(UIEvents.LIFE_LOST, (payload) => {
          setRespawnPenalty(payload?.penaltyCoins ?? 0);
        })
      );

      unsubs.push(
        engine.uiBus.on(UIEvents.RESERVE_ITEM_CHANGED, () => {
          setStore((prev) => {
            const idx = prev.activeFileIndex;
            const nextFiles = prev.files.slice();
            nextFiles[idx] = { ...nextFiles[idx], reserveItem: engine.reserveItem ?? null };
            return { ...prev, files: nextFiles };
          });
        })
      );
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [engine]);

  // Hotkey `R` activates Reserve Item during active gameplay
  useEffect(() => {
    if (!engine) return undefined;
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.key === 'r' || e.key === 'R') {
        if (lifecycleState === GameLifecycleState.GAMEPLAY_ACTIVE && !subScreen) {
          if (engine.reserveItem) {
            e.preventDefault();
            engine.activateReserveItem();
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine, lifecycleState, subScreen]);

  const updateActiveFile = useCallback((updater) => {
    setStore((prev) => {
      const idx = prev.activeFileIndex;
      const nextFiles = prev.files.slice();
      nextFiles[idx] = updater(nextFiles[idx]);
      return { ...prev, files: nextFiles };
    });
  }, []);

  const updateSettings = useCallback((patch) => {
    setStore((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...patch },
    }));
  }, []);

  const launchCourse = useCallback(
    (stageIndex = 0) => {
      if (!engine) return;
      const node = WORLD1_NODES.find((n) => n.stageIndex === stageIndex) || WORLD1_NODES[0];
      engine.setCharacter?.(activeFile?.characterId || 'mario');
      engine.prismPetals = activeFile?.petals ?? 15;
      engine.reserveItem = activeFile?.reserveItem ?? null;
      if (engine.combat) {
        engine.combat.lives = Math.max(1, activeFile?.lives ?? 5);
        engine.collectibles?.syncLives?.(engine.combat.lives);
      }
      setSubScreen(null);
      setWipePendingCourse(node);
      engine.startCampaign(stageIndex, { immediate: true });
      canvasRef?.current?.focus();
    },
    [engine, activeFile, canvasRef]
  );

  const handleBeginGameplay = useCallback(() => {
    setWipePendingCourse(null);
    engine?.beginGameplay?.();
    canvasRef?.current?.focus();
  }, [engine, canvasRef]);

  const handleSelectCharacter = useCallback(
    (charId) => {
      updateActiveFile((f) => ({ ...f, isEmpty: false, characterId: charId }));
      engine?.setCharacter?.(charId);
    },
    [updateActiveFile, engine]
  );

  const handleSelectPlayerCount = useCallback(
    (count) => {
      updateActiveFile((f) => ({ ...f, isEmpty: false, playerCount: count }));
    },
    [updateActiveFile]
  );

  const handlePurchaseOrEquip = useCallback(
    (entryId) => {
      let outcome = { ok: false, reason: 'unknown' };
      setStore((prev) => {
        const idx = prev.activeFileIndex;
        const result = purchaseShopEntry(prev.files[idx], entryId);
        outcome = result;
        if (!result.ok) return prev;
        const nextFiles = prev.files.slice();
        nextFiles[idx] = result.file;
        if (engine) {
          engine.prismPetals = result.file.petals;
          engine.reserveItem = result.file.reserveItem;
        }
        return { ...prev, files: nextFiles };
      });
      return outcome;
    },
    [engine]
  );

  const handleQuickRetry = useCallback(() => {
    const recovery = computeSoftGameOverPenalty(activeFile?.petals ?? engine?.prismPetals ?? 0);
    updateActiveFile((f) => ({
      ...f,
      lives: recovery.restoredLives,
      petals: recovery.remainingPetals,
    }));
    if (engine) {
      engine.prismPetals = recovery.remainingPetals;
      if (engine.combat) {
        engine.combat.lives = recovery.restoredLives;
        engine.collectibles?.syncLives?.(recovery.restoredLives);
      }
      engine.startCampaign(campaignStageIndex, { immediate: true });
      engine.beginGameplay();
    }
    canvasRef?.current?.focus();
  }, [activeFile, engine, campaignStageIndex, updateActiveFile, canvasRef]);

  const handleCloseGallery = useCallback(() => {
    setSubScreen(null);
    onExternalGalleryClose?.();
    canvasRef?.current?.focus();
  }, [onExternalGalleryClose, canvasRef]);

  const activeNode =
    WORLD1_NODES.find((n) => n.stageIndex === campaignStageIndex) ||
    WORLD1_NODES[0];
  const courseMedallions = engine?.collectibles?.getCourseSockets?.() || [false, false, false];
  const ghostedMedallions =
    engine?.checkpointState?.reached && engine?.checkpointState?.courseCode === activeNode.code
      ? engine.checkpointState.bankedMedallions || [false, false, false]
      : [false, false, false];

  const showCourseHUD =
    lifecycleState === GameLifecycleState.GAMEPLAY_ACTIVE ||
    lifecycleState === GameLifecycleState.PAUSE_MENU ||
    lifecycleState === GameLifecycleState.PLAYER_DEATH_RESPAWN;

  const rootStyle = {
    '--ui-text-scale': String(effectiveSettings.textScale || 1),
  };

  return (
    <div
      className={`ui-v2-root${effectiveSettings.highContrast ? ' ui-v2-hc' : ''}`}
      style={rootStyle}
      data-testid="ui-v2-shell"
      data-high-contrast={effectiveSettings.highContrast ? 'true' : 'false'}
      data-text-scale={String(effectiveSettings.textScale || 1)}
    >
      {/* Active Gameplay HUD */}
      {showCourseHUD && (
        <CourseHUD
          engine={engine}
          playerCount={activeFile?.playerCount || 1}
          activeCharacterId={activeFile?.characterId || 'mario'}
          crownHolderIndex={activeFile?.crownHolderIndex || 0}
          settings={effectiveSettings}
          isPlayStation={isPlayStation}
          isRespawning={lifecycleState === GameLifecycleState.PLAYER_DEATH_RESPAWN}
          respawnPenaltyCoins={respawnPenalty}
          onActivateReserve={() => engine?.activateReserveItem?.()}
        />
      )}

      {/* Sub-Screen: Component & State Gallery */}
      {subScreen === 'gallery' && (
        <UIGallery
          settings={effectiveSettings}
          onUpdateSettings={updateSettings}
          onClose={handleCloseGallery}
        />
      )}

      {/* Sub-Screen: World 1 Map */}
      {subScreen === 'map' && (
        <WorldMapScreen
          file={activeFile}
          isPlayStation={isPlayStation}
          onEnterCourse={(node) => launchCourse(node.stageIndex)}
          onOpenShop={() => {
            setShopReturnTo('map');
            setSubScreen('shop');
          }}
          onBackToTitle={() => {
            setSubScreen(null);
            engine?.returnToTitle?.({ immediate: true });
          }}
        />
      )}

      {/* Sub-Screen: Prism Outpost Shop & Stride Charm Loadout */}
      {subScreen === 'shop' && (
        <ShopLoadoutScreen
          file={activeFile}
          isPlayStation={isPlayStation}
          onPurchaseOrEquip={handlePurchaseOrEquip}
          onClose={() => {
            setSubScreen(shopReturnTo === 'pause' ? null : 'map');
          }}
        />
      )}

      {/* Lifecycle Screen: Title & File Select */}
      {!subScreen && lifecycleState === GameLifecycleState.TITLE_SCREEN && (
        <TitleFileSelect
          files={store.files}
          activeFileIndex={store.activeFileIndex}
          settings={effectiveSettings}
          isPlayStation={isPlayStation}
          onSelectFile={(idx) => setStore((prev) => ({ ...prev, activeFileIndex: idx }))}
          onEraseFile={(idx) =>
            setStore((prev) => {
              const nextFiles = prev.files.slice();
              nextFiles[idx] = createEmptySaveFile(idx + 1);
              return { ...prev, files: nextFiles };
            })
          }
          onSelectCharacter={handleSelectCharacter}
          onSelectPlayerCount={handleSelectPlayerCount}
          onUpdateSettings={updateSettings}
          onPlayNow={() => launchCourse(0)}
          onOpenMap={() => setSubScreen('map')}
          onOpenGallery={() => setSubScreen('gallery')}
        />
      )}

      {/* Lifecycle Screen: Course Intro Card / Transition */}
      {!subScreen && lifecycleState === GameLifecycleState.LEVEL_INTRO && (
        <TransitionOverlay
          mode={wipePendingCourse ? 'intro' : 'intro'}
          courseCode={activeNode.code}
          courseTitle={activeNode.name}
          worldName={activeNode.worldName}
          lives={hudSummary.lives}
          playerIndex={activeFile?.characterId === 'luigi' ? 1 : 0}
          sharedLives={(activeFile?.playerCount || 1) > 1}
          medallions={activeFile?.courses?.[activeNode.code]?.medallions || [false, false, false]}
          isPlayStation={isPlayStation}
          onBeginCourse={handleBeginGameplay}
        />
      )}

      {/* Lifecycle Screen: Instant Pause Menu */}
      {!subScreen && lifecycleState === GameLifecycleState.PAUSE_MENU && (
        <PauseMenu
          courseCode={activeNode.code}
          courseTitle={activeNode.name}
          medallions={courseMedallions}
          ghostedMedallions={ghostedMedallions}
          shards={engine?.collectibles?.shardCount ?? hudSummary.shards}
          petals={engine?.prismPetals ?? activeFile?.petals ?? 0}
          equippedCharmId={activeFile?.equippedCharmId}
          settings={effectiveSettings}
          isPlayStation={isPlayStation}
          onResume={() => {
            engine?.togglePause?.();
            canvasRef?.current?.focus();
          }}
          onRestart={() => {
            engine?.togglePause?.();
            engine?.resetRoom?.();
            canvasRef?.current?.focus();
          }}
          onOpenShop={() => {
            setShopReturnTo('pause');
            setSubScreen('shop');
          }}
          onOpenMap={() => {
            engine?.returnToTitle?.({ immediate: true });
            setSubScreen('map');
          }}
          onOpenGallery={() => setSubScreen('gallery')}
          onReturnTitle={() => {
            setSubScreen(null);
            engine?.returnToTitle?.({ immediate: true });
          }}
          onUpdateSettings={updateSettings}
        />
      )}

      {/* Lifecycle Screen: Course Clear / World Victory Results */}
      {!subScreen && lifecycleState === GameLifecycleState.STAGE_CLEAR && (
        <ResultsScreen
          courseCode={activeNode.code}
          courseTitle={activeNode.name}
          isWorldVictory={isWorldVictory}
          score={hudSummary.score}
          shards={hudSummary.shards}
          petals={engine?.prismPetals ?? activeFile?.petals ?? 0}
          clearTimeSec={hudSummary.clearTimeSec}
          medallions={courseMedallions}
          playerCount={activeFile?.playerCount || 1}
          crownHolderIndex={activeFile?.crownHolderIndex || 0}
          isPlayStation={isPlayStation}
          onNextCourse={() => {
            if (isWorldVictory) {
              engine?.returnToTitle?.({ immediate: true });
              setSubScreen('map');
            } else {
              engine?.advanceToNextStage?.({ immediate: true });
            }
          }}
          onOpenMap={() => {
            engine?.returnToTitle?.({ immediate: true });
            setSubScreen('map');
          }}
          onReplayCourse={() => launchCourse(campaignStageIndex)}
        />
      )}

      {/* Lifecycle Screen: Soft Game Over Quick Recovery */}
      {!subScreen && lifecycleState === GameLifecycleState.GAME_OVER && (
        <SoftGameOverCard
          courseCode={activeNode.code}
          petals={engine?.prismPetals ?? activeFile?.petals ?? 0}
          isPlayStation={isPlayStation}
          onQuickRetry={handleQuickRetry}
          onOpenMap={() => {
            engine?.returnToTitle?.({ immediate: true });
            setSubScreen('map');
          }}
        />
      )}
    </div>
  );
}

export default UIV2Shell;
