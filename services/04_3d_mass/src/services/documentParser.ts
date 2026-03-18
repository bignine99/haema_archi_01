/**
 * 과업지시서 파서 – PDF / TXT 파일에서 프로젝트 정보 + 세부 지침을 추출
 * 
 * ★ 핵심 원칙 ★
 * "과업 지시서를 매우 꼼꼼하게 읽고 분석한 후,
 *  설계자에게 직접적으로 도움이 될 사항 또는 특별히 주의하여야 할 사항만 기재한다."
 * 
 * ■ 반드시 포함해야 할 것:
 *   - 구체적 수치가 있는 설계 기준 (면적, 폭, 높이, 등급, 대수)
 *   - 법적/인증 의무사항 (내진, ZEB, BF, CPTED 등)
 *   - 안전/피난/소방 관련 특수 요구사항
 *   - 시설별 구체적 요구조건 (교실 면적, 복도 폭, 주차 기준 등)
 *   - 발주처의 특별 지시사항
 * 
 * ■ 절대 포함하지 말 것:
 *   - 단순 목차/제목 (제1장, 일반사항, 공통사항 등)
 *   - 분야명만 나열한 줄 (건축분야, 구조분야 등)
 *   - 구체적 내용 없는 원론적 문구
 *   - 모든 프로젝트에 공통인 당연한 사항
 */

export interface ParsedProjectData {
    projectName?: string;
    address?: string;
    zoneType?: string;
    buildingUse?: string;
    landArea?: number;
    grossFloorArea?: number;
    commercialFloors?: number;
    residentialFloors?: number;
    totalFloors?: number;
    undergroundFloors?: number;
    buildingCoverageLimit?: number;
    floorAreaRatioLimit?: number;
    maxHeight?: number;
    constructionCost?: string;
    designScope?: string;
    certifications?: string[];
    rawText?: string;

    // ─── 세부 섹션 (설계자에게 직접 도움이 되는 핵심 사항) ───
    generalGuidelines?: string[];   // 일반지침 — 설계 수행 시 준수사항
    designGuidelines?: string[];    // 설계지침 — 분야별 구체적 기술 요구
    deliverables?: string[];        // 성과품 작성 및 납품
    keyNotes?: string[];            // 주요 확인사항 — 특기사항/法的 제약
    facilityList?: string[];        // 시설 구성
    designDirection?: string[];     // 설계 방향 — 프로젝트 특수 요구
}

/* ───────────── public API ───────────── */
export async function parseDocument(file: File): Promise<ParsedProjectData> {
    let text = '';

    if (file.name.endsWith('.pdf') || file.type === 'application/pdf') {
        text = await extractTextFromPDF(file);
    } else if (file.name.endsWith('.txt') || file.type === 'text/plain') {
        text = await file.text();
    } else {
        throw new Error('지원하지 않는 파일 형식입니다. PDF 또는 TXT만 가능합니다.');
    }

    if (!text.trim()) throw new Error('파일에서 텍스트를 추출하지 못했습니다.');

    console.log('[과업지시서 파서] 추출된 텍스트 길이:', text.length);

    // 1단계: regex 기반 구조 데이터 추출 (사업명, 주소, 면적, 층수 등)
    const result = analyzeDocument(text);
    result.rawText = text.substring(0, 5000);

    // 2단계: ★ Gemini AI 분석 — 핵심 요약 (일반지침, 설계지침, 확인사항 등)
    try {
        const { analyzeWithGemini } = await import('./geminiService');
        console.log('[Gemini] AI 분석 시작...');
        const aiResult = await analyzeWithGemini(text);

        if (aiResult) {
            console.log('[Gemini] AI 분석 성공! 결과 적용 중...');
            // AI 분석 결과로 덮어쓰기 (AI가 더 정확한 요약 제공)
            if (aiResult.designDirection.length > 0) result.designDirection = aiResult.designDirection;
            if (aiResult.generalGuidelines.length > 0) result.generalGuidelines = aiResult.generalGuidelines;
            if (aiResult.designGuidelines.length > 0) result.designGuidelines = aiResult.designGuidelines;
            if (aiResult.keyNotes.length > 0) result.keyNotes = aiResult.keyNotes;
            if (aiResult.deliverables.length > 0) result.deliverables = aiResult.deliverables;
            if (aiResult.certifications.length > 0) result.certifications = aiResult.certifications;
        } else {
            console.warn('[Gemini] AI 분석 실패, regex 결과 사용');
        }
    } catch (error) {
        console.error('[Gemini] AI 연동 오류, regex 결과 사용:', error);
    }

    console.log('[과업지시서 파서] 최종 결과:', JSON.stringify(result, null, 2));
    return result;
}

/* ───────────── PDF → text ───────────── */
let pdfjsPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
    if (pdfjsPromise) return pdfjsPromise;
    pdfjsPromise = new Promise((resolve, reject) => {
        if ((window as any).pdfjsLib) { resolve((window as any).pdfjsLib); return; }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        script.onload = () => {
            const lib = (window as any).pdfjsLib;
            if (!lib) { reject(new Error('pdf.js 로드 실패')); return; }
            lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            resolve(lib);
        };
        script.onerror = () => reject(new Error('pdf.js CDN 로드 실패'));
        document.head.appendChild(script);
    });
    return pdfjsPromise;
}

