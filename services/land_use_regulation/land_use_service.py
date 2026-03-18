"""
██████████████████████████████████████████████████████████████████████
███ 토지이용규제정보 서비스 (Land Use Regulation Service)            ███
███ ─────────────────────────────────────────────────────           ███
███ VWorld 토지이용계획 속성조회 API + 카카오 주소 API 연동           ███
███ 주소 → PNU 변환 → 토지이용계획 조회 (용도지역/건폐율/용적률)      ███
██████████████████████████████████████████████████████████████████████

파이프라인:
  [사용자 주소 입력]
       ↓
  [카카오 주소 API] → b_code + 지번정보 추출
       ↓
  [PNU 19자리 코드 생성]  (법정동코드10 + 대지구분1 + 본번4 + 부번4)
       ↓
  [VWorld getLandUseAttr API] → XML 응답 수신
       ↓
  [XML 파싱 + 데이터 정제] → Pydantic 모델 → JSON 반환

변경사항 (2026-03-06):
  - 공공데이터포털 arLandUseInfoService → VWorld getLandUseAttr API로 전환
  - arLandUseInfoService는 행위제한 조회용이라 areaCd+ucodeList 필수
  - VWorld getLandUseAttr는 PNU만으로 용도지역/건폐율/용적률 조회 가능
"""

import os
import asyncio
import math
import xml.etree.ElementTree as ET
from typing import Optional
from urllib.parse import quote, urlencode

import httpx
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from regulation_details import RegulationDetail, get_regulation_detail

# ══════════════════════════════════════════════
# 환경변수 로드
# ══════════════════════════════════════════════
load_dotenv()

VWORLD_API_KEY = os.getenv("VWORLD_API_KEY", "")
KAKAO_REST_KEY = os.getenv("KAKAO_REST_KEY", "")
SERVICE_PORT = int(os.getenv("LAND_USE_SERVICE_PORT", "8010"))


# ══════════════════════════════════════════════
# Pydantic 데이터 모델
# ══════════════════════════════════════════════

class PnuInfo(BaseModel):
    """PNU (필지고유번호) 변환 결과"""
    pnu: str = Field(..., description="19자리 필지고유번호")
    address_full: str = Field("", description="전체 주소")
    b_code: str = Field("", description="법정동 코드 (10자리)")
    mountain_yn: str = Field("N", description="산 여부 (Y/N)")
    main_no: str = Field("", description="본번")
    sub_no: str = Field("", description="부번")
    sido: str = Field("", description="시도명")
    sigungu: str = Field("", description="시군구명")
    dong: str = Field("", description="읍면동명")


class LandUseRegulationItem(BaseModel):
    """토지이용규제 개별 항목"""
    pnu: str = Field("", description="필지고유번호")
    regulation_name: str = Field("", description="용도지역지구명")
    regulation_code: str = Field("", description="용도지역지구코드")
    regulation_type: str = Field("", description="용도지역지구(대분류)")
    building_coverage_rate: Optional[float] = Field(None, description="건폐율 (%)")
    floor_area_ratio: Optional[float] = Field(None, description="용적률 (%)")
    coverage_applied: bool = Field(False, description="건폐율 적용 여부")
    far_applied: bool = Field(False, description="용적률 적용 여부")
    law_name: str = Field("", description="관련 법령명")
    article_name: str = Field("", description="관련 조항명")
    restriction_content: str = Field("", description="행위제한 내용")
    management_agency: str = Field("", description="관리기관")
    detail: Optional[RegulationDetail] = Field(None, description="상세 정보 (코드 기반)")


class LandUseRegulationResult(BaseModel):
    """토지이용규제 종합 분석 결과"""
    pnu_info: PnuInfo
    total_count: int = Field(0, description="총 규제 항목 수")
    regulations: list[LandUseRegulationItem] = Field(
        default_factory=list, description="규제 항목 목록"
    )
    # ── 핵심 요약 ──
    zone_types: list[str] = Field(
        default_factory=list, description="적용 용도지역 목록"
    )
    max_building_coverage: Optional[float] = Field(
        None, description="최대 건폐율 (%)"
    )
    max_floor_area_ratio: Optional[float] = Field(
        None, description="최대 용적률 (%)"
    )
    special_zones: list[str] = Field(
        default_factory=list, description="특별 지구/구역 목록"
    )
    error: Optional[str] = Field(None, description="오류 메시지")


# ══════════════════════════════════════════════
# 1단계: 주소 → PNU 코드 변환
# ══════════════════════════════════════════════

