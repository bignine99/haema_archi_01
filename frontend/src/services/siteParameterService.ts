/**
 * SiteParameter 추출 서비스 — 정성적 대지분석 → 정량적 JSON 파라미터 변환 엔진
 * 
 * 모델: gemini-2.5-flash-lite
 * 역할: AI 법규분석 + 토지이용규제 결과를 기반으로
 *       3D 제너레이티브 디자인 엔진(Three.js)과 유전 알고리즘(GA)이
 *       직접 읽고 연산할 수 있는 정량적 JSON(SiteParameters)을 추출·생성
 * 
 * [해결하는 5대 병목]
 *   1. 정성적 표현→정확한 상수(Constant) 변환
 *   2. 제약조건 충돌→보수적 자동 해결 (가장 엄격한 기준 적용)
 *   3. DEM/지형 데이터 파라미터화
 *   4. SWOT 범주 오류 교정 (내부/외부 분리)
 *   5. JSON SiteParameters 스키마 강제
 */

import { useProjectStore } from '@/store/projectStore';
import type { ProjectInfoForRegulation, RegulationAnalysisResult } from './regulationAnalysisService';
import type { LandUseRegulationResult } from './landUseService';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

// ══════════════════════════════════════════════
// ███ SiteParameters 인터페이스 (3D 엔진 입력)
// ══════════════════════════════════════════════

/** 프로젝트 기본 정보 (확정 수치) */
export interface ProjectBase {
    site_area_sqm: number;
    target_gfa_sqm: number;
    building_use: string;
    building_use_code: string;
    pnu: string;
}

/** Hard Constraints — 보수적 충돌 해결 적용 */
export interface HardConstraints {
    applied_max_floors: number;
    applied_max_height_m: number;
    max_coverage_ratio_pct: number;
    max_far_pct: number;
    calculated_max_building_area_sqm: number;
    calculated_max_gfa_sqm: number;
    conflict_resolution_log: ConflictResolution[];
}

/** 충돌 해결 로그 */
export interface ConflictResolution {
    parameter: string;
    source_a: string;
    value_a: number | string;
    source_b: string;
    value_b: number | string;
    resolved_value: number | string;
    rule: string; // "보수적 적용" | "법규 우선" 등
}

/** Setback 파라미터 (건축선 후퇴) */
export interface SetbackParameters {
    road_setbacks: RoadSetback[];
    north_sunlight_setback_applies: boolean;
    north_sunlight_formula: string;
    min_neighbor_setback_m: number;
}

export interface RoadSetback {
    direction: string;
    road_width_m: number;
    setback_m: number;
    road_classification: string;
}

/** 환경 벡터 (방위·바람·일조) */
export interface EnvironmentalVectors {
    optimal_mass_axis_angle: number;
    true_north_angle: number;
    prevailing_wind_summer_angle: number;
    prevailing_wind_winter_angle: number;
    best_solar_orientation: string;
    noise_source_direction: string;
}

/** 지형/DEM 파라미터 */
export interface TerrainParameters {
    avg_ground_level_m: number;
    min_elevation_m: number;
    max_elevation_m: number;
    elevation_diff_m: number;
    slope_pct: number;
    terrain_classification: string;
    estimated_cut_volume_m3: number;
    estimated_fill_volume_m3: number;
    foundation_recommendation: string;
}

/** 프로그램 조닝 규칙 */
export interface ProgramZoningRules {
    noise_sensitive_zones: string[];
    noise_sensitive_location_preference: string;
    noise_generating_zones: string[];
    noise_generating_location_preference: string;
    outdoor_required_zones: string[];
    accessibility_priority_zones: string[];
}

/** SWOT 분석 (범주 교정 적용) */
export interface CorrectedSWOT {
    /** 대지 자체의 물리적 장점 (Internal) */
    strengths: string[];
    /** 대지 자체의 물리적 단점 (Internal) */
    weaknesses: string[];
    /** 외부 환경 기회 (External) */
    opportunities: string[];
    /** 외부 환경 위협 (External) */
    threats: string[];
}

/** 최종 SiteParameters 인터페이스 */
export interface SiteParameters {
    version: string;
    generated_at: string;
    project_base: ProjectBase;
    hard_constraints: HardConstraints;
    setback_parameters: SetbackParameters;
    environmental_vectors: EnvironmentalVectors;
    terrain_parameters: TerrainParameters;
    program_zoning_rules: ProgramZoningRules;
    corrected_swot: CorrectedSWOT;
    data_confidence: Record<string, string>;
}

// ══════════════════════════════════════════════
// ███ Gemini 프롬프트 빌더
// ══════════════════════════════════════════════

