/**
 * 법규분석 AI 서비스 — Gemini 기반 7대 카테고리 종합 건축법규 분석
 * 
 * 모델: gemini-2.5-flash-lite
 * 역할: 프로젝트 기본정보를 바탕으로 30+ 건축 관련 법규를
 *       자동 분석하여 설계자가 인지해야 할 핵심 사항을 제공
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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

// ────── Gemini 프롬프트 ──────
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
2. 모든 항목에 구체적 수치를 반드시 포함하세요:
   - 거리(m), 면적(㎡), 대수(대), 비율(%), 시간(시간), 등급, 층수, 폭원 등
3. "준수하세요", "확인하세요" 같은 막연한 표현 절대 금지.
   - 나쁜 예: "소방시설을 설치하세요" 
   - 좋은 예: "옥내소화전: 각 층 25m 이내 배치, 소화수량 2.6㎥/min 확보"
4. 설계자가 실무에서 바로 적용할 수 있는 구체적 기준을 제시하세요:
   - 구체적 치수, 이격거리, 설치 개수, 용량, 면적 비율 등
5. risk 등급:
   - "required": 위반 시 인허가 불가 또는 과태료
   - "review": 설계 단계에서 반드시 검토·확인 필요
   - "info": 참고사항 또는 권장사항
   - "na": 이 프로젝트에 해당 없음
6. "na" 항목에도 왜 해당 없는지 간단한 사유 기재
7. 이 프로젝트의 용도(${info.buildingUse})를 정확히 고려하여 분석하세요.
   ${info.buildingUse?.includes('교육') ? '- 교육시설은 학교시설사업 촉진법, 학교보건법, 교육환경보호법 등 교육 관련 특수 법규가 추가 적용됩니다.' : ''}
   ${info.certifications?.length > 0 ? `- 인증 요구사항(${info.certifications.join(', ')})에 따른 구체적 기준도 포함하세요.` : ''}

★ 7대 카테고리 분석 법규 목록 ★

B1. 입지 및 도시계획:
- 국토의 계획 및 이용에 관한 법률 (용도지역 건축제한, 건폐율/용적률, 지구단위계획)
- 도시공원 및 녹지 등에 관한 법률 (녹지확보 기준)
- 도로법 및 사도법 (접도 의무, 도로 점용, 시거 확보)
- 문화재보호법 (현상변경, 매장문화재 지표조사)
- 항공안전법 (비행안전구역 높이제한)

B2. 기능 및 교통:
- 주차장법 (부설주차장 대수·규격·차로, 장애인 주차면, 전기차 충전)
- 도시교통정비 촉진법 (교통영향평가, 진출입구, 가감속차로)

B3. 안전 및 방재:
- 소방시설법 (스프링클러, 옥내소화전, 비상방송, 소방차진입로, 피난설비)
- 화재예방법 (방화구획, 방화문, 내화구조, 방화보안계획)
- 다중이용업소 안전관리법 (비상구, 완강기)
- 지진·화산재해대책법 (내진등급, 중요도계수, 내진성능)

B4. 복지 및 보건:
- 장애인등편의법 (출입구, 경사로, 점자블록, 장애인화장실, 승강기, BF인증)
- 노인복지법/영유아보육법 (노유자시설 층수제한, 피난구, 조리실 규격)

B5. 환경 및 에너지:
- 녹색건축물 조성 지원법 (에너지절약계획서, EPI, ZEB인증, BEMS)
- 대기/물환경보전법 (비산먼지, 수질오염방지)
- 소음·진동관리법 (층간소음, 실내소음, 교통소음)
- 환경영향평가법 (소규모환경영향평가)

B6. 기반시설 및 기술:
- 하수도법 (정화조 용량, 공공하수도 연결)
- 수도법 (저수조, 절수설비)
- 신재생에너지법 (공공건축물 신재생에너지 의무설치 비율)
- 정보통신/전기공사업법 (구내통신, 전기설비)

B7. 기타 특수:
- 주택법 (공동주택 건설기준)
- 교육환경 보호법 (학교경계 200m, 교육환경평가)
- 건축물관리법 (해체계획, 유지관리 설계)
${info.buildingUse?.includes('교육') ? '- 학교시설사업 촉진법 (학교시설 설계기준, 교실면적, 운동장)\n- 학교보건법 (환기량, 조도, 음용수 기준)' : ''}

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
          "items": [
            "항목1: 구체적 수치·기준 포함 (최대 80자)",
            "항목2: ...",
            "항목3: ...",
            "항목4: ..."
          ]
        }
      ]
    }
  ]
}

★ 각 법규별 items 작성 예시 (이 수준으로 상세하게) ★
국토계획법:
- "학교용지(용도지역): 건폐율 60%이하, 용적률 180%이하 적용"
- "지구단위계획 수립 지역 여부 확인 → 건축선·벽면한계선 추가 적용 가능"
- "대지면적 10,623㎡ × 건폐율 60% = 최대 건축면적 6,374㎡"
- "대지면적 10,623㎡ × 용적률 180% = 최대 연면적 19,121㎡"

소방시설법:
- "자동화재탐지설비: 연면적 2,000㎡ 이상 교육시설 전층 설치 의무"
- "옥내소화전: 각 층 보행거리 25m 이내 배치, 수량 2.6㎥/min"
- "스프링클러: 교육연구시설 연면적 5,000㎡ 초과 시 전층 설치"
- "배연설비: 6층 이상 또는 특별피난계단 부속실 설치"
- "소방차 전용구역: 폭 6m 이상 진입로, 회차공간 12m×12m"
- "비상방송설비: 연면적 3,500㎡ 이상 전관 설치"

장애인등편의법:
- "주출입구: 유효폭 1.2m 이상, 턱 없음, 자동문 또는 여닫이"
- "경사로: 기울기 1/18 이하, 유효폭 1.2m, 1.5m마다 수평참"
- "장애인화장실: 각 층 1개소 이상, 유효바닥 1.4m×1.8m"
- "승강기: 11인승 이상, 점자버튼, 음성안내, 표시등 설치"
- "점자블록: 주출입구, 계단, 승강기 전면 경고블록 설치"
- "BF인증: 예비인증 최우수 등급 대응 설계 필요"
${docRef}`;
}

// ────── API 호출 ──────
export async function analyzeRegulations(
  projectInfo: ProjectInfoForRegulation
): Promise<RegulationAnalysisResult | null> {
  try {
    console.log('[법규분석] Gemini AI 분석 시작...', {
      project: projectInfo.projectName,
      use: projectInfo.buildingUse,
      area: projectInfo.landArea,
    });

    const prompt = buildPrompt(projectInfo);

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      console.error('[법규분석] API 오류:', response.status, response.statusText);
      return null;
    }

    const result = await response.json();
    const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error('[법규분석] 응답 텍스트 없음');
      return null;
    }

    const parsed = JSON.parse(content);

    // 카테고리별 아이콘 및 통계 보강
    const icons: Record<string, string> = {
      B1: '🏙️', B2: '🚗', B3: '🔥', B4: '♿', B5: '🌿', B6: '⚡', B7: '📋',
    };

    let totalRequired = 0;
    let totalReview = 0;
    let totalInfo = 0;

    const categories: RegulationCategory[] = (parsed.categories || []).map((cat: any) => {
      const laws: RegulationLaw[] = (cat.laws || []).map((law: any) => ({
        name: law.name || '',
        risk: law.risk || 'info',
        items: law.items || [],
      }));

      const reqCount = laws.filter(l => l.risk === 'required').length;
      const revCount = laws.filter(l => l.risk === 'review').length;
      const infCount = laws.filter(l => l.risk === 'info').length;

      totalRequired += reqCount;
      totalReview += revCount;
      totalInfo += infCount;

      return {
        id: cat.id || '',
        title: cat.title || '',
        icon: icons[cat.id] || '📋',
        laws,
        requiredCount: reqCount,
        totalCount: laws.filter(l => l.risk !== 'na').length,
      };
    });

    console.log('[법규분석] 분석 완료:', {
      categories: categories.length,
      required: totalRequired,
      review: totalReview,
      info: totalInfo,
    });

    return {
      categories,
      overallSummary: {
        required: totalRequired,
        review: totalReview,
        info: totalInfo,
      },
      analyzedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[법규분석] 오류:', error);
    return null;
  }
}