async def get_pnu_code(address: str) -> PnuInfo:
    """
    사용자 입력 주소(지번/도로명)를 19자리 PNU 코드로 변환.
    
    PNU 구조: 법정동코드(10) + 대지구분(1) + 본번(4) + 부번(4) = 19자리
      - 대지구분: 1=대지, 2=산
      - 본번/부번: 4자리 zero-padded
    
    사용 API: 카카오 로컬 주소검색 API
    """
    if not KAKAO_REST_KEY:
        raise ValueError("KAKAO_REST_KEY 환경변수가 설정되지 않았습니다.")

    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_KEY}"}
    params = {"query": address, "analyze_type": "similar"}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()

    documents = data.get("documents", [])
    if not documents:
        raise ValueError(f"주소를 찾을 수 없습니다: {address}")

    doc = documents[0]
    addr = doc.get("address") or {}

    # ── 법정동 코드 (10자리) ──
    b_code = addr.get("b_code", "")
    if len(b_code) < 10:
        raise ValueError(f"법정동 코드가 올바르지 않습니다: {b_code}")

    # ── 산 여부 → 대지구분 코드 ──
    mountain_yn = addr.get("mountain_yn", "N")
    land_type = "2" if mountain_yn == "Y" else "1"

    # ── 본번 / 부번 (4자리 zero-padding) ──
    main_no = addr.get("main_address_no", "0") or "0"
    sub_no = addr.get("sub_address_no", "0") or "0"
    main_no_padded = str(int(main_no)).zfill(4)
    sub_no_padded = str(int(sub_no)).zfill(4)

    # ── PNU 19자리 조합 ──
    pnu = f"{b_code}{land_type}{main_no_padded}{sub_no_padded}"
    assert len(pnu) == 19, f"PNU 길이 오류: {pnu} ({len(pnu)}자리)"

    # ── 주소 정보 추출 ──
    region_1 = addr.get("region_1depth_name", "")  # 시도
    region_2 = addr.get("region_2depth_name", "")  # 시군구
    region_3 = addr.get("region_3depth_name", "")  # 읍면동
    address_full = doc.get("address_name", address)

    print(f"[PNU변환] {address} → {pnu}")
    print(f"  법정동코드={b_code}, 대지구분={land_type}, 본번={main_no}, 부번={sub_no}")

    return PnuInfo(
        pnu=pnu,
        address_full=address_full,
        b_code=b_code,
        mountain_yn=mountain_yn,
        main_no=main_no,
        sub_no=sub_no,
        sido=region_1,
        sigungu=region_2,
        dong=region_3,
    )


# ══════════════════════════════════════════════
# 2단계: VWorld 토지이용계획 속성조회 API
# ══════════════════════════════════════════════

async def fetch_land_use_regulation(pnu_code: str) -> list[LandUseRegulationItem]:
    """
    VWorld 토지이용계획 속성조회 API로 용도지역/지구 정보를 조회.
    
    API: VWorld Data API / getLandUseAttr
    필수 파라미터: key, pnu, domain
    응답: XML → 파싱하여 LandUseRegulationItem 리스트 반환
    
    주요 XML 필드:
      - prposAreaDstrcCode: 용도지역지구코드 (UQA=용도지역, UQF~UQP=용도지구 등)
      - prposAreaDstrcCodeNm: 용도지역지구명
      - cnflcAt: 1=포함, 2=저촉 (포함/저촉 여부, 용도구분 아님)
      - lastUpdtDt: 최종 갱신일
    """
    if not VWORLD_API_KEY:
        raise ValueError("VWORLD_API_KEY 환경변수가 설정되지 않았습니다.")

    # ── VWorld API 호출 ──
    full_url = (
        f"https://api.vworld.kr/ned/data/getLandUseAttr"
        f"?key={VWORLD_API_KEY}"
        f"&domain=localhost"
        f"&pnu={pnu_code}"
        f"&numOfRows=1000"
        f"&format=xml"
    )

    print(f"[VWorld LandUseAttr] PNU={pnu_code} ...")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(full_url)
        xml_text = resp.text

    print(f"[VWorld LandUseAttr] Status: {resp.status_code}, Response: {len(xml_text)} bytes")

    # 디버그: 응답 앞부분 출력
    if len(xml_text) < 1000:
        print(f"[VWorld LandUseAttr] Full response:\n{xml_text}")
    else:
        print(f"[VWorld LandUseAttr] Preview: {xml_text[:500]}...")

    # ── XML 파싱 ──
    regulations = _parse_vworld_xml(xml_text, pnu_code)
    return regulations


