"""
██████████████████████████████████████████████████████████████████████
███ AI Function Calling 실행 래퍼 (FC Executor)                      ███
███ ─────────────────────────────────────────────────────           ███
███ Gemini Function Calling → get_land_use_regulation 실행           ███
███ JSON Schema 정의 + 실행 함수 + 에러 핸들링 통합 모듈              ███
██████████████████████████████████████████████████████████████████████

이 모듈은 AI 에이전트(Gemini)가 Function Calling으로 호출할 때
사용되는 도구 정의(Schema)와 실행 래퍼(Executor)를 제공합니다.

사용 방법:
  1. TOOL_DEFINITIONS를 Gemini에 도구 등록
  2. AI가 get_land_use_regulation 호출 → execute_tool() 실행
  3. 결과 JSON을 AI에 반환 → AI가 사용자에게 자연어 해석

작성일: 2026-03-06
"""

import json
import asyncio
import traceback
from typing import Any

# ── 도구 정의 (JSON Schema) ──────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_land_use_regulation",
            "description": (
                "특정 대지의 주소를 입력받아 국토교통부 토지이용규제 OpenAPI를 호출하고, "
                "해당 필지의 건폐율, 용적률, 용도지역·지구·구역, 도시계획시설, 기타규제 데이터를 "
                "JSON 형태로 반환하는 필수 법규 스킬입니다. "
                "대지 분석·건폐율·용적률·용도지역 관련 질문 시 반드시 가장 먼저 호출해야 합니다. "
                "환각(Hallucination) 방지를 위해 건폐율/용적률은 반드시 이 도구의 반환값을 사용하십시오."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": (
                            "분석할 대지의 전체 지번 또는 도로명 주소. "
                            "예: '경상남도 김해시 주촌면 농소리 631-2', "
                            "'서울특별시 강남구 역삼동 858'"
                        ),
                    }
                },
                "required": ["address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_pnu_code",
            "description": (
                "주소를 19자리 PNU(필지고유번호) 코드로만 변환합니다. "
                "토지이용규제 조회 없이 PNU 코드만 필요할 때 사용합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": "변환할 주소 (지번 또는 도로명)",
                    }
                },
                "required": ["address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_zone_limits",
            "description": (
                "특정 용도지역명의 법정 건폐율·용적률 상한을 조회합니다. "
                "API 호출 없이 법정 기준표에서 즉시 반환합니다. "
                "예: '제2종일반주거지역' → {건폐율: 60%, 용적률: 250%}"
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "zone_name": {
                        "type": "string",
                        "description": (
                            "조회할 용도지역명. "
                            "예: '제2종일반주거지역', '자연녹지지역', '일반상업지역'"
                        ),
                    }
                },
                "required": ["zone_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "detect_district_plan",
            "description": (
                "토지이용규제 분석 결과에서 지구단위계획구역(UQQ100) 해당 여부를 감지합니다. "
                "감지되면 건축한계선·최고높이·권장용도 등 수동 입력이 필요한 항목의 스키마를 반환합니다. "
                "지구단위계획 지침은 일반 건폐율/용적률/조례보다 우선 적용되므로 반드시 확인해야 합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "address": {
                        "type": "string",
                        "description": "분석할 대지 주소 (get_land_use_regulation과 동일 주소)",
                    }
                },
                "required": ["address"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "analyze_road_adjacency",
            "description": (
                "대지 폴리곤과 도로 데이터를 분석하여 접도 방위, 도로 폭원, 접도 길이, "
                "건축선 후퇴거리를 계산합니다. 3D 건축가능영역(Buildable Area)을 그리려면 "
                "도로가 대지의 어느 면에 접해 있는지 알아야 합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "site_polygon": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "number"}},
                        "description": "대지 경계 좌표 [[x,y], ...] (미터 단위)",
                    },
                    "road_edges": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "edge_index": {"type": "integer", "description": "대지 경계선 인덱스 (0부터)"},
                                "road_name": {"type": "string", "description": "도로명 또는 등급"},
                                "road_width": {"type": "number", "description": "도로 폭원 (m)"},
                            },
                        },
                        "description": "도로 접도 정보 (어느 변에 어떤 도로가 접하는지)",
                    },
                },
                "required": ["site_polygon", "road_edges"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_sunlight_setback",
            "description": (
                "정북방향 일조권 사선제한을 계산합니다 (건축법 시행령 제86조). "
                "주거지역에서 건축물 높이별 정북방향 이격거리를 산출하여 "
                "3D 매스의 사선 절단(Boolean Cut) 데이터를 제공합니다. "
                "높이 9m 이하 → 1.5m 이격, 9m 초과 → 높이의 1/2 이격."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "site_polygon": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "number"}},
                        "description": "대지 경계 좌표 [[x,y], ...] (미터 단위)",
                    },
                    "zone_types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "용도지역 목록 (예: ['제2종일반주거지역'])",
                    },
                    "true_north_offset": {
                        "type": "number",
                        "description": "진북 보정값 (도). 기본 0. 양수 = 진북이 자북보다 동쪽",
                    },
                },
                "required": ["site_polygon", "zone_types"],
            },
        },
    },
    # ── Skill 7: 형태별 매스 뼈대 생성 ──
    {
        "type": "function",
        "function": {
            "name": "generate_typology_massing",
            "description": (
                "SiteParameters와 대지 폴리곤을 입력받아, 지정된 건물 형태(Typology)의 "
                "3D 매스 블록 배열을 생성합니다. 7종 지원: SINGLE_BLOCK, TOWER_PODIUM, L_SHAPE, "
                "U_SHAPE, PARALLEL, COURTYARD, STAGGERED. "
                "결과는 Three.js가 즉시 렌더링할 수 있는 Wing[] 배열입니다. "
                "건폐율/용적률 한도를 고려하여 자동으로 크기를 조정합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "site_polygon": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "number"}},
                        "description": "대지 경계 좌표 [[x,y], ...] (미터 단위)",
                    },
                    "typology_type": {
                        "type": "string",
                        "enum": ["SINGLE_BLOCK", "TOWER_PODIUM", "L_SHAPE", "U_SHAPE", "PARALLEL", "COURTYARD", "STAGGERED", "ALL"],
                        "description": "건물 형태. 'ALL'이면 7종 전부 생성하여 비교",
                    },
                    "max_coverage_pct": {
                        "type": "number",
                        "description": "건폐율 한도 (%). 예: 60",
                    },
                    "max_far_pct": {
                        "type": "number",
                        "description": "용적률 한도 (%). 예: 250",
                    },
                    "max_height_m": {
                        "type": "number",
                        "description": "최대 건축 높이 (m)",
                    },
                    "max_floors": {
                        "type": "integer",
                        "description": "최대 층수",
                    },
                    "floor_height_m": {
                        "type": "number",
                        "description": "기본 층고 (m). 기본값 3.3",
                    },
                    "setback_m": {
                        "type": "number",
                        "description": "건축선 후퇴거리 (m). 기본값 1.5",
                    },
                },
                "required": ["site_polygon", "typology_type", "max_coverage_pct", "max_far_pct", "max_height_m", "max_floors"],
            },
        },
    },
    # ── Skill 8: 법규 정합성 검증 ──
    {
        "type": "function",
        "function": {
            "name": "validate_mass_compliance",
            "description": (
                "generate_typology_massing으로 생성된 3D 블록들의 건폐율/용적률/높이/후퇴거리/일조사선을 "
                "수학적으로 역산하여 법규 위반 여부를 검증합니다. "
                "Shapely 기반의 정밀한 폴리곤 면적 계산 및 포함 관계 검사를 수행합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "mass_blocks": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "width": {"type": "number"},
                                "depth": {"type": "number"},
                                "height": {"type": "number"},
                                "x": {"type": "number"},
                                "z": {"type": "number"},
                                "y": {"type": "number"},
                                "rotation": {"type": "number"},
                                "floors": {"type": "integer"},
                                "floor_area_sqm": {"type": "number"},
                            },
                        },
                        "description": "검증할 매스 블록 배열",
                    },
                    "site_area_sqm": {"type": "number", "description": "대지 면적 (㎡)"},
                    "max_coverage_pct": {"type": "number", "description": "건폐율 한도 (%)"},
                    "max_far_pct": {"type": "number", "description": "용적률 한도 (%)"},
                    "max_height_m": {"type": "number", "description": "최대 높이 (m)"},
                    "max_floors": {"type": "integer", "description": "최대 층수"},
                    "buildable_polygon": {
                        "type": "array",
                        "items": {"type": "array", "items": {"type": "number"}},
                        "description": "건축가능영역 좌표 [[x,y], ...] (선택)",
                    },
                },
                "required": ["mass_blocks", "site_area_sqm", "max_coverage_pct", "max_far_pct", "max_height_m", "max_floors"],
            },
        },
    },
    # ── Skill 9: 태양 궤적 및 그림자 연산 ──
    {
        "type": "function",
        "function": {
            "name": "calculate_solar_sun_path",
            "description": (
                "위도/경도와 날짜/시간을 입력받아 태양의 방위각(Azimuth), 고도각(Altitude), "
                "Three.js DirectionalLight 벡터, 그림자 방향 및 길이 비율을 계산합니다. "
                "NOAA Solar Calculator 알고리즘 기반. 하루 전체 태양 경로와 동지일 일조시간도 분석합니다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "latitude": {"type": "number", "description": "위도 (도). 북위 양수"},
                    "longitude": {"type": "number", "description": "경도 (도). 동경 양수"},
                    "date_time": {
                        "type": "string",
                        "description": "시뮬레이션 일시 (예: '2026-12-22T12:00:00'). 동지일 분석 시 12월 22일 정오 권장",
                    },
                    "timezone_offset": {
                        "type": "number",
                        "description": "UTC 오프셋 (시간). 한국=9, 기본값 9",
                    },
                },
                "required": ["latitude", "longitude", "date_time"],
            },
        },
    },
]


