"""
██████████████████████████████████████████████████████████████████████
███ Skill 7: Parametric Massing Engine (형태별 매스 뼈대 생성)       ███
███ ─────────────────────────────────────────────────────           ███
███ SiteParameters + 대지 폴리곤 → 7종 건물 매스 Wing[] 자동 생성    ███
███ 기하학 연산: Shapely (GEOS C-라이브러리 래퍼) 사용               ███
██████████████████████████████████████████████████████████████████████

입력: 대지 폴리곤 + 법적 제약(건폐율/용적률/높이) + 타입 선택
출력: Three.js가 즉시 렌더링 가능한 Wing 블록 배열 (JSON)

지원 타입 7종:
  1. SINGLE_BLOCK     — 단일 직사각형 매스
  2. TOWER_PODIUM     — 저층 포디엄 + 고층 타워
  3. L_SHAPE          — ㄱ자형 (2개 Wing)
  4. U_SHAPE          — ㄷ자형 (3개 Wing, 중정 개방)
  5. PARALLEL         — 평행 2~3동 (인동간격 확보)
  6. COURTYARD        — 사각 중정형 (4면 Wing)
  7. STAGGERED        — 엇갈림 배치 (경사지 대응)

작성일: 2026-03-06
"""

import math
from typing import Optional
from pydantic import BaseModel, Field
from shapely.geometry import Polygon, box, MultiPolygon
from shapely.affinity import rotate, translate
from shapely import ops


# ══════════════════════════════════════════════════════════════
# 데이터 모델
# ══════════════════════════════════════════════════════════════

class MassingInput(BaseModel):
    """매스 생성 입력 파라미터"""
    site_polygon: list[list[float]] = Field(
        ..., description="대지 경계 좌표 [[x,y], ...] (미터 단위)"
    )
    typology_type: str = Field(
        "SINGLE_BLOCK",
        description="건물 타입: SINGLE_BLOCK, TOWER_PODIUM, L_SHAPE, U_SHAPE, PARALLEL, COURTYARD, STAGGERED"
    )
    
    # ── 법적 제약 ──
    max_coverage_pct: float = Field(60.0, description="건폐율 한도 (%)")
    max_far_pct: float = Field(250.0, description="용적률 한도 (%)")
    max_height_m: float = Field(50.0, description="최대 높이 (m)")
    max_floors: int = Field(15, description="최대 층수")
    floor_height_m: float = Field(3.3, description="기본 층고 (m)")
    site_area_sqm: Optional[float] = Field(None, description="대지 면적 (미입력 시 폴리곤에서 계산)")
    
    # ── Setback (건축선 후퇴) ──
    setback_m: float = Field(1.5, description="기본 전체 후퇴거리 (m). 전면/측면/후면 공통")
    setback_north_m: Optional[float] = Field(None, description="정북방향 추가 후퇴거리 (m)")
    
    # ── 타입별 옵션 ──
    podium_floors: int = Field(3, description="포디엄 층수 (TOWER_PODIUM용)")
    podium_coverage_pct: float = Field(80.0, description="포디엄 건폐율 (%, 건축가능영역 대비)")
    tower_coverage_pct: float = Field(40.0, description="타워 건폐율 (%, 건축가능영역 대비)")
    wing_spacing_m: float = Field(12.0, description="동 간격 (PARALLEL용, m)")
    courtyard_ratio: float = Field(0.3, description="중정 면적 비율 (COURTYARD용)")
    rotation_deg: float = Field(0.0, description="전체 매스 회전 각도 (도)")
    
    # ── 프로그램 ──
    parking_floors: int = Field(1, description="주차 층수 (지하 제외 기준)")
    commercial_floors: int = Field(1, description="상업 층수")


class MassingWing(BaseModel):
    """생성된 건물 동(Wing) 1개 — Three.js 직접 렌더링용"""
    id: str = Field(..., description="Wing 고유 ID")
    label: str = Field("", description="Wing 이름 (예: '타워', '포디엄')")
    
    # ── 3D 좌표 (Three.js 좌표계: X=East, Y=Up, Z=-North) ──
    width: float = Field(..., description="가로 (m, X축)")
    depth: float = Field(..., description="세로 (m, Z축)")
    height: float = Field(..., description="높이 (m, Y축)")
    x: float = Field(0, description="중심 X좌표")
    y: float = Field(0, description="바닥 Y좌표 (보통 0)")
    z: float = Field(0, description="중심 Z좌표")
    rotation: float = Field(0, description="Y축 기준 회전 (도)")
    
    # ── 층별 구성 ──
    floors: int = Field(1, description="층수")
    floor_height: float = Field(3.3, description="층고 (m)")
    floor_area_sqm: float = Field(0, description="1개 층 바닥면적 (㎡)")
    
    # ── 용도 (최하층 기준) ──
    primary_use: str = Field("residential", description="주 용도")
    
    # ── Shapely 검증용 (프론트엔드에서는 무시 가능) ──
    footprint_coords: list[list[float]] = Field(
        default_factory=list,
        description="바닥면 4개 꼭짓점 좌표 [[x,z], ...]"
    )


