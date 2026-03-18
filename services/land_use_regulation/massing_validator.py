"""
██████████████████████████████████████████████████████████████████████
███ Skill 8: Mass Compliance Validator (법규 정합성 검증)            ███
███ ─────────────────────────────────────────────────────           ███
███ 생성된 3D 매스의 건폐율/용적률/높이/후퇴/일조를 수학적 역산     ███
███ 기하학 연산: Shapely (GEOS C-라이브러리 래퍼) 사용               ███
██████████████████████████████████████████████████████████████████████

입력: MassingWing[] + 법적 제약 수치
출력: 통과 여부 + 위반 상세 리스트 + 실제 산출값

검증 항목 (6가지):
  1. 건폐율 (Coverage Ratio) — Shapely union area
  2. 용적률 (FAR) — 각 Wing의 floor_area × floors 합산
  3. 최대 높이 (Max Height)
  4. 최대 층수 (Max Floors)
  5. 건축선 후퇴 (Setback) — Polygon.within() 검사
  6. 일조사선 (Sunlight) — 정북경계선 거리 vs 높이 프로파일

작성일: 2026-03-06
"""

import math
from typing import Optional
from pydantic import BaseModel, Field
from shapely.geometry import Polygon, box, Point, MultiPolygon
from shapely import ops


# ══════════════════════════════════════════════════════════════
# 데이터 모델
# ══════════════════════════════════════════════════════════════

class MassBlock(BaseModel):
    """검증 대상 매스 블록 1개"""
    id: str
    width: float
    depth: float
    height: float
    x: float             # 중심 X (2D 평면)
    z: float             # 중심 Z (Three.js) = -Y(2D)
    y: float = 0         # 바닥 높이 (포디엄 위 타워인 경우 > 0)
    rotation: float = 0  # Y축 회전 (도)
    floors: int = 1
    floor_area_sqm: float = 0
    footprint_coords: list[list[float]] = Field(default_factory=list)


class ComplianceInput(BaseModel):
    """법규 검증 입력"""
    mass_blocks: list[MassBlock] = Field(..., description="생성된 매스 블록들")
    
    # ── 대지 정보 ──
    site_area_sqm: float = Field(..., description="대지 면적 (㎡)")
    site_polygon: list[list[float]] = Field(
        default_factory=list, description="대지 경계 좌표 [[x,y], ...]"
    )
    buildable_polygon: list[list[float]] = Field(
        default_factory=list, description="건축가능영역 좌표 [[x,y], ...]"
    )
    
    # ── 법적 제약 ──
    max_coverage_pct: float = Field(60.0, description="건폐율 한도 (%)")
    max_far_pct: float = Field(250.0, description="용적률 한도 (%)")
    max_height_m: float = Field(50.0, description="최대 높이 (m)")
    max_floors: int = Field(15, description="최대 층수")
    
    # ── Setback 요구사항 ──
    setback_requirements: dict = Field(
        default_factory=dict,
        description="방위별 후퇴거리 {N: 1.5, S: 3.0, E: 0, W: 0}"
    )
    
    # ── 일조사선 (선택) ──
    sunlight_profile: list[dict] = Field(
        default_factory=list,
        description="일조사선 높이 프로파일 [{distance_from_boundary, max_height}, ...]"
    )
    north_boundary_y: Optional[float] = Field(
        None, description="정북방향 경계선의 Y좌표 (2D)"
    )


class Violation(BaseModel):
    """법규 위반 1건"""
    type: str = Field(..., description="위반 유형: COVERAGE|FAR|HEIGHT|FLOORS|SETBACK|SUNLIGHT")
    description: str = Field(..., description="위반 설명")
    block_id: str = Field("ALL", description="위반 블록 ID")
    severity: str = Field("CRITICAL", description="심각도: CRITICAL|WARNING|INFO")
    current_value: float = Field(0, description="현재 값")
    limit_value: float = Field(0, description="기준 값")
    excess: float = Field(0, description="초과량")


class ComplianceResult(BaseModel):
    """법규 검증 결과"""
    is_valid: bool = Field(False, description="전체 통과 여부")
    
    # ── 계산된 수치 ──
    calculated_coverage_pct: float = Field(0, description="실제 건폐율 (%)")
    calculated_far_pct: float = Field(0, description="실제 용적률 (%)")
    calculated_max_height: float = Field(0, description="실제 최고 높이 (m)")
    calculated_total_gfa: float = Field(0, description="실제 연면적 (㎡)")
    calculated_footprint: float = Field(0, description="실제 건축면적 (㎡)")
    calculated_total_floors: int = Field(0, description="최대 층수")
    
    # ── 위반 사항 ──
    violations: list[Violation] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    
    # ── 요약 ──
    summary: str = Field("", description="검증 요약 텍스트")
    
    # ── 오류 ──
    error: Optional[str] = None


