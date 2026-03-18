/**
 * 법규분석 AI 서비스 — Gemini 기반 8대 카테고리 종합 건축법규 분석
 * 
 * 모델: gemini-2.5-flash-lite
 * 역할: 프로젝트 기본정보를 바탕으로 26+ 건축 관련 법규를
 *       4배치 순차 호출 + 개별 법률 드릴다운으로 상세 분석
 * 
 * ★ 복원: 이전 frontend/ 버전 기반 — 배치 분석 + 드릴다운 시스템
 */

import { useProjectStore } from '@/store/projectStore';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// ────── 입력 타입 ──────
export interface ProjectInfoForRegulation {
  projectName: string;
  address: string;
  zoneType: string;
  buildingUse: string;
  landArea: number;
  grossFloorArea: number;
  totalFloors: number;
  buildingCoverageLimit: number;
  floorAreaRatioLimit: number;
  maxHeight: number;
  certifications: string[];
  rawText?: string;  // 과업지시서 원문 (참조용)
}

// ────── 출력 타입 ──────
export interface RegulationLaw {
  name: string;
  risk: 'required' | 'review' | 'info' | 'na';
  items: string[];
}

export interface RegulationCategory {
  id: string;
  title: string;
  icon: string;
  laws: RegulationLaw[];
  requiredCount: number;
  totalCount: number;
}

export interface RegulationAnalysisResult {
  categories: RegulationCategory[];
  overallSummary: {
    required: number;
    review: number;
    info: number;
  };
  analyzedAt: string;
}

// ────── 단일 호출 프롬프트 (레거시 호환) ──────
function buildPrompt(info: ProjectInfoForRegulation): string {
  const docRef = info.rawText
    ? `\n\n[과업지시서 원문 참조 (처음 5000자)]\n${info.rawText.substring(0, 5000)}`
    : '';

  return `당신은 대한민국 건축법규 전문 컨설턴트입니다. 20년 경력의 건축사 수준으로, 아래 프로젝트에 적용되는 모든 건축 관련 법규를 7대 카테고리별로 철저히 분석하세요.

[프로젝트 정보]
- 사업명: ${info.projectName || '미정'}
- 발주처: ${info.projectName?.includes('교육') || info.buildingUse?.includes('교육') ? '교육청 (공공발주)' : '미정'}
- 대지위치: ${info.address || '미정'}
- 용도지역: ${info.zoneType || '미정'}
- 건축물 용도: ${info.buildingUse || '미정'}
- 대지면적: ${info.landArea || 0}㎡
- 연면적: ${Math.round(info.grossFloorArea || 0)}㎡
- 층수: 지상 ${info.totalFloors || 0}층
- 건폐율 한도: ${info.buildingCoverageLimit || 0}%
- 용적률 한도: ${info.floorAreaRatioLimit || 0}%
- 높이제한: ${info.maxHeight || 0}m
- 인증 요구: ${info.certifications?.join(', ') || '없음'}

★★★ 분석 지침 (매우 중요) ★★★
1. 각 법규별 items를 최소 4개, 최대 8개까지 충분히 상세하게 작성하세요.
2. 모든 항목에 구체적 수치를 반드시 포함하세요.
3. "준수하세요" 같은 막연한 표현 절대 금지.
4. risk 등급: "required"(인허가 불가), "review"(설계 확인), "info"(참고), "na"(해당 없음)

★ 반환 형식 (반드시 순수 JSON만 반환, 마크다운 코드블록 없이) ★
{
  "categories": [
    {
      "id": "B1",
      "title": "입지 및 도시계획 관련 법규",
      "laws": [
        {
          "name": "법률명",
          "risk": "required|review|info|na",
          "items": ["항목1: 구체적 수치·기준 포함"]
        }
      ]
    }
  ]
}${docRef}`;
}