async function extractTextFromPDF(file: File): Promise<string> {
    const pdfjsLib = await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const items = content.items as any[];
        if (items.length === 0) continue;

        // y좌표 기반 줄 그룹화
        const lines: { y: number; items: { x: number; str: string }[] }[] = [];
        for (const item of items) {
            if (!item.str || item.str.trim() === '') continue;
            const y = Math.round(item.transform[5]);
            const x = item.transform[4];
            let line = lines.find(l => Math.abs(l.y - y) < 3);
            if (!line) { line = { y, items: [] }; lines.push(line); }
            line.items.push({ x, str: item.str });
        }

        lines.sort((a, b) => b.y - a.y);
        for (const line of lines) {
            line.items.sort((a, b) => a.x - b.x);
            fullText += line.items.map(it => it.str).join(' ') + '\n';
        }
        fullText += '\n';
    }
    return fullText;
}

/* ══════════════════════════════════════════════════════════════
   1단계: 텍스트 전처리 — 깨진 줄을 의미 있는 항목(item)으로 재구성
   ══════════════════════════════════════════════════════════════ */

/** 번호 매김 패턴: 새로운 항목의 시작을 나타냄 */
function isItemStart(line: string): boolean {
    const t = line.trim();
    if (/^\d+[\.\)]\s/.test(t)) return true;
    if (/^[가-힣][\.\)]\s/.test(t)) return true;
    if (/^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*/.test(t)) return true;
    if (/^[-·•◦▪▸►]\s/.test(t)) return true;
    if (/^제\s*\d+\s*(장|조|절|항|편)/.test(t)) return true;
    return false;
}

/** 섹션 제목인지 판별 (본문이 아닌, 구조적 제목) */
function isSectionHeader(line: string): boolean {
    const t = line.trim();
    if (/^제\s*\d+\s*(장|조|절|항|편)\s*.{0,20}$/.test(t)) return true;

    const headers = [
        '공통사항', '일반사항', '총칙', '개요', '서론', '결론', '목차', '기타',
        '일반지침', '설계지침', '성과품', '특기사항', '확인사항', '설계용역 개요',
        '설계 범위', '설계 지침', '설계범위', '용역범위', '설립부지 현황',
        '공간구성', '시설현황', '사업개요', '적용기준', '관련법규',
    ];
    for (const h of headers) {
        if (t === h || t.replace(/\s/g, '') === h.replace(/\s/g, '')) return true;
    }

    if (/^[\d가-힣]+[\.\)]\s*[가-힣]{2,4}(분야|사항|범위|지침|개요)\s*$/.test(t)) return true;
    return false;
}

/** raw text → 의미 있는 항목 리스트로 재구성 */
function reconstructItems(text: string): string[] {
    const rawLines = text.split('\n');
    const items: string[] = [];
    let currentItem = '';

    for (const rawLine of rawLines) {
        const line = rawLine.trim();
        if (!line) {
            if (currentItem.trim()) {
                items.push(currentItem.trim());
                currentItem = '';
            }
            continue;
        }

        if (isItemStart(line) || isSectionHeader(line)) {
            if (currentItem.trim()) {
                items.push(currentItem.trim());
            }
            currentItem = line;
        } else {
            if (currentItem) {
                currentItem += ' ' + line;
            } else {
                currentItem = line;
            }
        }
    }
    if (currentItem.trim()) items.push(currentItem.trim());
    return items;
}

/* ══════════════════════════════════════════════════════════════
   2단계: 항목 품질 점수 산정 — 설계자 관점 엄격 평가
   ══════════════════════════════════════════════════════════════ */

/** 절대 제외 패턴 — 제목/소제목/일반법규/원론적 문구 */
function isAbsolutelyExcluded(item: string): boolean {
    const t = item.trim();
    if (t.length < 10) return true;
    if (isSectionHeader(t)) return true;
    if (/^\s*\d+[\.\)]\s*$/.test(t)) return true;
    if (/^\s*[가-힣][\.\)]\s*$/.test(t)) return true;
    // 분야명만 나열
    if (/^[\d가-힣]*[\.\)]\s*(건축|구조|토목|조경|기계설비|전기설비|통신|소방전기?)\s*(분야)?\s*(설계)?\s*(포함)?\.?\s*$/.test(t)) return true;
    if (/^[\d가-힣]*[\.\)]\s*(건축|기계|전기|통신)(설비)?(설계)?\s*[:：]\s*[가-힣]{2,4}(,\s*[가-힣]{2,4})*\s*$/.test(t)) return true;
    if (/^관련\s*법규?\s*(및\s*기준)?\s*(적용|준수)\s*$/.test(t)) return true;
    if (/^\d+\s*(페이지|쪽|p\.?)\s*$/i.test(t)) return true;
    // ★ 제목/소제목 패턴 제거
    if (/^(제\s*\d+\s*(장|절|조|항|호)|\d+\s*\.|[가-힣]\s*\.)\s*[가-힣\s]{2,10}\s*$/.test(t)) return true;
    // ★ 일반 법규 나열만 있는 항목
    if (/^(건축법|소방법|국토계획법|도시계획|교육시설|학교시설|장애인|에너지)\s*(관련|시행|적용)/.test(t) && !/\d/.test(t)) return true;
    // ★ 구체적 수치 없는 원론적 문구
    if (/^(설계\s*(시|에)|시공\s*(시|에))\s*(관련|해당|적용|준수)\s*(법규|기준|규정)/.test(t) && t.length < 30) return true;
    // ★ "~에 대한 ~을 ~한다" 형태의 일반 서술
    if (/^[가-힣\s]+(에\s*대한|에\s*관한)\s*[가-힣\s]+(을|를)\s*[가-힣]+(한다|합니다)\s*\.?\s*$/.test(t) && !/\d/.test(t)) return true;
    return false;
}

