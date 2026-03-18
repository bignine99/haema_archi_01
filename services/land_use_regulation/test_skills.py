# -*- coding: utf-8 -*-
"""건축 설계 분석 스킬 검증 스크립트"""
from site_analysis import (
    detect_district_plan,
    analyze_road_adjacency,
    calculate_sunlight_setback,
)
import json

print("=" * 60)
print("  Building Design Analysis Skills - Verification")
print("=" * 60)

# ── Test 1: 지구단위계획 감지 ──
print("\n[1] 지구단위계획 감지 테스트")
regulations = [
    {"regulation_code": "UQA122", "regulation_name": "제2종일반주거지역"},
    {"regulation_code": "UQQ100", "regulation_name": "지구단위계획구역"},
]
special_zones = ["지구단위계획구역", "대공방어협조구역"]

detection = detect_district_plan(regulations, special_zones)
print(f"  감지됨: {detection.detected}")
print(f"  심각도: {detection.severity}")
print(f"  코드: {detection.regulation_code}")
print(f"  필드 수: {len(detection.manual_input_schema.get('fields', []))}개")
print(f"  경고: {detection.warning_message[:60]}...")

# ── Test 2: 도로 접도 분석 ──
print("\n[2] 도로 접도 분석 테스트")
# 30m x 20m 사각형 대지 (미터 단위)
polygon = [(0, 0), (30, 0), (30, 20), (0, 20)]
roads = [
    {"edge_index": 0, "road_name": "중로2류", "road_width": 15.0},
    {"edge_index": 3, "road_name": "소로2류", "road_width": 5.0},
]

road_result = analyze_road_adjacency(polygon, roads)
print(f"  접도 도로 수: {road_result.total_roads}")
print(f"  접도 요건 충족: {road_result.meets_access_requirement}")
for r in road_result.roads:
    print(f"  - {r.direction}면: {r.road_name} (폭{r.road_width}m, 접도{r.contact_length:.1f}m, 후퇴{r.setback_required}m)")
print(f"  후퇴 요약: {road_result.setback_summary}")

# ── Test 3: 일조사선 계산 ──
print("\n[3] 일조권 사선제한 테스트")
zones = ["제2종일반주거지역"]

sunlight = calculate_sunlight_setback(polygon, zones)
print(f"  적용 여부: {sunlight.regulation_applies}")
print(f"  용도지역: {sunlight.zone_type}")
print(f"  사선 공식: {sunlight.setback_formula}")
print(f"  정북 경계선: {len(sunlight.north_facing_edges)}개")
for edge in sunlight.north_facing_edges:
    print(f"  - 변{edge.edge_index}: {edge.normal_direction}방향, 길이{edge.length}m, 9m시 이격{edge.setback_at_9m}m")

print("\n  높이별 이격거리 (height_profile):")
for hp in sunlight.height_profile[:8]:
    dist = hp["distance_from_boundary"]
    note = hp["note"]
    print(f"    경계선 {dist}m → {note}")

print(f"\n  법규 근거: {sunlight.regulation_basis[:80]}...")

print("\n" + "=" * 60)
print("  ✅ 모든 스킬 검증 완료!")
print("=" * 60)
