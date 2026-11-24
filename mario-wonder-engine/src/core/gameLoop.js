/**
 * Stage 21: Full Game Lifecycle State Machine & Fixed 60 Hz Loop (`src/core/gameLoop.js`)
 * ========================================================================================
 * Formalizes complete game state transitions with deterministic 60 Hz screen wipes,
 * audio ducking, and World 1 campaign progression:
 *
 *   States:
 *     - TITLE_SCREEN
 *     - LEVEL_INTRO
 *     - GAMEPLAY_ACTIVE
 *     - PAUSE_MENU
 *     - PLAYER_DEATH_RESPAWN
 *     - GAME_OVER
 *     - STAGE_CLEAR
 *
 *   Campaign Sequence:
 *     TITLE_SCREEN -> 1-1 (Verdant Outskirts) -> 1-2 (Deep Slate Cavern)
 *                  -> 1-3 (Hydro-Pulse Ridge) -> 1-4 (Dread-Shell Sanctum)
 *                  -> STAGE_CLEAR (World 1 Victory Screen)
 */

import GameLoop from '../engine/core/GameLoop.js';
import MovementProfile from '../game/config/MovementProfile.js';

export const GameLifecycleState = {
  TITLE_SCREEN: 'TITLE_SCREEN',
  LEVEL_INTRO: 'LEVEL_INTRO',
  GAMEPLAY_ACTIVE: 'GAMEPLAY_ACTIVE',
  PAUSE_MENU: 'PAUSE_MENU',
  PLAYER_DEATH_RESPAWN: 'PLAYER_DEATH_RESPAWN',
  GAME_OVER: 'GAME_OVER',
  STAGE_CLEAR: 'STAGE_CLEAR',
};

export const WORLD1_CAMPAIGN_COURSES = [
  { courseCode: '1-1', roomId: '1-1-verdant-outskirts', title: 'Verdant Outskirts', subtitle: 'World 1-1 · Plains & Shell Chains' },
  { courseCode: '1-2', roomId: '1-2-deep-slate-cavern', title: 'Deep Slate Cavern', subtitle: 'World 1-2 · Springs & Wall Chimney' },
  { courseCode: '1-3', roomId: '1-3-hydro-pulse-ridge', title: 'Hydro-Pulse Ridge', subtitle: 'World 1-3 · Pulsing Geysers & Jets' },
  { courseCode: '1-4', roomId: '1-4-dread-shell-sanctum', title: 'Dread-Shell Sanctum', subtitle: 'World 1 Boss · The Dread-Shell Golem' },
];

export class GameLifecycleController {
  constructor(initialState = GameLifecycleState.GAMEPLAY_ACTIVE) {
    this.state = initialState;
    this.previousState = initialState;
    this.campaignStageIndex = 0; // 0: 1-1, 1: 1-2, 2: 1-3, 3: 1-4 Boss
    this.isWorldVictory = false;
    this.stateTimerFrames = 0;
    this.transitionCount = 0;
    this.campaignClearTimeSec = 0;
    this.stagesCleared = [];

    // Smooth deterministic 60 Hz screen wipe state
    this.wipe = {
      phase: 'none', // 'none' | 'closing' | 'hold' | 'opening'
      progress: 0,   // 0 = clear viewport, 1 = fully covered
      timer: 0,
      style: 'iris', // 'iris' | 'curtain'
      onPeak: null,
    };

    // Audio ducking target synced to AudioManager
    this.audioDuckingFactor = this._resolveDuckingForState(initialState);

    // Optional hooks set by GameEngine
    this.onStateChanged = null;
    this.onAudioDuckChange = null;
    this.onLoadCampaignStage = null;
  }

  _resolveDuckingForState(state) {
    const cfg = MovementProfile.lifecycle;
    switch (state) {
      case GameLifecycleState.GAMEPLAY_ACTIVE:
        return cfg.duckActiveGain; // 1.00
      case GameLifecycleState.STAGE_CLEAR:
        return cfg.duckClearGain; // 0.85
      case GameLifecycleState.TITLE_SCREEN:
      case GameLifecycleState.LEVEL_INTRO:
      case GameLifecycleState.PAUSE_MENU:
      case GameLifecycleState.PLAYER_DEATH_RESPAWN:
      case GameLifecycleState.GAME_OVER:
      default:
        return cfg.duckMenuGain; // 0.35
    }
  }

