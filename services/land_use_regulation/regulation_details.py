"""
══════════════════════════════════════════════
규제 코드별 상세 정보 사전
══════════════════════════════════════════════

VWorld getLandUseAttr API는 규제 코드/명칭만 반환합니다.
이 모듈은 코드 접두어를 기반으로 관련 법령, 행위제한, 설계 영향 등
건축 설계에 필요한 상세 정보를 제공합니다.

작성일: 2026-03-06
"""

from typing import Optional
from pydantic import BaseModel, Field


class RegulationDetail(BaseModel):
    """규제 항목의 상세 정보"""
    related_law: str = Field("", description="관련 법령")
    restriction_summary: str = Field("", description="행위제한 요약")
    design_impact: str = Field("", description="설계 영향")
    management_agency: str = Field("", description="관리기관")


# ══════════════════════════════════════════════
# 규제 코드 → 상세 정보 매핑
# ══════════════════════════════════════════════

REGULATION_DETAIL_DB: dict[str, dict] = {

    # ═══ 용도지역 (주거) ═══
    "UQA110": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "전용주거지역: 양호한 주거환경 보호. 단독주택 중심, 4층 이하",
        "design_impact": "건폐율 50%, 용적률 50~100%. 저층 단독주택 위주 개발",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA111": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "제1종전용주거: 단독주택 중심 양호한 주거환경 보호",
        "design_impact": "건폐율 50%, 용적률 50~100%. 단독·다가구주택 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA112": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "제2종전용주거: 공동주택 중심 양호한 주거환경 보호",
        "design_impact": "건폐율 50%, 용적률 100~150%. 공동주택 일부 허용",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA121": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "제1종일반주거: 저층 위주 주거 환경 보호",
        "design_impact": "건폐율 60%, 용적률 100~200%. 4층 이하 중심 개발",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA122": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "제2종일반주거: 중층 위주 주거 환경 조성",
        "design_impact": "건폐율 60%, 용적률 150~250%. 18층 이하 공동주택 가능. 지자체 조례에 따라 층수 제한 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA123": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "제3종일반주거: 중·고층 주거 환경 조성",
        "design_impact": "건폐율 50%, 용적률 200~300%. 층수 제한 없음. 고층 공동주택 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA130": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "준주거: 주거+상업 혼합 지역",
        "design_impact": "건폐율 70%, 용적률 200~500%. 주상복합 가능. 위락시설 일부 제한",
        "management_agency": "시·군·구청 도시과",
    },

    # ═══ 용도지역 (상업) ═══
    "UQA210": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "중심상업: 도심·부도심 상업·업무 기능 핵심",
        "design_impact": "건폐율 90%, 용적률 400~1500%. 대규모 상업·업무시설 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA220": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "일반상업: 일반 상업·업무 기능 담당",
        "design_impact": "건폐율 80%, 용적률 300~1300%. 다양한 용도 건축 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA230": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "근린상업: 근린 생활 편의 제공",
        "design_impact": "건폐율 70%, 용적률 200~900%. 소규모 상가·근린생활시설 중심",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA240": {
        "related_law": "국토계획법 제36조, 동법시행령 제30조",
        "restriction_summary": "유통상업: 유통기능 증진 지역",
        "design_impact": "건폐율 80%, 용적률 200~1100%. 물류·유통시설 중심",
        "management_agency": "시·군·구청 도시과",
    },

    # ═══ 용도지역 (공업) ═══
    "UQA310": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "전용공업: 중화학·공해성 공업 배치",
        "design_impact": "건폐율 70%, 용적률 150~300%. 주거 용도 불가",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA320": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "일반공업: 환경악화 우려 적은 공업 배치",
        "design_impact": "건폐율 70%, 용적률 200~350%. 일부 주거 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA330": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "준공업: 경공업·주거·상업·업무 혼합",
        "design_impact": "건폐율 70%, 용적률 200~400%. 주상복합 가능",
        "management_agency": "시·군·구청 도시과",
    },

    # ═══ 용도지역 (녹지) ═══
    "UQA410": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "보전녹지: 도시 자연환경·경관·산림·녹지 보전",
        "design_impact": "건폐율 20%, 용적률 50~80%. 건축 대부분 제한. 기존 건축물 증축도 까다로움",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA420": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "생산녹지: 농업적 생산 활동 보전",
        "design_impact": "건폐율 20%, 용적률 50~100%. 농업 관련 시설 위주",
        "management_agency": "시·군·구청 도시과",
    },
    "UQA430": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "자연녹지: 도시 녹지공간 확보, 보전 필요성 낮은 지역",
        "design_impact": "건폐율 20%, 용적률 50~100%. 4층 이하 제한. 불가피한 경우만 개발 허용",
        "management_agency": "시·군·구청 도시과",
    },

    # ═══ 관리/농림/자연환경보전 ═══
    "UQB100": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "보전관리: 자연환경 보호·관리",
        "design_impact": "건폐율 20%, 용적률 80%. 개발 극도 제한",
        "management_agency": "시·군·구청",
    },
    "UQB200": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "생산관리: 농림업 생산 관리",
        "design_impact": "건폐율 20%, 용적률 80%. 농림 관련 시설 위주",
        "management_agency": "시·군·구청",
    },
    "UQB300": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "계획관리: 계획적·체계적 관리 필요 지역",
        "design_impact": "건폐율 40%, 용적률 100%. 비도시지역 중 개발 여건이 좋은 곳",
        "management_agency": "시·군·구청",
    },

    # ═══ 도시계획시설 (공원) ═══
    "UQT200": {
        "related_law": "도시공원 및 녹지 등에 관한 법률",
        "restriction_summary": "도시공원: 도시 자연경관 보호·시민 건강증진",
        "design_impact": "공원시설 외 건축행위 금지. 개발행위 극도 제한. 인접지 조경·일조 검토",
        "management_agency": "시·군·구청 공원녹지과",
    },
    "UQT210": {
        "related_law": "도시공원 및 녹지 등에 관한 법률 제15조",
        "restriction_summary": "어린이공원: 어린이 놀이·휴식 공간. 최소면적 1,500㎡ 이상",
        "design_impact": "공원 부지 내 건축 제한. 놀이·편익·조경시설만 설치 가능. 인접 대지는 이격거리·일조 확보·소음 저감 검토 필요",
        "management_agency": "시·군·구청 공원녹지과",
    },
    "UQT220": {
        "related_law": "도시공원 및 녹지 등에 관한 법률 제15조",
        "restriction_summary": "근린공원: 주민 보건·휴양·정서함양 공간",
        "design_impact": "공원 내 건축제한·통과도로 금지. 인접지 건축 시 공원 접근성·조경 배치 고려",
        "management_agency": "시·군·구청 공원녹지과",
    },
    "UQT230": {
        "related_law": "도시공원 및 녹지 등에 관한 법률",
        "restriction_summary": "소공원: 소규모 토지 활용 도시민 휴식 공간",
        "design_impact": "공원시설 외 건축 불가. 면적 250㎡ 이상",
        "management_agency": "시·군·구청 공원녹지과",
    },

    # ═══ 도시계획시설 (도로) ═══
    "UQS110": {
        "related_law": "도시계획시설 규칙 제9조",
        "restriction_summary": "도시계획도로: 도시 내 일반도로",
        "design_impact": "도로 부지 내 건축 불가. 건축선 후퇴(setback) 검토 필요. 차량 진출입 위치 제한 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQS120": {
        "related_law": "도시계획시설 규칙 제10조",
        "restriction_summary": "자동차전용도로: 고속 차량 이동 전용",
        "design_impact": "소음·진동 대책 필요. 차량 직접 진출입 불가. 방음벽·완충녹지 검토",
        "management_agency": "시·군·구청 도시과",
    },
    "UQS200": {
        "related_law": "도시계획시설 규칙",
        "restriction_summary": "광장: 도시 교통·문화·환경 공간",
        "design_impact": "부지 내 건축 불가. 지하공간 활용 가능성 검토",
        "management_agency": "시·군·구청 도시과",
    },

    # ═══ 용도지구 ═══
    "UQG100": {
        "related_law": "국토계획법 제37조",
        "restriction_summary": "경관지구: 경관 보전·관리·형성",
        "design_impact": "건축물 높이·형태·색채 심의 필요. 스카이라인·조망권 확보 요구",
        "management_agency": "시·군·구청 도시과",
    },
    "UQH100": {
        "related_law": "국토계획법 제37조",
        "restriction_summary": "고도지구: 환경보전 위한 건축물 높이 제한",
        "design_impact": "최고고도·최저고도 지정. 절대높이 제한 직접 적용. 사전 확인 필수",
        "management_agency": "시·군·구청 도시과",
    },
    "UQI100": {
        "related_law": "국토계획법 제37조, 건축법 제51조",
        "restriction_summary": "방화지구: 화재 위험 예방 지역",
        "design_impact": "주요 구조부 내화구조 의무. 방화문·방화셔터 필수. 외벽 마감재 불연재료. 공사비 증가 고려",
        "management_agency": "소방서·시·군·구청",
    },
    "UQK100": {
        "related_law": "국토계획법 제37조",
        "restriction_summary": "보존지구: 문화재·전통건축 보존 지역",
        "design_impact": "문화재 주변 건축 심의. 높이·형태·색채 제한 강화. 현상변경 허가 필요",
        "management_agency": "문화재청·시·군·구청",
    },
    "UQF100": {
        "related_law": "국토계획법 제37조",
        "restriction_summary": "방재지구: 풍수해·산사태 등 재해 예방",
        "design_impact": "방재시설 설치 의무. 지반 조사 강화. 우수저류시설 검토",
        "management_agency": "시·군·구청 안전과",
    },

    # ═══ 용도구역 ═══
    "UQQ100": {
        "related_law": "국토계획법 제51조",
        "restriction_summary": "지구단위계획구역: 토지이용 합리화·기능 증진·환경 개선",
        "design_impact": "별도 지구단위계획 지침 적용. 건축물 용도·규모·배치·동선 세부 규정. 건폐율/용적률 완화 가능",
        "management_agency": "시·군·구청 도시과",
    },
    "UQQ200": {
        "related_law": "국토계획법 제38조",
        "restriction_summary": "개발제한구역(그린벨트): 도시 무질서 확산 방지",
        "design_impact": "신규 건축 원칙적 불가. 기존 건축물 개축·증축 제한적 허용. 허가 매우 까다로움",
        "management_agency": "국토교통부·시·군·구청",
    },

    # ═══ 기타 규제구역 ═══
    "UBB100": {
        "related_law": "가축전염병예방법 제17조",
        "restriction_summary": "가축사육제한구역: 가축사육 제한·금지",
        "design_impact": "축사·가축분뇨 관련시설 설치 제한. 일반 건축에는 직접 영향 없음",
        "management_agency": "시·군·구청 축산과",
    },
    "URD100": {
        "related_law": "군사기지 및 군사시설 보호법 제4조",
        "restriction_summary": "대공방어협조구역: 군사시설 보호 목적",
        "design_impact": "고층건축물(항공장애물) 사전 협의 필요. 높이 제한 가능. 군부대 사전 협의 절차 추가",
        "management_agency": "국방부·관할 군부대",
    },
    "URD110": {
        "related_law": "군사기지 및 군사시설 보호법 제4조",
        "restriction_summary": "비행안전구역: 항공기 비행 안전 확보",
        "design_impact": "절대높이 제한 엄격 적용. 구역별 높이기준 상이. 군 사전 협의 필수",
        "management_agency": "국방부·관할 군부대",
    },
    "URD200": {
        "related_law": "군사기지 및 군사시설 보호법",
        "restriction_summary": "군사시설보호구역: 군 시설 보호",
        "design_impact": "건축행위 사전 허가·협의 필요. 개발행위 제한",
        "management_agency": "국방부·관할 군부대",
    },
    "URH100": {
        "related_law": "문화재보호법 제13조",
        "restriction_summary": "역사문화환경 보존지역",
        "design_impact": "문화재 영향 검토 의무. 높이·규모·디자인 심의. 현상변경 허가 필요",
        "management_agency": "문화재청",
    },
    "URA100": {
        "related_law": "수도법 제7조",
        "restriction_summary": "상수원보호구역: 상수원 수질 보전",
        "design_impact": "오염물질 배출시설 설치 금지. 건축 시 오수처리 강화",
        "management_agency": "환경부·수도사업자",
    },
    "URC100": {
        "related_law": "산지관리법 제4조",
        "restriction_summary": "보전산지: 산림보전 의무 지역",
        "design_impact": "산지전용허가 매우 까다로움. 건축 원칙적 제한",
        "management_agency": "산림청·시·군·구청",
    },
}