# ══════════════════════════════════════════════════════════════
# 블록 → Shapely Polygon 변환
# ══════════════════════════════════════════════════════════════

def _block_to_footprint_polygon(block: MassBlock) -> Polygon:
    """
    매스 블록 → 바닥면 폴리곤 (2D).
    
    footprint_coords가 있으면 그대로 사용,
    없으면 width/depth/x/z에서 직사각형 생성.
    
    Note: Three.js 좌표계에서 z = -y(2D)이므로 변환 필요.
    """
    if block.footprint_coords and len(block.footprint_coords) >= 3:
        coords = [(p[0], p[1]) for p in block.footprint_coords]
        poly = Polygon(coords)
        if poly.is_valid:
            return poly
    
    # width/depth에서 직사각형 생성
    # Three.js z값을 2D y값으로 역변환: y_2d = -z
    cx = block.x
    cy = -block.z  # Three.js Z → 2D Y 변환
    hw = block.width / 2
    hd = block.depth / 2
    
    rect = box(cx - hw, cy - hd, cx + hw, cy + hd)
    
    # 회전 적용
    if block.rotation != 0:
        from shapely.affinity import rotate
        rect = rotate(rect, block.rotation, origin=(cx, cy))
    
    return rect


# ══════════════════════════════════════════════════════════════
# 메인 검증 함수
# ══════════════════════════════════════════════════════════════

