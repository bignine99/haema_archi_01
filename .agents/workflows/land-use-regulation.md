---
description: 토지이용규제 AI 스킬 (Land Use Regulation Tool) — Function Calling 기반 자율 API 호출·분석 가이드
---

# 🏗️ 토지이용규제 AI 스킬 (get_land_use_regulation)

> **목적**: LLM(Gemini)이 국토교통부 토지이용규제 OpenAPI를 **자율적으로 호출**하여 건폐율, 용적률, 용도지역 데이터를 환각(Hallucination) 없이 정확하게 획득하는 AI Function Calling 도구.

---

## 1. 스킬 개요

### 1-1. 핵심 정보

| 항목 | 내용 |
|------|------|
| **스킬명** | `get_land_use_regulation` |
| **트리거 조건** | 사용자 발화에 "대지 분석", "건폐율", "용적률", "용도지역", "토지규제", "주소 분석" 등 토지 관련 키워드 감지 시 |
| **백엔드 서비스** | `services/land_use_regulation/land_use_service.py` (FastAPI, 포트 8010) |
| **데이터 출처** | VWorld 토지이용계획 속성조회 API (`getLandUseAttr`) |
| **PNU 변환** | 카카오 로컬 주소 검색 API |
| **상세 규제 DB** | `services/land_use_regulation/regulation_details.py` (40+ 코드 매핑) |

### 1-2. 해결하는 문제

```
❌ 문제: "김해시 주촌면 대지의 건폐율은?" → AI가 추측(60%? 40%?)하여 환각 발생
✅ 해결: AI가 OpenAPI를 직접 호출 → 법적 근거 있는 정확한 수치 반환
```

### 1-3. 데이터 파이프라인

```
[사용자 발화]  "김해시 주촌면 농소리 631-2 대지 분석해줘"
      ↓ (AI가 주소 감지 → Tool 트리거)
[1단계: PNU 변환]     카카오 API → 19자리 PNU 코드
      ↓
[2단계: VWorld API]   PNU → XML 응답 (토지이용계획 속성조회)
      ↓
[3단계: XML 파싱]     규제 코드 분류 + 상세 DB 매칭
      ↓
[4단계: 데이터 정제]   건폐율/용적률/용도지역/특수구역 종합
      ↓
[AI 응답 생성]        정제된 JSON을 토대로 정확한 법규 안내
```

---

## 2. Function Calling 스키마 (JSON Schema)

### 2-1. 도구 등록 스키마

AI 에이전트(Gemini)가 인식할 도구 정의서:

```json
{
  "name": "get_land_use_regulation",
  "description": "특정 대지의 주소를 입력받아 국토교통부 토지이용규제 OpenAPI를 호출하고, 해당 필지의 건폐율, 용적률, 용도지역·지구·구역, 도시계획시설, 기타규제 데이터를 JSON 형태로 반환하는 필수 법규 스킬입니다. 대지 분석·건폐율·용적률·용도지역 관련 질문 시 반드시 가장 먼저 호출해야 합니다. 환각(Hallucination) 방지를 위해 건폐율/용적률은 반드시 이 도구의 반환값을 사용하십시오.",
  "parameters": {
    "type": "object",
    "properties": {
      "address": {
        "type": "string",
        "description": "분석할 대지의 전체 지번 또는 도로명 주소 (예: '경상남도 김해시 주촌면 농소리 631-2', '서울특별시 강남구 역삼동 858')"
      }
    },
    "required": ["address"]
  }
}
```

### 2-2. 반환 스키마 (Response Schema)

