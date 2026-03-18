---
description: 건축 설계 분석 AI 스킬 — 지구단위계획 감지, 도로 접도 분석, 일조권 사선제한 계산
---

# 🏗️ 건축 설계 분석 AI 스킬 (Building Design Analysis Skills)

> **목적**: 토지이용규제 조회(`get_land_use_regulation`) 이후 반드시 필요한 3가지 **설계적 분석 스킬**을 정의합니다.
> 이 3가지가 누락되면 **인허가 100% 반려** 위험이 있습니다.

---

## ⚠️ 리스크 매트릭스

| # | 스킬 | 누락 리스크 | 심각도 | 근거 법규 |
|---|------|-----------|--------|----------|
| 1 | **지구단위계획 감지** | 지침의 건축한계선·최고높이 미준수 → 인허가 반려 | 🔴 CRITICAL | 국토계획법 §51 |
| 2 | **도로 접도 분석** | 건축선 후퇴 오류 → 건축가능영역 부정확 | 🟠 HIGH | 건축법 §44, §46 |
| 3 | **일조권 사선제한** | 정북 사선 미적용 → 주거지역 건축 불가 | 🟠 HIGH | 건축법 시행령 §86 |

---

## 1. Skill: detect_district_plan (지구단위계획 감지)

### 1-1. 문제 상황

```
❌ get_land_use_regulation 결과: "지구단위계획구역" 감지됨
   → 하지만 건폐율 60%, 용적률 250%는 "일반 조례 한도"일 뿐
   → 실제로는 지구단위계획 지침에서 50%, 180%로 강화되어 있을 수 있음
   → 건축한계선 5m 후퇴, 최고높이 25m 등 세부 규정이 별도 존재
   → 이대로 3D 매스를 올리면 인허가에서 100% 반려
```

### 1-2. 해결 전략

```
[단기] UQQ100 감지 → CRITICAL 경고 + 수동 입력 UI 팝업
       └→ 최고높이, 건폐율/용적률(지구단위), 건축한계선, 용도 제한
[장기] 토지이음 PDF → RAG(벡터DB) → AI가 자동 파싱
```

### 1-3. Function Calling Schema

```json
{
  "name": "detect_district_plan",
  "description": "토지이용규제 분석 결과에서 지구단위계획구역 해당 여부를 감지하고, 수동 입력 필요 항목을 반환합니다.",
  "parameters": {
    "type": "object",
    "properties": {
      "address": { "type": "string", "description": "분석 대지 주소" }
    },
    "required": ["address"]
  }
}
```

### 1-4. 반환 예시 (지구단위계획 감지 시)

```json
{
  "detected": true,
  "regulation_code": "UQQ100",
  "severity": "CRITICAL",
  "warning_message": "⚠️ 본 대지는 [지구단위계획구역]에 해당합니다...",
  "action_required": "1. 시청 도시과에 지침도 요청\n2. 토지이음 열람\n3. 수동 입력",
  "manual_input_schema": {
    "fields": [
      {"name": "max_height", "label": "최고 높이 제한 (m)", "required": true},
      {"name": "plan_building_coverage", "label": "건폐율 (%)", "required": true},
      {"name": "plan_floor_area_ratio", "label": "용적률 (%)", "required": true},
      {"name": "building_limit_line_setback", "label": "건축한계선 후퇴거리 (m)"},
      {"name": "building_designated_line_setback", "label": "건축지정선 후퇴거리 (m)"},
      {"name": "building_designated_line_ratio", "label": "벽면지정비율 (%)"}
    ],
    "reference_links": [
      {"label": "토지이음 - 지구단위계획 열람", "url": "https://www.eum.go.kr/"}
    ]
  }
}
```

### 1-5. AI 행동 지침