function buildSiteParameterPrompt(
    projectInfo: ProjectInfoForRegulation,
    landUse: LandUseRegulationResult | null,
    analysisCategories: string,
): string {
    // 토지이용규제 데이터 정리
    const landUseData = landUse ? `
[토지이용규제 API 데이터 (공공데이터 팩트)]
- PNU: ${landUse.pnu_info?.pnu || '미확인'}
- 용도지역: ${landUse.zone_types?.join(', ') || '미확인'}
- 건폐율(조례): ${landUse.max_building_coverage ?? '미확인'}%
- 용적률(조례): ${landUse.max_floor_area_ratio ?? '미확인'}%
- 특수지구: ${landUse.special_zones?.join(', ') || '없음'}
- 규제 항목: ${landUse.regulations?.map(r => `${r.regulation_name}(${r.regulation_code})`).join(', ')}` : '';

    return `당신은 건축 AI 파라메트릭 엔진의 데이터 전처리기입니다. 감정과 수사를 모두 제거하고, 오직 기하학 연산기가 읽을 수 있는 정량적 JSON만 출력하십시오.

[목표]
정성적 대지분석 텍스트를 기반으로, 3D 제너레이티브 디자인 엔진(Three.js)과 유전 알고리즘(GA)이 직접 읽고 연산할 수 있는 정량적 JSON 데이터 객체(SiteParameters)를 추출·생성하라.

[프로젝트 정보]
- 사업명: ${projectInfo.projectName || '미정'}
- 대지위치: ${projectInfo.address || '미정'}
- 용도지역: ${projectInfo.zoneType || '미정'}
- 건축물 용도: ${projectInfo.buildingUse || '미정'}
- 대지면적: ${projectInfo.landArea || 0}㎡
- 연면적: ${Math.round(projectInfo.grossFloorArea || 0)}㎡
- 층수: 지상 ${projectInfo.totalFloors || 0}층
- 건폐율 한도: ${projectInfo.buildingCoverageLimit || 0}%
- 용적률 한도: ${projectInfo.floorAreaRatioLimit || 0}%
- 높이제한: ${projectInfo.maxHeight || 0}m
- 인증 요구: ${projectInfo.certifications?.join(', ') || '없음'}
${landUseData}

[AI 법규분석 결과 요약]
${analysisCategories}

[과업지시서 원문 참조]
${projectInfo.rawText ? projectInfo.rawText.substring(0, 3000) : '없음'}

╔═════════════════════════════════════════════╗
║  ★★★ 3대 핵심 지시사항 (절대 준수) ★★★    ║
╚═════════════════════════════════════════════╝

[지시 1] 수치화 및 확정 (Quantification)
- "약", "예상됨", "가능성", "완만한" 등 모호한 표현을 전부 제거하라.
- 건축법 및 조례에 근거한 정확한 상수(Constant) 값으로 변환하라.
- 면적은 소수점 1자리까지, 각도는 정수, 거리는 소수점 1자리.
- 예: "약 10~20% 감소 예상" → 도로 사선 및 건축선 후퇴 계산식에 따른 정확한 buildable_area_sqm 도출

[지시 2] 보수적 충돌 해결 (Conservative Resolution)
- 과업지시서와 법규 정보 간의 충돌이 발생할 경우:
  → 무조건 가장 엄격하고 보수적인 기준(Hard Constraint)을 시스템 파라미터로 확정하라.
  → 예: 층수 제한 과업지시서 5층 vs 프로젝트 입력 10층 → applied_max_floors: 5
  → 예: 건폐율 법규 60% vs 지구단위계획 50% → max_coverage_ratio_pct: 50
- 모든 충돌을 conflict_resolution_log[] 배열에 기록하라.

[지시 3] 기하학적 벡터 도출 (Geometric Vectors)
- 단순 면적이 아닌 방향성(방위각, 축)을 수치로 명시하라.
- optimal_mass_axis_angle: 최적 매스 축 각도 (남향=180°)
- 도로 방위별 setback을 개별 객체로 분리하라.
- 정북 방향 일조사선 적용 여부를 boolean으로 확정하라.

[지시 4] SWOT 범주 교정
- S(Strength)와 W(Weakness)는 대지 자체의 내부적(Internal) 물리 특성만 기재.
  → 좋은 예: "남향 개방", "정형 직사각형 대지", "평탄 지형"
  → 나쁜 예: "수요 증가" (이건 Opportunity), "인증 가치 상승" (이것도 Opportunity)
- O(Opportunity)와 T(Threat)는 외부적(External) 환경 요인만 기재.
  → 좋은 예: "특수학교 수요 증가", "정부 지원 정책", "주변 소음원"

[지시 5] 지형/DEM 추정
- 대지 주소와 주변 환경 정보를 기반으로 지형 파라미터를 추정하라.
- avg_ground_level_m: 추정 평균 표고 (없으면 0)
- slope_pct: 경사도 (%)
- estimated_cut_volume_m3 / estimated_fill_volume_m3: 추정 절토/성토량
- data_confidence에 "terrain": "estimated" 또는 "api_verified" 기재

★ 반환 형식 (반드시 순수 JSON만 반환, 마크다운 코드블록 없이) ★
{
  "version": "1.0",
  "generated_at": "ISO8601",
  "project_base": {
    "site_area_sqm": number,
    "target_gfa_sqm": number,
    "building_use": "string",
    "building_use_code": "string (건축법 용도코드)",
    "pnu": "string"
  },
  "hard_constraints": {
    "applied_max_floors": number,
    "applied_max_height_m": number,
    "max_coverage_ratio_pct": number,
    "max_far_pct": number,
    "calculated_max_building_area_sqm": number,
    "calculated_max_gfa_sqm": number,
    "conflict_resolution_log": [
      {
        "parameter": "string",
        "source_a": "string",
        "value_a": "number|string",
        "source_b": "string",
        "value_b": "number|string",
        "resolved_value": "number|string",
        "rule": "보수적 적용|법규 우선"
      }
    ]
  },
  "setback_parameters": {
    "road_setbacks": [
      {
        "direction": "N|S|E|W|NE|NW|SE|SW",
        "road_width_m": number,
        "setback_m": number,
        "road_classification": "string"
      }
    ],
    "north_sunlight_setback_applies": boolean,
    "north_sunlight_formula": "string",
    "min_neighbor_setback_m": number
  },
  "environmental_vectors": {
    "optimal_mass_axis_angle": number,
    "true_north_angle": number,
    "prevailing_wind_summer_angle": number,
    "prevailing_wind_winter_angle": number,
    "best_solar_orientation": "string",
    "noise_source_direction": "string"
  },
  "terrain_parameters": {
    "avg_ground_level_m": number,
    "min_elevation_m": number,
    "max_elevation_m": number,
    "elevation_diff_m": number,
    "slope_pct": number,
    "terrain_classification": "string (평탄지|완경사|급경사)",
    "estimated_cut_volume_m3": number,
    "estimated_fill_volume_m3": number,
    "foundation_recommendation": "string"
  },
  "program_zoning_rules": {
    "noise_sensitive_zones": ["string"],
    "noise_sensitive_location_preference": "string",
    "noise_generating_zones": ["string"],
    "noise_generating_location_preference": "string",
    "outdoor_required_zones": ["string"],
    "accessibility_priority_zones": ["string"]
  },
  "corrected_swot": {
    "strengths": ["Internal 물리특성만"],
    "weaknesses": ["Internal 물리특성만"],
    "opportunities": ["External 환경요인만"],
    "threats": ["External 환경요인만"]
  },
  "data_confidence": {
    "constraints": "api_verified|estimated",
    "setbacks": "calculated|estimated",
    "terrain": "api_verified|estimated",
    "vectors": "calculated|estimated"
  }
}`;
}

