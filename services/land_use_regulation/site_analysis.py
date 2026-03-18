"""
██████████████████████████████████████████████████████████████████████
███ 대지 분석 엔진 (Site Analysis Engine)                            ███
███ ─────────────────────────────────────────────────────           ███
███ Skill 1: 지구단위계획 감지 + 수동 입력 파라미터 스키마             ███
███ Skill 2: 도로 접도 분석 (방위·폭원·접도길이)                      ███
███ Skill 3: 일조권 사선제한 (정북방향 건축물 높이 제한)              ███
██████████████████████████████████████████████████████████████████████

3가지 치명적 스킬 부재를 해결하는 분석 모듈:
  1. 지구단위계획 감지 → 인허가 반려 방지
  2. 대지-도로 기하학적 접도 분석 → 건축선 후퇴 정확 계산
  3. 정북방향 일조권 사선제한 → 건축법 시행령 제86조 준수

작성일: 2026-03-06
"""

import math
from typing import Optional
from pydantic import BaseModel, Field


# ══════════════════════════════════════════════════════════════
# 공통 데이터 타입
# ══════════════════════════════════════════════════════════════

class Point2D(BaseModel):
    """2D 좌표 (미터 단위)"""
    x: float = Field(..., description="X좌표 (동-서, 미터)")
    y: float = Field(..., description="Y좌표 (남-북, 미터)")


class EdgeInfo(BaseModel):
    """대지 경계선 한 변의 정보"""
    start: Point2D
    end: Point2D
    length: float = Field(..., description="변의 길이 (m)")
    direction: str = Field(..., description="해당 변의 방위 (N/NE/E/SE/S/SW/W/NW)")
    azimuth: float = Field(..., description="방위각 (0°=N, 90°=E, 180°=S, 270°=W)")
    normal_azimuth: float = Field(..., description="외향 법선 방위각")


# ══════════════════════════════════════════════════════════════
# SKILL 1: 지구단위계획 감지 및 수동 입력 스키마
# ══════════════════════════════════════════════════════════════

class DistrictPlanOverride(BaseModel):
    """
    지구단위계획 수동 입력 파라미터.
    
    지구단위계획구역(UQQ100)이 감지된 경우, 국토계획법/조례보다
    지구단위계획 지침이 우선 적용됩니다. 지자체 지침은 공개 API로
    조회 불가하므로 사용자가 반드시 수동 입력해야 합니다.
    """
    # ── 필수 입력 ──
    has_district_plan: bool = Field(True, description="지구단위계획 적용 여부")
    
    # ── 건축 제한 (지침도에서 확인) ──
    max_height: Optional[float] = Field(
        None, description="최고 높이 제한 (m). 지침도의 최고높이 표기 확인"
    )
    min_height: Optional[float] = Field(
        None, description="최저 높이 제한 (m). 가로활성화를 위한 최저높이"
    )
    max_floors: Optional[int] = Field(
        None, description="최고 층수 제한. 지침도에서 '○층 이하' 확인"
    )
    
    # ── 건폐율/용적률 (지구단위계획 완화/강화 적용) ──
    plan_building_coverage: Optional[float] = Field(
        None, description="지구단위계획 건폐율 (%). 일반 조례와 다를 수 있음"
    )
    plan_floor_area_ratio: Optional[float] = Field(
        None, description="지구단위계획 용적률 (%). 완화/강화 가능"
    )
    
    # ── 건축한계선/지정선 ──
    building_limit_line_setback: Optional[float] = Field(
        None, description="건축한계선 후퇴거리 (m). 건축물이 넘어갈 수 없는 선"
    )
    building_designated_line_setback: Optional[float] = Field(
        None, description="건축지정선 후퇴거리 (m). 건축물이 반드시 걸쳐야 하는 선"
    )
    building_designated_line_ratio: Optional[float] = Field(
        None, description="벽면지정비율 (%). 건축지정선에 벽면이 접해야 하는 비율"
    )
    
    # ── 용도 규정 ──
    required_uses: list[str] = Field(
        default_factory=list, description="권장/필수 용도 (예: ['근린생활시설', '문화시설'])"
    )
    prohibited_uses: list[str] = Field(
        default_factory=list, description="불허 용도 (예: ['위락시설', '숙박시설'])"
    )
    
    # ── 외관 디자인 가이드라인 ──
    facade_material: Optional[str] = Field(
        None, description="외벽 마감재 지정 (예: '석재+유리커튼월')"
    )
    facade_color: Optional[str] = Field(
        None, description="외벽 색채 범위 (예: '난색계 (YR, Y)')"
    )
    
    # ── 기타 ──
    plan_document_url: Optional[str] = Field(
        None, description="지구단위계획 고시 문서 URL 또는 파일 경로"
    )
    notes: Optional[str] = Field(
        None, description="추가 참고사항"
    )


