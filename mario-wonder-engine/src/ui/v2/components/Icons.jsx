/**
 * Clean-Room Original Vector Icons (`src/ui/v2/components/Icons.jsx`)
 * ====================================================================
 * Every icon uses semantic CSS design tokens (`var(--ui-color-*)`) and
 * unitless SVG viewBox coordinates. Zero raw hex, pixel, or millisecond literals.
 */

import React from 'react';

export function GoldShardIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width="100%" height="100%" aria-hidden="true">
      <polygon
        points="12,2 21,12 12,22 3,12"
        fill="var(--ui-color-gold)"
        stroke="var(--ui-color-outline)"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <polygon points="12,4 12,20 5.5,12" fill="var(--ui-color-gold-light)" />
      <polygon points="12,7.5 15.5,12 12,16.5 8.5,12" fill="var(--ui-color-white)" />
    </svg>
  );
}

export function PrismPetalIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width="100%" height="100%" aria-hidden="true">
      <path
        d="M12 2.5 L15.2 8.2 L21.5 9.2 L16.8 13.8 L18 20.5 L12 17.2 L6 20.5 L7.2 13.8 L2.5 9.2 L8.8 8.2 Z"
        fill="var(--ui-color-purple)"
        stroke="var(--ui-color-outline)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.4" fill="var(--ui-color-purple-light)" stroke="var(--ui-color-outline)" strokeWidth="1.4" />
    </svg>
  );
}

export function StarMedallionIcon({ slotState = 'empty', className = '' }) {
  const fillColor =
    slotState === 'collected'
      ? 'var(--ui-color-gold)'
      : slotState === 'ghosted'
        ? 'var(--ui-color-gold-light)'
        : 'var(--ui-color-surface-raised)';
  const strokeColor =
    slotState === 'empty' ? 'var(--ui-color-disabled-fg)' : 'var(--ui-color-outline)';
  return (
    <svg viewBox="0 0 24 24" className={className} width="76%" height="76%" aria-hidden="true">
      <polygon
        points="12,2 15.1,8.3 22,9.2 17,14.1 18.2,21 12,17.7 5.8,21 7,14.1 2,9.2 8.9,8.3"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {slotState === 'collected' && (
        <circle cx="12" cy="12" r="2.6" fill="var(--ui-color-white)" />
      )}
    </svg>
  );
}

export function RunnerPortraitIcon({ emblem = 'visor', colorToken = 'var(--ui-color-red)', accentToken = 'var(--ui-color-red-light)' }) {
  return (
    <svg viewBox="0 0 24 24" width="84%" height="84%" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={colorToken} stroke="var(--ui-color-outline)" strokeWidth="2" />
      {emblem === 'visor' && (
        <>
          <path d="M5.5 11.5 C7 7.5 17 7.5 18.5 11.5 Z" fill={accentToken} stroke="var(--ui-color-outline)" strokeWidth="1.4" />
          <circle cx="9.2" cy="14" r="1.4" fill="var(--ui-color-white)" />
          <circle cx="14.8" cy="14" r="1.4" fill="var(--ui-color-white)" />
        </>
      )}
      {emblem === 'wing' && (
        <>
          <path d="M5 13 L12 6.5 L19 13 L12 11 Z" fill={accentToken} stroke="var(--ui-color-outline)" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="9.5" cy="15" r="1.4" fill="var(--ui-color-white)" />
          <circle cx="14.5" cy="15" r="1.4" fill="var(--ui-color-white)" />
        </>
      )}
      {emblem === 'flare' && (
        <>
          <polygon points="12,5 16.5,12 12,17.5 7.5,12" fill={accentToken} stroke="var(--ui-color-outline)" strokeWidth="1.4" />
          <circle cx="12" cy="11.5" r="2" fill="var(--ui-color-white)" />
        </>
      )}
      {emblem === 'wave' && (
        <>
          <path d="M5.5 13 Q9 8 12 12 T18.5 11.5" fill="none" stroke={accentToken} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="9.5" cy="15.2" r="1.3" fill="var(--ui-color-white)" />
          <circle cx="14.5" cy="15.2" r="1.3" fill="var(--ui-color-white)" />
        </>
      )}
    </svg>
  );
}

