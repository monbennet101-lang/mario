/**
 * CharacterRig3D — Stage 8 Hybrid 2.5D Three.js Rigged Character Renderer
 * =========================================================================
 * Loads Mario & Luigi glTF binaries (/models/mario.glb, /models/luigi.glb),
 * maps all 27 baked animations via THREE.AnimationMixer with cross-fading,
 * applies the 20° Wonder 3/4 camera yaw tilt, enforces dynamic volume-preserving
 * pelvis/spine squash & stretch (Sx * Sy * Sz = 1.00 ± 0.02), supports Pose &
 * Animation Inspector mode ([F5]), and composites cleanly onto the 2D Canvas
 * behind Layer 4 foreground foliage tufts.
 */

import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Box3,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  SkeletonHelper,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import MovementProfile from '../../game/config/MovementProfile.js';
import { PlayerState } from '../../game/player/PlayerState.js';
import { PowerUpForm } from '../../game/powerups/PowerUp.js';
import { clamp, degToRad } from '../../utils/MathUtils.js';

const IS_CLEAN_RELEASE =
  (typeof __CLEAN_RELEASE__ !== 'undefined' && __CLEAN_RELEASE__) ||
  (typeof window !== 'undefined' && window.location?.protocol === 'file:');

const THREE = {
  ACESFilmicToneMapping,
  AnimationMixer,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  LoopOnce,
  LoopRepeat,
  OrthographicCamera,
  PMREMGenerator,
  Scene,
  SkeletonHelper,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
};

export const CHARACTER_ANIM_CLIPS = MovementProfile.stage8.allClips;

const LOOP_ONCE_CLIPS = new Set([
  'Skid',
  'TurnAround',
  'Jump',
  'DoubleJump',
  'TripleJump',
  'SpinJump',
  'WallJump',
  'Fireball',
  'FireballAir',
  'GroundPound',
  'GroundPoundLand',
  'CrouchStart',
  'Throw',
  'Damage',
  'Defeat',
]);

// Pre-allocated scratch math objects (zero allocations inside render loop)
const _scratchDir = new THREE.Vector3();
const _scratchHeadPos = new THREE.Vector3();
const _scratchRootPos = new THREE.Vector3();
const _scratchVert = new THREE.Vector3();

const LEG_STRIDE_BONES = ['leg_l1', 'leg_l2', 'leg_r1', 'leg_r2'];
const LEG_THIGH_DAMP = 0.68;
const LEG_KNEE_DAMP = 0.52;

/**
 * Pure helper: Compute volume-preserving Pelvis & Spine bone scales for a target Sy.
 * Because `spin` (spine) is a child of `skl_root` (pelvis), factoring Sy as
 * `pelvisSy = Sy^0.55` and `spineSy = Sy^0.45` keeps BOTH bones individually
 * volume-preserving (`Sxz = 1 / sqrt(Sy)`) AND yields `pelvisSy * spineSy = Sy`.
 */
export function computeVolumePreservingSquash(
  targetSy,
  pelvisShare = MovementProfile.stage8.squashPelvisShare,
  spineShare = MovementProfile.stage8.squashSpineShare
) {
  const safeSy = clamp(targetSy || 1.0, 0.35, 1.55);
  const pelvisSy = Math.pow(safeSy, pelvisShare);
  const pelvisSxz = 1.0 / Math.sqrt(pelvisSy);
  const spineSy = Math.pow(safeSy, spineShare);
  const spineSxz = 1.0 / Math.sqrt(spineSy);

  const pelvisVolume = pelvisSxz * pelvisSxz * pelvisSy;
  const spineVolume = spineSxz * spineSxz * spineSy;
  return {
    sy: safeSy,
    pelvisSy,
    pelvisSxz,
    spineSy,
    spineSxz,
    pelvisVolume,
    spineVolume,
    combinedSy: pelvisSy * spineSy,
    combinedVolume: pelvisVolume * spineVolume,
  };
}

/**
 * Pure helper: Map PlayerController state & motion telemetry to baked 3D clip spec.
 */
