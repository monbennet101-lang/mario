/**
 * TelemetryHUD — Real-Time Kinematic & Jump Arc Overlay ([F3] toggle)
 * =====================================================================
 * Subscribes to GameEngine's single render loop (zero extra rAF loops).
 * Throttles DOM text updates (~15 Hz) with fixed-width tabular-nums
 * to prevent layout thrashing while drawing 60 Hz velocity & jump arc graphs.
 */

import React, { useRef, useEffect } from 'react';
import MovementProfile from '@game/config/MovementProfile';
import { LayoutOverride } from '@engine/input/GamepadHardware';
import { getAnalogSpeedBand } from '@engine/input/AnalogMath';

const GRAPH_WIDTH = 248;
const GRAPH_HEIGHT = 26;
const ARC_GRAPH_HEIGHT = 44;
const GRAPH_FRAMES = 120;

// Precompute analytical reference curves for Jump Arc Telemetry (Standing & Sprint)
function buildReferenceArc(boostRatio) {
  const { launchVelocity, gravityRising, gravityFalling, terminalFallSpeed, runBoostFactor } = MovementProfile.jump;
  const { vyThreshold, gravityMultiplier, maxFrames } = MovementProfile.apexFloat;
  const dt = MovementProfile.simulation.fixedTimeStep;
  const v0 = launchVelocity * (1 + runBoostFactor * boostRatio);

  const pts = [{ t: 0, dy: 0 }];
  let y = 0;
  let vy = v0;
  let floatLeft = maxFrames;

  for (let f = 1; f <= 70; f++) {
    const prevVy = vy;
    let g = vy > 0 ? gravityRising : gravityFalling;
    if (Math.abs(vy) < vyThreshold && floatLeft > 0) {
      g *= gravityMultiplier;
      floatLeft--;
    }
    vy -= g * dt;
    if (vy < -terminalFallSpeed) vy = -terminalFallSpeed;
    y += 0.5 * (prevVy + vy) * dt;
    if (y <= 0 && f > 1) {
      pts.push({ t: f * dt, dy: 0 });
      break;
    }
    pts.push({ t: f * dt, dy: y });
  }
  return pts;
}