class MassingResult(BaseModel):
    """매스 생성 결과"""
    typology_type: str
    typology_label: str = ""
    wings: list[MassingWing] = Field(default_factory=list)
    
    # ── 메트릭 (사전 계산) ──
    total_footprint_area_sqm: float = 0
    total_gfa_sqm: float = 0
    calculated_coverage_pct: float = 0
    calculated_far_pct: float = 0
    max_height_m: float = 0
    total_floors: int = 0
    estimated_units: int = 0
    
    # ── 건축가능영역 정보 ──
    buildable_polygon: list[list[float]] = Field(default_factory=list)
    buildable_area_sqm: float = 0
    site_area_sqm: float = 0
    
    # ── 상태 ──
    error: Optional[str] = None
    warnings: list[str] = Field(default_factory=list)


# ══════════════════════════════════════════════════════════════
# 공통 기하학 유틸리티 (Shapely 기반)
# ══════════════════════════════════════════════════════════════

def _make_polygon(coords: list[list[float]]) -> Polygon:
    """좌표 → Shapely Polygon (자동 닫힘 보장)"""
    if len(coords) < 3:
        raise ValueError(f"폴리곤은 최소 3개 꼭짓점이 필요합니다 (입력: {len(coords)}개)")
    pts = [(c[0], c[1]) for c in coords]
    # 닫힌 폴리곤 보장
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    poly = Polygon(pts)
    if not poly.is_valid:
        poly = poly.buffer(0)  # Self-intersection 수리
    return poly


def _polygon_to_coords(poly: Polygon) -> list[list[float]]:
    """Shapely Polygon → 좌표 리스트"""
    if poly.is_empty:
        return []
    coords = list(poly.exterior.coords)
    return [[round(c[0], 3), round(c[1], 3)] for c in coords[:-1]]  # 마지막 닫힘 좌표 제거


def _compute_buildable(site_poly: Polygon, setback: float) -> Polygon:
    """
    대지 → 건축가능영역 (Setback 적용).
    
    Shapely의 buffer(-distance)를 사용하여 안정적인 내축(inward offset) 수행.
    Self-intersection이 자동으로 해결됨.
    """
    if setback <= 0:
        return site_poly
    
    buildable = site_poly.buffer(-setback, join_style='mitre', mitre_limit=5.0)
    
    # MultiPolygon이 되면 가장 큰 것만 사용
    if isinstance(buildable, MultiPolygon):
        buildable = max(buildable.geoms, key=lambda g: g.area)
    
    if buildable.is_empty:
        return site_poly  # 후퇴 시 너무 작아지면 원본 유지
    
    return buildable


def _fit_rectangle_in_polygon(
    poly: Polygon, 
    target_area: float, 
    aspect_ratio: float = 1.5
) -> tuple[float, float, float, float]:
    """
    폴리곤 안에 들어가는 직사각형 피팅.
    
    Returns: (width, depth, center_x, center_z)
    """
    minx, miny, maxx, maxy = poly.bounds
    bw = maxx - minx
    bh = maxy - miny
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2
    
    # 목표 면적에 맞는 크기 계산
    w = math.sqrt(target_area * aspect_ratio)
    d = target_area / w
    
    # 바운딩 박스 제한
    w = min(w, bw * 0.95)
    d = min(d, bh * 0.95)
    
    # 폴리곤 안에 들어가는지 확인 → 안 들어가면 축소
    for scale in [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7]:
        sw, sd = w * scale, d * scale
        rect = box(cx - sw/2, cy - sd/2, cx + sw/2, cy + sd/2)
        if poly.contains(rect):
            return sw, sd, cx, cy
    
    # 최소한의 크기 반환
    return w * 0.6, d * 0.6, cx, cy


