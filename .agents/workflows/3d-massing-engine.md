---
description: 3D 매스 엔진 AI 스킬 — 7종 매스 생성, 법규 검증, 태양 궤적 계산
---

# 🏗️ 3D 매스 제너레이터 핵심 스킬 (Skill 7-9)

> **목적**: SiteParameters 기반으로 7종 건물 매스 자동 생성, 법규 정합성 수학적 검증, 태양 궤적/그림자 연산을 수행하는 3개 백엔드 AI 스킬(Function Calling Tools)입니다.
> **의존성**: `shapely>=2.0.0` (기하학 연산), Python `math` 내장 (천문 연산)

---

## ⚡ 스킬 상호 의존 관계

```
[주소입력] → [Skill 1-6: 법규분석·대지분석]
                    ↓
              SiteParameters JSON
                    ↓
   ┌────────────────┼────────────────┐
   ↓                ↓                ↓
[Skill 7]       [Skill 8]       [Skill 9]
매스 생성 ──→ 법규 검증       태양 궤적
   ↓                ↓                ↓
Wing[] JSON   ComplianceResult  SolarResult
   ↓                ↓                ↓
   └────────────────┼────────────────┘
                    ↓
          Three.js 3D 렌더링
```

---

## Skill 7: `generate_typology_massing` (형태별 매스 뼈대 생성)

### 파일 위치
- **엔진**: `services/land_use_regulation/massing_engine.py`
- **FC 정의**: `services/land_use_regulation/fc_executor.py` (TOOL_DEFINITIONS[6])
- **REST API**: `POST /api/massing/generate`

### Function Calling Schema

```json
{
  "name": "generate_typology_massing",
  "description": "SiteParameters와 대지 폴리곤을 입력받아, 지정된 건물 형태의 3D 매스 블록 배열을 생성합니다.",
  "parameters": {
    "type": "object",
    "properties": {
      "site_polygon": { "type": "array", "description": "대지 경계 좌표 [[x,y], ...]" },
      "typology_type": { "type": "string", "enum": ["SINGLE_BLOCK","TOWER_PODIUM","L_SHAPE","U_SHAPE","PARALLEL","COURTYARD","STAGGERED","ALL"] },
      "max_coverage_pct": { "type": "number" },
      "max_far_pct": { "type": "number" },
      "max_height_m": { "type": "number" },
      "max_floors": { "type": "integer" },
      "floor_height_m": { "type": "number", "description": "기본 3.3" },
      "setback_m": { "type": "number", "description": "기본 1.5" }
    },
    "required": ["site_polygon", "typology_type", "max_coverage_pct", "max_far_pct", "max_height_m", "max_floors"]
  }
}
```

### 7종 타입 설명

| 코드 | 이름 | Wing 수 | 설명 |
|------|------|---------|------|
| `SINGLE_BLOCK` | 단일 블록 | 1 | 단순 직사각형 매스 |
| `TOWER_PODIUM` | 타워+포디엄 | 2 | 저층 넓은 판 + 고층 좁은 타워 |
| `L_SHAPE` | ㄱ자형 | 2 | 2개 Wing 90° 교차 |
| `U_SHAPE` | ㄷ자형 | 3 | 3개 Wing, 남향 중정 개방 |
| `PARALLEL` | 평행동 | 2~3 | 인동간격 H×0.5 확보 |
| `COURTYARD` | 사각 중정 | 4 | 4면 Wing, 중앙 중정 |
| `STAGGERED` | 엇갈림 | 2~3 | 좌우 오프셋 배치 |
| `ALL` | 전체 비교 | - | 7종 전부 생성하여 비교 |

### 핵심 기하학 연산 (Shapely 기반)

```python
# 1. 건축가능영역 계산 — Shapely buffer(-distance)
buildable = site_polygon.buffer(-setback_m, join_style='mitre')
# → Self-intersection 자동 해결

# 2. 바닥면적 합산 — Shapely unary_union
union_footprint = ops.unary_union(footprint_polygons)
total_footprint = union_footprint.area
# → ㄱ자형 교차부 중복 면적 자동 제거

# 3. 직사각형 피팅 — Shapely contains
rect = box(cx - w/2, cy - h/2, cx + w/2, cy + h/2)
if polygon.contains(rect):  # 폴리곤 안에 완전히 들어가는지
    return rect
```