  get currentCampaignCourse() {
    return WORLD1_CAMPAIGN_COURSES[this.campaignStageIndex] || WORLD1_CAMPAIGN_COURSES[0];
  }

  get isSimulationAllowed() {
    return this.state === GameLifecycleState.GAMEPLAY_ACTIVE && this.wipe.phase !== 'closing' && this.wipe.phase !== 'hold';
  }

  /**
   * Immediately apply a lifecycle state change and update audio ducking.
   */
  setState(nextState, { isWorldVictory = false } = {}) {
    if (!Object.values(GameLifecycleState).includes(nextState)) {
      throw new Error(`Invalid GameLifecycleState: ${nextState}`);
    }
    this.previousState = this.state;
    this.state = nextState;
    this.isWorldVictory = nextState === GameLifecycleState.STAGE_CLEAR ? Boolean(isWorldVictory) : false;
    this.transitionCount++;

    const cfg = MovementProfile.lifecycle;
    if (nextState === GameLifecycleState.LEVEL_INTRO) {
      this.stateTimerFrames = cfg.levelIntroFrames;
    } else if (nextState === GameLifecycleState.PLAYER_DEATH_RESPAWN) {
      this.stateTimerFrames = cfg.respawnFrames;
    } else if (nextState === GameLifecycleState.STAGE_CLEAR) {
      this.stateTimerFrames = cfg.stageClearAutoFrames;
    } else {
      this.stateTimerFrames = 0;
    }

    this.audioDuckingFactor = this._resolveDuckingForState(nextState);
    if (this.onAudioDuckChange) {
      this.onAudioDuckChange(this.audioDuckingFactor, nextState);
    }
    if (this.onStateChanged) {
      this.onStateChanged(this.state, this.previousState);
    }
    return this.state;
  }

  /**
   * Trigger a smooth deterministic screen wipe (close -> peak callback -> open).
   */
  startWipe(onPeak, style = 'iris') {
    const cfg = MovementProfile.lifecycle;
    this.wipe.phase = 'closing';
    this.wipe.progress = 0;
    this.wipe.timer = cfg.wipeCloseFrames;
    this.wipe.style = style;
    this.wipe.onPeak = onPeak || null;
  }

  /**
   * Start a fresh World 1 campaign from Title Screen -> 1-1 Level Intro.
   */
  startCampaign(startStageIndex = 0, { immediate = false } = {}) {
    this.campaignStageIndex = Math.max(0, Math.min(WORLD1_CAMPAIGN_COURSES.length - 1, startStageIndex));
    this.isWorldVictory = false;
    this.stagesCleared = [];
    this.campaignClearTimeSec = 0;

    const applyStage = () => {
      if (this.onLoadCampaignStage) {
        this.onLoadCampaignStage(this.campaignStageIndex, { resetCampaignLives: true });
      }
      this.setState(GameLifecycleState.LEVEL_INTRO);
    };

    if (immediate) {
      applyStage();
    } else {
      this.startWipe(applyStage, 'iris');
    }
  }

  /**
   * Begin gameplay immediately from LEVEL_INTRO (either on timer expiry or button press).
   */
  beginGameplay() {
    this.setState(GameLifecycleState.GAMEPLAY_ACTIVE);
  }

  /**
   * Toggle between GAMEPLAY_ACTIVE and PAUSE_MENU with audio ducking.
   */
  togglePause() {
    if (this.state === GameLifecycleState.GAMEPLAY_ACTIVE) {
      this.setState(GameLifecycleState.PAUSE_MENU);
      return true;
    }
    if (this.state === GameLifecycleState.PAUSE_MENU) {
      this.setState(GameLifecycleState.GAMEPLAY_ACTIVE);
      return false;
    }
    return this.state === GameLifecycleState.PAUSE_MENU;
  }

  /**
   * Handle player defeat: enter PLAYER_DEATH_RESPAWN, then either respawn or GAME_OVER.
   */
  onPlayerDefeated(remainingLivesAfterDeath) {
    this._pendingLivesAfterDeath = remainingLivesAfterDeath;
    this.setState(GameLifecycleState.PLAYER_DEATH_RESPAWN);
  }