class DistrictPlanDetectionResult(BaseModel):
    """지구단위계획 감지 결과"""
    detected: bool = Field(False, description="지구단위계획구역 해당 여부")
    regulation_code: str = Field("", description="해당 코드 (UQQ100 등)")
    regulation_name: str = Field("", description="규제명")
    severity: str = Field("CRITICAL", description="위험도 (CRITICAL/HIGH/MEDIUM)")
    
    # 경고 메시지
    warning_message: str = Field("", description="사용자에게 표시할 경고문")
    action_required: str = Field("", description="필요한 조치 안내")
    
    # 수동 입력 요구 스키마
    manual_input_schema: Optional[dict] = Field(None, description="수동 입력 필드 스키마")
    
    # 현재 적용중인 오버라이드 값
    override: Optional[DistrictPlanOverride] = Field(None, description="사용자 입력값")


def detect_district_plan(regulations: list, special_zones: list[str]) -> DistrictPlanDetectionResult:
    """
    규제 분석 결과에서 지구단위계획구역 감지.
    
    UQQ100 코드 또는 special_zones에 '지구단위계획' 포함 여부 확인.
    감지되면 CRITICAL 경고 + 수동 입력 UI 트리거.
    """
    detected = False
    code = ""
    name = ""
    
    # 규제 항목에서 직접 탐색
    for reg in regulations:
        reg_code = getattr(reg, "regulation_code", "") if hasattr(reg, "regulation_code") else reg.get("regulation_code", "")
        reg_name = getattr(reg, "regulation_name", "") if hasattr(reg, "regulation_name") else reg.get("regulation_name", "")
        
        if reg_code.startswith("UQQ1") or "지구단위" in reg_name:
            detected = True
            code = reg_code
            name = reg_name
            break
    
    # special_zones에서 탐색
    if not detected:
        for zone in special_zones:
            if "지구단위" in zone:
                detected = True
                name = zone
                code = "UQQ100"
                break
    
    if not detected:
        return DistrictPlanDetectionResult(
            detected=False,
            warning_message="지구단위계획구역에 해당하지 않습니다.",
        )
    
    # ── 수동 입력 스키마 생성 ──
    manual_schema = {
        "title": "지구단위계획 세부 지침 입력",
        "description": (
            "본 대지는 지구단위계획구역입니다. "
            "관할 지자체의 지침도를 직접 확인하여 아래 항목을 입력해 주세요. "
            "지구단위계획 지침은 국토계획법/조례보다 우선 적용되므로, "
            "정확한 값을 입력하지 않으면 인허가 반려 위험이 있습니다."
        ),
        "fields": [
            {"name": "max_height", "label": "최고 높이 제한 (m)", "type": "number", "required": True,
             "help": "지침도에서 '최고높이 ◯m 이하' 표기를 확인하세요"},
            {"name": "max_floors", "label": "최고 층수", "type": "integer", "required": False,
             "help": "지침도에서 '◯층 이하' 표기를 확인하세요"},
            {"name": "plan_building_coverage", "label": "건폐율 (%)", "type": "number", "required": True,
             "help": "지구단위계획 지침의 건폐율 (일반 조례와 다를 수 있음)"},
            {"name": "plan_floor_area_ratio", "label": "용적률 (%)", "type": "number", "required": True,
             "help": "지구단위계획 지침의 용적률 (완화/강화 가능)"},
            {"name": "building_limit_line_setback", "label": "건축한계선 후퇴거리 (m)", "type": "number", "required": False,
             "help": "건축물이 넘어갈 수 없는 선까지의 거리"},
            {"name": "building_designated_line_setback", "label": "건축지정선 후퇴거리 (m)", "type": "number", "required": False,
             "help": "건축물이 반드시 걸쳐야 하는 선까지의 거리"},
            {"name": "building_designated_line_ratio", "label": "벽면지정비율 (%)", "type": "number", "required": False,
             "help": "건축지정선에 벽면이 접해야 하는 비율"},
            {"name": "required_uses", "label": "권장/필수 용도", "type": "text", "required": False,
             "help": "쉼표로 구분 (예: 근린생활시설, 문화시설)"},
            {"name": "prohibited_uses", "label": "불허 용도", "type": "text", "required": False,
             "help": "쉼표로 구분 (예: 위락시설, 숙박시설)"},
        ],
        "reference_links": [
            {"label": "토지이음 - 지구단위계획 열람", "url": "https://www.eum.go.kr/web/dp/dpz/getPlanDivMap.do"},
            {"label": "국토교통부 - 도시계획정보서비스", "url": "https://upis.go.kr/"},
        ],
    }
    
    return DistrictPlanDetectionResult(
        detected=True,
        regulation_code=code,
        regulation_name=name,
        severity="CRITICAL",
        warning_message=(
            f"⚠️ 본 대지는 [{name}]에 해당합니다.\n"
            f"지구단위계획 지침은 일반 건폐율/용적률보다 우선 적용되며,\n"
            f"건축한계선·최고높이·권장용도 등 세부 규정이 별도로 존재합니다.\n"
            f"관할 시·군·구청의 '지구단위계획 지침도'를 반드시 확인하세요."
        ),
        action_required=(
            "1. 시·군·구청 도시과에 해당 필지의 지구단위계획 지침도 요청\n"
            "2. 토지이음(eum.go.kr) → 지구단위계획 열람에서 도면 확인\n"
            "3. 아래 입력 양식에 지침도의 규제값을 직접 기입"
        ),
        manual_input_schema=manual_schema,
    )