// ────── 단일 호출 API (레거시 호환) ──────
export async function analyzeRegulations(
  projectInfo: ProjectInfoForRegulation
): Promise<RegulationAnalysisResult | null> {
  try {
    const apiKey = useProjectStore.getState().geminiApiKey;
    if (!apiKey) {
      console.error('[법규분석] API 키가 입력되지 않았습니다.');
      return null;
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const prompt = buildPrompt(projectInfo);

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      throw new Error(`Gemini API 오류: ${errorMsg}`);
    }

    const result = await response.json();
    const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return null;

    const parsed = JSON.parse(content);
    const icons: Record<string, string> = {
      B1: '🏙️', B2: '🚗', B3: '🔥', B4: '♿', B5: '🌿', B6: '⚡', B7: '📋',
    };

    let totalRequired = 0, totalReview = 0, totalInfo = 0;

    const categories: RegulationCategory[] = (parsed.categories || []).map((cat: any) => {
      const laws: RegulationLaw[] = (cat.laws || []).map((law: any) => ({
        name: law.name || '',
        risk: law.risk || 'info',
        items: law.items || [],
      }));
      const reqCount = laws.filter(l => l.risk === 'required').length;
      totalRequired += reqCount;
      totalReview += laws.filter(l => l.risk === 'review').length;
      totalInfo += laws.filter(l => l.risk === 'info').length;
      return {
        id: cat.id || '', title: cat.title || '', icon: icons[cat.id] || '📋',
        laws, requiredCount: reqCount, totalCount: laws.filter(l => l.risk !== 'na').length,
      };
    });

    return {
      categories,
      overallSummary: { required: totalRequired, review: totalReview, info: totalInfo },
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[법규분석] 오류:', error);
    throw error;
  }
}

// ══════════════════════════════════════════════
// ███ 배치 분석 시스템 (카테고리별 분할 호출)
// ══════════════════════════════════════════════

export interface BatchDefinition {
  batchId: number;
  label: string;
  categoryIds: string[];
  categoryPrompt: string;
}

export const REGULATION_BATCHES: BatchDefinition[] = [
  {
    batchId: 1,
    label: '입지·교통',
    categoryIds: ['B1', 'B2'],
    categoryPrompt: `B1. 입지 및 도시계획:
- 국토의 계획 및 이용에 관한 법률 (용도지역 건축제한, 건폐율/용적률, 지구단위계획)
- 도시공원 및 녹지 등에 관한 법률 (녹지확보 기준)
- 도로법 및 사도법 (접도 의무, 도로 점용, 시거 확보)
- 문화재보호법 (현상변경, 매장문화재 지표조사)
- 항공안전법 (비행안전구역 높이제한)

B2. 기능 및 교통:
- 주차장법 (부설주차장 대수·규격·차로, 장애인 주차면, 전기차 충전)
- 도시교통정비 촉진법 (교통영향평가, 진출입구, 가감속차로)`,
  },
  {
    batchId: 2,
    label: '안전·복지',
    categoryIds: ['B3', 'B4'],
    categoryPrompt: `B3. 안전 및 방재:
- 소방시설법 (스프링클러, 옥내소화전, 비상방송, 소방차진입로, 피난설비)
- 화재예방법 (방화구획, 방화문, 내화구조, 방화보안계획)
- 다중이용업소 안전관리법 (비상구, 완강기)
- 지진·화산재해대책법 (내진등급, 중요도계수, 내진성능)

B4. 복지 및 보건:
- 장애인등편의법 (출입구, 경사로, 점자블록, 장애인화장실, 승강기, BF인증)
- 노인복지법/영유아보육법 (노유자시설 층수제한, 피난구, 조리실 규격)`,
  },
  {
    batchId: 3,
    label: '환경·기반시설',
    categoryIds: ['B5', 'B6'],
    categoryPrompt: `B5. 환경 및 에너지:
- 녹색건축물 조성 지원법 (에너지절약계획서, EPI, ZEB인증, BEMS)
- 대기/물환경보전법 (비산먼지, 수질오염방지)
- 소음·진동관리법 (층간소음, 실내소음, 교통소음)
- 환경영향평가법 (소규모환경영향평가)

B6. 기반시설 및 기술:
- 하수도법 (정화조 용량, 공공하수도 연결)
- 수도법 (저수조, 절수설비)
- 신재생에너지법 (공공건축물 신재생에너지 의무설치 비율)
- 정보통신/전기공사업법 (구내통신, 전기설비)`,
  },
  {
    batchId: 4,
    label: '기타 특수',
    categoryIds: ['B7'],
    categoryPrompt: `B7. 기타 특수:
- 주택법 (공동주택 건설기준)
- 교육환경 보호법 (학교경계 200m, 교육환경평가)
- 건축물관리법 (해체계획, 유지관리 설계)`,
  },
];

function buildBatchPrompt(info: ProjectInfoForRegulation, batch: BatchDefinition): string {
  let extraLaws = '';
  if (batch.batchId === 4 && (info.buildingUse?.includes('교육') || info.projectName?.includes('학교') || info.projectName?.includes('특수학교'))) {
    extraLaws = `\n- 학교시설사업 촉진법 (학교시설 설계기준, 교실면적, 운동장)\n- 학교보건법 (환기량 21.6㎥/인·h, 조도 300lux, 음용수 기준)`;
  }

  const docRef = info.rawText
    ? `\n\n[과업지시서 원문 참조 (처음 3000자)]\n${info.rawText.substring(0, 3000)}`
    : '';

  return `당신은 대한민국 건축법규 전문 컨설턴트입니다. 20년 경력의 건축사 수준으로, 아래 프로젝트에 적용되는 건축 관련 법규를 철저히 분석하세요.

[프로젝트 정보]
- 사업명: ${info.projectName || '미정'}
- 발주처: ${info.projectName?.includes('교육') || info.buildingUse?.includes('교육') ? '교육청 (공공발주)' : '미정'}
- 대지위치: ${info.address || '미정'}
- 용도지역: ${info.zoneType || '미정'}
- 건축물 용도: ${info.buildingUse || '미정'}
- 대지면적: ${info.landArea || 0}㎡
- 연면적: ${Math.round(info.grossFloorArea || 0)}㎡
- 층수: 지상 ${info.totalFloors || 0}층
- 건폐율 한도: ${info.buildingCoverageLimit || 0}%
- 용적률 한도: ${info.floorAreaRatioLimit || 0}%
- 높이제한: ${info.maxHeight || 0}m
- 인증 요구: ${info.certifications?.join(', ') || '없음'}

★ 분석 지침 (매우 중요) ★
1. 각 법규별 items를 최소 5개, 최대 8개까지 충분히 상세하게 작성하세요.
2. 모든 항목에 구체적 수치를 반드시 포함하세요 (거리m, 면적㎡, 대수, 비율%, 등급, 층수, 폭원 등).
3. "준수하세요" 같은 막연한 표현 절대 금지. 설계자가 실무에서 바로 적용할 수 있는 치수·기준 제시.
4. risk 등급: "required"(위반 시 인허가 불가), "review"(설계 단계 확인), "info"(참고), "na"(해당 없음)
5. "na" 항목에도 사유를 간단히 기재하세요.
6. 이 프로젝트의 용도(${info.buildingUse})를 정확히 고려하여 분석하세요.
${info.certifications?.length > 0 ? `7. 인증 요구사항(${info.certifications.join(', ')})에 따른 구체적 기준 포함` : ''}

★ 분석 대상 카테고리 ★
${batch.categoryPrompt}${extraLaws}

★ 반환 형식 (반드시 순수 JSON만 반환, 마크다운 코드블록 없이) ★
{
  "categories": [
    {
      "id": "카테고리ID",
      "title": "카테고리명",
      "laws": [
        {
          "name": "법률명",
          "risk": "required|review|info|na",
          "items": ["항목1: 구체적 수치·기준 포함 (최대 80자)", "항목2", ...]
        }
      ]
    }
  ]
}${docRef}`;
}

export async function analyzeSingleBatch(
  projectInfo: ProjectInfoForRegulation,
  batchIndex: number
): Promise<RegulationCategory[]> {
  const batch = REGULATION_BATCHES[batchIndex];
  if (!batch) return [];

  const apiKey = useProjectStore.getState().geminiApiKey;
  if (!apiKey) {
    console.error('[법규분석] API 키가 입력되지 않았습니다.');
    return [];
  }

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const prompt = buildBatchPrompt(projectInfo, batch);

  console.log(`[법규분석] 배치 ${batch.batchId}/${REGULATION_BATCHES.length} (${batch.label}) 분석 시작...`);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const errorMsg = errorBody?.error?.message || `HTTP ${response.status}`;
      console.error(`[법규분석] 배치 ${batch.batchId} API 오류:`, errorMsg);
      throw new Error(`배치 ${batch.batchId} 오류: ${errorMsg}`);
    }

    const result = await response.json();
    const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const icons: Record<string, string> = {
      B1: '🏙️', B2: '🚗', B3: '🔥', B4: '♿', B5: '🌿', B6: '⚡', B7: '📋',
    };

    const categories: RegulationCategory[] = (parsed.categories || []).map((cat: any) => {
      const laws: RegulationLaw[] = (cat.laws || []).map((law: any) => ({
        name: law.name || '',
        risk: law.risk || 'info',
        items: law.items || [],
      }));

      return {
        id: cat.id || '',
        title: cat.title || '',
        icon: icons[cat.id] || '📋',
        laws,
        requiredCount: laws.filter(l => l.risk === 'required').length,
        totalCount: laws.filter(l => l.risk !== 'na').length,
      };
    });

    console.log(`[법규분석] 배치 ${batch.batchId}/${REGULATION_BATCHES.length} 완료: ${categories.length}개 카테고리, 법규 ${categories.reduce((s, c) => s + c.laws.length, 0)}개`);
    return categories;
  } catch (error) {
    console.error(`[법규분석] 배치 ${batch.batchId} 오류:`, error);
    throw error;
  }
}