  /**
   * Handle course clear (1-1, 1-2, 1-3) or Boss defeat + Exit Portal (1-4 -> World Victory).
   */
  onStageCleared(courseCode = null) {
    const code = courseCode || this.currentCampaignCourse.courseCode;
    if (!this.stagesCleared.includes(code)) {
      this.stagesCleared.push(code);
    }
    const isFinalBoss = code === '1-4' || this.campaignStageIndex >= WORLD1_CAMPAIGN_COURSES.length - 1;
    this.setState(GameLifecycleState.STAGE_CLEAR, { isWorldVictory: isFinalBoss });
  }

  /**
   * Advance from STAGE_CLEAR to the next World 1 course (1-1 -> 1-2 -> 1-3 -> 1-4 Boss).
   * Returns true if advanced to next stage, false if World 1 Victory is already complete.
   */
  advanceToNextStage({ immediate = false } = {}) {
    if (this.isWorldVictory || this.campaignStageIndex >= WORLD1_CAMPAIGN_COURSES.length - 1) {
      return false;
    }
    this.campaignStageIndex++;
    const applyNext = () => {
      if (this.onLoadCampaignStage) {
        this.onLoadCampaignStage(this.campaignStageIndex, { resetCampaignLives: false });
      }
      this.setState(GameLifecycleState.LEVEL_INTRO);
    };

    if (immediate) {
      applyNext();
    } else {
      this.startWipe(applyNext, 'curtain');
    }
    return true;
  }

  returnToTitle({ immediate = false } = {}) {
    const applyTitle = () => {
      this.campaignStageIndex = 0;
      this.isWorldVictory = false;
      this.setState(GameLifecycleState.TITLE_SCREEN);
    };
    if (immediate) {
      applyTitle();
    } else {
      this.startWipe(applyTitle, 'iris');
    }
  }

  /**
   * Step deterministic 60 Hz lifecycle timers & screen wipe animations.
   */
  update(dt) {
    const cfg = MovementProfile.lifecycle;

    if (this.state === GameLifecycleState.GAMEPLAY_ACTIVE) {
      this.campaignClearTimeSec += dt;
    }

    // 1. Advance screen wipe animation
    if (this.wipe.phase === 'closing') {
      this.wipe.timer--;
      this.wipe.progress = Math.min(1, 1 - this.wipe.timer / Math.max(1, cfg.wipeCloseFrames));
      if (this.wipe.timer <= 0) {
        this.wipe.progress = 1;
        this.wipe.phase = 'hold';
        this.wipe.timer = cfg.wipeHoldFrames;
        const cb = this.wipe.onPeak;
        this.wipe.onPeak = null;
        if (cb) cb();
      }
      return;
    }

    if (this.wipe.phase === 'hold') {
      this.wipe.timer--;
      this.wipe.progress = 1;
      if (this.wipe.timer <= 0) {
        this.wipe.phase = 'opening';
        this.wipe.timer = cfg.wipeOpenFrames;
      }
      return;
    }

    if (this.wipe.phase === 'opening') {
      this.wipe.timer--;
      this.wipe.progress = Math.max(0, this.wipe.timer / Math.max(1, cfg.wipeOpenFrames));
      if (this.wipe.timer <= 0) {
        this.wipe.progress = 0;
        this.wipe.phase = 'none';
      }
    }

    // 2. Advance timed states (LEVEL_INTRO, PLAYER_DEATH_RESPAWN)
    if (this.state === GameLifecycleState.LEVEL_INTRO && this.stateTimerFrames > 0) {
      this.stateTimerFrames--;
      if (this.stateTimerFrames <= 0) {
        this.setState(GameLifecycleState.GAMEPLAY_ACTIVE);
      }
    } else if (this.state === GameLifecycleState.PLAYER_DEATH_RESPAWN && this.stateTimerFrames > 0) {
      this.stateTimerFrames--;
      if (this.stateTimerFrames <= 0) {
        const livesLeft = this._pendingLivesAfterDeath ?? 0;
        if (livesLeft <= 0) {
          this.startWipe(() => this.setState(GameLifecycleState.GAME_OVER), 'curtain');
        } else {
          this.startWipe(() => {
            if (this.onLoadCampaignStage) {
              this.onLoadCampaignStage(this.campaignStageIndex, { resetCampaignLives: false });
            }
            this.setState(GameLifecycleState.LEVEL_INTRO);
          }, 'iris');
        }
      }
    }
  }
}

export { GameLoop };
export default GameLifecycleController;