# ══════════════════════════════════════════════════════════════
# SKILL 2: 도로 접도 분석 (Road Adjacency Analysis)
# ══════════════════════════════════════════════════════════════

class RoadAdjacencyInfo(BaseModel):
    """대지에 접한 도로 1개의 정보"""
    edge_index: int = Field(..., description="대지 경계선 인덱스 (0-based)")
    direction: str = Field(..., description="도로가 접한 방위 (N/S/E/W/NE/...)")
    road_name: str = Field("", description="도로명 (알 수 있는 경우)")
    road_width: Optional[float] = Field(None, description="도로 폭원 (m)")
    road_class: str = Field("", description="도로 등급 (광로/대로/중로/소로/기타)")
    contact_length: float = Field(..., description="접도 길이 (m)")
    setback_required: float = Field(0, description="건축선 후퇴 필요거리 (m)")
    setback_rule: str = Field("", description="후퇴 근거 법규")
    
    # 기하학 데이터
    contact_start: Point2D = Field(..., description="접도 구간 시작점")
    contact_end: Point2D = Field(..., description="접도 구간 끝점")


class RoadAdjacencyResult(BaseModel):
    """도로 접도 분석 종합 결과"""
    total_roads: int = Field(0, description="접도 도로 수")
    roads: list[RoadAdjacencyInfo] = Field(default_factory=list, description="접도 상세")
    
    # 건축법 적합 판단
    meets_access_requirement: bool = Field(False, description="접도 요건 충족 여부")
    min_road_width: Optional[float] = Field(None, description="접한 도로 중 최소 폭원 (m)")
    max_contact_length: Optional[float] = Field(None, description="최대 접도 길이 (m)")
    
    # 건축선 후퇴 요약
    setback_summary: dict = Field(
        default_factory=dict,
        description="방위별 건축선 후퇴거리 {N: 3.0, S: 0, E: 1.5, ...}"
    )
    
    # 경고
    warnings: list[str] = Field(default_factory=list, description="경고 메시지")
    error: Optional[str] = Field(None, description="오류 메시지")


def _azimuth_to_direction(azimuth: float) -> str:
    """방위각(0~360)을 8방위 문자열로 변환"""
    dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    idx = int((azimuth + 22.5) % 360 / 45)
    return dirs[idx]