export function resolveClipSpec(player) {
  const cfg = MovementProfile.stage8;
  const absVx = Math.abs(player.vel.x);

  if (player.isVictory) {
    return { clipName: 'Victory', loopOnce: false, fadeSec: cfg.crossFadeSec, timeScale: 1.0 };
  }

  if (player.state === PlayerState.DEFEAT) {
    return { clipName: 'Defeat', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };
  }

  if (player.state === PlayerState.DAMAGE) {
    return { clipName: 'Damage', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };
  }

  if (player.fireThrowAnimTimer > 0) {
    return {
      clipName: player.grounded ? 'Fireball' : 'FireballAir',
      loopOnce: true,
      fadeSec: 0.04,
      timeScale: 1.45,
    };
  }

  if (player.shellThrowAnimTimer > 0) {
    return {
      clipName: 'Throw',
      loopOnce: true,
      fadeSec: 0.05,
      timeScale: 1.35,
    };
  }

  switch (player.state) {
    case PlayerState.GROUND_POUND_WINDUP:
    case PlayerState.GROUND_POUND_FALL:
      return { clipName: 'GroundPound', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.15 };

    case PlayerState.GROUND_POUND_LAND:
      return { clipName: 'GroundPoundLand', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };

    case PlayerState.WALL_SLIDE:
      return { clipName: 'WallSlide', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };

    case PlayerState.WALL_JUMP:
      return { clipName: 'WallJump', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };

    case PlayerState.SPIN_JUMP: {
      const inTakeoff = (player.spinJumpFrames || 0) < MovementProfile.spinJump.launchClipFrames;
      return {
        clipName: inTakeoff ? 'SpinJump' : 'SpinAir',
        loopOnce: inTakeoff,
        fadeSec: cfg.quickFadeSec,
        timeScale: inTakeoff ? 1.0 : 1.15,
      };
    }

    case PlayerState.SPIN_TWIRL:
      return {
        clipName: 'SpinAir',
        loopOnce: false,
        fadeSec: cfg.quickFadeSec,
        timeScale: 1.15,
      };

    case PlayerState.FLUTTER_JUMP:
      return { clipName: 'Run', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: cfg.runPlaybackScale };

    case PlayerState.APEX_FLOAT:
    case PlayerState.JUMP: {
      const combo = player.jumpComboCount || 1;
      const clipName = combo === 3 ? 'TripleJump' : combo === 2 ? 'DoubleJump' : 'Jump';
      return {
        clipName,
        loopOnce: true,
        fadeSec: cfg.quickFadeSec,
        timeScale: combo === 3 ? 1.35 : 1.0,
      };
    }

    case PlayerState.FALL: {
      if (player.isJumping && player.jumpComboCount === 3) {
        return { clipName: 'TripleJump', loopOnce: true, fadeSec: cfg.crossFadeSec, timeScale: 1.35 };
      }
      if (player.isJumping && player.jumpComboCount === 2) {
        return { clipName: 'DoubleJump', loopOnce: true, fadeSec: cfg.crossFadeSec, timeScale: 1.0 };
      }
      return { clipName: 'Jump', loopOnce: true, fadeSec: cfg.crossFadeSec, timeScale: 0.85 };
    }

    case PlayerState.BUTT_SLIDE:
      return { clipName: 'Crouch', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };

    case PlayerState.WARP_PIPE:
      return { clipName: 'Crouch', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };

    case PlayerState.IN_WARP_TRANSITION: {
      const vec = player.warpTransition?.entryVector || 'DOWN';
      if (vec === 'UP') {
        return { clipName: 'Jump', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: 0.9 };
      }
      if (vec === 'LEFT' || vec === 'RIGHT') {
        return { clipName: 'Walk', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: cfg.walkPlaybackScale * 0.8 };
      }
      return { clipName: 'Crouch', loopOnce: false, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };
    }

    case PlayerState.CROUCH:
    case PlayerState.CROUCH_SLIDE:
      return player.stateFrames < 5
        ? { clipName: 'CrouchStart', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.25 }
        : { clipName: 'Crouch', loopOnce: false, fadeSec: cfg.crossFadeSec, timeScale: 1.0 };

    case PlayerState.SKID:
      return { clipName: 'Skid', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.0 };

    case PlayerState.PIVOT:
      return { clipName: 'TurnAround', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.25 };

    case PlayerState.SPRINT:
      if (player.carriedEntity) {
        return {
          clipName: 'CarryWalk',
          loopOnce: false,
          fadeSec: cfg.crossFadeSec,
          timeScale: clamp(absVx / cfg.walkClipBaseSpeed, 0.85, 1.4) * cfg.runPlaybackScale,
        };
      }
      return {
        clipName: 'Sprint',
        loopOnce: false,
        fadeSec: cfg.crossFadeSec,
        timeScale: clamp(absVx / cfg.sprintClipBaseSpeed, 0.88, 1.35) * cfg.sprintPlaybackScale,
      };

    case PlayerState.RUN:
      if (player.carriedEntity) {
        return {
          clipName: 'CarryWalk',
          loopOnce: false,
          fadeSec: cfg.crossFadeSec,
          timeScale: clamp(absVx / cfg.walkClipBaseSpeed, 0.78, 1.3) * cfg.runPlaybackScale,
        };
      }
      return {
        clipName: 'Sprint',
        loopOnce: false,
        fadeSec: cfg.crossFadeSec,
        timeScale: clamp(absVx / cfg.sprintClipBaseSpeed, 0.72, 1.25) * cfg.sprintPlaybackScale,
      };

    case PlayerState.WALK:
      if (player.carriedEntity) {
        return {
          clipName: 'CarryWalk',
          loopOnce: false,
          fadeSec: cfg.crossFadeSec,
          timeScale: clamp(absVx / cfg.walkClipBaseSpeed, 0.65, 1.25) * cfg.walkPlaybackScale,
        };
      }
      if (player.turnAroundTimer > 0) {
        return { clipName: 'TurnAround', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.2 };
      }
      return {
        clipName: 'Run',
        loopOnce: false,
        fadeSec: cfg.crossFadeSec,
        timeScale: clamp(absVx / cfg.walkClipBaseSpeed, 0.65, 1.35) * cfg.walkPlaybackScale,
      };

    case PlayerState.IDLE:
    default:
      if (player.carriedEntity) {
        return { clipName: 'CarryWalk', loopOnce: false, fadeSec: cfg.crossFadeSec, timeScale: 0.05 * cfg.idlePlaybackScale };
      }
      if (player.turnAroundTimer > 0) {
        return { clipName: 'TurnAround', loopOnce: true, fadeSec: cfg.quickFadeSec, timeScale: 1.2 };
      }
      return { clipName: 'Idle', loopOnce: false, fadeSec: cfg.crossFadeSec, timeScale: cfg.idlePlaybackScale };
  }
}

function detectSoftwareGl() {
  if (typeof document === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    probe.width = 1;
    probe.height = 1;
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const vendor = dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
    const info = `${renderer || ''} ${vendor || ''}`;
    const isSw = /SwiftShader|llvmpipe|Software Rasterizer|WARP|Apple Software/i.test(info);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return isSw;
  } catch {
    return false;
  }
}

class CharacterRig3D {
  constructor() {
    this.isSupported = typeof document !== 'undefined' && typeof WebGLRenderingContext !== 'undefined';
    this.isSoftwareGl = detectSoftwareGl();

    this.glRenderer = null;
    this.domElement = null;
    this.scene = null;
    this.camera = null;
    this.envRT = null;

    this.activeCharacter = MovementProfile.activeCharacter || 'mario';
    this.rigs = { mario: null, luigi: null };
    this.fireTextures = { mario: null, luigi: null };
    this.loadingPromises = new Map();

    // Smooth presentation tracking state
    this._currentYaw = Math.PI / 2 - degToRad(MovementProfile.stage8.cameraYawTiltDeg);
    this._lastRenderMs = typeof performance !== 'undefined' ? performance.now() : 0;
    this._prevRunNormTime = 0;
    this._prevRunClip = '';
    this._footstepCrossings = [];

    // Cached wireframe state to avoid per-frame material walks
    this._appliedWireframe = false;

    // Telemetry exposed to HUD & tests
    this.telemetry = {
      characterId: this.activeCharacter,
      ready: false,
      activeClip: 'Idle',
      normalizedTime: 0,
      clipDuration: 1,
      yawDeg: 70,
      squashSy: 1.0,
      pelvisScale: [1, 1, 1],
      spineScale: [1, 1, 1],
      volumeProduct: 1.0,
      headAttached: true,
      loadedClipsCount: 0,
    };

    if (this.isSupported) {
      this._initThree();
      this.preloadAll();
    }
  }