/** 항목의 설계자 관련 품질 점수 (0~100) */
function scoreDesignerRelevance(item: string): number {
    const t = item.trim();
    const content = t
        .replace(/^[\d가-힣]+[\.\)]\s*/, '')
        .replace(/^[-·•①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
        .trim();

    if (isAbsolutelyExcluded(content)) return 0;

    let score = 0;

    // 구체적 수치
    const numericPatterns = [
        { pat: /\d+(\.\d+)?\s*㎡/, boost: 25 },
        { pat: /\d+(\.\d+)?\s*m\b/i, boost: 25 },
        { pat: /\d+(\.\d+)?\s*mm\b/i, boost: 20 },
        { pat: /\d+(\.\d+)?\s*%(이하|이상)?/, boost: 20 },
        { pat: /\d+\s*층/, boost: 20 },
        { pat: /\d+\s*대/, boost: 15 },
        { pat: /\d+\s*개소/, boost: 15 },
        { pat: /\d+\s*인/, boost: 12 },
        { pat: /\d+\s*학급/, boost: 20 },
        { pat: /\d+\s*(kW|RT|ton|kN|W|lux)/i, boost: 18 },
        { pat: /\d+\s*등급/, boost: 20 },
        { pat: /\d+\s*(시간|분|일|개월)/, boost: 10 },
    ];
    for (const { pat, boost } of numericPatterns) {
        if (pat.test(content)) { score += boost; break; }
    }

    // 안전/법적 핵심 키워드
    const criticalKeywords = [
        { pat: /내진\s*(설계|등급|I등급|특등급)|중요도\s*계수/, boost: 30 },
        { pat: /피난\s*(계획|동선|시설|계단)|수평\s*피난/, boost: 30 },
        { pat: /방화\s*(구획|구조|벽|문)|내화\s*구조/, boost: 25 },
        { pat: /소방\s*(차\s*진입|시설|설비)|소방법/, boost: 25 },
        { pat: /장애인|배리어\s*프리|BF|휠체어|무장애/, boost: 25 },
        { pat: /CPTED|범죄\s*예방/, boost: 20 },
        { pat: /ZEB|제로\s*에너지|패시브\s*(설계|디자인)/, boost: 25 },
        { pat: /석면|유해\s*물질|오염/, boost: 20 },
        { pat: /매장\s*문화재|문화재\s*조사/, boost: 20 },
    ];
    for (const { pat, boost } of criticalKeywords) {
        if (pat.test(content)) { score += boost; }
    }

    // 구체적 설계 행위/요구사항
    const actionRequirements = [
        { pat: /확보\s*(하|하여야|해야|필요)|이상\s*확보/, boost: 15 },
        { pat: /설치\s*(하|하여야|해야|필요|의무)/, boost: 12 },
        { pat: /적용\s*(하|하여야|해야|필수|의무)/, boost: 12 },
        { pat: /준수\s*(하|하여야|해야|필수)/, boost: 12 },
        { pat: /금지|불가|불허|제한/, boost: 15 },
        { pat: /필수|의무|반드시/, boost: 12 },
        { pat: /최소|최대|이상|이하|이내/, boost: 10 },
        { pat: /별도\s*(설계|계획|검토|시설)/, boost: 10 },
    ];
    for (const { pat, boost } of actionRequirements) {
        if (pat.test(content)) { score += boost; break; }
    }

    // 시설/공간 관련
    const facilityKeywords = [
        { pat: /교실\s*(면적|크기|규모)/, boost: 20 },
        { pat: /복도\s*(폭|너비|width)/, boost: 20 },
        { pat: /계단\s*(폭|너비|개소)/, boost: 15 },
        { pat: /주차\s*(대수|면적|규모)/, boost: 15 },
        { pat: /엘리베이터|승강기|EV/, boost: 12 },
        { pat: /층고|천장\s*높이/, boost: 15 },
        { pat: /조망|일조|채광|환기/, boost: 12 },
    ];
    for (const { pat, boost } of facilityKeywords) {
        if (pat.test(content)) { score += boost; }
    }

    if (/인증|등급|에너지\s*효율|녹색\s*건축|장수명/.test(content)) score += 15;
    if (/법\s*제?\s*\d+조|시행령\s*제?\s*\d+조|고시|지침|기준/.test(content)) score += 10;
    if (/장애인등편의법|편의증진법|소방시설법|학교시설|교육시설/.test(content)) score += 15;

    if (content.length >= 30) score += 5;
    if (content.length >= 50) score += 5;

    // ★ 숫자/수치 포함 항목 우대 (마감일, 거리, 면적 등)
    if (/\d+(\.\d+)?\s*(㎡|m\b|mm|%|층|대|개소|인|kW|RT|ton|lux|등급|학급|일|개월|년|시간)/i.test(content)) score += 20;
    if (/\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/.test(content)) score += 25; // 날짜 포함

    // ★ 숫자 없는 일반 서술 감점
    if (!/\d/.test(content) && content.length > 40) score -= 15;

    if (/^(본\s*사업|본\s*용역|본\s*설계)은?\s/.test(content) && content.length < 30) score -= 10;
    if (/관련\s*법규?\s*(및\s*기준)?\s*(에\s*)?(따라|의거|준하여)/.test(content) && content.length < 25) score -= 10;
    if (/설계\s*(도서|보고서|성과품)\s*(작성|제출|납품)/.test(content) && !/\d/.test(content)) score -= 5;
    // ★ 제목/소제목 성격 감점
    if (/^(제\d+\s*(장|절|조)|일반사항|공통사항|총칙|적용범위|목적)/.test(content)) score -= 20;

    return Math.max(0, Math.min(100, score));
}

/* ══════════════════════════════════════════════════════════════
   3단계: 섹션별 추출 — 각 영역에서 가장 중요한 항목 선별
   ══════════════════════════════════════════════════════════════ */

function extractHighQualityItems(textBlock: string, maxItems: number, minScore = 20): string[] {
    const items = reconstructItems(textBlock);
    const scored = items
        .map(item => {
            const cleaned = item
                .replace(/^[\d가-힣]+[\.\)]\s*/, '')
                .replace(/^[-·•①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
                .trim();
            return { original: cleaned, score: scoreDesignerRelevance(cleaned) };
        })
        .filter(s => s.score >= minScore && s.original.length >= 10);

    scored.sort((a, b) => b.score - a.score);

    const unique: string[] = [];
    for (const { original } of scored) {
        // ★ 핵심 요약 변환: 원문 그대로가 아닌 설계자 관점 압축
        const summarized = condenseSentence(original);
        const prefix = summarized.substring(0, 15);
        if (!unique.some(u => u.substring(0, 15) === prefix)) {
            unique.push(summarized);
        }
        if (unique.length >= maxItems) break;
    }
    return unique;
}

/**
 * ★ 설계자 관점 핵심 요약 — 1~2줄 이내 불릿 스타일로 압축
 * 
 * 원칙:
 * 1. 최대 60자 이내로 압축
 * 2. 숫자/수치 데이터는 반드시 보존 (마감일, 거리, 면적 등)
 * 3. 제목/소제목/일반법규 명칭 제거
 * 4. 핵심 행위 + 조건/수치만 남기기
 */
function condenseSentence(text: string): string {
    let s = text.trim();

    // 1. 불필요한 부분 제거
    s = s
        .replace(/법\s*제?\s*\d+조의?\d*\s*(제\s*\d+\s*항)?/g, '')
        .replace(/시행령\s*제?\s*\d+조의?\d*\s*(제\s*\d+\s*항)?/g, '')
        .replace(/같은\s*법\s*(시행령\s*)?(제?\s*\d+조의?\d*)?/g, '')
        .replace(/동법\s*(시행령\s*)?(제?\s*\d+조의?\d*)?/g, '')
        .replace(/「[^」]*」/g, '')
        .replace(/\([^)]*관련[^)]*\)/g, '')
        .replace(/에\s*(의거|따라|근거하여|준하여|의하여)\s*/g, ' ')
        .replace(/(본\s*)?(사업|용역|설계)(은|의|에서|는)?\s*/g, '')
        .replace(/상기|전술한|전항의/g, '')
        .replace(/및\s*관련\s*법규?에?\s*따라/g, '')
        // ★ 제목/소제목 성격 텍스트 제거
        .replace(/^(제\s*\d+\s*(장|절|조)\s*)/g, '')
        .replace(/^(일반사항|공통사항|총칙|적용범위|목적)\s*[:：]?\s*/g, '')
        .replace(/^(건축|구조|토목|조경|기계|전기|통신|소방)\s*(분야|설비)?\s*[:：]?\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    // 2. 의무형 → 간결 표현
    s = s
        .replace(/하여야\s*(합니다|한다|함)\.?/g, ' 필수')
        .replace(/하여야\s*할\s*것/g, ' 필수')
        .replace(/(되어야|이어야|여야)\s*(합니다|한다|함)\.?/g, '')
        .replace(/토록\s*(합니다|한다|하여야)\.?/g, '')
        .replace(/바랍니다|바람\.?/g, '')
        .replace(/것으로\s*한다\.?/g, '')
        .replace(/하도록\s*한다\.?/g, '')
        .replace(/[.。]\s*$/g, '')
        .trim();

    // 3. 숫자+단위 정보 추출 (반드시 보존)
    const allNumbers: string[] = [];
    const numExtract = [
        /\d+(\.\d+)?\s*㎡/g,
        /\d+(\.\d+)?\s*m\b/gi,
        /\d+(\.\d+)?\s*mm/gi,
        /\d+(\.\d+)?\s*%(이하|이상)?/g,
        /\d+\s*층/g, /\d+\s*대/g, /\d+\s*개소/g,
        /\d+\s*인/g, /\d+\s*세대/g,
        /\d+\s*(kW|RT|ton|lux|dB)/gi,
        /\d+\s*등급/g, /\d+\s*학급/g,
        /\d+\s*(일|개월|년|시간)/g,
        /\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/g,  // 날짜
    ];
    for (const pat of numExtract) {
        const m = s.match(pat);
        if (m) allNumbers.push(...m);
    }

    // 4. 60자 초과 시 압축
    if (s.length > 60) {
        // 핵심 주어+행위 추출 (첫 절)
        const firstClause = s.split(/[,，;；]/)[0]?.trim() || '';

        // 숫자가 있으면 숫자 포함 부분만 추출
        if (allNumbers.length > 0) {
            // 숫자 포함 절(clause) 추출
            const clauses = s.split(/[,，;；]/).map(c => c.trim()).filter(c => c.length > 0);
            const numClauses = clauses.filter(c => /\d/.test(c));

            if (numClauses.length > 0) {
                s = numClauses.slice(0, 2).join(', ');
            } else {
                s = firstClause + ' (' + allNumbers.slice(0, 3).join(', ') + ')';
            }
        } else {
            // 숫자 없으면 첫 절만
            s = firstClause;
        }

        // 여전히 길면 자르기
        if (s.length > 60) {
            s = s.substring(0, 57) + '...';
        }
    }

    // 5. 최종 정리
    s = s
        .replace(/\s{2,}/g, ' ')
        .replace(/^[\s,，;；—\-·•]+/, '')
        .replace(/[\s,，;；—\-]+$/, '')
        .trim();

    return s || text.substring(0, 55) + '...';
}

/* ══════════════════════════════════════════════════════════════
   유틸리티 함수
   ══════════════════════════════════════════════════════════════ */
function extractNumber(text: string): number | null {
    const m = text.match(/([0-9][0-9,]*\.?\d*)/);
    if (m) return parseFloat(m[1].replace(/,/g, ''));
    return null;
}

function extractKoreanMoney(text: string): string | null {
    const m1 = text.match(/(약\s*)?([0-9][0-9,]*\.?\d*)\s*(조|억|만|천)?\s*원/);
    if (m1) return m1[0].replace(/\s+/g, ' ').trim();
    const m2 = text.match(/([0-9][0-9,]*)\s*(천원|만원|백만원)/);
    if (m2) return m2[0].replace(/\s+/g, ' ').trim();
    return null;
}

function extractSectionBlock(text: string, sectionPatterns: RegExp[], endPatterns: RegExp[]): string {
    for (const startPat of sectionPatterns) {
        const startMatch = startPat.exec(text);
        if (!startMatch) continue;
        const startIdx = startMatch.index + startMatch[0].length;
        let endIdx = text.length;
        for (const endPat of endPatterns) {
            const subText = text.substring(startIdx);
            const endMatch = endPat.exec(subText);
            if (endMatch && endMatch.index > 0) {
                endIdx = Math.min(endIdx, startIdx + endMatch.index);
            }
        }
        const block = text.substring(startIdx, endIdx);
        if (block.trim().length > 20) return block;
    }
    return '';
}

/* ══════════════════════════════════════════════════════════════
   메인 분석 함수 — 과업지시서 전문 분석
   ══════════════════════════════════════════════════════════════ */
function analyzeDocument(text: string): ParsedProjectData {
    const data: ParsedProjectData = {};
    // ★ PDF 문자간 띄어쓰기 수정: "설 계 용 역" → "설계용역"
    let cleaned = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
    // 한글 단자 사이 공백 제거 (3자 이상 연속된 패턴)
    for (let i = 0; i < 5; i++) {
        cleaned = cleaned.replace(/([가-힣])\s([가-힣])/g, '$1$2');
    }
    const n = cleaned;

    // ═══ 1. 사업명 ═══
    for (const pat of [/사\s*업\s*명\s*[:：\-]?\s*(.+)/, /과\s*업\s*명\s*[:：\-]?\s*(.+)/]) {
        const m = n.match(pat);
        if (m) {
            let name = m[1].split('\n')[0].trim();
            name = name.replace(/\s*(설계\s*용역|기본\s*설계|실시\s*설계).*$/i, '').trim();
            name = name.replace(/\s+\d+[\.\\)]\s.*$/, '').trim();
            if (name.length > 1) { data.projectName = name; break; }
        }
    }

    // ═══ 2. 대지 위치 ═══
    for (const pat of [/(대\s*지\s*)?위\s*치\s*[:：\-]?\s*(.+)/, /소\s*재\s*지\s*[:：\-]?\s*(.+)/]) {
        const m = n.match(pat);
        if (m) {
            let addr = (m[2] || m[1] || '').split('\n')[0].trim();
            addr = addr.replace(/\s*(일원|일대|외\s*\d*\s*필지|부지).*$/, '').trim();
            addr = addr.replace(/\s+\d+[\.\\)]\s.*$/, '').trim();
            addr = addr.replace(/\s*\([^)]*\)\s*$/, '').trim();
            if (addr.length > 5) { data.address = addr; break; }
        }
    }

    // ═══ 3. 용도지역 ═══
    const zoneM = n.match(/용\s*도\s*지\s*역\s*[:：\-]?\s*(.+)/);
    if (zoneM) {
        const raw = zoneM[1].split('\n')[0].trim();
        const zonePat = raw.match(/(제\s*\d\s*종\s*[가-힣]+지역|[가-힣]+주거지역|[가-힣]+상업지역|[가-힣]+공업지역)/);
        data.zoneType = zonePat ? zonePat[1].replace(/\s+/g, ' ').trim() : raw.split(/[,，\s]{2,}/)[0].trim();
    }
    if (!data.zoneType) {
        const zoneAlt = n.match(/지\s*역\s*[\/·]\s*지\s*구\s*[:：\-]?\s*(.+)/);
        if (zoneAlt) {
            const raw = zoneAlt[1].split('\n')[0].trim();
            data.zoneType = raw.split(/[,，]/)[0].trim();
        }
    }

    // ═══ 4. 부지면적 / 대지면적 ═══
    for (const pat of [/부\s*지\s*면\s*적\s*[:：\-]?\s*([^\n]*)/, /대\s*지\s*면\s*적\s*[:：\-]?\s*([^\n]*)/]) {
        const m = n.match(pat);
        if (m) {
            const num = extractNumber(m[1]);
            if (num && num > 0) { data.landArea = num; break; }
        }
    }

    // ═══ 5. 연면적 ═══
    const gfaM = n.match(/연\s*면\s*적\s*[:：\-]?\s*([^\n]*)/);
    if (gfaM) { const num = extractNumber(gfaM[1]); if (num && num > 0) data.grossFloorArea = num; }

    // ═══ 6. 건폐율 ═══
    const bcrM = n.match(/건\s*폐\s*율\s*[:：\-]?\s*([0-9][0-9,.]*)(\s*%)?/);
    if (bcrM) data.buildingCoverageLimit = parseFloat(bcrM[1].replace(/,/g, ''));

    // ═══ 7. 용적률 ═══
    const farPatterns = [
        /용\s*적\s*률\s*[:：\-]?\s*(\d+)\s*%/,
        /용\s*적\s*률\s*[:：\-]?\s*(\d+)\s*%\s*이하/,
        /용\s*적\s*률\s*[:：\-]?\s*(이하\s*)?([0-9][0-9,.]*)\s*%?/,
    ];
    for (const pat of farPatterns) {
        const m = n.match(pat);
        if (m) {
            const val = parseFloat((m[2] || m[1]).replace(/,/g, ''));
            if (val > 0) { data.floorAreaRatioLimit = val; break; }
        }
    }

    // ═══ 8. 높이제한 ═══
    for (const pat of [/높\s*이\s*(제\s*한)?\s*[:：\-]?\s*([0-9][0-9,.]*)\s*(m|미터)?/i, /최\s*고\s*높\s*이\s*[:：\-]?\s*([0-9][0-9,.]*)/i]) {
        const m = n.match(pat);
        if (m) { const v = parseFloat((m[2] || m[1]).replace(/,/g, '')); if (v > 0) { data.maxHeight = v; break; } }
    }

    // ═══ 9. 주용도 ═══
    for (const pat of [/주\s*용\s*도\s*[:：\-]?\s*([^\n]+)/, /건\s*축\s*용\s*도\s*[:：\-]?\s*([^\n]+)/]) {
        const m = n.match(pat);
        if (m) {
            let use = m[1].split('\n')[0].trim().replace(/\s+\d+[\.\\)]\s.*$/, '').replace(/\s*\([^)]*\)\s*$/, '').split(/[,，]/)[0].trim();
            if (use.length > 1) { data.buildingUse = use; break; }
        }
    }

    // ═══ 10. 규모 ═══
    for (const pat of [/지\s*하\s*(\d+)\s*층[^지]*지\s*상\s*(\d+)\s*층/, /B\s*(\d+)\s*[\/·,]\s*(\d+)\s*F/i]) {
        const m = n.match(pat);
        if (m) {
            data.undergroundFloors = parseInt(m[1], 10);
            const ground = parseInt(m[2], 10);
            data.totalFloors = ground;
            const isEdu = data.buildingUse && /교육|학교/.test(data.buildingUse);
            data.commercialFloors = isEdu ? 0 : Math.max(1, Math.floor(ground * 0.2));
            data.residentialFloors = ground - (data.commercialFloors || 0);
            break;
        }
    }
    if (!data.totalFloors) {
        const gm = n.match(/지\s*상\s*(\d+)\s*층/);
        if (gm) {
            const ground = parseInt(gm[1], 10);
            data.totalFloors = ground;
            const isEdu = data.buildingUse && /교육|학교/.test(data.buildingUse);
            data.commercialFloors = isEdu ? 0 : Math.max(1, Math.floor(ground * 0.2));
            data.residentialFloors = ground - (data.commercialFloors || 0);
        }
    }

    // ═══ 11. 총사업비 ═══
    const costM = n.match(/(총\s*사\s*업\s*비|공\s*사\s*비|사\s*업\s*비)\s*[:：\-]?\s*([^\n]+)/);
    if (costM) {
        const money = extractKoreanMoney(costM[2]);
        if (money) data.constructionCost = money;
        else { const c = costM[2].split('\n')[0].replace(/\s*\(.*$/, '').trim(); if (c.length > 1) data.constructionCost = c; }
    }

    // ═══ 12. 인증 ═══
    const certs: string[] = [];
    const zebM = n.match(/ZEB\s*(\d등급)?/i);
    if (zebM) certs.push(zebM[1] ? `ZEB ${zebM[1]}` : 'ZEB (제로에너지건축물)');
    else if (/제로\s*에너지/.test(n)) certs.push('ZEB (제로에너지건축물)');
    if (/BF|배리어\s*프리|Barrier\s*Free/i.test(n)) certs.push('BF (Barrier Free) 인증');
    if (/녹색\s*건축/.test(n)) certs.push('녹색건축 인증');
    if (/장수명/.test(n)) certs.push('장수명 주택 인증');
    const eeM = n.match(/에너지\s*효율\s*(\d등급)?/i);
    if (eeM) certs.push(eeM[1] ? `에너지효율 ${eeM[1]}` : '에너지효율 등급');
    if (/스마트\s*건축/.test(n)) certs.push('스마트건축 인증');
    if (/내진/.test(n)) certs.push('내진설계 적용');
    if (/범죄\s*예방|CPTED/i.test(n)) certs.push('CPTED (범죄예방설계)');
    if (certs.length) data.certifications = certs;

    // ═══ 13. 설계기간 ═══
    const periodM = n.match(/(설\s*계\s*기\s*간|사\s*업\s*기\s*간|용\s*역\s*기\s*간)\s*[:：\-]?\s*([^\n]+)/);
    if (periodM) { const p = periodM[2].split('\n')[0].replace(/\s+\d+[\.\\)]\s.*$/, '').trim(); if (p.length > 2) data.designScope = p; }

    // ═══════════════════════════════════════════════════════════
    // ★ 세부 섹션: 전문 전체에서 설계자 핵심 정보 추출
    //
    // ■ 카테고리 역할 분리 (중복 없이):
    //   설계방향 = 프로젝트 배경/추진 사유 (왜 필요한가)
    //   일반지침 = 설계 절차/프로세스 (VE, 중간보고 등)
    //   설계지침 = 분야별 구체적 기술 기준 (치수, 성능 등)
    //   주요확인사항 = 법적 의무/금지/안전 사항
    //   인증 = certifications에 이미 추출 → 다른 섹션에서 제외
    //
    // ■ 중복 방지: usedItems Set
    // ═══════════════════════════════════════════════════════════

    const allItems = reconstructItems(n);

    const scoredItems = allItems
        .map(item => {
            const cleaned = item
                .replace(/^[\d가-힣]+[\.\)]\s*/, '')
                .replace(/^[-·•①②③④⑤⑥⑦⑧⑨⑩]\s*/, '')
                .trim();
            return { text: cleaned, score: scoreDesignerRelevance(cleaned) };
        })
        .filter(s => s.score >= 20 && s.text.length >= 10);

    // ★ 중복 방지
    const usedItems = new Set<string>();

    /** 인증 항목인지 (certifications에서 이미 추출됨) */
    function isCertItem(t: string): boolean {
        return /^(ZEB|BF\s|녹색\s*건축\s*인증|에너지\s*효율\s*\d등급|장수명|스마트\s*건축|Barrier\s*Free)/.test(t)
            || /^[가-힣]*\s*(ZEB|BF)\s/.test(t)
            || (/인증/.test(t) && /등급/.test(t) && t.length < 30);
    }

    /** usedItems에 없고 인증 항목이 아닌 것만 추가 */
    function addUnique(target: string[], candidates: string[], max: number): void {
        for (const item of candidates) {
            if (target.length >= max) break;
            const pfx = item.substring(0, 15);
            if (usedItems.has(pfx)) continue;
            if (isCertItem(item)) continue;
            if (target.some(t => t.substring(0, 15) === pfx)) continue;
            target.push(item);
            usedItems.add(pfx);
        }
    }

    // ─── 14. 설계 방향 (프로젝트 배경/추진 사유만) ───
    const dirCandidates = scoredItems
        .filter(s => {
            const t = s.text;
            return (
                /과밀|과대|증가|해소|부족|확충|노후|이전|통합|신설|확장/.test(t) ||
                /추진\s*(배경|사유|목적)|설립\s*(배경|목적|필요)/.test(t) ||
                /학습권|교육권|보장|향상|증진/.test(t) ||
                /추진하고자|요구되는바|필요성/.test(t)
            ) && s.score >= 15 && !isCertItem(t);
        })
        .sort((a, b) => b.score - a.score)
        .map(s => s.text);

    if (dirCandidates.length > 0) {
        const dirResult: string[] = [];
        addUnique(dirResult, dirCandidates, 4);
        if (dirResult.length > 0) data.designDirection = dirResult;
    }

    // ─── 15. 일반지침 (설계 절차/프로세스 준수사항) ───
    const genCandidates: string[] = [];

    const genBlock = extractSectionBlock(n,
        [/일\s*반\s*지\s*침/, /적\s*용\s*기\s*준/],
        [/설\s*계\s*지\s*침/, /제\s*\d+\s*장/, /성\s*과\s*품/]
    );
    if (genBlock) {
        genCandidates.push(...extractHighQualityItems(genBlock, 6, 25));
    }

    const genFromAll = scoredItems
        .filter(s => {
            const t = s.text;
            return (
                /에너지\s*소비\s*최소화|패시브\s*(설계|디자인)/.test(t) ||
                /피난\s*(계획|안전|동선)|수평\s*피난/.test(t) ||
                /VE|가치\s*공학/.test(t) ||
                /과업수행계획서/.test(t) ||
                /중간\s*보고|중간\s*설계/.test(t) ||
                /사전\s*재해\s*영향/.test(t) ||
                /환경\s*영향\s*평가/.test(t) ||
                /지질\s*조사|지반\s*조사/.test(t) ||
                /교통\s*영향\s*(평가|분석)/.test(t) ||
                /에너지\s*절약\s*계획/.test(t)
            ) && s.score >= 25 && !isCertItem(t);
        })
        .sort((a, b) => b.score - a.score)
        .map(s => s.text);

    genCandidates.push(...genFromAll);

    if (genCandidates.length > 0) {
        const genResult: string[] = [];
        addUnique(genResult, genCandidates, 6);
        if (genResult.length > 0) data.generalGuidelines = genResult;
    }

    // ─── 16. 설계지침 (분야별 구체적 기술 기준) ───
    const designCandidates: string[] = [];

    const designBlock = extractSectionBlock(n,
        [/설\s*계\s*지\s*침\s*상\s*세/, /설\s*계\s*지\s*침/],
        [/성\s*과\s*품/, /별\s*첨/, /특\s*기\s*사\s*항/]
    );
    if (designBlock) {
        designCandidates.push(...extractHighQualityItems(designBlock, 10, 25));
    }

    const designFromAll = scoredItems
        .filter(s => {
            const t = s.text;
            return (
                /복도\s*(폭|너비)|복도폭/.test(t) ||
                /교실\s*(면적|크기)|일반\s*교실|특별\s*교실/.test(t) ||
                /층고|천장\s*높이/.test(t) ||
                /내진\s*(설계|등급|I등급)|중요도\s*계수/.test(t) ||
                /방화\s*구획|내화\s*구조/.test(t) ||
                /냉난방|공조|환기|급배수/.test(t) ||
                /조도|lux|조명\s*기준/.test(t) ||
                /CCTV|방송|통신/.test(t) ||
                /옥상\s*녹화|친환경\s*자재/.test(t) ||
                /우수\s*저류|빗물\s*이용|투수/.test(t) ||
                /엘리베이터|승강기/.test(t) ||
                /CPTED|범죄\s*예방\s*설계/.test(t) ||
                /무장애\s*(정원|공간)/.test(t) ||
                /개별\s*제어|개별제어/.test(t)
            ) && s.score >= 25 && !isCertItem(t);
        })
        .sort((a, b) => b.score - a.score)
        .map(s => s.text);

    designCandidates.push(...designFromAll);

    if (designCandidates.length > 0) {
        const designResult: string[] = [];
        addUnique(designResult, designCandidates, 8);
        if (designResult.length > 0) data.designGuidelines = designResult;
    }

    // ─── 17. 성과품 작성 및 납품 ───
    const delItems: string[] = [];

    const delBlock = extractSectionBlock(n,
        [/성\s*과\s*품\s*(작\s*성)?/],
        [/별\s*첨/, /서\s*식/, /특\s*기\s*사\s*항/]
    );
    if (delBlock) {
        delItems.push(...extractHighQualityItems(delBlock, 6, 15));
    }

    const deliverableKeywords = [
        { kw: '기본설계 도서', check: /기본설계\s*(도서|보고)/ },
        { kw: '실시설계 도서', check: /실시설계\s*(도서|보고)/ },
        { kw: '구조계산서', check: /구조\s*계산/ },
        { kw: '수량산출서', check: /수량\s*산출/ },
        { kw: '시방서', check: /시방서/ },
        { kw: '내역서', check: /내역서/ },
        { kw: '조감도/투시도', check: /조감도|투시도/ },
        { kw: 'BIM 모형', check: /BIM|빔\s*모/ },
        { kw: '모형 제작', check: /모형\s*(제작|납품)/ },
        { kw: '에너지절약 계획서', check: /에너지\s*절약\s*계획/ },
        { kw: '지질조사 보고서', check: /지질\s*조사/ },
    ];
    for (const d of deliverableKeywords) {
        if (d.check.test(n) && !delItems.some(item => item.includes(d.kw.split(' ')[0]))) {
            delItems.push(d.kw);
        }
    }

    if (delItems.length > 0) {
        data.deliverables = [...new Set(delItems)].slice(0, 10);
    }

    // ─── 18. 주요 확인사항 (법적 의무/금지/안전 사항) ───
    const noteCandidates: string[] = [];

    const noteBlock = extractSectionBlock(n,
        [/특\s*기\s*사\s*항/, /주\s*의\s*사\s*항/, /유\s*의\s*사\s*항/],
        [/제\s*\d+\s*장/, /성\s*과\s*품/, /별\s*첨/]
    );
    if (noteBlock) {
        noteCandidates.push(...extractHighQualityItems(noteBlock, 5, 20));
    }

    const keyLegalPatterns = [
        { check: /장애인\s*편의법|장애인등편의법|편의증진법/, text: '장애인등편의법 및 편의증진법 적용 필수 — 장애인 편의시설 설치 의무' },
        { check: /소방법|소방시설법/, text: '소방시설법 적용 — 방화구획, 피난시설, 소방차 진입로(6m 이상) 확보' },
        { check: /학교\s*시설|교육\s*시설\s*안전/, text: '학교시설 안전관리 기준 적용 — 교육시설 안전 인증 필요' },
        { check: /석면/, text: '석면 함유 건축자재 사용 절대 금지' },
        { check: /매장\s*문화재|문화재\s*조사/, text: '매장문화재 조사 필요 여부 사전 확인 필수' },
    ];

    for (const { check, text: legalText } of keyLegalPatterns) {
        if (check.test(n)) noteCandidates.push(legalText);
    }

    const notesFromAll = scoredItems
        .filter(s => {
            const t = s.text;
            return s.score >= 35 && (
                /금지|불허|불가|절대/.test(t) ||
                /반드시|필수|의무|강제/.test(t) ||
                /위험|위해|탈락|부적합/.test(t) ||
                /소방차\s*진입/.test(t)
            ) && !isCertItem(t);
        })
        .sort((a, b) => b.score - a.score)
        .map(s => s.text);

    noteCandidates.push(...notesFromAll);

    if (noteCandidates.length > 0) {
        const noteResult: string[] = [];
        addUnique(noteResult, noteCandidates, 8);
        if (noteResult.length > 0) data.keyNotes = noteResult;
    }

    // ─── 19. 시설 구성 ───
    const facItems: string[] = [];
    const facKW = [
        '교실', '특별교실', '체육관', '강당', '식당', '급식실', '도서관', '행정실', '교무실',
        '관리동', '기숙사', '주차장', '운동장', '놀이터', '치료실', '상담실', '컴퓨터실',
        '과학실', '음악실', '미술실', '수영장', '강의실', '카페테리아', '회의실',
        '다목적실', '시청각실', '무용실', '탈의실', '기계실', '전기실',
    ];
    for (const kw of facKW) {
        if (n.includes(kw) && facItems.length < 12) facItems.push(kw);
    }
    if (facItems.length > 0) data.facilityList = [...new Set(facItems)].slice(0, 12);

    return data;
}
