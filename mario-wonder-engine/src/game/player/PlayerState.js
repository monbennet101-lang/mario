/**
 * PlayerState — Finite State Machine for Character Controller
 * =============================================================
 * All valid player states and their transition rules.
 * Used by PlayerController for state arbitration.
 */

export const PlayerState = {
  // Ground states
  IDLE: 'Idle',
  WALK: 'Walk',
  RUN: 'Run',
  SPRINT: 'Sprint',
  SKID: 'Skid',
  PIVOT: 'Pivot',
  CROUCH: 'Crouch',
  CROUCH_SLIDE: 'CrouchSlide',
  BUTT_SLIDE: 'ButtSlide',

  // Aerial states
  JUMP: 'Jump',
  FALL: 'Fall',
  APEX_FLOAT: 'ApexFloat',
  FLUTTER_JUMP: 'FlutterJump',
  SPIN_JUMP: 'SpinJump',
  SPIN_TWIRL: 'SpinTwirl',

  // Wall states
  WALL_SLIDE: 'WallSlide',
  WALL_JUMP: 'WallJump',

  // Combat states
  GROUND_POUND_WINDUP: 'GroundPoundWindup',
  GROUND_POUND_FALL: 'GroundPoundFall',
  GROUND_POUND_LAND: 'GroundPoundLand',

  // Reactions & Transitions
  WARP_PIPE: 'WarpPipe',
  IN_WARP_TRANSITION: 'IN_WARP_TRANSITION',
  DAMAGE: 'Damage',
  DEFEAT: 'Defeat',
  VICTORY: 'Victory',
};

/**
 * State groups for quick classification.
 */
export const StateGroups = {
  grounded: new Set([
    PlayerState.IDLE,
    PlayerState.WALK,
    PlayerState.RUN,
    PlayerState.SPRINT,
    PlayerState.SKID,
    PlayerState.PIVOT,
    PlayerState.CROUCH,
    PlayerState.CROUCH_SLIDE,
    PlayerState.BUTT_SLIDE,
    PlayerState.GROUND_POUND_LAND,
  ]),

  airborne: new Set([
    PlayerState.JUMP,
    PlayerState.FALL,
    PlayerState.APEX_FLOAT,
    PlayerState.FLUTTER_JUMP,
    PlayerState.SPIN_JUMP,
    PlayerState.SPIN_TWIRL,
    PlayerState.WALL_SLIDE,
    PlayerState.WALL_JUMP,
    PlayerState.GROUND_POUND_WINDUP,
    PlayerState.GROUND_POUND_FALL,
  ]),

  canJump: new Set([
    PlayerState.IDLE,
    PlayerState.WALK,
    PlayerState.RUN,
    PlayerState.SPRINT,
    PlayerState.SKID,
    PlayerState.PIVOT,
    PlayerState.CROUCH,
    PlayerState.CROUCH_SLIDE,
    PlayerState.BUTT_SLIDE,
  ]),

  canSpin: new Set([
    PlayerState.JUMP,
    PlayerState.FALL,
    PlayerState.APEX_FLOAT,
    PlayerState.FLUTTER_JUMP,
    PlayerState.WALL_JUMP,
  ]),

  canGroundPound: new Set([
    PlayerState.JUMP,
    PlayerState.FALL,
    PlayerState.APEX_FLOAT,
    PlayerState.FLUTTER_JUMP,
    PlayerState.SPIN_JUMP,
    PlayerState.SPIN_TWIRL,
    PlayerState.WALL_JUMP,
  ]),

  canWallSlide: new Set([
    PlayerState.JUMP,
    PlayerState.FALL,
    PlayerState.APEX_FLOAT,
    PlayerState.FLUTTER_JUMP,
    PlayerState.SPIN_JUMP,
    PlayerState.SPIN_TWIRL,
    PlayerState.WALL_JUMP,
  ]),

  isGroundPounding: new Set([
    PlayerState.GROUND_POUND_WINDUP,
    PlayerState.GROUND_POUND_FALL,
    PlayerState.GROUND_POUND_LAND,
  ]),

  locomotion: new Set([
    PlayerState.IDLE,
    PlayerState.WALK,
    PlayerState.RUN,
    PlayerState.SPRINT,
  ]),
};

export default PlayerState;
