/**
 * ControllerToast — Lightweight Diegetic Gamepad Hotplug & Layout Toast
 * =======================================================================
 * Renders a crisp, WebGL-safe (zero backdrop-filter) toast notification when
 * a DualShock 4, DualSense, or standard gamepad connects, disconnects, or
 * switches layout profile. Never intercepts pointer events.
 */

import React from 'react';
import { ControllerProfile } from '@engine/input/GamepadHardware';

function ControllerToast({ toast }) {
  if (!toast || !toast.message) return null;

  const isPS = toast.profile === ControllerProfile.DUALSHOCK4;
  const isDisconnected = toast.type === 'disconnected';
  const accentColor = isDisconnected
    ? '#F59E0B'
    : isPS
      ? '#0084FF'
      : '#22C55E';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="controller-toast"
      className="mwe-controller-toast"
      style={{
        borderColor: accentColor,
      }}
    >
      <span style={styles.text}>{toast.message}</span>
    </div>
  );
}

const styles = {
  text: {
    fontSize: 12,
    fontWeight: 700,
    color: '#F8FAFC',
    letterSpacing: '0.02em',
    whiteSpace: 'nowrap',
  },
};

export default ControllerToast;