### 출력 예시

```json
{
  "typology_type": "TOWER_PODIUM",
  "typology_label": "타워 + 포디엄",
  "wings": [
    {"id":"pod-1","label":"포디엄","width":29.6,"depth":21.6,"height":9.9,"x":20,"y":0,"z":-15,"floors":3},
    {"id":"twr-1","label":"타워","width":14.8,"depth":12.3,"height":39.6,"x":20,"y":9.9,"z":-15,"floors":12}
  ],
  "calculated_coverage_pct": 53.3,
  "calculated_far_pct": 217.8,
  "max_height_m": 49.5,
  "buildable_polygon": [[1.5,1.5],[38.5,1.5],[38.5,28.5],[1.5,28.5]]
}
```

### AI 행동 지침

```
[매스 생성 요청 시 AI 필수 행동]
1. 먼저 get_land_use_regulation으로 법적 제약(건폐율/용적률) 확보
2. SiteParameters에서 대지 폴리곤, setback, 법적 한도 추출
3. typology_type="ALL"로 7종 전체 생성 후 최적 옵션 추천
4. 각 옵션의 건폐율/용적률이 한도 내인지 확인
5. 한도 초과 시 경고와 함께 대안 제시
```

---

## Skill 8: `validate_mass_compliance` (법규 정합성 검증)

### 파일 위치
- **엔진**: `services/land_use_regulation/massing_validator.py`
- **FC 정의**: `services/land_use_regulation/fc_executor.py` (TOOL_DEFINITIONS[7])
- **REST API**: `POST /api/massing/validate`

### 검증 항목 (6개)

| # | 항목 | 검증 방법 | 근거 법규 |
|---|------|----------|---------|
| 1 | 건폐율 | `unary_union(footprints).area / site_area × 100` | 국토계획법 §77 |
| 2 | 용적률 | `Σ(floor_area × floors) / site_area × 100` | 국토계획법 §78 |
| 3 | 높이 | `max(block.y + block.height)` vs 한도 | 건축법 §60 |
| 4 | 층수 | `max(block.floors)` vs 한도 | 건축법 §60 |
| 5 | 건축선 후퇴 | `buildable_poly.contains(footprint)` | 건축법 §46 |
| 6 | 일조사선 | `distance_to_boundary` vs `height_profile` | 건축법 시행령 §86 |

### 핵심 Shapely 연산

```python
# 1. 건축면적 — 중복 영역 자동 제거
union_footprint = ops.unary_union(footprint_polys)
actual_footprint = union_footprint.area

# 2. 건축가능영역 포함 검사
if not buildable_poly.contains(block_footprint):
    diff = block_footprint.difference(buildable_poly)
    intrusion_area = diff.area  # 침범 면적 (㎡)
```

### 출력 예시

```json
{
  "is_valid": true,
  "calculated_coverage_pct": 53.3,
  "calculated_far_pct": 217.8,
  "calculated_max_height": 49.5,
  "calculated_total_gfa": 26136.0,
  "violations": [],
  "summary": "✅ 전체 적합 | 건폐율: 53.3%/60% | 용적률: 217.8%/250%"
}
```

---

## Skill 9: `calculate_solar_sun_path` (태양 궤적 & 그림자)

### 파일 위치
- **엔진**: `services/land_use_regulation/solar_calculator.py`
- **FC 정의**: `services/land_use_regulation/fc_executor.py` (TOOL_DEFINITIONS[8])
- **REST API**: `POST /api/massing/solar`

### 알고리즘 (NOAA Solar Calculator — 순수 Python math)

```
1. Julian Date 계산
2. 태양 평균 경도 (Geometric Mean Longitude)
3. 태양 평균 근점이각 (Mean Anomaly)
4. 태양 중심차 (Equation of Center)
5. 태양 적위 (Declination)
6. 균시차 (Equation of Time)
7. 시간각 (Hour Angle)
8. 고도각 = arcsin(sin(lat)×sin(dec) + cos(lat)×cos(dec)×cos(ha))
9. 방위각 = atan2(-sin(ha), tan(dec)×cos(lat) - sin(lat)×cos(ha))
```

### Three.js 벡터 변환

