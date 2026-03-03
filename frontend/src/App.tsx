import { Suspense, lazy, useState } from 'react';
import Dashboard from '@/components/ui/Dashboard';
import RegulationPanel from '@/components/ui/RegulationPanel';
import SiteAnalysisPanel from '@/components/ui/SiteAnalysisPanel';
import MapPanel from '@/components/ui/MapPanel';
import {
    Search, LayoutDashboard, Scale, MapPin, Compass,
    Network, Grid, Building, Ruler, Box,
    Lightbulb, ImageIcon
} from 'lucide-react';

import { useProjectStore } from '@/store/projectStore';
import { type KakaoAddressResult } from '@/services/gisApi';

const SceneViewer = lazy(() => import('@/components/three/SceneViewer'));

function LoadingSpinner() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-xs text-slate-500">3D 엔진 로딩 중...</p>
            </div>
        </div>
    );
}

// ─── 3D 매스 헤더 주소검색 컴포넌트 ───
function MassAddressSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<KakaoAddressResult[]>([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [searching, setSearching] = useState(false);
    const searchRealAddress = useProjectStore(s => s.searchRealAddress);
    const loadRealParcel = useProjectStore(s => s.loadRealParcel);
    const address = useProjectStore(s => s.address);
    const isLoading = useProjectStore(s => s.isLoading);

    const handleSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const res = await searchRealAddress(query);
            setResults(res);
            setShowDropdown(res.length > 0);
        } finally {
            setSearching(false);
        }
    };

    const handleSelect = async (result: KakaoAddressResult) => {
        setShowDropdown(false);
        setQuery(result.address_name);
        await loadRealParcel(result);
    };

    return (
        <div className="relative flex items-center gap-2">
            <input
                type="text"
                placeholder={address || "주소 검색 (예: 김해시 삼계동)"}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-800 w-64 focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none"
            />
            <button
                onClick={handleSearch}
                disabled={searching || isLoading}
                style={{ backgroundColor: '#2563eb', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' as any }}
            >
                <Search size={14} />
                {searching ? '검색중...' : '검색'}
            </button>
            {isLoading && (
                <span className="text-xs text-blue-500 animate-pulse">대지 로딩중...</span>
            )}

            {/* 카카오 검색 결과 드롭다운 */}
            {showDropdown && results.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                    <div className="px-3 py-1.5 bg-slate-50 border-b">
                        <span className="text-[10px] text-blue-600 font-semibold">카카오 검색 결과 ({results.length}건)</span>
                    </div>
                    {results.map((r, i) => (
                        <button
                            key={i}
                            onClick={() => handleSelect(r)}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
                        >
                            <div className="text-sm text-slate-800">{r.address_name}</div>
                            {r.road_address && (
                                <div className="text-[10px] text-slate-500">{r.road_address.address_name}</div>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

const MENU_ITEMS = [
    { id: 'dashboard', label: '과업지시서 분석', icon: <LayoutDashboard size={20} /> },
    { id: 'regulation', label: '법규분석', icon: <Scale size={20} /> },
    { id: 'site', label: '대지분석', icon: <MapPin size={20} /> },
    { id: '3dmass', label: '3D 매스', icon: <Box size={20} /> },
    { id: 'siteplan', label: '배치도', icon: <Compass size={20} /> },
    { id: 'bubble', label: '버블다이어그램', icon: <Network size={20} /> },
    { id: 'floorplan', label: '평면도 및 실별면적표', icon: <Grid size={20} /> },
    { id: 'elevation', label: '입면도', icon: <Building size={20} /> },
    { id: 'section', label: '단면도', icon: <Ruler size={20} /> },
    { id: 'concept_diagram', label: '개념도', icon: <Lightbulb size={20} /> },
    { id: 'concept_image', label: '컨셉이미지', icon: <ImageIcon size={20} /> },
];

export default function App() {
    const [activeMenu, setActiveMenu] = useState('dashboard');

    // 3D 매스 전용 뷰 (패널 제거, 3D 화면만 풀스크린)
    const render3DMassView = () => (
        <div className="h-full w-full relative overflow-hidden bg-slate-50">
            <Suspense fallback={<LoadingSpinner />}>
                <SceneViewer />
            </Suspense>

            {/* 2D 지도 패널 (좌하단 플로팅) */}
            <MapPanel />



            {/* 하단 축척 바 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-panel px-6 py-2 flex items-center gap-4 z-10 shadow-sm border border-white/40">
                <div className="flex items-center gap-2">
                    <div className="w-16 h-[2px] bg-slate-400" />
                    <span className="text-[10px] text-slate-600 font-medium">10m</span>
                </div>
                <span className="text-[11px] text-slate-600 font-medium">Phase 1-C · Site Context</span>
            </div>
        </div>
    );

    // 단일 패널 뷰 (주소검색, 대지분석, 프로젝트 대시보드, 법규분석)
    const renderSingleView = (Component: React.ComponentType<any>, componentProps?: Record<string, any>) => (
        <div className="flex-1 flex overflow-hidden bg-slate-100 relative p-4 lg:p-8">
            {/* 데코레이션 배경 */}
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 pointer-events-none"></div>

            <div className="flex-1 h-full w-full max-w-full bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden flex flex-col transition-all hover:shadow-2xl relative z-10">
                <Component {...(componentProps || {})} />
            </div>
        </div>
    );

    // 준비 중인 메뉴 뷰
    const renderPlaceholder = () => (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50">
            <div className="w-24 h-24 mb-6 rounded-2xl bg-white shadow-lg border border-slate-100 flex items-center justify-center text-4xl transform hover:scale-105 transition-transform">
                {MENU_ITEMS.find(m => m.id === activeMenu)?.icon}
            </div>
            <h2 className="text-2xl font-bold text-slate-800 mb-3 tracking-tight">
                {MENU_ITEMS.find(m => m.id === activeMenu)?.label}
            </h2>
            <p className="text-slate-500 text-sm">해당 모듈은 구성 중이거나 다음 프로세스에서 제공될 예정입니다.</p>
        </div>
    );

    const renderContent = () => {
        switch (activeMenu) {
            case '3dmass':
                return render3DMassView();
            case 'dashboard':
                return renderSingleView(Dashboard, { onNavigate: setActiveMenu });
            case 'regulation':
                return renderSingleView(RegulationPanel);
            case 'site':
                return renderSingleView(SiteAnalysisPanel);
            default:
                return renderPlaceholder();
        }
    }

    return (
        <div className="h-screen w-screen flex overflow-hidden font-sans text-slate-800" style={{ background: 'var(--bg-primary)' }}>

            {/* 최좌측 공통 네비게이션 메뉴 - position:fixed로 항상 전체 높이 고정 */}
            <aside
                className="text-slate-300 flex flex-col shadow-[4px_0_24px_rgba(0,0,0,0.15)] z-50 border-r border-slate-800"
                style={{ position: 'fixed', top: 0, left: 0, bottom: 0, width: '220px', backgroundColor: '#0f172a' }}
            >
                <div className="px-6" style={{ paddingTop: '28px', paddingBottom: '28px' }}>
                    <style>{`
                        @keyframes haemaColorShift {
                            0% { background-position: 0% 50%; }
                            100% { background-position: 200% 50%; }
                        }
                        @keyframes haemaGlow {
                            0%, 100% { box-shadow: 0 0 12px rgba(251,146,60,0.3); }
                            50% { box-shadow: 0 0 24px rgba(251,146,60,0.7), 0 0 48px rgba(251,146,60,0.3); }
                        }
                    `}</style>
                    <h1 className="text-lg font-bold tracking-widest flex items-center gap-2">
                        <span
                            className="w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-sm shadow-lg shrink-0"
                            style={{ animation: 'haemaGlow 2s ease-in-out infinite' }}
                        >H</span>
                        <span
                            className="bg-clip-text text-transparent whitespace-nowrap"
                            style={{
                                backgroundImage: 'linear-gradient(90deg, #facc15, #fb923c, #ea580c, #facc15, #fb923c, #ea580c)',
                                backgroundSize: '200% 100%',
                                animation: 'haemaColorShift 3s linear infinite',
                            }}
                        >HAEMA ARCHI</span>
                    </h1>
                    <p className="mt-2 mb-2 text-[10px] text-slate-500 tracking-wider">AI ARCHITECTURE PLATFORM</p>
                </div>

                <nav className="flex-1 overflow-y-auto px-4 py-2" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                    <style>{`
                        nav::-webkit-scrollbar {
                            display: none;
                        }
                    `}</style>
                    <ul className="space-y-2">
                        {MENU_ITEMS.map(item => {
                            const isActive = item.id === activeMenu;
                            return (
                                <li key={item.id}>
                                    <button
                                        onClick={() => setActiveMenu(item.id)}
                                        className={`w-full text-left px-5 py-3 rounded-xl flex items-center transition-all duration-200 ${isActive
                                            ? 'bg-blue-600 font-semibold text-white shadow-[0_4px_12px_rgba(37,99,235,0.25)]'
                                            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                            }`}
                                    >
                                        <span className={`w-6 flex flex-shrink-0 items-center justify-center ${isActive ? 'text-white' : 'text-slate-400'}`} style={{ marginRight: '16px' }}>
                                            {item.icon}
                                        </span>
                                        <span className={`text-[13px] tracking-wide whitespace-nowrap ${isActive ? 'opacity-100' : 'opacity-90'}`}>{item.label}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                </nav>

                <div className="p-6 border-t border-slate-800/60 bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-slate-300 font-bold text-sm shadow-inner">
                            AD
                        </div>
                        <div className="flex flex-col">
                            <span className="text-white text-xs font-semibold">Admin User</span>
                            <span className="text-[10px] text-emerald-400">Enterprise Plan</span>
                        </div>
                    </div>
                </div>
            </aside>

            {/* 우측 메인 프레젠테이션 캔버스 */}
            <main
                className="h-full bg-white relative flex flex-col min-h-0"
                style={{ flex: 1, minWidth: 0, marginLeft: '220px' }}
            >
                {/* 상단 공통 헤더 */}
                <header className="border-b border-slate-200 shrink-0 flex items-center justify-between px-6 bg-white z-20" style={{ height: '60px' }}>
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
                            {MENU_ITEMS.find(m => m.id === activeMenu)?.icon}
                        </div>
                        <h2 className="font-bold text-slate-800" style={{ fontSize: '18px' }}>
                            {MENU_ITEMS.find(m => m.id === activeMenu)?.label} 모듈
                        </h2>
                        {/* 3D 매스 모드일 때 주소검색창 표시 */}
                        {activeMenu === '3dmass' && (
                            <>
                                <div className="h-5 w-px bg-slate-300 mx-1" />
                                <MassAddressSearch />
                            </>
                        )}
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 font-medium border border-emerald-100 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            System Normal
                        </span>
                        <button className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 border border-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-50 transition-colors">
                            <span>프로젝트 내보내기</span>
                        </button>
                    </div>
                </header>

                {/* 컨텐츠 렌더링 영역 */}
                <div
                    className="overflow-y-auto custom-scrollbar bg-slate-50/30"
                    style={{ height: 'calc(100vh - 60px)' }}
                >
                    {renderContent()}
                </div>
            </main>
        </div>
    );
}