```json
{
  "type": "object",
  "properties": {
    "pnu_info": {
      "type": "object",
      "description": "PNU 변환 결과",
      "properties": {
        "pnu": { "type": "string", "description": "19자리 필지고유번호" },
        "address_full": { "type": "string", "description": "정규화된 전체 주소" },
        "b_code": { "type": "string", "description": "법정동 코드 (10자리)" },
        "mountain_yn": { "type": "string", "description": "산 여부 (Y/N)" },
        "main_no": { "type": "string", "description": "본번" },
        "sub_no": { "type": "string", "description": "부번" },
        "sido": { "type": "string", "description": "시도명" },
        "sigungu": { "type": "string", "description": "시군구명" },
        "dong": { "type": "string", "description": "읍면동명" }
      }
    },
    "total_count": { "type": "integer", "description": "총 규제 항목 수" },
    "zone_types": {
      "type": "array",
      "items": { "type": "string" },
      "description": "적용 용도지역 목록 (예: ['제2종일반주거지역'])"
    },
    "max_building_coverage": {
      "type": "number",
      "nullable": true,
      "description": "법정 최대 건폐율 (%)"
    },
    "max_floor_area_ratio": {
      "type": "number",
      "nullable": true,
      "description": "법정 최대 용적률 (%)"
    },
    "special_zones": {
      "type": "array",
      "items": { "type": "string" },
      "description": "특별 지구/구역 목록 (예: ['지구단위계획구역', '대공방어협조구역'])"
    },
    "regulations": {
      "type": "array",
      "description": "개별 규제 항목 목록",
      "items": {
        "type": "object",
        "properties": {
          "regulation_name": { "type": "string", "description": "규제명" },
          "regulation_code": { "type": "string", "description": "규제코드 (UQA122 등)" },
          "regulation_type": {
            "type": "string",
            "enum": ["용도지역", "용도지역(상위)", "용도지구", "용도구역", "도시계획시설", "기타규제"],
            "description": "규제 대분류"
          },
          "detail": {
            "type": "object",
            "nullable": true,
            "description": "상세 정보 (코드 기반 조회)",
            "properties": {
              "related_law": { "type": "string", "description": "관련 법령" },
              "restriction_summary": { "type": "string", "description": "행위제한 요약" },
              "design_impact": { "type": "string", "description": "건축 설계 영향" },
              "management_agency": { "type": "string", "description": "관리기관" }
            }
          }
        }
      }
    },
    "error": {
      "type": "string",
      "nullable": true,
      "description": "오류 발생 시 메시지"
    }
  }
}
```

---

## 3. 내부 실행 로직 (Python)

### 3-1. 핵심 실행 함수

스킬이 호출되었을 때 백엔드에서 실제로 실행되는 함수:

```python
# services/land_use_regulation/land_use_service.py

async def analyze_land_use(address: str) -> LandUseRegulationResult:
    """
    [AI 스킬 핵심 함수]
    주소를 입력받아 토지이용규제 종합 분석 결과를 반환.
    
    전체 파이프라인:
      주소 → PNU 변환 → VWorld API 호출 → XML 파싱 → 데이터 정제 → JSON 반환
    """
    try:
        # 0. 주소 전처리
        clean_address = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', address).strip()
        if not clean_address:
            raise ValueError("유효한 주소가 아닙니다.")

        # 1. 주소 → PNU 변환 (카카오 API)
        pnu_info = await get_pnu_code(clean_address)

        # 2. PNU → 토지이용계획 조회 (VWorld getLandUseAttr)
        regulations = await fetch_land_use_regulation(pnu_info.pnu)

        # 3. 종합 요약 생성
        result = build_summary(pnu_info, regulations)
        return result

    except Exception as e:
        return LandUseRegulationResult(
            pnu_info=PnuInfo(pnu="0" * 19, address_full=address),
            error=str(e),
        )
```

### 3-2. PNU 변환 함수

```python
async def get_pnu_code(address: str) -> PnuInfo:
    """
    19자리 PNU 코드 생성
    PNU = 법정동코드(10) + 대지구분(1) + 본번(4) + 부번(4)
    
    예시: 경상남도 김해시 주촌면 농소리 631-2
      → 법정동코드: 4821025030
      → 대지구분: 1 (대지)
      → 본번: 0631
      → 부번: 0002
      → PNU: 4821025030106310002
    """
    # 카카오 로컬 주소검색 API 호출
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_KEY}"}
    params = {"query": address, "analyze_type": "similar"}
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
    
    # 결과에서 법정동 코드, 산 여부, 본번/부번 추출
    doc = data["documents"][0]
    addr = doc.get("address") or {}
    b_code = addr.get("b_code", "")          # 법정동 코드 10자리
    land_type = "2" if addr.get("mountain_yn") == "Y" else "1"
    main_no = str(int(addr.get("main_address_no", "0") or "0")).zfill(4)
    sub_no = str(int(addr.get("sub_address_no", "0") or "0")).zfill(4)
    
    pnu = f"{b_code}{land_type}{main_no}{sub_no}"  # 19자리
    return PnuInfo(pnu=pnu, address_full=doc.get("address_name", address), ...)
```