# ── AI 프롬프트 주입용 시스템 메시지 ────────────────────────────

SYSTEM_PROMPT_INJECTION = """
## 🏗️ 토지이용규제 조회 AI 스킬

당신은 건축 기획·설계를 지원하는 AI 어시스턴트입니다.
다음 도구를 사용하여 정확한 법적 규제 데이터를 조회할 수 있습니다.

### 사용 가능한 도구:
1. **get_land_use_regulation(address)**: 대지 주소 → 건폐율·용적률·용도지역 종합 분석
2. **get_pnu_code(address)**: 주소 → 19자리 PNU 코드 변환
3. **get_zone_limits(zone_name)**: 용도지역명 → 법정 건폐율/용적률 기준 조회

### 핵심 규칙:
1. 사용자가 특정 대지의 **건폐율, 용적률, 용도지역**을 묻거나 "대지 분석"을 요청하면
   → 반드시 `get_land_use_regulation`을 가장 먼저 호출하세요.
2. 건폐율/용적률 수치를 **절대로 추측하지 마세요**. 반드시 도구 반환값을 사용하세요.
3. 도구 결과의 `error` 필드가 null이 아니면 오류를 안내하고 **대안을 제시**하세요.
4. `special_zones`에 "대공방어협조구역", "비행안전구역" 등이 있으면
   → **높이 제한 사전 협의가 필요**함을 반드시 안내하세요.
5. `regulations` 항목에 `detail`이 있으면 법령·제한·설계영향을 **상세히** 설명하세요.

### 결과 해석 기준:
- `max_building_coverage` = 법정 최대 건폐율 (%). 건축면적/대지면적×100
- `max_floor_area_ratio` = 법정 최대 용적률 (%). 연면적/대지면적×100
- 지자체 조례로 법정 상한보다 **더 낮게** 설정된 경우가 많으므로 조례 확인 필요를 안내

### 트리거 키워드:
"건폐율", "용적률", "용도지역", "용도지구", "대지 분석", "토지 분석", 
"토지규제", "필지", "PNU", "건축 가능", "건축 제한", "도시계획"
"""