def _parse_vworld_xml(xml_text: str, pnu_code: str) -> list[LandUseRegulationItem]:
    """
    VWorld getLandUseAttr API의 XML 응답을 파싱.
    
    VWorld XML 구조:
      <response>
        <totalCount>N</totalCount>
        <fields>
          <field>
            <pnu>...</pnu>
            <prposAreaDstrcCodeNm>제2종일반주거지역</prposAreaDstrcCodeNm>
            <prposAreaDstrcCode>UQA122</prposAreaDstrcCode>
            <cnflcAt>1</cnflcAt>
            <lastUpdtDt>2024-01-15</lastUpdtDt>
          </field>
          ...
        </fields>
      </response>
    """
    items: list[LandUseRegulationItem] = []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f"[VWorld] XML 파싱 오류: {e}")
        print(f"[VWorld] 응답 내용 일부: {xml_text[:500]}")
        return items

    # ── 응답 상태 확인 ──
    # VWorld 에러: <response><error><code>...</code><text>...</text></error></response>
    error_node = root.find(".//error/code")
    if error_node is not None:
        error_text = root.find(".//error/text")
        msg = error_text.text if error_text is not None else error_node.text
        print(f"[VWorld] API 오류: {msg}")
        return items

    # resultCode 체크 (일부 API)
    result_code_el = root.find(".//resultCode")
    if result_code_el is not None and result_code_el.text not in (None, "00", "OK"):
        result_msg = root.find(".//resultMsg")
        msg = result_msg.text if result_msg is not None else result_code_el.text
        print(f"[VWorld] 서비스 오류: {msg}")
        return items

    # ── totalCount 확인 ──
    total_el = root.find(".//totalCount")
    total_count = int(total_el.text) if total_el is not None and total_el.text else 0
    print(f"[VWorld] totalCount = {total_count}")

    if total_count == 0:
        return items

    # ── field 항목 추출 ──
    field_elements = root.findall(".//fields/field")
    if not field_elements:
        # 대체 경로 시도
        field_elements = root.findall(".//field")

    for field_el in field_elements:
        # prposAreaDstrcCode 접두어로 용도지역/지구/구역 분류
        # cnflcAt은 포함(1)/저촉(2) 표시이지 용도구분이 아님
        code = _get_xml_text(field_el, "prposAreaDstrcCode", "")
        reg_type = _classify_by_code(code)
        cnflc_at = _get_xml_text(field_el, "cnflcAt", "")
        cnflc_map = {"1": "포함", "2": "저촉", "3": "기타"}

        reg = LandUseRegulationItem(
            pnu=_get_xml_text(field_el, "pnu", pnu_code),
            regulation_name=_get_xml_text(field_el, "prposAreaDstrcCodeNm"),
            regulation_code=code,
            regulation_type=reg_type,
            law_name=_get_xml_text(field_el, "rlawNm",
                                   _get_xml_text(field_el, "lawNm")),
            article_name=_get_xml_text(field_el, "rlawArtclNm",
                                      _get_xml_text(field_el, "artclNm")),
            restriction_content=_get_xml_text(field_el, "actCn", ""),
            management_agency=_get_xml_text(field_el, "mngrMnstNm", ""),
            detail=get_regulation_detail(code, _get_xml_text(field_el, "prposAreaDstrcCodeNm", "")),
        )
        items.append(reg)

    print(f"[VWorld] {len(items)}개 규제 항목 파싱 완료")
    return items


def _classify_by_code(code: str) -> str:
    """
    prposAreaDstrcCode 접두어로 용도지역/지구/구역을 분류.
    
    국토계획법 체계:
      UQA = 용도지역 (주거/상업/공업/녹지/관리/농림/자연환경보전)
      UQF~UQP = 용도지구 (경관/고도/방화/방재/보존/취락/개발진흥 등)
      UQQ = 용도구역 (도시계획구역, 지구단위계획, 수산자원보호구역 등)
      UQR = 사업지역
      UQS~UQY = 도시계획시설
      기타 U** = 기타 규제구역 (군사, 문화재, 환경, 산림 등)
    """
    if not code:
        return "기타"
    
    # UQA: 국토계획법 용도지역 (가장 중요!)
    # UQA1xx = 주거지역, UQA2xx = 상업지역, UQA3xx = 공업지역, UQA4xx = 녹지지역
    # UQB = 관리지역, UQC = 농림지역, UQD = 자연환경보전지역
    if code.startswith("UQA1") or code.startswith("UQA2") or \
       code.startswith("UQA3") or code.startswith("UQA4"):
        return "용도지역"  # 세부 용도지역 (제1종일반주거, 일반상업 등)
    if code.startswith("UQA") and len(code) >= 5 and code[3:5] in ("00", "01", "50", "99"):
        return "용도지역(상위)"  # 도시지역, 도시지역미지정, 도시지역기타 등
    if code.startswith(("UQB", "UQC", "UQD", "UQE")):
        return "용도지역"  # 관리/농림/자연환경보전지역
    
    # UQF~UQP: 용도지구
    if code.startswith(("UQF", "UQG", "UQH", "UQI", "UQJ", "UQK",
                        "UQL", "UQM", "UQN", "UQO", "UQP")):
        return "용도지구"
    
    # UQQ: 용도구역
    if code.startswith("UQQ"):
        return "용도구역"
    
    # UQR~UQY: 도시계획시설/사업지역
    if code.startswith(("UQR", "UQS", "UQT", "UQU", "UQV", "UQW", "UQX", "UQY")):
        return "도시계획시설"
    
    # 기타 규제구역 (군사, 수도권정비, 환경, 산림 등)
    return "기타규제"