### 3-3. VWorld API 호출 함수

```python
async def fetch_land_use_regulation(pnu_code: str) -> list[LandUseRegulationItem]:
    """
    VWorld 토지이용계획 속성조회 API 호출
    
    API: https://api.vworld.kr/ned/data/getLandUseAttr
    필수: key, pnu, domain
    응답: XML → LandUseRegulationItem 리스트
    """
    full_url = (
        f"https://api.vworld.kr/ned/data/getLandUseAttr"
        f"?key={VWORLD_API_KEY}"
        f"&domain=localhost"
        f"&pnu={pnu_code}"
        f"&numOfRows=1000"
        f"&format=xml"
    )
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(full_url)
    
    regulations = _parse_vworld_xml(resp.text, pnu_code)
    return regulations
```

### 3-4. XML 파싱 함수

```python
def _parse_vworld_xml(xml_text: str, pnu_code: str) -> list[LandUseRegulationItem]:
    """
    VWorld XML 응답 구조:
    <response>
      <totalCount>N</totalCount>
      <fields>
        <field>
          <pnu>4821025030106310002</pnu>
          <prposAreaDstrcCodeNm>자연녹지지역</prposAreaDstrcCodeNm>
          <prposAreaDstrcCode>UQA430</prposAreaDstrcCode>
          <cnflcAt>1</cnflcAt>           <!-- 1=포함, 2=저촉 -->
          <lastUpdtDt>2024-01-15</lastUpdtDt>
        </field>
        ...
      </fields>
    </response>
    """
    root = ET.fromstring(xml_text)
    items = []
    
    for field_el in root.findall(".//fields/field"):
        code = field_el.find("prposAreaDstrcCode").text
        reg_type = _classify_by_code(code)  # UQA→용도지역, UQF~UQP→용도지구 등
        
        items.append(LandUseRegulationItem(
            regulation_name=field_el.find("prposAreaDstrcCodeNm").text,
            regulation_code=code,
            regulation_type=reg_type,
            detail=get_regulation_detail(code, ...),  # 상세 DB 매칭
        ))
    
    return items
```

### 3-5. 코드 분류 체계

```python
def _classify_by_code(code: str) -> str:
    """
    국토계획법 규제 코드 분류 체계:
    
    UQA1xx = 주거지역 (111=제1종전용, 122=제2종일반, 130=준주거 등)
    UQA2xx = 상업지역 (210=중심, 220=일반, 230=근린, 240=유통)
    UQA3xx = 공업지역 (310=전용, 320=일반, 330=준공업)
    UQA4xx = 녹지지역 (410=보전, 420=생산, 430=자연)
    UQB    = 관리지역 (100=보전, 200=생산, 300=계획)
    UQC    = 농림지역
    UQD    = 자연환경보전지역
    UQF~P  = 용도지구 (경관/고도/방화/방재/보존/취락/개발진흥 등)  
    UQQ    = 용도구역 (100=지구단위, 200=개발제한 등)
    UQR~Y  = 도시계획시설 (도로/공원/학교 등)
    U**    = 기타규제 (군사/문화재/환경/산림 등)
    """
```

---

## 4. FastAPI 라우터 (API Gateway)

### 4-1. 엔드포인트 목록

| Method | Path | 설명 | 파라미터 |
|--------|------|------|----------|
| `GET` | `/api/land-use` | **메인**: 주소 → 종합 분석 | `address` (query) |
| `GET` | `/api/pnu` | PNU 변환만 | `address` (query) |
| `GET` | `/api/land-use-by-pnu` | PNU 직접 입력 | `pnu` (query, 19자리) |
| `GET` | `/health` | 서비스 상태 확인 | - |

### 4-2. 호출 예시

```bash
# 주소로 종합 분석
curl "http://localhost:8010/api/land-use?address=경상남도+김해시+주촌면+농소리+631-2"

# PNU로 직접 조회
curl "http://localhost:8010/api/land-use-by-pnu?pnu=4821025030106310002"

# 서비스 상태 확인
curl "http://localhost:8010/health"
```

### 4-3. 응답 예시 (성공)

