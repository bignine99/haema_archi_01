import React, { useState, useCallback } from 'react';
import { useProjectStore } from '@/store/projectStore';
import {
    analyzeSite,
    type SiteAnalysisResult,
    type AnalysisSection,
    type AnalysisItem,
    type SiteAnalysisInput,
} from '@/services/siteAnalysisService';
import {
    MapPin, FileText, Search, ChevronDown, ChevronRight,
    Mountain, Sun, Car, Building2, Target, Loader2,
    AlertTriangle, CheckCircle2, TrendingUp, TrendingDown,
    Lightbulb, ShieldAlert, ClipboardCheck, RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ────── 중요도 배지 ──────
const IMPORTANCE_CONFIG = {
    critical: { label: '핵심', color: 'bg-red-100 text-red-700 border-red-200' },
    high: { label: '중요', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    medium: { label: '보통', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    low: { label: '참고', color: 'bg-slate-100 text-slate-500 border-slate-200' },
};

// ────── 섹션 아이콘 ──────
const SECTION_ICONS: Record<string, React.ElementType> = {
    S1: Mountain, S2: Sun, S3: Car, S4: Building2, S5: Target,
};

// ────── 분석 항목 카드 ──────
function AnalysisItemCard({ item }: { item: AnalysisItem }) {
    const cfg = IMPORTANCE_CONFIG[item.importance] || IMPORTANCE_CONFIG.medium;
    return (
        <div className="bg-white rounded-lg p-3 border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-slate-800">{item.title}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full border font-semibold ${cfg.color}`}>
                    {cfg.label}
                </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">{item.content}</p>
        </div>
    );
}

// ────── 섹션 아코디언 ──────
function SectionAccordion({ section }: { section: AnalysisSection }) {
    const [open, setOpen] = useState(true);
    const Icon = SECTION_ICONS[section.id] || Target;
    const criticalCount = section.items.filter(i => i.importance === 'critical').length;

    return (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
            >
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-100 to-blue-50 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-bold text-slate-800 block">{section.title}</span>
                    <span className="text-[10px] text-slate-500">
                        {section.items.length}개 항목
                        {criticalCount > 0 && <span className="text-red-600 font-semibold ml-1">· {criticalCount}건 핵심</span>}
                    </span>
                </div>
                {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="px-4 pb-4 border-t border-slate-100">
                            {/* 요약 */}
                            <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-3 py-2 mt-3 mb-3 font-medium">
                                💡 {section.summary}
                            </p>
                            {/* 항목 */}
                            <div className="space-y-2">
                                {section.items.map((item, i) => (
                                    <AnalysisItemCard key={i} item={item} />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ────── SWOT 카드 ──────
function SwotCard({ category, items }: { category: string; items: string[] }) {
    const configs: Record<string, { label: string; color: string; bg: string; Icon: React.ElementType }> = {
        strength: { label: '강점 (S)', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', Icon: TrendingUp },
        weakness: { label: '약점 (W)', color: 'text-red-700', bg: 'bg-red-50 border-red-200', Icon: TrendingDown },
        opportunity: { label: '기회 (O)', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', Icon: Lightbulb },
        threat: { label: '위협 (T)', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', Icon: ShieldAlert },
    };
    const cfg = configs[category] || configs.strength;

    return (
        <div className={`rounded-xl p-4 border ${cfg.bg}`}>
            <div className="flex items-center gap-2 mb-2">
                <cfg.Icon size={14} className={cfg.color} />
                <span className={`text-[12px] font-bold ${cfg.color}`}>{cfg.label}</span>
            </div>
            <ul className="space-y-1.5">
                {items.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                        <span className="text-slate-400 mt-0.5 shrink-0">•</span>
                        <span className="leading-relaxed">{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ══════════════════════════════════════
// ███ 대지분석 패널
// ══════════════════════════════════════
export default function SiteAnalysisPanel() {
    const store = useProjectStore();
    const [result, setResult] = useState<SiteAnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnalyze = useCallback(async () => {
        setIsAnalyzing(true);
        setError(null);
        try {
            const input: SiteAnalysisInput = {
                projectName: store.projectName,
                address: store.address,
                zoneType: store.zoneType,
                buildingUse: store.buildingUse,
                landArea: store.landArea,
                grossFloorArea: store.grossFloorArea,
                totalFloors: store.totalFloors,
                maxHeight: store.maxHeight,
                buildingCoverageLimit: store.buildingCoverageLimit,
                floorAreaRatioLimit: store.floorAreaRatioLimit,
                certifications: store.certifications,
                roadWidth: store.roadWidth,
                northAngle: store.northAngle,
                rawText: (store as any).rawText || (store.documentInfo as any)?.rawData?.rawText || undefined,
            };
            const res = await analyzeSite(input);
            if (res) {
                setResult(res);
            } else {
                setError('AI 대지분석에 실패했습니다. 다시 시도해주세요.');
            }
        } catch (err: any) {
            setError(err?.message || '대지분석 중 오류가 발생했습니다.');
            console.error(err);
        } finally {
            setIsAnalyzing(false);
        }
    }, [store]);

    return (
        <div className="h-full w-full flex flex-col bg-white">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-6 py-4 flex items-center gap-3 rounded-t-3xl z-10 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <MapPin size={16} className="text-emerald-600" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-800">AI 종합 대지분석</h3>
                    <p className="text-[10px] text-slate-500">5대 영역 · SWOT · 디자인 전략 · Gemini AI</p>
                </div>
            </div>

            {/* 본문 */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

                {/* ─── 프로젝트 기본정보 ─── */}
                <section className="bg-gradient-to-r from-emerald-50 to-cyan-50 rounded-2xl p-4 border border-emerald-200">
                    <div className="flex items-center gap-2 mb-3">
                        <FileText size={14} className="text-emerald-600" />
                        <h4 className="text-[12px] font-bold text-slate-800">대지 기본정보</h4>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-[11px]">
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">사업명</span>
                            <p className="font-bold text-slate-800 truncate">{store.projectName}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">대지위치</span>
                            <p className="font-bold text-blue-700 truncate">{store.address}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">대지면적</span>
                            <p className="font-bold text-slate-800">{store.landArea.toLocaleString()}㎡</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">건축물 용도</span>
                            <p className="font-bold text-slate-800">{store.buildingUse}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">건폐율 / 용적률</span>
                            <p className="font-bold text-slate-800">{store.buildingCoverageLimit}% / {store.floorAreaRatioLimit}%</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">층수 / 높이</span>
                            <p className="font-bold text-slate-800">{store.totalFloors}층 / {store.maxHeight}m</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">전면도로</span>
                            <p className="font-bold text-slate-800">{store.roadWidth}m</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">진북 방향</span>
                            <p className="font-bold text-slate-800">{store.northAngle}°</p>
                        </div>
                    </div>
                </section>

                {/* ─── 분석 버튼 ─── */}
                {!result && !isAnalyzing && (
                    <button
                        onClick={handleAnalyze}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm
                                   hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg shadow-emerald-200
                                   flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        <Search size={18} />
                        AI 종합 대지분석 시작
                    </button>
                )}

                {/* ─── 로딩 ─── */}
                {isAnalyzing && (
                    <div className="w-full py-10 flex flex-col items-center gap-3">
                        <Loader2 size={32} className="text-emerald-500 animate-spin" />
                        <p className="text-sm font-semibold text-slate-700">Gemini AI가 대지를 분석하고 있습니다...</p>
                        <p className="text-[11px] text-slate-500">5대 영역 + SWOT + 디자인 전략 생성 중 (약 15초)</p>
                    </div>
                )}

                {/* ─── 에러 ─── */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-500 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-red-700">{error}</p>
                            <button onClick={handleAnalyze} className="text-[11px] text-red-600 underline mt-1">다시 시도</button>
                        </div>
                    </div>
                )}

                {/* ─── 분석 결과 ─── */}
                {result && (
                    <>
                        {/* 완료 배너 */}
                        <div className="bg-gradient-to-r from-emerald-50 to-cyan-50 rounded-xl p-3 border border-emerald-200 flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <span className="text-[12px] font-bold text-slate-800">대지분석 완료</span>
                            <span className="text-[9px] text-slate-500 ml-auto">
                                {new Date(result.analyzedAt).toLocaleString('ko-KR')}
                            </span>
                        </div>

                        {/* 5대 영역 분석 — 2단 그리드 */}
                        <section>
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center">5</span>
                                대 영역 상세 분석
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {result.sections.map((sec) => (
                                    <SectionAccordion key={sec.id} section={sec} />
                                ))}
                            </div>
                        </section>

                        {/* SWOT 분석 — 2×2 그리드 */}
                        <section>
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <Target size={16} className="text-slate-600" />
                                AI SWOT 분석
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {result.swot.map((s) => (
                                    <SwotCard key={s.category} category={s.category} items={s.items} />
                                ))}
                            </div>
                        </section>

                        {/* 디자인 전략 */}
                        <section>
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <Lightbulb size={16} className="text-amber-600" />
                                디자인 전략 제안
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {result.designStrategies.map((strat, i) => (
                                    <div key={i} className={`rounded-xl p-4 border ${strat.priority === 'high' ? 'bg-amber-50 border-amber-200' :
                                            strat.priority === 'medium' ? 'bg-blue-50 border-blue-200' :
                                                'bg-slate-50 border-slate-200'
                                        }`}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <span className="text-[11px] font-bold text-slate-800">{strat.title}</span>
                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-semibold ${strat.priority === 'high' ? 'bg-amber-200 text-amber-800' :
                                                    strat.priority === 'medium' ? 'bg-blue-200 text-blue-800' :
                                                        'bg-slate-200 text-slate-600'
                                                }`}>{strat.priority === 'high' ? '높음' : strat.priority === 'medium' ? '보통' : '낮음'}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-600 leading-relaxed">{strat.description}</p>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* 매스 배치 제안 + 인증 체크리스트 — 2단 */}
                        <div className="grid grid-cols-2 gap-4">
                            {/* 매스 배치 */}
                            <section className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                                <h4 className="text-[12px] font-bold text-indigo-800 mb-3 flex items-center gap-2">
                                    <Building2 size={14} />
                                    매스 배치 제안
                                </h4>
                                <ul className="space-y-2">
                                    {result.massRecommendations.map((rec, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[11px] text-slate-700">
                                            <span className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 text-[9px] flex items-center justify-center shrink-0 mt-0.5 font-bold">{i + 1}</span>
                                            <span className="leading-relaxed">{rec}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>

                            {/* 인증 체크리스트 */}
                            <section className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                                <h4 className="text-[12px] font-bold text-emerald-800 mb-3 flex items-center gap-2">
                                    <ClipboardCheck size={14} />
                                    인증 배치 체크리스트
                                </h4>
                                <ul className="space-y-2">
                                    {result.certChecklist.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2 text-[11px] text-slate-700">
                                            <span className="text-emerald-500 shrink-0 mt-0.5">☐</span>
                                            <span className="leading-relaxed">{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>

                        {/* 재분석 */}
                        <button
                            onClick={handleAnalyze}
                            className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-semibold text-sm
                                       hover:border-emerald-400 hover:text-emerald-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <RotateCcw size={14} />
                            대지 재분석
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