def _get_xml_text(element: ET.Element, tag: str, default: str = "") -> str:
    """XML 요소에서 텍스트 안전 추출"""
    el = element.find(tag)
    if el is not None and el.text:
        return el.text.strip()
    return default


def _get_xml_float(
    element: ET.Element, tag: str, default: Optional[float] = None
) -> Optional[float]:
    """XML 요소에서 실수 안전 추출"""
    el = element.find(tag)
    if el is not None and el.text:
        try:
            return float(el.text.strip())
        except ValueError:
            return default
    return default


# ══════════════════════════════════════════════
# 3단계: 데이터 정제 + 종합 결과 생성
# ══════════════════════════════════════════════

# ── 용도지역별 법정 건폐율/용적률 기준표 ──
ZONE_LIMITS = {
    "제1종전용주거지역": (50, 100),
    "제2종전용주거지역": (50, 150),
    "제1종일반주거지역": (60, 200),
    "제2종일반주거지역": (60, 250),
    "제3종일반주거지역": (50, 300),
    "준주거지역": (70, 500),
    "중심상업지역": (90, 1500),
    "일반상업지역": (80, 1300),
    "근린상업지역": (70, 900),
    "유통상업지역": (80, 1100),
    "전용공업지역": (70, 300),
    "일반공업지역": (70, 350),
    "준공업지역": (70, 400),
    "보전녹지지역": (20, 80),
    "생산녹지지역": (20, 100),
    "자연녹지지역": (20, 100),
    "보전관리지역": (20, 80),
    "생산관리지역": (20, 80),
    "계획관리지역": (40, 100),
    "농림지역": (20, 80),
    "자연환경보전지역": (20, 80),
}


def build_summary(
    pnu_info: PnuInfo,
    regulations: list[LandUseRegulationItem],
) -> LandUseRegulationResult:
    """
    개별 규제 항목들을 종합하여 핵심 요약 데이터를 생성.
    
    코드 접두어 기반 분류:
      - UQA1xx~4xx, UQB, UQC, UQD → 용도지역 (건폐율/용적률 결정)
      - UQF~UQP → 용도지구 (경관/고도/방화/보존 등)
      - UQQ → 용도구역 (지구단위계획 등)
      - 기타 → 특별규제구역
    """
    zone_types: list[str] = []
    special_zones: list[str] = []
    coverages: list[float] = []
    fars: list[float] = []
    # 중복 방지용 set
    seen_zones: set[str] = set()
    seen_special: set[str] = set()

    for reg in regulations:
        name = reg.regulation_name
        if not name:
            continue

        if reg.regulation_type == "용도지역":
            # 핵심 용도지역: 건폐율/용적률을 결정하는 데이터
            if name not in seen_zones:
                seen_zones.add(name)
                zone_types.append(name)
                # 법정 기준표에서 건폐율/용적률 조회
                for zone_key, (cov, far) in ZONE_LIMITS.items():
                    if zone_key in name:
                        coverages.append(cov)
                        fars.append(far)
                        break
        elif reg.regulation_type in ("용도지구", "용도구역", "기타규제"):
            # 용도지구/구역 및 기타 규제는 특별구역으로 분류
            if name not in seen_special:
                seen_special.add(name)
                special_zones.append(name)
        # 용도지역(상위), 도시계획시설은 요약에서 제외 (상세 목록에만 포함)

    return LandUseRegulationResult(
        pnu_info=pnu_info,
        total_count=len(regulations),
        regulations=regulations,
        zone_types=zone_types,
        max_building_coverage=min(coverages) if coverages else None,
        max_floor_area_ratio=min(fars) if fars else None,
        special_zones=special_zones,
    )


# ══════════════════════════════════════════════
# 메인 파이프라인: 주소 → 종합 분석 결과
# ══════════════════════════════════════════════