```
Three.js 좌표계: X=East, Y=Up, Z=South

sun_direction:
  x = cos(altitude) × sin(azimuth) × 1000
  y = sin(altitude) × 1000
  z = -cos(altitude) × cos(azimuth) × 1000

shadow_direction:
  shadow_azimuth = azimuth + 180°
  x = sin(shadow_azimuth)
  z = -cos(shadow_azimuth)

shadow_length_ratio = 1 / tan(altitude)
```

### 출력 예시 (동지일 서울 정오)

```json
{
  "azimuth_deg": 180.5,
  "altitude_deg": 29.2,
  "sun_direction": {"x": 8.7, "y": 487.4, "z": -873.2},
  "shadow_direction": {"x": -0.01, "y": 0, "z": 1.0},
  "shadow_length_ratio": 1.79,
  "sunrise_time": "07:43",
  "sunset_time": "17:18",
  "winter_solstice_hours": 9.5
}
```

---

## 통합 파이프라인

```
[Skill 1-6: 법규분석]
        ↓
  SiteParameters {
    max_coverage: 60%,
    max_far: 250%,
    max_height: 50m,
    setback: {N: 1.5, S: 3.0},
    site_polygon: [[0,0],[40,0],[40,30],[0,30]]
  }
        ↓
[Skill 7: generate_typology_massing(type="ALL")]
        ↓
  7종 BuildingOption[]
        ↓
[Skill 8: validate_mass_compliance(blocks, limits)]
        ↓
  적합: ✅ TOWER_PODIUM, ✅ L_SHAPE
  부적합: ❌ COURTYARD (건폐율 초과)
        ↓
[Skill 9: calculate_solar_sun_path(lat, lng, "동지일")]
        ↓
  그림자 방향 → Three.js DirectionalLight
  동지일 일조시간 → 건축법 기준 확인
        ↓
[Frontend: SceneViewer v2]
  → Wing별 독립 매스 렌더링
  → 건폐율/용적률 메트릭 패널
  → 옵션 갤러리 비교
  → 시간별 그림자 애니메이션
```

---

## 파일 구조 (업데이트)

```
services/land_use_regulation/
├── land_use_service.py          # FastAPI (REST 엔드포인트 9개)
├── fc_executor.py               # FC 실행기 (도구 9개)
├── site_analysis.py             # Skill 4-6 (지구단위·접도·일조)
├── massing_engine.py            # 🆕 Skill 7: 7종 매스 생성
├── massing_validator.py         # 🆕 Skill 8: 법규 검증
├── solar_calculator.py          # 🆕 Skill 9: 태양 궤적
├── test_massing_engine.py       # 🆕 통합 테스트
├── regulation_details.py
├── .env
└── requirements.txt             # + shapely>=2.0.0
```

## 등록된 AI 도구 총 9개

| # | 도구명 | 입력 | 출력 | 기하학 라이브러리 |
|---|--------|------|------|------------------|
| 1 | `get_land_use_regulation` | address | 법규 데이터 | - |
| 2 | `get_pnu_code` | address | PNU 코드 | - |
| 3 | `get_zone_limits` | zone_name | 법정 기준 | - |
| 4 | `detect_district_plan` | address | 지구단위 감지 | - |
| 5 | `analyze_road_adjacency` | polygon, roads | 접도 분석 | math |
| 6 | `calculate_sunlight_setback` | polygon, zones | 사선제한 | math |
| 7 | **`generate_typology_massing`** | **polygon, type, limits** | **Wing[]** | **Shapely** |
| 8 | **`validate_mass_compliance`** | **blocks, limits** | **적합/위반** | **Shapely** |
| 9 | **`calculate_solar_sun_path`** | **lat, lng, datetime** | **태양벡터** | **math** |

---

## 체크리스트

- [x] massing_engine.py — 7종 타입 생성기 (Shapely 기반)
- [x] massing_validator.py — 6항목 법규 검증 (Shapely 기반)
- [x] solar_calculator.py — NOAA 알고리즘 (순수 math)
- [x] fc_executor.py — Skill 7-9 JSON Schema + 라우터 등록
- [x] land_use_service.py — REST 엔드포인트 3개 추가
- [x] requirements.txt — shapely>=2.0.0 추가
- [x] test_massing_engine.py — 통합 테스트
- [ ] 프론트엔드 SceneViewer.tsx Wing[] 렌더링 연동
- [ ] 옵션 갤러리 UI 구현
- [ ] 인터랙티브 파라메트릭 컨트롤 (슬라이더)
