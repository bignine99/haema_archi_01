import React, { useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { KeyRound, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';

interface LandingPageProps {
    onEnter: () => void;
}

export default function LandingPage({ onEnter }: LandingPageProps) {
    const [apiKey, setApiKey] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const setStoreApiKey = useProjectStore(s => s.setGeminiApiKey);

    const validateApiKey = async (key: string) => {
        try {
            // 가장 가벼운 Gemini API 호출로 키 유효성 검증 (모델 정보 조회)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite?key=${key}`);

            if (response.ok) {
                return true;
            } else if (response.status === 403) {
                const data = await response.json();
                if (data.error?.message?.includes('leaked')) {
                    setError('유출되어 차단된 API 키입니다. 새로운 키를 발급받아주세요.');
                } else {
                    setError('API 키 권한이 없거나 유효하지 않습니다.');
                }
                return false;
            } else if (response.status === 400) {
                setError('잘못된 API 키 형식입니다.');
                return false;
            } else {
                setError(`API 확인 실패 (${response.status})`);
                return false;
            }
        } catch (err) {
            setError('네트워크 오류가 발생했습니다. 인터냇 연결을 확인해주세요.');
            return false;
        }
    };

    const handleEnter = async () => {
        setError(null);
        if (!apiKey.trim()) {
            setError('Gemini API 키를 입력해주세요.');
            return;
        }

        setIsLoading(true);
        const isValid = await validateApiKey(apiKey.trim());
        setIsLoading(false);

        if (isValid) {
            setStoreApiKey(apiKey.trim());
            onEnter();
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 relative overflow-hidden font-sans text-slate-800">
            {/* 배경 데코레이션 */}
            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
                <svg className="absolute w-full h-full" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <pattern id="grid-pattern" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="1" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid-pattern)" />
                </svg>
            </div>

            <div className="z-10 w-full max-w-4xl flex flex-col items-center px-6">

                {/* 로고 영역 */}
                <div className="mb-8 flex flex-col items-center fade-in-up">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white text-3xl font-bold shadow-xl mb-6">
                        H
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-center bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500 mb-4">
                        HAEMA ARCHITECTURE
                    </h1>
                    <p className="text-lg text-slate-500 font-medium text-center">
                        AI Multidimensional Intelligence Platform
                    </p>
                </div>

                <div className="w-full max-w-md bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white p-8 fade-in-up" style={{ animationDelay: '0.1s' }}>
                    <div className="mb-8 text-center">
                        <h2 className="text-2xl font-bold text-slate-800 mb-2">플랫폼 입장</h2>
                        <p className="text-sm text-slate-500">
                            모든 건축 AI 기능을 활성화하려면<br />Google Gemini API 키가 필요합니다.
                        </p>
                    </div>

                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider ml-1 flex items-center gap-1.5">
                                <KeyRound size={14} />
                                Gemini API Key
                            </label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleEnter()}
                                    placeholder="AIzaSy..."
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 transition-all font-mono text-sm"
                                    disabled={isLoading}
                                />
                            </div>

                            {/* 에러 메시지 표시 영역 */}
                            {error && (
                                <div className="mt-2 flex items-start gap-2 text-red-500 bg-red-50 p-3 rounded-lg border border-red-100 animate-in fade-in slide-in-from-top-2">
                                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                    <p className="text-xs leading-relaxed font-medium">{error}</p>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleEnter}
                            disabled={isLoading}
                            className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed shadow-lg shadow-slate-800/20 group"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" />
                                    <span>키 확인 중...</span>
                                </>
                            ) : (
                                <>
                                    <span>메인 페이지 입장</span>
                                    <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>

                        <div className="text-center pt-4">
                            <a
                                href="https://aistudio.google.com/app/apikey"
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                            >
                                API 키 발급받기 ↗
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