```json
{
  "pnu_info": {
    "pnu": "4821025030106310002",
    "address_full": "경상남도 김해시 주촌면 농소리 631-2",
    "b_code": "4821025030",
    "mountain_yn": "N",
    "main_no": "631",
    "sub_no": "2",
    "sido": "경상남도",
    "sigungu": "김해시",
    "dong": "주촌면"
  },
  "total_count": 11,
  "zone_types": ["자연녹지지역"],
  "max_building_coverage": 20,
  "max_floor_area_ratio": 100,
  "special_zones": ["지구단위계획구역", "대공방어협조구역"],
  "regulations": [
    {
      "regulation_name": "자연녹지지역",
      "regulation_code": "UQA430",
      "regulation_type": "용도지역",
      "detail": {
        "related_law": "국토계획법 제36조",
        "restriction_summary": "자연녹지: 도시 녹지공간 확보, 보전 필요성 낮은 지역",
        "design_impact": "건폐율 20%, 용적률 50~100%. 4층 이하 제한. 불가피한 경우만 개발 허용",
        "management_agency": "시·군·구청 도시과"
      }
    },
    {
      "regulation_name": "어린이공원",
      "regulation_code": "UQT210",
      "regulation_type": "도시계획시설",
      "detail": {
        "related_law": "도시공원 및 녹지 등에 관한 법률 제15조",
        "restriction_summary": "어린이공원: 어린이 놀이·휴식 공간. 최소면적 1,500㎡ 이상",
        "design_impact": "공원 부지 내 건축 제한. 인접 대지는 이격거리·일조 확보·소음 저감 검토 필요",
        "management_agency": "시·군·구청 공원녹지과"
      }
    }
  ],
  "error": null
}
```

### 4-4. 응답 예시 (오류)

```json
{
  "pnu_info": {
    "pnu": "0000000000000000000",
    "address_full": "서울시 아무동 999-999"
  },
  "total_count": 0,
  "zone_types": [],
  "max_building_coverage": null,
  "max_floor_area_ratio": null,
  "special_zones": [],
  "regulations": [],
  "error": "주소를 찾을 수 없습니다: 서울시 아무동 999-999"
}
```

---

## 5. 에러 코드 및 예외 처리

### 5-1. 에러 유형별 처리 전략

| 에러 유형 | 원인 | HTTP 코드 | 에러 메시지 | AI 안내 전략 |
|-----------|------|-----------|-------------|-------------|
| `ADDRESS_NOT_FOUND` | 카카오 API에서 주소 미발견 | 200 (body 에러) | "주소를 찾을 수 없습니다: {address}" | "입력하신 주소를 찾을 수 없습니다. 정확한 지번주소(예: 경남 김해시 …)로 다시 시도해주세요." |
| `INVALID_PNU` | PNU 19자리 생성 실패 | 200 (body 에러) | "법정동 코드가 올바르지 않습니다" | "주소의 법정동 코드 변환에 실패했습니다. 시·군·구까지 포함한 정식 주소로 입력해주세요." |
| `VWORLD_API_ERROR` | VWorld API 인증/호출 실패 | 200 (body 에러) | "VWorld API 오류: {message}" | "토지이용규제 API 서버에 일시적 오류가 발생했습니다. 잠시 후 다시 시도해주세요." |
| `VWORLD_NO_DATA` | PNU에 대한 규제 데이터 없음 | 200 (정상) | total_count=0 | "해당 필지에 대한 토지이용규제 데이터가 아직 등록되지 않았습니다." |
| `KAKAO_KEY_MISSING` | 카카오 REST Key 미설정 | 500 | "KAKAO_REST_KEY 미설정" | "서비스 인증 키가 설정되지 않았습니다. 관리자에게 문의해주세요." |
| `VWORLD_KEY_MISSING` | VWorld API Key 미설정 | 500 | "VWORLD_API_KEY 미설정" | "서비스 인증 키가 설정되지 않았습니다. 관리자에게 문의해주세요." |
| `TIMEOUT` | API 응답 타임아웃 (15초) | 504 | "요청 시간 초과" | "서버 응답이 지연되고 있습니다. 네트워크 상태를 확인하고 다시 시도해주세요." |
| `SERVICE_DOWN` | 백엔드 서비스(8010) 미기동 | 504 | "ECONNREFUSED" | "토지이용규제 서비스가 실행 중이지 않습니다. npm run dev:all로 서비스를 시작해주세요." |

### 5-2. AI 에러 응답 생성 지침

