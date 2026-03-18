# 토지이용규제정보 서비스

## 개요

공공데이터포털 **국토교통부_토지이용규제정보서비스** API를 연동하여,
사용자가 입력한 주소에 대한 **지역 조례 기반 토지이용규제(건폐율, 용적률, 용도지역, 특수구역)**를 자동 조회합니다.

## 아키텍처

```
[사용자 주소 입력]
      ↓
[카카오 주소 API]  ←── KAKAO_REST_KEY
      ↓
  b_code(10자리) + mountain_yn + 본번 + 부번
      ↓
[PNU 19자리 생성]  ←── 법정동코드(10) + 대지구분(1) + 본번(4) + 부번(4)
      ↓
[토지이용규제 API]  ←── LAND_USE_API_KEY
  https://apis.data.go.kr/1613000/arLandUseInfoService/DTarLandUseInfo
      ↓
  XML 응답 수신
      ↓
[XML 파싱 + 데이터 정제]
      ↓
  Pydantic 모델 → JSON
      ↓
[건폐율, 용적률, 용도지역, 특수구역 반환]
```

## 실행 방법

### 1. 의존성 설치

```bash
cd services/land_use_regulation
pip install -r requirements.txt
```

### 2. 테스트 실행 (CLI)

```bash
# 기본 테스트 주소 (서울시 강남구 역삼동 858)
python land_use_service.py

# 특정 주소로 테스트
python land_use_service.py "경기도 안성시 공도읍 만정리 123"
```

### 3. 서비스 모드 실행 (FastAPI)

```bash
python land_use_service.py serve
# → http://localhost:8010/docs 에서 API 문서 확인 가능
```

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/pnu?address=주소` | 주소 → PNU 변환만 |
| GET | `/api/land-use?address=주소` | 주소 → 종합 규제 분석 |
| GET | `/api/land-use-by-pnu?pnu=PNU코드` | PNU 직접 조회 |
| GET | `/health` | 서비스 상태 확인 |

## 응답 예시

```json
{
  "pnu_info": {
    "pnu": "1168010100108580000",
    "address_full": "서울 강남구 역삼동 858",
    "b_code": "1168010100",
    "sido": "서울",
    "sigungu": "강남구",
    "dong": "역삼동"
  },
  "total_count": 3,
  "zone_types": ["제2종일반주거지역"],
  "max_building_coverage": 60.0,
  "max_floor_area_ratio": 250.0,
  "special_zones": ["학교정화구역", "대공방어협조구역"],
  "regulations": [...]
}
```

## 환경변수 (.env)

| 변수명 | 설명 |
|--------|------|
| `LAND_USE_API_KEY` | 공공데이터포털 디코딩 키 |
| `KAKAO_REST_KEY` | 카카오 REST API 키 |
| `LAND_USE_SERVICE_PORT` | FastAPI 서버 포트 (기본: 8010) |