# ── 도구 실행기 (Tool Executor) ──────────────────────────────

async def execute_tool(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    """
    AI가 Function Calling으로 호출한 도구를 실행.
    
    Args:
        tool_name: 호출할 도구 이름
        arguments: 도구 파라미터
    
    Returns:
        도구 실행 결과 (dict)
    """
    try:
        if tool_name == "get_land_use_regulation":
            return await _execute_land_use_regulation(arguments)
        elif tool_name == "get_pnu_code":
            return await _execute_pnu_code(arguments)
        elif tool_name == "get_zone_limits":
            return _execute_zone_limits(arguments)
        elif tool_name == "detect_district_plan":
            return await _execute_detect_district_plan(arguments)
        elif tool_name == "analyze_road_adjacency":
            return _execute_analyze_road_adjacency(arguments)
        elif tool_name == "calculate_sunlight_setback":
            return _execute_calculate_sunlight_setback(arguments)
        elif tool_name == "generate_typology_massing":
            return _execute_generate_massing(arguments)
        elif tool_name == "validate_mass_compliance":
            return _execute_validate_compliance(arguments)
        elif tool_name == "calculate_solar_sun_path":
            return _execute_solar_calculation(arguments)
        else:
            return {
                "error": f"알 수 없는 도구: {tool_name}",
                "available_tools": [
                    "get_land_use_regulation", "get_pnu_code", "get_zone_limits",
                    "detect_district_plan", "analyze_road_adjacency", "calculate_sunlight_setback",
                    "generate_typology_massing", "validate_mass_compliance", "calculate_solar_sun_path",
                ],
            }
    except Exception as e:
        return {
            "error": f"도구 실행 오류: {str(e)}",
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc(),
        }


async def _execute_land_use_regulation(args: dict) -> dict:
    """get_land_use_regulation 도구 실행"""
    from land_use_service import analyze_land_use
    
    address = args.get("address", "").strip()
    if not address:
        return {"error": "주소가 입력되지 않았습니다. 분석할 대지의 주소를 입력해주세요."}
    
    result = await analyze_land_use(address)
    
    # Pydantic 모델 → dict 변환
    result_dict = result.model_dump()
    
    # AI가 이해하기 쉽도록 요약 메시지 추가
    if result.error:
        result_dict["_ai_summary"] = f"⚠️ 오류: {result.error}"
    else:
        zones = ", ".join(result.zone_types) if result.zone_types else "확인 안됨"
        cov = f"{result.max_building_coverage}%" if result.max_building_coverage else "확인 안됨"
        far = f"{result.max_floor_area_ratio}%" if result.max_floor_area_ratio else "확인 안됨"
        specials = ", ".join(result.special_zones) if result.special_zones else "없음"
        
        result_dict["_ai_summary"] = (
            f"✅ 분석 완료: {result.pnu_info.address_full}\n"
            f"   용도지역: {zones}\n"
            f"   건폐율: {cov} / 용적률: {far}\n"
            f"   규제항목: {result.total_count}건\n"
            f"   특수구역: {specials}"
        )
    
    return result_dict


async def _execute_pnu_code(args: dict) -> dict:
    """get_pnu_code 도구 실행"""
    from land_use_service import get_pnu_code
    
    address = args.get("address", "").strip()
    if not address:
        return {"error": "주소가 입력되지 않았습니다."}
    
    try:
        pnu_info = await get_pnu_code(address)
        return pnu_info.model_dump()
    except ValueError as e:
        return {"error": str(e)}


def _execute_zone_limits(args: dict) -> dict:
    """get_zone_limits 도구 실행 (법정 기준표 조회, API 호출 불필요)"""
    from land_use_service import ZONE_LIMITS
    
    zone_name = args.get("zone_name", "").strip()
    if not zone_name:
        return {"error": "용도지역명이 입력되지 않았습니다."}
    
    # 정확히 매칭
    if zone_name in ZONE_LIMITS:
        cov, far = ZONE_LIMITS[zone_name]
        return {
            "zone_name": zone_name,
            "max_building_coverage": cov,
            "max_floor_area_ratio": far,
            "source": "국토계획법 법정 상한",
            "note": "지자체 조례에 의해 실제 적용값은 이보다 낮을 수 있습니다.",
        }
    
    # 부분 매칭 (키워드 포함)
    matches = []
    for key, (cov, far) in ZONE_LIMITS.items():
        if zone_name in key or key in zone_name:
            matches.append({
                "zone_name": key,
                "max_building_coverage": cov,
                "max_floor_area_ratio": far,
            })
    
    if matches:
        return {
            "matches": matches,
            "source": "국토계획법 법정 상한",
            "note": "정확한 용도지역명과 유사한 항목을 반환합니다.",
        }
    
    # 전체 목록 반환
    return {
        "error": f"'{zone_name}'에 해당하는 용도지역을 찾을 수 없습니다.",
        "available_zones": list(ZONE_LIMITS.keys()),
        "hint": "위 목록에서 정확한 용도지역명을 선택하세요.",
    }


# ── Skill 4: 지구단위계획 감지 ──────────────────────────────

async def _execute_detect_district_plan(args: dict) -> dict:
    """detect_district_plan 도구 실행"""
    from land_use_service import analyze_land_use
    from site_analysis import detect_district_plan
    
    address = args.get("address", "").strip()
    if not address:
        return {"error": "주소가 입력되지 않았습니다."}
    
    # 먼저 토지이용규제 분석 실행
    result = await analyze_land_use(address)
    if result.error:
        return {"error": f"토지이용규제 분석 실패: {result.error}"}
    
    # 규제 결과에서 지구단위계획 감지
    detection = detect_district_plan(
        regulations=[r.model_dump() for r in result.regulations],
        special_zones=result.special_zones,
    )
    
    return detection.model_dump()


# ── Skill 5: 도로 접도 분석 ─────────────────────────────────

def _execute_analyze_road_adjacency(args: dict) -> dict:
    """analyze_road_adjacency 도구 실행"""
    from site_analysis import analyze_road_adjacency
    
    site_polygon = args.get("site_polygon", [])
    road_edges = args.get("road_edges", [])
    
    if not site_polygon:
        return {"error": "대지 폴리곤(site_polygon)이 입력되지 않았습니다."}
    if not road_edges:
        return {"error": "도로 접도 정보(road_edges)가 입력되지 않았습니다."}
    
    # 좌표를 튜플로 변환
    polygon_tuples = [(p[0], p[1]) for p in site_polygon]
    
    result = analyze_road_adjacency(polygon_tuples, road_edges)
    return result.model_dump()


# ── Skill 6: 일조권 사선제한 계산 ─────────────────────────────

def _execute_calculate_sunlight_setback(args: dict) -> dict:
    """calculate_sunlight_setback 도구 실행"""
    from site_analysis import calculate_sunlight_setback
    
    site_polygon = args.get("site_polygon", [])
    zone_types = args.get("zone_types", [])
    true_north_offset = args.get("true_north_offset", 0.0)
    
    if not site_polygon:
        return {"error": "대지 폴리곤(site_polygon)이 입력되지 않았습니다."}
    if not zone_types:
        return {"error": "용도지역(zone_types)이 입력되지 않았습니다."}
    
    # 좌표를 튜플로 변환
    polygon_tuples = [(p[0], p[1]) for p in site_polygon]
    
    result = calculate_sunlight_setback(polygon_tuples, zone_types, true_north_offset)
    return result.model_dump()


# ── Skill 7: 형태별 매스 생성 ─────────────────────────────────

def _execute_generate_massing(args: dict) -> dict:
    """generate_typology_massing 도구 실행"""
    from massing_engine import MassingInput, generate_massing, generate_all_typologies
    
    typology = args.get("typology_type", "SINGLE_BLOCK").upper()
    
    inp = MassingInput(
        site_polygon=args.get("site_polygon", []),
        typology_type=typology,
        max_coverage_pct=args.get("max_coverage_pct", 60),
        max_far_pct=args.get("max_far_pct", 250),
        max_height_m=args.get("max_height_m", 50),
        max_floors=args.get("max_floors", 15),
        floor_height_m=args.get("floor_height_m", 3.3),
        setback_m=args.get("setback_m", 1.5),
    )
    
    if typology == "ALL":
        results = generate_all_typologies(inp)
        return {"typologies": [r.model_dump() for r in results]}
    else:
        result = generate_massing(inp)
        return result.model_dump()


# ── Skill 8: 법규 정합성 검증 ─────────────────────────────────

def _execute_validate_compliance(args: dict) -> dict:
    """validate_mass_compliance 도구 실행"""
    from massing_validator import ComplianceInput, MassBlock, validate_compliance
    
    blocks = [MassBlock(**b) for b in args.get("mass_blocks", [])]
    
    inp = ComplianceInput(
        mass_blocks=blocks,
        site_area_sqm=args.get("site_area_sqm", 0),
        max_coverage_pct=args.get("max_coverage_pct", 60),
        max_far_pct=args.get("max_far_pct", 250),
        max_height_m=args.get("max_height_m", 50),
        max_floors=args.get("max_floors", 15),
        buildable_polygon=args.get("buildable_polygon", []),
    )
    
    result = validate_compliance(inp)
    return result.model_dump()


# ── Skill 9: 태양 궤적 계산 ──────────────────────────────────

def _execute_solar_calculation(args: dict) -> dict:
    """calculate_solar_sun_path 도구 실행"""
    from solar_calculator import SolarInput, calculate_solar
    
    inp = SolarInput(
        latitude=args.get("latitude", 37.5665),
        longitude=args.get("longitude", 126.978),
        date_time=args.get("date_time", "2026-12-22T12:00:00"),
        timezone_offset=args.get("timezone_offset", 9.0),
    )
    
    result = calculate_solar(inp)
    return result.model_dump()

# ── Gemini API 통합 헬퍼 ─────────────────────────────────────

def build_gemini_tool_config() -> dict:
    """
    Gemini API에 전달할 tools 설정 생성.
    
    사용 예시:
        import google.generativeai as genai
        
        model = genai.GenerativeModel(
            'gemini-2.5-flash-lite',
            tools=build_gemini_tool_config()["tools"],
        )
    """
    return {
        "tools": [
            {
                "function_declarations": [
                    td["function"] for td in TOOL_DEFINITIONS
                ]
            }
        ],
        "tool_config": {
            "function_calling_config": {
                "mode": "AUTO",  # AI가 자율적으로 판단하여 호출
            }
        },
    }


async def process_function_call(function_call: dict) -> dict:
    """
    Gemini 응답에서 function_call을 받아 실행하고 결과 반환.
    
    사용 예시:
        response = model.generate_content(user_message)
        
        for part in response.parts:
            if part.function_call:
                result = await process_function_call({
                    "name": part.function_call.name,
                    "args": dict(part.function_call.args),
                })
                # result를 다시 model에 전달
    """
    name = function_call.get("name", "")
    args = function_call.get("args", {})
    
    print(f"[FC Executor] 도구 호출: {name}({json.dumps(args, ensure_ascii=False)})")
    
    result = await execute_tool(name, args)
    
    # 결과 크기 로깅
    result_json = json.dumps(result, ensure_ascii=False, default=str)
    print(f"[FC Executor] 결과 크기: {len(result_json)} bytes")
    
    return result


# ── CLI 테스트 ────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    
    # 직접 실행 시 테스트
    test_address = sys.argv[1] if len(sys.argv) > 1 else "경상남도 김해시 주촌면 농소리 631-2"
    
    print(f"\n{'='*60}")
    print(f"[TEST] Function Calling Executor")
    print(f"{'='*60}")
    print(f"\n1. 도구 정의 ({len(TOOL_DEFINITIONS)}개):")
    for td in TOOL_DEFINITIONS:
        print(f"   - {td['function']['name']}: {td['function']['description'][:60]}...")
    
    print(f"\n2. get_land_use_regulation 실행:")
    print(f"   주소: {test_address}")
    
    result = asyncio.run(execute_tool("get_land_use_regulation", {"address": test_address}))
    
    print(f"\n3. 결과:")
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    
    if "_ai_summary" in result:
        print(f"\n4. AI 요약:\n{result['_ai_summary']}")
