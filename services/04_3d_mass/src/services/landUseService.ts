/**
 * 토지이용규제정보 조례분석 서비스
 * Python 백엔드 (포트 8010) /api/land-use 호출
 */

export interface PnuInfo {
  pnu: string;
  address_full: string;
  b_code: string;
  sido: string;
  sigungu: string;
  dong: string;
}

export interface RegulationDetail {
  code: string;
  name: string;
  category: string;
  description: string;
  building_coverage_range: string;
  floor_area_ratio_range: string;
  height_limit: string;
  key_restrictions: string[];
  related_law: string;
}

export interface LandUseRegulationItem {
  pnu: string;
  regulation_name: string;
  regulation_code: string;
  regulation_type: string;
  building_coverage_rate: number | null;
  floor_area_ratio: number | null;
  law_name: string;
  article_name: string;
  restriction_content: string;
  management_agency: string;
  detail: RegulationDetail | null;
}

export interface LandUseRegulationResult {
  pnu_info: PnuInfo;
  total_count: number;
  regulations: LandUseRegulationItem[];
  zone_types: string[];
  max_building_coverage: number | null;
  max_floor_area_ratio: number | null;
  special_zones: string[];
  error: string | null;
}

/**
 * 주소로 토지이용규제 조례 분석
 */
export async function analyzeLandUse(address: string): Promise<LandUseRegulationResult> {
  const url = `/land-use-api/api/land-use?address=${encodeURIComponent(address)}`;
  
  console.log('[조례분석] 요청:', address);
  
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`조례분석 API 오류: HTTP ${response.status}`);
  }
  
  const result: LandUseRegulationResult = await response.json();
  
  if (result.error) {
    throw new Error(`조례분석 오류: ${result.error}`);
  }
  
  console.log('[조례분석] 완료:', result.total_count, '건');
  return result;
}