def validate_compliance(inp: ComplianceInput) -> ComplianceResult:
    """
    생성된 매스 블록의 법규 정합성을 수학적으로 검증.
    
    Shapely를 사용하여:
    - Union으로 중복 영역 제거 후 실제 건축면적 계산
    - within()으로 건축가능영역 내 위치 확인
    - 점-폴리곤 거리로 일조사선 검증
    """
    try:
        violations: list[Violation] = []
        warnings: list[str] = []
        
        if not inp.mass_blocks:
            return ComplianceResult(
                error="검증할 매스 블록이 없습니다.",
                summary="매스 블록 데이터 없음",
            )
        
        # ══════ 1. 건축면적 (Footprint Area) — Shapely Union ══════
        footprint_polys = []
        for block in inp.mass_blocks:
            fp = _block_to_footprint_polygon(block)
            if not fp.is_empty:
                footprint_polys.append(fp)
        
        if footprint_polys:
            # 모든 바닥면의 Union → 실제 건축면적 (중복 영역 자동 제거)
            union_footprint = ops.unary_union(footprint_polys)
            actual_footprint = round(union_footprint.area, 1)
        else:
            actual_footprint = sum(b.floor_area_sqm for b in inp.mass_blocks)
        
        # ══════ 2. 건폐율 검증 ══════
        coverage_pct = round((actual_footprint / inp.site_area_sqm) * 100, 1) if inp.site_area_sqm > 0 else 0
        
        if coverage_pct > inp.max_coverage_pct:
            excess = round(coverage_pct - inp.max_coverage_pct, 1)
            violations.append(Violation(
                type="COVERAGE",
                description=f"건폐율 초과: {coverage_pct}% (한도 {inp.max_coverage_pct}%, {excess}%p 초과)",
                severity="CRITICAL",
                current_value=coverage_pct,
                limit_value=inp.max_coverage_pct,
                excess=excess,
            ))
        
        # ══════ 3. 연면적 & 용적률 검증 ══════
        total_gfa = sum(b.floor_area_sqm * b.floors for b in inp.mass_blocks)
        far_pct = round((total_gfa / inp.site_area_sqm) * 100, 1) if inp.site_area_sqm > 0 else 0
        
        if far_pct > inp.max_far_pct:
            excess = round(far_pct - inp.max_far_pct, 1)
            violations.append(Violation(
                type="FAR",
                description=f"용적률 초과: {far_pct}% (한도 {inp.max_far_pct}%, {excess}%p 초과)",
                severity="CRITICAL",
                current_value=far_pct,
                limit_value=inp.max_far_pct,
                excess=excess,
            ))
        
        # ══════ 4. 높이 검증 ══════
        max_height = max((b.y + b.height) for b in inp.mass_blocks)
        
        if max_height > inp.max_height_m:
            excess = round(max_height - inp.max_height_m, 1)
            violations.append(Violation(
                type="HEIGHT",
                description=f"높이 초과: {max_height:.1f}m (한도 {inp.max_height_m}m, {excess:.1f}m 초과)",
                severity="CRITICAL",
                current_value=max_height,
                limit_value=inp.max_height_m,
                excess=excess,
            ))
        
        # ══════ 5. 층수 검증 ══════
        max_floors = max(b.floors for b in inp.mass_blocks)
        
        if max_floors > inp.max_floors:
            violations.append(Violation(
                type="FLOORS",
                description=f"층수 초과: {max_floors}층 (한도 {inp.max_floors}층)",
                severity="CRITICAL",
                current_value=max_floors,
                limit_value=inp.max_floors,
                excess=max_floors - inp.max_floors,
            ))
        
        # ══════ 6. 후퇴거리 (Setback) 검증 — Shapely within() ══════
        if inp.buildable_polygon and len(inp.buildable_polygon) >= 3:
            buildable_poly = Polygon([(p[0], p[1]) for p in inp.buildable_polygon])
            if buildable_poly.is_valid:
                for block in inp.mass_blocks:
                    fp = _block_to_footprint_polygon(block)
                    if not buildable_poly.contains(fp):
                        # 침범 영역 계산
                        diff = fp.difference(buildable_poly)
                        if not diff.is_empty:
                            intrusion_area = round(diff.area, 2)
                            violations.append(Violation(
                                type="SETBACK",
                                description=(
                                    f"블록 '{block.id}'이(가) 건축가능영역을 침범합니다 "
                                    f"(침범 면적: {intrusion_area}㎡)"
                                ),
                                block_id=block.id,
                                severity="CRITICAL",
                                current_value=intrusion_area,
                                limit_value=0,
                                excess=intrusion_area,
                            ))
        
        # ══════ 7. 일조사선 검증 (정북방향) ══════
        if inp.north_boundary_y is not None and inp.sunlight_profile:
            for block in inp.mass_blocks:
                block_top = block.y + block.height
                # 블록의 정북방향 경계선까지 거리 (2D Y 기준)
                # Three.js z → 2D y: y_2d = -z
                block_north_edge = -block.z + block.depth / 2
                distance_to_boundary = abs(inp.north_boundary_y - block_north_edge)
                
                # 해당 거리에서의 최대 허용 높이 보간
                max_allowed_h = _interpolate_max_height(
                    inp.sunlight_profile, distance_to_boundary
                )
                
                if max_allowed_h is not None and block_top > max_allowed_h:
                    excess = round(block_top - max_allowed_h, 1)
                    violations.append(Violation(
                        type="SUNLIGHT",
                        description=(
                            f"블록 '{block.id}' 일조사선 침범: "
                            f"높이 {block_top:.1f}m (경계선 {distance_to_boundary:.1f}m 거리에서 "
                            f"최대 {max_allowed_h:.1f}m, {excess:.1f}m 초과)"
                        ),
                        block_id=block.id,
                        severity="CRITICAL",
                        current_value=block_top,
                        limit_value=max_allowed_h,
                        excess=excess,
                    ))
        
        # ══════ 결과 종합 ══════
        is_valid = len([v for v in violations if v.severity == "CRITICAL"]) == 0
        
        # 요약 텍스트 생성
        status = "✅ 전체 적합" if is_valid else f"❌ {len(violations)}건 위반"
        summary = (
            f"{status} | "
            f"건폐율: {coverage_pct}%/{inp.max_coverage_pct}% | "
            f"용적률: {far_pct}%/{inp.max_far_pct}% | "
            f"높이: {max_height:.1f}m/{inp.max_height_m}m | "
            f"연면적: {total_gfa:.0f}㎡"
        )
        
        return ComplianceResult(
            is_valid=is_valid,
            calculated_coverage_pct=coverage_pct,
            calculated_far_pct=far_pct,
            calculated_max_height=round(max_height, 1),
            calculated_total_gfa=round(total_gfa, 1),
            calculated_footprint=actual_footprint,
            calculated_total_floors=max_floors,
            violations=violations,
            warnings=warnings,
            summary=summary,
        )
        
    except Exception as e:
        return ComplianceResult(
            error=f"검증 오류: {str(e)}",
            summary=f"검증 실패: {str(e)}",
        )


def _interpolate_max_height(
    profile: list[dict], distance: float
) -> Optional[float]:
    """
    일조사선 높이 프로파일에서 특정 거리의 최대 허용 높이를 선형 보간.
    
    profile: [{"distance_from_boundary": 0, "max_height": 0}, ...]
    """
    if not profile:
        return None
    
    # 거리 기준 정렬
    sorted_p = sorted(profile, key=lambda p: p.get("distance_from_boundary", 0))
    
    for i, p in enumerate(sorted_p):
        d = p.get("distance_from_boundary", 0)
        h = p.get("max_height")
        
        if h is None:
            # "무제한" 표기 → 제한 없음
            return None
        
        if distance <= d:
            if i == 0:
                return h
            
            # 이전 점과 선형 보간
            prev = sorted_p[i - 1]
            prev_d = prev.get("distance_from_boundary", 0)
            prev_h = prev.get("max_height", 0)
            
            if prev_h is None:
                return None
            
            if d == prev_d:
                return h
            
            ratio = (distance - prev_d) / (d - prev_d)
            return round(prev_h + (h - prev_h) * ratio, 1)
    
    # 프로파일 범위 초과 → 제한 없음
    return None