def _edge_azimuth(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """두 점 사이 방위각 계산 (0°=N, 시계방향)"""
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    angle = math.degrees(math.atan2(dx, dy))  # atan2(x, y)로 N=0 기준
    return angle % 360


def _edge_normal_azimuth(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """선분의 외향 법선 방위각 (대지 폴리곤이 반시계방향 기준)"""
    edge_az = _edge_azimuth(p1, p2)
    # 외향 법선 = 변 방향에서 90° 시계방향
    return (edge_az + 90) % 360


def _edge_length(p1: tuple[float, float], p2: tuple[float, float]) -> float:
    """두 점 사이 거리"""
    return math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)


def _calculate_setback(road_width: float) -> tuple[float, str]:
    """
    도로 폭에 따른 건축선 후퇴거리 계산.
    
    건축법 제46조 (건축선의 지정):
    - 소요너비에 미달하는 도로의 경우, 도로 중심선에서 너비의 1/2만큼 후퇴
    - 4m 미만 도로: 도로 중심에서 2m 후퇴
    - 소로1류(8m 미만): 후퇴 가능
    
    일반적 건축선 후퇴 기준:
    - 4m 미만 도로: (4 - 도로폭) / 2 후퇴
    - 4m 이상: 기본 후퇴 없음 (지자체 조례에 의한 추가 후퇴 가능)
    """
    if road_width is None:
        return 0, "도로 폭원 미확인 (수동 확인 필요)"
    
    if road_width < 4.0:
        setback = (4.0 - road_width) / 2
        return setback, f"건축법 제46조: 4m 미만 도로 → 도로중심에서 2m 확보 (후퇴 {setback:.1f}m)"
    elif road_width < 6.0:
        return 0, "소로2류(4~6m): 기본 후퇴 없음 (지자체 조례 확인)"
    elif road_width < 8.0:
        return 0, "소로1류(6~8m): 기본 후퇴 없음"
    elif road_width < 12.0:
        return 0, "중로2류(8~12m): 기본 후퇴 없음"
    elif road_width < 15.0:
        return 0, "중로1류(12~15m): 기본 후퇴 없음"
    elif road_width < 20.0:
        return 0, "대로3류(15~20m): 기본 후퇴 없음"
    elif road_width < 25.0:
        return 0, "대로2류(20~25m): 기본 후퇴 없음"
    else:
        return 0, "대로1류(25m 이상): 기본 후퇴 없음"


def analyze_road_adjacency(
    site_polygon: list[tuple[float, float]],
    road_edges: list[dict],
) -> RoadAdjacencyResult:
    """
    대지 폴리곤과 도로 데이터를 분석하여 접도 정보 반환.
    
    Args:
        site_polygon: 대지 경계 좌표 [(x,y), ...] (미터 단위, 반시계방향)
        road_edges: 도로 접도 정보 목록 [{
            "edge_index": 0,
            "road_name": "중로2류",
            "road_width": 15.0,
        }, ...]
    
    Returns:
        RoadAdjacencyResult: 접도 분석 결과
    """
    if not site_polygon or len(site_polygon) < 3:
        return RoadAdjacencyResult(error="유효한 대지 폴리곤이 아닙니다 (최소 3개 꼭짓점)")
    
    # ── 대지 경계선별 정보 계산 ──
    n = len(site_polygon)
    edges: list[EdgeInfo] = []
    for i in range(n):
        p1 = site_polygon[i]
        p2 = site_polygon[(i + 1) % n]
        az = _edge_azimuth(p1, p2)
        normal_az = _edge_normal_azimuth(p1, p2)
        
        edges.append(EdgeInfo(
            start=Point2D(x=p1[0], y=p1[1]),
            end=Point2D(x=p2[0], y=p2[1]),
            length=_edge_length(p1, p2),
            direction=_azimuth_to_direction(normal_az),
            azimuth=az,
            normal_azimuth=normal_az,
        ))
    
    # ── 도로 접도 분석 ──
    roads: list[RoadAdjacencyInfo] = []
    setback_summary: dict[str, float] = {}
    warnings: list[str] = []
    
    for road_data in road_edges:
        edge_idx = road_data.get("edge_index", 0)
        if edge_idx >= len(edges):
            warnings.append(f"edge_index {edge_idx}가 대지 경계선 수({len(edges)})를 초과합니다.")
            continue
        
        edge = edges[edge_idx]
        road_width = road_data.get("road_width")
        setback, setback_rule = _calculate_setback(road_width)
        
        road_info = RoadAdjacencyInfo(
            edge_index=edge_idx,
            direction=edge.direction,
            road_name=road_data.get("road_name", ""),
            road_width=road_width,
            road_class=_classify_road(road_width),
            contact_length=edge.length,
            setback_required=setback,
            setback_rule=setback_rule,
            contact_start=edge.start,
            contact_end=edge.end,
        )
        roads.append(road_info)
        
        # 방위별 최대 후퇴거리 기록
        direction = edge.direction
        if direction not in setback_summary or setback > setback_summary[direction]:
            setback_summary[direction] = setback
    
    # ── 접도 요건 판단 (건축법 제44조) ──
    # "건축물의 대지는 2m 이상이 도로에 접하여야 한다"
    # "연면적 합계 2000㎡ 이상: 6m 이상 접함"
    max_contact = max((r.contact_length for r in roads), default=0)
    min_width = min((r.road_width for r in roads if r.road_width), default=None)
    meets_req = max_contact >= 2.0 and (min_width is not None and min_width >= 4.0)
    
    if not meets_req:
        warnings.append(
            f"⚠️ 접도 요건 미달 가능: 최대 접도길이 {max_contact:.1f}m, "
            f"최소 도로폭 {min_width}m (건축법 제44조: 2m 이상 접도, 4m 이상 도로)"
        )
    
    return RoadAdjacencyResult(
        total_roads=len(roads),
        roads=roads,
        meets_access_requirement=meets_req,
        min_road_width=min_width,
        max_contact_length=max_contact if roads else None,
        setback_summary=setback_summary,
        warnings=warnings,
    )


def _classify_road(width: Optional[float]) -> str:
    """도로 폭원으로 도로등급 분류"""
    if width is None:
        return "미확인"
    if width >= 25:
        return "대로1류(25m이상)"
    elif width >= 20:
        return "대로2류(20~25m)"
    elif width >= 15:
        return "대로3류(15~20m)"
    elif width >= 12:
        return "중로1류(12~15m)"
    elif width >= 8:
        return "중로2류(8~12m)"
    elif width >= 6:
        return "소로1류(6~8m)"
    elif width >= 4:
        return "소로2류(4~6m)"
    else:
        return f"소로3류({width}m미만)"


# ══════════════════════════════════════════════════════════════
# SKILL 3: 일조권 사선제한 (Sunlight Setback Calculation)
# ══════════════════════════════════════════════════════════════

class SunlightSetbackEdge(BaseModel):
    """정북방향 경계선 1개에 대한 사선제한 정보"""
    edge_index: int = Field(..., description="대지 경계선 인덱스")
    start: Point2D
    end: Point2D
    length: float = Field(..., description="해당 변의 길이 (m)")
    normal_direction: str = Field(..., description="외향 법선 방위")
    normal_azimuth: float = Field(..., description="외향 법선 방위각")
    is_north_facing: bool = Field(False, description="정북방향 경계선 해당 여부")
    
    # 사선제한 계산 결과
    setback_at_9m: float = Field(1.5, description="높이 9m까지의 이격거리 (m)")
    max_height_at_boundary: float = Field(0, description="경계선에서의 최대 건축 높이 (m)")
    setback_formula: str = Field("", description="적용 공식 설명")
    
    # 높이별 이격거리 테이블
    height_setback_table: list[dict] = Field(
        default_factory=list,
        description="높이별 이격거리 [{height_m, setback_m}, ...]"
    )


class SunlightSetbackResult(BaseModel):
    """일조권 사선제한 종합 결과"""
    zone_type: str = Field("", description="적용 용도지역")
    regulation_applies: bool = Field(False, description="일조사선 적용 여부")
    regulation_basis: str = Field("", description="적용 법규 근거")
    
    # 정북방향 경계선 목록
    north_facing_edges: list[SunlightSetbackEdge] = Field(
        default_factory=list, description="정북방향 경계선 목록"
    )
    
    # 사선제한 요약
    min_setback_at_9m: float = Field(1.5, description="9m 높이에서의 최소 이격거리 (m)")
    setback_formula: str = Field("", description="사선제한 공식 요약")
    
    # 건축 가능 높이 프로파일 (3D 매스 절단용)
    height_profile: list[dict] = Field(
        default_factory=list,
        description="경계선 거리별 최대 허용 높이 [{distance_from_boundary, max_height}, ...]"
    )
    
    # 경고
    warnings: list[str] = Field(default_factory=list, description="경고 메시지")
    error: Optional[str] = Field(None, description="오류 메시지")


# 용도지역별 일조사선 적용 여부 (건축법 시행령 제86조)
# 전용/일반주거지역에서 적용, 상업/공업/녹지는 부분 적용 또는 미적용
SUNLIGHT_ZONES = {
    "제1종전용주거지역": {"applies": True, "height_threshold": 9.0, "low_setback": 1.5, "high_ratio": 0.5},
    "제2종전용주거지역": {"applies": True, "height_threshold": 9.0, "low_setback": 1.5, "high_ratio": 0.5},
    "제1종일반주거지역": {"applies": True, "height_threshold": 9.0, "low_setback": 1.5, "high_ratio": 0.5},
    "제2종일반주거지역": {"applies": True, "height_threshold": 9.0, "low_setback": 1.5, "high_ratio": 0.5},
    "제3종일반주거지역": {"applies": True, "height_threshold": 9.0, "low_setback": 1.5, "high_ratio": 0.5},
    "준주거지역":       {"applies": True, "height_threshold": 9.0, "low_setback": 1.5, "high_ratio": 0.5},
    # 상업/공업/녹지 등은 인접 주거지역에 면한 경우만 적용 (복잡, 수동 확인 필요)
}


def calculate_sunlight_setback(
    site_polygon: list[tuple[float, float]],
    zone_types: list[str],
    true_north_offset: float = 0.0,
) -> SunlightSetbackResult:
    """
    정북방향 일조권 사선제한 계산.
    
    건축법 시행령 제86조 (일조 등의 확보를 위한 건축물의 높이 제한):
    
    1. 전용·일반주거지역에서 건축물의 각 부분을 정북방향으로의
       인접대지 경계선으로부터:
       - 높이 9m 이하: 인접대지 경계선으로부터 1.5m 이상
       - 높이 9m 초과: 해당 건축물 각 부분 높이의 1/2 이상
    
    2. 정북방향: 진북(True North) 기준
    
    Args:
        site_polygon: 대지 경계 좌표 [(x,y), ...] (미터 단위)
        zone_types: 용도지역 목록 (예: ["제2종일반주거지역"])
        true_north_offset: 진북 보정값 (도). 자기편각 보정용.
                          양수 = 진북이 자북보다 동쪽
    
    Returns:
        SunlightSetbackResult: 사선제한 분석 결과
    """
    if not site_polygon or len(site_polygon) < 3:
        return SunlightSetbackResult(error="유효한 대지 폴리곤이 아닙니다.")
    
    # ── 용도지역별 사선제한 적용 여부 확인 ──
    zone_config = None
    applied_zone = ""
    for zone in zone_types:
        for key, config in SUNLIGHT_ZONES.items():
            if key in zone:
                zone_config = config
                applied_zone = zone
                break
        if zone_config:
            break
    
    if not zone_config:
        return SunlightSetbackResult(
            zone_type=zone_types[0] if zone_types else "",
            regulation_applies=False,
            regulation_basis="건축법 시행령 제86조: 주거지역이 아니므로 정북일조 사선제한 미적용",
            warnings=["비주거지역이나 인접 필지가 주거지역이면 사선제한 적용 가능 (수동 확인 필요)"],
        )
    
    h_threshold = zone_config["height_threshold"]  # 9m
    low_setback = zone_config["low_setback"]        # 1.5m
    high_ratio = zone_config["high_ratio"]          # 0.5
    
    # ── 대지 경계선별 정북방향 판별 ──
    n = len(site_polygon)
    north_edges: list[SunlightSetbackEdge] = []
    
    for i in range(n):
        p1 = site_polygon[i]
        p2 = site_polygon[(i + 1) % n]
        
        normal_az = _edge_normal_azimuth(p1, p2)
        
        # 진북 보정
        corrected_az = (normal_az - true_north_offset) % 360
        
        # 정북방향 판별: 외향 법선이 대체로 북쪽(315°~45°) 방향인 경계선
        # = 외향 법선 방위각이 315~360 또는 0~45 범위
        is_north = (corrected_az >= 315 or corrected_az <= 45)
        
        edge_len = _edge_length(p1, p2)
        direction = _azimuth_to_direction(normal_az)
        
        # 높이별 이격거리 테이블 생성
        height_table = []
        for h in range(0, 61, 3):
            if h == 0:
                continue
            if h <= h_threshold:
                sb = low_setback
            else:
                sb = h * high_ratio
            height_table.append({"height_m": h, "setback_m": round(sb, 2)})
        
        setback_edge = SunlightSetbackEdge(
            edge_index=i,
            start=Point2D(x=p1[0], y=p1[1]),
            end=Point2D(x=p2[0], y=p2[1]),
            length=round(edge_len, 2),
            normal_direction=direction,
            normal_azimuth=round(normal_az, 1),
            is_north_facing=is_north,
            setback_at_9m=low_setback,
            max_height_at_boundary=0 if is_north else float("inf"),
            setback_formula=(
                f"h ≤ {h_threshold}m → {low_setback}m 이격 / "
                f"h > {h_threshold}m → h × {high_ratio} 이격"
            ) if is_north else "정북방향 아님 (미적용)",
            height_setback_table=height_table if is_north else [],
        )
        
        if is_north:
            north_edges.append(setback_edge)
    
    # ── 높이 프로파일 생성 (3D 매스 절단용) ──
    height_profile = []
    for dist in [0, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0, 12.0, 15.0, 20.0, 25.0, 30.0]:
        # 경계선으로부터 dist 거리에서의 최대 허용 높이
        if dist < low_setback:
            max_h = 0  # 이격 미달 → 건축 불가
        elif dist <= h_threshold * high_ratio:
            # 사선 영역: h = dist / high_ratio
            max_h = dist / high_ratio
        else:
            max_h = float("inf")  # 사선 범위 초과 → 높이 제한 없음 (용적률만 적용)
        
        height_profile.append({
            "distance_from_boundary": dist,
            "max_height": round(max_h, 1) if max_h != float("inf") else None,
            "note": "무제한" if max_h == float("inf") else (
                "건축 불가" if max_h == 0 else f"최대 {max_h:.1f}m"
            ),
        })
    
    warnings = []
    if not north_edges:
        warnings.append("정북방향 경계선이 감지되지 않았습니다. 대지 폴리곤 방향을 확인하세요.")
    
    return SunlightSetbackResult(
        zone_type=applied_zone,
        regulation_applies=True,
        regulation_basis=(
            f"건축법 시행령 제86조 1항: {applied_zone}에서의 정북방향 일조사선 제한. "
            f"높이 {h_threshold}m 이하 → {low_setback}m 이격, "
            f"높이 {h_threshold}m 초과 → 높이의 {int(high_ratio*100)}% 이격"
        ),
        north_facing_edges=north_edges,
        min_setback_at_9m=low_setback,
        setback_formula=f"h ≤ {h_threshold}m → {low_setback}m / h > {h_threshold}m → h × {high_ratio}",
        height_profile=height_profile,
        warnings=warnings,
    )


# ══════════════════════════════════════════════════════════════
# 통합 대지 분석 (All-in-One)
# ══════════════════════════════════════════════════════════════

class SiteAnalysisResult(BaseModel):
    """대지 종합 분석 결과"""
    district_plan: DistrictPlanDetectionResult = Field(
        ..., description="지구단위계획 감지 결과"
    )
    road_adjacency: Optional[RoadAdjacencyResult] = Field(
        None, description="도로 접도 분석 결과"
    )
    sunlight_setback: Optional[SunlightSetbackResult] = Field(
        None, description="일조권 사선제한 분석 결과"
    )


def analyze_site(
    regulations: list,
    special_zones: list[str],
    zone_types: list[str],
    site_polygon: Optional[list[tuple[float, float]]] = None,
    road_edges: Optional[list[dict]] = None,
    true_north_offset: float = 0.0,
) -> SiteAnalysisResult:
    """
    대지 종합 분석 실행 (3개 스킬 통합).
    
    Args:
        regulations: 토지이용규제 항목 목록
        special_zones: 특수 지구/구역 목록
        zone_types: 용도지역 목록
        site_polygon: 대지 경계 좌표 (미터 단위). None이면 기하학 분석 스킵
        road_edges: 도로 접도 데이터. None이면 접도 분석 스킵
        true_north_offset: 진북 보정값 (도)
    """
    # 1. 지구단위계획 감지 (항상 실행)
    district_plan = detect_district_plan(regulations, special_zones)
    
    # 2. 도로 접도 분석 (폴리곤 + 도로 데이터 필요)
    road_result = None
    if site_polygon and road_edges:
        road_result = analyze_road_adjacency(site_polygon, road_edges)
    
    # 3. 일조권 사선제한 (폴리곤 + 용도지역 필요)
    sunlight_result = None
    if site_polygon and zone_types:
        sunlight_result = calculate_sunlight_setback(
            site_polygon, zone_types, true_north_offset
        )
    
    return SiteAnalysisResult(
        district_plan=district_plan,
        road_adjacency=road_result,
        sunlight_setback=sunlight_result,
    )
