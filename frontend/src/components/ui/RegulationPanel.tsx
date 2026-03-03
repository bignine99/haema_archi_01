import React, { useState, useCallback } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { ZONE_REGULATIONS } from '@/services/regulationEngine';
import {
    analyzeRegulations,
    type RegulationAnalysisResult,
    type RegulationCategory,
    type RegulationLaw,
    type ProjectInfoForRegulation,
} from '@/services/regulationAnalysisService';
import {
    BookOpen, FileText, Award, AlertTriangle, Search,
    ChevronDown, ChevronRight, Building, Shield, Leaf,
    Car, Heart, Zap, ClipboardList, Loader2, CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ────── 리스크 등급 배지 ──────
const RISK_CONFIG = {
    required: { label: '필수', color: 'bg-red-100 text-red-700 border-red-200', dot: '🔴' },
    review: { label: '검토', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: '🟡' },
    info: { label: '참고', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: '🔵' },
    na: { label: '해당없음', color: 'bg-slate-100 text-slate-500 border-slate-200', dot: '⚪' },
};

function RiskBadge({ risk }: { risk: string }) {
    const cfg = RISK_CONFIG[risk as keyof typeof RISK_CONFIG] || RISK_CONFIG.info;
    return (
        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-semibold ${cfg.color}`}>
            {cfg.dot} {cfg.label}
        </span>
    );
}

// ────── 카테고리 아이콘 ──────
const CATEGORY_ICONS: Record<string, React.ElementType> = {
    B1: Building, B2: Car, B3: Shield, B4: Heart,
    B5: Leaf, B6: Zap, B7: ClipboardList,
};

// ────── 법규 카드 (개별 법률) ──────
function LawCard({ law }: { law: RegulationLaw }) {
    return (
        <div className={`rounded-lg p-3 border ${law.risk === 'required' ? 'bg-red-50/50 border-red-100' :
            law.risk === 'review' ? 'bg-amber-50/50 border-amber-100' :
                law.risk === 'na' ? 'bg-slate-50/50 border-slate-100 opacity-60' :
                    'bg-blue-50/30 border-blue-100'
            }`}>
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-800">{law.name}</span>
                <RiskBadge risk={law.risk} />
            </div>
            <ul className="space-y-1">
                {law.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11px] text-slate-700">
                        <span className="text-slate-400 mt-0.5 shrink-0">•</span>
                        <span className="leading-relaxed">{item}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// ────── 카테고리 아코디언 ──────
function CategoryAccordion({ category }: { category: RegulationCategory }) {
    const [open, setOpen] = useState(category.requiredCount > 0);
    const Icon = CATEGORY_ICONS[category.id] || ClipboardList;
    const applicableLaws = category.laws.filter(l => l.risk !== 'na');
    const naLaws = category.laws.filter(l => l.risk === 'na');

    return (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
            >
                <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[12px] font-bold text-slate-800 block">{category.title}</span>
                    <span className="text-[10px] text-slate-500">
                        {category.totalCount}개 법규 적용
                        {category.requiredCount > 0 && (
                            <span className="text-red-600 font-semibold ml-2">
                                {category.requiredCount}건 필수
                            </span>
                        )}
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
                        <div className="px-4 pb-4 space-y-2 bg-slate-50/50 border-t border-slate-100">
                            <div className="pt-2 space-y-2">
                                {applicableLaws.map((law, i) => (
                                    <LawCard key={i} law={law} />
                                ))}
                                {naLaws.length > 0 && (
                                    <div className="text-[10px] text-slate-400 italic pt-1">
                                        해당없음: {naLaws.map(l => l.name).join(', ')}
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ────── 요약 대시보드 카드 ──────
function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
    return (
        <div className={`rounded-xl px-4 py-3 text-center border ${color}`}>
            <p className="text-2xl font-bold">{count}</p>
            <span className="text-[10px] font-semibold">{label}</span>
        </div>
    );
}

// ══════════════════════════════════════════════
// ███ 법규분석 패널 v2
// ══════════════════════════════════════════════
export default function RegulationPanel() {
    const store = useProjectStore();
    const [analysisResult, setAnalysisResult] = useState<RegulationAnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const hasProjectInfo = !!(store.projectName && store.projectName !== '미정 프로젝트');

    const handleAnalyze = useCallback(async () => {
        setIsAnalyzing(true);
        setError(null);

        try {
            const projectInfo: ProjectInfoForRegulation = {
                projectName: store.projectName,
                address: store.address,
                zoneType: store.zoneType,
                buildingUse: store.buildingUse,
                landArea: store.landArea,
                grossFloorArea: store.grossFloorArea,
                totalFloors: store.totalFloors,
                buildingCoverageLimit: store.buildingCoverageLimit,
                floorAreaRatioLimit: store.floorAreaRatioLimit,
                maxHeight: store.maxHeight,
                certifications: store.certifications,
                rawText: (store as any).rawText || undefined,
            };

            const result = await analyzeRegulations(projectInfo);

            if (result) {
                setAnalysisResult(result);
            } else {
                setError('AI 분석에 실패했습니다. 다시 시도해주세요.');
            }
        } catch (err) {
            setError('법규 분석 중 오류가 발생했습니다.');
            console.error(err);
        } finally {
            setIsAnalyzing(false);
        }
    }, [store]);

    return (
        <div className="h-full w-full flex flex-col bg-white">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-6 py-4 flex items-center gap-3 rounded-t-3xl z-10 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BookOpen size={16} className="text-blue-600" />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-slate-800">AI 종합 법규분석</h3>
                    <p className="text-[10px] text-slate-500">
                        7대 카테고리 · 30+ 법규 · Gemini AI 분석
                    </p>
                </div>
            </div>

            {/* 본문 */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

                {/* ─── 프로젝트 기본정보 요약 ─── */}
                <section className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl p-5 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                        <FileText size={16} className="text-blue-600" />
                        <h4 className="text-sm font-bold text-slate-800">프로젝트 기본정보</h4>
                        {hasProjectInfo && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold ml-auto">
                                ✓ 과업지시서 연동
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">사업명</span>
                            <p className="font-bold text-slate-800 truncate">{store.projectName}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">건축물 용도</span>
                            <p className="font-bold text-slate-800">{store.buildingUse}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">용도지역</span>
                            <p className="font-bold text-blue-700">{store.zoneType}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">대지면적</span>
                            <p className="font-bold text-slate-800">{store.landArea.toLocaleString()}㎡</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">건폐율 / 용적률</span>
                            <p className="font-bold text-slate-800">
                                {store.buildingCoverageLimit}% / {store.floorAreaRatioLimit}%
                            </p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[9px]">층수 / 높이</span>
                            <p className="font-bold text-slate-800">
                                {store.totalFloors}층 / {store.maxHeight}m
                            </p>
                        </div>
                    </div>

                    {store.certifications.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <Award size={12} className="text-amber-600" />
                            <span className="text-[10px] text-amber-700 font-semibold">인증:</span>
                            {store.certifications.map((cert, i) => (
                                <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                    {cert}
                                </span>
                            ))}
                        </div>
                    )}
                </section>

                {/* ─── 분석 시작 버튼 ─── */}
                {!analysisResult && !isAnalyzing && (
                    <button
                        onClick={handleAnalyze}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-sm 
                                   hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-200 
                                   flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        <Search size={18} />
                        AI 법규 종합 분석 시작
                    </button>
                )}

                {/* ─── 분석 중 ─── */}
                {isAnalyzing && (
                    <div className="w-full py-8 flex flex-col items-center gap-3">
                        <Loader2 size={32} className="text-blue-500 animate-spin" />
                        <p className="text-sm font-semibold text-slate-700">Gemini AI가 법규를 분석하고 있습니다...</p>
                        <p className="text-[11px] text-slate-500">7대 카테고리 · 30+ 법규 분석 중 (약 10초)</p>
                    </div>
                )}

                {/* ─── 오류 ─── */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-500 shrink-0" />
                        <div>
                            <p className="text-sm font-semibold text-red-700">{error}</p>
                            <button onClick={handleAnalyze} className="text-[11px] text-red-600 underline mt-1">
                                다시 시도
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── 분석 결과 ─── */}
                {analysisResult && (
                    <>
                        {/* 요약 대시보드 */}
                        <section className="bg-gradient-to-r from-emerald-50 to-cyan-50 rounded-2xl p-4 border border-emerald-200">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 size={16} className="text-emerald-600" />
                                <h4 className="text-sm font-bold text-slate-800">분석 완료</h4>
                                <span className="text-[9px] text-slate-500 ml-auto">
                                    {new Date(analysisResult.analyzedAt).toLocaleString('ko-KR')}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <SummaryCard
                                    label="🔴 필수 준수"
                                    count={analysisResult.overallSummary.required}
                                    color="bg-red-50 border-red-200 text-red-700"
                                />
                                <SummaryCard
                                    label="🟡 검토 필요"
                                    count={analysisResult.overallSummary.review}
                                    color="bg-amber-50 border-amber-200 text-amber-700"
                                />
                                <SummaryCard
                                    label="🔵 참고"
                                    count={analysisResult.overallSummary.info}
                                    color="bg-blue-50 border-blue-200 text-blue-700"
                                />
                            </div>
                        </section>

                        {/* 7대 카테고리 아코디언 — 2단 그리드 */}
                        <section>
                            <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
                                <span className="w-6 h-6 rounded-full bg-slate-700 text-white text-[10px] flex items-center justify-center">7</span>
                                카테고리별 상세 분석
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {analysisResult.categories.map((cat) => (
                                    <CategoryAccordion key={cat.id} category={cat} />
                                ))}
                            </div>
                        </section>

                        {/* 재분석 버튼 */}
                        <button
                            onClick={handleAnalyze}
                            className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-semibold text-sm
                                       hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <Search size={14} />
                            법규 재분석
                        </button>
                    </>
                )}

                {/* ─── 기존 정적 법규 테이블 (참고용) ─── */}
                {!analysisResult && !isAnalyzing && (
                    <>
                        <section>
                            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">참</span>
                                용도지역별 건폐율 · 용적률 (참고 테이블)
                            </h4>
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-3 font-semibold text-slate-600">용도지역</th>
                                            <th className="px-4 py-3 font-semibold text-slate-600 text-center">건폐율</th>
                                            <th className="px-4 py-3 font-semibold text-slate-600 text-center">용적률</th>
                                            <th className="px-4 py-3 font-semibold text-slate-600 text-center">높이</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {Object.values(ZONE_REGULATIONS).slice(0, 8).map(z => (
                                            <tr key={z.code} className={`transition-colors ${z.name === store.zoneType ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                                                <td className="px-4 py-2.5 text-slate-700 font-medium">
                                                    {z.name === store.zoneType && <span className="text-blue-500 mr-2">▶</span>}
                                                    {z.name}
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-600 text-center">{z.maxBuildingCoverage}%</td>
                                                <td className="px-4 py-2.5 text-slate-600 text-center">{z.maxFloorAreaRatio}%</td>
                                                <td className="px-4 py-2.5 text-slate-600 text-center">{z.maxHeight ? `${z.maxHeight}m` : '무제한'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
}
