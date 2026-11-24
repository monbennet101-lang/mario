/**
 * VerificationReportModal — Stage 10 Automated Acceptance Scorecard ([F7])
 * =========================================================================
 * One-click verification modal running all deterministic kinematic probes,
 * GeometryLint parity across 8 rooms, preset zero-reset checks, and the full
 * end-to-end Gauntlet (Sections A–I) replay clear with zero desync.
 */

import React, { useEffect, useState } from 'react';
import {
  buildPrototypeReportMarkdown,
  runAllGauntletChecks,
} from '@game/verification/GauntletVerifier';

function VerificationReportModal({ visible, engine, onClose }) {
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);

  const executeChecks = () => {
    setCopied(false);
    const res = runAllGauntletChecks();
    setReport(res);
  };

  useEffect(() => {
    if (!visible) return;
    executeChecks();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const fps = engine?.loop?.fps?.toFixed(1) ?? '60.0';
  const draws = engine?.renderer?.rig3D?.telemetry?.drawCalls ?? 0;
  const drift = engine?.loop?.simDriftMs?.toFixed(2) ?? '0.00';
  const heapMb = typeof performance !== 'undefined' && performance.memory
    ? `${(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)} MB`
    : 'N/A';

  const handleCopyReport = async () => {
    if (!report) return;
    const md = buildPrototypeReportMarkdown(report);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      console.info(md);
      setCopied(true);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Automated Verification Report Card"
      data-testid="verification-report-modal"
      style={styles.overlay}
      onClick={onClose}
    >
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>BENCHMARK VERIFICATION REPORT CARD</h2>
            <div style={styles.subtitle}>
              60 Hz Headless Kinematics · Visual-Collision Lint · Full Gauntlet Replay (A–I)
            </div>
          </div>
          <div style={styles.headerActions}>
            <button
              type="button"
              data-testid="rerun-verification-btn"
              onClick={executeChecks}
              style={styles.actionBtn}
            >
              ↻ Re-Run
            </button>
            <button
              type="button"
              onClick={handleCopyReport}
              style={styles.actionBtn}
            >
              {copied ? '✓ Copied MD' : 'Copy Report'}
            </button>
            <button
              type="button"
              aria-label="Close Verification Report"
              onClick={onClose}
              style={styles.closeBtn}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Summary Banner */}
        {report && (
          <div
            data-testid="verification-summary-banner"
            style={{
              ...styles.summaryBanner,
              borderColor: report.allPassed ? '#4ADE80' : '#F87171',
              background: report.allPassed ? 'rgba(20, 83, 45, 0.45)' : 'rgba(127, 29, 29, 0.45)',
            }}
          >
            <span
              style={{
                fontWeight: 900,
                fontSize: 13,
                color: report.allPassed ? '#4ADE80' : '#FCA5A5',
              }}
            >
              {report.allPassed ? 'ALL EXIT CRITERIA PASSED' : 'VERIFICATION DEFECT DETECTED'} · {report.passedCount}/{report.totalCount}
            </span>
            <span style={styles.perfRow}>
              FPS: <b>{fps}</b> · WebGL Draws: <b>{draws}</b> · Heap: <b>{heapMb}</b> · Drift: <b>{drift}ms</b>
            </span>
          </div>
        )}

        {/* Scorecard Table */}
        <div style={styles.list}>
          {report?.checks?.map((chk) => (
            <div
              key={chk.id}
              data-testid={`verify-row-${chk.id}`}
              data-passed={chk.passed ? 'true' : 'false'}
              style={styles.row}
            >
              <span
                style={{
                  ...styles.statusBadge,
                  background: chk.passed ? 'rgba(22, 163, 74, 0.28)' : 'rgba(185, 28, 28, 0.35)',
                  borderColor: chk.passed ? '#4ADE80' : '#F87171',
                  color: chk.passed ? '#4ADE80' : '#FCA5A5',
                }}
              >
                {chk.passed ? '✓ PASS' : '✕ FAIL'}
              </span>
              <span style={styles.checkName}>{chk.name}</span>
              <span style={styles.targetCol}>{chk.target}</span>
              <span style={styles.measuredCol}>{chk.measured}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(4, 6, 18, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2100,
  },
  card: {
    background: 'rgba(10, 14, 34, 0.97)',
    border: '1px solid rgba(56, 189, 248, 0.42)',
    boxShadow: '0 24px 60px rgba(0, 0, 0, 0.72)',
    borderRadius: 14,
    padding: '16px 20px',
    width: '92%',
    maxWidth: 780,
    maxHeight: '86vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"JetBrains Mono", monospace',
    color: '#E2E8F0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1.3,
    color: '#38BDF8',
  },
  subtitle: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  headerActions: {
    display: 'flex',
    gap: 6,
    flexShrink: 0,
  },
  actionBtn: {
    background: 'rgba(14, 116, 144, 0.85)',
    border: '1px solid #38BDF8',
    borderRadius: 6,
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: 700,
    fontFamily: 'inherit',
    padding: '5px 10px',
    cursor: 'pointer',
  },
  closeBtn: {
    background: 'rgba(30, 41, 59, 0.9)',
    border: '1px solid rgba(148, 163, 184, 0.35)',
    borderRadius: 6,
    color: '#E2E8F0',
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 10px',
  },
  summaryBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#4ADE80',
    marginBottom: 10,
  },
  perfRow: {
    fontSize: 10.5,
    color: '#CBD5E1',
  },
  list: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '74px 1.3fr 1fr 1.15fr',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 6,
    background: 'rgba(15, 23, 42, 0.82)',
    border: '1px solid rgba(71, 85, 105, 0.35)',
    fontSize: 11,
  },
  statusBadge: {
    textAlign: 'center',
    fontSize: 10,
    fontWeight: 800,
    padding: '2px 4px',
    borderRadius: 4,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#4ADE80',
  },
  checkName: {
    fontWeight: 700,
    color: '#F8FAFC',
  },
  targetCol: {
    color: '#94A3B8',
    fontSize: 10.5,
  },
  measuredCol: {
    color: '#38BDF8',
    fontSize: 10.5,
    textAlign: 'right',
    fontWeight: 700,
  },
};

export default VerificationReportModal;
