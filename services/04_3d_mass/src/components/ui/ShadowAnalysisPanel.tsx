/**
 * ShadowAnalysisPanel — 그림자 히트맵 분석 UI
 * 
 * 일조 시뮬레이션 패널 옆에 표시되는 분석 컨트롤 + 결과 패널
 */

import { useState } from 'react';
import { BarChart3, Play, Loader2, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { type ShadowAnalysisResult } from '@/components/three/ShadowAnalysis';

interface ShadowAnalysisPanelProps {
    enabled: boolean;
    analysisResult: ShadowAnalysisResult | null;
    onRunAnalysis: () => void;
    onClear: () => void;
    onToggleHeatmap: () => void;
    showHeatmap: boolean;
}

export default function ShadowAnalysisPanel({
    enabled,
    analysisResult,
    onRunAnalysis,
    onClear,
    onToggleHeatmap,
    showHeatmap,
}: ShadowAnalysisPanelProps) {
    if (!enabled) return null;

    const isRunning = analysisResult?.status === 'running';
    const isDone = analysisResult?.status === 'done';
    const progress = analysisResult?.progress ?? 0;

    return (
        <div style={{
            position: 'absolute',
            top: '12px',
            left: '380px',
            zIndex: 25,
            background: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(20px)',
            borderRadius: '14px',
            border: '1px solid rgba(148, 163, 184, 0.15)',
            padding: '14px 16px',
            minWidth: '260px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
            color: '#e2e8f0',
            fontSize: '11px',
            animation: 'fadeInDown 0.2s ease',
        }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <BarChart3 size={14} color="#34d399" />
                    <span style={{ fontWeight: 700, fontSize: '12px' }}>그림자 분석</span>
                </div>
                <button onClick={onClear} style={{
                    background: 'rgba(100, 116, 139, 0.2)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '6px',
                    width: '24px',
                    height: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)'; e.currentTarget.style.color = '#fca5a5'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(100, 116, 139, 0.2)'; e.currentTarget.style.color = '#94a3b8'; }}
                    title="패널 닫기"
                >
                    <X size={14} />
                </button>
            </div>

            {/* 분석 실행 버튼 */}
            {!isDone && (
                <button
                    onClick={onRunAnalysis}
                    disabled={isRunning}
                    style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isRunning
                            ? 'rgba(100, 116, 139, 0.3)'
                            : 'linear-gradient(135deg, #059669, #10b981)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '11px',
                        cursor: isRunning ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                    }}
                >
                    {isRunning ? (
                        <>
                            <Loader2 size={12} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                            분석 중... {Math.round(progress * 100)}%
                        </>
                    ) : (
                        <>
                            <Play size={12} />
                            동지 일조 분석 실행
                        </>
                    )}
                </button>
            )}

            {/* 진행률 바 */}
            {isRunning && (
                <div style={{
                    marginTop: '8px',
                    height: '4px',
                    borderRadius: '2px',
                    background: 'rgba(30, 41, 59, 0.6)',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        width: `${progress * 100}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981, #34d399)',
                        borderRadius: '2px',
                        transition: 'width 0.3s ease',
                    }} />
                </div>
            )}

            {/* 분석 결과 */}
            {isDone && analysisResult && (
                <>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: '6px',
                        marginBottom: '10px',
                    }}>
                        <ResultCard label="평균 일조" value={`${analysisResult.avgSunlight.toFixed(1)}h`} color="#34d399" />
                        <ResultCard label="최소 일조" value={`${analysisResult.minSunlight.toFixed(1)}h`} color={analysisResult.minSunlight >= 2 ? '#34d399' : '#ef4444'} />
                        <ResultCard label="최대 일조" value={`${analysisResult.maxSunlight.toFixed(1)}h`} color="#38bdf8" />
                        <ResultCard label="2h+ 확보율" value={`${analysisResult.coveragePercent.toFixed(0)}%`}
                            color={analysisResult.coveragePercent >= 80 ? '#34d399' : analysisResult.coveragePercent >= 50 ? '#fbbf24' : '#ef4444'}
                        />
                    </div>

                    {/* 법정 기준 판정 */}
                    <div style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: analysisResult.coveragePercent >= 50
                            ? 'rgba(34, 197, 94, 0.1)'
                            : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${analysisResult.coveragePercent >= 50
                            ? 'rgba(34, 197, 94, 0.3)'
                            : 'rgba(239, 68, 68, 0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '8px',
                    }}>
                        {analysisResult.coveragePercent >= 50
                            ? <CheckCircle size={13} color="#34d399" />
                            : <AlertTriangle size={13} color="#ef4444" />
                        }
                        <span style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: analysisResult.coveragePercent >= 50 ? '#86efac' : '#fca5a5',
                        }}>
                            {analysisResult.coveragePercent >= 50
                                ? '⚖️ 법정 일조 기준 양호'
                                : '⚠️ 일조 부족 지역 주의'
                            }
                        </span>
                    </div>

                    {/* 히트맵 토글 */}
                    <button
                        onClick={onToggleHeatmap}
                        style={{
                            width: '100%',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: `1px solid ${showHeatmap ? 'rgba(251, 191, 36, 0.4)' : 'rgba(148, 163, 184, 0.2)'}`,
                            background: showHeatmap ? 'rgba(251, 191, 36, 0.15)' : 'rgba(30, 41, 59, 0.5)',
                            color: showHeatmap ? '#fbbf24' : '#94a3b8',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '4px',
                        }}
                    >
                        {showHeatmap ? '🗺️ 히트맵 숨기기' : '🗺️ 히트맵 표시'}
                    </button>

                    {/* 범례 */}
                    {showHeatmap && (
                        <div style={{ marginTop: '8px' }}>
                            <div style={{
                                height: '8px',
                                borderRadius: '4px',
                                background: 'linear-gradient(90deg, #e63939, #e6a839, #e6d939, #39e66a)',
                                marginBottom: '4px',
                            }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#64748b' }}>
                                <span>0h (음영)</span>
                                <span>3h</span>
                                <span>6h (일조)</span>
                            </div>
                        </div>
                    )}

                    {/* 분석 정보 */}
                    <div style={{
                        marginTop: '8px',
                        fontSize: '9px',
                        color: '#475569',
                    }}>
                        📏 격자: {analysisResult.gridWidth}×{analysisResult.gridHeight} |
                        📅 {analysisResult.analysisDate} |
                        ⏱ 09~15시
                    </div>
                </>
            )}
        </div>
    );
}

function ResultCard({ label, value, color }: { label: string; value: string; color: string }) {
    return (
        <div style={{
            padding: '6px 8px',
            borderRadius: '8px',
            background: 'rgba(30, 41, 59, 0.5)',
            textAlign: 'center',
        }}>
            <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '14px', fontWeight: 700, color }}>{value}</div>
        </div>
    );
}
