import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, X, Loader2 } from 'lucide-react';
import { useProjectStore } from '@/store/projectStore';
import { parseDocument } from '@/services/documentParser';

export default function DocumentUploader({ compact = false, inline = false }: { compact?: boolean; inline?: boolean }) {
    const store = useProjectStore();
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processFile(file);
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        await processFile(file);
    };

    const processFile = async (file: File) => {
        setIsLoading(true);
        setError(null);
        setSuccess(false);

        try {
            const parsedData = await parseDocument(file);
            store.updateFromDocument(file.name, parsedData);
            setSuccess(true);
            setTimeout(() => setSuccess(false), 5000);
        } catch (err: any) {
            setError(err.message || '파일 처리 중 오류가 발생했습니다.');
        } finally {
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // ███ Inline 모드: 헤더 바에 삽입 가능한 콤팩트 버튼 ███
    if (inline) {
        return (
            <div className="relative shrink-0">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.txt"
                    className="hidden"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all shadow-sm ${isLoading
                            ? 'bg-blue-100 text-blue-500 cursor-wait'
                            : success
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : error
                                    ? 'bg-red-100 text-red-700 border border-red-200'
                                    : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300'
                        }`}
                >
                    {isLoading ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : success ? (
                        <CheckCircle2 size={12} />
                    ) : error ? (
                        <AlertCircle size={12} />
                    ) : (
                        <UploadCloud size={12} />
                    )}
                    {isLoading ? '분석 중...' : success ? '적용 완료' : error ? '오류' : '과업지시서'}
                </button>
            </div>
        );
    }

    return (
        <div className={compact ? 'relative overflow-visible' : 'glass-panel p-5 mb-4 relative overflow-visible group'}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <div className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-lg bg-blue-50 flex items-center justify-center`}>
                        <FileText size={16} className="text-blue-600" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-800">과업지시서 업로드</h3>
                        <p className="text-[10px] text-slate-500">PDF 또는 TXT 파일을 업로드하면 프로젝트 기본 정보가 자동으로 채워집니다.</p>
                    </div>
                </div>
            </div>

            <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed rounded-xl ${compact ? 'p-4' : 'p-6'} transition-all cursor-pointer flex flex-col items-center justify-center gap-2
                    ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'}`}
            >
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept=".pdf,.txt"
                    className="hidden"
                />

                {isLoading ? (
                    <>
                        <Loader2 size={24} className="text-blue-500 animate-spin" />
                        <span className="text-xs font-medium text-slate-600">문서를 텍스트로 변환 및 분석 중입니다...</span>
                    </>
                ) : (
                    <>
                        <UploadCloud size={24} className={isDragging ? 'text-blue-500' : 'text-slate-400'} />
                        <div className="text-center">
                            <span className="text-xs font-semibold text-slate-700 block">클릭하거나 파일을 여기로 드래그하세요</span>
                            <span className="text-[10px] text-slate-500">지원 형식: PDF, TXT</span>
                        </div>
                    </>
                )}
            </div>

            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 p-3 bg-red-50 rounded-lg flex items-start gap-2 border border-red-100">
                        <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                        <span className="text-xs text-red-600">{error}</span>
                        <button onClick={() => setError(null)} className="ml-auto"><X size={12} className="text-red-400 hover:text-red-600" /></button>
                    </motion.div>
                )}
                {success && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 p-3 bg-green-50 rounded-lg flex items-start gap-2 border border-green-100">
                        <CheckCircle2 size={14} className="text-green-600 mt-0.5 shrink-0" />
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-green-700">추출 완료!</span>
                            <span className="text-[10px] text-green-600">프로젝트 정보가 성공적으로 업데이트 되었습니다. 하단 패널을 확인하세요.</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