```
[AI 에러 응답 원칙]
1. 오류가 발생해도 사용자에게 "분석 불가"로 끝내지 마라
2. 반드시 대안을 제시하라:
   - 주소 형식 교정 제안
   - 유사 주소 추천
   - 법정 기준표(ZONE_LIMITS) 기반 일반적 건폐율/용적률 참고값 안내
3. 오류 메시지에 기술 용어(PNU, XML, ECONNREFUSED)를 노출하지 마라
4. "확인이 필요합니다" 등 명확한 안내 문구 사용
```

---

## 6. 환경 변수 설정

### 6-1. 필수 환경변수

파일 위치: `services/land_use_regulation/.env`

```env
# VWorld 토지이용계획 속성조회 API (메인)
VWORLD_API_KEY=B8385331-2B58-3CEF-9209-33CB9AFD68A6

# 공공데이터포털 - 국토교통부_토지이용규제정보서비스 (백업용)
LAND_USE_API_KEY=VAJkxQFCr4ViM45g0TSpV16Z+AVQXz3k+wpQPc9/X+rUlcA/GMvjdF6U6Cd3d/WXH+7vmtuQ9CnteJcJXu5dCg==
LAND_USE_API_KEY_ENCODED=VAJkxQFCr4ViM45g0TSpV16Z%2BAVQXz3k%2BwpQPc9%2FX%2BrUlcA%2FGMvjdF6U6Cd3d%2FWXH%2B7vmtuQ9CnteJcJXu5dCg%3D%3D

# 카카오 REST API (주소 → PNU 변환)
KAKAO_REST_KEY=72de5cd34b1d2979f85cdb428756c545

# FastAPI 서버 포트
LAND_USE_SERVICE_PORT=8010
```

### 6-2. API 별 용도

| 키 | API | 용도 | 활용기간 |
|----|-----|------|---------|
| `VWORLD_API_KEY` | VWorld Data API | 토지이용계획 속성조회 (메인) | 무기한 |
| `LAND_USE_API_KEY` | 공공데이터포털 | 행위제한 상세조회 (백업용) | 2026-03 ~ 2028-03 |
| `KAKAO_REST_KEY` | 카카오 로컬 | 주소 → 법정동코드 → PNU 변환 | 무기한 |

---

## 7. 규제 코드 상세 매핑 (regulation_details.py)

### 7-1. 수록 현황 (40+ 항목)

| 대분류 | 코드 범위 | 수록 항목 수 | 커버리지 |
|--------|-----------|-------------|---------|
| 용도지역 (주거) | UQA110~130 | 7개 | ★★★★★ |
| 용도지역 (상업) | UQA210~240 | 4개 | ★★★★★ |
| 용도지역 (공업) | UQA310~330 | 3개 | ★★★★★ |
| 용도지역 (녹지) | UQA410~430 | 3개 | ★★★★★ |
| 관리/농림/보전 | UQB~UQD | 3개 | ★★★★☆ |
| 도시계획시설 (공원) | UQT200~230 | 4개 | ★★★★☆ |
| 도시계획시설 (도로) | UQS110~200 | 3개 | ★★★☆☆ |
| 용도지구 | UQF~UQK | 5개 | ★★★☆☆ |
| 용도구역 | UQQ100~200 | 2개 | ★★★☆☆ |
| 기타규제 | UBB, URD, URH 등 | 6개 | ★★☆☆☆ |

### 7-2. 상세 항목 구조

각 규제 코드에 대해 다음 4가지 정보를 제공:

```python
{
    "related_law": "국토계획법 제36조",           # 관련 법령
    "restriction_summary": "제2종일반주거: ...",   # 행위제한 요약
    "design_impact": "건폐율 60%, 용적률 ...",     # 건축 설계 영향
    "management_agency": "시·군·구청 도시과",      # 관리기관
}
```

---

## 8. 법정 건폐율/용적률 기준표 (ZONE_LIMITS)

### 8-1. 도시지역

