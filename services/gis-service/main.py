"""
GIS Service - 지적도/주소 API 마이크로서비스
한국형 건축 법규 최적화 AI (Flexity Clone) - Step 2

실제 API 연동:
  - 카카오 REST API: 주소 → 좌표 변환 (Geocoding)
  - Vworld Data API: 좌표 → 지적도 필지 폴리곤

사용법:
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8001 --reload
"""

import os
import httpx
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mock_data import MOCK_PARCELS

KAKAO_REST_KEY = os.getenv("KAKAO_REST_KEY", "72de5cd34b1d2979f85cdb428756c545")
VWORLD_API_KEY = os.getenv("VWORLD_API_KEY", "B8385331-2B58-3CEF-9209-33CB9AFD68A6")

app = FastAPI(title="GIS Service", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "gis-service", "version": "0.2.0", "mode": "api"}


@app.get("/api/land/search")
async def search_address(q: str = Query("", description="검색어")):
    """카카오 REST API를 통한 주소 검색 (Geocoding)"""
    if not q:
        return {"results": MOCK_PARCELS}

    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://dapi.kakao.com/v2/local/search/address.json",
            params={"query": q, "size": 5},
            headers={"Authorization": f"KakaoAK {KAKAO_REST_KEY}"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="카카오 API 오류")
        return res.json()


@app.get("/api/land/parcel")
async def get_parcel(lng: float = Query(...), lat: float = Query(...)):
    """Vworld Data API를 통한 지적도 필지 폴리곤 조회"""
    layers = ["LP_PA_CBND_BUBUN", "LT_C_ADSIGOT"]

    async with httpx.AsyncClient() as client:
        for layer in layers:
            try:
                res = await client.get(
                    "http://api.vworld.kr/req/data",
                    params={
                        "service": "data",
                        "request": "GetFeature",
                        "data": layer,
                        "key": VWORLD_API_KEY,
                        "domain": "http://localhost",
                        "geomFilter": f"POINT({lng} {lat})",
                        "geometry": "true",
                        "crs": "EPSG:4326",
                        "format": "json",
                        "size": 1,
                    },
                )
                if res.status_code == 200:
                    data = res.json()
                    features = (
                        data.get("response", {})
                        .get("result", {})
                        .get("featureCollection", {})
                        .get("features", [])
                    )
                    if features:
                        return {
                            "layer": layer,
                            "feature": features[0],
                            "status": "ok",
                        }
            except Exception as e:
                continue

    return {"status": "not_found", "message": "필지를 찾을 수 없습니다"}


@app.get("/api/land/mock")
async def get_mock_parcels():
    """Mock 필지 데이터 (API 키 없이 테스트용)"""
    return {"results": MOCK_PARCELS}