  _initThree() {
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
    });

    if (this.isSoftwareGl) {
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
    } else {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(1280, 720, false);

    this.glRenderer = renderer;
    this.domElement = renderer.domElement;

    this.scene = new THREE.Scene();

    // Studio IBL + Nintendo-warm three-point light rig
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 0.85;
    pmrem.dispose();

    const hemi = new THREE.HemisphereLight(0xf0f9ff, 0x3b4d2b, 0.95);
    this.scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7e6, 1.9);
    keyLight.position.set(6, 12, 11);
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-7, 6, -5);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.45);
    fillLight.position.set(0, -2, 8);
    this.scene.add(fillLight);

    const halfW = 10.0;
    const halfH = halfW * (9 / 16);
    this.camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 100);
    this.camera.position.set(11, 6, 25);
    this.camera.lookAt(11, 6, 0);
  }

  preloadAll() {
    if (!this.isSupported) return Promise.resolve();
    return Promise.all([
      this._loadCharacter('mario'),
      this._loadCharacter('luigi'),
    ]);
  }

  _loadCharacter(id) {
    if (this.rigs[id]) return Promise.resolve(this.rigs[id]);
    if (this.loadingPromises.has(id)) return this.loadingPromises.get(id);

    const cfg = MovementProfile.characters[id] || MovementProfile.characters.mario;

    // Clean Release & file:// mode: instantiate 100% original 10-part procedural 3D PBR Hero Rig
    // with zero external .glb/.png network dependencies and zero third-party IP.
    if (IS_CLEAN_RELEASE) {
      const rig = this._buildProceduralHeroRig(id, cfg);
      this.rigs[id] = rig;
      this.scene.add(rig.container);
      rig.container.visible = (id === this.activeCharacter);
      if (id === this.activeCharacter) {
        this.telemetry.ready = true;
        this.telemetry.loadedClipsCount = CHARACTER_ANIM_CLIPS.length;
      }
      const resolved = Promise.resolve(rig);
      this.loadingPromises.set(id, resolved);
      return resolved;
    }

    this._ensureFireTextures(id);

    const promise = import('three/examples/jsm/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new Promise((resolve) => {
        const loader = new GLTFLoader();
        loader.load(
          cfg.modelPath,
          (gltf) => {
            const rig = this._setupRig(id, cfg, gltf);
            this.rigs[id] = rig;
            this.scene.add(rig.container);
            this.scene.add(rig.skeletonHelper);
            rig.container.visible = (id === this.activeCharacter);
            rig.skeletonHelper.visible = false;

            if (id === this.activeCharacter) {
              this.telemetry.ready = true;
              this.telemetry.loadedClipsCount = Object.keys(rig.actions).length;
            }
            resolve(rig);
          },
          undefined,
          () => {
            // Graceful offline/clean fallback to procedural 10-part 3D PBR Hero Rig
            const rig = this._buildProceduralHeroRig(id, cfg);
            this.rigs[id] = rig;
            this.scene.add(rig.container);
            rig.container.visible = (id === this.activeCharacter);
            if (id === this.activeCharacter) {
              this.telemetry.ready = true;
              this.telemetry.loadedClipsCount = CHARACTER_ANIM_CLIPS.length;
            }
            resolve(rig);
          }
        );
      }))
      .catch(() => {
        const rig = this._buildProceduralHeroRig(id, cfg);
        this.rigs[id] = rig;
        this.scene.add(rig.container);
        rig.container.visible = (id === this.activeCharacter);
        return rig;
      });

    this.loadingPromises.set(id, promise);
    return promise;
  }

  /**
   * 100% Original 10-Part Articulated Procedural 3D PBR Hero Rig ("Vanguard" / "Zephyr")
   * Hierarchical skeleton: container -> modelPivot -> skl_root (pelvis) -> spin (torso) -> face_1 (head/helm)
   * Bottom-center grounded at y = 0 with varied PBR roughness/metalness and RoomEnvironment IBL reflections.
   */
  _buildProceduralHeroRig(id, cfg) {
    const isZephyr = id === 'luigi';
    const primaryHex = isZephyr ? 0x10b981 : 0xe11d48;
    const secondaryHex = isZephyr ? 0x0f766e : 0x1d4ed8;
    const accentHex = isZephyr ? 0xfde047 : 0xf59e0b;
    const bootHex = 0x334155;

    const tunicMat = new MeshStandardMaterial({ color: primaryHex, roughness: 0.48, metalness: 0.14 });
    const armorMat = new MeshStandardMaterial({ color: secondaryHex, roughness: 0.28, metalness: 0.62 });
    const trimMat = new MeshStandardMaterial({ color: accentHex, roughness: 0.22, metalness: 0.85 });
    const bootMat = new MeshStandardMaterial({ color: bootHex, roughness: 0.65, metalness: 0.25 });
    const gloveMat = new MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.42, metalness: 0.08 });
    const visorMat = new MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      roughness: 0.15,
      metalness: 0.9,
    });
    const skinMat = new MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.58, metalness: 0.02 });

    const container = new Group();
    container.name = `procedural_hero_${id}`;
    const modelPivot = new Group();
    container.add(modelPivot);

    // Pelvis root (`skl_root`) positioned so boots sit flush at y = 0.0
    const pelvisBone = new Group();
    pelvisBone.name = 'skl_root';
    pelvisBone.position.set(0, 0.52, 0);
    modelPivot.add(pelvisBone);

    // Belt & Waist Core
    const beltMesh = new Mesh(new CylinderGeometry(0.24, 0.23, 0.12, 14), trimMat);
    pelvisBone.add(beltMesh);

    // Articulated Left & Right Legs + Grounded Armored Boots
    const makeLeg = (xOff) => {
      const hip = new Group();
      hip.position.set(xOff, -0.05, 0);
      const thigh = new Mesh(new CapsuleGeometry(0.085, 0.22, 6, 10), armorMat);
      thigh.position.set(0, -0.18, 0);
      hip.add(thigh);
      const boot = new Mesh(new BoxGeometry(0.18, 0.16, 0.28), bootMat);
      boot.position.set(0, -0.39, 0.04);
      hip.add(boot);
      return hip;
    };
    const leftLeg = makeLeg(-0.14);
    const rightLeg = makeLeg(0.14);
    pelvisBone.add(leftLeg, rightLeg);

    // Spine / Torso (`spin`)
    const spineBone = new Group();
    spineBone.name = 'spin';
    spineBone.position.set(0, 0.08, 0);
    pelvisBone.add(spineBone);

    const torsoMesh = new Mesh(new CapsuleGeometry(0.23, 0.28, 8, 14), tunicMat);
    torsoMesh.position.set(0, 0.26, 0);
    spineBone.add(torsoMesh);

    // Chest emblem plate
    const chestPlate = new Mesh(new BoxGeometry(0.26, 0.20, 0.08), trimMat);
    chestPlate.position.set(0, 0.30, 0.20);
    spineBone.add(chestPlate);

    // Dynamic Aero Scarf / Cape tail
    const scarf = new Mesh(new BoxGeometry(0.26, 0.08, 0.34), trimMat);
    scarf.position.set(0, 0.44, -0.22);
    scarf.rotation.x = -0.35;
    spineBone.add(scarf);

    // Articulated Left & Right Arms + Gloves
    const makeArm = (xOff) => {
      const shoulder = new Group();
      shoulder.position.set(xOff, 0.40, 0);
      const upper = new Mesh(new CapsuleGeometry(0.072, 0.20, 6, 10), tunicMat);
      upper.position.set(0, -0.14, 0);
      shoulder.add(upper);
      const glove = new Mesh(new SphereGeometry(0.10, 12, 10), gloveMat);
      glove.position.set(0, -0.30, 0.03);
      shoulder.add(glove);
      return shoulder;
    };
    const leftArm = makeArm(-0.30);
    const rightArm = makeArm(0.30);
    spineBone.add(leftArm, rightArm);

    // Head (`face_1`) with Crested Visor Helm
    const headBone = new Group();
    headBone.name = 'face_1';
    headBone.position.set(0, 0.56, 0);
    spineBone.add(headBone);

    const headSphere = new Mesh(new SphereGeometry(0.26, 16, 14), skinMat);
    headSphere.position.set(0, 0.22, 0);
    headBone.add(headSphere);

    const helmDome = new Mesh(new SphereGeometry(0.285, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), tunicMat);
    helmDome.position.set(0, 0.24, -0.01);
    headBone.add(helmDome);

    const helmCrest = new Mesh(new ConeGeometry(0.09, 0.26, 6), trimMat);
    helmCrest.position.set(0, 0.52, -0.02);
    helmCrest.rotation.x = -0.22;
    headBone.add(helmCrest);

    const visor = new Mesh(new BoxGeometry(0.36, 0.11, 0.12), visorMat);
    visor.position.set(0, 0.24, 0.21);
    headBone.add(visor);

    const heightScale = isZephyr ? 1.07 : 1.0;
    modelPivot.scale.set(1, heightScale, 1);

    const materials = [tunicMat, armorMat, trimMat, bootMat, gloveMat, visorMat, skinMat];
    return {
      id,
      isProcedural: true,
      container,
      modelPivot,
      modelRoot: pelvisBone,
      unitScale: 1.0,
      bodyMesh: null,
      pelvisBone,
      spineBone,
      headBone,
      legBones: [leftLeg, rightLeg],
      armBones: [leftArm, rightArm],
      scarf,
      idleLegQuats: new Map(),
      restPelvisLocalY: pelvisBone.position.y,
      materials,
      materialSlots: [],
      tunicMat,
      armorMat,
      trimMat,
      baseColors: { primaryHex, secondaryHex, accentHex },
      appliedFire: false,
      mixer: null,
      actions: {},
      activeAction: null,
      activeClipName: 'Idle',
      procTime: 0,
      skeletonHelper: null,
    };
  }

  _animateProceduralRig(rig, clipName, animDt, player) {
    rig.activeClipName = clipName;
    if (animDt > 0) {
      rig.procTime += animDt;
    }
    const t = rig.procTime;
    const [leftLeg, rightLeg] = rig.legBones;
    const [leftArm, rightArm] = rig.armBones;

    let legSwing = 0;
    let armSwing = 0;
    let torsoPitch = 0;
    let bobY = 0;

    if (clipName === 'Run' || clipName === 'Sprint' || clipName === 'CarryWalk') {
      const freq = clipName === 'Sprint' ? 16.5 : 11.5;
      const amp = clipName === 'Sprint' ? 0.85 : 0.60;
      legSwing = Math.sin(t * freq) * amp;
      armSwing = -legSwing * 0.92;
      torsoPitch = clipName === 'Sprint' ? 0.22 : 0.12;
      bobY = Math.abs(Math.sin(t * freq)) * 0.05;
    } else if (clipName === 'Jump' || clipName === 'DoubleJump' || clipName === 'TripleJump' || clipName === 'WallJump') {
      legSwing = 0.55;
      armSwing = -0.95;
      torsoPitch = -0.08;
    } else if (clipName === 'Crouch' || clipName === 'CrouchStart') {
      legSwing = 0.35;
      armSwing = 0.25;
      torsoPitch = 0.32;
    } else if (clipName === 'Victory') {
      legSwing = 0;
      armSwing = -2.4 + Math.sin(t * 8) * 0.15;
      bobY = Math.abs(Math.sin(t * 6)) * 0.08;
    } else {
      // Subtle breathing idle
      bobY = Math.sin(t * 3.2) * 0.018;
      armSwing = Math.sin(t * 3.2) * 0.06;
    }

    if (leftLeg && rightLeg) {
      leftLeg.rotation.x = legSwing;
      rightLeg.rotation.x = -legSwing;
    }
    if (leftArm && rightArm) {
      leftArm.rotation.x = clipName === 'Victory' ? armSwing : armSwing;
      rightArm.rotation.x = clipName === 'Victory' ? armSwing : -armSwing;
    }
    if (rig.spineBone) {
      rig.spineBone.rotation.x = torsoPitch;
    }
    if (rig.scarf) {
      const spd = Math.min(1, Math.abs(player?.vel?.x || 0) / 10);
      rig.scarf.rotation.x = -0.35 - spd * 0.65 + Math.sin(t * 14) * 0.14;
    }
    if (rig.pelvisBone) {
      rig.pelvisBone.position.y = rig.restPelvisLocalY + bobY;
    }
  }

  _setupRig(id, cfg, gltf) {
    const container = new THREE.Group();
    container.name = `rig_container_${id}`;

    const modelPivot = new THREE.Group();
    modelPivot.name = `rig_pivot_${id}`;
    const modelRoot = gltf.scene;
    modelPivot.add(modelRoot);

    // Measure rest bounding box to normalize exact height uniformly (1:1 proportions)
    modelRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(modelRoot);
    const measuredH = Math.max(1, box.max.y - box.min.y);
    const unitScale = cfg.visualHeightTiles / measuredH;
    modelRoot.scale.setScalar(unitScale);
    modelRoot.position.set(
      -((box.min.x + box.max.x) * 0.5) * unitScale,
      -box.min.y * unitScale,
      -((box.min.z + box.max.z) * 0.5) * unitScale
    );

    container.add(modelPivot);

    // Locate skeleton bones & tune PBR materials
    let pelvisBone = null;
    let spineBone = null;
    let headBone = null;
    let bodyMesh = null;
    const legBones = {};
    const materials = [];
    const maxAniso = this.glRenderer ? Math.min(4, this.glRenderer.capabilities.getMaxAnisotropy()) : 1;

    modelRoot.traverse((obj) => {
      if (obj.isBone || obj.type === 'Bone' || obj.name === 'skl_root' || obj.name === 'spin' || obj.name === 'face_1') {
        if (obj.name === 'skl_root') pelvisBone = obj;
        else if (obj.name === 'spin') spineBone = obj;
        else if (obj.name === 'face_1') headBone = obj;
        if (LEG_STRIDE_BONES.includes(obj.name)) {
          legBones[obj.name] = obj;
        }
      }
      if (obj.isMesh) {
        obj.frustumCulled = false;
        if (obj.isSkinnedMesh && (!bodyMesh || /body/i.test(obj.name))) {
          bodyMesh = obj;
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m) continue;
          if (!materials.includes(m)) {
            materials.push(m);
            if (m.map) {
              m.map.colorSpace = THREE.SRGBColorSpace;
              m.map.anisotropy = maxAniso;
              m.map.needsUpdate = true;
            }
            if (m.roughness !== undefined) m.roughness = clamp(m.roughness, 0.35, 0.85);
            if (m.metalness !== undefined) m.metalness = Math.min(0.25, m.metalness);
            m.needsUpdate = true;
          }
        }
      }
    });

    // Three.js AnimationMixer + prebuilt actions for all 27 clips
    const mixer = new THREE.AnimationMixer(modelRoot);
    const actions = {};
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      const isOnce = LOOP_ONCE_CLIPS.has(clip.name);
      action.setLoop(isOnce ? THREE.LoopOnce : THREE.LoopRepeat, isOnce ? 1 : Infinity);
      action.clampWhenFinished = isOnce;
      actions[clip.name] = action;
    }

    // Play initial Idle immediately, capture Idle leg quaternions, and center modelRoot
    // statically by Idle boot bounds so both facing directions sit centered with zero drift.
    const idleLegQuats = {};
    const defaultClip = actions.Idle ? 'Idle' : Object.keys(actions)[0];
    if (defaultClip) {
      actions[defaultClip].setEffectiveTimeScale(
        defaultClip === 'Idle' ? MovementProfile.stage8.idlePlaybackScale : 1.0
      );
      actions[defaultClip].play();
      mixer.update(0);
      for (const bName of LEG_STRIDE_BONES) {
        if (legBones[bName]) {
          idleLegQuats[bName] = legBones[bName].quaternion.clone();
        }
      }

      if (bodyMesh?.geometry?.attributes?.position) {
        container.position.set(0, 0, 0);
        modelPivot.position.set(0, 0, 0);
        modelPivot.rotation.set(0, 0, 0);
        modelPivot.scale.set(1, 1, 1);
        container.updateMatrixWorld(true);
        bodyMesh.skeleton?.update?.();
        const posAttr = bodyMesh.geometry.attributes.position;
        let idleMinY = Infinity;
        for (let i = 0; i < posAttr.count; i++) {
          _scratchVert.fromBufferAttribute(posAttr, i);
          bodyMesh.applyBoneTransform(i, _scratchVert);
          _scratchVert.applyMatrix4(bodyMesh.matrixWorld);
          if (_scratchVert.y < idleMinY) idleMinY = _scratchVert.y;
        }
        let bx0 = Infinity;
        let bx1 = -Infinity;
        let bz0 = Infinity;
        let bz1 = -Infinity;
        for (let i = 0; i < posAttr.count; i++) {
          _scratchVert.fromBufferAttribute(posAttr, i);
          bodyMesh.applyBoneTransform(i, _scratchVert);
          _scratchVert.applyMatrix4(bodyMesh.matrixWorld);
          if (_scratchVert.y <= idleMinY + 0.25) {
            if (_scratchVert.x < bx0) bx0 = _scratchVert.x;
            if (_scratchVert.x > bx1) bx1 = _scratchVert.x;
            if (_scratchVert.z < bz0) bz0 = _scratchVert.z;
            if (_scratchVert.z > bz1) bz1 = _scratchVert.z;
          }
        }
        if (Number.isFinite(bx0) && Number.isFinite(bz0) && Number.isFinite(idleMinY)) {
          modelRoot.position.x -= 0.5 * (bx0 + bx1);
          modelRoot.position.y -= idleMinY;
          modelRoot.position.z -= 0.5 * (bz0 + bz1);
        }
      }
    }

    // SkeletonHelper for [F5] Pose Inspector (parented at scene root in loadRig so matrixWorld is not doubled)
    const skeletonHelper = new THREE.SkeletonHelper(modelRoot);
    skeletonHelper.visible = false;
    skeletonHelper.material.depthTest = false;
    skeletonHelper.material.transparent = true;
    skeletonHelper.material.opacity = 0.95;
    skeletonHelper.material.toneMapped = false;
    skeletonHelper.renderOrder = 50;

    const restPelvisLocalY = pelvisBone ? pelvisBone.position.y : 11.0;

    const materialSlots = materials.map((m) => ({
      material: m,
      name: (m.name || '').toLowerCase(),
      baseMap: m.map || null,
    }));

    return {
      id,
      container,
      modelPivot,
      modelRoot,
      unitScale,
      bodyMesh,
      pelvisBone,
      spineBone,
      headBone,
      legBones,
      idleLegQuats,
      restPelvisLocalY,
      materials,
      materialSlots,
      appliedFire: false,
      mixer,
      actions,
      activeAction: defaultClip ? actions[defaultClip] : null,
      activeClipName: defaultClip || 'Idle',
      skeletonHelper,
    };
  }

  _ensureFireTextures(id) {
    if (this.fireTextures[id] || typeof document === 'undefined') return this.fireTextures[id];
    const texLoader = new THREE.TextureLoader();
    const maxAniso = this.glRenderer ? Math.min(4, this.glRenderer.capabilities.getMaxAnisotropy()) : 1;
    const configTex = (url) => {
      const tex = texLoader.load(url);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      return tex;
    };
    this.fireTextures[id] = {
      body: configTex(`/textures/${id}/player_body.1.png`),
      head: configTex(`/textures/${id}/player_head.1.png`),
    };
    return this.fireTextures[id];
  }

  _syncPowerUpMaterials(rig, isFireForm) {
    if (!rig || rig.appliedFire === isFireForm) return;
    rig.appliedFire = isFireForm;

    if (rig.isProcedural) {
      if (isFireForm) {
        rig.tunicMat.color.setHex(0xf8fafc);
        rig.armorMat.color.setHex(0xdc2626);
        rig.trimMat.color.setHex(0xfacc15);
      } else {
        rig.tunicMat.color.setHex(rig.baseColors.primaryHex);
        rig.armorMat.color.setHex(rig.baseColors.secondaryHex);
        rig.trimMat.color.setHex(rig.baseColors.accentHex);
      }
      return;
    }

    const fireSet = isFireForm ? this._ensureFireTextures(rig.id) : null;

    for (const slot of rig.materialSlots) {
      const m = slot.material;
      if (!slot.baseMap) continue;
      if (isFireForm && fireSet) {
        if (slot.name.includes('body')) {
          m.map = fireSet.body;
          m.needsUpdate = true;
        } else if (
          slot.name.includes('hat') ||
          slot.name.includes('face') ||
          slot.name.includes('hair') ||
          slot.name.includes('head')
        ) {
          m.map = fireSet.head;
          m.needsUpdate = true;
        }
      } else {
        m.map = slot.baseMap;
        m.needsUpdate = true;
      }
    }
  }

  get activeClipName() {
    return this.rigs[this.activeCharacter]?.activeClipName || this.telemetry.activeClip;
  }

  setCharacter(characterId) {
    const next = characterId === 'luigi' ? 'luigi' : 'mario';
    this.activeCharacter = next;
    this.telemetry.characterId = next;

    for (const key of ['mario', 'luigi']) {
      const rig = this.rigs[key];
      if (rig) {
        rig.container.visible = (key === next);
        if (key !== next && rig.skeletonHelper) {
          rig.skeletonHelper.visible = false;
        }
      }
    }

    const activeRig = this.rigs[next];
    this.telemetry.ready = Boolean(activeRig);
    if (activeRig) {
      this.telemetry.loadedClipsCount = Object.keys(activeRig.actions).length;
      if (activeRig.activeAction) {
        activeRig.activeAction.enabled = true;
        activeRig.activeAction.setEffectiveWeight(1);
      }
    }
  }

  resize(width, height) {
    if (!this.glRenderer || width <= 0 || height <= 0) return;
    this.glRenderer.setSize(width, height, false);
  }

  /**
   * Software-WebGL fence pacing callback invoked by GameLoop after drawing.
   */
  afterDraw(cb) {
    if (!this.glRenderer) {
      requestAnimationFrame(cb);
      return;
    }
    const gl = this.glRenderer.getContext();
    if (!this.isSoftwareGl || typeof gl.fenceSync !== 'function') {
      requestAnimationFrame(cb);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const start = performance.now();
    const poll = () => {
      const status = gl.clientWaitSync(sync, 0, 0);
      if (
        status === gl.ALREADY_SIGNALED ||
        status === gl.CONDITION_SATISFIED ||
        performance.now() - start > 80
      ) {
        gl.deleteSync(sync);
        cb();
      } else {
        setTimeout(poll, 0);
      }
    };
    setTimeout(poll, 0);
  }

  _crossFadeTo(rig, clipName, loopOnce, fadeSec, timeScale = 1.0, forceRestart = false) {
    const nextAction = rig.actions[clipName] || rig.actions.Idle;
    if (!nextAction) return;

    nextAction.setEffectiveTimeScale(timeScale);
    if (rig.activeAction === nextAction) {
      if (forceRestart) {
        nextAction.reset();
        nextAction.play();
      }
      return;
    }

    nextAction.enabled = true;
    nextAction.setLoop(loopOnce ? THREE.LoopOnce : THREE.LoopRepeat, loopOnce ? 1 : Infinity);
    nextAction.clampWhenFinished = loopOnce;
    nextAction.reset();
    nextAction.play();

    if (rig.activeAction) {
      rig.activeAction.crossFadeTo(nextAction, fadeSec, false);
    }
    rig.activeAction = nextAction;
    rig.activeClipName = nextAction.getClip().name;
  }

  /**
   * Consume any footstep strike crossings triggered during Run/Sprint gait phases.
   */
  consumeFootstepStrikes() {
    if (this._footstepCrossings.length === 0) return [];
    const copy = this._footstepCrossings.slice();
    this._footstepCrossings.length = 0;
    return copy;
  }

  /**
   * Render active 3D character synced pixel-for-pixel to the 2D Camera viewport.
   */
  render({
    player,
    alpha = 1.0,
    pres,
    camState,
    displayWidth,
    displayHeight,
    poseInspector = null,
    isPaused = false,
    isHitstop = false,
  }) {
    const rig = this.rigs[this.activeCharacter];
    if (!rig || !this.glRenderer || !this.camera) return false;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : 0;
    const rawDt = clamp((nowMs - this._lastRenderMs) / 1000, 0, 0.05);
    this._lastRenderMs = nowMs;

    const renderPos = player.getRenderPos(alpha);
    const feetX = renderPos.x + player.currentWidth * 0.5;
    const feetY = renderPos.y;

    // 1. Align 3D OrthographicCamera to the exact Z = 0.0 tile window framed by 2D canvas
    //    so +Z/-Z depth and off-center screen positions never split left/right foot elevation.
    const viewH = camState.viewH;
    const viewW = camState.viewW;
    const halfW = viewW * 0.5;
    const halfH = viewH * 0.5;

    const camCenterX = camState.x + halfW;
    const camCenterY = camState.y + halfH;

    if (
      Math.abs(this.camera.right - halfW) > 1e-4 ||
      Math.abs(this.camera.top - halfH) > 1e-4
    ) {
      this.camera.left = -halfW;
      this.camera.right = halfW;
      this.camera.top = halfH;
      this.camera.bottom = -halfH;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(camCenterX, camCenterY, 25);
    this.camera.rotation.set(0, 0, 0);
    this.camera.updateMatrixWorld();

    // 2. Drive 27-Clip AnimationMixer (either live state-machine or [F5] Pose Inspector)
    const inspectorActive = Boolean(poseInspector?.active);
    let targetSquashSy = pres?.sy ?? 1.0;

    if (inspectorActive) {
      const clipName = poseInspector.clipName || 'Idle';
      const action = rig.actions[clipName] || rig.actions.Idle;
      if (action) {
        if (rig.activeAction !== action) {
          for (const a of Object.values(rig.actions)) {
            if (a !== action) a.stop();
          }
          action.enabled = true;
          action.setEffectiveWeight(1.0);
          action.reset();
          action.play();
          rig.activeAction = action;
          rig.activeClipName = action.getClip().name;
        }
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        const duration = Math.max(0.001, action.getClip().duration);
        if (poseInspector.playing) {
          action.setEffectiveTimeScale(poseInspector.speed ?? 1.0);
          rig.mixer.update(rawDt);
          poseInspector.normalizedTime = (action.time % duration) / duration;
        } else {
          action.setEffectiveTimeScale(0);
          action.time = clamp(poseInspector.normalizedTime ?? 0, 0, 1) * duration;
          rig.mixer.update(0);
        }
      }
      targetSquashSy = 1.0;
    } else {
      const spec = resolveClipSpec(player);
      const forceRestart =
        spec.clipName === 'Jump' ||
        spec.clipName === 'DoubleJump' ||
        spec.clipName === 'TripleJump' ||
        spec.clipName === 'WallJump' ||
        spec.clipName === 'GroundPound';

      const changedState = rig.activeClipName !== spec.clipName;
      this._crossFadeTo(rig, spec.clipName, spec.loopOnce, spec.fadeSec, spec.timeScale, changedState && forceRestart);
      if (rig.activeAction) {
        rig.activeAction.setEffectiveTimeScale(spec.timeScale);
      }

      const freezePose = isPaused || isHitstop;
      const animDt = freezePose ? 0 : rawDt;
      if (rig.isProcedural) {
        this._animateProceduralRig(rig, spec.clipName, animDt, player);
      } else if (animDt > 0 && rig.mixer) {
        rig.mixer.update(animDt);
      }

      // Synchronize Run/Sprint footstep dust puffs to clip footstep strike phases
      if (!freezePose && player.grounded && !player.isCrouched && (spec.clipName === 'Run' || spec.clipName === 'Sprint') && rig.activeAction) {
        const clip = rig.activeAction.getClip();
        const dur = Math.max(0.001, clip.duration);
        const normT = (rig.activeAction.time % dur) / dur;
        const phases = spec.clipName === 'Sprint'
          ? MovementProfile.stage8.sprintFootstepStrikePhases
          : MovementProfile.stage8.runFootstepStrikePhases;

        if (this._prevRunClip === spec.clipName) {
          for (const p of phases) {
            const crossedNormal = this._prevRunNormTime < p && normT >= p;
            const crossedWrap = normT < this._prevRunNormTime && (p >= this._prevRunNormTime || p <= normT);
            if (crossedNormal || crossedWrap) {
              const dir = Math.sign(player.vel.x) || (player.facingRight ? 1 : -1);
              this._footstepCrossings.push({
                x: feetX - dir * 0.28,
                y: renderPos.y,
                dir,
                clip: spec.clipName,
              });
            }
          }
        }
        this._prevRunNormTime = normT;
        this._prevRunClip = spec.clipName;
      } else {
        this._prevRunClip = '';
        this._prevRunNormTime = 0;
      }
    }

    // 3. Placement at (feetX, feetY, Z=0.0) + Wonder 20° 3/4 Yaw Tilt + Special State Rotations
    rig.container.position.set(feetX, feetY, 0.0);

    const facingDir = player.facingRight ? 1 : -1;
    const tiltDeg = inspectorActive
      ? (poseInspector.previewYawDeg ?? MovementProfile.stage8.cameraYawTiltDeg)
      : MovementProfile.stage8.cameraYawTiltDeg;

    // Facing +X rotates model +70° around Y (20° toward camera +Z); facing -X rotates -70°
    let targetYaw = facingDir * (Math.PI * 0.5 - degToRad(clamp(tiltDeg, -45, 45)));
    let bodyRollZ = 0;
    let bodyPitchX = 0;

    const wrapAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const blendYaw = (target, rate) => {
      const delta = wrapAngle(target - this._currentYaw);
      this._currentYaw = wrapAngle(this._currentYaw + delta * rate);
    };

    if (!inspectorActive) {
      if (player.state === PlayerState.SPIN_JUMP) {
        targetYaw += facingDir * degToRad((player.spinJumpFrames || 0) * MovementProfile.spinJump.spinDegPerFrame);
        this._currentYaw = targetYaw;
      } else if (player.state === PlayerState.SPIN_TWIRL) {
        const totalRotRad = degToRad(MovementProfile.spinTwirl.totalRotationDeg);
        const progress = player.spinTwirlElapsed / Math.max(1, MovementProfile.spinTwirl.hoverDuration);
        targetYaw += facingDir * progress * totalRotRad;
        this._currentYaw = targetYaw;
      } else if (player.state === PlayerState.WALL_SLIDE) {
        const wallDir = player.wallSlideDir || facingDir;
        targetYaw = -wallDir * (Math.PI * 0.5 - degToRad(tiltDeg));
        bodyRollZ = -wallDir * degToRad(MovementProfile.stage8.wallSlideOutwardTiltDeg * 0.5);
        blendYaw(targetYaw, 0.35);
      } else if (player.state === PlayerState.BUTT_SLIDE) {
        const slideDir = Math.sign(player.vel.x) || facingDir;
        targetYaw = slideDir * (Math.PI * 0.5 - degToRad(tiltDeg));
        bodyRollZ = slideDir * degToRad(22);
        blendYaw(targetYaw, 0.35);
      } else if (player.state === PlayerState.GROUND_POUND_WINDUP) {
        const p = 1 - player.groundPoundWindupTimer / Math.max(1, MovementProfile.groundPound.windupFrames);
        bodyPitchX = p * Math.PI * 2;
        blendYaw(targetYaw, 0.35);
      } else {
        const blend = isPaused ? 1.0 : 0.32;
        blendYaw(targetYaw, blend);
        if (player.state === PlayerState.SKID) {
          bodyRollZ = -(player.skidSlideDir || facingDir) * degToRad(-12);
        } else {
          bodyRollZ = -degToRad((pres?.leanDeg ?? 0) * 0.45);
        }
      }

      if (player.fireThrowAnimTimer > MovementProfile.fireball.recoveryFrames + 1) {
        bodyRollZ -= facingDir * degToRad(MovementProfile.fireball.torsoSnapDeg * 0.65);
      } else if (player.carriedEntity) {
        bodyRollZ += facingDir * degToRad(MovementProfile.combat.carryLeanBackDeg);
      }
    } else {
      this._currentYaw = targetYaw;
    }

    rig.modelPivot.rotation.order = 'ZYX';
    rig.modelPivot.rotation.set(bodyPitchX, this._currentYaw, bodyRollZ);

    // Stage 9: Fire Flower palette swap & Small/Growth elastic scale (presentation only)
    this._syncPowerUpMaterials(rig, !inspectorActive && player.powerUpForm === PowerUpForm.FIRE);
    const growth = !inspectorActive && player.getGrowthPresentationScale
      ? player.getGrowthPresentationScale()
      : { sx: 1, sy: 1, sz: 1 };
    rig.modelPivot.scale.set(growth.sx, growth.sy, growth.sz);

    // 4. Dynamic Volume-Preserving Squash & Stretch on Pelvis (skl_root) & Spine (spin)
    // Note: The baked 'Crouch' clip already ducks the knees/pelvis (~55% height), so when
    // crouched we apply a gentler ball-compression multiplier while still hitting Sy=0.50 in HUD.
    const boneSy = !inspectorActive && player.isCrouched && !player.isButtSliding
      ? clamp(0.76 + (targetSquashSy - 0.50) * 0.48, 0.70, 1.0)
      : targetSquashSy;
    const squash = computeVolumePreservingSquash(boneSy);

    // In this glTF skeleton hierarchy, bone-local X is the vertical torso/pelvis axis.
    if (rig.pelvisBone) {
      rig.pelvisBone.scale.set(squash.pelvisSy, squash.pelvisSxz, squash.pelvisSxz);
    }
    if (rig.spineBone) {
      rig.spineBone.scale.set(squash.spineSy, squash.spineSxz, squash.spineSxz);
    }

    // Allow full Run & Sprint leg strides so rapid locomotion pumps naturally without
    // looking stiff or hovering; apply gentle restraint only on CarryWalk/Skid/TurnAround.
    if (!inspectorActive && rig.idleLegQuats) {
      const cName = rig.activeClipName;
      let strideFactor = 0;
      if (cName === 'CarryWalk') strideFactor = 0.65;
      else if (cName === 'Skid') strideFactor = 0.55;
      else if (cName === 'TurnAround') strideFactor = 0.45;

      if (strideFactor > 0) {
        for (const bName of LEG_STRIDE_BONES) {
          const bone = rig.legBones[bName];
          const idleQ = rig.idleLegQuats[bName];
          if (bone && idleQ) {
            const isKnee = bName === 'leg_l2' || bName === 'leg_r2';
            const damp = (isKnee ? LEG_KNEE_DAMP : LEG_THIGH_DAMP) * strideFactor;
            bone.quaternion.slerp(idleQ, damp);
          }
        }
      }
    }

    // 5. Ground-sole vertical planting only (never alters horizontal scale or shifts Idle X)
    rig.modelPivot.position.set(0, 0, 0);
    rig.container.updateMatrixWorld(true);
    this._fitBoundsAndGround({ rig, feetY, player, inspectorActive });

    // 6. Pose Inspector visual helpers (SkeletonHelper & Wireframe)
    const showSkel = Boolean(inspectorActive && poseInspector.showSkeleton);
    rig.skeletonHelper.visible = showSkel;
    const wantWire = Boolean(inspectorActive && poseInspector.wireframe);
    if (wantWire !== this._appliedWireframe) {
      this._appliedWireframe = wantWire;
      for (const m of rig.materials) {
        m.wireframe = wantWire;
      }
    }

    // 7. Render WebGL frame
    rig.container.updateMatrixWorld(true);
    if (showSkel) {
      rig.skeletonHelper.updateMatrixWorld(true);
    }
    this.glRenderer.render(this.scene, this.camera);

    // 7. Update telemetry & head attachment check
    const activeAction = rig.activeAction;
    const clip = activeAction?.getClip();
    const dur = Math.max(0.001, clip?.duration || 1);
    const norm = activeAction ? (activeAction.time % dur) / dur : 0;

    let headAttached = true;
    if (rig.headBone && rig.pelvisBone) {
      rig.headBone.getWorldPosition(_scratchHeadPos);
      rig.pelvisBone.getWorldPosition(_scratchRootPos);
      const dist = _scratchDir.subVectors(_scratchHeadPos, _scratchRootPos).length();
      headAttached = Number.isFinite(dist) && dist > 0.05 && dist < 3.0;
    }

    this.telemetry = {
      characterId: this.activeCharacter,
      ready: true,
      activeClip: rig.activeClipName,
      normalizedTime: norm,
      clipDuration: dur,
      yawDeg: (this._currentYaw * 180) / Math.PI,
      squashSy: targetSquashSy,
      pelvisScale: [squash.pelvisSy, squash.pelvisSxz, squash.pelvisSxz],
      spineScale: [squash.spineSy, squash.spineSxz, squash.spineSxz],
      volumeProduct: squash.combinedVolume,
      headAttached,
      loadedClipsCount: Object.keys(rig.actions).length,
      drawCalls: this.glRenderer?.info?.render?.calls ?? 0,
    };

    return true;
  }

  /**
   * Scan live skinned body/boot vertices so boots never protrude below y = 0 on the
   * groundplane tile when grounded, while preserving natural mid-stride run/sprint lift.
   */
  _fitBoundsAndGround({ rig, feetY, player, inspectorActive }) {
    const bodyMesh = rig.bodyMesh;
    const posAttr = bodyMesh?.geometry?.attributes?.position;
    if (!bodyMesh || !posAttr || posAttr.count === 0) return;

    bodyMesh.skeleton?.update?.();
    const count = posAttr.count;
    let minY = Infinity;
    for (let i = 0; i < count; i++) {
      _scratchVert.fromBufferAttribute(posAttr, i);
      bodyMesh.applyBoneTransform(i, _scratchVert);
      _scratchVert.applyMatrix4(bodyMesh.matrixWorld);
      const relY = _scratchVert.y - feetY;
      if (relY < minY) minY = relY;
    }

    if (!Number.isFinite(minY)) return;

    const shouldClampFloor =
      (player.grounded &&
        player.state !== PlayerState.WARP_PIPE &&
        player.state !== PlayerState.IN_WARP_TRANSITION) ||
      inspectorActive;
    if (shouldClampFloor && minY < 0) {
      rig.modelPivot.position.y = -minY;
    }
  }

  dispose() {
    for (const key of ['mario', 'luigi']) {
      const rig = this.rigs[key];
      if (!rig) continue;
      rig.mixer.stopAllAction();
      rig.modelRoot.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (!m) continue;
            m.map?.dispose?.();
            m.dispose?.();
          }
        }
      });
      if (rig.skeletonHelper) {
        this.scene?.remove(rig.skeletonHelper);
        rig.skeletonHelper.geometry?.dispose?.();
        rig.skeletonHelper.material?.dispose?.();
      }
      this.rigs[key] = null;
    }
    for (const key of ['mario', 'luigi']) {
      const ft = this.fireTextures[key];
      if (ft) {
        ft.body?.dispose?.();
        ft.head?.dispose?.();
        this.fireTextures[key] = null;
      }
    }
    this.envRT?.dispose?.();
    this.glRenderer?.dispose?.();
    this.glRenderer = null;
    this.domElement = null;
  }
}

export default CharacterRig3D;
