/**
 * LevelAuditModal — Stage 17 10-Point Nintendo Level Design Audit ([F9])
 * =======================================================================
 * Runs the headless 10-Point Architectural Audit from NINTENDO_LEVEL_DESIGN_WISDOM.md
 * against the active Kishōtenketsu course (or Water Spout Beach fallback), surfacing:
 *   - 10/10 Pass Banner & 3-word Level Concept
 *   - Act 1 (Ki) Zero-Pit Safety Proof
 *   - Miyamoto Floor (<= 4.50 t/s) vs. Ceiling (>= 9.20 t/s) Route Metrics
 *   - Transcendental Physics Invariance (0 diffs before/after Twist)
 *   - Detailed 10-row Axiom Audit table
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  createWaterSpoutBeach,
  runTenPointNintendoAudit,
} from '../../level/levelEngine.js';

function LevelAuditModal({ visible, engine, onClose }) {
  const [audit, setAudit] = useState(null);

  const runAudit = useCallback(() => {
    const targetRoom = engine?.currentRoom?.isKishotenketsu
      ? engine.currentRoom
      : createWaterSpoutBeach();
    const result = runTenPointNintendoAudit(targetRoom);
    setAudit(result);
  }, [engine]);

  useEffect(() => {
    if (!visible) return;
    runAudit();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose, runAudit]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="10-Point Craft Level Design Audit"
      data-testid="level-audit-modal"
      style={styles.overlay}
      onClick={onClose}
    >
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>10-POINT CRAFT LEVEL DESIGN AUDIT</h2>
            <div style={styles.subtitle}>
              Transcendental Invariance · 4-Act Kishōtenketsu · Dual-Skill Routing (Axioms 1–5)
            </div>
          </div>
          <div style={styles.headerActions}>
            <button
              type="button"
              tabIndex={-1}
              data-testid="rerun-level-audit-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                runAudit();
              }}
              style={styles.actionBtn}
            >
              ↻ Re-Audit
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close Level Audit"
              data-testid="close-level-audit-btn"
              onClick={(e) => {
                e.currentTarget.blur();
                onClose();
              }}
              style={styles.closeBtn}
            >
              ✕
            </button>
          </div>
        </div>

        {audit && (
          <>
            {/* Score Banner */}
            <div
              data-testid="level-audit-summary"
              style={{
                ...styles.summaryBanner,
                borderColor: audit.passed ? '#4ADE80' : '#F87171',
                background: audit.passed
                  ? 'rgba(20, 83, 45, 0.50)'
                  : 'rgba(127, 29, 29, 0.50)',
              }}
            >
              <div style={styles.bannerLeft}>
                <span
                  data-testid="level-audit-score"
                  style={{
                    fontWeight: 900,
                    fontSize: 14,
                    color: audit.passed ? '#4ADE80' : '#FCA5A5',
                    letterSpacing: 1.1,
                  }}
                >
                  {audit.passed
                    ? `✓ ${audit.score}/${audit.maxScore} ARCHITECTURAL AUDIT PASSED`
                    : `✕ ${audit.score}/${audit.maxScore} AUDIT DEFECTS FOUND`}
                </span>
                <span style={styles.conceptTag}>
                  Concept: “{audit.conceptThreeWords}” · {audit.levelTitle}
                </span>
              </div>
              <span style={styles.invariancePill}>
                Physics Drift: {audit.invarianceAudit?.diffs?.length ?? 0} diffs
              </span>
            </div>

            {/* Key Metric Strip */}
            <div style={styles.metricStrip}>
              <div style={styles.metricBox}>
                <span style={styles.metricKicker}>ACT 1 (KI) PITS</span>
                <span
                  style={{
                    ...styles.metricValue,
                    color: audit.act1Audit?.passed ? '#4ADE80' : '#F87171',
                  }}
                >
                  {audit.act1Audit?.pitCount ?? 0} Pits · {audit.act1Audit?.hazardCount ?? 0} Hazards
                </span>
              </div>
              <div style={styles.metricBox}>
                <span style={styles.metricKicker}>FLOOR ROUTE (≤ 4.50 t/s)</span>
                <span
                  style={{
                    ...styles.metricValue,
                    color: audit.floorAudit?.passed ? '#38BDF8' : '#F87171',
                  }}
                >
                  {audit.floorAudit?.segmentCount ?? 0} segs · max {audit.floorAudit?.maxGap ?? 0}t gap
                </span>
              </div>
              <div style={styles.metricBox}>
                <span style={styles.metricKicker}>CEILING ROUTE (≥ 9.20 t/s)</span>
                <span
                  style={{
                    ...styles.metricValue,
                    color: audit.ceilingAudit?.passed ? '#FACC15' : '#F87171',
                  }}
                >
                  {audit.ceilingAudit?.segmentCount ?? 0} segs · {audit.ceilingAudit?.sprintOnlyGaps ?? 0} sprint leaps
                </span>
              </div>
            </div>

            {/* 10-Point Checklist Table */}
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 62 }}>STATUS</th>
                    <th style={styles.th}>ARCHITECTURAL CHECK</th>
                    <th style={{ ...styles.th, width: 112 }}>AXIOM</th>
                    <th style={styles.th}>TARGET</th>
                    <th style={styles.th}>MEASURED</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.checks.map((chk) => (
                    <tr key={chk.id} style={styles.tr}>
                      <td style={styles.td}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            color: chk.passed ? '#4ADE80' : '#FCA5A5',
                            borderColor: chk.passed
                              ? 'rgba(74, 222, 128, 0.55)'
                              : 'rgba(248, 113, 113, 0.55)',
                            background: chk.passed
                              ? 'rgba(20, 83, 45, 0.55)'
                              : 'rgba(127, 29, 29, 0.55)',
                          }}
                        >
                          {chk.passed ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                      <td style={{ ...styles.td, color: '#F8FAFC', fontWeight: 700 }}>
                        {chk.name}
                      </td>
                      <td style={{ ...styles.td, color: '#38BDF8' }}>{chk.axiom}</td>
                      <td style={{ ...styles.td, color: '#94A3B8' }}>{chk.target}</td>
                      <td style={{ ...styles.td, color: '#E2E8F0' }}>{chk.measured}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(4, 7, 20, 0.78)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2100,
    padding: 16,
  },
  card: {
    width: 'min(960px, 95vw)',
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    background: 'rgba(10, 15, 36, 0.98)',
    border: '1px solid rgba(56, 189, 248, 0.45)',
    borderRadius: 14,
    padding: '16px 20px',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.72)',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
    color: '#E2E8F0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 900,
    letterSpacing: 1.4,
    color: '#38BDF8',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 10.5,
    color: '#94A3B8',
    letterSpacing: 0.4,
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  actionBtn: {
    background: 'rgba(14, 116, 144, 0.35)',
    border: '1px solid rgba(56, 189, 248, 0.55)',
    borderRadius: 7,
    color: '#E0F2FE',
    fontSize: 11,
    fontWeight: 700,
    padding: '5px 11px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  closeBtn: {
    background: 'rgba(30, 41, 59, 0.9)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 7,
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: 700,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  summaryBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 10,
    border: '1px solid #4ADE80',
  },
  bannerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  conceptTag: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  invariancePill: {
    fontSize: 11,
    fontWeight: 800,
    color: '#FEF08A',
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(250, 204, 21, 0.45)',
    borderRadius: 6,
    padding: '4px 9px',
  },
  metricStrip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 8,
  },
  metricBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '8px 11px',
    borderRadius: 8,
    background: 'rgba(15, 23, 42, 0.85)',
    border: '1px solid rgba(148, 163, 184, 0.22)',
  },
  metricKicker: {
    fontSize: 9,
    fontWeight: 700,
    color: '#94A3B8',
    letterSpacing: 0.9,
  },
  metricValue: {
    fontSize: 11.5,
    fontWeight: 800,
  },
  tableWrap: {
    overflowY: 'auto',
    borderRadius: 9,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(7, 11, 28, 0.90)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 11,
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    fontSize: 9.5,
    fontWeight: 800,
    letterSpacing: 0.9,
    color: '#94A3B8',
    background: 'rgba(15, 23, 42, 0.96)',
    borderBottom: '1px solid rgba(148, 163, 184, 0.22)',
    position: 'sticky',
    top: 0,
  },
  tr: {
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  },
  td: {
    padding: '7px 10px',
    verticalAlign: 'middle',
    lineHeight: 1.35,
  },
  statusBadge: {
    display: 'inline-block',
    fontSize: 9.5,
    fontWeight: 900,
    letterSpacing: 0.8,
    padding: '2px 6px',
    borderRadius: 5,
    border: '1px solid',
  },
};

export default LevelAuditModal;
