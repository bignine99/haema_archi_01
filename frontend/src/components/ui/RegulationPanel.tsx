import React, { useState, useCallback } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { ZONE_REGULATIONS } from '@/services/regulationEngine';
import {
    analyzeRegulations,
    analyzeSingleBatch,
    analyzeSingleLawDetail,
    REGULATION_BATCHES,
    type RegulationAnalysisResult,
    type RegulationCategory,
    type RegulationLaw,
    type ProjectInfoForRegulation,
} from '@/services/regulationAnalysisService';
import {
    extractSiteParameters,
    type SiteParameters,
} from '@/services/siteParameterService';
import {
    BookOpen, FileText, Award, AlertTriangle, Search,
    ChevronDown, ChevronRight, Building, Shield, Leaf,
    Car, Heart, Zap, ClipboardList, Loader2, CheckCircle2,
    Info, X, Database, MapPinned, Target, Compass, Mountain,
    BarChart3, GitBranch,
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
        <span className={`text-[12px] px-2.5 py-1 rounded-full border font-semibold ${cfg.color}`}>
            {cfg.dot} {cfg.label}
        </span>
    );
}

// ────── 카테고리 아이콘 ──────
const CATEGORY_ICONS: Record<string, React.ElementType> = {
    B1: Building, B2: Car, B3: Shield, B4: Heart,
    B5: Leaf, B6: Zap, B7: ClipboardList,
};