```
[지구단위계획 감지 시 AI 필수 행동]
1. 사용자에게 CRITICAL 경고를 표시하라
2. "현재 건폐율/용적률은 일반 조례 기준입니다. 지구단위계획에서 다른 값이 적용될 수 있습니다"
3. 수동 입력 UI를 트리거하라
4. 수동 입력값이 확보되면 해당 값으로 건폐율/용적률을 오버라이드하라
5. 수동 입력 없이 3D 매스를 생성하면 경고 워터마크를 표시하라
```

---

## 2. Skill: analyze_road_adjacency (도로 접도 분석)

### 2-1. 문제 상황

```
❌ 현재: "중로2류(폭 15m~20m)" 텍스트만 존재
   → 도로가 대지의 어느 면(동/서/남/북)에 접해 있는지 모름
   → 접한 길이가 몇 미터인지 모름
   → 건축선 후퇴 방향/거리를 계산할 수 없음
   → 3D Buildable Area가 부정확
```

### 2-2. 알고리즘

```
[입력] 대지 폴리곤 [(x1,y1), (x2,y2), ...] (미터 단위)
       도로 접도 정보 [{edge_index: 0, road_width: 15}, ...]

[처리]
  1. 대지 폴리곤의 각 변(edge) 분석
     → 변의 방위각(azimuth) 계산: atan2(dx, dy) × 180/π
     → 외향 법선 방위각 = 변 방위각 + 90°
     → 8방위 분류 (N/NE/E/SE/S/SW/W/NW)

  2. 각 도로 접도에 대해
     → 접한 변의 길이 = √((x2-x1)² + (y2-y1)²)
     → 도로 폭원에 따른 건축선 후퇴거리 계산
       - 4m 미만: (4 - 폭원) / 2 후퇴
       - 4m 이상: 기본 후퇴 없음

  3. 접도 요건 판단 (건축법 제44조)
     → 최대 접도길이 ≥ 2m & 도로폭 ≥ 4m → 충족

[출력] 방위별 접도 정보 + 건축선 후퇴 맵
```

### 2-3. 도로 등급 분류 (도로법 시행규칙)

| 등급 | 폭원 | 코드 |
|------|------|------|
| 소로3류 | 4m 미만 | - |
| 소로2류 | 4~6m | UQS |
| 소로1류 | 6~8m | UQS |
| 중로2류 | 8~12m | UQS110 |
| 중로1류 | 12~15m | UQS110 |
| 대로3류 | 15~20m | UQS110 |
| 대로2류 | 20~25m | UQS110 |
| 대로1류 | 25m 이상 | UQS110 |

### 2-4. Function Calling Schema

```json
{
  "name": "analyze_road_adjacency",
  "description": "대지 폴리곤과 도로 데이터를 분석하여 접도 방위, 폭원, 접도 길이, 건축선 후퇴거리를 계산합니다.",
  "parameters": {
    "type": "object",
    "properties": {
      "site_polygon": {
        "type": "array",
        "items": {"type": "array", "items": {"type": "number"}},
        "description": "대지 경계 좌표 [[x,y], ...] (미터 단위)"
      },
      "road_edges": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "edge_index": {"type": "integer"},
            "road_name": {"type": "string"},
            "road_width": {"type": "number"}
          }
        }
      }
    },
    "required": ["site_polygon", "road_edges"]
  }
}
```

### 2-5. 반환 예시

```json
{
  "total_roads": 2,
  "roads": [
    {
      "edge_index": 0,
      "direction": "S",
      "road_name": "중로2류",
      "road_width": 15.0,
      "contact_length": 32.5,
      "setback_required": 0,
      "setback_rule": "대로3류(15~20m): 기본 후퇴 없음"
    },
    {
      "edge_index": 2,
      "direction": "W",
      "road_name": "소로2류",
      "road_width": 5.0,
      "contact_length": 18.3,
      "setback_required": 0,
      "setback_rule": "소로2류(4~6m): 기본 후퇴 없음 (지자체 조례 확인)"
    }
  ],
  "meets_access_requirement": true,
  "setback_summary": {"S": 0, "W": 0}
}
```

---

## 3. Skill: calculate_sunlight_setback (일조권 사선제한)

### 3-1. 법적 근거

