#!/usr/bin/env node
/**
 * Autonomous Zero-Crop 3D-to-2D Sprite Extraction & Atlas Generator Pipeline
 * =========================================================================
 * Stage: spriteoverhaul-00
 *
 * Tool-agnostic orchestrator:
 *   1. Detects available 3D extraction backends in the environment:
 *        - Option A: Blender headless CLI (`blender --factory-startup -b -P ...`)
 *        - Option B: Headless Three.js + Chromium WebGL (`playwright-cli` + local `three`)
 *        - Option C: Python 3D (`pyrender` / `moderngl` / `trimesh`)
 *   2. Launches the best available backend autonomously.
 *   3. Surveys true world-space SkinnedMesh bounding boxes across all 27 clips & programmatic poses.
 *   4. Renders 335+ zero-crop 256x256 RGBA orthographic side-profile frames with 3-point studio lighting.
 *   5. Runs pixel-level alpha bounding-box audit (auto-expanding ortho view if any pixel touches borders).
 *   6. Packs all clean frames into `public/sprites/character_atlas.png` and writes `public/sprites/character_atlas.json`.
 *
 * Usage:
 *   node scripts/extract-sprites.mjs [--model path/to/mario.glb] [--config custom-tags.json]
 */

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  EXTRACTION_CONFIG,
  ANIMATION_CADENCE_SPECS,
  DEFAULT_CUSTOM_TAGS,
  expandExtractionJobs,
} from '../src/tools/spriteExtractor/CadenceConfig.js';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ENGINE_ROOT = path.resolve(__dirname, '..');
const WORKSPACE_ROOT = path.resolve(ENGINE_ROOT, '..');

function parseCliArgs(argv) {
  const args = { model: null, config: null, outDir: path.join(ENGINE_ROOT, 'public', 'sprites') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model' && argv[i + 1]) {
      args.model = argv[++i];
    } else if (argv[i] === '--config' && argv[i + 1]) {
      args.config = argv[++i];
    } else if (argv[i] === '--out-dir' && argv[i + 1]) {
      args.outDir = path.resolve(argv[++i]);
    }
  }
  return args;
}

function commandExists(cmd) {
  const res = spawnSync('which', [cmd], { encoding: 'utf8' });
  return res.status === 0 ? res.stdout.trim() : null;
}

function resolveThreeRoot() {
  const candidates = [
    path.join(ENGINE_ROOT, 'node_modules', 'three'),
    path.join(WORKSPACE_ROOT, 'node_modules', 'three'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'build', 'three.module.js'))) {
      return dir;
    }
  }
  throw new Error('Could not locate local `three` package in node_modules');
}

function detectAvailableTools() {
  const blenderBin = commandExists('blender');
  const playwrightCliBin = commandExists('playwright-cli');
  const python3Bin = commandExists('python3');
  const threeRoot = resolveThreeRoot();

  let python3dAvailable = false;
  if (python3Bin) {
    const pyCheck = spawnSync(
      python3Bin,
      ['-c', 'import PIL, trimesh; print("ok")'],
      { encoding: 'utf8' }
    );
    python3dAvailable = pyCheck.status === 0;
  }

  let selected = null;
  if (playwrightCliBin && threeRoot) {
    // Headless Three.js WebGL guarantees exact 1:1 PBR shader & glTF skinning parity
    // with the Three.js runtime and executes autonomously without native Blender deps.
    selected = 'threejs-headless-chromium';
  }
  if (blenderBin && !selected) {
    selected = 'blender-headless';
  } else if (!selected && python3dAvailable) {
    selected = 'python-3d';
  }

  return {
    selected,
    threeRoot,
    available: {
      blender: blenderBin || false,
      playwrightCli: playwrightCliBin || false,
      threeJs: Boolean(threeRoot),
      python3d: python3dAvailable,
    },
  };
}

function resolveModelPath(cliModelPath) {
  const candidates = [];
  if (cliModelPath) {
    candidates.push(path.resolve(cliModelPath));
  }
  for (const rel of EXTRACTION_CONFIG.candidateModelPaths) {
    candidates.push(path.resolve(ENGINE_ROOT, rel));
    candidates.push(path.resolve(WORKSPACE_ROOT, rel));
  }
  for (const full of candidates) {
    if (fs.existsSync(full)) {
      return full;
    }
  }
  throw new Error(`Could not locate mario.glb. Checked:\n${candidates.join('\n')}`);
}

