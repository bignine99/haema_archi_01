/**
 * ══════════════════════════════════════════════
 * 토지이용규제정보 서비스 (Frontend)
 * ══════════════════════════════════════════════
 * 
 * Python FastAPI 백엔드 (포트 8010) 직접 호출 (CORS 허용)
 * 
 * 데이터 흐름:
 *   프론트엔드 → http://localhost:8010/api/land-use?address=...
 *   → FastAPI → 카카오(PNU변환) + VWorld(토지이용계획 속성조회) → XML 파싱 → JSON
 * 
 * API: VWorld getLandUseAttr (v2.0)
 * 작성일: 2026-03-06
 */

// ─── API Base URL ───
const LAND_USE_API_BASE = 'http://localhost:8010';

// ─── 규제 항목 상세 정보 ───
export interface RegulationDetail {
    related_law: string;             // 관련 법령
    restriction_summary: string;     // 행위제한 요약
    design_impact: string;           // 설계 영향
    management_agency: string;       // 관리기관
    reference_url: string;           // 참고 URL
}

// ─── 토지이용규제 개별 항목 인터페이스 ───
export interface LandUseRegulationItem {
    pnu: string;
    regulation_name: string;         // 용도지역지구명 (ex: "제2종일반주거지역")
    regulation_code: string;         // 용도지역지구코드 (ex: "UQA122")
    regulation_type: string;         // 용도구분 (ex: "용도지역")
    cnflc_at: string;                // 포함(1)/저촉(2) 구분
    building_coverage_rate: number | null;  // 건폐율 (%)
    floor_area_ratio: number | null;        // 용적률 (%)
    law_name: string;                // 관련법령
    article_name: string;            // 관련 조항명
    restriction_content: string;     // 행위제한 내용
    management_agency: string;       // 관리기관
    detail: RegulationDetail | null; // 상세 정보 (코드 기반)
}

// ─── PNU 정보 인터페이스 ───
export interface PnuInfo {
    pnu: string;                     // 19자리 필지고유번호
    address_full: string;            // 전체 주소
    b_code: string;                  // 법정동코드
    land_type: string;               // 대지구분 (1=대지, 2=산)
    main_no: string;                 // 본번
    sub_no: string;                  // 부번
    sido: string;                    // 시도명
    sigungu: string;                 // 시군구명
    dong: string;                    // 읍면동명
}

// ─── 종합 분석 결과 인터페이스 ───
export interface LandUseRegulationResult {
    pnu_info: PnuInfo;
    total_count: number;             // 총 규제 항목 수
    regulations: LandUseRegulationItem[];
    zone_types: string[];            // 용도지역 목록
    max_building_coverage: number | null;  // 최대 건폐율 (%)
    max_floor_area_ratio: number | null;   // 최대 용적률 (%)
    special_zones: string[];         // 특별 지구/구역 목록
    error: string | null;
}

// ─── API 호출 (주소 → 종합 분석) ───
export async function fetchLandUseRegulation(address: string): Promise<LandUseRegulationResult> {
    const encodedAddress = encodeURIComponent(address);

    // FastAPI 백엔드 직접 호출 (CORS 허용)
    const url = `${LAND_USE_API_BASE}/api/land-use?address=${encodedAddress}`;

    console.log('[LandUseService] API 호출:', url);

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[LandUseService] API 오류:', response.status, errorText);
            throw new Error(`토지이용규제 API 오류 (${response.status}): ${errorText}`);
        }

        const data: LandUseRegulationResult = await response.json();
        console.log('[LandUseService] 응답:', data);

        return data;
    } catch (err: any) {
        if (err.message?.includes('Failed to fetch') || err.name === 'TypeError') {
            throw new Error(
                '토지이용규제 서비스(포트 8010)가 실행 중인지 확인하세요.\n' +
                '실행 명령: cd services/land_use_regulation && python land_use_service.py serve'
            );
        }
        throw err;
    }
}

// ─── API 호출 (PNU 직접 입력) ───
export async function fetchLandUseByPnu(pnu: string): Promise<LandUseRegulationResult> {
    const url = `${LAND_USE_API_BASE}/api/land-use-by-pnu?pnu=${pnu}`;

    console.log('[LandUseService] PNU 직접 조회:', url);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`토지이용규제 API 오류 (${response.status})`);
    }

    return response.json();
}

// ─── PNU 변환만 수행 ───
export async function fetchPnuCode(address: string): Promise<PnuInfo> {
    const encodedAddress = encodeURIComponent(address);
    const url = `${LAND_USE_API_BASE}/api/pnu?address=${encodedAddress}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`PNU 변환 실패 (${response.status})`);
    }

    return response.json();
}

// ─── 서비스 상태 확인 ───
export async function checkLandUseServiceHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${LAND_USE_API_BASE}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(3000),  // 3초 타임아웃
        });
        return response.ok;
    } catch {
        return false;
    }
}

// ─── 결과를 설계자 친화적 포맷으로 변환 ───
export function formatRegulationForDesigner(result: LandUseRegulationResult) {
    const { zone_types, max_building_coverage, max_floor_area_ratio, special_zones, regulations } = result;

    return {
        // 핵심 요약
        summary: {
            zoneTypes: zone_types.length > 0 ? zone_types : ['조회 불가'],
            buildingCoverage: max_building_coverage != null ? `${max_building_coverage}%` : '미확인',
            floorAreaRatio: max_floor_area_ratio != null ? `${max_floor_area_ratio}%` : '미확인',
            specialZones: special_zones.length > 0 ? special_zones : ['없음'],
            totalRegulations: regulations.length,
        },

        // 용도지역 관련 규제
        zoneRegulations: regulations.filter(r =>
            r.regulation_type.includes('용도지역') || r.regulation_type.includes('용도')
        ),

        // 용도지구/구역 관련 규제
        districtRegulations: regulations.filter(r =>
            r.regulation_type.includes('지구') || r.regulation_type.includes('구역')
        ),

        // 기타 규제
        otherRegulations: regulations.filter(r =>
            !r.regulation_type.includes('용도지역') &&
            !r.regulation_type.includes('용도') &&
            !r.regulation_type.includes('지구') &&
            !r.regulation_type.includes('구역')
        ),
    };
}
