/**
 * SunlightGuide — 일조 시뮬레이션 + 그림자 분석 사용법 가이드
 * 
 * "?" 아이콘 클릭 시 사용법 팝업 표시
 * 부모 flex 컨테이너 안에서 inline으로 배치됨
 */

import { useState } from 'react';
import { HelpCircle, X, Sun, Play, Calendar, Clock, MousePointer, RotateCw, BarChart3, Map } from 'lucide-react';

interface SunlightGuideProps {
    visible: boolean;
}

export default function SunlightGuide({ visible }: SunlightGuideProps) {
    const [isOpen, setIsOpen] = useState(false);

    if (!visible) return null;

    return (
        <div style={{ position: 'relative' }}>
            {/* ─── 도움말 버튼 ─── */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: isOpen ? 'rgba(251, 191, 36, 0.9)' : 'rgba(255, 255, 255, 0.9)',
                    backdropFilter: 'blur(12px)',
                    border: isOpen ? '1px solid rgba(251, 191, 36, 0.6)' : '1px solid rgba(255, 255, 255, 0.6)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: isOpen ? '#fff' : '#94a3b8',
                    transition: 'all 0.2s ease',
                }}
            >
                {isOpen ? <X size={13} /> : <HelpCircle size={14} />}
            </button>

            {/* ─── 사용법 패널 (절대 위치 드롭다운) ─── */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '36px',
                    right: '0px',
                    zIndex: 40,
                    width: '310px',
                    background: 'rgba(15, 23, 42, 0.94)',
                    backdropFilter: 'blur(24px)',
                    borderRadius: '16px',
                    border: '1px solid rgba(148, 163, 184, 0.15)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    padding: '16px',
                    color: '#e2e8f0',
                    fontSize: '11px',
                    lineHeight: 1.7,
                    animation: 'fadeInDown 0.2s ease',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                }}>
                    {/* 헤더 */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '14px',
                        paddingBottom: '10px',
                        borderBottom: '1px solid rgba(148, 163, 184, 0.15)',
                    }}>
                        <Sun size={16} color="#fbbf24" />
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>☀️ 일조 & 그림자 분석 가이드</span>
                    </div>

                    {/* ─── 일조 시뮬레이션 섹션 ─── */}
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#fbbf24', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            ☀️ 일조 시뮬레이션
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <GuideItem icon={<Sun size={12} color="#fbbf24" />} title="일조 모드 ON/OFF" desc="[☀️ 일조] 버튼으로 태양광 시뮬레이션을 켜고 끕니다." />
                            <GuideItem icon={<Clock size={12} color="#38bdf8" />} title="시간 조절" desc="하단 슬라이더로 시간을 변경합니다. 15분 단위." />
                            <GuideItem icon={<Calendar size={12} color="#a78bfa" />} title="날짜 변경" desc="동지/춘분/하지/추분/오늘 프리셋을 선택합니다." />
                            <GuideItem icon={<Play size={12} color="#86efac" />} title="애니메이션 재생" desc="[▶ 재생] 버튼으로 태양 이동을 애니메이션. 0.5x~4x 속도." />
                            <GuideItem icon={<MousePointer size={12} color="#fb923c" />} title="그림자 관찰" desc="3D 뷰를 회전·확대하여 건물 그림자를 관찰합니다." />
                        </div>
                    </div>

                    {/* ─── 그림자 분석 섹션 ─── */}
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#34d399', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            📊 그림자 히트맵 분석
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <GuideItem icon={<BarChart3 size={12} color="#34d399" />} title="분석 실행" desc="[📊 그림자] 버튼을 클릭하면 동지 09~15시 일조 분석이 시작됩니다." />
                            <GuideItem icon={<Map size={12} color="#fbbf24" />} title="히트맵 보기" desc="분석 완료 후 히트맵이 대지 위에 표시됩니다. 👁 버튼으로 끄고 켭니다." />
                            <GuideItem icon={<RotateCw size={12} color="#94a3b8" />} title="재분석 / 초기화" desc="[분석완료] 버튼을 다시 누르면 결과를 초기화합니다." />
                        </div>
                    </div>

                    {/* 히트맵 범례 */}
                    <div style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        marginBottom: '10px',
                    }}>
                        <div style={{ fontSize: '9px', color: '#94a3b8', marginBottom: '4px' }}>히트맵 범례</div>
                        <div style={{
                            height: '8px',
                            borderRadius: '4px',
                            background: 'linear-gradient(90deg, #e63939, #e6a839, #e6d939, #39e66a)',
                            marginBottom: '4px',
                        }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', color: '#64748b' }}>
                            <span>🔴 0h (음영)</span>
                            <span>🟡 3h</span>
                            <span>🟢 6h (일조)</span>
                        </div>
                    </div>

                    {/* 법정 분석 안내 */}
                    <div style={{
                        padding: '10px 12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        borderRadius: '10px',
                        marginBottom: '8px',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', fontWeight: 700, fontSize: '11px', color: '#fca5a5' }}>
                            ⚖️ 법정 일조 분석 (정북일조)
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: '10px', lineHeight: 1.6 }}>
                            • <strong>동지(12/22)</strong> 기준 09:00~15:00 분석<br />
                            • 연속 <strong>2시간 이상</strong> 일조 확보 필요<br />
                            • 주거지역 북측 인접 대지 기준 적용<br />
                            • <strong>2h+ 확보율</strong>이 핵심 판정 지표
                        </div>
                    </div>

                    {/* 활용 팁 */}
                    <div style={{
                        padding: '8px 10px',
                        background: 'rgba(30, 41, 59, 0.5)',
                        borderRadius: '8px',
                        color: '#94a3b8',
                        fontSize: '9px',
                        lineHeight: 1.5,
                    }}>
                        💡 <strong>활용 팁:</strong> 히트맵에서 빨간 구역을 피하여 건물 배치 →<br />
                        &nbsp;&nbsp;&nbsp;평균 일조 2h 이상 확보 시 법정 기준 충족
                    </div>
                </div>
            )}
        </div>
    );
}

function GuideItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
    return (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                background: 'rgba(30, 41, 59, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontWeight: 600, fontSize: '10px', color: '#f1f5f9', marginBottom: '1px' }}>{title}</div>
                <div style={{ color: '#94a3b8', fontSize: '9.5px', lineHeight: 1.4 }}>{desc}</div>
            </div>
        </div>
    );
}
