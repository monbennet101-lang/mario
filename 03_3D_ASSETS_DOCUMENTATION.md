# 🎮 Mario & Luigi 3D Web Assets (Three.js & WebGL Ready)

Complete, lightweight, and fully rigged 3D models with **27 gameplay animation mechanics** for **Mario** and **Luigi**, extracted directly from Nintendo's archives and prepared specifically for **Three.js** and web game engines.

---

## 🧩 Modular Mesh Architecture & Socket Alignment Fix

### The Root Cause of Disjointed Meshes
In Nintendo's proprietary BFRES format (*New Super Mario Bros. U / Luigi U*):
1. **Separate Modular Sub-Models:** Mario and Luigi are authored across three distinct modular assets:
   - Body: `LB_model` / `MB_model`
   - Head (includes Face, Eyes, Hair, and the Worn Cap): `LH_model` / `MH_model`
   - Loose/Handheld Cap Accessory: `LC_model` / `MC_model` (used only when holding or losing the cap via bone `CapPosition` on `wrist_r1`).
2. **Local Socket Coordinate Space:** The head model is not authored at the character's world origin; it was created inside the **local rest coordinate frame** of the neck/head bone `face_1`, where the bone's local Y-axis is inverted (`row 1 = [0, -1, 0, 21.4448]`).
3. **The Inverse Bind Matrix Conflict:** When the head mesh was simply reassigned to the main armature modifier without pre-transforming its rest vertices, glTF's inverse bind matrix multiplication (`V_deformed = Bone_Pose @ Bone_Inverse_Bind @ V_local`) dropped the head upside-down onto the floor at `(0, 0, 0)` while the body animated independently.

### The Mathematical Solution Implemented
1. **Socket Rest Matrix Transformation:**
   For each character, the head vertices are transformed from the socket's local space into the main armature's world rest space by multiplying every vertex position $V$ by the neck bone's local matrix $M_{\text{face}}$:
   $$V_{\text{world}} = M_{\text{face}} \cdot V_{\text{local}}$$
   Where $M_{\text{face}}$ in `LB_model.fbx` is:
   $$\begin{bmatrix} 0 & 0 & 1 & 0.0000 \\ 0 & -1 & 0 & 21.4448 \\ 1 & 0 & 0 & -0.8436 \\ 0 & 0 & 0 & 1.0000 \end{bmatrix}$$
   This places Luigi's face, eyes, hair, and cap perfectly atop the body's neck collar ($Y = [20.92, 36.27]$), matching the body ($Y = [0, 23.80]$) with exact bilateral symmetry across $X$.
2. **Unified Skinning to `face_1`:**
   All head sub-meshes (`mat_player_face`, `mat_player_eye`, `mat_player_hat`, `mat_player_hair`) have their vertex groups mapped to `face_1` with full weight 1.0. During any animation (jumping, running, somersaults), the head and cap articulate seamlessly with the neck bone in 100% lockstep.
3. **Elimination of Duplicate Accessory Mesh:**
   The loose `LC_model` / `MC_model` (handheld cap) was omitted from the default playable character rig because the standard cap is already integrated into the head model with material `mat_player_hat` and textured with `player_head.0.png`.

---

## ❓ Frequently Asked Question: Are SMD Files Supported by Three.js?

