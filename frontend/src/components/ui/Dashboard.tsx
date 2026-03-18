
import { useProjectStore } from '@/store/projectStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FileText, Award, DollarSign, MapPin,
    Building, Ruler, Calendar,
    CheckCircle, BookOpen, PenTool, Package, AlertCircle,
    ArrowRight
} from 'lucide-react';
import { useEffect } from 'react';
import DocumentUploader from '@/components/ui/DocumentUploader';

/* ───── SectionCard: 카드 재사용 컴포넌트 ───── */
function SectionCard({ icon: Icon, iconColor, title, children, className = '' }: {
    icon: React.ElementType; iconColor: string; title: string;
    children: React.ReactNode; className?: string;
}) {
    return (
        <div className={`glass-panel p-4 flex flex-col ${className}`}>
            <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${iconColor}15` }}>
                    <Icon size={14} style={{ color: iconColor }} />
                </div>
                <h3 className="text-[13px] font-bold text-slate-800">{title}</h3>
            </div>
            {children}
        </div>
    );
}

/* ───── BulletList: 항목 리스트 (표시 단계 핵심 요약) ───── */
function cleanDisplayItem(raw: string): string[] {
    // 1. PDF 문자간 띄어쓰기 수정: "설 계 용 역" → "설계용역"
    let text = raw.replace(/([가-힣])\s([가-힣])\s([가-힣])/g, (_, a, b, c) => a + b + c);
    text = text.replace(/([가-힣])\s([가-힣])/g, '$1$2');
    // 반복 적용 (3글자 이상 연속)
    text = text.replace(/([가-힣])\s([가-힣])/g, '$1$2');

    // 2. 하나의 긴 문자열이면 번호 패턴으로 분리
    const splitItems: string[] = [];
    const parts = text.split(/(?:\s{2,}|\s*(?:\(\d+\)|\d+[\.\)])\s*)/);
    for (const p of parts) {
        const trimmed = p.trim();
        if (trimmed.length >= 8) splitItems.push(trimmed);
    }
    if (splitItems.length === 0) splitItems.push(text.trim());

    // 3. 각 항목 정리
    const cleaned: string[] = [];
    for (let item of splitItems) {
        // 제목/소제목 제거
        if (/^(제\d+\s*(장|절|조)|일반사항|공통사항|총칙|적용범위|목적|설계용역\s*과업)/.test(item)) continue;
        if (/^(건축|구조|토목|조경|기계|전기|통신|소방)\s*(분야|설비)?\s*[:：]?\s*$/.test(item)) continue;
        // 법률 인용 제거
        item = item
            .replace(/「[^」]*」/g, '')
            .replace(/법\s*제?\s*\d+조[^\s]*/g, '')
            .replace(/시행령\s*제?\s*\d+조[^\s]*/g, '')
            .replace(/(본\s*)?(사업|용역|설계)(은|의|에서|는)?\s*/g, '')
            .replace(/에\s*(의거|따라|근거하여|준하여)\s*/g, ' ')
            .replace(/하여야\s*(합니다|한다|함)\.?/g, ' 필수')
            .replace(/것으로\s*한다\.?/g, '')
            .replace(/하도록\s*한다\.?/g, '')
            .replace(/※\s*/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        if (item.length < 8) continue;

        // 60자 초과 시 자르기 (숫자 포함 부분 우선)
        if (item.length > 60) {
            const clauses = item.split(/[,，;；]/).map(c => c.trim()).filter(c => c.length > 0);
            const numClauses = clauses.filter(c => /\d/.test(c));
            if (numClauses.length > 0) {
                item = numClauses.slice(0, 2).join(', ');
            } else {
                item = clauses[0] || item;
            }
            if (item.length > 60) item = item.substring(0, 57) + '...';
        }

        // 최종 정리
        item = item.replace(/^[\s,;：:\-·•→]+/, '').replace(/[\s,;：:\-]+$/, '').trim();
        if (item.length >= 8 && !cleaned.some(c => c.substring(0, 12) === item.substring(0, 12))) {
            cleaned.push(item);
        }
    }
    return cleaned;
}

function BulletList({ items, emptyText = '정보 없음' }: { items: string[]; emptyText?: string }) {
    if (!items || items.length === 0) {
        return <p className="text-[11px] text-slate-400 italic">{emptyText}</p>;
    }

    // ★ 표시 전 각 항목 정리 + 분리
    const displayItems = items.flatMap(item => cleanDisplayItem(item));

    // 숫자 포함 항목 먼저, 최대 8개
    const sorted = [
        ...displayItems.filter(d => /\d/.test(d)),
        ...displayItems.filter(d => !/\d/.test(d)),
    ];
    const final = sorted.filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);

    if (final.length === 0) {
        return <p className="text-[11px] text-slate-400 italic">{emptyText}</p>;
    }

    return (
        <ul className="space-y-1.5">
            {final.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-700">
                    <ArrowRight size={10} className="text-blue-400 mt-0.5 shrink-0" />
                    <span className="leading-relaxed">{item}</span>
                </li>
            ))}
        </ul>
    );
}

/* ═══════════════════════════════════════════
   ███ 통합 프로젝트 대시보드 (2단 레이아웃)
   ═══════════════════════════════════════════ */

interface DashboardProps {
    onNavigate?: (menuId: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
    const store = useProjectStore();

    useEffect(() => { store.recalculate(); }, []);

    const hasDoc = !!store.documentInfo;
    const doc = store.documentInfo;

    return (
        <motion.div
            initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }}
            className="w-full h-full overflow-y-auto overflow-x-hidden p-6 pb-10 flex flex-col gap-4 custom-scrollbar"
        >
            {/* ═══ 프로젝트 헤더 (전체 너비) — 업로드 버튼 포함 ═══ */}
            <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center font-bold text-white text-lg shrink-0 shadow-lg">H</div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-slate-800 tracking-tight truncate">{store.projectName}</h2>
                    <span className="text-[11px] text-slate-500 truncate block">{store.address}</span>
                </div>
                {hasDoc && (
                    <span className="text-[9px] px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0 flex items-center gap-1">
                        <CheckCircle size={10} /> 과업지시서 적용
                    </span>
                )}
                <DocumentUploader inline />
            </div>

            {/* ═══════ ROW 2: 과업개요 | 면적 및 규모 ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard icon={FileText} iconColor="#059669" title="과업 개요">
                    {hasDoc ? (
                        <div className="space-y-2 flex-1">
                            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg px-3 py-2.5">
                                <span className="text-blue-500 text-[9px] font-medium">사업명</span>
                                <p className="text-blue-900 font-bold text-sm">{store.projectName}</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-1 mb-0.5">
                                    <MapPin size={9} className="text-slate-400" />
                                    <span className="text-slate-500 text-[9px]">대지 위치</span>
                                </div>
                                <p className="text-slate-800 font-medium text-[12px]">{store.address}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-blue-50 rounded-lg px-3 py-2">
                                    <span className="text-blue-500 text-[9px]">용도지역</span>
                                    <p className="text-blue-800 font-bold text-[12px]">{store.zoneType}</p>
                                </div>
                                <div className="bg-slate-50 rounded-lg px-3 py-2">
                                    <span className="text-slate-500 text-[9px]">주용도</span>
                                    <p className="text-slate-800 font-bold text-[12px]">{store.buildingUse}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[11px] text-slate-400 italic text-center">과업지시서를 업로드하면<br />프로젝트 개요가 표시됩니다</p>
                        </div>
                    )}
                </SectionCard>

                <SectionCard icon={Ruler} iconColor="#0891b2" title="면적 및 규모">
                    {hasDoc ? (
                        <div className="space-y-2 flex-1">
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-center">
                                    <span className="text-slate-500 text-[9px]">대지면적</span>
                                    <p className="text-slate-800 font-bold text-base">{store.landArea.toLocaleString()}<span className="text-slate-400 text-[9px] ml-0.5">㎡</span></p>
                                </div>
                                <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-center">
                                    <span className="text-slate-500 text-[9px]">연면적</span>
                                    <p className="text-slate-800 font-bold text-base">{store.grossFloorArea.toLocaleString()}<span className="text-slate-400 text-[9px] ml-0.5">㎡</span></p>
                                </div>
                                <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-center">
                                    <span className="text-slate-500 text-[9px]">규모</span>
                                    <p className="text-slate-800 font-bold text-base">
                                        {doc?.rawData.undergroundFloors ? `B${doc.rawData.undergroundFloors}/` : ''}{store.totalFloors}<span className="text-slate-400 text-[9px] ml-0.5">층</span>
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
                                    <span className="text-blue-500 text-[9px]">건폐율</span>
                                    <p className="text-blue-700 font-bold text-base">{store.buildingCoverageLimit}<span className="text-blue-400 text-[9px] ml-0.5">%</span></p>
                                </div>
                                <div className="bg-cyan-50 rounded-lg px-3 py-2 text-center">
                                    <span className="text-cyan-500 text-[9px]">용적률</span>
                                    <p className="text-cyan-700 font-bold text-base">{store.floorAreaRatioLimit}<span className="text-cyan-400 text-[9px] ml-0.5">%</span></p>
                                </div>
                                <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
                                    <span className="text-slate-500 text-[9px]">높이제한</span>
                                    <p className="text-slate-800 font-bold text-base">{store.maxHeight}<span className="text-slate-400 text-[9px] ml-0.5">m</span></p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[11px] text-slate-400 italic text-center">과업지시서를 업로드하면<br />면적 및 규모가 표시됩니다</p>
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* ═══════ ROW 3: 사업비 | 기타 사항 ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard icon={DollarSign} iconColor="#7c3aed" title="사업비 & 인증">
                    {hasDoc ? (
                        <div className="space-y-2 flex-1">
                            {store.constructionCost && (
                                <div className="bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg px-3 py-2.5">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <DollarSign size={10} className="text-violet-600" />
                                        <span className="text-violet-600 text-[9px] font-semibold">총사업비</span>
                                    </div>
                                    <p className="text-violet-900 font-bold text-lg">{store.constructionCost}</p>
                                </div>
                            )}
                            {store.designScope && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-1 mb-0.5">
                                        <Calendar size={10} className="text-slate-500" />
                                        <span className="text-slate-500 text-[9px] font-semibold">설계기간</span>
                                    </div>
                                    <p className="text-slate-800 font-semibold text-[12px]">{store.designScope}</p>
                                </div>
                            )}
                            {store.certifications.length > 0 && (
                                <div className="bg-amber-50 rounded-lg px-3 py-2">
                                    <div className="flex items-center gap-1 mb-1.5">
                                        <Award size={10} className="text-amber-600" />
                                        <span className="text-amber-700 text-[9px] font-semibold">인증 요구사항</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                        {store.certifications.map((c, i) => (
                                            <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{c}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[11px] text-slate-400 italic text-center">사업비 및 인증 정보</p>
                        </div>
                    )}
                </SectionCard>

                <SectionCard icon={Building} iconColor="#ea580c" title="기타 사항">
                    {hasDoc ? (
                        <div className="space-y-2 flex-1">
                            {store.designDirection.length > 0 && (
                                <div className="bg-orange-50 rounded-lg px-3 py-2">
                                    <span className="text-orange-600 text-[9px] font-semibold block mb-1">설계 방향</span>
                                    <BulletList items={store.designDirection} />
                                </div>
                            )}
                            {store.facilityList.length > 0 && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2">
                                    <span className="text-slate-600 text-[9px] font-semibold block mb-1">시설 구성</span>
                                    <div className="flex flex-wrap gap-1">
                                        {store.facilityList.map((f, i) => (
                                            <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">{f}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {store.designDirection.length === 0 && store.facilityList.length === 0 && (
                                <p className="text-[11px] text-slate-400 italic">추가 정보 없음</p>
                            )}
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <p className="text-[11px] text-slate-400 italic text-center">기타 사항</p>
                        </div>
                    )}
                </SectionCard>
            </div>

            {/* ═══════ ROW 4: 일반지침 | 설계지침 ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard icon={BookOpen} iconColor="#2563eb" title="일반지침">
                    <BulletList items={store.generalGuidelines} emptyText={hasDoc ? '일반지침 항목 없음' : '과업지시서 업로드 필요'} />
                </SectionCard>

                <SectionCard icon={PenTool} iconColor="#16a34a" title="설계지침">
                    <BulletList items={store.designGuidelines} emptyText={hasDoc ? '설계지침 항목 없음' : '과업지시서 업로드 필요'} />
                </SectionCard>
            </div>

            {/* ═══════ ROW 5: 성과품 작성 및 납품 | 주요 확인사항 ═══════ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionCard icon={Package} iconColor="#0284c7" title="성과품 작성 및 납품">
                    {store.deliverables.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {store.deliverables.map((d, i) => (
                                <span key={i} className="text-[10px] px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 font-medium border border-sky-100">{d}</span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-[11px] text-slate-400 italic">{hasDoc ? '성과품 목록 없음' : '과업지시서 업로드 필요'}</p>
                    )}
                </SectionCard>

                <SectionCard icon={AlertCircle} iconColor="#dc2626" title="주요 확인사항">
                    <BulletList items={store.keyNotes} emptyText={hasDoc ? '주요 확인사항 없음' : '과업지시서 업로드 필요'} />
                </SectionCard>
            </div>

            {/* ═══════ 서비스 상태 (전체 너비) ═══════ */}
            <div className="glass-panel p-3 mt-auto">
                <span className="text-[10px] text-slate-500 block mb-2">마이크로서비스 상태</span>
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { name: 'GIS', port: 8001, active: false },
                        { name: '법규 엔진', port: 8002, active: true },
                        { name: '최적화', port: 8003, active: false },
                        { name: '수익성', port: 8004, active: false },
                    ].map(s => (
                        <div key={s.name} className="flex items-center gap-1.5 text-[10px]">
                            <div className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-green-500' : 'bg-amber-500'} animate-pulse`} />
                            <span className="text-slate-600">{s.name}</span>
                            <span className="text-slate-400 ml-auto">:{s.port}</span>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
