/**
 * SunlightPanel — 일조 시뮬레이션 컨트롤 UI
 * 
 * 3D 뷰 위에 플로팅 오버레이로 표시됩니다.
 * - 시간 슬라이더 (날짜/시간 조절)
 * - 재생/일시정지 애니메이션
 * - 태양 정보 (고도각, 방위각, 일출/일몰)
 * - 동지 기준 법정 일조 분석 모드
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Sun, Moon, Play, Pause, Calendar, Clock, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import { calculateSunPosition, formatTime, azimuthToDirection, WINTER_SOLSTICE, LEGAL_ANALYSIS_HOURS, type SunPosition } from '@/utils/sunCalculator';

interface SunlightPanelProps {
    enabled: boolean;
    onToggle: () => void;
    lat: number;
    lng: number;
    onSunPositionChange: (position: SunPosition) => void;
}

// 프리셋 날짜들
const DATE_PRESETS = [
    { label: '동지 (법정분석)', month: 12, day: 22, icon: '⚖️' },
    { label: '춘분', month: 3, day: 21, icon: '🌸' },
    { label: '하지', month: 6, day: 21, icon: '☀️' },
    { label: '추분', month: 9, day: 23, icon: '🍂' },
    { label: '오늘', month: new Date().getMonth() + 1, day: new Date().getDate(), icon: '📅' },
];

export default function SunlightPanel({ enabled, onToggle, lat, lng, onSunPositionChange }: SunlightPanelProps) {
    const [month, setMonth] = useState(WINTER_SOLSTICE.month);
    const [day, setDay] = useState(WINTER_SOLSTICE.day);
    const [hour, setHour] = useState(12);    // 0-24 (소수점)
    const [isPlaying, setIsPlaying] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [showPresets, setShowPresets] = useState(false);
    const [speed, setSpeed] = useState(1);    // 애니메이션 속도 배수
    const animRef = useRef<number>();
    const lastTimeRef = useRef<number>(0);

    const year = new Date().getFullYear();

    // 태양 위치 계산
    const sunPosition = useMemo(() => {
        return calculateSunPosition(lat, lng, year, month, day, hour);
    }, [lat, lng, year, month, day, hour]);

    // 부모에게 태양 위치 전달
    useEffect(() => {
        if (enabled) {
            onSunPositionChange(sunPosition);
        }
    }, [sunPosition, enabled, onSunPositionChange]);

    // 애니메이션 루프
    useEffect(() => {
        if (!isPlaying || !enabled) {
            if (animRef.current) cancelAnimationFrame(animRef.current);
            return;
        }

        const animate = (timestamp: number) => {
            if (lastTimeRef.current === 0) lastTimeRef.current = timestamp;
            const delta = (timestamp - lastTimeRef.current) / 1000; // 초 단위
            lastTimeRef.current = timestamp;

            // speed배 속도로 시간 진행 (1 = 1시간/실제 1초)
            setHour(prev => {
                let next = prev + delta * speed;
                if (next >= 24) next -= 24;
                return next;
            });

            animRef.current = requestAnimationFrame(animate);
        };

        lastTimeRef.current = 0;
        animRef.current = requestAnimationFrame(animate);

        return () => {
            if (animRef.current) cancelAnimationFrame(animRef.current);
        };
    }, [isPlaying, enabled, speed]);

    const handlePreset = useCallback((preset: typeof DATE_PRESETS[0]) => {
        setMonth(preset.month);
        setDay(preset.day);
        setShowPresets(false);
    }, []);

    const resetToNoon = useCallback(() => {
        setHour(12);
        setIsPlaying(false);
    }, []);

    if (!enabled) return null;

    const isLegalAnalysis = month === 12 && day === 22;

    return (
        <div style={{
            position: 'absolute',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 25,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            pointerEvents: 'auto',
        }}>
            {/* ═══ 확장 패널 ═══ */}
            {expanded && (
                <div style={{
                    background: 'rgba(15, 23, 42, 0.88)',
                    backdropFilter: 'blur(20px)',
                    borderRadius: '16px',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    padding: '16px 20px',
                    minWidth: '420px',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    color: '#e2e8f0',
                    fontSize: '12px',
                }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Sun size={16} color="#fbbf24" />
                            <span style={{ fontWeight: 700, fontSize: '13px' }}>일조 시뮬레이션</span>
                            {isLegalAnalysis && (
                                <span style={{
                                    background: 'rgba(239, 68, 68, 0.2)',
                                    border: '1px solid rgba(239, 68, 68, 0.4)',
                                    color: '#fca5a5',
                                    fontSize: '9px',
                                    padding: '2px 6px',
                                    borderRadius: '6px',
                                    fontWeight: 600,
                                }}>⚖️ 법정 분석</span>
                            )}
                        </div>
                        <button onClick={() => setExpanded(false)} style={{
                            background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px'
                        }}>
                            <ChevronDown size={14} />
                        </button>
                    </div>

                    {/* 태양 정보 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '8px',
                        marginBottom: '12px',
                        padding: '8px 12px',
                        background: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '10px',
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#64748b', fontSize: '9px', marginBottom: '2px' }}>시각</div>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: '#fbbf24' }}>{formatTime(hour)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#64748b', fontSize: '9px', marginBottom: '2px' }}>고도각</div>
                            <div style={{ fontWeight: 700, fontSize: '14px', color: sunPosition.isDay ? '#38bdf8' : '#475569' }}>
                                {sunPosition.altitude.toFixed(1)}°
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#64748b', fontSize: '9px', marginBottom: '2px' }}>방위각</div>
                            <div style={{ fontWeight: 700, fontSize: '14px' }}>
                                {sunPosition.azimuth.toFixed(0)}° {azimuthToDirection(sunPosition.azimuth)}
                            </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ color: '#64748b', fontSize: '9px', marginBottom: '2px' }}>일출/일몰</div>
                            <div style={{ fontWeight: 600, fontSize: '11px' }}>
                                {sunPosition.sunrise > 0
                                    ? `${formatTime(sunPosition.sunrise)}~${formatTime(sunPosition.sunset)}`
                                    : 'N/A'
                                }
                            </div>
                        </div>
                    </div>

                    {/* 날짜 선택 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Calendar size={13} color="#94a3b8" />
                        <span style={{ fontSize: '10px', color: '#94a3b8', minWidth: '25px' }}>날짜</span>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <button
                                onClick={() => setShowPresets(!showPresets)}
                                style={{
                                    width: '100%',
                                    background: 'rgba(30, 41, 59, 0.6)',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    borderRadius: '8px',
                                    padding: '5px 10px',
                                    color: '#e2e8f0',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                }}
                            >
                                <span>{year}년 {month}월 {day}일</span>
                                <ChevronDown size={11} />
                            </button>
                            {showPresets && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    left: 0,
                                    right: 0,
                                    marginBottom: '4px',
                                    background: 'rgba(15, 23, 42, 0.95)',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(148, 163, 184, 0.2)',
                                    overflow: 'hidden',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                                }}>
                                    {DATE_PRESETS.map((preset, i) => (
                                        <button
                                            key={i}
                                            onClick={() => handlePreset(preset)}
                                            style={{
                                                width: '100%',
                                                padding: '7px 12px',
                                                background: (month === preset.month && day === preset.day) ? 'rgba(251, 191, 36, 0.15)' : 'transparent',
                                                border: 'none',
                                                borderBottom: i < DATE_PRESETS.length - 1 ? '1px solid rgba(148, 163, 184, 0.1)' : 'none',
                                                color: '#e2e8f0',
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                                textAlign: 'left',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(100,116,139,0.2)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = (month === preset.month && day === preset.day) ? 'rgba(251, 191, 36, 0.15)' : 'transparent')}
                                        >
                                            <span>{preset.icon}</span>
                                            <span style={{ flex: 1 }}>{preset.label}</span>
                                            <span style={{ color: '#64748b', fontSize: '10px' }}>{preset.month}/{preset.day}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 시간 슬라이더 */}
                    <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <Clock size={13} color="#94a3b8" />
                            <span style={{ fontSize: '10px', color: '#94a3b8', minWidth: '25px' }}>시간</span>
                            <input
                                type="range"
                                min={0}
                                max={24}
                                step={0.25}
                                value={hour}
                                onChange={e => {
                                    setHour(parseFloat(e.target.value));
                                    setIsPlaying(false);
                                }}
                                style={{
                                    flex: 1,
                                    height: '6px',
                                    borderRadius: '3px',
                                    appearance: 'auto',
                                    accentColor: '#fbbf24',
                                    cursor: 'pointer',
                                }}
                            />
                        </div>

                        {/* 법정 분석 시간 마커 */}
                        {isLegalAnalysis && (
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                padding: '0 40px',
                                fontSize: '8px',
                                color: '#94a3b8',
                            }}>
                                {[6, 9, 12, 15, 18].map(h => (
                                    <span
                                        key={h}
                                        style={{
                                            cursor: 'pointer',
                                            color: (h >= 9 && h <= 15) ? '#fbbf24' : '#475569',
                                            fontWeight: (h >= 9 && h <= 15) ? 700 : 400,
                                        }}
                                        onClick={() => { setHour(h); setIsPlaying(false); }}
                                    >
                                        {h}시
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* 컨트롤 버튼 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {/* 재생/일시정지 */}
                        <button
                            onClick={() => setIsPlaying(!isPlaying)}
                            style={{
                                background: isPlaying ? 'rgba(239, 68, 68, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                                border: `1px solid ${isPlaying ? 'rgba(239, 68, 68, 0.4)' : 'rgba(34, 197, 94, 0.4)'}`,
                                borderRadius: '8px',
                                padding: '5px 12px',
                                color: isPlaying ? '#fca5a5' : '#86efac',
                                cursor: 'pointer',
                                fontSize: '10px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                            {isPlaying ? '정지' : '재생'}
                        </button>

                        {/* 속도 조절 */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            background: 'rgba(30, 41, 59, 0.6)',
                            borderRadius: '8px',
                            padding: '2px',
                        }}>
                            {[0.5, 1, 2, 4].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setSpeed(s)}
                                    style={{
                                        background: speed === s ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                                        border: speed === s ? '1px solid rgba(251, 191, 36, 0.4)' : '1px solid transparent',
                                        borderRadius: '6px',
                                        padding: '3px 8px',
                                        color: speed === s ? '#fbbf24' : '#64748b',
                                        cursor: 'pointer',
                                        fontSize: '9px',
                                        fontWeight: speed === s ? 700 : 400,
                                    }}
                                >
                                    {s}x
                                </button>
                            ))}
                        </div>

                        {/* 정오 리셋 */}
                        <button
                            onClick={resetToNoon}
                            style={{
                                background: 'rgba(30, 41, 59, 0.6)',
                                border: '1px solid rgba(148, 163, 184, 0.2)',
                                borderRadius: '8px',
                                padding: '5px 10px',
                                color: '#94a3b8',
                                cursor: 'pointer',
                                fontSize: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            <RotateCw size={10} />
                            정오
                        </button>

                        {/* 주야간 표시 */}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {sunPosition.isDay
                                ? <Sun size={14} color="#fbbf24" />
                                : <Moon size={14} color="#94a3b8" />
                            }
                            <span style={{ fontSize: '10px', color: sunPosition.isDay ? '#fbbf24' : '#64748b' }}>
                                {sunPosition.isDay ? '주간' : '야간'}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ 축소 시 미니 바 ═══ */}
            {!expanded && (
                <div
                    onClick={() => setExpanded(true)}
                    style={{
                        background: 'rgba(15, 23, 42, 0.85)',
                        backdropFilter: 'blur(16px)',
                        borderRadius: '12px',
                        border: '1px solid rgba(148, 163, 184, 0.15)',
                        padding: '8px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        color: '#e2e8f0',
                        fontSize: '11px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                    }}
                >
                    <Sun size={14} color="#fbbf24" />
                    <span style={{ fontWeight: 600 }}>{formatTime(hour)}</span>
                    <span style={{ color: '#64748b' }}>|</span>
                    <span style={{ color: '#94a3b8' }}>고도: {sunPosition.altitude.toFixed(0)}°</span>
                    <span style={{ color: '#94a3b8' }}>{azimuthToDirection(sunPosition.azimuth)}</span>
                    {isPlaying && <Play size={10} color="#86efac" />}
                    <ChevronUp size={12} color="#64748b" />
                </div>
            )}
        </div>
    );
}