// ══════════════════════════════════════════════
// ███ 개별 법률 상세 분석 (드릴다운)
// ══════════════════════════════════════════════

export async function analyzeSingleLawDetail(
  projectInfo: ProjectInfoForRegulation,
  lawName: string
): Promise<string[]> {
  const apiKey = useProjectStore.getState().geminiApiKey;
  if (!apiKey) return [];

  const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const prompt = `당신은 대한민국 건축법규 전문 컨설턴트입니다. 20년 경력의 건축사 수준으로, 아래 프로젝트에 대해 "${lawName}" 하나만 집중적으로 매우 상세하게 분석하세요.

[프로젝트 정보]
- 사업명: ${projectInfo.projectName || '미정'}
- 용도지역: ${projectInfo.zoneType || '미정'}
- 건축물 용도: ${projectInfo.buildingUse || '미정'}
- 대지면적: ${projectInfo.landArea || 0}㎡
- 연면적: ${Math.round(projectInfo.grossFloorArea || 0)}㎡
- 층수: 지상 ${projectInfo.totalFloors || 0}층
- 건폐율/용적률: ${projectInfo.buildingCoverageLimit}% / ${projectInfo.floorAreaRatioLimit}%
- 높이제한: ${projectInfo.maxHeight || 0}m
- 인증: ${projectInfo.certifications?.join(', ') || '없음'}

★★★ 상세 분석 지침 (매우 중요) ★★★

1. "${lawName}"의 모든 관련 조항을 빠짐없이 분석하세요.
2. 법률 본조뿐 아니라 시행령, 시행규칙, 관련 고시의 세부 기준도 포함하세요.
3. 각 항목에 반드시 포함할 정보:
   - 적용 근거 조항 (예: 제OO조 제O항)
   - 구체적 수치 기준 (거리, 면적, 비율, 대수, 등급 등)
   - 이 프로젝트에 적용되는 구체적 해석 
   - 위반 시 제재 사항 (과태료, 인허가 불가 등)
4. 최소 10개, 최대 18개 항목으로 작성하세요.
5. 설계자가 바로 실무에 적용할 수 있을 정도로 상세하게 기술하세요.
6. "준수하세요" 같은 막연한 표현은 절대 사용하지 마세요.

★ 반환 형식 (순수 JSON만, 마크다운 없이) ★
{
  "detailItems": [
    "1. [조항명] 구체적 내용 (수치, 기준, 적용 해석 포함)",
    "2. [조항명] ...",
    "..."
  ]
}`;

  console.log(`[법규분석] "${lawName}" 상세 분석 시작...`);

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      console.error(`[법규분석] "${lawName}" API 오류:`, response.status);
      return [];
    }

    const result = await response.json();
    const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return [];

    const parsed = JSON.parse(content);
    const items = parsed.detailItems || parsed.items || [];

    console.log(`[법규분석] "${lawName}" 상세 분석 완료: ${items.length}개 항목`);
    return items;
  } catch (error) {
    console.error(`[법규분석] "${lawName}" 상세 분석 오류:`, error);
    return [];
  }
}