def get_regulation_detail(code: str, name: str = "") -> Optional[RegulationDetail]:
    """
    규제 코드 또는 명칭으로 상세 정보를 조회.
    
    조회 우선순위:
      1. 정확한 코드 매치 (UQA122)
      2. 코드 접두어 매치 (UQA12x → UQA120)
      3. 명칭 키워드 매치
    """
    # 1. 정확한 코드 매치
    if code in REGULATION_DETAIL_DB:
        return RegulationDetail(**REGULATION_DETAIL_DB[code])
    
    # 2. 코드 접두어 매치 (점점 짧게)
    for trim_len, suffix in [(5, "0"), (4, "00"), (3, "100")]:
        if len(code) >= trim_len:
            prefix = code[:trim_len] + suffix
            if prefix in REGULATION_DETAIL_DB:
                return RegulationDetail(**REGULATION_DETAIL_DB[prefix])
    
    # 3. 명칭 키워드 매치
    name_clean = name.strip()
    if name_clean:
        for db_code, db_info in REGULATION_DETAIL_DB.items():
            summary = db_info.get("restriction_summary", "")
            # 명칭의 핵심 키워드가 요약에 포함되면 매치
            if name_clean in summary or summary.split(":")[0].strip() in name_clean:
                return RegulationDetail(**db_info)
    
    return None