```
건축법 시행령 제86조 (일조 등의 확보를 위한 건축물의 높이 제한)

제1항: 전용주거지역·일반주거지역에서 건축물의 각 부분을
       정북방향으로의 인접 대지 경계선으로부터:

  ┌─────────────────────────────────────────────────┐
  │ 높이 9m 이하 부분 → 경계선으로부터 1.5m 이상     │
  │ 높이 9m 초과 부분 → 해당 높이의 1/2 이상         │
  └─────────────────────────────────────────────────┘

  예: 건물 높이 = 30m
      → 9m까지: 1.5m 이격
      → 30m 부분: 30 × 0.5 = 15m 이격
```

### 3-2. 시각적 설명

```
                              ↑ 북 (True North)
                              │
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤ ← 인접 대지 경계선 (정북)
                              │
             ╱                │
           ╱  사선             │← 1.5m 이격
         ╱    (h/2)           │
       ╱                      │
     ╔════╗ ← 건물 9m 초과 부분│
     ║    ║                   │
     ║    ║                   │
     ║    ║ ← 건물 9m 이하    │
     ╚════╝                   │
  ──────────────────────────  │ ← 대지 남측 경계
```

### 3-3. 정북방향 경계선 판별 알고리즘

```
1. 대지 폴리곤의 각 변(edge)에 대해 외향 법선 벡터 계산
2. 외향 법선의 방위각이 315°~45° 범위 → "정북방향 경계선"
3. 정북방향 경계선에서만 사선제한 적용

  [방위각 정의]
  0° = 정북 (True North)
  90° = 정동
  180° = 정남
  270° = 정서

  [정북 판별 범위]
  315° ≤ azimuth ≤ 360° → 북서~북
  0° ≤ azimuth ≤ 45°   → 북~북동
```

### 3-4. 높이별 이격거리 테이블

| 건물 높이 (m) | 경계선 이격거리 (m) | 비고 |
|:---:|:---:|:---|
| 3 | 1.5 | 1층 (고정) |
| 6 | 1.5 | 2층 (고정) |
| 9 | 1.5 | 3층 (임계점) |
| 12 | 6.0 | 12 × 0.5 |
| 15 | 7.5 | 15 × 0.5 |
| 20 | 10.0 | 20 × 0.5 |
| 30 | 15.0 | 30 × 0.5 |
| 45 | 22.5 | 15층급 |
| 60 | 30.0 | 20층급 |

### 3-5. 3D 매스 사선 절단 데이터

반환되는 `height_profile`을 Three.js에서 사선 절단 면(Clipping Plane)으로 활용:

```typescript
// height_profile을 Three.js Clipping Plane으로 변환
function createSunlightClippingPlane(
    northBoundary: THREE.Line3,  // 정북 경계선
    heightProfile: {distance: number, max_height: number}[]
): THREE.Plane[] {
    // 경계선에서 distance만큼 떨어진 위치에서
    // max_height를 초과하지 않는 절단면 생성
    // → 사선 형태의 Clipping Plane
}
```

### 3-6. Function Calling Schema

```json
{
  "name": "calculate_sunlight_setback",
  "description": "정북방향 일조권 사선제한을 계산합니다 (건축법 시행령 제86조)",
  "parameters": {
    "type": "object",
    "properties": {
      "site_polygon": {
        "type": "array",
        "items": {"type": "array", "items": {"type": "number"}},
        "description": "대지 경계 좌표 [[x,y], ...] (미터 단위)"
      },
      "zone_types": {
        "type": "array",
        "items": {"type": "string"},
        "description": "용도지역 목록 (예: ['제2종일반주거지역'])"
      },
      "true_north_offset": {
        "type": "number",
        "description": "진북 보정값 (도). 기본 0"
      }
    },
    "required": ["site_polygon", "zone_types"]
  }
}
```

---

## 4. 통합 파이프라인

