/**
 * TuningPanel — Collapsible Live Tuning Panel (lil-gui)
 * =======================================================
 * Organized folders for Locomotion, Jump, Forgiveness, Presentation,
 * and Hitbox/Input. Two-way live sliders mutating MovementProfile.js,
 * plus Reset to Defaults and Export Config to Clipboard actions.
 */

import React, { useEffect, useRef, useState } from 'react';
import GUI from 'lil-gui';
import MovementProfile, { resetMovementProfile } from '@game/config/MovementProfile';

function TuningPanelBody({ defaultCollapsed = true, engine = null, characterId = 'mario', feelPresetId = 'wonder' }) {
  const hostRef = useRef(null);
  const guiRef = useRef(null);
  const controllersRef = useRef([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const gui = new GUI({
      container,
      title: 'MovementProfile Tuning',
      width: 280,
    });
    guiRef.current = gui;

    const controllers = [];
    const addSlider = (folder, target, key, min, max, step, label) => {
      const ctrl = folder.add(target, key, min, max, step);
      if (label) ctrl.name(label);
      controllers.push(ctrl);
      return ctrl;
    };

    // ── Locomotion Folder ──
    const fLocomotion = gui.addFolder('Locomotion');
    addSlider(fLocomotion, MovementProfile.locomotion, 'walkTopSpeed', 1.0, 12.0, 0.05, 'Walk Top Speed');
    addSlider(fLocomotion, MovementProfile.locomotion, 'runTopSpeed', 2.0, 18.0, 0.05, 'Run Top Speed');
    addSlider(fLocomotion, MovementProfile.locomotion, 'startImpulse', 0.0, 4.0, 0.05, 'Frame-1 Pop');
    addSlider(fLocomotion, MovementProfile.locomotion, 'groundAccel', 4.0, 45.0, 0.5, 'Ground Accel');
    addSlider(fLocomotion, MovementProfile.locomotion, 'lowSpeedAccelBoost', 0.0, 0.6, 0.02, 'Low Accel Boost');
    addSlider(fLocomotion, MovementProfile.locomotion, 'groundFriction', 4.0, 45.0, 0.5, 'Release Friction');
    addSlider(fLocomotion, MovementProfile.locomotion, 'stopThreshold', 0.05, 1.0, 0.05, 'Stop Threshold');
    addSlider(fLocomotion, MovementProfile.skid, 'threshold', 1.0, 9.0, 0.1, 'Skid Threshold');
    addSlider(fLocomotion, MovementProfile.skid, 'decel', 10.0, 80.0, 0.5, 'Skid Decel');
    addSlider(fLocomotion, MovementProfile.skid, 'pivotAccelMultiplier', 1.0, 6.0, 0.25, 'Pivot Accel ×');
    addSlider(fLocomotion, MovementProfile.skid, 'pivotFrames', 1, 10, 1, 'Pivot Frames');
    addSlider(fLocomotion, MovementProfile.crouch, 'flatSlideDecel', 5.0, 30.0, 0.5, 'Crouch Slide Decel');

    // ── Jump Folder ──
    const fJump = gui.addFolder('Jump');
    addSlider(fJump, MovementProfile.jump, 'apexHeight', 1.5, 8.0, 0.05, 'Apex Height');
    addSlider(fJump, MovementProfile.jump, 'timeToApex', 0.15, 0.90, 0.01, 'Time to Apex');
    addSlider(fJump, MovementProfile.jump, 'launchVelocity', 8.0, 30.0, 0.1, 'Launch v0');
    addSlider(fJump, MovementProfile.jump, 'gravityRising', 15.0, 90.0, 0.2, 'Gravity Rising');
    addSlider(fJump, MovementProfile.jump, 'gravityFalling', 20.0, 120.0, 0.5, 'Gravity Falling');
    addSlider(fJump, MovementProfile.jump, 'terminalFallSpeed', 10.0, 40.0, 0.5, 'Terminal Fall');
    addSlider(fJump, MovementProfile.jump, 'earlyReleaseMult', 1.0, 6.0, 0.1, 'Early Cutoff ×');
    addSlider(fJump, MovementProfile.jump, 'runBoostFactor', 0.0, 0.4, 0.01, 'Run Boost');
    addSlider(fJump, MovementProfile.jump, 'comboGraceFrames', 4, 24, 1, 'Combo Window (f)');
    addSlider(fJump, MovementProfile.jump, 'doubleJumpVyMult', 1.0, 1.30, 0.01, 'DoubleJump Vy ×');
    addSlider(fJump, MovementProfile.jump, 'tripleJumpVyMult', 1.0, 1.45, 0.01, 'TripleJump Vy ×');
    addSlider(fJump, MovementProfile.jump, 'tripleJumpVxImpulse', 0.0, 2.0, 0.05, 'TripleJump Vx +');
    addSlider(fJump, MovementProfile.apexFloat, 'vyThreshold', 0.2, 4.0, 0.1, 'Apex Float |vy|');
    addSlider(fJump, MovementProfile.apexFloat, 'gravityMultiplier', 0.2, 1.0, 0.05, 'Apex Float ×');
    addSlider(fJump, MovementProfile.apexFloat, 'maxFrames', 0, 15, 1, 'Apex Float Frames');

    // ── Acrobatic Moves (Stage 4) Folder ──
    const fAcrobatics = gui.addFolder('Acrobatic Moves (Stage 4)');
    addSlider(fAcrobatics, MovementProfile.spinJump, 'launchVelocity', 12.0, 24.0, 0.1, 'SpinJump v0');
    addSlider(fAcrobatics, MovementProfile.spinJump, 'runBoostFactor', 0.0, 0.4, 0.01, 'SpinJump Run Boost');
    addSlider(fAcrobatics, MovementProfile.spinJump, 'fallGravityMult', 0.25, 1.2, 0.01, 'SpinAir Fall ×');
    addSlider(fAcrobatics, MovementProfile.spinTwirl, 'upwardImpulse', 0.0, 4.0, 0.05, 'Spin Up Impulse');
    addSlider(fAcrobatics, MovementProfile.spinTwirl, 'hoverDuration', 6, 30, 1, 'Spin Hover Frames');
    addSlider(fAcrobatics, MovementProfile.spinTwirl, 'hoverGravityMult', 0.02, 0.5, 0.02, 'Spin Gravity ×');
    addSlider(fAcrobatics, MovementProfile.wall, 'slideSpeed', 1.5, 8.0, 0.1, 'Wall Slide Speed');
    addSlider(fAcrobatics, MovementProfile.wall, 'jumpVx', 4.0, 14.0, 0.1, 'Wall Jump Vx');
    addSlider(fAcrobatics, MovementProfile.wall, 'jumpVy', 10.0, 24.0, 0.1, 'Wall Jump Vy');
    addSlider(fAcrobatics, MovementProfile.wall, 'steeringLockFrames', 0, 16, 1, 'Wall Lockout (f)');
    addSlider(fAcrobatics, MovementProfile.wall, 'coyoteFrames', 0, 12, 1, 'Wall Coyote (f)');
    addSlider(fAcrobatics, MovementProfile.groundPound, 'minClearance', 0.5, 3.0, 0.1, 'Pound Clearance');
    addSlider(fAcrobatics, MovementProfile.groundPound, 'windupFrames', 4, 20, 1, 'Pound Windup (f)');
    addSlider(fAcrobatics, MovementProfile.groundPound, 'diveSpeed', 15.0, 40.0, 0.5, 'Pound Dive Speed');
    addSlider(fAcrobatics, MovementProfile.groundPound, 'recoveryFrames', 4, 20, 1, 'Pound Recovery (f)');
    addSlider(fAcrobatics, MovementProfile.groundPound, 'screenTrauma', 0.0, 1.0, 0.05, 'Pound Trauma');
    addSlider(fAcrobatics, MovementProfile.groundPound, 'traumaDecay', 0.1, 1.0, 0.05, 'Trauma Decay (s)');

    // ── Slopes & Platforms (Stage 5) Folder ──
    const fSlopes = gui.addFolder('Slopes & Platforms (Stage 5)');
    addSlider(fSlopes, MovementProfile.slopes, 'adhesionSnapDistance', 0.05, 0.80, 0.02, 'Adhesion Snap (t)');
    addSlider(fSlopes, MovementProfile.slopes, 'buttSlideMinAngle', 5.0, 30.0, 1.0, 'Slide Min Angle (°)');
    addSlider(fSlopes, MovementProfile.slopes, 'buttSlideFrictionCoeff', 0.01, 0.25, 0.01, 'Slide Friction μ');
    addSlider(fSlopes, MovementProfile.slopes, 'buttSlideMaxSpeed', 8.0, 20.0, 0.25, 'Slide Max Speed');
    addSlider(fSlopes, MovementProfile.slopes, 'flatRunoutDecel', 4.0, 22.0, 0.2, 'Runout Decel');
    addSlider(fSlopes, MovementProfile.slopes, 'enemyDefeatMinSpeed', 2.0, 10.0, 0.25, 'Lethal Slide Speed');
    addSlider(fSlopes, MovementProfile.slopes, 'uphillSpeedMult', 0.5, 1.0, 0.02, 'Uphill Speed ×');
    addSlider(fSlopes, MovementProfile.slopes, 'downhillSpeedMult', 1.0, 1.5, 0.02, 'Downhill Speed ×');
    addSlider(fSlopes, MovementProfile.platforms, 'dropThroughFrames', 4, 24, 1, 'Drop Window (f)');

    // ── Camera Kinematics Folder ──
    const fCamera = gui.addFolder('Camera Kinematics');
    addSlider(fCamera, MovementProfile.camera, 'deadzoneWidthPx', 0, 128, 2, 'Deadzone W (px)');
    addSlider(fCamera, MovementProfile.camera, 'deadzoneHeightPx', 0, 160, 2, 'Deadzone H (px)');
    addSlider(fCamera, MovementProfile.camera, 'lookAheadVelocityGainPx', 0, 32, 0.5, 'Lead Gain (px/t·s)');
    addSlider(fCamera, MovementProfile.camera, 'lookAheadMaxPx', 0, 256, 4, 'Lead Max (px)');
    addSlider(fCamera, MovementProfile.camera, 'lookAheadAlphaNormal', 0.01, 0.25, 0.005, 'Lead α Normal');
    addSlider(fCamera, MovementProfile.camera, 'lookAheadAlphaSkid', 0.02, 0.35, 0.005, 'Lead α Skid');
    addSlider(fCamera, MovementProfile.camera, 'springTimeConstant', 0.05, 0.45, 0.01, 'Spring τ (s)');
    addSlider(fCamera, MovementProfile.camera, 'upwardJumpAlpha', 0.02, 0.25, 0.005, 'Jump Up α');
    addSlider(fCamera, MovementProfile.camera, 'fallAnticipationVy', -16.0, -2.0, 0.5, 'Fall Vy (t/s)');
    addSlider(fCamera, MovementProfile.camera, 'fallAnticipationFrames', 1, 30, 1, 'Fall Delay (f)');
    addSlider(fCamera, MovementProfile.camera, 'fallAnticipationOffsetPx', 0, 200, 4, 'Fall Look (px)');
    addSlider(fCamera, MovementProfile.camera, 'groundSnapFrames', 4, 40, 1, 'Ground Snap (f)');
    addSlider(fCamera, MovementProfile.camera, 'sprintZoomDelayFrames', 5, 60, 1, 'Zoom Delay (f)');
    addSlider(fCamera, MovementProfile.camera, 'sprintZoomTarget', 0.80, 1.00, 0.005, 'Sprint Zoom Z');
    addSlider(fCamera, MovementProfile.camera, 'sprintZoomRestoreFrames', 5, 45, 1, 'Zoom Restore (f)');
    addSlider(fCamera, MovementProfile.camera, 'fov', 20.0, 45.0, 0.5, 'Base FOV (°)');

    // ── Forgiveness Folder ──
    const fForgiveness = gui.addFolder('Forgiveness');
    addSlider(fForgiveness, MovementProfile.forgiveness, 'coyoteFrames', 0, 15, 1, 'Coyote Frames');
    addSlider(fForgiveness, MovementProfile.forgiveness, 'jumpBufferFrames', 0, 15, 1, 'Jump Buffer Frames');
    addSlider(fForgiveness, MovementProfile.forgiveness, 'ceilingCornerNudge', 0.0, 0.6, 0.01, 'Corner Nudge');
    addSlider(fForgiveness, MovementProfile.forgiveness, 'ledgeStepUp', 0.0, 0.5, 0.01, 'Ledge Step-Up');
    addSlider(fForgiveness, MovementProfile.forgiveness, 'ceilingBonkVy', -8.0, 0.0, 0.1, 'Ceiling Bonk vy');

    // ── Presentation Folder ──
    const fPresentation = gui.addFolder('Presentation');
    addSlider(fPresentation, MovementProfile.presentation, 'jumpStretchSy', 1.0, 1.6, 0.02, 'Jump Stretch Sy');
    addSlider(fPresentation, MovementProfile.presentation, 'landingSquashSy', 0.4, 1.0, 0.02, 'Landing Squash Sy');
    addSlider(fPresentation, MovementProfile.presentation, 'landingRecoveryFrames', 1, 15, 1, 'Recovery Frames');
    addSlider(fPresentation, MovementProfile.presentation, 'crouchSquashSy', 0.3, 1.0, 0.02, 'Crouch Squash Sy');
    addSlider(fPresentation, MovementProfile.presentation, 'cameraYawTilt', 0, 45, 1, '3/4 Yaw Tilt (°)');

    // ── Hitbox & Input Folder ──
    const fHitbox = gui.addFolder('Hitbox & Input');
    addSlider(fHitbox, MovementProfile.hitbox, 'width', 0.4, 1.5, 0.02, 'Width (tiles)');
    addSlider(fHitbox, MovementProfile.hitbox, 'height', 0.8, 2.5, 0.02, 'Height (tiles)');
    addSlider(fHitbox, MovementProfile.hitbox, 'foliageInset', 0.0, 0.25, 0.01, 'Foliage Inset');
    addSlider(fHitbox, MovementProfile.input, 'gamepadDeadzone', 0.05, 0.5, 0.01, 'Gamepad Deadzone');

    // ── 3D Rig & Character (Stage 8) Folder ──
    const fRig = gui.addFolder('3D Rig & Character (Stage 8)');
    addSlider(fRig, MovementProfile.stage8, 'crossFadeSec', 0.04, 0.25, 0.01, 'Clip Crossfade (s)');
    addSlider(fRig, MovementProfile.stage8, 'cameraYawTiltDeg', 0, 45, 1, '3/4 Gaze Yaw (°)');
    const rigActions = {
      swapCharacter: () => {
        if (engine?.toggleCharacter) {
          const next = engine.toggleCharacter();
          controllers.forEach((c) => c.updateDisplay());
          const nextName = MovementProfile.characters[next]?.displayName || 'Hero';
          setNotice(`Switched to ${nextName}`);
          setTimeout(() => setNotice(''), 1800);
        }
      },
    };
    const heroPairLabel = `${MovementProfile.characters.mario.displayName} / ${MovementProfile.characters.luigi.displayName}`;
    fRig.add(rigActions, 'swapCharacter').name(`Swap ${heroPairLabel} [C]`);

    // ── Combat & Power-Ups (Stage 9) Folder ──
    const fCombat = gui.addFolder('Combat & Fireball (Stage 9)');
    addSlider(fCombat, MovementProfile.combat, 'stompPassiveVy', 6.0, 16.0, 0.25, 'Stomp Passive Vy');
    addSlider(fCombat, MovementProfile.combat, 'stompActiveVy', 12.0, 22.0, 0.25, 'Stomp Active Vy');
    addSlider(fCombat, MovementProfile.combat, 'stompHitstopFrames', 0, 10, 1, 'Stomp Hitstop (f)');
    addSlider(fCombat, MovementProfile.combat, 'invulnerabilityFrames', 30, 240, 5, 'I-Frames');
    addSlider(fCombat, MovementProfile.fireball, 'speed', 8.0, 22.0, 0.5, 'Fireball Speed');
    addSlider(fCombat, MovementProfile.fireball, 'bounceRestitution', 0.4, 1.0, 0.05, 'Fire Bounce Coeff');

    // ── Enemy Gallery 1 (Sproutling & Hoplite) Folder ──
    const fGallery1 = gui.addFolder('Enemy Gallery 1');
    addSlider(fGallery1, MovementProfile.enemyGallery.sproutling, 'patrolSpeed', 0.5, 4.0, 0.05, 'Sproutling Vx');
    addSlider(fGallery1, MovementProfile.enemyGallery.sproutling, 'reboundPassiveVy', 8.0, 16.0, 0.25, 'Stomp Rebound');
    addSlider(fGallery1, MovementProfile.enemyGallery.sproutling, 'reboundActiveVy', 11.0, 20.0, 0.25, 'Held Rebound');
    addSlider(fGallery1, MovementProfile.enemyGallery.sproutling, 'squashFrames', 5, 40, 1, 'Squash Frames');
    addSlider(fGallery1, MovementProfile.enemyGallery.hoplite, 'walkSpeed', 0.4, 3.0, 0.05, 'Hoplite Walk Vx');
    addSlider(fGallery1, MovementProfile.enemyGallery.hoplite, 'shellSpeed', 6.0, 18.0, 0.25, 'Hoplite Shell Vx');
    addSlider(fGallery1, MovementProfile.enemyGallery.hoplite, 'dormancyFrames', 120, 480, 15, 'Dormancy (f)');
    addSlider(fGallery1, MovementProfile.enemyGallery.hoplite, 'wakeupTelegraphFrame', 60, 420, 15, 'Wake Shake @f');

    // ── Multi-Sensory Juice (Stage 20) Folder ──
    const fJuice = gui.addFolder('Multi-Sensory Juice (Stage 20)');
    addSlider(fJuice, MovementProfile.juice.hitstop, 'enemyStompFrames', 0, 12, 1, 'Stomp Hitstop (f)');
    addSlider(fJuice, MovementProfile.juice.hitstop, 'shellKickFrames', 0, 12, 1, 'Shell Kick Hitstop (f)');
    addSlider(fJuice, MovementProfile.juice.hitstop, 'playerDamageFrames', 0, 16, 1, 'Damage Hitstop (f)');
    addSlider(fJuice, MovementProfile.juice.hitstop, 'solidBlockBonkFrames', 0, 8, 1, 'Block Bonk Hitstop (f)');
    addSlider(fJuice, MovementProfile.juice.trauma, 'decayRatePerSec', 0.2, 4.0, 0.05, 'Trauma Decay (/s)');
    addSlider(fJuice, MovementProfile.juice.trauma, 'maxOffsetPx', 0, 32, 1, 'Max Shake (px)');
    addSlider(fJuice, MovementProfile.juice.trauma, 'heavyBlockSmash', 0.0, 1.0, 0.05, 'Block Smash +T');
    addSlider(fJuice, MovementProfile.juice.trauma, 'shellWallRebound', 0.0, 1.0, 0.05, 'Shell Rebound +T');
    addSlider(fJuice, MovementProfile.juice.trauma, 'bossGroundSlam', 0.0, 1.0, 0.05, 'Boss Slam +T');
    addSlider(fJuice, MovementProfile.juice.particles, 'groundPoundShockwaveSpeed', 2.0, 12.0, 0.25, 'Shockwave Speed (t/s)');
    const juiceActions = {
      testBossSlam: () => {
        if (engine?.juice && engine?.player) {
          engine.juice.triggerBossGroundSlam(engine.player.centerX, engine.player.pos.y);
          engine.audio?.playGroundPound?.();
          setNotice('Boss Ground Slam (+0.8 Trauma)');
          setTimeout(() => setNotice(''), 1600);
        }
      },
      testParticleStress: () => {
        if (engine?.juice && engine?.player) {
          engine.juice.particles.spawnStressBurst(engine.player.centerX, engine.player.centerY, 64);
          setNotice('Spawned 64 pooled particles (0 GC)');
          setTimeout(() => setNotice(''), 1600);
        }
      },
    };
    fJuice.add(juiceActions, 'testBossSlam').name('Trigger Boss Slam (+0.8T)');
    fJuice.add(juiceActions, 'testParticleStress').name('Spawn 64-Particle Burst');

    // ── Actions ──
    const actions = {
      resetToDefaults: () => {
        resetMovementProfile();
        controllers.forEach((c) => c.updateDisplay());
        setNotice('Reset to Wonder defaults');
        setTimeout(() => setNotice(''), 2000);
      },
      exportConfig: async () => {
        const json = JSON.stringify(MovementProfile, null, 2);
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(json);
          }
          setNotice('Copied config JSON to clipboard');
        } catch {
          setNotice('Config logged to console');
          console.info('MovementProfile JSON:\n', json);
        }
        setTimeout(() => setNotice(''), 2200);
      },
    };

    gui.add(actions, 'resetToDefaults').name('Reset to Defaults');
    gui.add(actions, 'exportConfig').name('Export Config to Clipboard');

    fLocomotion.open();
    fJump.close();
    fAcrobatics.close();
    fSlopes.close();
    fCamera.close();
    fForgiveness.close();
    fPresentation.close();
    fHitbox.close();
    fRig.close();
    fCombat.close();
    fGallery1.close();
    fJuice.close();

    controllersRef.current = controllers;

    if (defaultCollapsed) {
      gui.close();
    }

    const onGuiClick = (e) => {
      if (e.target?.tagName === 'BUTTON') {
        e.target.blur();
      }
    };
    container.addEventListener('click', onGuiClick);

    return () => {
      container.removeEventListener('click', onGuiClick);
      controllersRef.current = [];
      gui.destroy();
      guiRef.current = null;
    };
  }, [defaultCollapsed, engine]);

  useEffect(() => {
    controllersRef.current.forEach((c) => c.updateDisplay());
  }, [characterId, feelPresetId]);

  return (
    <div
      data-testid="tuning-panel"
      style={styles.wrapper}
    >
      <div ref={hostRef} />
      {notice && <div style={styles.toast}>{notice}</div>}
    </div>
  );
}

function TuningPanel({ visible, ...props }) {
  if (!visible) return null;
  return <TuningPanelBody {...props} />;
}

const styles = {
  wrapper: {
    position: 'absolute',
    top: 58,
    right: 12,
    maxWidth: 'calc(100vw - 24px)',
    zIndex: 1100,
    pointerEvents: 'auto',
    maxHeight: 'calc(100dvh - 140px)',
    overflowY: 'auto',
    borderRadius: 8,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
  },
  toast: {
    marginTop: 6,
    padding: '6px 10px',
    borderRadius: 6,
    background: 'rgba(15, 23, 42, 0.94)',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    color: '#38BDF8',
    fontSize: 11,
    fontFamily: '"JetBrains Mono", monospace',
    textAlign: 'center',
  },
};

export default TuningPanel;
