/**
 * Gemini API 서비스 — 과업지시서 AI 분석
 * 
 * 모델: gemini-2.5-flash-lite
 * 역할: 과업지시서 원문을 면밀히 분석한 후, 
 *       설계자가 꼭 알아야 할 핵심만 불릿 형태로 요약
 */

const GEMINI_API_KEY = 'AIzaSyAkuPhA6QOhwyO9VvQYqWWGZPG3p0zow6c';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

export interface GeminiAnalysisResult {
    designDirection: string[];     // 설계 방향 (핵심 3~5개)
    generalGuidelines: string[];   // 일반지침 요약 (핵심 4~6개)
    designGuidelines: string[];    // 설계지침 요약 (핵심 4~6개)
    keyNotes: string[];            // 주요 확인사항 (핵심 4~6개)
    deliverables: string[];        // 성과품 목록 (키워드)
    certifications: string[];     // 인증 사항 (키워드)
}

const ANALYSIS_PROMPT = `당신은 건축 설계 전문가입니다. 아래 "과업지시서" 원문을 매우 꼼꼼하게 읽고 분석한 후, 설계자가 반드시 인지해야 할 핵심 사항만 추출하여 JSON 형식으로 제공하세요.

★ 핵심 원칙 ★
1. 원문을 그대로 복사하지 마세요. 반드시 핵심만 요약하세요.
2. 각 항목은 1줄(최대 50자) 이내의 불릿 스타일로 작성하세요.
3. 구체적인 숫자(면적, 거리, 기간, 등급 등)는 반드시 포함하세요.
4. 제목, 소제목, 법규 명칭만 나열하지 마세요.
5. "~하여야 한다", "~에 의거하여" 같은 관료적 표현은 제거하세요.
6. 설계자가 실무에서 바로 활용할 수 있는 액션 가능한 정보만 포함하세요.

★ 반환 형식 (반드시 순수 JSON만 반환) ★
{
  "designDirection": ["설계 방향 핵심 3~5개 (예: 친환경 패시브 설계 적용, ZEB 4등급 인증 필수)"],
  "generalGuidelines": ["일반지침 핵심 4~6개 (예: 착수일로부터 180일 이내 설계 완료, VE 2회 실시 필수)"],
  "designGuidelines": ["설계지침 핵심 4~6개 (예: 복도폭 2.4m 이상 확보, 내진 I등급 적용, 층고 3.6m 이상)"],
  "keyNotes": ["주요 확인사항 4~6개 (예: 석면 자재 사용 절대 금지, 소방차 진입로 6m 확보 필수)"],
  "deliverables": ["성과품 키워드 (예: 기본설계도서, 실시설계도서, 구조계산서)"],
  "certifications": ["인증 사항 (예: ZEB 4등급, BF 예비인증, CPTED)"]
}

★ 좋은 예시 ★
- "착수일로부터 180일 이내 실시설계 완료"
- "내진 I등급 적용, 중요도 계수 1.5"
- "복도폭 최소 2.4m, 계단폭 1.5m 이상"
- "배기구 이격거리 5m 이상 확보"
- "제로에너지건축물 4등급 예비인증 필수"
- "소방차 진입로 6m 이상 확보"

★ 나쁜 예시 (이렇게 작성하지 마세요) ★
- "건축법 시행령 제46조에 의거하여 방화구획을 설치하여야 한다" → 너무 길고 법률 인용
- "일반사항" → 제목만 나열
- "관련 법규 및 기준 적용 준수" → 원론적 문구

과업지시서 원문:
`;

export async function analyzeWithGemini(documentText: string): Promise<GeminiAnalysisResult | null> {
    try {
        // 텍스트가 너무 길면 앞뒤 핵심 부분만 추출 (API 토큰 제한)
        let text = documentText;
        if (text.length > 15000) {
            text = text.substring(0, 10000) + '\n\n... (중간 생략) ...\n\n' + text.substring(text.length - 5000);
        }

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: ANALYSIS_PROMPT + text }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 2048,
                    responseMimeType: 'application/json',
                }
            })
        });

        if (!response.ok) {
            console.error('[Gemini] API 호출 실패:', response.status, response.statusText);
            return null;
        }

        const result = await response.json();
        const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            console.error('[Gemini] 응답에 텍스트 없음');
            return null;
        }

        // JSON 파싱
        const parsed = JSON.parse(content);

        console.log('[Gemini] 분석 완료:', {
            designDirection: parsed.designDirection?.length || 0,
            generalGuidelines: parsed.generalGuidelines?.length || 0,
            designGuidelines: parsed.designGuidelines?.length || 0,
            keyNotes: parsed.keyNotes?.length || 0,
        });

        return {
            designDirection: parsed.designDirection || [],
            generalGuidelines: parsed.generalGuidelines || [],
            designGuidelines: parsed.designGuidelines || [],
            keyNotes: parsed.keyNotes || [],
            deliverables: parsed.deliverables || [],
            certifications: parsed.certifications || [],
        };
    } catch (error) {
        console.error('[Gemini] 오류:', error);
        return null;
    }
}