export function ClockIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} width="100%" height="100%" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" fill="var(--ui-color-surface-raised)" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 6.8 V12.2 L16 14.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ReserveItemIcon({ item = null }) {
  if (!item) {
    return (
      <svg viewBox="0 0 24 24" width="60%" height="60%" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="var(--ui-color-disabled-fg)" strokeWidth="2" strokeDasharray="3 3" />
      </svg>
    );
  }
  if (item === 'flame_orb') {
    return (
      <svg viewBox="0 0 24 24" width="72%" height="72%" aria-hidden="true">
        <circle cx="12" cy="13" r="8" fill="var(--ui-color-red)" stroke="var(--ui-color-outline)" strokeWidth="2" />
        <path d="M12 4 C15 8 16.5 10.5 16.5 13.2 A4.5 4.5 0 0 1 7.5 13.2 C7.5 10.5 9 8 12 4 Z" fill="var(--ui-color-gold)" />
        <circle cx="12" cy="14" r="2.2" fill="var(--ui-color-white)" />
      </svg>
    );
  }
  if (item === 'life_up') {
    return (
      <svg viewBox="0 0 24 24" width="72%" height="72%" aria-hidden="true">
        <path
          d="M12 20.5 L4.5 13.2 A4.6 4.6 0 0 1 11 6.7 L12 7.8 L13 6.7 A4.6 4.6 0 0 1 19.5 13.2 Z"
          fill="var(--ui-color-green)"
          stroke="var(--ui-color-outline)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M12 9.5 V15.5 M9 12.5 H15" stroke="var(--ui-color-white)" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="72%" height="72%" aria-hidden="true">
      <polygon
        points="12,2.5 20.5,8.5 17.5,20 6.5,20 3.5,8.5"
        fill="var(--ui-color-blue)"
        stroke="var(--ui-color-outline)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.4" fill="var(--ui-color-white)" />
    </svg>
  );
}

export function CharmIcon({ icon = 'feather' }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--ui-color-purple-deep)" stroke="var(--ui-color-outline)" strokeWidth="2" />
      {icon === 'feather' && (
        <path d="M7 17 C8 10 13 6 18 6 C17 11 14 15 7 17 Z" fill="var(--ui-color-blue-light)" stroke="var(--ui-color-outline)" strokeWidth="1.4" />
      )}
      {icon === 'magnet' && (
        <path d="M7 7 V13 A5 5 0 0 0 17 13 V7" fill="none" stroke="var(--ui-color-gold)" strokeWidth="3" strokeLinecap="round" />
      )}
      {icon === 'cushion' && (
        <path d="M6 15 Q12 7 18 15 Z" fill="var(--ui-color-green-light)" stroke="var(--ui-color-outline)" strokeWidth="1.4" />
      )}
      {icon === 'surge' && (
        <polygon points="13,4 6,13 11.5,13 10.5,20 18,10.5 12.5,10.5" fill="var(--ui-color-gold)" stroke="var(--ui-color-outline)" strokeWidth="1.2" />
      )}
      {(icon === 'super_core' || icon === 'flame_orb' || icon === 'life_up') && (
        <circle cx="12" cy="12" r="5" fill="var(--ui-color-gold)" stroke="var(--ui-color-outline)" strokeWidth="1.5" />
      )}
    </svg>
  );
}

export function CrownIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M3 18 L5 7 L10 12 L12 5 L14 12 L19 7 L21 18 Z"
        fill="var(--ui-color-gold)"
        stroke="var(--ui-color-outline)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="3" fill="var(--ui-color-disabled-fg)" stroke="var(--ui-color-outline)" strokeWidth="2" />
      <path d="M8.5 10 V7.5 A3.5 3.5 0 0 1 15.5 7.5 V10" fill="none" stroke="var(--ui-color-muted)" strokeWidth="2.2" />
    </svg>
  );
}

export function CheckFlagIcon({ perfect = false }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M6 3 V21" stroke="var(--ui-color-white)" strokeWidth="2.4" strokeLinecap="round" />
      <path
        d="M6 4 L19 8.5 L6 13 Z"
        fill={perfect ? 'var(--ui-color-gold)' : 'var(--ui-color-green)'}
        stroke="var(--ui-color-outline)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Concept-Specific Flourish Emblem: The Prism Crest
 * Rendered ONLY on Title, World Map, and Results screens (zero ornament in HUD).
 */
export function PrismCrestEmblem({ size = 54 }) {
  return (
    <span className="ui-v2-prism-crest" aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <polygon
          points="32,4 58,32 32,60 6,32"
          fill="var(--ui-color-gold)"
          stroke="var(--ui-color-outline)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <polygon points="32,8 54,32 32,32" fill="var(--ui-color-blue)" />
        <polygon points="32,8 10,32 32,32" fill="var(--ui-color-gold-light)" />
        <polygon points="32,56 54,32 32,32" fill="var(--ui-color-purple)" />
        <polygon points="32,56 10,32 32,32" fill="var(--ui-color-green)" />
        <polygon
          points="32,19 45,32 32,45 19,32"
          fill="var(--ui-color-white)"
          stroke="var(--ui-color-outline)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