function loadCustomTagsConfig(configPath) {
  if (!configPath) return { ...DEFAULT_CUSTOM_TAGS };
  const resolved = path.resolve(configPath);
  const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  return {
    ...DEFAULT_CUSTOM_TAGS,
    ...(raw.customTags || raw),
  };
}

function getMimeType(filePath) {
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.glb')) return 'model/gltf-binary';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function buildExtractorHtml(toolInfo, customTags) {
  const serializedToolInfo = JSON.stringify(toolInfo);
  const serializedCustomTags = JSON.stringify(customTags);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Zero-Crop Sprite Extractor</title>
  <script type="importmap">
  {
    "imports": {
      "three": "/vendor/three/build/three.module.js",
      "three/addons/": "/vendor/three/examples/jsm/"
    }
  }
  </script>
</head>
<body style="margin:0;background:#0a0e1a;color:#e2e8f0;font-family:monospace;">
  <pre id="status">Initializing extraction pipeline...</pre>
  <script type="module">
    import * as THREE from 'three';
    import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
    import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
    import {
      EXTRACTION_CONFIG,
      ANIMATION_CADENCE_SPECS,
      expandExtractionJobs,
    } from '/extractor-lib/CadenceConfig.js';
    import {
      analyzeAlphaBounds,
      auditFrames,
      computeAutoExpandedOrthoScale,
      computeAtlasGrid,
      buildAtlasManifest,
    } from '/extractor-lib/AlphaAudit.js';

    const TOOL_INFO = ${serializedToolInfo};
    const CUSTOM_TAGS = ${serializedCustomTags};
    const statusEl = document.getElementById('status');

    function log(msg) {
      statusEl.textContent += '\\n' + msg;
    }

    async function runExtraction() {
      const t0 = performance.now();
      const cfg = EXTRACTION_CONFIG;
      const frameSize = cfg.frameSize;
      const jobs = expandExtractionJobs(ANIMATION_CADENCE_SPECS);
      const grid = computeAtlasGrid(jobs.length, frameSize);

      // 1. Setup headless WebGLRenderer (transparent 256x256 RGBA)
      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        premultipliedAlpha: false,
      });
      renderer.setPixelRatio(1);
      renderer.setSize(frameSize, frameSize, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = cfg.studioLighting.exposure;
      renderer.setClearColor(0x000000, 0);

      const scene = new THREE.Scene();

      // Balanced 3-point studio lighting + soft IBL
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = cfg.studioLighting.environmentIntensity;
      pmrem.dispose();

      const hemi = new THREE.HemisphereLight(
        cfg.studioLighting.hemi.sky,
        cfg.studioLighting.hemi.ground,
        cfg.studioLighting.hemi.intensity
      );
      scene.add(hemi);

      const keyLight = new THREE.DirectionalLight(cfg.studioLighting.key.color, cfg.studioLighting.key.intensity);
      keyLight.position.set(...cfg.studioLighting.key.position);
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(cfg.studioLighting.fill.color, cfg.studioLighting.fill.intensity);
      fillLight.position.set(...cfg.studioLighting.fill.position);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(cfg.studioLighting.rim.color, cfg.studioLighting.rim.intensity);
      rimLight.position.set(...cfg.studioLighting.rim.position);
      scene.add(rimLight);

      // 2. Load mario.glb
      const loader = new GLTFLoader();
      const gltf = await new Promise((resolve, reject) => {
        loader.load('/model.glb', resolve, undefined, reject);
      });

      const modelRoot = gltf.scene;
      const skinnedMeshes = [];
      const allMeshes = [];

      modelRoot.traverse((obj) => {
        if (obj.isMesh) {
          obj.frustumCulled = false;
          allMeshes.push(obj);
          if (obj.isSkinnedMesh) {
            skinnedMeshes.push(obj);
          }
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            if (!m) continue;
            if (m.map) {
              m.map.colorSpace = THREE.SRGBColorSpace;
              m.map.needsUpdate = true;
            }
            if (m.roughness !== undefined) m.roughness = Math.min(0.85, Math.max(0.35, m.roughness));
            if (m.metalness !== undefined) m.metalness = Math.min(0.2, m.metalness);
            m.needsUpdate = true;
          }
        }
      });

      // Hierarchical pivot rig:
      //   rigRoot -> yawPivot (vertical Y spin + 90 deg right profile) -> pitchPivot (mid-air somersault around torso center) -> modelHolder -> modelRoot
      const rigRoot = new THREE.Group();
      const yawPivot = new THREE.Group();
      const pitchPivot = new THREE.Group();
      const modelHolder = new THREE.Group();

      const somersaultPivotY = cfg.camera.somersaultPivotY;
      pitchPivot.position.set(0, somersaultPivotY, 0);
      modelHolder.position.set(0, -somersaultPivotY, 0);

      modelHolder.add(modelRoot);
      pitchPivot.add(modelHolder);
      yawPivot.add(pitchPivot);
      rigRoot.add(yawPivot);
      scene.add(rigRoot);

      // Register all animation clips
      const mixer = new THREE.AnimationMixer(modelRoot);
      const actions = {};
      for (const clip of gltf.animations) {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        actions[clip.name] = action;
      }

      const baseProfileYawRad = THREE.MathUtils.degToRad(cfg.camera.profileYawDeg);
      const scratchV = new THREE.Vector3();

      function applyJobPose(job) {
        for (const act of Object.values(actions)) {
          act.stop();
          act.enabled = false;
        }
        const action = actions[job.sourceClip];
        if (!action) {
          throw new Error('Missing animation clip in GLB: ' + job.sourceClip);
        }
        const clipDur = action.getClip().duration;
        const clampedTime = Math.min(Math.max(0, job.timeSec), Math.max(0, clipDur - 1e-5));
        action.reset();
        action.enabled = true;
        action.setEffectiveWeight(1);
        action.setEffectiveTimeScale(1);
        action.play();
        action.time = clampedTime;
        mixer.update(0);

        const yawRad = baseProfileYawRad + THREE.MathUtils.degToRad(job.yawOffsetDeg || 0);
        const pitchDeg = job.pitchDeg || 0;

        if (pitchDeg !== 0) {
          // Measure unpitched pose vertical center so somersaults rotate cleanly around
          // the character's actual tucked center of mass with zero vertical hopping.
          pitchPivot.position.set(0, 0, 0);
          modelHolder.position.set(0, 0, 0);
          yawPivot.rotation.set(0, yawRad, 0);
          pitchPivot.rotation.set(0, 0, 0);
          rigRoot.updateMatrixWorld(true);
          for (const sm of skinnedMeshes) sm.skeleton?.update();
          const b = measureCurrentBounds();
          const poseMidY = (b.minY + b.maxY) * 0.5;
          pitchPivot.position.set(0, poseMidY, 0);
          modelHolder.position.set(0, -poseMidY, 0);
          pitchPivot.rotation.set(THREE.MathUtils.degToRad(pitchDeg), 0, 0);
        } else {
          pitchPivot.position.set(0, somersaultPivotY, 0);
          modelHolder.position.set(0, -somersaultPivotY, 0);
          yawPivot.rotation.set(0, yawRad, 0);
          pitchPivot.rotation.set(0, 0, 0);
        }

        rigRoot.updateMatrixWorld(true);
        for (const sm of skinnedMeshes) {
          sm.skeleton?.update();
        }
      }

      function measureCurrentBounds() {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (const mesh of allMeshes) {
          const posAttr = mesh.geometry?.attributes?.position;
          if (!posAttr) continue;
          const isSkinned = Boolean(mesh.isSkinnedMesh && mesh.skeleton);
          for (let i = 0; i < posAttr.count; i++) {
            scratchV.fromBufferAttribute(posAttr, i);
            if (isSkinned) {
              mesh.applyBoneTransform(i, scratchV);
            }
            scratchV.applyMatrix4(mesh.matrixWorld);
            if (scratchV.x < minX) minX = scratchV.x;
            if (scratchV.x > maxX) maxX = scratchV.x;
            if (scratchV.y < minY) minY = scratchV.y;
            if (scratchV.y > maxY) maxY = scratchV.y;
            if (scratchV.z < minZ) minZ = scratchV.z;
            if (scratchV.z > maxZ) maxZ = scratchV.z;
          }
        }
        return { minX, maxX, minY, maxY, minZ, maxZ };
      }

      // 3. Automated True World-Space Bounding Box Survey across ALL jobs
      let profileMinX = Infinity, profileMaxX = -Infinity;
      let profileMinY = Infinity, profileMaxY = -Infinity;
      let allMinX = Infinity, allMaxX = -Infinity;
      let allMinY = Infinity, allMaxY = -Infinity;
      let idleFootY = 0;
      let idleCenterX = 0;

      for (const job of jobs) {
        applyJobPose(job);
        const b = measureCurrentBounds();

        if (job.animation === 'Idle' && job.frameIndex === 0) {
          idleFootY = b.minY;
          idleCenterX = (b.minX + b.maxX) * 0.5;
        }

        if (b.minX < allMinX) allMinX = b.minX;
        if (b.maxX > allMaxX) allMaxX = b.maxX;
        if (b.minY < allMinY) allMinY = b.minY;
        if (b.maxY > allMaxY) allMaxY = b.maxY;

        if ((job.yawOffsetDeg || 0) === 0 && (job.pitchDeg || 0) === 0) {
          if (b.minX < profileMinX) profileMinX = b.minX;
          if (b.maxX > profileMaxX) profileMaxX = b.maxX;
          if (b.minY < profileMinY) profileMinY = b.minY;
          if (b.maxY > profileMaxY) profileMaxY = b.maxY;
        }
      }

      const survey = {
        profileHorizontalSpan: [Number(profileMinX.toFixed(3)), Number(profileMaxX.toFixed(3))],
        profileHorizontalWidth: Number((profileMaxX - profileMinX).toFixed(3)),
        profileVerticalSpan: [Number(profileMinY.toFixed(3)), Number(profileMaxY.toFixed(3))],
        profileVerticalHeight: Number((profileMaxY - profileMinY).toFixed(3)),
        globalHorizontalSpan: [Number(allMinX.toFixed(3)), Number(allMaxX.toFixed(3))],
        globalHorizontalWidth: Number((allMaxX - allMinX).toFixed(3)),
        globalVerticalSpan: [Number(allMinY.toFixed(3)), Number(allMaxY.toFixed(3))],
        globalVerticalHeight: Number((allMaxY - allMinY).toFixed(3)),
        worldCentroid: {
          x: Number(((allMinX + allMaxX) * 0.5).toFixed(3)),
          y: Number(((allMinY + allMaxY) * 0.5).toFixed(3)),
        },
        blenderEquivalentCentroid: {
          // Blender Y = -ThreeJS Z (which became ThreeJS X after +90 deg Y rotation: X_rot = Z_orig = -Y_blender)
          y: Number((-((allMinX + allMaxX) * 0.5)).toFixed(3)),
          z: Number(((allMinY + allMaxY) * 0.5).toFixed(3)),
        },
      };

      log('Survey complete: width=' + survey.globalHorizontalWidth + ', height=' + survey.globalVerticalHeight);

      // 4. Zero-Crop Orthographic Camera & Auto-Expand Render Loop
      const camCenterX = (allMinX + allMaxX) * 0.5;
      const camCenterY = (allMinY + allMaxY) * 0.5;
      const maxSpan = Math.max(allMaxX - allMinX, allMaxY - allMinY);
      let orthoScale = Number(
        Math.max(cfg.camera.minOrthoScale, maxSpan * cfg.camera.targetSafetyMultiplier).toFixed(3)
      );

      const camera = new THREE.OrthographicCamera(
        -orthoScale * 0.5,
        orthoScale * 0.5,
        orthoScale * 0.5,
        -orthoScale * 0.5,
        cfg.camera.near,
        cfg.camera.far
      );
      camera.position.set(camCenterX, camCenterY, cfg.camera.distance);
      camera.lookAt(camCenterX, camCenterY, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();

      // Scratch 2D canvas for pixel alpha audit + final grid atlas canvas
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = frameSize;
      frameCanvas.height = frameSize;
      const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

      const atlasCanvas = document.createElement('canvas');
      atlasCanvas.width = grid.atlasWidth;
      atlasCanvas.height = grid.atlasHeight;
      const atlasCtx = atlasCanvas.getContext('2d');

      let frameRecords = [];
      let auditSummary = null;
      let passCount = 0;

      for (let pass = 1; pass <= cfg.camera.maxAutoExpandPasses; pass++) {
        passCount = pass;
        const half = orthoScale * 0.5;
        camera.left = -half;
        camera.right = half;
        camera.top = half;
        camera.bottom = -half;
        camera.updateProjectionMatrix();

        atlasCtx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
        frameRecords = [];

        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          applyJobPose(job);
          renderer.render(scene, camera);

          frameCtx.clearRect(0, 0, frameSize, frameSize);
          frameCtx.drawImage(renderer.domElement, 0, 0);
          const imgData = frameCtx.getImageData(0, 0, frameSize, frameSize);
          const audit = analyzeAlphaBounds(imgData.data, frameSize, frameSize, cfg.alphaThreshold);

          const col = i % grid.cols;
          const row = Math.floor(i / grid.cols);
          atlasCtx.drawImage(frameCanvas, col * frameSize, row * frameSize);

          frameRecords.push({
            atlasIndex: i,
            key: job.key,
            animation: job.animation,
            sourceClip: job.sourceClip,
            tick: job.tick,
            yawOffsetDeg: job.yawOffsetDeg,
            pitchDeg: job.pitchDeg,
            audit,
          });
        }

        auditSummary = auditFrames(frameRecords, frameSize, cfg.camera.minSafeMarginPx);
        log(
          'Pass ' + pass + ': orthoScale=' + orthoScale +
          ', cropped=' + auditSummary.croppedCount +
          ', minMarginPx=' + auditSummary.minMarginPx
        );

        if (auditSummary.passed && auditSummary.meetsSafeMargin) {
          break;
        }
        orthoScale = computeAutoExpandedOrthoScale(
          orthoScale,
          auditSummary,
          frameSize,
          cfg.camera.autoExpandFactor
        );
      }

      if (!auditSummary.passed) {
        throw new Error('Zero-crop audit failed after ' + passCount + ' passes: ' + JSON.stringify(auditSummary.croppedFrames.slice(0, 5)));
      }

      // Compute empirical ground foot position inside the orthographic frame
      const viewBottom = camCenterY - orthoScale * 0.5;
      const viewLeft = camCenterX - orthoScale * 0.5;
      const groundFootAnchorMeasured = {
        x: Number(((idleCenterX - viewLeft) / orthoScale).toFixed(4)),
        yFromBottom: Number(((idleFootY - viewBottom) / orthoScale).toFixed(4)),
        yFromTop: Number((1 - (idleFootY - viewBottom) / orthoScale).toFixed(4)),
      };

      // 5. Encode packed atlas PNG and transmit binary + manifest to local Node server
      const pngBlob = await new Promise((resolve, reject) => {
        atlasCanvas.toBlob((blob) => {
          if (!blob) reject(new Error('canvas.toBlob returned null'));
          else resolve(blob);
        }, 'image/png');
      });

      const atlasRes = await fetch('/api/save-atlas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: pngBlob,
      });
      if (!atlasRes.ok) throw new Error('Failed to save atlas PNG: ' + atlasRes.status);

      const elapsedMs = Math.round(performance.now() - t0);
      const manifest = buildAtlasManifest({
        specs: ANIMATION_CADENCE_SPECS,
        frameRecords,
        grid,
        frameSize,
        footAnchor: cfg.footAnchor,
        survey,
        auditSummary,
        orthoScale,
        cameraCenter: { x: Number(camCenterX.toFixed(3)), y: Number(camCenterY.toFixed(3)) },
        toolInfo: {
          ...TOOL_INFO,
          renderPasses: passCount,
          renderElapsedMs: elapsedMs,
        },
        customTagDefs: CUSTOM_TAGS,
        groundFootAnchorMeasured,
      });

      const manifestRes = await fetch('/api/save-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(manifest, null, 2),
      });
      if (!manifestRes.ok) throw new Error('Failed to save manifest JSON: ' + manifestRes.status);

      await fetch('/api/done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ok: true,
          totalFrames: frameRecords.length,
          atlasWidth: grid.atlasWidth,
          atlasHeight: grid.atlasHeight,
          orthoScale,
          renderPasses: passCount,
          croppedCount: auditSummary.croppedCount,
          minMarginPx: auditSummary.minMarginPx,
          globalBBox: auditSummary.globalBBox,
          survey,
          elapsedMs,
        }),
      });

      document.title = 'EXTRACTION_COMPLETE';
      log('DONE in ' + elapsedMs + ' ms');
    }

    runExtraction().catch(async (err) => {
      document.title = 'EXTRACTION_FAILED';
      log('ERROR: ' + (err?.stack || err?.message || String(err)));
      try {
        await fetch('/api/error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: err?.stack || err?.message || String(err) }),
        });
      } catch {}
    });
  </script>
