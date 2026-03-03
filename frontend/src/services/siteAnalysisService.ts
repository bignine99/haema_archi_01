/**
 * 대지분석 AI 서비스 — Gemini 기반 5대 영역 종합 대지분석
 * 
 * 5대 분석 영역:
 * 1. 물리적·기하학적 환경 분석
 * 2. 미기후 및 환경 성능 분석
 * 3. 인프라 및 교통 접근성 분석
 * 4. 인문·사회적 맥락 분석
 * 5. 종합 분석 및 디자인 전략 도출
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// ────── 입력 타입 ──────
export interface SiteAnalysisInput {
  projectName: string;
  address: string;
  zoneType: string;
  buildingUse: string;
  landArea: number;
  grossFloorArea: number;
  totalFloors: number;
  maxHeight: number;
  buildingCoverageLimit: number;
  floorAreaRatioLimit: number;
  certifications: string[];
  roadWidth: number;
  northAngle: number;
  rawText?: string;
}

// ────── 출력 타입 ──────
export interface AnalysisItem {
  title: string;
  content: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
}

export interface AnalysisSection {
  id: string;
  title: string;
  icon: string;
  items: AnalysisItem[];
  summary: string;
}

export interface SwotItem {
  category: 'strength' | 'weakness' | 'opportunity' | 'threat';
  items: string[];
}

export interface DesignStrategy {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface SiteAnalysisResult {
  sections: AnalysisSection[];
  swot: SwotItem[];
  designStrategies: DesignStrategy[];
  massRecommendations: string[];
  certChecklist: string[];
  analyzedAt: string;
}

// ────── Gemini 프롬프트 ──────
function buildPrompt(info: SiteAnalysisInput): string {
  const docRef = info.rawText
    ? `\n\n[과업지시서 원문 (처음 3000자)]\n${info.rawText.substring(0, 3000)}`
    : '';

  return `당신은 대한민국 건축설계 전문가이자 도시계획가입니다. 20년차 건축사 수준의 전문성으로 아래 프로젝트의 대지분석을 수행하세요.

[프로젝트 정보]
- 사업명: ${info.projectName || '미정'}
- 대지위치: ${info.address || '미정'}
- 용도지역: ${info.zoneType || '미정'}
- 건축물 용도: ${info.buildingUse || '미정'}
- 대지면적: ${info.landArea?.toLocaleString() || 0}㎡
- 연면적: ${Math.round(info.grossFloorArea || 0).toLocaleString()}㎡
- 층수: 지상 ${info.totalFloors || 0}층
- 높이제한: ${info.maxHeight || 0}m
- 건폐율: ${info.buildingCoverageLimit || 0}%
- 용적률: ${info.floorAreaRatioLimit || 0}%
- 전면도로 폭: ${info.roadWidth || 0}m
- 진북 방향: ${info.northAngle || 0}°
- 인증 요구: ${info.certifications?.join(', ') || '없음'}

★★★ 분석 지침 ★★★

5대 영역을 각각 상세하게 분석하여 JSON으로 반환하세요.

[영역 1: 물리적·기하학적 환경 분석]
- 대지 형상(정형/부정형), 장변/단변 방향, 도로 접면 현황 분석
- 건축가능영역 산출: 대지면적 × 건폐율 = 최대 건축면적 계산
- setback(이격거리)에 따른 유효 대지 면적 추정
- 지형 특성: 경남 김해 지역의 일반적 지형 특성 고려
- 절성토 가능성, 기초 형식(직접/파일) 예측

[영역 2: 미기후 및 환경 성능 분석]
- 김해 지역 기후 특성: 연평균 기온, 강수량, 일조 시간
- 절기별 태양 궤적: 교실 배치에 최적화된 방향 제안
- 주풍향: 여름철(남동풍), 겨울철(북서풍) 분석
- 건물 배치에 따른 풍로(Wind Path), 환기 효율 검토
- 소음원 분석: 도로 교통소음, 인접 시설 소음 영향
- 특수학교 정온 환경이 필요한 공간의 최적 배치 방향

[영역 3: 인프라 및 교통 접근성 분석]
- 진출입구 최적 위치: 보행자(특수학교 학생 안전) vs 차량 분리
- 스쿨존, 장애인 동선, 긴급차량 접근 고려
- 대중교통 연계: 버스, 장애인 콜택시 승하차 구역
- 무장애(Barrier-Free) 보행 동선 설계 가이드
- 상하수도, 전기 인입점 일반 방향 추정

[영역 4: 인문·사회적 맥락 분석]
- 외부 조망(View-out): 대지에서 바라보는 주요 경관
- 내부 조망(View-in): 외부에서 건물을 바라보는 정면성
- 인근 교육/복지 시설과의 시너지 가능성
- 지역사회 거점 역할 정의 (특수교육 허브)
- 인근 유사 시설(학교)의 건폐율/용적률/층수 참고

[영역 5: 종합 분석 및 디자인 전략]
- SWOT 분석: 강점/약점/기회/위협
- 최적 매스 배치 제안: 법규 + 일조 + 소음 + 접근성 고려
- 교실동, 체육관, 특별교실, 치료실 등 기능별 배치 전략
- 외부공간: 운동장, 치료정원, 감각정원 배치 제안
- 인증(ZEB, BF, CPTED 등) 대응을 위한 배치 체크리스트

★★★ 매우 중요: 모든 분석에 구체적 수치를 포함하세요 ★★★
- 면적(㎡), 거리(m), 각도(°), 비율(%), 시간 등
- 막연한 "고려하세요" 금지 → 구체적 제안/수치 필수

★ 반환 형식 (순수 JSON만, 마크다운 코드블록 없이) ★
{
  "sections": [
    {
      "id": "S1",
      "title": "물리적·기하학적 환경 분석",
      "icon": "🏔️",
      "summary": "1줄 핵심 요약",
      "items": [
        { "title": "항목명", "content": "상세 분석 내용 (2~3줄, 수치 포함)", "importance": "critical|high|medium|low" }
      ]
    },
    {
      "id": "S2",
      "title": "미기후 및 환경 성능 분석",
      "icon": "☀️",
      "summary": "...",
      "items": [...]
    },
    {
      "id": "S3",
      "title": "인프라 및 교통 접근성 분석",
      "icon": "🚗",
      "summary": "...",
      "items": [...]
    },
    {
      "id": "S4",
      "title": "인문·사회적 맥락 분석",
      "icon": "🏘️",
      "summary": "...",
      "items": [...]
    },
    {
      "id": "S5",
      "title": "종합 분석 및 디자인 전략",
      "icon": "🎯",
      "summary": "...",
      "items": [...]
    }
  ],
  "swot": [
    { "category": "strength", "items": ["강점1", "강점2", ...] },
    { "category": "weakness", "items": ["약점1", ...] },
    { "category": "opportunity", "items": ["기회1", ...] },
    { "category": "threat", "items": ["위협1", ...] }
  ],
  "designStrategies": [
    { "title": "전략명", "description": "상세 설명 (3~4줄)", "priority": "high|medium|low" }
  ],
  "massRecommendations": [
    "매스 배치 제안 1줄 (구체적)",
    "매스 배치 제안 2줄",
    ...
  ],
  "certChecklist": [
    "인증 체크 항목 (구체적 기준 포함)",
    ...
  ]
}

각 section의 items는 최소 5개, 최대 10개로 충분히 상세하게 작성하세요.
SWOT 각 항목은 3~5개씩 작성하세요.
designStrategies는 5~8개 작성하세요.
massRecommendations는 6~10개 작성하세요.
certChecklist는 8~12개 작성하세요.
${docRef}`;
}

// ────── API 호출 ──────
export async function analyzeSite(
  input: SiteAnalysisInput
): Promise<SiteAnalysisResult | null> {
  try {
    console.log('[대지분석] Gemini AI 분석 시작...', {
      project: input.projectName,
      address: input.address,
      area: input.landArea,
    });

    const prompt = buildPrompt(input);

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.25,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      console.error('[대지분석] API 오류:', response.status);
      return null;
    }

    const result = await response.json();
    const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('[대지분석] 응답 없음');
      return null;
    }

    const parsed = JSON.parse(content);

    console.log('[대지분석] 분석 완료:', {
      sections: parsed.sections?.length,
      strategies: parsed.designStrategies?.length,
    });

    return {
      sections: parsed.sections || [],
      swot: parsed.swot || [],
      designStrategies: parsed.designStrategies || [],
      massRecommendations: parsed.massRecommendations || [],
      certChecklist: parsed.certChecklist || [],
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[대지분석] 오류:', error);
    return null;
  }
}
