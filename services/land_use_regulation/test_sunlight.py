# -*- coding: utf-8 -*-
import sys, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from site_analysis import calculate_sunlight_setback

s = calculate_sunlight_setback(
    [(0,0),(30,0),(30,20),(0,20)],
    ['제2종일반주거지역']
)
print(f"applies: {s.regulation_applies}")
print(f"zone: {s.zone_type}")
print(f"formula: {s.setback_formula}")
print(f"north_edges: {len(s.north_facing_edges)}")
for e in s.north_facing_edges:
    print(f"  edge{e.edge_index}: dir={e.normal_direction} len={e.length}m north={e.is_north_facing}")
print(f"profile samples:")
for p in s.height_profile[:6]:
    print(f"  dist={p['distance_from_boundary']}m -> {p['note']}")
