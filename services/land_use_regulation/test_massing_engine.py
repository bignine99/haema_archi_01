"""
3D 매스 엔진 통합 테스트.

Skill 7 (매스 생성) + Skill 8 (법규 검증) + Skill 9 (태양 궤적)
전체 파이프라인을 테스트합니다.

실행: python test_massing_engine.py
"""

import json
import sys

def test_skill_7_massing():
    """Skill 7: 7종 매스 생성 테스트"""
    from massing_engine import MassingInput, generate_massing, generate_all_typologies
    
    # 테스트 대지: 40m × 30m 직사각형
    site = [[0,0], [40,0], [40,30], [0,30]]
    
    inp = MassingInput(
        site_polygon=site,
        typology_type="TOWER_PODIUM",
        max_coverage_pct=60,
        max_far_pct=250,
        max_height_m=50,
        max_floors=15,
        floor_height_m=3.3,
        setback_m=1.5,
    )
    
    print("=" * 60)
    print("🏗️ Skill 7: generate_typology_massing 테스트")
    print("=" * 60)
    
    # 개별 타입 테스트
    types = ["SINGLE_BLOCK", "TOWER_PODIUM", "L_SHAPE", "U_SHAPE", "PARALLEL", "COURTYARD", "STAGGERED"]
    
    for t in types:
        inp.typology_type = t
        result = generate_massing(inp)
        
        status = "✅" if not result.error else "❌"
        wing_info = ", ".join([f"{w.label}({w.width:.0f}×{w.depth:.0f}×{w.floors}F)" for w in result.wings])
        
        print(f"  {status} {t:16s} | 건폐율 {result.calculated_coverage_pct:5.1f}% | "
              f"용적률 {result.calculated_far_pct:6.1f}% | "
              f"높이 {result.max_height_m:5.1f}m | Wings: {wing_info}")
        
        if result.error:
            print(f"     ⚠️ 오류: {result.error}")
    
    print(f"\n  건축가능영역: {result.buildable_area_sqm:.0f}㎡ (대지 {result.site_area_sqm:.0f}㎡)")


def test_skill_8_validator():
    """Skill 8: 법규 검증 테스트"""
    from massing_engine import MassingInput, generate_massing
    from massing_validator import ComplianceInput, MassBlock, validate_compliance
    
    print("\n" + "=" * 60)
    print("📋 Skill 8: validate_mass_compliance 테스트")
    print("=" * 60)
    
    site = [[0,0], [40,0], [40,30], [0,30]]
    
    inp = MassingInput(
        site_polygon=site,
        typology_type="L_SHAPE",
        max_coverage_pct=60,
        max_far_pct=250,
        max_height_m=50,
        max_floors=15,
    )
    
    massing = generate_massing(inp)
    
    # 생성된 Wing → 검증 입력으로 변환
    blocks = [
        MassBlock(
            id=w.id,
            width=w.width,
            depth=w.depth,
            height=w.height,
            x=w.x,
            z=w.z,
            y=w.y,
            rotation=w.rotation,
            floors=w.floors,
            floor_area_sqm=w.floor_area_sqm,
            footprint_coords=w.footprint_coords,
        )
        for w in massing.wings
    ]
    
    comp_input = ComplianceInput(
        mass_blocks=blocks,
        site_area_sqm=massing.site_area_sqm,
        max_coverage_pct=60,
        max_far_pct=250,
        max_height_m=50,
        max_floors=15,
        buildable_polygon=massing.buildable_polygon,
    )
    
    result = validate_compliance(comp_input)
    
    print(f"  결과: {'✅ 적합' if result.is_valid else '❌ 부적합'}")
    print(f"  {result.summary}")
    
    if result.violations:
        for v in result.violations:
            print(f"  ⚠️ [{v.type}] {v.description}")
    
    print(f"  건축면적: {result.calculated_footprint:.1f}㎡")
    print(f"  연면적: {result.calculated_total_gfa:.1f}㎡")


def test_skill_9_solar():
    """Skill 9: 태양 궤적 테스트"""
    from solar_calculator import SolarInput, calculate_solar
    
    print("\n" + "=" * 60)
    print("☀️ Skill 9: calculate_solar_sun_path 테스트")
    print("=" * 60)
    
    # 동지일 정오 (서울)
    inp = SolarInput(
        latitude=37.5665,
        longitude=126.978,
        date_time="2026-12-22T12:00:00",
        timezone_offset=9.0,
    )
    
    result = calculate_solar(inp)
    
    print(f"  위치: N{inp.latitude:.4f}, E{inp.longitude:.3f}")
    print(f"  일시: {result.input_datetime}")
    print(f"  일출: {result.sunrise_time} | 일몰: {result.sunset_time} | 낮 시간: {result.daylight_hours}h")
    print(f"  방위각: {result.azimuth_deg}° | 고도각: {result.altitude_deg}°")
    print(f"  Three.js 태양 벡터: x={result.sun_direction.x}, y={result.sun_direction.y}, z={result.sun_direction.z}")
    print(f"  그림자 방향: x={result.shadow_direction.x}, z={result.shadow_direction.z}")
    print(f"  그림자 길이비율: {result.shadow_length_ratio} (1m 건물 기준)")
    print(f"  동지일 일조시간: {result.winter_solstice_hours}시간")
    
    if result.daily_path:
        print(f"\n  하루 태양 경로 ({len(result.daily_path)}시점):")
        for p in result.daily_path:
            if p.is_above_horizon:
                print(f"    {int(p.hour):02d}시 | 방위 {p.azimuth_deg:6.1f}° | "
                      f"고도 {p.altitude_deg:5.1f}° | 그림자 {p.shadow_length_ratio:.1f}배")


if __name__ == "__main__":
    print("\n🚀 3D 매스 엔진 통합 테스트 시작\n")
    
    try:
        test_skill_7_massing()
    except Exception as e:
        print(f"\n❌ Skill 7 오류: {e}")
    
    try:
        test_skill_8_validator()
    except Exception as e:
        print(f"\n❌ Skill 8 오류: {e}")
    
    try:
        test_skill_9_solar()
    except Exception as e:
        print(f"\n❌ Skill 9 오류: {e}")
    
    print("\n✅ 테스트 완료")