async def analyze_land_use(address: str) -> LandUseRegulationResult:
    """
    주소를 입력받아 토지이용규제 종합 분석 결과를 반환하는 메인 함수.
    
    전체 파이프라인:
      주소 → PNU 변환 → VWorld API 호출 → XML 파싱 → 데이터 정제 → JSON 반환
    """
    try:
        # 0. 주소 전처리: null 바이트/제어문자 제거 (PDF 추출 텍스트 등)
        import re
        clean_address = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', address).strip()
        if not clean_address:
            raise ValueError("유효한 주소가 아닙니다.")
        print(f"[분석] 입력 주소: '{clean_address}'")

        # 1. 주소 → PNU 변환
        pnu_info = await get_pnu_code(clean_address)

        # 2. PNU → 토지이용계획 조회 (VWorld)
        regulations = await fetch_land_use_regulation(pnu_info.pnu)

        # 3. 종합 요약 생성
        result = build_summary(pnu_info, regulations)

        print("\n" + "=" * 60)
        print(f"[위치] {pnu_info.address_full}")
        print(f"[PNU ] {pnu_info.pnu}")
        print(f"[규제] {result.total_count}건")
        print(f"[용도] {', '.join(result.zone_types) or '정보없음'}")
        if result.max_building_coverage:
            print(f"[건폐] {result.max_building_coverage}%")
        if result.max_floor_area_ratio:
            print(f"[용적] {result.max_floor_area_ratio}%")
        if result.special_zones:
            print(f"[특수] {', '.join(result.special_zones)}")
        print("=" * 60)

        return result

    except Exception as e:
        print(f"[ERROR] {e}")
        return LandUseRegulationResult(
            pnu_info=PnuInfo(pnu="0" * 19, address_full=address),
            error=str(e),
        )


# ══════════════════════════════════════════════
# FastAPI 마이크로서비스
# ══════════════════════════════════════════════

