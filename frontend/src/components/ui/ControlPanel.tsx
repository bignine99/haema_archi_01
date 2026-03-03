
import { useState, useRef, useEffect, useCallback } from 'react';
import { useProjectStore, MOCK_PARCELS, type ParcelData, type BuildingUse } from '@/store/projectStore';
import { type KakaoAddressResult } from '@/services/gisApi';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Building2, Layers, Ruler, Compass, ChevronDown, Globe, Loader2, AlertCircle, Box, Eye, EyeOff, ShieldCheck, ShieldAlert, UploadCloud, FileText, CheckCircle2, X, Award } from 'lucide-react';
import DocumentUploader from '@/components/ui/DocumentUploader';

const ZONE_TYPES = [
    '제1종 전용주거지역', '제2종 전용주거지역',
    '제1종 일반주거지역', '제2종 일반주거지역', '제3종 일반주거지역',
    '준주거지역', '일반상업지역', '준공업지역',
    '학교용지', '자연녹지지역', '보전녹지지역', '생산녹지지역',
];

const BUILDING_USES: BuildingUse[] = [
    '다가구주택', '다세대주택', '공동주택(아파트)', '오피스텔',
    '근린생활시설', '업무시설(오피스)', '숙박시설', '청년주택',
    '교육연구시설', '의료시설', '종교시설',
];

// ─── 미니 필지 형상 SVG ───
function ParcelShape({ polygon, size = 36, active = false }: { polygon: [number, number][]; size?: number; active?: boolean }) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of polygon) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const w = maxX - minX || 1, h = maxY - minY || 1;
    const pad = 4;
    const scale = Math.min((size - pad * 2) / w, (size - pad * 2) / h);
    const offX = (size - w * scale) / 2, offY = (size - h * scale) / 2;
    const pts = polygon.map(([x, y]) => `${offX + (x - minX) * scale},${offY + (y - minY) * scale}`).join(' ');
    return (
        <svg width={size} height={size} className="shrink-0">
            <polygon points={pts}
                fill={active ? 'rgba(46,143,255,0.25)' : 'rgba(34,197,94,0.15)'}
                stroke={active ? '#2e8fff' : '#22c55e'} strokeWidth={1.5} />
        </svg>
    );
}

interface ControlPanelProps {
    onNavigate?: (menuId: string) => void;
}

