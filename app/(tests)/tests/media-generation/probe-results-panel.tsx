'use client';

import type { ProbeImageResult, ProbeRunRecord, ProbeRunVerdict } from '@/lib/campaigns/schema';

interface Props {
    record: ProbeRunRecord;
}

const VERDICT_STYLES: Record<ProbeRunVerdict, { bg: string; text: string; label: string }> = {
    approved: { bg: '#d1fae5', text: '#065f46', label: 'APPROVED' },
    warn: { bg: '#fef3c7', text: '#92400e', label: 'WARN' },
    blocked: { bg: '#fee2e2', text: '#991b1b', label: 'BLOCKED' },
};

const PROBE_STATUS_STYLES: Record<ProbeImageResult['probeStatus'], { bg: string; text: string }> = {
    probe_pass: { bg: '#d1fae5', text: '#065f46' },
    probe_warn: { bg: '#fef3c7', text: '#92400e' },
    probe_fail: { bg: '#fee2e2', text: '#991b1b' },
};

function VerdictBadge({ verdict }: { verdict: ProbeRunVerdict }) {
    const style = VERDICT_STYLES[verdict];
    return (
        <span style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            backgroundColor: style.bg,
            color: style.text,
        }}>
            {style.label}
        </span>
    );
}

function ProbeStatusChip({ status }: { status: ProbeImageResult['probeStatus'] }) {
    const style = PROBE_STATUS_STYLES[status];
    const label = status.replace('probe_', '').toUpperCase();
    return (
        <span style={{
            display: 'inline-block',
            padding: '1px 8px',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: style.bg,
            color: style.text,
        }}>
            {label}
        </span>
    );
}

function ProbeResultRow({ result }: { result: ProbeImageResult }) {
    return (
        <div style={{
            borderBottom: '1px solid #e5e7eb',
            padding: '10px 0',
            display: 'grid',
            gridTemplateColumns: '90px 120px 60px 1fr',
            gap: 12,
            alignItems: 'start',
            fontSize: 13,
        }}>
            <div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{result.stillId}</div>
                {result.slotRole && (
                    <div style={{ color: '#6b7280', fontSize: 11, marginTop: 2 }}>{result.slotRole}</div>
                )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <ProbeStatusChip status={result.probeStatus} />
                <div style={{ color: '#374151', fontSize: 12 }}>score: {result.aiScore}/100</div>
                <div style={{ color: '#374151', fontSize: 12 }}>role: {result.roleMatchScore}/100</div>
            </div>
            <div>
                {result.imageUrl && result.imageUrl !== '' ? (
                    <a
                        href={result.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#2563eb', fontSize: 12, textDecoration: 'underline' }}
                    >
                        View
                    </a>
                ) : (
                    <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>
                )}
            </div>
            <div>
                <div style={{ color: '#374151', marginBottom: 4 }}>{result.aiReasoning}</div>
                {result.reasonCodes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {result.reasonCodes.map((code) => (
                            <span
                                key={code}
                                style={{
                                    padding: '1px 6px',
                                    borderRadius: 3,
                                    fontSize: 10,
                                    backgroundColor: '#f3f4f6',
                                    color: '#374151',
                                    fontFamily: 'monospace',
                                }}
                            >
                                {code}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export function ProbeResultsPanel({ record }: Props) {
    return (
        <div style={{ padding: '16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <VerdictBadge verdict={record.verdict} />
                <span style={{ fontSize: 13, color: '#374151' }}>{record.verdictReason}</span>
            </div>
            <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 12, color: '#6b7280' }}>
                <span>✓ {record.passCount} pass</span>
                <span>⚠ {record.warnCount} warn</span>
                <span>✗ {record.failCount} fail</span>
                <span style={{ marginLeft: 'auto' }}>
                    Run: {new Date(record.ranAt).toLocaleString()}
                </span>
            </div>
            <div style={{ borderTop: '1px solid #e5e7eb' }}>
                {record.results.map((result) => (
                    <ProbeResultRow key={result.stillId} result={result} />
                ))}
            </div>
        </div>
    );
}
