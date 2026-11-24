/**
 * GameEngine — Master Orchestrator
 * ==================================
 * Wires together GameLoop, InputManager, CollisionSystem,
 * PlayerController, CameraController, AudioManager, ParticleSystem, Renderer, and test rooms.
 * Supports both Browser Canvas mode and DOM-less Headless mode.
 */

import GameLoop from './GameLoop.js';
import UIEventBus, { UIEvents } from './UIEventBus.js';
import InputManager, { Actions } from '../input/InputManager.js';
import GamepadMenuNavigator from '../input/GamepadMenuNavigator.js';
import CollisionSystem from '../physics/CollisionSystem.js';
import TileMap from '../physics/TileMap.js';
import { lintTileMapGeometry } from '../physics/GeometryLint.js';
import AudioManager from '../audio/AudioManager.js';
import CameraController from '../camera/CameraController.js';
import PlayerController from '../../game/player/PlayerController.js';
import { PlayerState } from '../../game/player/PlayerState.js';
import LevelKitSystem from '../../game/entities/LevelKitSystem.js';
import CombatSystem from '../../game/entities/CombatSystem.js';
import EnvironmentalPropsSystem from '../../entities/props.js';
import CollectibleEconomySystem from '../../entities/collectibles.js';
import { LevelGimmickRuntime, createWaterSpoutBeach } from '../../level/levelEngine.js';
import { getAllWorld1Courses } from '../../level/world1Loader.js';
import { getAllRooms, createEnemyGallery1, createPropsPlayground } from '../../game/levels/benchmark/BenchmarkRooms.js';
import MovementProfile, {
  FEEL_PRESETS,
  applyCharacterProfile,
  applyFeelPreset,
} from '../../game/config/MovementProfile.js';
import { PowerUpForm } from '../../game/powerups/PowerUp.js';
import JuiceEngine from '../../render/juice.js';
import BossEncounterSystem, { createDreadShellBossRoom } from '../../entities/boss.js';
import GameLifecycleController, {
  GameLifecycleState,
  WORLD1_CAMPAIGN_COURSES,
} from '../../core/gameLoop.js';

const PRESET_ORDER = ['wonder', 'nsmbu', 'arcade'];

class GameEngine {
  constructor() {
    this.loop = new GameLoop();
    this.input = new InputManager();
    this.menuNavigator = new GamepadMenuNavigator();
    this.audio = new AudioManager();
    this.player = new PlayerController();
    this.camera = new CameraController();
    this.levelKit = new LevelKitSystem();
    this.combat = new CombatSystem();
    this.props = new EnvironmentalPropsSystem();
    this.levelEngine = new LevelGimmickRuntime();
    this.collectibles = new CollectibleEconomySystem({ persistToStorage: false });
    this.uiBus = new UIEventBus();
    this.prismPetals = 12;          // Special level currency (purple), cap 999
    this.reserveItem = 'super_core'; // Stored power-up item ('super_core' | 'flame_orb' | 'life_up' | null)
    this.maxHealth = 3;
    this.health = 3;
    this.bonusHealth = 0;           // Expandable Life-Up wedges (0..3)
    this.checkpointState = {
      reached: false,
      checkpointId: null,
      courseCode: null,
      bankedMedallions: [false, false, false],
      spawnX: null,
      spawnY: null,
    };
    this._lastTimerWarningSec = -1;
    this._checkpointTriggeredForAct = new Set();
    this.renderer = null;
    this.collision = null;
    this.tilemap = null;
    this.platforms = [];
    this.geometryLintReport = null;

    this.rooms = [
      ...getAllRooms(),
      createEnemyGallery1(),
      createPropsPlayground(),
      createWaterSpoutBeach(),
      ...getAllWorld1Courses(),
      createDreadShellBossRoom(),
    ];
    this.currentRoomIndex = 0;

    // Stage 20 Multi-Sensory Juice Engine (Hitstops, T² Trauma Shake, Directional Particle Pool & Squash)
    this.juice = new JuiceEngine();
    this.camera.setTraumaSource(this.juice.trauma, true);

    // Stage 21 Multi-Phase Boss Encounter ("The Dread-Shell Golem") & Full Game Lifecycle State Machine
    this.boss = new BossEncounterSystem();
    this.lifecycle = new GameLifecycleController(GameLifecycleState.GAMEPLAY_ACTIVE);
    this._campaignMode = false;
    this._wasCourseCleared = false;
    this.lifecycle.onAudioDuckChange = (factor) => {
      this.audio.setDucking(factor);
    };
    this.lifecycle.onStateChanged = (nextState) => {
      if (nextState === GameLifecycleState.GAME_OVER) {
        this.audio.playGameOver();
      }
      if (this.onStateChange) this.onStateChange();
    };
    this.lifecycle.onLoadCampaignStage = (stageIdx, { resetCampaignLives = false } = {}) => {
      const target = WORLD1_CAMPAIGN_COURSES[stageIdx];
      const roomIdx = target
        ? this.rooms.findIndex((r) => r.courseCode === target.courseCode || r.id === target.roomId)
        : 11;
      const safeIdx = roomIdx >= 0 ? roomIdx : 11;
      if (resetCampaignLives) {
        this.combat.lives = MovementProfile.lifecycle.initialLives;
        this.combat.score = 0;
        this.collectibles.syncLives(this.combat.lives);
      }
      this.loadRoom(safeIdx, !resetCampaignLives, { preserveLifecycle: true });
    };

    this.timerSeconds = MovementProfile.hud.initialTimeSeconds;
    this._timerTickAcc = 0;

    // Stage 10 Live Feel Preset, Gauntlet Section & Stage 17 Act Tracking
    this.feelPresetId = MovementProfile.activeFeelPreset || 'wonder';
    this.currentGauntletSectionId = 'A';
    this.currentActId = 'KI';

    // Stage 8 Pose & Animation Inspector state (gameplay pauses when active)
    this.poseInspector = {
      active: false,
      wasPausedBefore: false,
      clipName: 'Idle',
      playing: true,
      normalizedTime: 0,
      speed: 1.0,
      showSkeleton: false,
      wireframe: false,
      previewYawDeg: MovementProfile.stage8.cameraYawTiltDeg,
    };

    // UI state callbacks (set by React)
    this.onStateChange = null;
    this._uiTickListeners = new Set();
    this._lastReplay = null;
    this._initialized = false;
    this._hasAudioSupport = false;
    this._pausedGamepadTimer = null;
    this._boundUnlockAudio = () => {
      this.audio.resume();
    };
  }

  get tileMap() {
    return this.tilemap;
  }

  set tileMap(map) {
    this.tilemap = map;
    if (map) {
      this.collision = new CollisionSystem(map);
    }
  }

  get hitstopFrames() {
    return this.juice.hitstop.remainingFrames;
  }

  set hitstopFrames(val) {
    const next = Math.max(0, Math.round(val || 0));
    if (next === 0) {
      this.juice.hitstop.remainingFrames = 0;
    } else if (next > this.juice.hitstop.remainingFrames) {
      this.juice.hitstop.trigger(next, 'manual');
    } else {
      this.juice.hitstop.remainingFrames = next;
    }
  }

  subscribeUITick(listener) {
    this._uiTickListeners.add(listener);
    return () => this._uiTickListeners.delete(listener);
  }