export default function ControlPanel({ onNavigate }: ControlPanelProps) {
    const store = useProjectStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [showParcelList, setShowParcelList] = useState(false);
    const [kakaoResults, setKakaoResults] = useState<KakaoAddressResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 외부 클릭 시 드롭다운 닫기
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // 과업지시서 업로드 시 주소 자동 입력
    useEffect(() => {
        if (store.documentInfo?.rawData?.address && !searchQuery) {
            setSearchQuery(store.documentInfo.rawData.address);
        }
    }, [store.documentInfo]);

    // ─── 검색 실행 (버튼 클릭 또는 Enter) ───
    const executeSearch = useCallback(async () => {
        if (!searchQuery.trim() || searchQuery.trim().length < 2) return;

        setIsSearching(true);
        setShowDropdown(true);
        try {
            const results = await store.searchRealAddress(searchQuery);
            setKakaoResults(results);
            if (results.length === 0) {
                // 카카오에서 결과 없으면 에러 표시
                store.searchRealAddress(''); // clear
            }
        } catch (err) {
            setKakaoResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery, store]);

    // Enter 키 핸들러
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            executeSearch();
        }
    };

    // 카카오 검색 결과 선택
    const handleSelectKakaoResult = async (result: KakaoAddressResult) => {
        setSearchQuery(result.address_name);
        setShowDropdown(false);
        setKakaoResults([]);
        await store.loadRealParcel(result);
        // 주소 선택 완료 후 3D 매스 뷰로 자동 전환
        onNavigate?.('3dmass');
    };

    // Mock 필지 선택
    const handleSelectParcel = (parcel: ParcelData) => {
        store.selectParcel(parcel.id);
        setSearchQuery('');
        setShowDropdown(false);
        // 필지 선택 후 3D 매스 뷰로 자동 전환
        onNavigate?.('3dmass');
    };

    return (
        <motion.div
            initial={{ x: -100, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full h-full overflow-y-auto overflow-x-hidden p-5 pb-10 flex flex-col gap-4 custom-scrollbar"
        >
            {/* ─── 로고 ─── */}
            <div className="flex items-center gap-3 mb-2">
                <div
                    className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ animation: 'haemaGlow 2s ease-in-out infinite' }}
                >H</div>
                <div>
                    <h1
                        className="text-lg font-bold bg-clip-text text-transparent whitespace-nowrap"
                        style={{
                            backgroundImage: 'linear-gradient(90deg, #facc15, #fb923c, #ea580c, #facc15, #fb923c, #ea580c)',
                            backgroundSize: '200% 100%',
                            animation: 'haemaColorShift 3s linear infinite',
                        }}
                    >HAEMA ARCHI</h1>
                    <p className="text-[10px] text-slate-500 -mt-0.5">AI 건축기획설계 · Phase 1-C</p>
                </div>
            </div>

            {/* ─── 실제 주소 검색 (최상단) ─── */}
            <div className="glass-panel p-4 relative z-20">
                <div className="flex items-center gap-2 mb-3">
                    <Globe size={14} className="text-green-600" />
                    <span className="text-xs font-semibold text-slate-700">실제 주소 검색</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 ml-auto">카카오 + Vworld API</span>
                </div>

                {/* 주소 입력 + 검색 버튼 */}
                <div className="relative mb-2" ref={dropdownRef}>
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 z-10" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                                placeholder="주소 입력 (예: 강남구 역삼동 123-45)"
                            />
                        </div>
                        <button
                            onClick={executeSearch}
                            disabled={isSearching || !searchQuery.trim()}
                            className="px-4 py-2.5 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5 shrink-0 shadow-lg shadow-blue-500/20"
                        >
                            {isSearching ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Search size={14} />
                            )}
                            검색
                        </button>
                    </div>

                    {/* 카카오 검색 결과 드롭다운 */}
                    <AnimatePresence>
                        {showDropdown && kakaoResults.length > 0 && (
                            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xl max-h-[280px] overflow-y-auto"
                                style={{ zIndex: 9999 }}
                            >
                                <div className="px-3 py-1.5 border-b border-slate-100">
                                    <span className="text-[9px] text-blue-600 font-semibold">카카오 검색 결과 ({kakaoResults.length}건) — 클릭하여 선택</span>
                                </div>
                                {kakaoResults.map((r, i) => (
                                    <button key={i} onClick={() => handleSelectKakaoResult(r)}
                                        className="w-full text-left px-3 py-2.5 text-xs hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Globe size={10} className="text-green-600 shrink-0" />
                                            <span className="text-slate-800 font-medium">{r.address_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 ml-4">
                                            {r.address && <span className="text-[9px] text-slate-500">법정동: {r.address.b_code}</span>}
                                            {r.road_address && <span className="text-[9px] text-cyan-500">{r.road_address.address_name}</span>}
                                        </div>
                                    </button>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <p className="text-[9px] text-slate-600 mb-2">주소 입력 후 "검색" 버튼을 누르거나 Enter를 누르세요.</p>

                {/* API 에러 표시 */}
                {store.apiError && (
                    <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                        <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                        <span className="text-[10px] text-red-600">{store.apiError}</span>
                    </div>
                )}

                {/* 로딩 상태 */}
                {store.isLoading && (
                    <div className="mb-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                        <Loader2 size={12} className="text-blue-500 animate-spin" />
                        <span className="text-[10px] text-blue-600">Vworld에서 필지 폴리곤 조회 중...</span>
                    </div>
                )}
            </div>

            {/* ─── 과업지시서 업로드 ─── */}
            <DocumentUploader />

            {/* ─── 과업지시서 반영 요약 ─── */}
            <AnimatePresence>
                {store.documentInfo && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="glass-panel p-4 overflow-hidden max-w-full"
                    >
                        <div className="flex items-center gap-2 mb-3">
                            <FileText size={14} className="text-emerald-600" />
                            <span className="text-xs font-semibold text-slate-700">과업지시서 반영 현황</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 ml-auto">
                                {store.documentInfo.fileName}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5 text-[11px] overflow-hidden">
                            {store.documentInfo.rawData.projectName && (
                                <div className="bg-emerald-50 rounded-lg px-3 py-2 col-span-2 overflow-hidden">
                                    <span className="text-emerald-600 text-[10px]">사업명</span>
                                    <p className="text-slate-800 font-semibold text-xs truncate">{store.documentInfo.rawData.projectName}</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.address && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2 col-span-2 overflow-hidden">
                                    <span className="text-slate-500 text-[10px]">대지 위치</span>
                                    <p className="text-slate-800 font-medium truncate">{store.documentInfo.rawData.address}</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.zoneType && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2 overflow-hidden">
                                    <span className="text-slate-500 text-[10px]">용도지역</span>
                                    <p className="text-blue-600 font-semibold truncate">{store.documentInfo.rawData.zoneType}</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.buildingUse && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2 overflow-hidden">
                                    <span className="text-slate-500 text-[10px]">주용도</span>
                                    <p className="text-slate-800 font-semibold truncate">{store.documentInfo.rawData.buildingUse}</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.landArea && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2 overflow-hidden">
                                    <span className="text-slate-500 text-[10px]">대지면적</span>
                                    <p className="text-slate-800 font-semibold truncate">{store.documentInfo.rawData.landArea.toLocaleString()} ㎡</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.grossFloorArea && (
                                <div className="bg-slate-50 rounded-lg px-3 py-2 overflow-hidden">
                                    <span className="text-slate-500 text-[10px]">연면적</span>
                                    <p className="text-slate-800 font-semibold truncate">{store.documentInfo.rawData.grossFloorArea.toLocaleString()} ㎡</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.buildingCoverageLimit && (
                                <div className="bg-blue-50 rounded-lg px-3 py-2 overflow-hidden">
                                    <span className="text-blue-500 text-[10px]">건폐율</span>
                                    <p className="text-blue-700 font-bold truncate">{store.documentInfo.rawData.buildingCoverageLimit}%</p>
                                </div>
                            )}
                            {store.documentInfo.rawData.floorAreaRatioLimit && (
                                <div className="bg-cyan-50 rounded-lg px-3 py-2 overflow-hidden">
                                    <span className="text-cyan-600 text-[10px]">용적률</span>
                                    <p className="text-cyan-700 font-bold truncate">{store.documentInfo.rawData.floorAreaRatioLimit}%</p>
                                </div>
                            )}
                        </div>

                        {/* 인증 사항 */}
                        {store.certifications.length > 0 && (
                            <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-1 mb-1">
                                    <Award size={10} className="text-amber-600" />
                                    <span className="text-amber-700 text-[10px] font-semibold">인증 요구사항</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {store.certifications.map((cert, i) => (
                                        <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                            {cert}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 총사업비 */}
                        {store.constructionCost && (
                            <div className="mt-2 bg-violet-50 rounded-lg px-3 py-2 overflow-hidden">
                                <span className="text-violet-600 text-[10px]">총사업비</span>
                                <p className="text-violet-800 font-bold text-xs truncate">{store.constructionCost}</p>
                            </div>
                        )}

                        <p className="text-[9px] text-emerald-600 mt-2">✓ 위 정보가 대시보드·법규분석 등 각 페이지에 기본값으로 반영되었습니다.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── 대지 정보 카드 ─── */}
            <div className="glass-panel p-4">
                <div className="flex items-center gap-2 mb-3">
                    <MapPin size={14} className="text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700">대지 정보</span>
                    {store.isRealParcel ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 ml-auto flex items-center gap-1">
                            <Globe size={8} /> API 연동
                        </span>
                    ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-auto">Mock</span>
                    )}
                </div>

                {/* 현재 주소 */}
                <div className="bg-slate-50 rounded-lg px-3 py-2 mb-2">
                    <span className="text-[10px] text-slate-500">주소</span>
                    <p className="text-xs text-slate-800 font-medium truncate">{store.address}</p>
                </div>

                {/* 선택된 대지 정보 */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-500">대지면적</span>
                        <p className="text-slate-800 font-semibold">{store.landArea.toLocaleString()} ㎡</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-500">대지 형태</span>
                        <p className="text-slate-800 font-semibold">{store.shapeLabel}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-500">전면도로</span>
                        <p className="text-slate-800 font-semibold">{store.roadWidth > 0 ? `${store.roadWidth}m` : '-'}</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-2">
                        <span className="text-slate-500">PNU</span>
                        <p className="text-slate-800 font-mono text-[8px] mt-0.5 truncate">{store.pnu || '-'}</p>
                    </div>
                </div>
            </div>

            {/* ─── 예시 필지 선택 (Mock) ─── */}
            <div className="glass-panel p-3">
                <button onClick={() => setShowParcelList(!showParcelList)} className="w-full flex items-center gap-2">
                    <Compass size={14} className="text-green-600" />
                    <span className="text-xs font-semibold text-slate-700">예시 필지 선택</span>
                    <span className="text-[9px] text-slate-600 ml-1">{MOCK_PARCELS.length}건</span>
                    <ChevronDown size={12} className={`text-slate-500 ml-auto transition-transform duration-200 ${showParcelList ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                    {showParcelList && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="space-y-1.5 mt-3">
                                {MOCK_PARCELS.map(p => {
                                    const isActive = store.selectedParcelId === p.id;
                                    return (
                                        <button key={p.id} onClick={() => handleSelectParcel(p)}
                                            className={`w-full text-left p-2.5 rounded-lg text-xs transition-all flex items-center gap-3 ${isActive ? 'bg-blue-50 border border-blue-300 shadow-md shadow-blue-100' : 'bg-slate-50 border border-transparent hover:bg-slate-100 hover:border-slate-200'}`}
                                        >
                                            <ParcelShape polygon={p.polygon} active={isActive} />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-slate-800 truncate">{p.address.split(' ').slice(1).join(' ')}</div>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-cyan-50 text-cyan-700'}`}>{p.landArea}㎡</span>
                                                    <span className="text-[9px] text-slate-500">{p.shapeLabel}</span>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ─── 용도지역 ─── */}
            <div className="glass-panel p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Building2 size={14} className="text-cyan-400" />
                    <span className="text-xs font-semibold text-slate-300">용도지역 · 건축용도</span>
                </div>
                <label className="text-[10px] text-slate-500 mb-1 block">용도지역</label>
                <select value={store.zoneType} onChange={(e) => store.setZoneType(e.target.value)}
                    className="w-full bg-surface-900/50 border border-surface-700 rounded-lg px-3 py-2 text-xs text-slate-200 mb-3 focus:outline-none focus:border-blue-500/50">
                    {ZONE_TYPES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <label className="text-[10px] text-slate-500 mb-1 block">건축 용도</label>
                <select value={store.buildingUse} onChange={(e) => store.setBuildingUse(e.target.value as BuildingUse)}
                    className="w-full bg-surface-900/50 border border-surface-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50">
                    {BUILDING_USES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                    <div className="stat-badge"><span className="text-slate-400 text-[10px]">건폐율 한도</span><p className="text-blue-300 font-bold text-base">{store.buildingCoverageLimit}%</p></div>
                    <div className="stat-badge"><span className="text-slate-400 text-[10px]">용적률 한도</span><p className="text-cyan-300 font-bold text-base">{store.floorAreaRatioLimit}%</p></div>
                </div>
            </div>

            {/* ─── 층수 조절 ─── */}
            <div className="glass-panel p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Layers size={14} className="text-amber-400" />
                    <span className="text-xs font-semibold text-slate-300">층 구성</span>
                </div>
                <div className="space-y-4">
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-slate-500">층고</label>
                            <span className="text-[11px] text-amber-300 font-semibold">{store.floorHeight.toFixed(1)}m</span>
                        </div>
                        <input type="range" min="2.7" max="5.0" step="0.1" value={store.floorHeight} onChange={(e) => store.setFloorHeight(parseFloat(e.target.value))} />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-slate-500">저층 (상가/특수)</label>
                            <span className="text-[11px] text-blue-300 font-semibold">{store.commercialFloors}층</span>
                        </div>
                        <input type="range" min="0" max="5" step="1" value={store.commercialFloors} onChange={(e) => store.setCommercialFloors(parseInt(e.target.value))} />
                    </div>
                    <div>
                        <div className="flex justify-between items-center mb-1">
                            <label className="text-[10px] text-slate-500">상층 (주거/교실)</label>
                            <span className="text-[11px] text-amber-300 font-semibold">{store.residentialFloors}층</span>
                        </div>
                        <input type="range" min="1" max="30" step="1" value={store.residentialFloors} onChange={(e) => store.setResidentialFloors(parseInt(e.target.value))} />
                    </div>
                </div>
            </div>

            {/* ─── Max Envelope 컨트롤 (Phase 1-C) ─── */}
            <div className="glass-panel p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Box size={14} className="text-blue-400" />
                    <span className="text-xs font-semibold text-slate-700">법적 최대 볼륨</span>
                    <button
                        onClick={() => store.setShowMaxEnvelope(!store.showMaxEnvelope)}
                        className={`ml-auto flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${store.showMaxEnvelope
                            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                    >
                        {store.showMaxEnvelope ? <Eye size={10} /> : <EyeOff size={10} />}
                        {store.showMaxEnvelope ? '표시중' : '숨김'}
                    </button>
                </div>

                {store.maxEnvelope && (
                    <>
                        {/* 건축가능영역 면적 */}
                        <div className="bg-blue-50 rounded-lg px-3 py-2 mb-2">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] text-blue-600">건축가능영역 면적</span>
                                <span className="text-xs text-blue-800 font-bold">
                                    {store.maxEnvelope.buildablePolygonArea.toFixed(1)} ㎡
                                </span>
                            </div>
                            <div className="flex justify-between items-center mt-0.5">
                                <span className="text-[9px] text-blue-500">최대 높이</span>
                                <span className="text-[11px] text-blue-700 font-semibold">
                                    {store.maxEnvelope.effectiveMaxHeight}m ({store.maxEnvelope.maxFloors}층)
                                </span>
                            </div>
                        </div>

                        {/* 후퇴거리 상세 */}
                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                            {[
                                { label: '전면', value: store.maxEnvelope.setback.front, color: 'text-purple-600' },
                                { label: '측면', value: store.maxEnvelope.setback.side, color: 'text-purple-600' },
                                { label: '후면', value: store.maxEnvelope.setback.rear, color: 'text-purple-600' },
                                { label: '정북', value: store.maxEnvelope.setback.north, color: 'text-red-600' },
                            ].map(sb => (
                                <div key={sb.label} className="bg-slate-50 rounded-lg px-2 py-1.5">
                                    <span className="text-[9px] text-slate-500">{sb.label} 후퇴</span>
                                    <p className={`text-xs font-bold ${sb.color}`}>{sb.value}m</p>
                                </div>
                            ))}
                        </div>

                        {/* 법규 적합성 */}
                        <div className="flex items-center gap-2">
                            {store.maxEnvelope.allCompliant ? (
                                <div className="flex items-center gap-1.5 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded-lg">
                                    <ShieldCheck size={12} />
                                    <span className="font-medium">법규 적합</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-[10px] text-red-700 bg-red-50 px-2 py-1 rounded-lg">
                                    <ShieldAlert size={12} />
                                    <span className="font-medium">법규 초과</span>
                                </div>
                            )}
                            {store.maxEnvelope.sunlightApplied && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600">
                                    정북일조 사선제한 적용
                                </span>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ─── 범례 ─── */}
            <div className="glass-panel p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Ruler size={14} className="text-slate-400" />
                    <span className="text-[10px] font-semibold text-slate-400">범례</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    {[
                        { label: '주차장 (필로티)', color: '#64748b' },
                        { label: '상가/근생', color: '#2e8fff' },
                        { label: '주거/교실', color: '#f59e0b' },
                        { label: '대지 경계', color: '#22c55e' },
                        { label: 'Max Envelope', color: '#3b82f6' },
                        { label: '후퇴선 (공지)', color: '#8b5cf6' },
                        { label: '일조권 사선', color: '#ef4444' },
                        { label: '높이 제한', color: '#ef4444' },
                    ].map(item => (
                        <div key={item.label} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: item.color }} />
                            <span className="text-slate-400">{item.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