| 용도지역 | 건폐율 (%) | 용적률 (%) | 비고 |
|---------|-----------|-----------|------|
| 제1종전용주거 | 50 | 100 | 단독주택 중심 |
| 제2종전용주거 | 50 | 150 | 공동주택 일부 |
| 제1종일반주거 | 60 | 200 | 4층 이하 |
| **제2종일반주거** | **60** | **250** | **18층 이하 (가장 빈번)** |
| 제3종일반주거 | 50 | 300 | 층수 제한 없음 |
| 준주거 | 70 | 500 | 주상복합 가능 |
| 중심상업 | 90 | 1500 | 대형 상업·업무 |
| 일반상업 | 80 | 1300 | 다양한 용도 |
| 근린상업 | 70 | 900 | 소규모 상가 |
| 유통상업 | 80 | 1100 | 물류·유통 |
| 전용공업 | 70 | 300 | 주거 불가 |
| 일반공업 | 70 | 350 | 일부 주거 |
| 준공업 | 70 | 400 | 주상복합 가능 |
| 보전녹지 | 20 | 80 | 건축 대부분 제한 |
| 생산녹지 | 20 | 100 | 농업 관련 |
| **자연녹지** | **20** | **100** | **4층 이하, 개발 제한** |

### 8-2. 비도시지역

| 용도지역 | 건폐율 (%) | 용적률 (%) | 비고 |
|---------|-----------|-----------|------|
| 보전관리 | 20 | 80 | 개발 극도 제한 |
| 생산관리 | 20 | 80 | 농림 관련 |
| 계획관리 | 40 | 100 | 비도시 중 개발 용이 |
| 농림 | 20 | 80 | 농림업 보호 |
| 자연환경보전 | 20 | 80 | 자연환경 보전 |

> ⚠️ **중요**: 위 수치는 국토계획법상 **법정 상한**이며, 지자체 조례로 이보다 **낮게** 설정된 경우가 많습니다. 실제 적용 건폐율/용적률은 해당 시·군·구 건축조례를 반드시 확인해야 합니다.

---

## 9. AI 에이전트 시스템 프롬프트 주입문

아래 텍스트를 Gemini 시스템 프롬프트에 추가하여 스킬을 활성화합니다:

```
## 토지이용규제 조회 스킬 (get_land_use_regulation)

당신은 다음 도구를 사용할 수 있습니다:

- **get_land_use_regulation(address)**: 주소를 입력받아 토지이용규제 데이터를 조회합니다.

### 사용 규칙:
1. 사용자가 특정 대지의 건폐율, 용적률, 용도지역을 묻거나 "대지 분석"을 요청하면 반드시 이 도구를 먼저 호출하세요.
2. 건폐율/용적률 수치를 절대로 추측하지 마세요. 반드시 도구 반환값을 사용하세요.
3. 도구 호출 결과의 `error` 필드가 null이 아니면 오류를 사용자에게 안내하고 대안을 제시하세요.
4. `zone_types`가 비어있으면 "해당 필지의 용도지역이 확인되지 않습니다"라고 안내하세요.
5. `regulations` 배열의 각 항목에 `detail`이 있으면 관련 법령, 행위 제한, 설계 영향을 상세히 설명하세요.
6. `special_zones`에 "대공방어협조구역"이나 "비행안전구역" 등이 있으면 높이 제한 사전 협의가 필요함을 반드시 안내하세요.

### 결과 해석 가이드:
- `max_building_coverage`: 법정 최대 건폐율. "이 대지는 건폐율 {n}% 이하로 건축해야 합니다"
- `max_floor_area_ratio`: 법정 최대 용적률. "용적률은 {n}% 이하입니다"
- 건폐율 = (건축면적 / 대지면적) × 100. 대지에서 건물이 차지하는 비율
- 용적률 = (연면적 / 대지면적) × 100. 건물의 총 바닥면적 합계 비율
```

---

## 10. 프론트엔드 연동 (현 프로젝트)

### 10-1. 프록시 설정 (webpack.config.js)

```javascript
devServer: {
    proxy: {
        '/api/land-use': {
            target: 'http://localhost:8010',
            changeOrigin: true,
        },
    },
}
```

### 10-2. 프론트엔드 호출 (projectStore.ts)

```typescript
fetchLandUseData: async (address: string) => {
    set({ landUseLoading: true, landUseError: null });
    try {
        const res = await fetch(`/api/land-use?address=${encodeURIComponent(address)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        set({ landUseRegulation: data, landUseLoading: false });
    } catch (err: any) {
        set({ landUseError: err.message, landUseLoading: false });
    }
},
```

### 10-3. RegulationPanel.tsx 표시 구조

```
RegulationPanel
├── 프로젝트 기본정보 (사업명, 용도, 면적, 건폐율/용적률)
├── AI 종합 법규분석 (Gemini + 8대 카테고리)
│   ├── 요약 (필수준수/검토필요/참고)
│   ├── 카테고리별 상세 분석 (2단 그리드)
│   └── 법규 재분석 버튼
└── 공공데이터 기반 지역 조례 (VWorld API)
    ├── PNU 정보
    ├── 용도지역 뱃지
    ├── 건폐율/용적률 게이지
    └── 규제 항목 상세 (2단 카드 그리드 + 모달)