def _create_wing(
    wing_id: str,
    label: str,
    width: float,
    depth: float,
    floors: int,
    floor_height: float,
    cx: float,
    cz: float,
    rotation: float = 0,
    primary_use: str = "residential",
) -> MassingWing:
    """Wing 객체 생성 헬퍼"""
    height = floors * floor_height
    floor_area = width * depth
    
    # 바닥면 4개 꼭짓점 (회전 전)
    hw, hd = width / 2, depth / 2
    footprint = [
        [cx - hw, cz - hd],
        [cx + hw, cz - hd],
        [cx + hw, cz + hd],
        [cx - hw, cz + hd],
    ]
    
    return MassingWing(
        id=wing_id,
        label=label,
        width=round(width, 2),
        depth=round(depth, 2),
        height=round(height, 2),
        x=round(cx, 2),
        y=0,
        z=round(-cz, 2),  # Three.js: Z = -Y(2D)
        rotation=round(rotation, 1),
        floors=floors,
        floor_height=floor_height,
        floor_area_sqm=round(floor_area, 1),
        primary_use=primary_use,
        footprint_coords=[[round(p[0], 3), round(p[1], 3)] for p in footprint],
    )


# ══════════════════════════════════════════════════════════════
# 용적률 기반 층수 자동 제한
# ══════════════════════════════════════════════════════════════

def _cap_floors_by_far(
    wings: list[MassingWing],
    site_area: float,
    max_far_pct: float,
    typology: str = "",
) -> list[MassingWing]:
    """
    용적률 한도를 초과하지 않도록 층수를 자동 감소.
    
    FAR = Σ(floor_area × floors) / site_area × 100
    → 역산: max_total_gfa = site_area × max_far_pct / 100
    → 각 Wing의 층수를 비례적으로 축소
    """
    if not wings or site_area <= 0:
        return wings
    
    max_gfa = site_area * (max_far_pct / 100)
    
    # 현재 GFA 계산
    current_gfa = sum(w.floor_area_sqm * w.floors for w in wings)
    
    if current_gfa <= max_gfa:
        return wings  # 이미 한도 내
    
    # TOWER_PODIUM 특수 처리: 타워 층수만 감소
    if typology == "TOWER_PODIUM" and len(wings) == 2:
        podium = wings[0]
        tower = wings[1]
        podium_gfa = podium.floor_area_sqm * podium.floors
        remaining_gfa = max_gfa - podium_gfa
        if remaining_gfa > 0 and tower.floor_area_sqm > 0:
            new_tower_floors = max(1, int(remaining_gfa / tower.floor_area_sqm))
            tower.floors = new_tower_floors
            tower.height = round(new_tower_floors * tower.floor_height, 2)
        return wings
    
    # 일반 타입: 전체 Wing의 층수를 동일하게 감소
    total_floor_area = sum(w.floor_area_sqm for w in wings)
    if total_floor_area <= 0:
        return wings
    
    # 최대 평균 층수 역산
    max_avg_floors = max_gfa / total_floor_area
    capped_floors = max(1, int(max_avg_floors))
    
    for w in wings:
        if w.floors > capped_floors:
            w.floors = capped_floors
            w.height = round(capped_floors * w.floor_height, 2)
    
    return wings


# ══════════════════════════════════════════════════════════════
# 7종 매스 생성기
# ══════════════════════════════════════════════════════════════

