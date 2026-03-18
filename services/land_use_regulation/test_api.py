"""
VWorld 토지이용계획 속성조회 API + 통합 서비스 테스트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Step 1: Raw API 호출 테스트 (코드 접두어 기반 분류)
Step 2: land_use_service.py 전체 파이프라인 검증
"""
import os
import asyncio
import json
import xml.etree.ElementTree as ET
import httpx
from dotenv import load_dotenv

load_dotenv()

# ── land_use_service.py에서 classify 함수 임포트 ──
from land_use_service import (
    analyze_land_use,
    _classify_by_code,
    ZONE_LIMITS,
)


async def test_step1_raw_api():
    """Step 1: Raw VWorld API 호출 + 코드 접두어 분류"""
    KAKAO_REST_KEY = os.getenv("KAKAO_REST_KEY", "")
    VWORLD_API_KEY = os.getenv("VWORLD_API_KEY", "")

    print("=" * 65)
    print("  [STEP 1] VWorld 토지이용계획 속성조회 Raw API 테스트")
    print("=" * 65)
    print(f"  KAKAO_REST_KEY: {KAKAO_REST_KEY[:8]}...")
    print(f"  VWORLD_API_KEY: {VWORLD_API_KEY[:8]}...")

    if not KAKAO_REST_KEY or not VWORLD_API_KEY:
        print("  [ERROR] API 키가 설정되지 않았습니다.")
        return

    async with httpx.AsyncClient(timeout=15.0) as client:
        test_address = "서울특별시 강남구 역삼동 858"
        print(f"\n  주소검색: {test_address}")

        kakao_resp = await client.get(
            "https://dapi.kakao.com/v2/local/search/address.json",
            headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"},
            params={"query": test_address, "analyze_type": "similar"}
        )
        docs = kakao_resp.json().get("documents", [])
        if not docs:
            print("  [FAIL] 주소를 찾을 수 없습니다")
            return

        addr = docs[0].get("address", {})
        b_code = addr.get("b_code", "")
        main_no = addr.get("main_address_no", "0") or "0"
        sub_no = addr.get("sub_address_no", "0") or "0"
        land_type = "2" if addr.get("mountain_yn", "N") == "Y" else "1"
        pnu = f"{b_code}{land_type}{int(main_no):04d}{int(sub_no):04d}"
        print(f"  PNU: {pnu} ({len(pnu)}자리)")

        # VWorld API 호출
        api_url = (
            f"https://api.vworld.kr/ned/data/getLandUseAttr"
            f"?key={VWORLD_API_KEY}&domain=localhost"
            f"&pnu={pnu}&numOfRows=1000&format=xml"
        )
        land_resp = await client.get(api_url)
        xml_text = land_resp.text

        root = ET.fromstring(xml_text)

        # 에러 확인
        error_node = root.find(".//error/code")
        if error_node is not None:
            err_text = root.find(".//error/text")
            print(f"\n  ❌ API 오류: {err_text.text if err_text is not None else error_node.text}")
            return

        result_code = root.find(".//resultCode")
        if result_code is not None and result_code.text not in (None, "00", "OK"):
            result_msg = root.find(".//resultMsg")
            print(f"\n  ❌ 서비스 오류: {result_msg.text if result_msg is not None else result_code.text}")
            return

        total_el = root.find(".//totalCount")
        total_count = int(total_el.text) if total_el is not None and total_el.text else 0
        fields = root.findall(".//fields/field")

        print(f"\n  ✅ API 정상! totalCount={total_count}, 수신={len(fields)}건")
        print(f"  {'─' * 60}")
        print(f"  {'No':>3}  {'분류':<10}  {'코드':<10}  {'포함/저촉':<6}  {'명칭'}")
        print(f"  {'─' * 60}")

        for i, field in enumerate(fields):
            code_el = field.find("prposAreaDstrcCode")
            name_el = field.find("prposAreaDstrcCodeNm")
            cnflc_el = field.find("cnflcAt")

            code = code_el.text if code_el is not None else "?"
            name = name_el.text if name_el is not None else "?"
            cnflc_at = cnflc_el.text if cnflc_el is not None else "?"
            cnflc_map = {"1": "포함", "2": "저촉", "3": "기타"}
            cnflc_name = cnflc_map.get(cnflc_at, "?")

            # 코드 접두어 기반 분류 (land_use_service.py 로직 사용)
            reg_type = _classify_by_code(code)

            print(f"  {i+1:3}  {reg_type:<10}  {code:<10}  {cnflc_name:<6}  {name}")

    print()


async def test_step2_service_pipeline():
    """Step 2: land_use_service.py 전체 파이프라인 검증"""
    print("=" * 65)
    print("  [STEP 2] land_use_service.py 전체 파이프라인 테스트")
    print("=" * 65)

    test_address = "서울특별시 강남구 역삼동 858"
    print(f"\n  입력 주소: {test_address}")

    result = await analyze_land_use(test_address)

    print(f"\n  {'━' * 60}")
    print(f"  ┌─ 종합 분석 결과")
    print(f"  ├─ 주소: {result.pnu_info.address_full}")
    print(f"  ├─ PNU : {result.pnu_info.pnu}")
    print(f"  ├─ 총 규제 항목: {result.total_count}건")
    print(f"  │")

    if result.zone_types:
        print(f"  ├─ 📍 용도지역:")
        for zt in result.zone_types:
            limits = ""
            for key, (cov, far) in ZONE_LIMITS.items():
                if key in zt:
                    limits = f"  → 건폐율 {cov}%, 용적률 {far}%"
                    break
            print(f"  │    • {zt}{limits}")
    else:
        print(f"  ├─ 📍 용도지역: (없음)")

    print(f"  │")
    if result.max_building_coverage is not None:
        print(f"  ├─ 🏗️ 적용 건폐율: {result.max_building_coverage}%")
    if result.max_floor_area_ratio is not None:
        print(f"  ├─ 🏢 적용 용적률: {result.max_floor_area_ratio}%")
    print(f"  │")

    if result.special_zones:
        print(f"  ├─ 🔒 특별구역/규제:")
        for sz in result.special_zones:
            print(f"  │    • {sz}")
    else:
        print(f"  ├─ 🔒 특별구역/규제: (없음)")

    if result.error:
        print(f"  ├─ ❌ 오류: {result.error}")

    print(f"  └─{'━' * 58}")

    # JSON 요약 출력
    summary = {
        "address": result.pnu_info.address_full,
        "pnu": result.pnu_info.pnu,
        "zone_types": result.zone_types,
        "max_building_coverage": result.max_building_coverage,
        "max_floor_area_ratio": result.max_floor_area_ratio,
        "special_zones": result.special_zones,
        "total_regulations": result.total_count,
    }
    print(f"\n  [JSON 요약]")
    print(f"  {json.dumps(summary, ensure_ascii=False, indent=4)}")


async def main():
    await test_step1_raw_api()
    await test_step2_service_pipeline()


if __name__ == "__main__":
    import sys, io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    asyncio.run(main())