def create_app():
    """FastAPI 앱 생성 (서비스 모드로 실행 시 사용)"""
    from fastapi import FastAPI, Query, Body
    from fastapi.middleware.cors import CORSMiddleware
    from fc_executor import (
        TOOL_DEFINITIONS,
        SYSTEM_PROMPT_INJECTION,
        execute_tool,
        build_gemini_tool_config,
    )

    app = FastAPI(
        title="Land Use Regulation Service",
        description=(
            "Address -> PNU -> VWorld LandUse -> JSON\n\n"
            "**AI Function Calling 지원**: /api/fc/* 엔드포인트를 통해 "
            "Gemini 등 LLM이 자율적으로 토지이용규제를 조회할 수 있습니다."
        ),
        version="3.0.0",
    )

    # CORS 설정 (프론트엔드 연동)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:3002",
            "http://localhost:3003",
            "http://localhost:3004",
            "*",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── 기존 REST API ────────────────────────────────

    @app.get("/api/pnu", response_model=PnuInfo)
    async def api_get_pnu(address: str = Query(..., description="address")):
        return await get_pnu_code(address)

    @app.get("/api/land-use", response_model=LandUseRegulationResult)
    async def api_land_use(address: str = Query(..., description="address")):
        return await analyze_land_use(address)

    @app.get("/api/land-use-by-pnu", response_model=LandUseRegulationResult)
    async def api_land_use_by_pnu(pnu: str = Query(..., description="19-digit PNU")):
        pnu_info = PnuInfo(pnu=pnu)
        regulations = await fetch_land_use_regulation(pnu)
        return build_summary(pnu_info, regulations)

    @app.get("/api/zone-limits")
    async def api_zone_limits(
        zone_name: str = Query("", description="용도지역명 (예: 제2종일반주거지역)")
    ):
        """법정 건폐율/용적률 기준표 조회"""
        if zone_name:
            # 특정 용도지역 조회
            if zone_name in ZONE_LIMITS:
                cov, far = ZONE_LIMITS[zone_name]
                return {
                    "zone_name": zone_name,
                    "max_building_coverage": cov,
                    "max_floor_area_ratio": far,
                    "source": "국토계획법 법정 상한",
                }
            # 부분 매칭
            matches = []
            for key, (cov, far) in ZONE_LIMITS.items():
                if zone_name in key or key in zone_name:
                    matches.append({
                        "zone_name": key,
                        "max_building_coverage": cov,
                        "max_floor_area_ratio": far,
                    })
            if matches:
                return {"matches": matches, "source": "국토계획법 법정 상한"}
            return {"error": f"'{zone_name}' 해당 용도지역 없음", "available": list(ZONE_LIMITS.keys())}
        else:
            # 전체 목록 반환
            return {
                "zone_limits": {k: {"건폐율": v[0], "용적률": v[1]} for k, v in ZONE_LIMITS.items()},
                "source": "국토계획법 법정 상한",
            }

    # ── GIS Data API ──────────────────────────────

    @app.get("/api/gis/surrounding-buildings")
    async def api_surrounding_buildings(
        center_lng: float = Query(..., description="중심 경도 (WGS84)"),
        center_lat: float = Query(..., description="중심 위도 (WGS84)"),
        radius_m: int = Query(200, description="검색 반경 (미터)")
    ):
        """
        Vworld WFS를 활용하여 주변 건물 폴리곤 및 층수 조회
        """
        if not VWORLD_API_KEY:
            return {"error": "VWORLD_API_KEY is missing."}
        
        # 1도(degree)당 미터 환산 (대략적 계산, 서울 위도 약 37.5도 기준)
        # 위도 1도 ≈ 111,320m
        # 경도 1도 ≈ 111,320m * cos(위도)
        lat_degree_dist = 111320.0
        lng_degree_dist = 111320.0 * math.cos(math.radians(center_lat))
        
        # 위경도 변화량 계산
        lat_delta = radius_m / lat_degree_dist
        lng_delta = radius_m / lng_degree_dist
        
        minx = center_lng - lng_delta
        miny = center_lat - lat_delta
        maxx = center_lng + lng_delta
        maxy = center_lat + lat_delta
        
        import logging
        logger = logging.getLogger(__name__)

        try:
            from pyproj import Transformer
            transformer_to_3857 = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
            transformer_to_4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)
            
            # BBOX EPSG:4326 -> EPSG:3857 변환
            minx_3857, miny_3857 = transformer_to_3857.transform(minx, miny)
            maxx_3857, maxy_3857 = transformer_to_3857.transform(maxx, maxy)
            
            logger.info(f"[WFS -> DATA API] BBOX (EPSG:4326): {minx}, {miny}, {maxx}, {maxy}")
            logger.info(f"[WFS -> DATA API] BBOX (EPSG:3857): {minx_3857}, {miny_3857}, {maxx_3857}, {maxy_3857}")
        except Exception as e:
            logger.error(f"[WFS -> DATA API] Pyproj 설정/변환 오류: {e}")
            return {"error": "Pyproj BBOX Transform Failed"}

        # VWorld Data API URL (건물 레이어: LT_C_BULD_INFO 시도)
        url = (
            f"https://api.vworld.kr/req/data?key={VWORLD_API_KEY}&domain=http://localhost"
            f"&service=data&request=GetFeature&data=LT_C_BULD_INFO"
            f"&geomFilter=BOX({minx_3857},{miny_3857},{maxx_3857},{maxy_3857})"
            f"&geometry=true&crs=EPSG:3857&format=json&size=1000"
        )
        logger.info(f"[WFS -> DATA API] URL: {url}")
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(url)
                logger.info(f"[WFS] Status Code: {resp.status_code}")
                
                if resp.status_code != 200:
                    logger.error(f"[WFS] HTTP Error response: {resp.text}")
                    return {"error": f"VWorld WFS API HTTP Error {resp.status_code}", "detail": resp.text}
                
                # 강제 로깅 (가장 중요)
                logger.info(f"[WFS] RAW Response (first 500 chars): {resp.text[:500]}")
                
                try:
                    data = resp.json()
                    logger.info(f"[WFS] JSON Parse Success. Keys: {list(data.keys())}")
                except ValueError:
                    logger.error(f"[WFS] JSON Parse Failed. Full Response: {resp.text}")
                    return {"error": "VWorld WFS response is not JSON", "detail": resp.text}
                
                if data.get("response", {}).get("status") == "ERROR":
                    err_msg = data["response"].get("error", {})
                    logger.error(f"[WFS] API Error: {err_msg}")
                    return {"error": "VWorld API Error", "detail": err_msg}
                
                try:
                    features = data["response"]["result"]["featureCollection"]["features"]
                except KeyError:
                    features = []
                
                logger.info(f"[DATA API] Extracted {len(features)} building features.")
                
                # 프론트엔드에서 렌더링하기 쉽게 정제
                buildings = []
                for f in features:
                    props = f.get("properties", {})
                    geom = f.get("geometry", {})
                    if not geom or geom.get("type") not in ("Polygon", "MultiPolygon"):
                        continue
                        
                    # gro_flo_co: 지상층수
                    # buld_nm: 건물명
                    floors_str = props.get("gro_flo_co") or props.get("GRO_FLO_CO") or 1
                    try:
                        floors = int(floors_str)
                    except (ValueError, TypeError):
                        floors = 1
                    if floors < 1:
                        floors = 1
                    
                    b_id = props.get("bd_mgt_sn") or props.get("BD_MGT_SN") or f.get("id", "")
                    
                    coordinates = geom.get("coordinates")
                    # MultiPolygon의 경우 첫 번째 Polygon만 사용 (단순화)
                    if geom.get("type") == "MultiPolygon":
                        coordinates = coordinates[0]
                    
                    # 건물 다각형 (외곽선 rings) - geojson polygon 형식을 따름 (list of points [lng, lat])
                    # coordinates[0] is the outer ring
                    if not coordinates or not coordinates[0]:
                        continue
                        
                    raw_polygon = coordinates[0]
                    # Transform EPSG:3857 coordinates back to EPSG:4326 (WGS84)
                    polygon = []
                    for pt in raw_polygon:
                        if len(pt) >= 2:
                            lon, lat = transformer_to_4326.transform(pt[0], pt[1])
                            polygon.append([lon, lat])
                    
                    buildings.append({
                        "id": b_id,
                        "name": props.get("BULD_NM", ""),
                        "floors": floors,
                        "height": floors * 3.0, # 층당 3m 로 산출
                        "polygon": polygon # [[lng, lat], [lng, lat], ...]
                    })
                    
                return {"center": [center_lng, center_lat], "radius": radius_m, "buildings": buildings, "count": len(buildings)}
                
        except Exception as e:
            return {"error": f"Error fetching surrounding buildings: {str(e)}"}


    @app.get("/api/fc/tools")
    async def fc_get_tools():
        """AI 에이전트용 도구 정의(JSON Schema) 반환"""
        return {
            "tools": TOOL_DEFINITIONS,
            "gemini_config": build_gemini_tool_config(),
            "system_prompt": SYSTEM_PROMPT_INJECTION,
            "total_tools": len(TOOL_DEFINITIONS),
        }

    @app.post("/api/fc/execute")
    async def fc_execute(
        body: dict = Body(
            ...,
            examples=[
                {
                    "tool_name": "get_land_use_regulation",
                    "arguments": {"address": "경상남도 김해시 주촌면 농소리 631-2"},
                },
                {
                    "tool_name": "get_zone_limits",
                    "arguments": {"zone_name": "제2종일반주거지역"},
                },
            ],
        )
    ):
        """
        AI Function Calling 실행 엔드포인트.
        
        AI 에이전트가 tool_name과 arguments를 전달하면
        해당 도구를 실행하고 결과를 반환합니다.
        """
        tool_name = body.get("tool_name", "")
        arguments = body.get("arguments", {})
        
        if not tool_name:
            return {"error": "tool_name은 필수입니다.", "available_tools": [t["function"]["name"] for t in TOOL_DEFINITIONS]}
        
        result = await execute_tool(tool_name, arguments)
        return result

    # ── 대지 분석 API (Site Analysis) ────────────────

    @app.get("/api/site/district-plan")
    async def api_district_plan(address: str = Query(..., description="분석 대지 주소")):
        """지구단위계획 감지 + 수동 입력 스키마 반환"""
        from site_analysis import detect_district_plan
        
        result = await analyze_land_use(address)
        if result.error:
            return {"error": result.error}
        
        detection = detect_district_plan(
            regulations=[r.model_dump() for r in result.regulations],
            special_zones=result.special_zones,
        )
        return detection.model_dump()

    @app.post("/api/site/road-adjacency")
    async def api_road_adjacency(body: dict = Body(...)):
        """도로 접도 분석: 방위, 폭원, 접도 길이, 건축선 후퇴"""
        from site_analysis import analyze_road_adjacency
        
        site_polygon = [(p[0], p[1]) for p in body.get("site_polygon", [])]
        road_edges = body.get("road_edges", [])
        
        if not site_polygon:
            return {"error": "site_polygon 필수"}
        if not road_edges:
            return {"error": "road_edges 필수"}
        
        result = analyze_road_adjacency(site_polygon, road_edges)
        return result.model_dump()

    @app.post("/api/site/sunlight")
    async def api_sunlight_setback(body: dict = Body(...)):
        """일조권 사선제한 계산 (건축법 시행령 §86)"""
        from site_analysis import calculate_sunlight_setback
        
        site_polygon = [(p[0], p[1]) for p in body.get("site_polygon", [])]
        zone_types = body.get("zone_types", [])
        true_north_offset = body.get("true_north_offset", 0.0)
        
        if not site_polygon:
            return {"error": "site_polygon 필수"}
        if not zone_types:
            return {"error": "zone_types 필수"}
        
        result = calculate_sunlight_setback(site_polygon, zone_types, true_north_offset)
        return result.model_dump()

    # ── 3D 매스 엔진 API ─────────────────────────────

    @app.post("/api/massing/generate")
    async def api_generate_massing(body: dict = Body(...)):
        """3D 매스 생성 — 7종 타입 자동 생성 (Shapely 기반)"""
        from massing_engine import MassingInput, generate_massing, generate_all_typologies
        
        typology = body.get("typology_type", "SINGLE_BLOCK").upper()
        
        inp = MassingInput(
            site_polygon=body.get("site_polygon", []),
            typology_type=typology,
            max_coverage_pct=body.get("max_coverage_pct", 60),
            max_far_pct=body.get("max_far_pct", 250),
            max_height_m=body.get("max_height_m", 50),
            max_floors=body.get("max_floors", 15),
            floor_height_m=body.get("floor_height_m", 3.3),
            setback_m=body.get("setback_m", 1.5),
            site_area_sqm=body.get("site_area_sqm"),
        )
        
        if typology == "ALL":
            results = generate_all_typologies(inp)
            return {"typologies": [r.model_dump() for r in results]}
        else:
            result = generate_massing(inp)
            return result.model_dump()

    @app.post("/api/massing/validate")
    async def api_validate_compliance(body: dict = Body(...)):
        """3D 매스 법규 정합성 검증 — 건폐율/용적률/높이/후퇴 (Shapely 기반)"""
        from massing_validator import ComplianceInput, MassBlock, validate_compliance
        
        blocks = [MassBlock(**b) for b in body.get("mass_blocks", [])]
        
        inp = ComplianceInput(
            mass_blocks=blocks,
            site_area_sqm=body.get("site_area_sqm", 0),
            max_coverage_pct=body.get("max_coverage_pct", 60),
            max_far_pct=body.get("max_far_pct", 250),
            max_height_m=body.get("max_height_m", 50),
            max_floors=body.get("max_floors", 15),
            buildable_polygon=body.get("buildable_polygon", []),
        )
        
        result = validate_compliance(inp)
        return result.model_dump()

    @app.post("/api/massing/solar")
    async def api_calculate_solar(body: dict = Body(...)):
        """태양 궤적 & 그림자 계산 — NOAA Solar Calculator"""
        from solar_calculator import SolarInput, calculate_solar
        
        inp = SolarInput(
            latitude=body.get("latitude", 37.5665),
            longitude=body.get("longitude", 126.978),
            date_time=body.get("date_time", "2026-12-22T12:00:00"),
            timezone_offset=body.get("timezone_offset", 9.0),
            include_daily_path=body.get("include_daily_path", True),
            include_winter_solstice=body.get("include_winter_solstice", True),
        )
        
        result = calculate_solar(inp)
        return result.model_dump()

    # ── 헬스체크 ─────────────────────────────────────

    @app.get("/health")
    async def health_check():
        return {
            "status": "ok",
            "service": "land-use-regulation",
            "version": "3.1.0",
            "api": "VWorld getLandUseAttr",
            "function_calling": True,
            "fc_tools": len(TOOL_DEFINITIONS),
            "site_analysis": True,
            "skills": [
                "get_land_use_regulation", "get_pnu_code", "get_zone_limits",
                "detect_district_plan", "analyze_road_adjacency", "calculate_sunlight_setback",
            ],
            "vworld_key_set": bool(VWORLD_API_KEY),
            "kakao_key_set": bool(KAKAO_REST_KEY),
        }

    return app


# ── 모듈 레벨 app 인스턴스 (uvicorn CLI용) ──
app = create_app()


# ══════════════════════════════════════════════
# CLI 실행 (테스트용)
# ══════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        # ── 서비스 모드: FastAPI 서버 실행 ──
        import uvicorn
        app = create_app()
        print(f"\n[START] Land Use Service v2.0: http://localhost:{SERVICE_PORT}")
        print(f"[API  ] VWorld getLandUseAttr (PNU → 용도지역/건폐율/용적률)")
        print(f"[DOCS ] http://localhost:{SERVICE_PORT}/docs\n")
        uvicorn.run(app, host="127.0.0.1", port=SERVICE_PORT)
    else:
        # ── 테스트 모드: 직접 주소 입력 ──
        # Windows 콘솔 UTF-8 출력 설정 (테스트 모드에서만)
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

        test_address = sys.argv[1] if len(sys.argv) > 1 else "서울특별시 강남구 역삼동 858"
        print(f"\n[TEST] address: {test_address}\n")

        result = asyncio.run(analyze_land_use(test_address))

        # JSON 출력
        import json
        print("\n[JSON Result]:")
        print(json.dumps(result.model_dump(), ensure_ascii=False, indent=2))