```
[주소 입력]
    ↓
[Skill 1: get_land_use_regulation]  ← 기존 스킬
    ↓ (건폐율, 용적률, 용도지역, 규제항목)
    ↓
[Skill 2: detect_district_plan]  ← 🆕 신규
    ↓ (지구단위 감지 → CRITICAL 경고 + 수동입력 UI)
    ↓
[대지 폴리곤 확보] (VWorld API or 사용자 입력)
    ↓
┌───────────────────────────┬───────────────────────────┐
↓                           ↓                           ↓
[Skill 3]               [Skill 4]               [Skill 5]
analyze_road_adjacency   calculate_sunlight      district_plan_override
(접도 분석)              (일조 사선)             (수동 입력값 적용)
    ↓                       ↓                       ↓
    └───────────┬───────────┘                       │
                ↓                                   │
[Buildable Area 계산]                               │
(건축가능영역 = 대지 - 건축선후퇴 - 일조사선)          │
                ↓                                   │
[3D 매스 생성] ←────── 높이·건폐율·용적률 제한 ────────┘
    ↓
[인허가 검증]
```

---

## 5. 파일 구조

```
services/land_use_regulation/
├── land_use_service.py      # 메인 서비스 (FastAPI v3.0)
├── fc_executor.py           # Function Calling 실행기 (6개 도구)
├── site_analysis.py         # 🆕 대지 분석 엔진 (3개 신규 스킬)
├── regulation_details.py    # 규제 코드 상세 DB (40+ 항목)
├── .env                     # API 키
├── requirements.txt         # Python 의존성
└── test_api.py              # API 테스트

.agents/workflows/
├── land-use-regulation.md   # 토지이용규제 스킬 정의서
├── building-design-analysis.md  # 🆕 건축 설계 분석 스킬 정의서 (이 파일)
├── geospatial-data.md       # 좌표계·GIS 데이터 처리
├── computer-vision.md       # 컴퓨터 비전
├── 3d-visualization.md      # 3D 시각화
└── rag-law-search.md        # RAG 법규 검색
```

---

## 6. 등록된 AI 도구 총 6개

| # | 도구명 | 입력 | 출력 | API 호출 |
|---|--------|------|------|---------|
| 1 | `get_land_use_regulation` | address | 건폐율/용적률/용도지역 | 카카오+VWorld |
| 2 | `get_pnu_code` | address | 19자리 PNU | 카카오 |
| 3 | `get_zone_limits` | zone_name | 법정 기준표 | 없음 |
| 4 | **`detect_district_plan`** | address | 지구단위 감지+입력 스키마 | 카카오+VWorld |
| 5 | **`analyze_road_adjacency`** | polygon, roads | 접도 분석+후퇴거리 | 없음 (수학) |
| 6 | **`calculate_sunlight_setback`** | polygon, zones | 사선제한+3D 절단 | 없음 (수학) |

---

## 체크리스트

- [x] 지구단위계획 감지 로직 (UQQ100/special_zones 탐색)
- [x] 수동 입력 UI 스키마 정의 (max_height, 건폐율, 건축한계선 등)
- [x] 도로 접도 분석 알고리즘 (방위각, 외향법선, 접도길이)
- [x] 도로 폭원별 건축선 후퇴거리 계산 (건축법 §46)
- [x] 접도 요건 판단 (건축법 §44: 2m 이상 접도, 4m 이상 도로)
- [x] 정북방향 경계선 판별 (방위각 315°~45°)
- [x] 일조사선 높이별 이격거리 산출 (건축법 시행령 §86)
- [x] 높이 프로파일 생성 (3D 매스 절단 데이터)
- [x] 용도지역별 일조사선 적용 여부 매핑
- [x] Function Calling 스키마 3개 정의
- [x] fc_executor.py 실행 함수 3개 추가
- [ ] 프론트엔드 수동 입력 UI 컴포넌트 구현
- [ ] Three.js 사선 절단(Clipping Plane) 연동
- [ ] VWorld WFS 기반 도로 폴리곤 자동 탐지
- [ ] 토지이음 PDF RAG 파이프라인 (장기)