```

---

## 11. 서비스 실행 방법

### 11-1. 전체 서비스 동시 실행

```bash
# 프로젝트 루트에서
npm run dev:all
```

이 명령은 concurrently로 3개 서비스를 동시 실행:
- `FRONTEND`: webpack-dev-server (포트 3000)
- `3D-MASS`: 3D 매스 서비스 (포트 3004)
- `LANDUSE`: FastAPI 토지이용규제 (포트 8010)

### 11-2. 토지이용규제 서비스만 실행

```bash
cd services/land_use_regulation
python land_use_service.py serve
```

### 11-3. CLI 테스트

```bash
cd services/land_use_regulation
python land_use_service.py "경상남도 김해시 주촌면 농소리 631-2"
```

---

## 12. 트러블슈팅

### 12-1. 자주 발생하는 문제

| 증상 | 원인 | 해결 |
|------|------|------|
| "ECONNREFUSED" 504 에러 | LANDUSE 서비스 미기동 | `npm run dev:all` 또는 개별 `python land_use_service.py serve` |
| "주소를 찾을 수 없습니다" | 약식 주소 입력 | 정식 지번 주소 사용 (시·군·구 + 읍면동 + 번지) |
| VWorld API 빈 응답 | PNU 코드 오류/미등록 필지 | `/api/pnu?address=...`로 PNU 먼저 확인 |
| XML 파싱 오류 | VWorld 서버 HTML 에러 응답 | VWorld API KEY 유효성 확인 |
| 규제 detail이 null | REGULATION_DETAIL_DB에 미수록 코드 | regulation_details.py에 해당 코드 추가 |

### 12-2. 디버그 확인 순서

```
1. 서비스 헬스체크: curl http://localhost:8010/health
2. PNU 변환 확인: curl "http://localhost:8010/api/pnu?address=..."
3. 전체 파이프라인: curl "http://localhost:8010/api/land-use?address=..."
4. API 문서 확인: http://localhost:8010/docs
```

---

## 13. 확장 계획

### 13-1. 단기 (B8 조례분석 확장)

- [ ] `regulation_details.py`에 UQT (학교·체육·주차장 등) 도시계획시설 추가 (20+ 항목)
- [ ] 공공데이터포털 `arLandUseInfoService` 연동 (행위제한 상세 조회)
- [ ] 지자체별 조례 건폐율/용적률 DB 구축 (김해시, 서울시 등)

### 13-2. 중기 (AI 파이프라인 고도화)

- [ ] Gemini Function Calling 직접 연동 (현재는 REST → 향후 gRPC 검토)
- [ ] 규제 항목별 AI 해석 프롬프트 최적화 (ReAct 패턴)
- [ ] 복수 필지 일괄 분석 (배치 API)

### 13-3. 장기 (플랫폼 확장)

- [ ] 건축허가서류 자동 생성 (건폐율/용적률 → 배치도 자동 검증)
- [ ] 3D 매스 모듈과 연동 (용적률 기반 최대 연면적 계산 → 3D 볼륨 제한)
- [ ] 실시간 건축심의 체크리스트 생성

---

## 체크리스트

- [x] VWorld getLandUseAttr API 연동 완료
- [x] 카카오 주소 → PNU 변환 완료
- [x] XML 파싱 + 코드 분류 완료
- [x] regulation_details.py (40+ 코드) 구축 완료
- [x] FastAPI 라우터 3개 엔드포인트 구현
- [x] 프론트엔드 RegulationPanel 연동 완료
- [x] 에러 처리 + 사용자 안내 메시지 정의
- [x] Function Calling JSON Schema 정의
- [x] AI 시스템 프롬프트 주입문 작성
- [ ] 공공데이터포털 행위제한 API 연동 (백업)
- [ ] 지자체 조례 DB 구축
- [ ] Gemini Function Calling 직접 연동