// ────── 법규 상세 분석 모달 ──────
function LawDetailModal({ law, items, onClose }: { law: RegulationLaw; items: string[]; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.2 }}
                className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg max-h-[75vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* 헤더 */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 shrink-0">
                    <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
                        <BookOpen size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-bold text-slate-800 truncate">{law.name}</h3>
                        <p className="text-[12px] text-slate-500">AI 상세 분석 · {items.length}개 조항</p>
                    </div>
                    <RiskBadge risk={law.risk} />
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-1">
                        <X size={16} className="text-slate-400" />
                    </button>
                </div>
                {/* 본문 */}
                <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                    <ol className="space-y-3">
                        {items.map((item, i) => (
                            <li key={i} className="flex items-start gap-3 text-[13px] text-slate-700 leading-relaxed">
                                <span className="text-indigo-400 font-mono shrink-0 mt-px text-[12px] w-5 text-right font-bold">
                                    {i + 1}.
                                </span>
                                <span>{item.replace(/^\d+\.\s*/, '')}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                {/* 푸터 */}
                <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 bg-slate-50 shrink-0">
                    <Info size={11} className="text-slate-400" />
                    <span className="text-[11px] text-slate-400 italic">AI 분석 결과 · temperature=0 · 설계 참고용</span>
                </div>
            </motion.div>
        </div>
    );
}

// ────── 법규 카드 (개별 법률 + 세부내용 모달) ──────
function LawCard({ law }: { law: RegulationLaw }) {
    const store = useProjectStore();
    const [showDetail, setShowDetail] = useState(false);
    const [detailItems, setDetailItems] = useState<string[] | null>(null);
    const [isLoadingDetail, setIsLoadingDetail] = useState(false);

    const handleDetailClick = async () => {
        // 이미 로드된 경우 토글만
        if (detailItems) {
            setShowDetail(!showDetail);
            return;
        }

        setIsLoadingDetail(true);
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
            };
            const items = await analyzeSingleLawDetail(projectInfo, law.name);
            setDetailItems(items);
            setShowDetail(true);
        } catch (err) {
            console.error('세부 분석 오류:', err);
        } finally {
            setIsLoadingDetail(false);
        }
    };

    return (
        <div className={`rounded-xl border transition-all flex flex-col h-full ${law.risk === 'required' ? 'bg-red-50/50 border-red-200' :
            law.risk === 'review' ? 'bg-amber-50/50 border-amber-200' :
                law.risk === 'na' ? 'bg-slate-50/50 border-slate-200 opacity-50' :
                    'bg-blue-50/30 border-blue-200'
            }`}>
            <div className="p-4 flex flex-col flex-1">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[14px] font-bold text-slate-800">{law.name}</span>
                    <RiskBadge risk={law.risk} />
                </div>
                <ul className="space-y-1.5 flex-1">
                    {law.items.slice(0, 3).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] text-slate-700">
                            <span className="text-slate-400 mt-0.5 shrink-0">•</span>
                            <span className="leading-relaxed line-clamp-2">{item}</span>
                        </li>
                    ))}
                    {law.items.length > 3 && (
                        <li className="text-[12px] text-slate-400 italic pl-4">
                            외 {law.items.length - 3}건...
                        </li>
                    )}
                </ul>

                {/* 세부내용보기 버튼 */}
                {law.risk !== 'na' && (
                    <button
                        onClick={handleDetailClick}
                        disabled={isLoadingDetail}
                        className="mt-3 w-full py-2 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-all
                            bg-white/80 text-slate-600 border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 hover:shadow-sm"
                    >
                        {isLoadingDetail ? (
                            <>
                                <Loader2 size={13} className="animate-spin" />
                                AI 상세 분석 중...
                            </>
                        ) : (
                            <>
                                <Search size={13} />
                                세부내용보기
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* 상세 분석 결과 모달 */}
            <AnimatePresence>
                {showDetail && detailItems && detailItems.length > 0 && (
                    <LawDetailModal law={law} items={detailItems} onClose={() => setShowDetail(false)} />
                )}
            </AnimatePresence>
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
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-white hover:bg-slate-50 transition-colors text-left"
            >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-[14px] font-bold text-slate-800 block">{category.title}</span>
                    <span className="text-[12px] text-slate-500">
                        {category.totalCount}개 법규 적용
                        {category.requiredCount > 0 && (
                            <span className="text-red-600 font-semibold ml-2">
                                {category.requiredCount}건 필수
                            </span>
                        )}
                    </span>
                </div>
                {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
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
                        <div className="px-4 pb-4 bg-slate-50/50 border-t border-slate-100">
                            <div className="pt-3 grid grid-cols-2 gap-3">
                                {applicableLaws.map((law, i) => (
                                    <LawCard key={i} law={law} />
                                ))}
                            </div>
                            {naLaws.length > 0 && (
                                <div className="text-[12px] text-slate-400 italic pt-2 mt-2 border-t border-slate-100">
                                    해당없음: {naLaws.map(l => l.name).join(', ')}
                                </div>
                            )}
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
        <div className={`rounded-xl px-4 py-3.5 text-center border ${color}`}>
            <p className="text-3xl font-bold">{count}</p>
            <span className="text-[13px] font-semibold">{label}</span>
        </div>
    );
}

// ────── 분석 법규 설명 데이터 ──────
const REGULATION_CATALOG = [
    {
        id: 'B1', title: '입지 및 도시계획 관련 법규', icon: '🏙️',
        laws: [
            { name: '국토의 계획 및 이용에 관한 법률', desc: '용도지역별 건축제한(건폐율/용적률/높이), 지구단위계획, 개발행위허가 기준' },
            { name: '도시공원 및 녹지 등에 관한 법률', desc: '대지 내 녹지 확보 의무, 공원·녹지 조성 기준, 생태면적률' },
            { name: '도로법 및 사도법', desc: '접도 의무(대지와 도로 접합 기준), 도로 점용, 시거 확보, 진입도로 폭원' },
            { name: '문화재보호법', desc: '문화재 현상변경 허가 대상 여부, 매장문화재 지표조사 실시 의무' },
            { name: '항공안전법', desc: '비행안전구역 내 건축물 높이 제한, 장애물 표지 설치 기준' },
        ],
    },
    {
        id: 'B5', title: '환경 및 에너지 관련 법규', icon: '🌿',
        laws: [
            { name: '녹색건축물 조성 지원법', desc: '에너지절약계획서, EPI, 녹색건축 인증, ZEB(제로에너지) 인증, BEMS 설치' },
            { name: '대기/물환경보전법', desc: '비산먼지 억제, 수질오염 방지, 폐수 배출 관리' },
            { name: '소음·진동관리법', desc: '공사중 소음 규제, 층간소음, 실내소음, 교통소음 기준' },
            { name: '환경영향평가법', desc: '소규모 환경영향평가 대상 여부(연면적 10,000㎡ 이상 시)' },
        ],
    },
    {
        id: 'B3', title: '안전 및 방재 관련 법규', icon: '🔥',
        laws: [
            { name: '소방시설법', desc: '스프링클러, 옥내소화전, 비상방송, 소방차 진입로, 피난기구, 배연설비 설치 기준' },
            { name: '화재예방법', desc: '방화구획(면적/내화시간), 방화문, 내화구조, 내장재 불연 기준, 피난계단 설치' },
            { name: '다중이용업소 안전관리법', desc: '비상구, 완강기, 피난유도등 — 다중이용업소 해당 시 적용' },
            { name: '지진·화산재해대책법', desc: '내진등급, 중요도계수(학교 1.5), 내진설계 기준, 구조안전확인서' },
        ],
    },
    {
        id: 'B4', title: '복지 및 보건 관련 법규', icon: '♿',
        laws: [
            { name: '장애인등편의법', desc: '출입구 유효폭, 경사로 기울기, 점자블록, 장애인 화장실·승강기, BF인증' },
            { name: '노인복지법 / 영유아보육법', desc: '노유자시설 층수 제한, 피난구, 조리실 규격 — 해당 용도일 때 적용' },
        ],
    },
    {
        id: 'B2', title: '기능 및 교통 관련 법규', icon: '🚗',
        laws: [
            { name: '주차장법', desc: '부설주차장 설치 대수·규격·차로 폭, 장애인 주차면, 전기차 충전시설, 경사로 기준' },
            { name: '도시교통정비 촉진법', desc: '교통영향평가 대상 여부, 진출입구 설계, 가감속차로, 대중교통 연계' },
        ],
    },
    {
        id: 'B6', title: '기반시설 및 기술 관련 법규', icon: '⚡',
        laws: [
            { name: '하수도법', desc: '정화조 용량 산정, 공공하수도 연결 의무, 빗물 이용시설' },
            { name: '수도법', desc: '저수조 설치 기준, 절수설비 설치 의무, 음용수 수질 관리' },
            { name: '신재생에너지법', desc: '공공건축물 신재생에너지 의무설치 비율(총 에너지의 15% 이상)' },
            { name: '정보통신 / 전기공사업법', desc: '구내통신선로, 초고속통신 인증, 전기설비 안전 기준, 비상발전설비' },
        ],
    },
    {
        id: 'B7', title: '기타 특수 관련 법규', icon: '📋',
        laws: [
            { name: '주택법', desc: '공동주택 건설 기준 — 주택 용도일 때 적용' },
            { name: '교육환경 보호법', desc: '학교 경계 200m 상대정화구역, 교육환경평가서 제출 — 교육시설 시 적용' },
            { name: '건축물관리법', desc: '해체계획서, 유지관리 설계, 정기 안전점검' },
            { name: '학교시설사업 촉진법', desc: '교실 면적·채광·환기 기준, 운동장 확보, 특수교실 — 교육시설 시 적용' },
            { name: '학교보건법', desc: '환기량(21.6㎥/인·h), 조도(교실 300lux), 음용수, 냉난방 — 교육시설 시 적용' },
        ],
    },
    {
        id: 'B8', title: '공공데이터 기반 지역 조례 분석', icon: '🏛️',
        laws: [
            { name: '토지이용규제 정보서비스', desc: 'VWorld API를 통한 토지이용규제 조회 — 용도지역, 용도지구, 용도구역, 도시계획시설 등' },
            { name: '지역 건축 조례', desc: '지자체별 건폐율·용적률 상한, 높이 제한, 대지 안 공지 기준 등 조례 수치 확인' },
            { name: '개별 규제 항목 상세', desc: '각 규제 코드별 관련 법령, 행위 제한, 설계 영향, 관리기관 정보 제공' },
        ],
    },
];

// ────── 분석 법규 설명 모달 ──────
function RegulationCatalogModal({ onClose }: { onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
            <div
                className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* 모달 헤더 */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                            <BookOpen size={18} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-slate-800">분석 법규 목록 (8대 카테고리)</h3>
                            <p className="text-[10px] text-slate-500">총 26+개 법규를 프로젝트 정보 기반으로 AI가 종합 분석합니다</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <X size={18} className="text-slate-500" />
                    </button>
                </div>

                {/* 모달 본문 */}
                <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4 custom-scrollbar">
                    {/* 안내 배너 */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                        <Info size={14} className="text-blue-600 shrink-0 mt-0.5" />
                        <div className="text-[11px] text-blue-800 leading-relaxed">
                            <strong>분석 방식:</strong> 프로젝트 정보(용도, 면적, 층수, 인증 등)를 Gemini AI에 전달하여 각 법규별 적용 여부와
                            구체적 수치 기준을 생성합니다. <code className="bg-blue-100 px-1 rounded">temperature=0</code> 설정으로 동일 입력에 대해 항상 일관된 결과를 보장합니다.
                        </div>
                    </div>

                    {/* 리스크 등급 범례 */}
                    <div className="flex items-center gap-4 text-[10px]">
                        <span className="font-semibold text-slate-600">리스크 등급:</span>
                        <span className="flex items-center gap-1"><span className="text-red-500">🔴</span><strong>필수</strong> — 위반 시 인허가 불가</span>
                        <span className="flex items-center gap-1"><span className="text-amber-500">🟡</span><strong>검토</strong> — 설계 단계 확인 필요</span>
                        <span className="flex items-center gap-1"><span className="text-blue-500">🔵</span><strong>참고</strong> — 권장사항</span>
                        <span className="flex items-center gap-1"><span className="text-slate-400">⚪</span><strong>해당없음</strong></span>
                    </div>

                    {/* 카테고리별 법규 목록 */}
                    {REGULATION_CATALOG.map(cat => (
                        <div key={cat.id} className="rounded-xl border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-4 py-2.5 flex items-center gap-2 border-b border-slate-200">
                                <span className="text-base">{cat.icon}</span>
                                <span className="text-[10px] text-slate-400 font-mono">{cat.id}</span>
                                <span className="text-[12px] font-bold text-slate-800">{cat.title}</span>
                                <span className="ml-auto text-[10px] text-slate-500">{cat.laws.length}개 법규</span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {cat.laws.map((law, i) => (
                                    <div key={i} className="px-4 py-2.5 flex items-start gap-3 hover:bg-slate-50/50 transition-colors">
                                        <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                            {i + 1}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-bold text-slate-800">{law.name}</p>
                                            <p className="text-[10px] text-slate-500 leading-relaxed">{law.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* 하단 참고 */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                        <div className="text-[10px] text-amber-800 leading-relaxed">
                            <strong>참고:</strong> 프로젝트 용도가 '교육연구시설'인 경우, B7 카테고리에 학교시설사업촉진법·학교보건법이 자동 추가됩니다.
                            AI 분석 결과는 설계 참고용이며, 최종 법규 적합 여부는 관할 구청 및 건축사의 확인이 필요합니다.
                        </div>
                    </div>
                </div>

                {/* 모달 푸터 */}
                <div className="px-6 py-3 border-t border-slate-200 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                    >
                        닫기
                    </button>
                </div>
            </div>
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
    const [showCatalog, setShowCatalog] = useState(false);
    const [expandedRegIndex, setExpandedRegIndex] = useState<number | null>(null);
    const [batchProgress, setBatchProgress] = useState(0);

    const hasProjectInfo = !!(store.projectName && store.projectName !== '미정 프로젝트');
    const totalBatches = REGULATION_BATCHES.length;

    const handleAnalyze = useCallback(async () => {
        setIsAnalyzing(true);
        setError(null);
        setBatchProgress(0);
        setAnalysisResult(null);

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

            const allCategories: RegulationCategory[] = [];
            let totalRequired = 0, totalReview = 0, totalInfo = 0;

            for (let i = 0; i < totalBatches; i++) {
                setBatchProgress(i + 1);
                const batchCategories = await analyzeSingleBatch(projectInfo, i);
                allCategories.push(...batchCategories);

                for (const cat of batchCategories) {
                    totalRequired += cat.laws.filter(l => l.risk === 'required').length;
                    totalReview += cat.laws.filter(l => l.risk === 'review').length;
                    totalInfo += cat.laws.filter(l => l.risk === 'info').length;
                }

                // 배치마다 중간 결과 즉시 업데이트 (실시간 렌더링)
                setAnalysisResult({
                    categories: [...allCategories],
                    overallSummary: { required: totalRequired, review: totalReview, info: totalInfo },
                    analyzedAt: new Date().toISOString(),
                });
            }

            setBatchProgress(0);

            // ███ 법규분석 완료 후 자동으로 SiteParameters 추출 ███
            const finalResult: RegulationAnalysisResult = {
                categories: allCategories,
                overallSummary: { required: totalRequired, review: totalReview, info: totalInfo },
                analyzedAt: new Date().toISOString(),
            };

            store.setSiteParamsLoading(true);
            store.setSiteParamsError(null);
            try {
                const siteParams = await extractSiteParameters(
                    projectInfo,
                    store.landUseRegulation,
                    finalResult,
                );
                store.setSiteParameters(siteParams);
                if (!siteParams) {
                    store.setSiteParamsError('SiteParameters 추출에 실패했습니다.');
                }
            } catch (paramErr) {
                store.setSiteParamsError('SiteParameters 추출 오류');
                console.error(paramErr);
            } finally {
                store.setSiteParamsLoading(false);
            }

        } catch (err) {
            setError('법규 분석 중 오류가 발생했습니다.');
            console.error(err);
        } finally {
            setIsAnalyzing(false);
        }
    }, [store, totalBatches]);

    return (
        <div className="h-full w-full flex flex-col bg-white">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-slate-100 px-6 py-4 flex items-center gap-3 rounded-t-3xl z-10 shrink-0">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                    <BookOpen size={18} className="text-blue-600" />
                </div>
                <div>
                    <h3 className="text-base font-bold text-slate-800">AI 종합 법규분석</h3>
                    <p className="text-[12px] text-slate-500">
                        8대 카테고리 · 26+ 법규 · Gemini AI 분석 · <code className="bg-slate-100 px-1 rounded">t=0</code>
                    </p>
                </div>
                <button
                    onClick={() => setShowCatalog(true)}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[13px] font-semibold hover:bg-blue-100 transition-colors shrink-0"
                >
                    <Info size={14} />
                    분석 법규 설명
                </button>
            </div>

            {/* 분석 법규 카탈로그 모달 */}
            {showCatalog && <RegulationCatalogModal onClose={() => setShowCatalog(false)} />}

            {/* 본문 */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">

                {/* ─── 프로젝트 기본정보 요약 ─── */}
                <section className="bg-gradient-to-r from-slate-50 to-blue-50 rounded-2xl p-5 border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                        <FileText size={16} className="text-blue-600" />
                        <h4 className="text-base font-bold text-slate-800">프로젝트 기본정보</h4>
                        {hasProjectInfo && (
                            <span className="text-[12px] px-2.5 py-1 rounded-full bg-green-100 text-green-700 font-semibold ml-auto">
                                ✓ 과업지시서 연동
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[14px]">
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[12px]">사업명</span>
                            <p className="font-bold text-slate-800 truncate">{store.projectName}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[12px]">건축물 용도</span>
                            <p className="font-bold text-slate-800">{store.buildingUse}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[12px]">용도지역</span>
                            <p className="font-bold text-blue-700">{store.zoneType}</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[12px]">대지면적</span>
                            <p className="font-bold text-slate-800">{store.landArea.toLocaleString()}㎡</p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[12px]">건폐율 / 용적률</span>
                            <p className="font-bold text-slate-800">
                                {store.buildingCoverageLimit}% / {store.floorAreaRatioLimit}%
                            </p>
                        </div>
                        <div className="bg-white rounded-lg px-3 py-2">
                            <span className="text-slate-500 block text-[12px]">층수 / 높이</span>
                            <p className="font-bold text-slate-800">
                                {store.totalFloors}층 / {store.maxHeight}m
                            </p>
                        </div>
                    </div>
                    {store.certifications.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <Award size={14} className="text-amber-600" />
                            <span className="text-[13px] text-amber-700 font-semibold">인증:</span>
                            {store.certifications.map((cert, i) => (
                                <span key={i} className="text-[12px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                                    {cert}
                                </span>
                            ))}
                        </div>
                    )}
                </section>

                {/* ─── ① AI 법규 분석 시작 버튼 ─── */}
                {!analysisResult && !isAnalyzing && (
                    <button
                        onClick={handleAnalyze}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base
                                   hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg shadow-blue-200
                                   flex items-center justify-center gap-2 active:scale-[0.98]"
                    >
                        <Search size={18} />
                        AI 법규 종합 분석 시작
                    </button>
                )}

                {/* ─── 분석 중 (배치 진행률) ─── */}
                {isAnalyzing && (
                    <div className="w-full py-6 flex flex-col items-center gap-4">
                        <Loader2 size={28} className="text-blue-500 animate-spin" />
                        <div className="text-center">
                            <p className="text-base font-semibold text-slate-700">Gemini AI가 법규를 분석하고 있습니다...</p>
                            <p className="text-[13px] text-slate-500 mt-1">
                                배치 {batchProgress}/{totalBatches} 진행 중
                                {batchProgress > 0 && ` · ${REGULATION_BATCHES[batchProgress - 1]?.label}`}
                            </p>
                        </div>
                        <div className="w-full max-w-xs">
                            <div className="h-2.5 bg-slate-200 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(batchProgress / totalBatches) * 100}%` }}
                                    transition={{ duration: 0.5 }}
                                />
                            </div>
                            <div className="flex justify-between mt-1.5">
                                {REGULATION_BATCHES.map((b, i) => (
                                    <span key={b.batchId} className={`text-[11px] font-medium ${i < batchProgress ? 'text-blue-600' :
                                        i === batchProgress - 1 ? 'text-blue-500 animate-pulse' : 'text-slate-400'
                                        }`}>
                                        {b.label}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ─── 오류 ─── */}
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                        <AlertTriangle size={18} className="text-red-500 shrink-0" />
                        <div>
                            <p className="text-base font-semibold text-red-700">{error}</p>
                            <button onClick={handleAnalyze} className="text-[13px] text-red-600 underline mt-1">
                                다시 시도
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── ② AI 분석 결과 ─── */}
                {analysisResult && (
                    <>
                        {/* 요약 대시보드 */}
                        <section className="bg-gradient-to-r from-emerald-50 to-cyan-50 rounded-2xl p-5 border border-emerald-200">
                            <div className="flex items-center gap-2 mb-3">
                                <CheckCircle2 size={18} className="text-emerald-600" />
                                <h4 className="text-base font-bold text-slate-800">
                                    {isAnalyzing ? `분석 진행 중 (${batchProgress}/${totalBatches})` : '분석 완료'}
                                </h4>
                                <span className="text-[12px] text-slate-500 ml-auto">
                                    {new Date(analysisResult.analyzedAt).toLocaleString('ko-KR')}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <SummaryCard label="🔴 필수 준수" count={analysisResult.overallSummary.required} color="bg-red-50 border-red-200 text-red-700" />
                                <SummaryCard label="🟡 검토 필요" count={analysisResult.overallSummary.review} color="bg-amber-50 border-amber-200 text-amber-700" />
                                <SummaryCard label="🔵 참고" count={analysisResult.overallSummary.info} color="bg-blue-50 border-blue-200 text-blue-700" />
                            </div>
                        </section>

                        {/* 카테고리별 상세 분석 — 2단 그리드 */}
                        <section>
                            <h4 className="text-base font-bold text-slate-700 flex items-center gap-2 mb-3">
                                <span className="w-7 h-7 rounded-full bg-slate-700 text-white text-[12px] flex items-center justify-center">
                                    {analysisResult.categories.length}
                                </span>
                                카테고리별 상세 분석
                                <span className="text-[12px] text-slate-400 font-normal ml-1">
                                    각 법률 카드의 "세부내용보기"로 AI 상세 팝업
                                </span>
                            </h4>
                            <div className="grid grid-cols-2 gap-3">
                                {analysisResult.categories.map((cat) => (
                                    <CategoryAccordion key={cat.id} category={cat} />
                                ))}
                            </div>
                        </section>

                        {/* 재분석 버튼 */}
                        {!isAnalyzing && (
                            <button
                                onClick={handleAnalyze}
                                className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 font-semibold text-base
                                           hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
                            >
                                <Search size={16} />
                                법규 재분석 (4배치)
                            </button>
                        )}
                    </>
                )}

                {/* ███ SiteParameters 정량적 파라미터 대시보드 ███ */}
                {(store.siteParameters || store.siteParamsLoading) && (
                    <section className="bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 rounded-2xl p-5 border border-indigo-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                                <Target size={16} className="text-white" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-slate-800">정량적 설계 파라미터 (SiteParameters)</h4>
                                <p className="text-[12px] text-slate-500">3D 엔진 직접 입력 가능 · 충돌 보수적 해결 적용</p>
                            </div>
                            {store.siteParameters && (
                                <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold ml-auto">
                                    v{store.siteParameters.version}
                                </span>
                            )}
                        </div>

                        {/* 로딩 */}
                        {store.siteParamsLoading && (
                            <div className="flex flex-col items-center gap-3 py-6">
                                <Loader2 size={24} className="text-indigo-500 animate-spin" />
                                <p className="text-[13px] text-slate-600 font-semibold">정성적 분석 → 정량적 파라미터 변환 중...</p>
                                <p className="text-[11px] text-slate-400">충돌 해결 · 수치화 · 벡터 도출</p>
                            </div>
                        )}

                        {/* 오류 */}
                        {store.siteParamsError && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[13px] text-red-700">
                                {store.siteParamsError}
                            </div>
                        )}

                        {/* ███ 대시보드 본체 ███ */}
                        {store.siteParameters && (() => {
                            const sp = store.siteParameters!;
                            const hc = sp.hard_constraints;
                            const sv = sp.setback_parameters;
                            const ev = sp.environmental_vectors;
                            const tp = sp.terrain_parameters;
                            const pz = sp.program_zoning_rules;
                            const swot = sp.corrected_swot;
                            const conf = sp.data_confidence;

                            return (
                                <div className="space-y-4">
                                    {/* ── Hard Constraints ── */}
                                    <div className="bg-white/80 rounded-xl p-4 border border-indigo-100 shadow-sm">
                                        <h5 className="text-[13px] font-bold text-indigo-800 flex items-center gap-2 mb-3">
                                            <Shield size={14} className="text-indigo-600" />
                                            Hard Constraints (보수적 확정값)
                                            <span className="text-[10px] font-normal text-slate-400 ml-auto">
                                                충돌 {hc.conflict_resolution_log?.length || 0}건 자동 해결
                                            </span>
                                        </h5>
                                        <div className="grid grid-cols-3 gap-2">
                                            {[
                                                { label: '최대 층수', value: `${hc.applied_max_floors}층`, color: 'text-indigo-700' },
                                                { label: '최대 높이', value: `${hc.applied_max_height_m}m`, color: 'text-indigo-700' },
                                                { label: '건폐율', value: `${hc.max_coverage_ratio_pct}%`, color: 'text-emerald-700' },
                                                { label: '용적률', value: `${hc.max_far_pct}%`, color: 'text-blue-700' },
                                                { label: '최대 건축면적', value: `${(hc.calculated_max_building_area_sqm || 0).toLocaleString()}㎡`, color: 'text-slate-700' },
                                                { label: '최대 연면적', value: `${(hc.calculated_max_gfa_sqm || 0).toLocaleString()}㎡`, color: 'text-slate-700' },
                                            ].map((item, i) => (
                                                <div key={i} className="bg-indigo-50/50 rounded-lg px-3 py-2.5 text-center">
                                                    <span className="text-[11px] text-slate-500 block">{item.label}</span>
                                                    <span className={`text-[16px] font-extrabold ${item.color}`}>{item.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* 충돌 해결 로그 */}
                                        {hc.conflict_resolution_log && hc.conflict_resolution_log.length > 0 && (
                                            <div className="mt-3 bg-amber-50 rounded-lg p-3 border border-amber-200">
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <GitBranch size={12} className="text-amber-600" />
                                                    <span className="text-[12px] font-bold text-amber-800">충돌 자동 해결 로그</span>
                                                </div>
                                                {hc.conflict_resolution_log.map((log, i) => (
                                                    <div key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5 mb-1">
                                                        <span className="text-amber-500 mt-0.5 shrink-0">⚠️</span>
                                                        <span>
                                                            <strong>{log.parameter}</strong>: {String(log.source_a)}={String(log.value_a)}
                                                            vs {String(log.source_b)}={String(log.value_b)}
                                                            → <span className="font-bold text-amber-900">{String(log.resolved_value)}</span>
                                                            <span className="text-amber-500 ml-1">({log.rule})</span>
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* ── Setback · 환경벡터 ── */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* Setback */}
                                        <div className="bg-white/80 rounded-xl p-4 border border-indigo-100 shadow-sm">
                                            <h5 className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                                                <Building size={13} className="text-blue-600" />
                                                건축선 후퇴 (Setback)
                                            </h5>
                                            {sv?.road_setbacks?.map((rs, i) => (
                                                <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-slate-100 last:border-0">
                                                    <span className="text-slate-600">
                                                        <span className="font-bold text-slate-800">{rs.direction}</span>면 ({rs.road_classification || `폭${rs.road_width_m}m`})
                                                    </span>
                                                    <span className="font-extrabold text-blue-700">{rs.setback_m}m</span>
                                                </div>
                                            )) || <p className="text-[11px] text-slate-400">데이터 없음</p>}
                                            <div className="mt-2 flex items-center gap-1.5 text-[11px]">
                                                <span className="text-slate-500">일조사선:</span>
                                                <span className={`font-bold ${sv?.north_sunlight_setback_applies ? 'text-red-600' : 'text-slate-400'}`}>
                                                    {sv?.north_sunlight_setback_applies ? '✅ 적용' : '➖ 미적용'}
                                                </span>
                                            </div>
                                            {sv?.north_sunlight_formula && (
                                                <p className="text-[10px] text-slate-400 mt-1 font-mono">{sv.north_sunlight_formula}</p>
                                            )}
                                        </div>

                                        {/* 환경 벡터 */}
                                        <div className="bg-white/80 rounded-xl p-4 border border-indigo-100 shadow-sm">
                                            <h5 className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                                                <Compass size={13} className="text-green-600" />
                                                환경 벡터
                                            </h5>
                                            {[
                                                { label: '최적 매스 축', value: `${ev?.optimal_mass_axis_angle || 0}°`, sub: ev?.best_solar_orientation || '' },
                                                { label: '여름 풍향', value: `${ev?.prevailing_wind_summer_angle || 0}°` },
                                                { label: '겨울 풍향', value: `${ev?.prevailing_wind_winter_angle || 0}°` },
                                                { label: '소음원', value: ev?.noise_source_direction || '-' },
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-slate-100 last:border-0">
                                                    <span className="text-slate-600">{item.label}</span>
                                                    <div className="text-right">
                                                        <span className="font-extrabold text-green-700">{item.value}</span>
                                                        {item.sub && <span className="text-[10px] text-slate-400 ml-1">{item.sub}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── 지형 · 프로그램 조닝 ── */}
                                    <div className="grid grid-cols-2 gap-3">
                                        {/* 지형 */}
                                        <div className="bg-white/80 rounded-xl p-4 border border-indigo-100 shadow-sm">
                                            <h5 className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                                                <Mountain size={13} className="text-orange-600" />
                                                지형/DEM
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ml-auto font-bold ${conf?.terrain === 'api_verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                                                    }`}>
                                                    {conf?.terrain === 'api_verified' ? 'API 검증' : '추정값'}
                                                </span>
                                            </h5>
                                            {[
                                                { label: '평균 표고', value: `${tp?.avg_ground_level_m || 0}m` },
                                                { label: '고저차', value: `${tp?.elevation_diff_m || 0}m` },
                                                { label: '경사도', value: `${tp?.slope_pct || 0}%` },
                                                { label: '절토량', value: `${(tp?.estimated_cut_volume_m3 || 0).toLocaleString()}㎥` },
                                                { label: '성토량', value: `${(tp?.estimated_fill_volume_m3 || 0).toLocaleString()}㎥` },
                                                { label: '기초', value: tp?.foundation_recommendation || '-' },
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center justify-between text-[12px] py-1 border-b border-slate-100 last:border-0">
                                                    <span className="text-slate-600">{item.label}</span>
                                                    <span className="font-bold text-orange-700">{item.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* 프로그램 조닝 */}
                                        <div className="bg-white/80 rounded-xl p-4 border border-indigo-100 shadow-sm">
                                            <h5 className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                                                <BarChart3 size={13} className="text-violet-600" />
                                                프로그램 조닝
                                            </h5>
                                            <div className="space-y-2">
                                                <div>
                                                    <span className="text-[11px] text-slate-500 block">소음 민감 존</span>
                                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                                        {pz?.noise_sensitive_zones?.map((z, i) => (
                                                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">{z}</span>
                                                        )) || <span className="text-[10px] text-slate-400">-</span>}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">→ {pz?.noise_sensitive_location_preference || '-'}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[11px] text-slate-500 block">소음 발생 존</span>
                                                    <div className="flex flex-wrap gap-1 mt-0.5">
                                                        {pz?.noise_generating_zones?.map((z, i) => (
                                                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded">{z}</span>
                                                        )) || <span className="text-[10px] text-slate-400">-</span>}
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-0.5">→ {pz?.noise_generating_location_preference || '-'}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── SWOT (범주 교정됨) ── */}
                                    {swot && (
                                        <div className="bg-white/80 rounded-xl p-4 border border-indigo-100 shadow-sm">
                                            <h5 className="text-[12px] font-bold text-slate-700 flex items-center gap-1.5 mb-3">
                                                <Target size={13} className="text-purple-600" />
                                                SWOT 분석 (범주 교정 적용)
                                                <span className="text-[9px] font-normal text-slate-400 ml-auto">S/W=Internal, O/T=External</span>
                                            </h5>
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { label: 'S 강점', items: swot.strengths, bg: 'bg-green-50 border-green-200', text: 'text-green-700', badge: 'bg-green-100' },
                                                    { label: 'W 약점', items: swot.weaknesses, bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-100' },
                                                    { label: 'O 기회', items: swot.opportunities, bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', badge: 'bg-blue-100' },
                                                    { label: 'T 위협', items: swot.threats, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-100' },
                                                ].map((sw, i) => (
                                                    <div key={i} className={`rounded-lg p-3 border ${sw.bg}`}>
                                                        <span className={`text-[11px] font-bold ${sw.text}`}>{sw.label}</span>
                                                        <ul className="mt-1 space-y-0.5">
                                                            {(sw.items || []).map((item, j) => (
                                                                <li key={j} className={`text-[10px] ${sw.text} flex items-start gap-1`}>
                                                                    <span className="mt-0.5 shrink-0">•</span>{item}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* 데이터 신뢰도 배지 */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {Object.entries(conf || {}).map(([key, val]) => (
                                            <span key={key} className={`text-[10px] px-2 py-1 rounded-full font-bold ${val === 'api_verified' || val === 'calculated'
                                                    ? 'bg-emerald-100 text-emerald-700'
                                                    : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {key}: {val}
                                            </span>
                                        ))}
                                        <span className="text-[10px] text-slate-400 ml-auto">
                                            {sp.generated_at ? new Date(sp.generated_at).toLocaleString('ko-KR') : ''}
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </section>
                )}

                {/* ─── ③ 공공데이터 기반 지역 조례 분석 (AI 분석 아래) ─── */}
                <section className="bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 rounded-2xl p-5 border border-emerald-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <Database size={18} className="text-emerald-600" />
                        <h4 className="text-base font-bold text-slate-800">공공데이터 기반 지역 조례</h4>
                        {store.landUseRegulation && !store.landUseError && (
                            <span className="text-[12px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold ml-auto">
                                ✓ API 조회 완료 ({store.landUseRegulation.total_count}건)
                            </span>
                        )}
                    </div>

                    {/* 조회 버튼 */}
                    {!store.landUseRegulation && !store.landUseLoading && (
                        <button
                            onClick={() => store.fetchLandUseData(store.address)}
                            disabled={!store.address || store.address === '미정'}
                            className={`w-full py-3 rounded-xl text-base font-semibold flex items-center justify-center gap-2 transition-all ${store.address && store.address !== '미정'
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-md shadow-emerald-200'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                }`}
                        >
                            <MapPinned size={16} />
                            토지이용규제 조회 (VWorld API)
                        </button>
                    )}

                    {/* 로딩 */}
                    {store.landUseLoading && (
                        <div className="flex flex-col items-center justify-center gap-3 py-6">
                            <div className="relative">
                                <Loader2 size={24} className="text-emerald-500 animate-spin" />
                                <div className="absolute inset-0 w-6 h-6 rounded-full border-2 border-emerald-200 animate-ping opacity-30" />
                            </div>
                            <div className="text-center">
                                <p className="text-base text-slate-700 font-semibold">토지이용규제 조회 중...</p>
                                <p className="text-[12px] text-slate-400 mt-1">카카오 주소검색 → PNU 변환 → VWorld API</p>
                            </div>
                        </div>
                    )}

                    {/* 에러 */}
                    {store.landUseError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                            <div>
                                <p className="text-[13px] text-red-700 font-semibold">{store.landUseError}</p>
                                <p className="text-[12px] text-red-500 mt-1">토지이용규제 서비스(포트 8010)가 실행 중인지 확인하세요.</p>
                                <button onClick={() => store.fetchLandUseData(store.address)} className="text-[12px] text-red-600 underline mt-1 hover:text-red-800">다시 시도</button>
                            </div>
                        </div>
                    )}

                    {/* 조회 결과 */}
                    {store.landUseRegulation && !store.landUseError && (
                        <div className="space-y-3">
                            {/* PNU 정보 */}
                            <div className="bg-white/80 backdrop-blur rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                                <div className="flex items-center gap-2 text-[12px] mb-1">
                                    <span className="font-mono bg-emerald-100 px-2.5 py-1 rounded-md text-emerald-800 font-bold tracking-wide">
                                        PNU {store.landUseRegulation.pnu_info.pnu}
                                    </span>
                                </div>
                                <p className="text-[13px] text-slate-600 flex items-center gap-1.5">
                                    <MapPinned size={13} className="text-emerald-500" />
                                    {store.landUseRegulation.pnu_info.address_full}
                                </p>
                            </div>

                            {/* 용도지역 */}
                            <div className="bg-white/80 backdrop-blur rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                                    <span className="text-[12px] font-bold text-slate-600">용도지역</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {store.landUseRegulation.zone_types.length > 0
                                        ? store.landUseRegulation.zone_types.map((zone, i) => (
                                            <span key={i} className="text-[13px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold shadow-sm">
                                                {zone}
                                            </span>
                                        ))
                                        : <span className="text-[13px] text-slate-400">미확인</span>
                                    }
                                </div>
                            </div>

                            {/* 건폐율/용적률 게이지 */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white/80 backdrop-blur rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[12px] text-slate-500 font-semibold">건폐율 (조례)</span>
                                        <span className="text-[16px] font-extrabold text-emerald-700">
                                            {store.landUseRegulation.max_building_coverage != null ? `${store.landUseRegulation.max_building_coverage}%` : '-'}
                                        </span>
                                    </div>
                                    {store.landUseRegulation.max_building_coverage != null && (
                                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-700 ease-out"
                                                style={{ width: `${Math.min(store.landUseRegulation.max_building_coverage, 100)}%` }} />
                                        </div>
                                    )}
                                </div>
                                <div className="bg-white/80 backdrop-blur rounded-xl px-4 py-3 border border-emerald-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[12px] text-slate-500 font-semibold">용적률 (조례)</span>
                                        <span className="text-[16px] font-extrabold text-blue-700">
                                            {store.landUseRegulation.max_floor_area_ratio != null ? `${store.landUseRegulation.max_floor_area_ratio}%` : '-'}
                                        </span>
                                    </div>
                                    {store.landUseRegulation.max_floor_area_ratio != null && (
                                        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                                            <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-700 ease-out"
                                                style={{ width: `${Math.min(store.landUseRegulation.max_floor_area_ratio / 15, 100)}%` }} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 특수지구/구역 */}
                            {store.landUseRegulation.special_zones.length > 0 && (
                                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-3 shadow-sm">
                                    <div className="flex items-center gap-1.5 mb-2">
                                        <AlertTriangle size={14} className="text-amber-600" />
                                        <span className="text-[13px] font-bold text-amber-800">특수 지구/구역 감지</span>
                                        <span className="text-[11px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-bold ml-auto">
                                            {store.landUseRegulation.special_zones.length}건
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {store.landUseRegulation.special_zones.map((zone, i) => (
                                            <span key={i} className="text-[12px] px-2.5 py-1 rounded-lg bg-white/80 text-amber-800 border border-amber-200 font-semibold shadow-sm">
                                                {zone}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* 개별 규제 항목 (아코디언) */}
                            {/* 규제 항목 상세 — 2단 카드 그리드 */}
                            {store.landUseRegulation.regulations.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-[14px] font-bold text-emerald-800">규제 항목 상세 ({store.landUseRegulation.regulations.length}건)</span>
                                        <span className="text-[11px] text-slate-400">카드 클릭하여 상세 확인</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {store.landUseRegulation.regulations.map((reg, i) => {
                                            const typeColors: Record<string, string> = {
                                                '용도지역': 'bg-emerald-100 text-emerald-800 border-emerald-200',
                                                '용도지역(상위)': 'bg-emerald-50 text-emerald-600 border-emerald-100',
                                                '용도지구': 'bg-blue-100 text-blue-800 border-blue-200',
                                                '용도구역': 'bg-violet-100 text-violet-800 border-violet-200',
                                                '도시계획시설': 'bg-cyan-100 text-cyan-800 border-cyan-200',
                                                '기타규제': 'bg-amber-100 text-amber-800 border-amber-200',
                                            };
                                            const badgeClass = typeColors[reg.regulation_type] || 'bg-slate-100 text-slate-600 border-slate-200';
                                            const hasDetail = reg.detail != null;
                                            const isOpen = expandedRegIndex === i;
                                            return (
                                                <div key={i}
                                                    className={`rounded-xl border transition-all flex flex-col ${reg.regulation_type === '도시계획시설' ? 'bg-cyan-50/50 border-cyan-200' :
                                                        reg.regulation_type.startsWith('용도지역') ? 'bg-emerald-50/50 border-emerald-200' :
                                                            reg.regulation_type === '용도지구' ? 'bg-blue-50/50 border-blue-200' :
                                                                'bg-white border-slate-200'
                                                        }`}
                                                >
                                                    <div className="p-4 flex flex-col flex-1">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <span className="text-[14px] font-bold text-slate-800 flex-1 leading-snug">{reg.regulation_name}</span>
                                                            <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold whitespace-nowrap ml-2 ${badgeClass}`}>
                                                                {reg.regulation_type}
                                                            </span>
                                                        </div>
                                                        <span className="text-[12px] text-slate-400 font-mono mb-2">코드: {reg.regulation_code}</span>
                                                        {hasDetail && (
                                                            <ul className="space-y-1 flex-1 mb-2">
                                                                <li className="flex items-start gap-1.5 text-[12px] text-slate-600">
                                                                    <span className="text-slate-400 mt-0.5 shrink-0">•</span>
                                                                    <span className="leading-relaxed line-clamp-2">{reg.detail!.restriction_summary}</span>
                                                                </li>
                                                                <li className="flex items-start gap-1.5 text-[12px] text-blue-700">
                                                                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                                                                    <span className="leading-relaxed line-clamp-2">{reg.detail!.design_impact}</span>
                                                                </li>
                                                            </ul>
                                                        )}
                                                        {/* 세부내용보기 버튼 */}
                                                        {hasDetail && (
                                                            <button
                                                                onClick={() => setExpandedRegIndex(isOpen ? null : i)}
                                                                className="mt-auto w-full py-2 rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-all
                                                                    bg-white/80 text-slate-600 border border-slate-200 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 hover:shadow-sm"
                                                            >
                                                                <Search size={13} />
                                                                세부내용보기
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* 세부 상세 모달 */}
                                                    <AnimatePresence>
                                                        {isOpen && hasDetail && (
                                                            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setExpandedRegIndex(null)}>
                                                                <motion.div
                                                                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                                                    transition={{ duration: 0.2 }}
                                                                    className="bg-white rounded-2xl shadow-2xl w-[90%] max-w-lg max-h-[75vh] flex flex-col overflow-hidden"
                                                                    onClick={e => e.stopPropagation()}
                                                                >
                                                                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 shrink-0">
                                                                        <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                                                                            <Database size={14} className="text-white" />
                                                                        </div>
                                                                        <div className="flex-1 min-w-0">
                                                                            <h3 className="text-[14px] font-bold text-slate-800 truncate">{reg.regulation_name}</h3>
                                                                            <p className="text-[12px] text-slate-500">{reg.regulation_type} · 코드 {reg.regulation_code}</p>
                                                                        </div>
                                                                        <span className={`text-[11px] px-2 py-0.5 rounded-md border font-bold ${badgeClass}`}>{reg.regulation_type}</span>
                                                                        <button onClick={() => setExpandedRegIndex(null)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors ml-1">
                                                                            <X size={16} className="text-slate-400" />
                                                                        </button>
                                                                    </div>
                                                                    <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                                                                        <div className="space-y-4">
                                                                            <div className="flex items-start gap-3">
                                                                                <span className="text-[12px] text-slate-500 font-semibold shrink-0 w-20">📋 관련 법령</span>
                                                                                <span className="text-[13px] text-slate-700 leading-relaxed">{reg.detail!.related_law}</span>
                                                                            </div>
                                                                            <div className="flex items-start gap-3">
                                                                                <span className="text-[12px] text-slate-500 font-semibold shrink-0 w-20">🚫 행위 제한</span>
                                                                                <span className="text-[13px] text-slate-700 leading-relaxed">{reg.detail!.restriction_summary}</span>
                                                                            </div>
                                                                            <div className="flex items-start gap-3 bg-blue-50/50 rounded-lg px-4 py-3 border border-blue-100">
                                                                                <span className="text-[12px] text-blue-600 font-semibold shrink-0 w-20">🏗️ 설계 영향</span>
                                                                                <span className="text-[13px] text-blue-800 font-medium leading-relaxed">{reg.detail!.design_impact}</span>
                                                                            </div>
                                                                            {reg.detail!.management_agency && (
                                                                                <div className="flex items-start gap-3">
                                                                                    <span className="text-[12px] text-slate-500 font-semibold shrink-0 w-20">🏛️ 관리기관</span>
                                                                                    <span className="text-[13px] text-slate-600 leading-relaxed">{reg.detail!.management_agency}</span>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-2 bg-slate-50 shrink-0">
                                                                        <Info size={11} className="text-slate-400" />
                                                                        <span className="text-[11px] text-slate-400 italic">공공데이터포털 · 토지이용규제정보서비스 기반</span>
                                                                    </div>
                                                                </motion.div>
                                                            </div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 재조회 */}
                            <button onClick={() => store.fetchLandUseData(store.address)}
                                className="text-[13px] text-emerald-600 underline hover:text-emerald-800 transition-colors">
                                재조회
                            </button>
                        </div>
                    )}
                </section>

                {/* ─── 기존 정적 법규 테이블 (참고용) ─── */}
                {!analysisResult && !isAnalyzing && (
                    <section>
                        <h4 className="text-base font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <span className="w-7 h-7 rounded-full bg-blue-500 text-white text-[12px] flex items-center justify-center">참</span>
                            용도지역별 건폐율 · 용적률 (참고 테이블)
                        </h4>
                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-[13px] text-left">
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
                )}
            </div>
        </div>
    );
}