> **No, Valve SMD (`.smd`) is NOT a native format for Three.js.**
>
> - **Origin:** The SMD (Studiomdl Data) format was created by Valve in 1998 for Half-Life and the Source engine pipeline. Three.js does **not** include an `SMDLoader`.
> - **Our Extraction Role:** We used `.smd` solely as an **intermediate bridge format** between `SwitchToolbox` (which bakes Nintendo's proprietary BFRES `FSKA` curve math into raw skeletal matrices) and `Blender`.
> - **The Three.js Standard Format:** Three.js natively and universally consumes **glTF 2.0 Binary (`.glb`)**.
> - **How It Works in WebGL:** In `models/luigi.glb` and `models/mario.glb`, all 27 animations are baked directly into binary buffer views as standard `AnimationClip` tracks (`gltf.animations`). The game engine loads them natively with `new GLTFLoader()`, requiring no third-party plugins.

---

## 📁 Directory Structure

```text
web_assets/
├── models/
│   ├── luigi.glb             # Complete Luigi model + 27 animations + embedded PBR textures (~660 KB)
│   └── mario.glb             # Complete Mario model + 27 animations + embedded PBR textures (~666 KB)
├── textures/
│   ├── luigi/                # 29 loose PNG textures (eyes, palettes, body, head/cap)
│   └── mario/                # 29 loose PNG textures (eyes, palettes, body, head/cap)
├── animations/
│   ├── luigi/                # 30 source SMD animation files (for reference or DCC editing)
│   └── mario/                # 30 source SMD animation files (for reference or DCC editing)
├── test_viewer.html          # Interactive WebGL viewer featuring all 27 animation clips
└── README.md                 # Complete developer documentation & state machine integration guide
```

---

## 🏃 Comprehensive Moveset Library (27 Animation Tracks)

Both `luigi.glb` and `mario.glb` share the exact same track names, frame rates, and skeletal bone targets. A single player controller state machine can drive both characters interchangeably.

### 1. Locomotion & Momentum
| Clip Name | Source Clip | Frames | FPS | Looping | Mechanics / Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Idle`** | `LB_wait` / `wait` | 160 | 60 | Yes | Natural idle breathing and weight shifting |
| **`Walk`** | `LB_walk` / `walk` | 60 | 60 | Yes | Standard pacing stride |
| **`Run`** | `LB_run` / `run` | 60 | 60 | Yes | Normal jogging stride |
| **`Sprint`** | `b_dash` | 60 | 60 | Yes | High-velocity sprint (B-Dash mode) |
| **`Skid`** | `slip` | 17 | 60 | No | Hard stop / brake slip when reversing direction |
| **`TurnAround`** | `turn` | 15 | 60 | No | Sharp 180-degree pivot turn |

### 2. Jumping & Aerial Acrobatics
| Clip Name | Source Clip | Frames | FPS | Looping | Mechanics / Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Jump`** | `jump` | 11 | 60 | Hold | Jump 1: Standard upward leap and aerial rise pose |
| **`DoubleJump`** | `2jump1` | 11 | 60 | Hold | Jump 2: Secondary jump impulse and kick |
| **`TripleJump`** | `2jumped` | 33 | 60 | No | Jump 3: Full 360° forward somersault flip |
| **`FlutterJump`** | `LB_jump_stoop` | 20 | 60 | Yes | Luigi's iconic **"Running on Air"** scuttle flutter jump |
| **`SpinJump`** | `spin_jump` | 12 | 60 | No | 360° vertical rotational spin jump |
| **`SpinAir`** | `spin_jump2` | 12 | 60 | Yes | Continuous mid-air spinning rotation loop |
| **`WallSlide`** | `wall_wait` | 30 | 60 | Yes | Sliding downward against a vertical wall |
| **`WallJump`** | `w_jump1` | 15 | 60 | No | Outward kick and leap off a wall |

### 3. Combat, Attacks & Ground Pound
| Clip Name | Source Clip | Frames | FPS | Looping | Mechanics / Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`Fireball`** | `fire_at` | 25 | 60 | No | Ground attack: Throwing a bouncing fireball |
| **`FireballAir`** | `firejmp` | 20 | 60 | No | Aerial attack: Mid-air fireball throw |
| **`GroundPound`** | `hipat` | 30 | 60 | Hold | Ground pound: Mid-air flip and straight-down dive |
| **`GroundPoundLand`** | `hiped` | 20 | 60 | No | Ground pound impact: Slamming into ground / crushing blocks |

### 4. Mechanics, Interactions & Reactions
| Clip Name | Source Clip | Frames | FPS | Looping | Mechanics / Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`CrouchStart`** | `stoop_start` | 6 | 60 | No | Crouch initiation: Transition from stand to squat |
| **`Crouch`** | `stoop` | 10 | 60 | Yes | Crouch idle: Holding ducked position under obstacles |
| **`CarryWalk`** | `carry_walk` | 60 | 60 | Yes | Walking while holding a Koopa shell or power-up |
| **`Throw`** | `carry_throw` | 30 | 60 | No | Hurling a held object, shell, or enemy |
| **`Climb`** | `tree_climb` | 30 | 60 | Yes | Climbing vertical poles, trees, or vines |
| **`Swim`** | `swim` | 30 | 60 | Yes | Underwater swimming breaststroke |
| **`Damage`** | `damF` | 24 | 60 | No | Knockback flinch from enemy damage |
| **`Defeat`** | `dead` | 147 | 60 | No | Complete defeat / death fall backwards offscreen |
| **`Victory`** | `goal_glad` | 50 | 60 | Yes | Flagpole level clear victory cheer |

---

## 🚀 Three.js State Machine Integration (Copy & Paste)

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Setup Scene, Camera, Renderer
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 16, 40);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(10, 20, 15);
scene.add(sun);

// Character Controller State Machine
class CharacterController {
  constructor() {
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
  }

  load(modelPath) {
    const loader = new GLTFLoader();
    loader.load(modelPath, (gltf) => {
      this.model = gltf.scene;
      scene.add(this.model);

      this.mixer = new THREE.AnimationMixer(this.model);

      // Register all 27 embedded animation tracks
      gltf.animations.forEach((clip) => {
        const action = this.mixer.clipAction(clip);
        
        // Configure specific playback loops
        if (['Jump', 'DoubleJump', 'TripleJump', 'Skid', 'TurnAround', 'Fireball', 'FireballAir', 'GroundPoundLand', 'Throw', 'Damage', 'Defeat'].includes(clip.name)) {
          action.setLoop(THREE.LoopOnce);
          action.clampWhenFinished = true;
        }

        this.actions[clip.name] = action;
      });

      // Default state
      this.play('Idle');
    });
  }

  play(name, fadeDuration = 0.15) {
    const nextAction = this.actions[name];
    if (!nextAction || nextAction === this.currentAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(fadeDuration);
    }

    nextAction.reset().fadeIn(fadeDuration).play();
    this.currentAction = nextAction;
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }
}

const player = new CharacterController();
player.load('models/luigi.glb'); // Or 'models/mario.glb'

// Game Loop
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  player.update(clock.getDelta());
  renderer.render(scene, camera);
}
loop();
```

---

## 🖥️ Interactive WebGL Test Viewer

You can interactively test and preview all **27 animations** for both characters:

1. Start a local HTTP server:
   ```bash
   python -m http.server 8080 --directory "web_assets"
   ```
2. Navigate to:
   ```text
   http://localhost:8080/test_viewer.html
   ```
3. Click any of the 27 animation buttons (categorized by Locomotion, Acrobatics, Combat, and Mechanics), toggle characters between Mario and Luigi, change playback speed, and view bone skeletons or wireframe mode in real time.