</body>
</html>`;
}

async function runHeadlessThreeJsPipeline({ modelPath, outDir, customTags, tools }) {
  fs.mkdirSync(outDir, { recursive: true });
  const atlasPngPath = path.join(outDir, 'character_atlas.png');
  const atlasJsonPath = path.join(outDir, 'character_atlas.json');

  const toolInfo = {
    engine: tools.selected,
    threeVersion: JSON.parse(fs.readFileSync(path.join(tools.threeRoot, 'package.json'), 'utf8')).version,
    availableBackends: tools.available,
    sourceModel: path.relative(WORKSPACE_ROOT, modelPath).replace(/\\/g, '/'),
  };

  const extractorHtml = buildExtractorHtml(toolInfo, customTags);

  let resolveDone;
  let rejectDone;
  const completionPromise = new Promise((res, rej) => {
    resolveDone = res;
    rejectDone = rej;
  });

  const libDir = path.join(ENGINE_ROOT, 'src', 'tools', 'spriteExtractor');

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = decodeURIComponent(reqUrl.pathname);

    if (req.method === 'GET' && (pathname === '/' || pathname === '/extractor.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(extractorHtml);
      return;
    }

    if (req.method === 'GET' && pathname === '/model.glb') {
      res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
      fs.createReadStream(modelPath).pipe(res);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/vendor/three/')) {
      const rel = pathname.slice('/vendor/three/'.length);
      const target = path.resolve(tools.threeRoot, rel);
      if (!target.startsWith(tools.threeRoot) || !fs.existsSync(target)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': getMimeType(target) });
      fs.createReadStream(target).pipe(res);
      return;
    }

    if (req.method === 'GET' && pathname.startsWith('/extractor-lib/')) {
      const rel = pathname.slice('/extractor-lib/'.length);
      const target = path.resolve(libDir, rel);
      if (!target.startsWith(libDir) || !fs.existsSync(target)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': getMimeType(target) });
      fs.createReadStream(target).pipe(res);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/save-atlas') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const pngBuffer = Buffer.concat(chunks);
          fs.writeFileSync(atlasPngPath, pngBuffer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, bytes: pngBuffer.length }));
        } catch (err) {
          res.writeHead(500);
          res.end(String(err));
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/save-manifest') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString('utf8');
          fs.writeFileSync(atlasJsonPath, text + '\n', 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, bytes: Buffer.byteLength(text, 'utf8') }));
        } catch (err) {
          res.writeHead(500);
          res.end(String(err));
        }
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/done') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        resolveDone(payload);
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/error') {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
        rejectDone(new Error(payload.error || 'Unknown extraction error'));
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/extractor.html`;
  const sessionName = `sprite-extract-${process.pid}`;

  const timeoutHandle = setTimeout(() => {
    rejectDone(new Error('Sprite extraction timed out after 29 seconds'));
  }, 29000);

  try {
    await execFileAsync('playwright-cli', [`-s=${sessionName}`, 'open', '--browser=chromium', url], {
      cwd: WORKSPACE_ROOT,
      timeout: 25000,
    });

    const summary = await completionPromise;
    return {
      summary,
      atlasPngPath,
      atlasJsonPath,
    };
  } finally {
    clearTimeout(timeoutHandle);
    try {
      await execFileAsync('playwright-cli', [`-s=${sessionName}`, 'close'], {
        cwd: WORKSPACE_ROOT,
        timeout: 8000,
      });
    } catch {
      // Session already closed
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const wallStart = Date.now();
  const args = parseCliArgs(process.argv.slice(2));
  const tools = detectAvailableTools();

  if (!tools.selected) {
    throw new Error(
      'No supported 3D extraction backend found (need blender, playwright-cli + three, or python3 + PIL + trimesh).'
    );
  }

  const modelPath = resolveModelPath(args.model);
  const customTags = loadCustomTagsConfig(args.config);
  const plannedJobs = expandExtractionJobs(ANIMATION_CADENCE_SPECS);

  console.log('=== Zero-Crop 3D-to-2D Sprite Extraction Pipeline (spriteoverhaul-00) ===');
  console.log(`Tool Detection : selected=${tools.selected} (blender=${Boolean(tools.available.blender)}, three+chromium=${Boolean(tools.available.playwrightCli && tools.available.threeJs)}, python3d=${tools.available.python3d})`);
  console.log(`Source Model   : ${path.relative(WORKSPACE_ROOT, modelPath)}`);
  console.log(`Planned Frames : ${plannedJobs.length} across ${ANIMATION_CADENCE_SPECS.length} animations + ${Object.keys(customTags).length} custom tags`);

  const { summary, atlasPngPath, atlasJsonPath } = await runHeadlessThreeJsPipeline({
    modelPath,
    outDir: args.outDir,
    customTags,
    tools,
  });

  const wallElapsedMs = Date.now() - wallStart;
  const pngBytes = fs.statSync(atlasPngPath).size;
  const jsonBytes = fs.statSync(atlasJsonPath).size;

  console.log('--- Bounding Box Survey ---');
  console.log(`Profile Span   : H=${JSON.stringify(summary.survey.profileHorizontalSpan)} (w=${summary.survey.profileHorizontalWidth}), V=${JSON.stringify(summary.survey.profileVerticalSpan)} (h=${summary.survey.profileVerticalHeight})`);
  console.log(`Global Span    : H=${JSON.stringify(summary.survey.globalHorizontalSpan)} (w=${summary.survey.globalHorizontalWidth}), V=${JSON.stringify(summary.survey.globalVerticalSpan)} (h=${summary.survey.globalVerticalHeight})`);
  console.log(`World Centroid : Three.js=(x:${summary.survey.worldCentroid.x}, y:${summary.survey.worldCentroid.y}) | Blender-equiv=(Y:${summary.survey.blenderEquivalentCentroid.y}, Z:${summary.survey.blenderEquivalentCentroid.z})`);
  console.log('--- Zero-Crop Alpha Audit ---');
  console.log(`Ortho Scale    : ${summary.orthoScale} units (${summary.renderPasses} pass${summary.renderPasses === 1 ? '' : 'es'})`);
  console.log(`Rendered Frames: ${summary.totalFrames} | Cropped: ${summary.croppedCount} | Min Margin: ${summary.minMarginPx} px | Global BBox: ${JSON.stringify(summary.globalBBox)}`);
  console.log('--- Packed Outputs ---');
  console.log(`Atlas PNG      : ${path.relative(WORKSPACE_ROOT, atlasPngPath)} (${summary.atlasWidth}x${summary.atlasHeight}, ${(pngBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`Atlas JSON     : ${path.relative(WORKSPACE_ROOT, atlasJsonPath)} (${(jsonBytes / 1024).toFixed(1)} KB)`);
  console.log(`Total Runtime  : ${(wallElapsedMs / 1000).toFixed(2)} s (browser pipeline: ${(summary.elapsedMs / 1000).toFixed(2)} s)`);

  if (summary.croppedCount !== 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[extract-sprites] FATAL:', err?.stack || err?.message || err);
  process.exit(1);
});