  /**
   * Initialize the engine with a canvas element and Renderer class.
   * @param {HTMLCanvasElement} canvas
   * @param {typeof import('../rendering/Renderer.js').default} RendererClass
   */
  init(canvas, RendererClass) {
    if (this._initialized) return;
    this._initialized = true;
    this._hasAudioSupport = true;

    this.renderer = new RendererClass(canvas, this.camera);
    this.renderer.attachJuice?.(this.juice);
    this.renderer.onResize = () => this.loop.requestRender();
    if (this.renderer.isSoftwareGl && this.renderer.afterDraw) {
      this.loop.scheduleFrame = (cb) => this.renderer.afterDraw(cb);
    }

    this.input.init();
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._boundUnlockAudio, { passive: true });
      window.addEventListener('pointerdown', this._boundUnlockAudio, { passive: true });
    }

    this.collectibles = new CollectibleEconomySystem({ persistToStorage: true });
    this._campaignMode = true;
    this.loadRoom(11, false, { preserveLifecycle: true });
    this.lifecycle.setState(GameLifecycleState.TITLE_SCREEN);
    this.setCharacter(this.player.characterId);

    // Input polling and camera kinematics are locked strictly inside the 60 Hz fixed update
    this.loop.onFixedUpdate = (dt) => this._fixedUpdate(dt);
    this.loop.onRender = (alpha) => this._render(alpha);

    this._registerDebugKeys();
    this.loop.start();

    // Lightweight fallback poll so controller navigation works even when GameLoop is paused
    if (typeof window !== 'undefined' && !this._pausedGamepadTimer) {
      this._pausedGamepadTimer = window.setInterval(() => {
        if (!this._initialized || !this.loop.isPaused) return;
        const gp = this.input.pollGamepadHardwareOnly();
        if (gp) {
          this.input.uiNavigationActive = this.menuNavigator.poll(this.input);
        }
      }, 33);
    }
  }

  /**
   * Initialize without DOM/Canvas for deterministic headless Node verification.
   */
  initHeadless(roomIndex = 0) {
    this._initialized = true;
    this._hasAudioSupport = false;
    this._campaignMode = false;
    this.lifecycle.setState(GameLifecycleState.GAMEPLAY_ACTIVE);
    this.loadRoom(roomIndex, false, { preserveLifecycle: true });
    this.loop.onFixedUpdate = (dt) => this._fixedUpdate(dt);
  }

  /**
   * Advance one deterministic 60 Hz frame in headless mode with an action object
   * `{ left, right, up, down, jump, run, spin }` or bitmask.
   */
  stepHeadless(actions = {}, dt = MovementProfile.simulation.fixedTimeStep) {
    let mask = 0;
    if (typeof actions === 'number') {
      mask = actions;
    } else if (actions && typeof actions === 'object') {
      const list = [];
      if (actions.left) list.push(Actions.LEFT);
      if (actions.right) list.push(Actions.RIGHT);
      if (actions.up) list.push(Actions.UP);
      if (actions.down) list.push(Actions.DOWN);
      if (actions.jump) list.push(Actions.JUMP);
      if (actions.run) list.push(Actions.RUN);
      if (actions.spin) list.push(Actions.SPIN);
      mask = InputManager.encodeActions(list);
    }

    this.input.applySnapshot(mask);
    this._stepSimulation(dt, true);
  }

  /**
   * Initialize headless mode starting at TITLE_SCREEN in World 1 campaign mode
   * for deterministic end-to-end lifecycle & full playthrough verification.
   */
  initCampaignHeadless() {
    this._initialized = true;
    this._hasAudioSupport = false;
    this._campaignMode = true;
    const firstCourse = WORLD1_CAMPAIGN_COURSES[0];
    const startIdx = this.rooms.findIndex(
      (r) => r.courseCode === firstCourse.courseCode || r.id === firstCourse.roomId
    );
    this.loadRoom(startIdx >= 0 ? startIdx : 0, false, { preserveLifecycle: true });
    this.lifecycle.setState(GameLifecycleState.TITLE_SCREEN);
    this.loop.onFixedUpdate = (dt) => this._fixedUpdate(dt);
  }

  /**
   * Advance one deterministic 60 Hz frame through the full lifecycle state machine
   * (wipes, pause gate, defeat/respawn/game-over, stage clear) in headless mode.
   */
  stepCampaignHeadless(actions = {}, dt = MovementProfile.simulation.fixedTimeStep) {
    let mask = 0;
    if (typeof actions === 'number') {
      mask = actions;
    } else if (actions && typeof actions === 'object') {
      const list = [];
      if (actions.left) list.push(Actions.LEFT);
      if (actions.right) list.push(Actions.RIGHT);
      if (actions.up) list.push(Actions.UP);
      if (actions.down) list.push(Actions.DOWN);
      if (actions.jump) list.push(Actions.JUMP);
      if (actions.run) list.push(Actions.RUN);
      if (actions.spin) list.push(Actions.SPIN);
      mask = InputManager.encodeActions(list);
    }

    this.input.applySnapshot(mask);
    this.lifecycle.update(dt);
    if (!this.lifecycle.isSimulationAllowed) {
      return;
    }
    this._stepSimulation(dt, true);
    this._handlePostStepLifecycle();
  }

  destroy() {
    if (this._pausedGamepadTimer && typeof window !== 'undefined') {
      window.clearInterval(this._pausedGamepadTimer);
      this._pausedGamepadTimer = null;
    }
    this.menuNavigator.clearFocus();
    this.loop.stop();
    this.input.destroy();
    this.audio.destroy();
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._boundUnlockAudio);
      window.removeEventListener('pointerdown', this._boundUnlockAudio);
    }
    if (this.renderer?.destroy) {
      this.renderer.destroy();
    }
    this._initialized = false;
  }

  /**
   * Load a benchmark room by index (0-5).
   * Clones room TileMap so dynamic bricks & [?] blocks always reset cleanly.
   */
  loadRoom(index, preserveLives = false, { preserveLifecycle = false } = {}) {
    if (index < 0 || index >= this.rooms.length) return;
    const prevLives = this.combat.lives;
    this.currentRoomIndex = index;
    const room = this.rooms[index];

    this.tilemap = new TileMap(room.map.cols, room.map.rows, room.map.data);
    this.props.loadRoom(room);
    this.levelEngine.loadRoom(room);
    const legacyPlatforms = room.platforms || [];
    for (let i = 0; i < legacyPlatforms.length; i++) {
      legacyPlatforms[i].reset();
    }
    this.platforms = [...legacyPlatforms, ...this.props.platforms, ...this.levelEngine.platforms];
    this.collision = new CollisionSystem(this.tilemap);
    this.levelKit.loadRoom(room);
    this.combat.loadRoom(room, true);
    if (preserveLives) {
      this.combat.lives = prevLives;
      this.collectibles.syncLives(prevLives);
    }
    this.collectibles.bindRoom(room, this.levelEngine, this.combat);
    this.boss.loadFromRoom(room);
    this.juice.reset();
    this._wasCourseCleared = false;
    this.timerSeconds = MovementProfile.hud.initialTimeSeconds;
    this._timerTickAcc = 0;
    this._lastTimerWarningSec = -1;
    this._checkpointTriggeredForAct.clear();
    const courseCode = room.courseCode || room.id || `R-${index + 1}`;
    const preserveCheckpoint = preserveLives && this.checkpointState.courseCode === courseCode && this.checkpointState.reached;
    if (!preserveCheckpoint) {
      this.checkpointState = {
        reached: false,
        checkpointId: null,
        courseCode,
        bankedMedallions: [false, false, false],
        spawnX: null,
        spawnY: null,
      };
    }
    this.health = this.maxHealth;
    this.currentGauntletSectionId = room.sections?.[0]?.id || 'A';
    this.currentActId = room.acts?.[0]?.id || 'KI';
    this.geometryLintReport = lintTileMapGeometry(this.tilemap, room.name);
    const spawnX = preserveCheckpoint && this.checkpointState.spawnX !== null ? this.checkpointState.spawnX : room.spawnX;
    const spawnY = preserveCheckpoint && this.checkpointState.spawnY !== null ? this.checkpointState.spawnY : room.spawnY;
    this.player.spawn(spawnX, spawnY, {
      initialPowerUp: room.initialPowerUp || 'small',
    });

    const campaignIdx = WORLD1_CAMPAIGN_COURSES.findIndex(
      (c) => (room.courseCode && c.courseCode === room.courseCode) || (room.id && c.roomId === room.id)
    );
    if (campaignIdx >= 0) {
      this.lifecycle.campaignStageIndex = campaignIdx;
    }
    if (!preserveLifecycle && this.lifecycle.state !== GameLifecycleState.GAMEPLAY_ACTIVE) {
      this.lifecycle.setState(GameLifecycleState.GAMEPLAY_ACTIVE);
    }

    // Load room partition camera locks (if any) before snapping camera
    this.camera.setLocks(room.cameraLocks || []);

    // Settle initial grounded state on floor before snapping camera
    const dispW = this.renderer?.displayWidth ?? 1280;
    const dispH = this.renderer?.displayHeight ?? 720;
    const baseScale = this.renderer?.baseScale ?? dispW / (22 * MovementProfile.tilemap.tileSize);
    this.camera.snapToPlayer(this.player, this.tilemap, dispW, dispH, baseScale);

    this.renderer?.resetPresentation?.();
    this.loop.reset();
    this.loop.requestRender();

    for (const listener of this._uiTickListeners) {
      listener(this);
    }
    if (this.onStateChange) this.onStateChange();
  }

  // ─── Stage 21: Campaign Lifecycle Helpers ─────────────────

  startCampaign(startStageIndex = 0, options = {}) {
    this._campaignMode = true;
    this.audio.playMenuConfirm();
    this.loop.isPaused = false;
    this.lifecycle.startCampaign(startStageIndex, options);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
  }

  beginGameplay() {
    this.audio.playMenuConfirm();
    this.loop.isPaused = false;
    this.lifecycle.beginGameplay();
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
  }

  advanceToNextStage(options = {}) {
    this.audio.playMenuConfirm();
    const advanced = this.lifecycle.advanceToNextStage(options);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return advanced;
  }

  returnToTitle(options = {}) {
    this.audio.playMenuConfirm();
    this.loop.isPaused = false;
    this.lifecycle.returnToTitle(options);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
  }

  resetRoom() {
    this.loop.isPaused = false;
    this.loadRoom(this.currentRoomIndex, true);
  }

  resetEconomyProgress() {
    this.collectibles.resetPersistentProgress();
    if (this.currentRoom) {
      this.collectibles.bindRoom(this.currentRoom, this.levelEngine, this.combat);
    }
    for (const listener of this._uiTickListeners) {
      listener(this);
    }
    if (this.onStateChange) this.onStateChange();
  }

  // ─── Stage 10: Live Feel Preset Switcher & Gauntlet Teleporter ─

  setFeelPreset(presetId = 'wonder') {
    const preset = applyFeelPreset(presetId);
    this.feelPresetId = preset.id;
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return preset;
  }

  cycleFeelPreset() {
    const idx = PRESET_ORDER.indexOf(this.feelPresetId);
    const nextId = PRESET_ORDER[(idx + 1) % PRESET_ORDER.length];
    return this.setFeelPreset(nextId);
  }

  teleportGauntletSection(sectionIdOrIndex) {
    const gauntletIdx = this.rooms.findIndex((r) => r.isGauntlet);
    if (gauntletIdx < 0) return null;
    if (this.currentRoomIndex !== gauntletIdx) {
      this.loadRoom(gauntletIdx);
    }
    const room = this.currentRoom;
    const sections = room?.sections || [];
    let sec = null;
    if (typeof sectionIdOrIndex === 'string') {
      const upper = sectionIdOrIndex.toUpperCase();
      sec = sections.find((s) => s.id === upper || s.key === upper);
    } else if (typeof sectionIdOrIndex === 'number') {
      sec = sections[sectionIdOrIndex];
    }
    if (!sec) return null;

    const p = this.player;
    p.pos.x = sec.spawnX;
    p.pos.y = sec.spawnY;
    p.prevPos.x = sec.spawnX;
    p.prevPos.y = sec.spawnY;
    p.vel.x = 0;
    p.vel.y = 0;
    p.grounded = false;
    p.wasGrounded = false;
    p.isCrouched = Boolean(sec.spawnCrouched);
    p.standingBlocked = false;
    p.isSkidding = false;
    p.pivotTimer = 0;
    p.isButtSliding = false;
    p.isSlideLethal = false;
    p.isWallSliding = false;
    p.wallCoyoteFramesRemaining = 0;
    p.isWallJumping = false;
    p.wallJumpLockTimer = 0;
    p.wallJumpLockDir = 0;
    p.wallJumpHeldDirLock = 0;
    p.isSpinning = false;
    p.isSpinJumping = false;
    p.spinJumpFrames = 0;
    p.isSpinningCombat = false;
    p.jumpComboCount = 1;
    p._jumpComboGraceTimer = 0;
    p._canAdvanceJumpCombo = false;
    p.groundPoundPhase = null;
    p.warpPipeTimer = 0;
    p.warpPipeData = null;
    p.carriedEntity = null;
    p.setState(PlayerState.FALL);
    if (sec.grantPowerUp && p.powerUpForm === PowerUpForm.SMALL) {
      p.powerUpForm = sec.grantPowerUp;
    }
    p._computeHash();

    this.juice.hitstop.reset();
    this.currentGauntletSectionId = sec.id;
    const dispW = this.renderer?.displayWidth ?? 1280;
    const dispH = this.renderer?.displayHeight ?? 720;
    const baseScale = this.renderer?.baseScale ?? dispW / (22 * MovementProfile.tilemap.tileSize);
    this.camera.snapToPlayer(this.player, this.tilemap, dispW, dispH, baseScale);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return sec;
  }

  _updateGauntletTracking() {
    const sections = this.currentRoom?.sections;
    if (!sections?.length) return;
    let active = sections[0].id;
    for (let i = 0; i < sections.length; i++) {
      if (this.player.pos.x >= sections[i].spawnX - 0.8) {
        active = sections[i].id;
      }
    }
    this.currentGauntletSectionId = active;
  }

  /**
   * Stage 17 & 18: Teleport directly to a Kishōtenketsu Act (KI, SHO, TEN, KETSU)
   * on the active Kishōtenketsu course (or Course 1-1 fallback).
   */
  teleportAct(actIdOrIndex) {
    let kIdx = this.currentRoom?.isKishotenketsu ? this.currentRoomIndex : -1;
    if (kIdx < 0) {
      kIdx = this.rooms.findIndex((r) => r.isWorld1Course);
      if (kIdx < 0) kIdx = this.rooms.findIndex((r) => r.isKishotenketsu);
    }
    if (kIdx < 0) return null;
    if (this.currentRoomIndex !== kIdx) {
      this.loadRoom(kIdx);
    }
    const acts = this.currentRoom?.acts || [];
    let act = null;
    if (typeof actIdOrIndex === 'string') {
      const upper = actIdOrIndex.toUpperCase();
      act = acts.find((a) => a.id === upper);
    } else if (typeof actIdOrIndex === 'number') {
      act = acts[actIdOrIndex];
    }
    if (!act) return null;

    this.props.reset();
    const p = this.player;
    p.pos.x = act.spawnX;
    p.pos.y = act.spawnY;
    p.prevPos.x = act.spawnX;
    p.prevPos.y = act.spawnY;
    p.vel.x = 0;
    p.vel.y = 0;
    p.grounded = false;
    p.wasGrounded = false;
    p.isCrouched = false;
    p.standingBlocked = false;
    p.isSkidding = false;
    p.pivotTimer = 0;
    p.isButtSliding = false;
    p.isSlideLethal = false;
    p.isWallSliding = false;
    p.wallCoyoteFramesRemaining = 0;
    p.isWallJumping = false;
    p.wallJumpLockTimer = 0;
    p.isSpinning = false;
    p.isSpinJumping = false;
    p.groundPoundPhase = null;
    p.hydroJetTimer = 0;
    p.hydroJetFlutterWindow = 0;
    p.hitHazard = false;
    p.warpPipeTimer = 0;
    p.warpPipeData = null;
    p.warpTubeTimer = 0;
    p.warpTubeData = null;
    p.carriedEntity = null;
    p.setState(PlayerState.FALL);
    p._computeHash();

    this.juice.hitstop.reset();
    this.currentActId = act.id;
    this.levelEngine.currentActId = act.id;
    if (act.id === 'KETSU' && !this.levelEngine.twistActive) {
      this.levelEngine.triggerTwistInversion(this.props.platforms);
    }

    const dispW = this.renderer?.displayWidth ?? 1280;
    const dispH = this.renderer?.displayHeight ?? 720;
    const baseScale = this.renderer?.baseScale ?? dispW / (22 * MovementProfile.tilemap.tileSize);
    this.camera.snapToPlayer(this.player, this.tilemap, dispW, dispH, baseScale);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return act;
  }

  // ─── Time & Debug Controls ────────────────────────────────

  togglePause() {
    if (
      this.lifecycle.state === GameLifecycleState.GAMEPLAY_ACTIVE ||
      this.lifecycle.state === GameLifecycleState.PAUSE_MENU
    ) {
      const nowPaused = this.lifecycle.togglePause();
      this.loop.isPaused = false; // Keep 60 Hz lifecycle/render alive while simulation gates on lifecycle
      this.uiBus.emit(UIEvents.PAUSE_TOGGLED, {
        paused: nowPaused,
        courseCode: this.currentRoom?.courseCode || '1-1',
        timestampMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      });
      this.loop.requestRender();
      if (this.onStateChange) this.onStateChange();
      return nowPaused;
    }
    this.loop.togglePause();
    this.uiBus.emit(UIEvents.PAUSE_TOGGLED, {
      paused: this.loop.isPaused,
      courseCode: this.currentRoom?.courseCode || '1-1',
      timestampMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
    if (this.onStateChange) this.onStateChange();
    return this.loop.isPaused;
  }

  /**
   * Project world tile coordinates into normalized screen fractions (0..1) for flying pickup VFX.
   */
  worldToNormalizedScreen(worldX, worldY) {
    const camX = this.camera?.x ?? 0;
    const camY = this.camera?.y ?? 0;
    const dispW = this.renderer?.displayWidth ?? 1280;
    const dispH = this.renderer?.displayHeight ?? 720;
    const tilePx = (MovementProfile.tilemap.tileSize || 64) * (this.renderer?.baseScale ?? 1);
    const sx = ((worldX - camX) * tilePx + dispW * 0.5) / Math.max(1, dispW);
    const sy = 1 - ((worldY - camY) * tilePx + dispH * 0.35) / Math.max(1, dispH);
    return {
      screenX: Math.max(0.08, Math.min(0.92, Number.isFinite(sx) ? sx : 0.5)),
      screenY: Math.max(0.12, Math.min(0.88, Number.isFinite(sy) ? sy : 0.5)),
    };
  }

  /**
   * Activate the stored Reserve Item (Super Core / Flame Orb / Life-Up Heart).
   */
  activateReserveItem() {
    if (!this.reserveItem) return false;
    const item = this.reserveItem;
    this.reserveItem = null;
    if (item === 'super_core') {
      if (this.player.powerUpForm === PowerUpForm.SMALL) {
        this.player.powerUpForm = PowerUpForm.SUPER;
      }
      this.health = this.maxHealth;
    } else if (item === 'flame_orb') {
      this.player.powerUpForm = PowerUpForm.FIRE;
      this.health = this.maxHealth;
    } else if (item === 'life_up') {
      this.health = this.maxHealth;
      this.bonusHealth = 3;
    }
    this.audio.playPowerUp?.(item === 'flame_orb' ? 'fire_flower' : 'super_mushroom');
    this.uiBus.emit(UIEvents.RESERVE_ITEM_CHANGED, { item, action: 'activated' });
    this.uiBus.emit(UIEvents.TOAST_REQUESTED, {
      kind: 'boon',
      title: 'Reserve Used',
      message: item === 'flame_orb' ? 'Flame Form Activated' : item === 'life_up' ? 'Life-Up +3 Wedges' : 'Super Form Restored',
    });
    if (this.onStateChange) this.onStateChange();
    return true;
  }

  storeReserveItem(item) {
    this.reserveItem = item;
    this.uiBus.emit(UIEvents.RESERVE_ITEM_CHANGED, { item, action: 'stored' });
    if (this.onStateChange) this.onStateChange();
  }

  awardPrismPetals(amount = 1, worldX = null, worldY = null) {
    const delta = Math.max(0, Math.floor(amount));
    if (delta === 0) return this.prismPetals;
    this.prismPetals = Math.min(999, this.prismPetals + delta);
    const pos = this.worldToNormalizedScreen(worldX ?? this.player.pos.x, worldY ?? this.player.pos.y);
    this.uiBus.emit(UIEvents.COIN_COLLECTED, {
      currency: 'petal',
      amount: delta,
      total: this.prismPetals,
      worldX: worldX ?? this.player.pos.x,
      worldY: worldY ?? this.player.pos.y,
      ...pos,
    });
    if (this.onStateChange) this.onStateChange();
    return this.prismPetals;
  }

  triggerCheckpoint(checkpointId = 'midway', spawnX = null, spawnY = null) {
    const courseCode = this.currentRoom?.courseCode || this.currentRoom?.id || '1-1';
    const sockets = this.collectibles.getCourseSockets();
    const boonGranted = this.player.powerUpForm === PowerUpForm.SMALL;
    if (boonGranted) {
      this.player.powerUpForm = PowerUpForm.SUPER;
    }
    this.health = this.maxHealth;
    this.checkpointState = {
      reached: true,
      checkpointId,
      courseCode,
      bankedMedallions: sockets.slice(),
      spawnX: spawnX ?? this.player.pos.x,
      spawnY: spawnY ?? this.player.pos.y,
    };
    this.audio.playPowerUp?.('super_mushroom');
    this.uiBus.emit(UIEvents.CHECKPOINT_REACHED, {
      checkpointId,
      courseCode,
      boonGranted,
      bankedMedallions: sockets.slice(),
      worldX: this.player.pos.x,
      worldY: this.player.pos.y,
    });
    if (this.onStateChange) this.onStateChange();
  }

  stepFrame() {
    this.loop.stepFrame();
    if (this.onStateChange) this.onStateChange();
  }

  cycleTimeScale() {
    this.loop.cycleTimeScale();
    if (this.onStateChange) this.onStateChange();
    return this.loop.timeScale;
  }

  toggleGrid() {
    if (this.renderer) {
      this.renderer.showGrid = !this.renderer.showGrid;
      this.loop.requestRender();
      if (this.onStateChange) this.onStateChange();
      return this.renderer.showGrid;
    }
    return false;
  }

  toggleHitboxes() {
    if (this.renderer) {
      this.renderer.showHitboxes = !this.renderer.showHitboxes;
      this.loop.requestRender();
      if (this.onStateChange) this.onStateChange();
      return this.renderer.showHitboxes;
    }
    return false;
  }

  toggleCameraDebug() {
    this.camera.debugOverlay = !this.camera.debugOverlay;
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return this.camera.debugOverlay;
  }

  toggleMute() {
    const muted = this.audio.toggleMute();
    if (this.onStateChange) this.onStateChange();
    return muted;
  }

  toggleTwilight() {
    if (!this.renderer?.tileAtlas) return false;
    this.renderer.tileAtlas.useTwilight = !this.renderer.tileAtlas.useTwilight;
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return this.renderer.tileAtlas.useTwilight;
  }

  // ─── Stage 8: Character Hot-Swap & Pose Inspector ───────────

  get characterId() {
    return this.player.characterId;
  }

  setCharacter(characterId) {
    const cfg = this.player.setCharacter(characterId);
    applyCharacterProfile(cfg.id);
    this.renderer?.setCharacter?.(cfg.id);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return cfg.id;
  }

  toggleCharacter() {
    const next = this.player.characterId === 'mario' ? 'luigi' : 'mario';
    return this.setCharacter(next);
  }

  togglePoseInspector(forceState = null) {
    const nextActive = forceState !== null ? Boolean(forceState) : !this.poseInspector.active;
    if (nextActive === this.poseInspector.active) return nextActive;

    this.poseInspector.active = nextActive;
    if (nextActive) {
      this.poseInspector.wasPausedBefore = this.loop.isPaused;
      if (!this.loop.isPaused) {
        this.loop.togglePause();
      }
      const activeClip = this.renderer?.rig3D?.activeClipName;
      if (activeClip) {
        this.poseInspector.clipName = activeClip;
      }
      this.poseInspector.playing = true;
    } else if (!this.poseInspector.wasPausedBefore && this.loop.isPaused) {
      this.loop.togglePause();
    }
    this.loop.keepRenderingWhilePaused = Boolean(this.poseInspector.active && this.poseInspector.playing);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
    return this.poseInspector.active;
  }

  setPoseInspectorState(patch = {}) {
    Object.assign(this.poseInspector, patch);
    this.loop.keepRenderingWhilePaused = Boolean(this.poseInspector.active && this.poseInspector.playing);
    this.renderer?.setPoseInspectorState?.(this.poseInspector);
    this.loop.requestRender();
    if (this.onStateChange) this.onStateChange();
  }

  // ─── Deterministic Recording & Replay ───────────────────────

  startRecording() {
    this.resetRoom();
    this.input.startRecording({
      roomIndex: this.currentRoomIndex,
      spawnX: this.currentRoom.spawnX,
      spawnY: this.currentRoom.spawnY,
    });
    if (this.onStateChange) this.onStateChange();
  }

  stopRecording() {
    const replay = this.input.stopRecording();
    this._lastReplay = replay;
    if (this.onStateChange) this.onStateChange();
    return replay;
  }

  playReplay(replay = this._lastReplay) {
    if (!replay || !replay.frames || replay.frames.length === 0) return false;
    const targetRoom = replay.meta?.roomIndex ?? this.currentRoomIndex;
    this.loadRoom(targetRoom);
    this.input.loadReplay(replay);
    if (this.onStateChange) this.onStateChange();
    return true;
  }

  stopReplay() {
    this.input.stopReplay();
    if (this.onStateChange) this.onStateChange();
  }

  // ─── Simulation & Render ──────────────────────────────────

  /**
   * Fixed 60 Hz update — input polling + physics tick + Stage 6 level kit tick + Stage 7 camera tick.
   */
  _fixedUpdate(dt) {
    const wasReplaying = this.input.isReplaying;
    // Update UI navigation lock before gameplay reads input so menu presses never leak to jumps
    if (typeof document !== 'undefined' && !this.input.isReplaying) {
      this.input.uiNavigationActive = Boolean(this.menuNavigator.getActiveScopeElement());
    } else {
      this.input.uiNavigationActive = false;
    }

    this.input.poll();

    if (typeof document !== 'undefined' && !this.input.isReplaying) {
      this.input.uiNavigationActive = this.menuNavigator.poll(this.input);
    }

    // Advance Stage 21 Game Lifecycle & smooth screen wipes at fixed 60 Hz
    this.lifecycle.update(dt);

    if (!this.lifecycle.isSimulationAllowed) {
      return;
    }

    this._stepSimulation(dt, false);
    this._handlePostStepLifecycle();

    if (wasReplaying && !this.input.isReplaying && this.onStateChange) {
      this.onStateChange();
    }
  }

  _handlePostStepLifecycle() {
    if (this.player.defeatTriggerReset) {
      const nextLives = Math.max(0, this.combat.lives - 1);
      this.combat.lives = nextLives;
      this.collectibles.syncLives(nextLives);
      const penaltyCoins = Math.min(10, this.collectibles.shardCount);
      this.uiBus.emit(UIEvents.LIFE_LOST, {
        livesRemaining: nextLives,
        penaltyCoins,
        courseCode: this.currentRoom?.courseCode || '1-1',
      });
      if (this._campaignMode) {
        this.player.defeatTriggerReset = false;
        this.lifecycle.onPlayerDefeated(nextLives);
      } else {
        this.combat.lives = Math.max(1, nextLives);
        this.collectibles.syncLives(this.combat.lives);
        this.loadRoom(this.currentRoomIndex, true);
      }
      return;
    }

    if (this._campaignMode && this.levelKit.courseCleared && !this._wasCourseCleared) {
      this._wasCourseCleared = true;
      const courseCode = this.currentRoom?.courseCode || null;
      this.lifecycle.onStageCleared(courseCode);
      this.uiBus.emit(UIEvents.COURSE_CLEARED, {
        courseCode: courseCode || '1-1',
        score: this.combat.score,
        shards: this.collectibles.totalShards,
        petals: this.prismPetals,
        medallions: this.collectibles.getCourseSockets(),
        clearTimeSec: this.lifecycle.campaignClearTimeSec,
        isWorldVictory: this.lifecycle.isWorldVictory,
        flagpoleHeightRatio: this.levelKit.flagpole?.heightRatio ?? 0.5,
      });
    }
  }

  _stepSimulation(dt, headless = false) {
    // Stage 20 Global Hitstop Freeze:
    // Lock physics, entities, timer, and 3D skeletal pose while:
    //   - Never de-synchronizing the fixed 60 Hz clock
    //   - Capturing rising input edges so zero input-buffer events are dropped
    //   - Keeping T² trauma screen shake, particles, and combat popups alive
    if (this.juice.hitstop.active) {
      if (this.input.held(Actions.JUMP)) {
        this.player.upgradeStompReboundToActive();
      }
      this.player.prevPos.x = this.player.pos.x;
      this.player.prevPos.y = this.player.pos.y;
      for (let i = 0; i < this.combat.enemies.length; i++) this.combat.enemies[i].syncPrevPos();
      for (let i = 0; i < this.combat.powerUps.length; i++) this.combat.powerUps[i].syncPrevPos();
      for (let i = 0; i < this.combat.fireballs.length; i++) this.combat.fireballs[i].syncPrevPos();

      this.juice.stepFrozenTick(dt, this.input);
      this.combat.updateVisualsOnly(dt);
      if (!headless && this.renderer) {
        this.renderer.particles.update(dt);
        this.renderer.advanceVisualEffectsOnly?.(dt);
      }
      return;
    }

    // Replay any rising input edges buffered during the preceding hitstop freeze
    this.juice.hitstop.flushBufferedInputTo(this.input);

    // Decay prior-tick T² trauma & advance active directional particles once per 60 Hz tick
    this.juice.update(dt, this.player);

    // 0. Clear per-tick Collectible Economy events
    this.collectibles.beginTick();

    // 1. Update legacy platforms, EnvironmentalProps platforms, and Stage 17 Water Geysers
    const legacyPlatforms = this.currentRoom?.platforms || [];
    for (let i = 0; i < legacyPlatforms.length; i++) {
      legacyPlatforms[i].update(dt);
    }
    this.props.updatePlatforms(dt, this.player.ridingPlatform);
    this.levelEngine.updateGeysers(dt);

    // 2. Check Warp Access Tube entry (DOWN / UP / LEFT / RIGHT) & advance compressing springs
    this.props.checkWarpTubeEntry(this.player, this.input);
    this.props.stepActiveSprings(this.player, this.input);

    // Stage 10 Warp Pipe entry check (stand centered over pipe top & hold Down)
    if (
      this.currentRoom?.warpPipes?.length &&
      this.player.grounded &&
      this.input.held(Actions.DOWN) &&
      this.player.state !== PlayerState.WARP_PIPE &&
      this.player.state !== PlayerState.IN_WARP_TRANSITION &&
      this.player.state !== PlayerState.DEFEAT
    ) {
      const wpCfg = MovementProfile.warpPipe;
      for (let i = 0; i < this.currentRoom.warpPipes.length; i++) {
        const wp = this.currentRoom.warpPipes[i];
        if (
          Math.abs(this.player.centerX - wp.enterX) <= wpCfg.toleranceX &&
          Math.abs(this.player.pos.y - wp.enterY) <= wpCfg.toleranceY
        ) {
          this.player.startWarpPipe(wp);
          break;
        }
      }
    }

    this.player.update(this.input, this.collision, dt, this.platforms, {
      activeFireballsCount: this.combat.fireballs.length,
      solidBoxes: this.props.getSolidBoxes(),
    });

    // 3. Post-player: Capture newly landed player onto IDLE Compression Launch Springs
    this.props.captureIdleSprings(this.player, this.input);

    // Stage 10 Gauntlet section progress & non-fatal chasm pit rescue
    if (this.currentRoom?.isGauntlet) {
      this._updateGauntletTracking();
      if (this.player.pos.y < -2.0 && this.player.state !== PlayerState.DEFEAT) {
        this.input.clearInjectedPresses();
        this.teleportGauntletSection(this.currentGauntletSectionId);
        return;
      }
    } else if (
      this.currentRoom?.chasmRescue &&
      this.player.pos.y < -2.5 &&
      this.player.state !== PlayerState.DEFEAT &&
      this.player.state !== PlayerState.IN_WARP_TRANSITION
    ) {
      this.input.clearInjectedPresses();
      if (this.currentRoom?.isKishotenketsu) {
        this.teleportAct(this.currentActId);
        return;
      }
      this.player.spawn(this.currentRoom.spawnX, this.currentRoom.spawnY);
      this.props.reset();
      this.camera.snapToPlayer(
        this.player,
        this.tilemap,
        this.renderer?.displayWidth ?? 1280,
        this.renderer?.displayHeight ?? 720,
        this.renderer?.baseScale ?? 1
      );
      return;
    }

    this.levelKit.update(this.player, this.tilemap, dt, this.combat);
    this.combat.update(this.player, this.input, this.collision, dt, this.platforms, this.levelKit);
    // Clear one-tick replayed hitstop edges after player, props, and combat have all consumed them
    this.input.clearInjectedPresses();
    this.boss.update(dt, this.player, this.combat, this.tilemap, this.levelKit);
    this.levelEngine.updatePostPlayer(dt, this.player, this.combat, this.props.platforms, this.levelKit);
    this.collectibles.processTickEvents({
      levelKit: this.levelKit,
      levelEngine: this.levelEngine,
      combat: this.combat,
    });
    if (this.levelEngine.active) {
      this.currentActId = this.levelEngine.currentActId;
    }

    // Stage 18: Handle Goal Exit Pipe clear & Spike Hazard recoil/rescue (zero inescapable pits)
    for (let i = 0; i < this.player.events.length; i++) {
      const ev = this.player.events[i];
      if (ev.type === 'goalPipeClear') {
        if (!this.levelKit.courseCleared) {
          this.levelKit.courseCleared = true;
          this.combat.addScore(MovementProfile.world1.exitPipeBonus, ev.x, ev.y + 1.2, '#67E8F9');
        }
      } else if (ev.type === 'hazardSpike' && this.player.state !== PlayerState.DEFEAT) {
        if (this.player.invulnerabilityTimer === 0) {
          if (this.currentRoom?.chasmRescue && this.player.powerUpForm === PowerUpForm.SMALL) {
            if (this.currentRoom?.isKishotenketsu) {
              this.teleportAct(this.currentActId);
              return;
            }
            this.player.spawn(this.currentRoom.spawnX, this.currentRoom.spawnY);
            this.props.reset();
            return;
          }
          const damaged = this.player.takeDamage();
          if (damaged) {
            this.juice.hitstop.triggerPlayerDamage('hazardSpike');
            this.juice.squash.onDamage();
            this.camera.addTrauma(MovementProfile.juice.trauma.playerDamage, -Math.sign(this.player.vel.x || 1), 0.4);
            this.audio.playDamage();
          }
        }
        if (this.player.state !== PlayerState.DEFEAT) {
          this.player.vel.y = Math.max(this.player.vel.y, MovementProfile.world1.spikeRescueHopVy);
          this.player.grounded = false;
          this.player.setState(PlayerState.JUMP);
        }
      }
    }

    this.player.isVictory = Boolean(this.levelKit.courseCleared);

    // Countdown Timer (paused on Course Clear, Defeat, or Hitstop)
    if (!this.levelKit.courseCleared && this.player.state !== PlayerState.DEFEAT) {
      this._timerTickAcc += dt;
      if (this._timerTickAcc >= 1.0) {
        this._timerTickAcc -= 1.0;
        if (this.timerSeconds > 0) this.timerSeconds--;
        if (this.timerSeconds <= 100 && this.timerSeconds !== this._lastTimerWarningSec) {
          this._lastTimerWarningSec = this.timerSeconds;
          this.uiBus.emit(UIEvents.TIMER_WARNING, {
            secondsRemaining: this.timerSeconds,
            isFinalTen: this.timerSeconds > 0 && this.timerSeconds <= 10,
            expired: this.timerSeconds <= 0,
          });
        }
      }
    }

    // Emit UIEventBus events for UI v2 (zero physics mutation)
    this._emitUIEvents();

    if (!headless && this.levelKit.tilemapDirty && this.renderer) {
      this.renderer.invalidateTileGrid();
    }

    const dispW = this.renderer?.displayWidth ?? 1280;
    const dispH = this.renderer?.displayHeight ?? 720;
    const baseScale = this.renderer?.baseScale ?? dispW / (22 * MovementProfile.tilemap.tileSize);
    let snappedCameraOnWarp = false;

    // Route Stage 20 Multi-Sensory Juice (Hitstops, T² Trauma Shake, Directional Particles & Squash)
    this.juice.processSimulationEvents({
      playerEvents: this.player.events,
      levelKitEvents: this.levelKit.events,
      combatEvents: this.combat.events,
    });

    // Route Stage 21 Boss Encounter juice (Slam trauma + shockwaves, Wall slam trauma, Core strike hitstop, Shatter)
    for (let i = 0; i < this.boss.events.length; i++) {
      const bev = this.boss.events[i];
      if (bev.type === 'bossGroundSlam') {
        this.juice.triggerBossGroundSlam(bev.x, bev.y);
      } else if (bev.type === 'bossWallSlam') {
        this.juice.trauma.addShellWallRebound(bev.dir || 1);
      } else if (bev.type === 'bossCeilingDrop') {
        this.juice.trauma.addBossGroundSlam();
      } else if (bev.type === 'bossCoreStrike') {
        this.juice.hitstop.trigger(bev.hitstopFrames, 'bossCoreStrike');
        this.juice.trauma.addTrauma(bev.trauma, 0, -0.5, 'bossCoreStrike');
        this.juice.particles.spawnStressBurst(bev.x, bev.y, 24);
      } else if (bev.type === 'bossDefeated') {
        this.juice.particles.spawnStressBurst(bev.x, bev.y, 56);
      } else if (bev.type === 'bossPlayerHit') {
        this.juice.hitstop.triggerPlayerDamage('bossHit');
        this.juice.trauma.addTrauma(MovementProfile.juice.trauma.playerDamage, 0, 0.35, 'bossHit');
        this.juice.squash.onDamage();
      }
    }

    // Route Warp relocation camera snap & auxiliary trauma impulses
    for (let i = 0; i < this.player.events.length; i++) {
      const ev = this.player.events[i];
      if (ev.type === 'warpRelocate') {
        this.props.inSubArea = Boolean(ev.destSubArea);
        this.camera.snapToPlayer(this.player, this.tilemap, dispW, dispH, baseScale);
        snappedCameraOnWarp = true;
      }
    }
    for (let i = 0; i < this.props.events.length; i++) {
      const pev = this.props.events[i];
      if (pev.type === 'springBounce' && pev.isSuper) {
        this.camera.addTrauma(MovementProfile.props.spring.superCameraTrauma, 0, 1);
      }
    }
    for (let i = 0; i < this.levelEngine.events.length; i++) {
      const leEv = this.levelEngine.events[i];
      if (leEv.type === 'twistHerald') {
        this.camera.addTrauma(MovementProfile.levelEngine.heraldTrauma, 0, -1);
      } else if (leEv.type === 'twistAnticipate') {
        this.camera.addTrauma(MovementProfile.levelEngine.heraldTrauma * 0.45, 0, -0.5);
      } else if (leEv.type === 'pinnacleGoal') {
        this.camera.addTrauma(0.22, 0, 0.8);
      }
    }
    for (let i = 0; i < this.collectibles.events.length; i++) {
      const colEv = this.collectibles.events[i];
      if (colEv.type === 'oneUpFromShards') {
        this.camera.addTrauma(0.20, 0, 0.5);
      }
    }

    // Advance 2.5D Camera Controller at fixed 60 Hz
    if (!snappedCameraOnWarp) {
      this.camera.updateFromPlayer(this.player, dt, this.tilemap, dispW, dispH, baseScale);
    }

    // Fire impact audio chimes & asymmetric dual-motor haptics immediately on the impact tick
    this._processAudioEvents();
    this._processHapticEvents();

    if (headless) return;

    // Process presentation-only particle & audio events
    if (this.renderer) {
      this.renderer.onSimTick(this.player, dt);
      for (let i = 0; i < this.props.events.length; i++) {
        const pev = this.props.events[i];
        if (pev.type === 'springBounce') {
          this.renderer.particles.spawnSpringBurst?.(pev.x, pev.y, pev.isSuper);
        } else if (pev.type === 'platformFallAway') {
          this.renderer.particles.spawnPlatformCrumble?.(pev.x, pev.y, pev.width);
        }
      }
      for (let i = 0; i < this.levelKit.events.length; i++) {
        const lev = this.levelKit.events[i];
        if (lev.type === 'coinCollect' || lev.type === 'questionBlockCoin') {
          this.renderer.particles.spawnCoinBurst(lev.x, lev.y);
        } else if (lev.type === 'brickBump' || lev.type === 'brickBreak') {
          this.renderer.particles.spawnBlockBumpDust(lev.x, lev.y);
        } else if (lev.type === 'flagpole') {
          this.renderer.particles.spawnCoinBurst(lev.x, lev.y);
        }
      }
      for (let i = 0; i < this.combat.events.length; i++) {
        const cev = this.combat.events[i];
        if (cev.type === 'stomp') {
          this.renderer.particles.spawnStompStars?.(cev.x, cev.y);
        } else if (cev.type === 'powerUp' || cev.type === 'powerUpSpawn') {
          this.renderer.particles.spawnPowerUpBurst?.(cev.x, cev.y, cev.powerUpType);
        } else if (cev.type === 'fireball' || cev.type === 'fireballWallSpark' || cev.type === 'fireballHitEnemy') {
          this.renderer.particles.spawnFireballSparks?.(
            cev.x,
            cev.y,
            cev.type === 'fireballWallSpark' ? 10 : 6
          );
        } else if (
          cev.type === 'shellKick' ||
          cev.type === 'shellRicochet' ||
          cev.type === 'hopliteWallBounce' ||
          cev.type === 'shellHitEnemy'
        ) {
          this.renderer.particles.spawnShellRicochetSparks?.(cev.x, cev.y);
        } else if (cev.type === 'damage') {
          this.renderer.particles.spawnStompStars?.(cev.x, cev.y);
        }
      }
      for (let i = 0; i < this.player.events.length; i++) {
        const pev = this.player.events[i];
        if (pev.type === 'goalPipeClear') {
          this.renderer.particles.spawnCoinBurst(pev.x, pev.y + 1.0);
        }
      }
      for (let i = 0; i < this.levelEngine.events.length; i++) {
        const leEv = this.levelEngine.events[i];
        if (
          leEv.type === 'starMedallion' ||
          leEv.type === 'secretOneUp' ||
          leEv.type === 'twistHerald' ||
          leEv.type === 'pinnacleGoal'
        ) {
          this.renderer.particles.spawnCoinBurst(leEv.x, leEv.y);
        } else if (leEv.type === 'horizontalJet') {
          this.renderer.particles.spawnSprintDust?.(leEv.x, leEv.y, leEv.dir || 1);
        }
      }
      for (let i = 0; i < this.collectibles.events.length; i++) {
        const colEv = this.collectibles.events[i];
        if (colEv.type === 'oneUpFromShards') {
          this.renderer.particles.spawnOneUpRing?.(
            colEv.x,
            colEv.y,
            MovementProfile.collectibles.oneUpRingParticleCount
          );
        }
      }
    }
  }

  _emitUIEvents() {
    for (let i = 0; i < this.levelKit.events.length; i++) {
      const lev = this.levelKit.events[i];
      if (lev.type === 'coinCollect' || lev.type === 'questionBlockCoin') {
        const pos = this.worldToNormalizedScreen(lev.x, lev.y);
        this.uiBus.emit(UIEvents.COIN_COLLECTED, {
          currency: 'gold',
          amount: 1,
          shardCount: this.collectibles.shardCount,
          totalShards: this.collectibles.totalShards,
          worldX: lev.x,
          worldY: lev.y,
          ...pos,
        });
      }
    }

    for (let i = 0; i < this.combat.events.length; i++) {
      const cev = this.combat.events[i];
      if (cev.type === 'damage') {
        if (this.bonusHealth > 0) {
          this.bonusHealth = Math.max(0, this.bonusHealth - 1);
        } else {
          this.health = Math.max(0, this.health - 1);
        }
        this.uiBus.emit(UIEvents.DAMAGE_TAKEN, {
          hp: this.health,
          maxHp: this.maxHealth,
          bonusHp: this.bonusHealth,
          form: this.player.powerUpForm,
          defeated: Boolean(cev.defeated),
          worldX: cev.x ?? this.player.pos.x,
          worldY: cev.y ?? this.player.pos.y,
        });
      } else if (cev.type === 'powerUp') {
        if (cev.powerUpType === 'fire_flower' && this.player.powerUpForm === PowerUpForm.FIRE && !this.reserveItem) {
          this.storeReserveItem('flame_orb');
        } else if (cev.powerUpType === 'super_mushroom' && !this.reserveItem) {
          this.storeReserveItem('super_core');
        }
        this.health = this.maxHealth;
      }
    }

    for (let i = 0; i < this.levelEngine.events.length; i++) {
      const leEv = this.levelEngine.events[i];
      if (leEv.type === 'starMedallion') {
        const pos = this.worldToNormalizedScreen(leEv.x, leEv.y);
        this.prismPetals = Math.min(999, this.prismPetals + 10);
        this.uiBus.emit(UIEvents.SPECIAL_COLLECTED, {
          kind: 'medallion',
          slotIndex: leEv.slotIndex ?? leEv.index ?? 0,
          totalCollected: this.collectibles.getCourseSockets().filter(Boolean).length,
          courseCode: this.currentRoom?.courseCode || '1-1',
          worldX: leEv.x,
          worldY: leEv.y,
          ...pos,
        });
      } else if (leEv.type === 'actEnter' && leEv.actId === 'TEN' && !this._checkpointTriggeredForAct.has('TEN')) {
        this._checkpointTriggeredForAct.add('TEN');
        this.triggerCheckpoint('midway-act-ten', this.player.pos.x, this.player.pos.y);
      } else if (leEv.type === 'secretOneUp') {
        this.uiBus.emit(UIEvents.LIFE_GAINED, { lives: this.combat.lives, source: 'secret' });
      }
    }

    for (let i = 0; i < this.collectibles.events.length; i++) {
      const colEv = this.collectibles.events[i];
      if (colEv.type === 'oneUpFromShards') {
        this.uiBus.emit(UIEvents.LIFE_GAINED, { lives: this.collectibles.lives, source: 'shards100' });
      }
    }
  }

  _processAudioEvents() {
    for (let i = 0; i < this.player.events.length; i++) {
      const ev = this.player.events[i];
      if (ev.type === 'footstep') {
        this.audio.playFootstep(ev.speedRatio, ev.isSprint);
      } else if (ev.type === 'skid') {
        this.audio.playSkid();
      } else if (ev.type === 'crouch') {
        this.audio.playCrouch();
      } else if (ev.type === 'uncrouch') {
        this.audio.playUncrouch();
      } else if (ev.type === 'jump') {
        this.audio.playJump(ev.launchVy, ev.baseVy, ev.viaCoyote, ev.viaBuffer, ev.combo);
      } else if (ev.type === 'spinJump') {
        this.audio.playSpinJump();
      } else if (ev.type === 'land' && ev.impactSpeed >= MovementProfile.vfx.landingDustMinSpeed) {
        this.audio.playLand(ev.impactSpeed);
      } else if (ev.type === 'blockHit' && !TileMap.isInteractiveBlockType(ev.tileType)) {
        this.audio.playBlockHit();
      } else if (ev.type === 'spinTwirl') {
        this.audio.playSpin();
      } else if (ev.type === 'wallSlide') {
        this.audio.playWallSlide();
      } else if (ev.type === 'wallJump') {
        this.audio.playWallJump();
      } else if (ev.type === 'groundPoundWindup') {
        this.audio.playGroundPoundWindup();
      } else if (ev.type === 'groundPoundImpact') {
        this.audio.playGroundPound();
      } else if (ev.type === 'buttSlide') {
        const speedRatio = Math.min(1, ev.speed / MovementProfile.slopes.buttSlideMaxSpeed);
        this.audio.playSlopeSlide(speedRatio);
      } else if (ev.type === 'semisolidDrop') {
        this.audio.playSemisolidDrop();
      } else if (ev.type === 'warpPipeEnter' || ev.type === 'warpPipeExit') {
        this.audio.playWarpPipe?.();
      } else if (ev.type === 'warpTransitionStart') {
        this.audio.playWarpTubeSlide?.(false);
      } else if (ev.type === 'warpTransitionEnd') {
        this.audio.playWarpTubeSlide?.(true);
      } else if (ev.type === 'goalPipeClear') {
        this.audio.playFlagpoleFanfare();
      } else if (ev.type === 'hazardSpike') {
        this.audio.playDamage(false);
      }
    }

    for (let i = 0; i < this.props.events.length; i++) {
      const pev = this.props.events[i];
      if (pev.type === 'springBounce') {
        this.audio.playSpringBounce?.(pev.isSuper);
      } else if (pev.type === 'platformFallAway') {
        this.audio.playPlatformFallAway?.();
      }
    }

    for (let i = 0; i < this.levelKit.events.length; i++) {
      const lev = this.levelKit.events[i];
      if (lev.type === 'coinCollect' || lev.type === 'questionBlockCoin') {
        this.audio.playCoinCollect();
      } else if (lev.type === 'brickBump') {
        this.audio.playBlockBump();
      } else if (lev.type === 'brickBreak') {
        this.audio.playBrickBreak();
      } else if (lev.type === 'flagpole') {
        this.audio.playFlagpoleFanfare();
      } else if (lev.type === 'questionBlockPowerUp') {
        this.audio.playBlockBump();
      }
    }

    for (let i = 0; i < this.combat.events.length; i++) {
      const cev = this.combat.events[i];
      if (cev.type === 'stomp') {
        this.audio.playStomp(cev.combo);
      } else if (cev.type === 'powerUp') {
        this.audio.playPowerUp(cev.powerUpType);
      } else if (cev.type === 'fireball') {
        this.audio.playFireball();
      } else if (cev.type === 'hopliteWallBounce') {
        this.audio.playBronzeRicochet?.(cev.bounces || 1);
      } else if (cev.type === 'shellKick' || cev.type === 'shellRicochet' || cev.type === 'shellHitEnemy') {
        if (cev.oneUp) {
          this.audio.playOneUp?.();
        } else {
          this.audio.playShellKick(cev.bounces || cev.combo || 1);
        }
      } else if (cev.type === 'damage') {
        this.audio.playDamage(cev.defeated);
      } else if (cev.type === 'fireballWallSpark' || cev.type === 'fireballHitEnemy') {
        this.audio.playShellKick(2);
      } else if (cev.type === 'shellBrickBreak') {
        this.audio.playBrickBreak?.();
      }
    }

    for (let i = 0; i < this.levelEngine.events.length; i++) {
      const leEv = this.levelEngine.events[i];
      if (leEv.type === 'twistHerald') {
        this.audio.playTwistHerald?.(false);
      } else if (leEv.type === 'twistAnticipate') {
        this.audio.playTwistHerald?.(true);
      } else if (leEv.type === 'starMedallion') {
        this.audio.playStarMedallion?.();
      } else if (leEv.type === 'secretOneUp') {
        this.audio.playOneUp?.();
      } else if (leEv.type === 'pinnacleGoal') {
        this.audio.playFlagpoleFanfare();
      }
    }

    for (let i = 0; i < this.collectibles.events.length; i++) {
      const colEv = this.collectibles.events[i];
      if (colEv.type === 'oneUpFromShards') {
        this.audio.playOneUp?.();
      }
    }

    for (let i = 0; i < this.boss.events.length; i++) {
      const bev = this.boss.events[i];
      if (bev.type === 'bossGroundSlam' || bev.type === 'bossCeilingDrop') {
        this.audio.playBossSlam?.();
      } else if (bev.type === 'bossRoar' || bev.type === 'bossSpinDashStart') {
        this.audio.playBossRoar?.(bev.phase || 2);
      } else if (bev.type === 'bossWallSlam') {
        this.audio.playBronzeRicochet?.(2);
      } else if (bev.type === 'bossCoreStrike') {
        this.audio.playBossCoreHit?.(bev.strikeNumber || 1);
      } else if (bev.type === 'bossDefeated' || bev.type === 'worldExitPortalEntered') {
        this.audio.playBossVictoryFanfare?.();
      } else if (bev.type === 'bossShellDeflect') {
        this.audio.playBronzeRicochet?.(1);
      } else if (bev.type === 'bossPlayerHit') {
        this.audio.playDamage?.(bev.defeated);
      }
    }
  }

  /**
   * Route simulation tactile events into DualShock 4 asymmetric dual-motor haptics.
   */
  _processHapticEvents() {
    const haptics = this.input?.haptics;
    if (!haptics) return;

    // Continuous / cadence-pulsed surface friction haptics
    haptics.tickSkidFriction(Boolean(this.player.isSkidding));
    haptics.tickWallSlideFriction(Boolean(this.player.isWallSliding));

    // Player physical events (Ground Pound Slam, Hazard Damage)
    for (let i = 0; i < this.player.events.length; i++) {
      const ev = this.player.events[i];
      if (ev.type === 'groundPoundImpact') {
        haptics.triggerGroundPound();
      } else if (ev.type === 'hazardSpike') {
        haptics.triggerPlayerDamage();
      }
    }

    // Combat events (Stomp on Sproutling/Enemy, Hoplite Shell Kick, Player Damage)
    for (let i = 0; i < this.combat.events.length; i++) {
      const cev = this.combat.events[i];
      if (cev.type === 'stomp') {
        haptics.triggerStompSproutling();
      } else if (cev.type === 'shellKick' || cev.type === 'hopliteWallBounce' || cev.type === 'shellHitEnemy') {
        haptics.triggerHopliteShellKick();
      } else if (cev.type === 'damage') {
        haptics.triggerPlayerDamage();
      }
    }

    // Boss heavy impact events
    for (let i = 0; i < this.boss.events.length; i++) {
      const bev = this.boss.events[i];
      if (bev.type === 'bossGroundSlam' || bev.type === 'bossCeilingDrop') {
        haptics.triggerGroundPound();
      } else if (bev.type === 'bossCoreStrike' || bev.type === 'bossWallSlam') {
        haptics.triggerHopliteShellKick();
      } else if (bev.type === 'bossPlayerHit') {
        haptics.triggerPlayerDamage();
      }
    }

    // Timed Super Spring launch
    for (let i = 0; i < this.props.events.length; i++) {
      const pev = this.props.events[i];
      if (pev.type === 'springBounce' && pev.isSuper) {
        haptics.triggerSuperSpring();
      }
    }

    // Gold Coin / Shard collect
    for (let i = 0; i < this.levelKit.events.length; i++) {
      const lev = this.levelKit.events[i];
      if (lev.type === 'coinCollect' || lev.type === 'questionBlockCoin') {
        haptics.triggerCoinCollect();
      }
    }
    for (let i = 0; i < this.collectibles.events.length; i++) {
      const colEv = this.collectibles.events[i];
      if (colEv.type === 'shardCollect') {
        haptics.triggerCoinCollect();
      }
    }
  }

  /**
   * Render frame with interpolation (never mutates simulation or camera state!).
   */
  _render(alpha) {
    if (!this.renderer) return;

    this.renderer._isPausedRender = this.loop.isPaused || this.lifecycle.state === GameLifecycleState.PAUSE_MENU;
    this.renderer._isHitstopRender = this.juice.isPresentationFrozen;
    this.renderer.syncCameraRenderState(alpha);

    this.renderer.clear(this.currentRoom);
    this.renderer.beginWorldPass();
    this.renderer.drawSubAreaBackdrop?.(this.props);
    this.renderer.drawTileMap(this.tilemap, this.currentRoom, this.levelKit);
    this.renderer.drawLevelGimmicks?.(this.levelEngine, alpha, this.player);
    this.renderer.drawPropsBack?.(this.props, alpha, this.player);
    this.renderer.drawPlatforms?.(this.platforms, alpha, this.player);
    this.renderer.drawBossEncounter?.(this.boss, alpha, this.player);
    this.renderer.drawCombatStarbursts?.(this.combat, alpha);
    this.renderer.drawCombatEntities?.(this.combat, alpha, this.player);
    this.renderer.drawParticles();
    this.renderer.drawPlayer(this.player, alpha, this.poseInspector);
    this.renderer.drawPropsFront?.(this.props, alpha, this.player);
    this.renderer.drawCombatOverlay?.(this.combat, alpha);
    this.renderer.drawForegroundParallax?.(this.tilemap, this.currentRoom);
    this.renderer.endWorldPass();
    this.renderer.drawVignette?.(this.player);
    this.renderer.drawWarpFade?.(this.player);
    this.renderer.drawScreenWipe?.(this.lifecycle.wipe);
    this.renderer.drawCameraDebug?.(this.player);

    for (const listener of this._uiTickListeners) {
      listener(this);
    }
  }

  _registerDebugKeys() {
    for (let i = 1; i <= 9; i++) {
      this.input.registerDebugKey(String(i), () => {
        if (this.currentRoom?.isGauntlet) {
          this.teleportGauntletSection(i - 1);
        } else if (i <= this.rooms.length) {
          this.loadRoom(i - 1);
        }
      });
    }
    this.input.registerDebugKey('0', () => this.loadRoom(this.rooms.length > 9 ? 9 : 0));
    this.input.registerDebugKey('[', () => {
      this.loadRoom((this.currentRoomIndex - 1 + this.rooms.length) % this.rooms.length);
    });
    this.input.registerDebugKey(']', () => {
      this.loadRoom((this.currentRoomIndex + 1) % this.rooms.length);
    });

    this.input.registerDebugKey(' ', () => this.togglePause());
    this.input.registerDebugKey('Escape', () => {
      if (!this.poseInspector?.active) this.togglePause();
    });
    this.input.registerDebugKey('p', () => this.cycleFeelPreset());
    this.input.registerDebugKey('F6', () => this.cycleFeelPreset());
    this.input.registerDebugKey('f6', () => this.cycleFeelPreset());
    this.input.registerDebugKey('.', () => this.stepFrame());
    this.input.registerDebugKey('t', () => this.cycleTimeScale());
    this.input.registerDebugKey('g', () => this.toggleGrid());
    this.input.registerDebugKey('b', () => this.toggleHitboxes());
    this.input.registerDebugKey('r', () => this.resetRoom());
    this.input.registerDebugKey('m', () => this.toggleMute());
    this.input.registerDebugKey('v', () => this.toggleTwilight());
    this.input.registerDebugKey('c', () => this.toggleCharacter());
    this.input.registerDebugKey('F4', () => this.toggleCameraDebug());
    this.input.registerDebugKey('f4', () => this.toggleCameraDebug());
    this.input.registerDebugKey('F5', () => this.togglePoseInspector());
    this.input.registerDebugKey('f5', () => this.togglePoseInspector());
  }

  getFeelPresets() {
    return FEEL_PRESETS;
  }

  registerUIKey(key, callback) {
    this.input.registerDebugKey(key, callback);
  }

  get currentRoom() {
    return this.rooms[this.currentRoomIndex];
  }

  get movementProfile() {
    return MovementProfile;
  }
}

export default GameEngine;