function TelemetryHUD({ visible, engine, engineRef, controllerStatus, onSetLayoutOverride }) {
  const vxGraphRef = useRef(null);
  const vyGraphRef = useRef(null);
  const arcGraphRef = useRef(null);
  const vxHistory = useRef(new Float32Array(GRAPH_FRAMES));
  const vyHistory = useRef(new Float32Array(GRAPH_FRAMES));
  const histIdx = useRef(0);
  const lastTickDrawn = useRef(-1);

  const fpsRef = useRef(null);
  const driftRef = useRef(null);
  const posRef = useRef(null);
  const velRef = useRef(null);
  const velPxRef = useRef(null);
  const stateRef = useRef(null);
  const groundedRef = useRef(null);
  const crouchRef = useRef(null);
  const tierRef = useRef(null);
  const tickRef = useRef(null);
  const hashRef = useRef(null);

  // Stage 3 Jump Arc Telemetry refs
  const peakApexRef = useRef(null);
  const apexTimeRef = useRef(null);
  const airtimeRef = useRef(null);
  const floatFramesRef = useRef(null);
  const coyoteBadgeRef = useRef(null);
  const bufferBadgeRef = useRef(null);
  const nudgeBadgeRef = useRef(null);
  const stepBadgeRef = useRef(null);

  // Stage 4 Acrobatic & Screen Trauma refs
  const traumaRef = useRef(null);
  const spinBadgeRef = useRef(null);
  const wallBadgeRef = useRef(null);
  const lockBadgeRef = useRef(null);
  const poundBadgeRef = useRef(null);

  // Stage 5 Terrain Incline & Slide Lethality refs
  const slopeAngleRef = useRef(null);
  const normalVecRef = useRef(null);
  const adhesionBadgeRef = useRef(null);
  const semiBadgeRef = useRef(null);
  const platBadgeRef = useRef(null);
  const slideLethalBadgeRef = useRef(null);

  // Stage 6 Level Kit & Geometry Lint refs
  const kitStatsRef = useRef(null);
  const lintBadgeRef = useRef(null);

  // Stage 7 2.5D Camera & Viewport refs
  const camPosRef = useRef(null);
  const camLookRef = useRef(null);
  const camScreenRef = useRef(null);
  const camFovRef = useRef(null);
  const camCalmBadgeRef = useRef(null);
  const camClampBadgeRef = useRef(null);
  const camFastFallBadgeRef = useRef(null);
  const camVignetteBadgeRef = useRef(null);

  // Stage 8 3D Rig & Character refs
  const rigCharRef = useRef(null);
  const rigClipRef = useRef(null);
  const rigSquashRef = useRef(null);
  const rigYawRef = useRef(null);

  // Stage 9 & 10 Combat, Feel Preset & Perf Monitor refs
  const formRef = useRef(null);
  const presetRef = useRef(null);
  const drawsRef = useRef(null);
  const heapRef = useRef(null);

  // Stage 20 Multi-Sensory Juice refs
  const juiceHitstopRef = useRef(null);
  const juiceTraumaRef = useRef(null);
  const juiceParticlesRef = useRef(null);
  const juiceBufferRef = useRef(null);

  // DualShock 4 / Gamepad & Haptics refs
  const gpProfileRef = useRef(null);
  const gpStickRef = useRef(null);
  const gpTriggersRef = useRef(null);
  const gpHapticRef = useRef(null);

  useEffect(() => {
    const activeEngine = engine || engineRef?.current;
    if (!visible || !activeEngine) {
      lastTickDrawn.current = -1;
      return;
    }

    const standingRefArc = buildReferenceArc(0);
    const sprintRefArc = buildReferenceArc(1);

    const prevText = {};
    const setText = (ref, key, val) => {
      if (ref.current && prevText[key] !== val) {
        prevText[key] = val;
        ref.current.textContent = val;
      }
    };
    const setBadge = (ref, key, active, activeBg, activeColor, activeBorder) => {
      if (!ref.current || prevText[key] === active) return;
      prevText[key] = active;
      ref.current.style.background = active ? activeBg : 'rgba(15, 23, 42, 0.55)';
      ref.current.style.color = active ? activeColor : '#475569';
      ref.current.style.borderColor = active ? activeBorder : 'rgba(71, 85, 105, 0.35)';
    };

    let lastDomUpdate = 0;

    const sync = (eng) => {
      const { player, loop } = eng;
      const now = performance.now();
      const tickChanged = loop.tickCount !== lastTickDrawn.current;

      if (tickChanged) {
        lastTickDrawn.current = loop.tickCount;
        const idx = histIdx.current % GRAPH_FRAMES;
        vxHistory.current[idx] = player.vel.x;
        vyHistory.current[idx] = player.vel.y;
        histIdx.current++;

        drawGraph(vxGraphRef.current, vxHistory.current, histIdx.current, '#38BDF8', 'vx (t/s)', 12);
        drawGraph(vyGraphRef.current, vyHistory.current, histIdx.current, '#FB7185', 'vy (t/s)', 25);
        drawJumpArc(arcGraphRef.current, player.jumpMetrics, standingRefArc, sprintRefArc);
      }

      if (!loop.isPaused && now - lastDomUpdate < 66 && lastDomUpdate !== 0) return;
      lastDomUpdate = now;

      setText(fpsRef, 'fps', `${loop.fps.toFixed(1)} fps`);
      setText(driftRef, 'drift', `${loop.simDriftMs.toFixed(1)}ms`);
      setText(posRef, 'pos', `${player.pos.x.toFixed(2)}, ${player.pos.y.toFixed(2)}`);
      setText(velRef, 'vel', `${player.vel.x.toFixed(2)}, ${player.vel.y.toFixed(2)}`);

      const vxPxF = (player.vel.x * 64 / 60).toFixed(1);
      const vyPxF = (player.vel.y * 64 / 60).toFixed(1);
      setText(velPxRef, 'velPx', `${vxPxF}, ${vyPxF} px/f`);
      setText(stateRef, 'state', player.state);

      const groundedLabel = player.grounded ? 'YES' : 'NO';
      if (groundedRef.current && prevText.grounded !== groundedLabel) {
        prevText.grounded = groundedLabel;
        groundedRef.current.textContent = groundedLabel;
        groundedRef.current.style.color = player.grounded ? '#4ADE80' : '#F87171';
      }

      const crouchLabel = player.isCrouched
        ? (player.standingBlocked ? 'LOCK 0.9t' : 'YES 0.9t')
        : 'NO 1.8t';
      if (crouchRef.current && prevText.crouch !== crouchLabel) {
        prevText.crouch = crouchLabel;
        crouchRef.current.textContent = crouchLabel;
        crouchRef.current.style.color = player.isCrouched ? '#38BDF8' : '#94A3B8';
      }

      setText(tierRef, 'tier', player.speedTier);
      setText(tickRef, 'tick', String(loop.tickCount));
      setText(hashRef, 'hash', `0x${(player.stateHash >>> 0).toString(16).padStart(8, '0')}`);

      // Stage 3 Jump Arc readouts & Forgiveness badges
      const jm = player.jumpMetrics;
      setText(peakApexRef, 'peak', `${jm.peakHeight.toFixed(2)} t`);
      setText(apexTimeRef, 'tApex', `${jm.timeToApex.toFixed(2)} s`);
      setText(airtimeRef, 'airtime', `${jm.airtime.toFixed(2)} s`);
      setText(floatFramesRef, 'floatF', `${jm.apexFloatFrames} f`);

      setBadge(coyoteBadgeRef, 'coyote', jm.wasCoyote, 'rgba(22, 163, 74, 0.28)', '#4ADE80', '#4ADE80');
      setBadge(bufferBadgeRef, 'buffer', jm.wasBuffered, 'rgba(202, 138, 4, 0.28)', '#FACC15', '#FACC15');
      setBadge(nudgeBadgeRef, 'nudge', jm.cornerNudged, 'rgba(14, 116, 144, 0.32)', '#38BDF8', '#38BDF8');
      setBadge(stepBadgeRef, 'stepUp', jm.stepUpUsed, 'rgba(5, 150, 105, 0.28)', '#34D399', '#34D399');

      // Stage 4 Acrobatic & Screen Shake Trauma readouts
      const trauma = eng.camera?.shake?.trauma ?? eng.renderer?.shake?.trauma ?? 0;
      setText(traumaRef, 'trauma', trauma.toFixed(2));
      setBadge(spinBadgeRef, 'spin4', player.isSpinningCombat, 'rgba(8, 145, 178, 0.34)', '#22D3EE', '#22D3EE');
      setBadge(wallBadgeRef, 'wall4', player.isWallSliding || player.wallContactDirection !== 0, 'rgba(217, 119, 6, 0.32)', '#F59E0B', '#F59E0B');
      setBadge(lockBadgeRef, 'lock4', player.wallJumpLockTimer > 0 || player.wallJumpHeldDirLock !== 0, 'rgba(22, 163, 74, 0.28)', '#4ADE80', '#4ADE80');
      setBadge(poundBadgeRef, 'pound4', player.groundPoundPhase !== null || trauma > 0.01, 'rgba(225, 29, 72, 0.30)', '#FB7185', '#FB7185');

      // Stage 5 Incline, Normal, Adhesion & Slide Lethality readouts
      setText(slopeAngleRef, 'slopeDeg', `${player.slopeAngleDeg.toFixed(1)}°`);
      setText(normalVecRef, 'normalVec', `${player.groundNormal.x.toFixed(2)}, ${player.groundNormal.y.toFixed(2)}`);
      setBadge(adhesionBadgeRef, 'adhesion5', player.slopeAdhesionActive, 'rgba(14, 116, 144, 0.34)', '#22D3EE', '#22D3EE');
      setBadge(semiBadgeRef, 'semi5', player.standingOnSemisolid, 'rgba(2, 132, 199, 0.32)', '#38BDF8', '#38BDF8');
      setBadge(platBadgeRef, 'plat5', Boolean(player.ridingPlatform), 'rgba(99, 102, 241, 0.32)', '#A5B4FC', '#818CF8');

      const sliding = player.state === 'ButtSlide' || player.state === 'CrouchSlide';
      const lethalKey = player.isSlideLethal ? 'LETHAL' : (sliding ? 'SAFE' : 'IDLE');
      if (slideLethalBadgeRef.current && prevText.lethalKey !== lethalKey) {
        prevText.lethalKey = lethalKey;
        const el = slideLethalBadgeRef.current;
        if (lethalKey === 'LETHAL') {
          el.textContent = 'LETHAL';
          el.style.background = 'rgba(22, 163, 74, 0.34)';
          el.style.color = '#4ADE80';
          el.style.borderColor = '#4ADE80';
        } else if (lethalKey === 'SAFE') {
          el.textContent = 'SLIDE SAFE';
          el.style.background = 'rgba(202, 138, 4, 0.30)';
          el.style.color = '#FACC15';
          el.style.borderColor = '#FACC15';
        } else {
          el.textContent = 'SLIDE SAFE';
          el.style.background = 'rgba(15, 23, 42, 0.55)';
          el.style.color = '#475569';
          el.style.borderColor = 'rgba(71, 85, 105, 0.35)';
        }
      }

      // Stage 6 Level Kit & Geometry Lint status
      const kit = eng.levelKit;
      if (kit) {
        setText(kitStatsRef, 'kitStats', `${kit.coinsCollected}c · ${kit.bricksBroken}b`);
      }
      const lint = eng.geometryLintReport;
      if (lintBadgeRef.current) {
        const lintKey = lint ? (lint.passed ? `PASS:${lint.checkedTiles}` : `FAIL:${lint.mismatches.length}`) : 'N/A';
        if (prevText.lintKey !== lintKey) {
          prevText.lintKey = lintKey;
          const el = lintBadgeRef.current;
          el.textContent = lint?.passed ? 'LINT PASS · 0 ERR' : `LINT FAIL · ${lint?.mismatches?.length ?? '?'}`;
          el.style.color = lint?.passed ? '#4ADE80' : '#F87171';
          el.style.borderColor = lint?.passed ? '#4ADE80' : '#F87171';
          el.style.background = lint?.passed ? 'rgba(22, 163, 74, 0.25)' : 'rgba(185, 28, 28, 0.32)';
        }
      }

      // Stage 7 2.5D Camera & Viewport Telemetry
      const cam = eng.camera;
      if (cam) {
        setText(camPosRef, 'camPos', `${cam.x.toFixed(1)}, ${cam.y.toFixed(1)}`);
        const sign = cam.lookAheadPx >= 0 ? '+' : '';
        setText(camLookRef, 'camLook', `${sign}${Math.round(cam.lookAheadPx)}px (${sign}${cam.lookAheadOffset.toFixed(2)}t)`);
        setText(camScreenRef, 'camScr', `${(cam.playerScreenX * 100).toFixed(0)}% / ${(cam.playerScreenY * 100).toFixed(0)}%`);
        const zoomVal = cam.zoom ?? 1.0;
        setText(camFovRef, 'camFov', `Z ${zoomVal.toFixed(3)}× · ${cam.camera.fov.toFixed(1)}°`);

        setBadge(camCalmBadgeRef, 'camCalm7', cam.inHorizontalDeadzone && cam.inVerticalDeadzone, 'rgba(22, 163, 74, 0.28)', '#4ADE80', '#4ADE80');
        setBadge(camClampBadgeRef, 'camClamp7', cam.groundSnapActive || cam.verticalSafetyClampActive, 'rgba(225, 29, 72, 0.30)', '#FB7185', '#FB7185');
        setBadge(camFastFallBadgeRef, 'camFFall7', cam.fallAnticipationActive, 'rgba(217, 119, 6, 0.32)', '#F59E0B', '#F59E0B');
        setBadge(camVignetteBadgeRef, 'camVig7', cam.sprintZoomActive || zoomVal < 0.995, 'rgba(14, 116, 144, 0.34)', '#38BDF8', '#38BDF8');
      }

      // Stage 8 3D Skeletal Rig & Character Telemetry
      const rigTel = eng.renderer?.rig3D?.telemetry;
      const charName = player.characterId === 'luigi' ? 'LUIGI' : 'MARIO';
      if (rigCharRef.current && prevText.rigChar !== charName) {
        prevText.rigChar = charName;
        rigCharRef.current.textContent = charName;
        rigCharRef.current.style.color = player.characterId === 'luigi' ? '#4ADE80' : '#F87171';
      }
      if (rigTel) {
        setText(rigClipRef, 'rigClip', rigTel.activeClip || 'Idle');
        setText(rigSquashRef, 'rigSquash', `${rigTel.squashSy.toFixed(2)} / ${rigTel.volumeProduct.toFixed(2)}`);
        setText(rigYawRef, 'rigYaw', `${Math.round(rigTel.yawDeg)}°${player.isFluttering ? ' FLT' : ''}`);
      } else {
        setText(rigClipRef, 'rigClip', player.state);
        setText(rigSquashRef, 'rigSquash', '1.00 / 1.00');
        setText(rigYawRef, 'rigYaw', `${player.facingRight ? '70' : '-70'}°`);
      }

      // Stage 9 & 10 Form, Feel Preset, WebGL Draw Calls & JS Heap Monitor
      setText(formRef, 'form9', `${String(player.powerUpForm || 'small').toUpperCase()}${eng.hitstopFrames > 0 ? ` HS:${eng.hitstopFrames}` : ''}`);
      setText(presetRef, 'preset10', `${String(eng.feelPresetId || 'wonder').toUpperCase()}${eng.currentRoom?.isGauntlet ? ` · ${eng.currentGauntletSectionId}` : ''}`);
      setText(drawsRef, 'draws10', `${rigTel?.drawCalls ?? 0} GL`);
      const heapMb = typeof performance !== 'undefined' && performance.memory
        ? `${(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(0)} MB`
        : 'N/A';
      setText(heapRef, 'heap10', heapMb);

      // Stage 20 Multi-Sensory Juice Telemetry
      const juiceTel = eng.juice?.getTelemetry?.();
      if (juiceTel) {
        setText(
          juiceHitstopRef,
          'juiceHs20',
          juiceTel.hitstopFrames > 0
            ? `${juiceTel.hitstopFrames}f (${juiceTel.hitstopReason})`
            : `0f · ${juiceTel.hitstopReason}`
        );
        setText(
          juiceTraumaRef,
          'juiceTr20',
          `${juiceTel.trauma.toFixed(2)} (${juiceTel.offsetXPx >= 0 ? '+' : ''}${juiceTel.offsetXPx.toFixed(1)},${juiceTel.offsetYPx >= 0 ? '+' : ''}${juiceTel.offsetYPx.toFixed(1)}px)`
        );
        const totalParticles = juiceTel.activeParticles + (eng.renderer?.particles?.activeCount ?? 0);
        setText(juiceParticlesRef, 'juicePt20', `${totalParticles} / ${juiceTel.poolCapacity}`);
        setText(juiceBufferRef, 'juiceBuf20', `${juiceTel.bufferedPressesCaptured} cap`);
      }

      // DualShock 4 / Gamepad & Haptics Telemetry
      const hw = eng.input?.hardware?.getStatus?.();
      const analog = eng.input?.getAnalogState?.();
      const haptics = eng.input?.haptics;
      if (hw && analog) {
        setText(gpProfileRef, 'gpProf', `${hw.effectiveProfile}${hw.connected ? '' : ' (KB)'}`);
        const band = getAnalogSpeedBand(analog.filteredX);
        setText(gpStickRef, 'gpStick', `${analog.filteredX.toFixed(2)},${analog.filteredY.toFixed(2)} ${band[0]}`);
        setText(
          gpTriggersRef,
          'gpTrig',
          `L2:${Math.round((analog.l2Pressure || 0) * 100)}% R2:${Math.round((analog.r2Pressure || 0) * 100)}%`
        );
      }
      if (haptics) {
        setText(gpHapticRef, 'gpHap', `${haptics.lastEventName} (${haptics.callCount})`);
      }
    };

    sync(activeEngine);
    return activeEngine.subscribeUITick(sync);
  }, [visible, engine, engineRef]);

  if (!visible) return null;

  return (
    <aside
      data-testid="telemetry-hud"
      aria-label="Telemetry HUD"
      style={styles.container}
    >
      <div style={styles.header}>
        <span style={styles.title}>TELEMETRY</span>
        <span ref={fpsRef} style={styles.fpsBadge}>60.0 fps</span>
      </div>

      <div style={styles.compactGrid}>
        <div style={styles.cell}>
          <span style={styles.label}>POS</span>
          <span ref={posRef} style={styles.value}>0.00, 0.00</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>VEL</span>
          <span ref={velRef} style={styles.value}>0.00, 0.00</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>STATE</span>
          <span ref={stateRef} style={{ ...styles.value, color: '#FACC15' }}>Fall</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>TIER</span>
          <span ref={tierRef} style={{ ...styles.value, color: '#22D3EE' }}>IDLE</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>GND</span>
          <span ref={groundedRef} style={styles.value}>NO</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>CROUCH</span>
          <span ref={crouchRef} style={styles.value}>NO 1.8t</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>PX/F</span>
          <span ref={velPxRef} style={styles.value}>0.0, 0.0 px/f</span>
        </div>
        <div style={styles.cell}>
          <span style={styles.label}>DRIFT</span>
          <span ref={driftRef} style={styles.value}>0.0ms</span>
        </div>
      </div>
      <div style={styles.row}>
        <span style={styles.label}>TICK / HASH</span>
        <span style={styles.value}>
          <span ref={tickRef}>0</span> · <span ref={hashRef}>0x00000000</span>
        </span>
      </div>

      <canvas ref={vxGraphRef} width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={styles.graph} />
      <canvas ref={vyGraphRef} width={GRAPH_WIDTH} height={GRAPH_HEIGHT} style={styles.graph} />

      {/* DualShock 4 Hardware, Radial Kinematics & Haptics Telemetry */}
      <div style={styles.jumpSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={styles.subHeader}>GAMEPAD & HAPTICS</span>
          <span ref={gpProfileRef} data-testid="telemetry-gp-profile" style={{ ...styles.value, fontSize: 9.5, color: '#0084FF' }}>
            {controllerStatus?.effectiveProfile || 'KEYBOARD'}
          </span>
        </div>
        <div style={styles.compactGrid}>
          <div style={styles.cell}>
            <span style={styles.label}>STICK</span>
            <span ref={gpStickRef} data-testid="telemetry-gp-stick" style={styles.value}>0.00,0.00 N</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>TRIG</span>
            <span ref={gpTriggersRef} data-testid="telemetry-gp-triggers" style={styles.value}>L2:0% R2:0%</span>
          </div>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>HAPTIC</span>
          <span ref={gpHapticRef} data-testid="telemetry-gp-haptic" style={{ ...styles.value, color: '#FF66B2' }}>idle (0)</span>
        </div>
        <div
          style={styles.layoutRow}
          data-testid="telemetry-layout-override"
          role="group"
          aria-label="Telemetry Controller Layout Override"
        >
          {[
            { id: LayoutOverride.AUTO, label: 'Auto' },
            { id: LayoutOverride.FORCE_PS4, label: 'Force PS4' },
            { id: LayoutOverride.FORCE_XBOX, label: 'Force Xbox' },
          ].map((opt) => {
            const active = (controllerStatus?.layoutOverride || LayoutOverride.AUTO) === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                tabIndex={-1}
                data-testid={`telemetry-layout-${opt.id}`}
                aria-pressed={active}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onSetLayoutOverride?.(opt.id);
                }}
                style={active ? styles.layoutBtnActive : styles.layoutBtn}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stage 3 Jump Arc Telemetry Gauge */}
      <div style={styles.jumpSection}>
        <div style={styles.subHeader}>JUMP ARC TELEMETRY</div>
        <div style={styles.metricsGrid}>
          <div style={styles.metricCell}>
            <span style={styles.metricKicker}>PEAK</span>
            <span ref={peakApexRef} data-testid="jump-peak" style={styles.metricVal}>0.00 t</span>
          </div>
          <div style={styles.metricCell}>
            <span style={styles.metricKicker}>T-APEX</span>
            <span ref={apexTimeRef} data-testid="jump-apex-time" style={styles.metricVal}>0.00 s</span>
          </div>
          <div style={styles.metricCell}>
            <span style={styles.metricKicker}>AIR</span>
            <span ref={airtimeRef} data-testid="jump-airtime" style={styles.metricVal}>0.00 s</span>
          </div>
          <div style={styles.metricCell}>
            <span style={styles.metricKicker}>FLOAT</span>
            <span ref={floatFramesRef} data-testid="jump-float-frames" style={styles.metricVal}>0 f</span>
          </div>
        </div>

        <canvas
          ref={arcGraphRef}
          data-testid="jump-arc-canvas"
          width={GRAPH_WIDTH}
          height={ARC_GRAPH_HEIGHT}
          style={styles.graph}
        />

        <div style={styles.badgeRow}>
          <span ref={coyoteBadgeRef} data-testid="badge-coyote" style={styles.forgivenessBadge}>COYOTE</span>
          <span ref={bufferBadgeRef} data-testid="badge-buffer" style={styles.forgivenessBadge}>BUFFER</span>
          <span ref={nudgeBadgeRef} data-testid="badge-nudge" style={styles.forgivenessBadge}>NUDGE</span>
          <span ref={stepBadgeRef} data-testid="badge-stepup" style={styles.forgivenessBadge}>STEP-UP</span>
        </div>

        <div style={styles.acroRow}>
          <span ref={spinBadgeRef} data-testid="badge-spin" style={styles.forgivenessBadge}>SPIN</span>
          <span ref={wallBadgeRef} data-testid="badge-wall" style={styles.forgivenessBadge}>WALL</span>
          <span ref={lockBadgeRef} data-testid="badge-walllock" style={styles.forgivenessBadge}>LOCK</span>
          <span ref={poundBadgeRef} data-testid="badge-pound" style={styles.forgivenessBadge}>
            PND <span ref={traumaRef} style={{ color: '#FB7185' }}>0.00</span>
          </span>
        </div>
      </div>

      {/* Stage 5 Terrain Incline & Slide Lethality Section */}
      <div style={styles.jumpSection}>
        <div style={styles.subHeader}>TERRAIN & INCLINE</div>
        <div style={styles.compactGrid}>
          <div style={styles.cell}>
            <span style={styles.label}>SLOPE</span>
            <span ref={slopeAngleRef} data-testid="incline-angle" style={{ ...styles.value, color: '#FACC15' }}>0.0°</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>NRM</span>
            <span ref={normalVecRef} data-testid="surface-normal" style={styles.value}>0.00, 1.00</span>
          </div>
        </div>
        <div style={styles.badgeRow}>
          <span ref={adhesionBadgeRef} data-testid="badge-adhesion" style={styles.forgivenessBadge}>ADHESION</span>
          <span ref={semiBadgeRef} data-testid="badge-semisolid" style={styles.forgivenessBadge}>SEMI</span>
          <span ref={platBadgeRef} data-testid="badge-platform" style={styles.forgivenessBadge}>PLAT</span>
          <span ref={slideLethalBadgeRef} data-testid="badge-slide-lethal" style={styles.forgivenessBadge}>SLIDE SAFE</span>
        </div>
      </div>

      {/* Stage 7 2.5D Camera & Viewport Section */}
      <div style={styles.jumpSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={styles.subHeader}>2.5D CAMERA & VIEWPORT</span>
          <span ref={camFovRef} data-testid="cam-fov" style={{ ...styles.value, fontSize: 9.5, color: '#38BDF8' }}>Z 1.000× · 30.0°</span>
        </div>
        <div style={styles.compactGrid}>
          <div style={styles.cell}>
            <span style={styles.label}>CAM</span>
            <span ref={camPosRef} data-testid="cam-pos" style={styles.value}>0.0, 0.0</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>LOOK</span>
            <span ref={camLookRef} data-testid="cam-lookahead" style={{ ...styles.value, color: '#FACC15' }}>+0px (+0.00t)</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>SCR X/Y</span>
            <span ref={camScreenRef} data-testid="cam-screen-xy" style={styles.value}>50% / 35%</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>KIT</span>
            <span ref={kitStatsRef} style={{ ...styles.value, color: '#FEF08A' }}>0c · 0b</span>
          </div>
        </div>
        <div style={styles.badgeRow}>
          <span ref={camCalmBadgeRef} data-testid="badge-cam-calm" style={styles.forgivenessBadge}>DEADZN</span>
          <span ref={camClampBadgeRef} data-testid="badge-cam-clamp" style={styles.forgivenessBadge}>SNAP</span>
          <span ref={camFastFallBadgeRef} data-testid="badge-cam-ffall" style={styles.forgivenessBadge}>FALL+120</span>
          <span ref={camVignetteBadgeRef} data-testid="badge-cam-fov" style={styles.forgivenessBadge}>Z 0.925</span>
        </div>
        <div
          ref={lintBadgeRef}
          data-testid="geometry-lint-badge"
          style={{ ...styles.forgivenessBadge, marginTop: 3, padding: '2px 6px' }}
        >
          LINT PASS · 0 ERR
        </div>
      </div>

      {/* Stage 8 3D Rig & Character Section */}
      <div style={styles.jumpSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={styles.subHeader}>3D RIG & CHARACTER</span>
          <span ref={rigCharRef} data-testid="telemetry-character" style={{ ...styles.value, fontSize: 10, color: '#F87171' }}>MARIO</span>
        </div>
        <div style={styles.compactGrid}>
          <div style={styles.cell}>
            <span style={styles.label}>CLIP</span>
            <span ref={rigClipRef} data-testid="telemetry-clip" style={{ ...styles.value, color: '#38BDF8' }}>Idle</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>SY / VOL</span>
            <span ref={rigSquashRef} data-testid="telemetry-squash" style={styles.value}>1.00 / 1.00</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>YAW</span>
            <span ref={rigYawRef} data-testid="telemetry-yaw" style={styles.value}>70°</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>FORM</span>
            <span ref={formRef} data-testid="telemetry-form" style={{ ...styles.value, color: '#FB923C' }}>SMALL</span>
          </div>
        </div>
      </div>

      {/* Stage 10 Feel Preset & Performance Monitor */}
      <div style={styles.jumpSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={styles.subHeader}>STAGE 10 · PRESET & PERF</span>
          <span ref={presetRef} data-testid="telemetry-preset" style={{ ...styles.value, fontSize: 9.5, color: '#4ADE80' }}>WONDER</span>
        </div>
        <div style={styles.compactGrid}>
          <div style={styles.cell}>
            <span style={styles.label}>DRAWS</span>
            <span ref={drawsRef} data-testid="telemetry-draws" style={styles.value}>0 GL</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>HEAP</span>
            <span ref={heapRef} data-testid="telemetry-heap" style={styles.value}>N/A</span>
          </div>
        </div>
      </div>

      {/* Stage 20 Multi-Sensory Juice Telemetry */}
      <div style={styles.jumpSection}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={styles.subHeader}>STAGE 20 · JUICE ENGINE</span>
          <span ref={juiceBufferRef} data-testid="telemetry-juice-buffer" style={{ ...styles.value, fontSize: 9.5, color: '#38BDF8' }}>0 cap</span>
        </div>
        <div style={styles.compactGrid}>
          <div style={styles.cell}>
            <span style={styles.label}>HITSTOP</span>
            <span ref={juiceHitstopRef} data-testid="telemetry-juice-hitstop" style={{ ...styles.value, color: '#FACC15' }}>0f · none</span>
          </div>
          <div style={styles.cell}>
            <span style={styles.label}>POOL</span>
            <span ref={juiceParticlesRef} data-testid="telemetry-juice-particles" style={{ ...styles.value, color: '#4ADE80' }}>0 / 256</span>
          </div>
        </div>
        <div style={styles.row}>
          <span style={styles.label}>TRAUMA T²</span>
          <span ref={juiceTraumaRef} data-testid="telemetry-juice-trauma" style={{ ...styles.value, color: '#FB7185' }}>0.00 (+0.0,+0.0px)</span>
        </div>
      </div>
    </aside>
  );
}

function drawGraph(canvas, data, currentIdx, color, label, maxVal) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(5, 8, 22, 0.72)';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.75;
  ctx.beginPath();
  for (let i = 0; i < GRAPH_FRAMES; i++) {
    const dataIdx = (currentIdx - GRAPH_FRAMES + i + GRAPH_FRAMES * 100) % GRAPH_FRAMES;
    const val = data[dataIdx] || 0;
    const clamped = Math.max(-maxVal, Math.min(maxVal, val));
    const x = (i / (GRAPH_FRAMES - 1)) * w;
    const y = h / 2 - (clamped / maxVal) * (h / 2 - 4);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.font = 'bold 9px "JetBrains Mono", monospace';
  ctx.fillText(label, 5, 10);
}

function drawJumpArc(canvas, metrics, standingRef, sprintRef) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const maxT = 1.0;
  const maxY = 5.4;
  const padY = 4;

  const toX = (t) => Math.max(0, Math.min(w, (t / maxT) * (w - 8) + 4));
  const toY = (dy) => h - padY - (Math.max(0, Math.min(maxY, dy)) / maxY) * (h - padY * 2);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(5, 8, 22, 0.78)';
  ctx.fillRect(0, 0, w, h);

  // Horizontal height guides (2t and 4.10t)
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1;
  for (const hVal of [2.0, 4.1]) {
    const gy = toY(hVal);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  // Reference curves: dashed Sprint (amber) & Standing (cyan)
  const plotCurve = (pts, color, dashed, width) => {
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const px = toX(pts[i].t);
      const py = toY(pts[i].dy);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  };

  plotCurve(sprintRef, 'rgba(245, 158, 11, 0.35)', true, 1.25);
  plotCurve(standingRef, 'rgba(56, 189, 248, 0.45)', true, 1.25);

  // Actual live / last jump curve
  if (metrics?.samples?.length >= 2) {
    plotCurve(metrics.samples, '#4ADE80', false, 2.0);
    if (metrics.peakHeight > 0.05) {
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(toX(metrics.timeToApex), toY(metrics.peakHeight), 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#94A3B8';
  ctx.font = 'bold 9px "JetBrains Mono", monospace';
  ctx.fillText('ARC dy/t (ref 4.1t / 4.9t)', 5, 10);
}

const styles = {
  container: {
    position: 'absolute',
    top: 58,
    left: 12,
    background: 'rgba(10, 14, 34, 0.90)',
    border: '1px solid rgba(110, 180, 255, 0.28)',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
    borderRadius: 10,
    padding: '7px 10px',
    color: '#E2E8F0',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    fontSize: 10,
    fontVariantNumeric: 'tabular-nums',
    width: 282,
    maxWidth: 'calc(100vw - 24px)',
    maxHeight: 'calc(100dvh - 126px)',
    overflowY: 'auto',
    zIndex: 1000,
    pointerEvents: 'auto',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingBottom: 3,
    borderBottom: '1px solid rgba(110, 180, 255, 0.16)',
  },
  title: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#38BDF8',
    letterSpacing: 1.4,
  },
  fpsBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4ADE80',
  },
  compactGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px 10px',
    marginBottom: 3,
  },
  cell: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    color: '#94A3B8',
    marginRight: 4,
  },
  value: {
    color: '#F8FAFC',
    fontWeight: 'bold',
  },
  graph: {
    display: 'block',
    marginBottom: 3,
    borderRadius: 4,
    border: '1px solid rgba(110, 180, 255, 0.18)',
  },
  jumpSection: {
    marginTop: 4,
    paddingTop: 4,
    borderTop: '1px solid rgba(110, 180, 255, 0.16)',
  },
  subHeader: {
    fontSize: 9.5,
    fontWeight: 'bold',
    color: '#FACC15',
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2px 10px',
    marginBottom: 4,
  },
  metricCell: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  metricKicker: {
    fontSize: 9,
    color: '#94A3B8',
  },
  metricVal: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4ADE80',
  },
  badgeRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 4,
    marginTop: 2,
  },
  acroRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 4,
    marginTop: 3,
  },
  forgivenessBadge: {
    textAlign: 'center',
    fontSize: 8.5,
    fontWeight: 700,
    padding: '2px 2px',
    whiteSpace: 'nowrap',
    borderRadius: 4,
    border: '1px solid rgba(71, 85, 105, 0.35)',
    background: 'rgba(15, 23, 42, 0.55)',
    color: '#475569',
    letterSpacing: 0.3,
  },
  layoutRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 4,
    marginTop: 4,
    pointerEvents: 'auto',
  },
  layoutBtn: {
    padding: '3px 4px',
    borderRadius: 4,
    border: '1px solid rgba(148, 163, 184, 0.25)',
    background: 'rgba(15, 23, 42, 0.85)',
    color: '#94A3B8',
    fontFamily: 'inherit',
    fontSize: 9,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  layoutBtnActive: {
    padding: '3px 4px',
    borderRadius: 4,
    border: '1px solid #0084FF',
    background: 'rgba(0, 132, 255, 0.35)',
    color: '#F8FAFC',
    fontFamily: 'inherit',
    fontSize: 9,
    fontWeight: 700,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
};

export default TelemetryHUD;