// ══════════════════════════════════════════════
// ███ SiteParameters 추출 API 호출
// ══════════════════════════════════════════════

export async function extractSiteParameters(
    projectInfo: ProjectInfoForRegulation,
    landUseRegulation: LandUseRegulationResult | null,
    analysisResult: RegulationAnalysisResult | null,
): Promise<SiteParameters | null> {
    const apiKey = useProjectStore.getState().geminiApiKey;
    if (!apiKey) {
        console.error('[SiteParams] API 키가 입력되지 않았습니다.');
        return null;
    }

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    // 분석 결과를 텍스트로 정리
    const analysisSummary = analysisResult?.categories?.map(cat => {
        const lawsSummary = cat.laws.map(law =>
            `  - ${law.name} (${law.risk}): ${law.items.slice(0, 3).join(' / ')}`
        ).join('\n');
        return `[${cat.id}] ${cat.title}\n${lawsSummary}`;
    }).join('\n\n') || '분석 결과 없음';

    const prompt = buildSiteParameterPrompt(projectInfo, landUseRegulation, analysisSummary);

    console.log('[SiteParams] 정량적 파라미터 추출 시작...');

    try {
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
            console.error('[SiteParams] API 오류:', response.status, response.statusText);
            return null;
        }

        const result = await response.json();
        const content = result?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!content) {
            console.error('[SiteParams] 응답 텍스트 없음');
            return null;
        }

        const parsed: SiteParameters = JSON.parse(content);

        // 타임스탬프 보정
        if (!parsed.generated_at) {
            parsed.generated_at = new Date().toISOString();
        }
        if (!parsed.version) {
            parsed.version = '1.0';
        }

        console.log('[SiteParams] 추출 완료:', {
            floors: parsed.hard_constraints?.applied_max_floors,
            coverage: parsed.hard_constraints?.max_coverage_ratio_pct,
            far: parsed.hard_constraints?.max_far_pct,
            conflicts: parsed.hard_constraints?.conflict_resolution_log?.length || 0,
        });

        return parsed;
    } catch (error) {
        console.error('[SiteParams] 추출 오류:', error);
        return null;
    }
}