def _gen_single_block(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """1. 단일 직사각형 블록"""
    max_footprint = site_area * (inp.max_coverage_pct / 100)
    target_gfa = site_area * (inp.max_far_pct / 100)
    
    # 층수 = 용적률 목표 ÷ 건폐율 목표
    needed_floors = min(
        math.ceil(target_gfa / max_footprint),
        inp.max_floors,
        math.floor(inp.max_height_m / inp.floor_height_m)
    )
    
    w, d, cx, cz = _fit_rectangle_in_polygon(buildable, max_footprint, 1.5)
    
    return [_create_wing(
        "blk-1", "단일 블록",
        w, d, needed_floors, inp.floor_height_m, cx, cz,
        rotation=inp.rotation_deg,
    )]


def _gen_tower_podium(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """2. 타워 + 포디엄 (저층 넓은 판 + 고층 좁은 타워)"""
    ba = buildable.area
    
    # ── 포디엄: 건축가능영역의 podium_coverage % ──
    podium_area = ba * (inp.podium_coverage_pct / 100)
    podium_floors = inp.podium_floors
    
    pw, pd, pcx, pcz = _fit_rectangle_in_polygon(buildable, podium_area, 2.0)
    
    # ── 타워: 건축가능영역의 tower_coverage % ──
    tower_area = ba * (inp.tower_coverage_pct / 100)
    remaining_floors = min(
        inp.max_floors - podium_floors,
        math.floor((inp.max_height_m - podium_floors * inp.floor_height_m) / inp.floor_height_m)
    )
    remaining_floors = max(remaining_floors, 3)
    
    tw, td, tcx, tcz = _fit_rectangle_in_polygon(buildable, tower_area, 1.2)
    # 타워를 포디엄 위 중심에 배치
    tcx, tcz = pcx, pcz
    
    wings = [
        _create_wing("pod-1", "포디엄", pw, pd, podium_floors, inp.floor_height_m, pcx, pcz,
                      primary_use="commercial"),
        _create_wing("twr-1", "타워", tw, td, remaining_floors, inp.floor_height_m, tcx, tcz,
                      primary_use="residential"),
    ]
    # 타워의 Y 위치를 포디엄 높이만큼 올림
    wings[1].y = round(podium_floors * inp.floor_height_m, 2)
    
    return wings


def _gen_l_shape(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """3. ㄱ자형 (2개 Wing, 90° 교차)"""
    minx, miny, maxx, maxy = buildable.bounds
    bw = maxx - minx
    bh = maxy - miny
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2
    
    max_footprint = site_area * (inp.max_coverage_pct / 100)
    needed_floors = min(
        inp.max_floors,
        math.floor(inp.max_height_m / inp.floor_height_m)
    )
    
    # Wing A: 가로 방향 (하단)
    wing_thickness = min(bw * 0.35, 18)  # 건물 깊이 최대 18m (채광 제한)
    wing_a_w = bw * 0.85
    wing_a_d = wing_thickness
    wing_a_cx = cx
    wing_a_cy = miny + wing_a_d / 2 + 0.5
    
    # Wing B: 세로 방향 (좌측)
    wing_b_w = wing_thickness
    wing_b_d = bh * 0.6
    wing_b_cx = minx + wing_b_w / 2 + 0.5
    wing_b_cy = cy + (bh * 0.15)
    
    # 건폐율 조정: 교차 영역 고려
    actual_footprint = (wing_a_w * wing_a_d) + (wing_b_w * wing_b_d)
    # 교차 영역 빼기 (대략)
    overlap = wing_thickness * wing_thickness
    actual_footprint -= overlap
    
    if actual_footprint > max_footprint:
        scale = math.sqrt(max_footprint / actual_footprint)
        wing_a_w *= scale
        wing_a_d *= scale
        wing_b_w *= scale
        wing_b_d *= scale
    
    return [
        _create_wing("l-a", "가로동 (Wing A)", wing_a_w, wing_a_d, needed_floors,
                      inp.floor_height_m, wing_a_cx, wing_a_cy),
        _create_wing("l-b", "세로동 (Wing B)", wing_b_w, wing_b_d, needed_floors,
                      inp.floor_height_m, wing_b_cx, wing_b_cy),
    ]


def _gen_u_shape(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """4. ㄷ자형 (3개 Wing, 남향 중정 개방)"""
    minx, miny, maxx, maxy = buildable.bounds
    bw = maxx - minx
    bh = maxy - miny
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2
    
    needed_floors = min(
        inp.max_floors,
        math.floor(inp.max_height_m / inp.floor_height_m)
    )
    
    wing_thickness = min(bw * 0.25, 15)
    
    # Wing C: 상단 가로 (북측, ㄷ자의 윗변)
    wc_w = bw * 0.85
    wc_d = wing_thickness
    wc_cx = cx
    wc_cy = maxy - wc_d / 2 - 0.5
    
    # Wing A: 좌측 세로
    wa_w = wing_thickness
    wa_d = bh * 0.65
    wa_cx = minx + wa_w / 2 + 0.5
    wa_cy = cy + (bh * 0.1)
    
    # Wing B: 우측 세로
    wb_w = wing_thickness
    wb_d = bh * 0.65
    wb_cx = maxx - wb_w / 2 - 0.5
    wb_cy = cy + (bh * 0.1)
    
    # 건폐율 검증 및 조정
    max_footprint = site_area * (inp.max_coverage_pct / 100)
    total_fp = (wc_w * wc_d) + (wa_w * wa_d) + (wb_w * wb_d)
    if total_fp > max_footprint:
        scale = math.sqrt(max_footprint / total_fp)
        wing_thickness *= scale
        wc_w *= scale; wc_d *= scale
        wa_w *= scale; wa_d *= scale
        wb_w *= scale; wb_d *= scale
    
    return [
        _create_wing("u-a", "좌측동", wa_w, wa_d, needed_floors,
                      inp.floor_height_m, wa_cx, wa_cy),
        _create_wing("u-b", "우측동", wb_w, wb_d, needed_floors,
                      inp.floor_height_m, wb_cx, wb_cy),
        _create_wing("u-c", "북측동", wc_w, wc_d, needed_floors,
                      inp.floor_height_m, wc_cx, wc_cy),
    ]


def _gen_parallel(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """5. 평행동 배치 (2~3동, 인동간격 H × 0.5 확보)"""
    minx, miny, maxx, maxy = buildable.bounds
    bw = maxx - minx
    bh = maxy - miny
    cx = (minx + maxx) / 2
    
    needed_floors = min(
        inp.max_floors,
        math.floor(inp.max_height_m / inp.floor_height_m)
    )
    
    building_height = needed_floors * inp.floor_height_m
    
    # 인동간격 = H × 0.5 (건축법 기준)
    spacing = max(inp.wing_spacing_m, building_height * 0.5)
    
    wing_thickness = min(bw * 0.3, 15)  # 채광 위한 최대 깊이 15m
    wing_width = bw * 0.85
    
    # 배치 가능한 동 수 계산
    total_depth_needed = lambda n: n * wing_thickness + (n - 1) * spacing
    
    num_wings = 3 if total_depth_needed(3) <= bh * 0.85 else 2
    
    # 동 위치 계산 (남북 방향 균등 배치)
    total_span = total_depth_needed(num_wings)
    start_y = (miny + maxy) / 2 - total_span / 2 + wing_thickness / 2
    
    wings = []
    for i in range(num_wings):
        wy = start_y + i * (wing_thickness + spacing)
        wings.append(_create_wing(
            f"par-{i+1}", f"제{i+1}동",
            wing_width, wing_thickness, needed_floors,
            inp.floor_height_m, cx, wy,
        ))
    
    # 건폐율 초과 시 축소
    max_footprint = site_area * (inp.max_coverage_pct / 100)
    total_fp = sum(w.floor_area_sqm for w in wings)
    if total_fp > max_footprint:
        scale = math.sqrt(max_footprint / total_fp)
        for w in wings:
            w.width = round(w.width * scale, 2)
            w.depth = round(w.depth * scale, 2)
            w.floor_area_sqm = round(w.width * w.depth, 1)
    
    return wings


def _gen_courtyard(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """6. 사각 중정형 (4면 Wing)"""
    minx, miny, maxx, maxy = buildable.bounds
    bw = maxx - minx
    bh = maxy - miny
    cx = (minx + maxx) / 2
    cy = (miny + maxy) / 2
    
    needed_floors = min(
        inp.max_floors,
        math.floor(inp.max_height_m / inp.floor_height_m)
    )
    
    # 중정 크기 (건축가능영역의 courtyard_ratio %)
    court_w = bw * math.sqrt(inp.courtyard_ratio)
    court_h = bh * math.sqrt(inp.courtyard_ratio)
    
    wing_thickness = min((bw - court_w) / 2 * 0.85, 12)
    
    # 4면 배치
    wings = [
        # 남측 (하단)
        _create_wing("ct-s", "남측동", bw * 0.85, wing_thickness, needed_floors,
                      inp.floor_height_m, cx, miny + wing_thickness / 2 + 0.5),
        # 북측 (상단)
        _create_wing("ct-n", "북측동", bw * 0.85, wing_thickness, needed_floors,
                      inp.floor_height_m, cx, maxy - wing_thickness / 2 - 0.5),
        # 좌측
        _create_wing("ct-w", "서측동", wing_thickness, bh * 0.5, needed_floors,
                      inp.floor_height_m, minx + wing_thickness / 2 + 0.5, cy),
        # 우측
        _create_wing("ct-e", "동측동", wing_thickness, bh * 0.5, needed_floors,
                      inp.floor_height_m, maxx - wing_thickness / 2 - 0.5, cy),
    ]
    
    # 건폐율 초과 시 축소
    max_footprint = site_area * (inp.max_coverage_pct / 100)
    total_fp = sum(w.floor_area_sqm for w in wings)
    if total_fp > max_footprint:
        scale = math.sqrt(max_footprint / total_fp)
        for w in wings:
            w.width = round(w.width * scale, 2)
            w.depth = round(w.depth * scale, 2)
            w.floor_area_sqm = round(w.width * w.depth, 1)
    
    return wings


def _gen_staggered(
    buildable: Polygon, inp: MassingInput, site_area: float
) -> list[MassingWing]:
    """7. 엇갈림 배치 (계단식, 조망·채광 극대화)"""
    minx, miny, maxx, maxy = buildable.bounds
    bw = maxx - minx
    bh = maxy - miny
    cx = (minx + maxx) / 2
    
    needed_floors = min(
        inp.max_floors,
        math.floor(inp.max_height_m / inp.floor_height_m)
    )
    
    wing_thickness = min(bw * 0.3, 15)
    wing_width = bw * 0.55
    spacing = max(inp.wing_spacing_m, needed_floors * inp.floor_height_m * 0.5)
    
    # 2동 엇갈림: 좌-우 오프셋
    offset_x = bw * 0.15
    
    y_base = (miny + maxy) / 2
    
    wings = [
        _create_wing("stg-1", "제1동 (좌)", wing_width, wing_thickness, needed_floors,
                      inp.floor_height_m, cx - offset_x, y_base - spacing / 2),
        _create_wing("stg-2", "제2동 (우)", wing_width, wing_thickness, needed_floors,
                      inp.floor_height_m, cx + offset_x, y_base + spacing / 2),
    ]
    
    # 건폐율 조정
    max_footprint = site_area * (inp.max_coverage_pct / 100)
    total_fp = sum(w.floor_area_sqm for w in wings)
    if total_fp > max_footprint:
        scale = math.sqrt(max_footprint / total_fp)
        for w in wings:
            w.width = round(w.width * scale, 2)
            w.depth = round(w.depth * scale, 2)
            w.floor_area_sqm = round(w.width * w.depth, 1)
    
    return wings


# ══════════════════════════════════════════════════════════════
# 전체 레이블 매핑
# ══════════════════════════════════════════════════════════════

TYPOLOGY_LABELS = {
    "SINGLE_BLOCK": "단일 블록",
    "TOWER_PODIUM": "타워 + 포디엄",
    "L_SHAPE": "ㄱ자형",
    "U_SHAPE": "ㄷ자형 (중정 개방)",
    "PARALLEL": "평행동",
    "COURTYARD": "사각 중정형",
    "STAGGERED": "엇갈림 배치",
}

GENERATORS = {
    "SINGLE_BLOCK": _gen_single_block,
    "TOWER_PODIUM": _gen_tower_podium,
    "L_SHAPE": _gen_l_shape,
    "U_SHAPE": _gen_u_shape,
    "PARALLEL": _gen_parallel,
    "COURTYARD": _gen_courtyard,
    "STAGGERED": _gen_staggered,
}


# ══════════════════════════════════════════════════════════════
# 메인 진입점
# ══════════════════════════════════════════════════════════════

def generate_massing(inp: MassingInput) -> MassingResult:
    """
    매스 생성 메인 함수.
    
    SiteParameters + 대지 폴리곤 → 지정 타입의 Wing[] 생성.
    
    Steps:
        1. 대지 폴리곤 → Shapely Polygon 변환
        2. Setback 적용 → 건축가능영역 (buffer -distance)
        3. 타입별 생성기 호출 → Wing[] 
        4. 메트릭 계산 (건폐율, 용적률, 면적)
    """
    try:
        # 1. 대지 폴리곤 파싱
        site_poly = _make_polygon(inp.site_polygon)
        site_area = inp.site_area_sqm or round(site_poly.area, 1)
        
        # 2. 건축가능영역 (Setback 적용)
        buildable = _compute_buildable(site_poly, inp.setback_m)
        buildable_area = round(buildable.area, 1)
        buildable_coords = _polygon_to_coords(buildable)
        
        # 3. 타입별 생성
        typology = inp.typology_type.upper()
        if typology not in GENERATORS:
            return MassingResult(
                typology_type=typology,
                error=f"지원하지 않는 타입: {typology}. 가능: {list(GENERATORS.keys())}",
                site_area_sqm=site_area,
            )
        
        generator = GENERATORS[typology]
        wings = generator(buildable, inp, site_area)
        
        # 4. 용적률 기반 층수 제한 (FAR 역산)
        wings = _cap_floors_by_far(wings, site_area, inp.max_far_pct, typology)
        
        # 5. Rotation 적용 (전체 매스 회전)
        if inp.rotation_deg != 0:
            for w in wings:
                w.rotation = round(w.rotation + inp.rotation_deg, 1)
        
        # 5. 메트릭 계산
        # 건폐율: 1층 바닥면적 합 / 대지면적
        # 타워+포디엄: pod의 floor_area만 (타워는 포디엄 위에 올라감)
        if typology == "TOWER_PODIUM":
            footprint = wings[0].floor_area_sqm  # 포디엄 면적만
        else:
            # Shapely로 정확한 Union 면적 계산 (중복 제거)
            footprints = []
            for w in wings:
                fp = w.footprint_coords
                if len(fp) >= 3:
                    footprints.append(Polygon([(p[0], p[1]) for p in fp]))
            
            if footprints:
                union = ops.unary_union(footprints)
                footprint = round(union.area, 1)
            else:
                footprint = sum(w.floor_area_sqm for w in wings)
        
        # 총 연면적 (GFA)
        total_gfa = sum(w.floor_area_sqm * w.floors for w in wings)
        
        # 최대 높이
        max_h = max(w.y + w.height for w in wings)
        total_floors_max = max(
            (w.floors + (round(w.y / w.floor_height) if w.y > 0 else 0)) for w in wings
        )
        
        # 예상 세대수 (주거 60㎡/세대 기준)
        residential_gfa = sum(
            w.floor_area_sqm * w.floors 
            for w in wings 
            if w.primary_use == "residential"
        )
        estimated_units = max(1, round(residential_gfa / 60))
        
        coverage = round((footprint / site_area) * 100, 1) if site_area > 0 else 0
        far = round((total_gfa / site_area) * 100, 1) if site_area > 0 else 0
        
        warnings = []
        if coverage > inp.max_coverage_pct:
            warnings.append(f"⚠️ 건폐율 초과: {coverage}% (한도 {inp.max_coverage_pct}%)")
        if far > inp.max_far_pct:
            warnings.append(f"⚠️ 용적률 초과: {far}% (한도 {inp.max_far_pct}%)")
        if max_h > inp.max_height_m:
            warnings.append(f"⚠️ 높이 초과: {max_h:.1f}m (한도 {inp.max_height_m}m)")
        
        return MassingResult(
            typology_type=typology,
            typology_label=TYPOLOGY_LABELS.get(typology, typology),
            wings=wings,
            total_footprint_area_sqm=round(footprint, 1),
            total_gfa_sqm=round(total_gfa, 1),
            calculated_coverage_pct=coverage,
            calculated_far_pct=far,
            max_height_m=round(max_h, 1),
            total_floors=total_floors_max,
            estimated_units=estimated_units,
            buildable_polygon=buildable_coords,
            buildable_area_sqm=buildable_area,
            site_area_sqm=site_area,
            warnings=warnings,
        )
        
    except Exception as e:
        return MassingResult(
            typology_type=inp.typology_type,
            error=f"매스 생성 오류: {str(e)}",
        )


def generate_all_typologies(inp: MassingInput) -> list[MassingResult]:
    """
    7종 타입 전부를 한 번에 생성하여 비교용 배열로 반환.
    
    옵션 갤러리 UI에서 사용.
    """
    results = []
    for typology in GENERATORS.keys():
        modified_inp = inp.model_copy()
        modified_inp.typology_type = typology
        result = generate_massing(modified_inp)
        results.append(result)
    
    # 점수순 정렬 (건폐율·용적률 한도 내에서 GFA가 큰 것이 높은 점수)
    for r in results:
        if r.error:
            r.estimated_units = 0
            continue
        score = 0
        if r.calculated_coverage_pct <= inp.max_coverage_pct:
            score += 40
        if r.calculated_far_pct <= inp.max_far_pct:
            score += 40
        if r.max_height_m <= inp.max_height_m:
            score += 20
        # GFA 보너스
        max_gfa = inp.site_area_sqm * inp.max_far_pct / 100 if inp.site_area_sqm else 1
        gfa_ratio = min(r.total_gfa_sqm / max_gfa, 1.0) if max_gfa > 0 else 0
        score = round(score * gfa_ratio)
    
    return results
