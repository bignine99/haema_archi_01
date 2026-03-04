# 바로 처리해야 할 다음 업무 (2026-03-04 업데이트)
> 3D 위성 지도 렌더링 성공 이후 품질 개선 작업 착수

---

## 🚨 최우선 다음 개발 과제 (지도 품질 및 데이터 정확도 향상)

### ① 3D 지도 해상도 극대화 (Low Resolution 문제 해결)
> **문제**: 현재 VWorld API를 통해 받아온 1장의 정적 이미지를 넓은 지면에 펴서(stretch) 화질이 크게 깨지고 흐려짐.
- **해결 접근법**: VWorld의 **WMTS (Tile Map Service)** API를 연동. 카메라의 Zoom 수준과 좌표 반경에 맞춰 고해상도 타일 지도를 타일링(Tiling) 방식으로 병합 렌더링 적용. 
- अथवा 해상도가 높은 영역의 이미지를 여러 장 분할 다운로드하여 Three.js에 다중 텍스처로 맵핑하는 방식 고려.

### ② 주변 건물 모델링 스케일 및 정확도 향상
> **문제**: 매스 빌더 상에 임의로 생성된 건물들이 실제 주소에 위치하는 건물들의 규모 및 형태와 오차가 큼.
- **해결 접근법**: 현재 사용하는 카카오 검색 기반의 대략적 크기 추정 로직을 폐기 또는 보강하고, **VWorld 3D 건물 데이터 API** 또는 **공간정보(건축물대장/SHP) API**를 호출하여 결합.
- 실제 건물의 외곽선 점(Polygon 좌표)과 정확한 층수/높이(Height) 데이터를 추출하여, Three.js `ExtrudeGeometry`로 실제 건물과 1:1 스케일 오차 없는 정밀 주변 컨텍스트를 구축.


### ② Vercel 배포 사이트 작동 검증
> **API 키 보안 수정 후 재배포를 했으나, 실제 기능 동작 여부 미확인**

| 검증 항목 | URL | 예상 결과 |
|----------|-----|----------|
| 과업지시서 분석 | `260226haemaarch.vercel.app` → 과업지시서 분석 메뉴 | PDF 업로드 → AI 분석 정상 작동 |
| **법규분석** | 법규분석 메뉴 → "AI 법규 분석 시작" 클릭 | **Gemini 신규 키로 정상 응답** (기존 403 에러 해소) |
| **대지분석** | 대지분석 메뉴 → "AI 대지분석 시작" 클릭 | 5대 영역 분석 결과 정상 표시 |
| 3D 매스 | 3D 매스 메뉴 → 주소 검색 → 건물 렌더링 | Vworld 지도 + 3D 매스 정상 |

```bash
# 착수 절차
# 1. 브라우저에서 https://260226haemaarch.vercel.app 접속
# 2. 각 메뉴 순서대로 기능 테스트
# 3. 에러 발생 시 → 브라우저 콘솔(F12) 확인 → 즉시 수정 후 git push → Vercel 자동 재배포
```

### ② Vercel 빌드에서 환경변수(process.env) 정상 주입 확인
> **webpack.DefinePlugin으로 .env → process.env 주입을 설정했으나, Vercel 빌드 환경에서 실제로 주입되는지 미확인**

- Vercel에서 빌드 시 `process.env.GEMINI_API_KEY`가 빈 문자열(`''`)이 아닌 실제 키 값으로 대체되는지 확인
- 확인 방법: 배포 사이트에서 법규분석 실행 → F12 Network 탭 → Gemini API 요청 URL에 `key=AIzaSy...` 포함 확인
- **실패 시 대응**: Vercel의 Environment Variables가 빌드 시점에 `process.env`로 전달되려면 `vercel.json`이나 `package.json`의 `build` 스크립트에서 환경변수를 명시적으로 넘겨야 할 수 있음

---

## 🔴 P1 — 오전 (09:00~12:00)

### ③ 3D 매스 모듈 핵심 기능 구현
> **implementation.md §14에 정의된 3D 매스 분석 5대 프로세스 중 P1 단계**

#### P1-1. 법규적 가이드라인 기반 볼륨 검토 (Regulatory Volume Validation)
| 기능 | 상세 |
|------|------|
| 건축 한계선 + 높이 제한 3D 투영 | 이격거리, 일조권 사선제한을 3D 공간에 표시 |
| 최대 용적률 시뮬레이션 | 층수/평면 형태 조합 다양하게 생성 |
| 매스 법적 침범 실시간 검토 | 매스가 법적 볼륨을 넘는지 경고 표시 |

#### P1-2. 실제 주변 건물 3D 렌더링 개선
> **현재 카카오 API에서 건물 이름/위치만 받아 임의 크기로 표현 중**

| 현재 문제 | 해결 방안 |
|----------|----------|
| 주변 건물 크기가 임의 (10~30m) | vWorld 건축물대장 API 연동 → 실제 층수/높이 반영 |
| 대지 형상과 3D 매스 불일치 | 대지 폴리곤을 3D 바닥면으로 정확히 투영 |
| 하천 등 지형 미반영 | vWorld 수치지형도 또는 위성영상 오버레이 검토 |

#### P1-3. 나침반 렌더링 완전 검증
- 현재 Html 컴포넌트로 교체했으나 실제 표시 여부 미확인
- 정북방향 표시가 대지의 실제 방위와 일치하는지 검증

---

## 🟡 P2 — 오후 (14:00~18:00)

### ④ 법규분석 콘텐츠 품질 검증 (전문가 상담 후)
> 법규분석 AI 결과의 충분성/정확성은 전문가와 상담 후 수정 진행

| 검증 포인트 | 방법 |
|------------|------|
| 7대 카테고리 누락 법규 | 건축사와 체크리스트 대조 |
| 수치 정확성 | 건폐율/용적률/이격거리 실제 기준과 대조 |
| 교육연구시설(특수학교) 특화 법규 | 장애인편의법, 교육환경보호법 세부 조항 |
| 김해시 지역 조례 반영 | 경상남도/김해시 건축 조례 확인 |

### ⑤ 대지분석 콘텐츠 보강
| 보강 항목 | 상세 |
|----------|------|
| 김해 삼계동 실제 지형 데이터 | Vworld DEM 또는 NSDI 연동 시도 |
| 주변 시설(학교, 병원, 교통) 지도 오버레이 | 카카오 카테고리 검색 결과를 Leaflet 지도에 마커 표시 |
| SWOT 분석 결과 시각화 | 4분할 차트 + 색상 구분 개선 |

---

## 🟢 P3 — 저녁 이후 (18:00~)

### ⑥ implementation.md §14 3D 매스 분석 P2~P5 계획 수립
> 오늘은 P1만 구현, 나머지 단계 실행 계획 수립

| 프로세스 | 내용 | 예상 기간 |
|---------|------|----------|
| P2 | 단계별 대안 매스 생성 및 비교 시스템 | 2일 |
| P3 | 주변 환경과의 상호작용 시각화 (일조/소음/조경) | 3일 |
| P4 | 시뮬레이션 기반 최적안 도출 (GA 엔진 연동) | 5일 |
| P5 | 보고서 생성 및 최종 프레젠테이션 모드 | 2일 |

### ⑦ Git 커밋 + 푸시 + Vercel 재배포
- 하루 작업분 커밋 + 푸시 (API 키 노출 없이!)
- `.env` 파일이 git에 포함되지 않는지 반드시 `git status`로 확인

---

## 📁 현재 프로젝트 파일 구조 (2026-03-03 최신)

```
260226_haema_arch/
├── frontend/                    # React + Webpack + Three.js
│   ├── .env                     # 🔒 API 키 (Git 미포함)
│   ├── webpack.config.js        # DefinePlugin으로 .env → process.env 주입
│   ├── src/
│   │   ├── App.tsx              # 사이드바 + 라우팅 + 대지분석 UI
│   │   ├── main.tsx
│   │   ├── index.css
│   │   ├── components/
│   │   │   ├── three/
│   │   │   │   └── SceneViewer.tsx    # 3D 매스 + Max Envelope + 나침반
│   │   │   └── ui/
│   │   │       ├── ControlPanel.tsx
│   │   │       ├── Dashboard.tsx      # 2단 대시보드
│   │   │       ├── DocumentUploader.tsx
│   │   │       ├── RegulationPanel.tsx # Gemini AI 법규분석 v2
│   │   │       └── MapPanel.tsx
│   │   ├── services/
│   │   │   ├── geminiService.ts           # AI 과업지시서 분석
│   │   │   ├── regulationAnalysisService.ts # AI 법규분석 (7대 카테고리)
│   │   │   ├── siteAnalysisService.ts     # AI 대지분석 (5대 영역)
│   │   │   ├── regulationEngine.ts        # 법규 계산 + 오프셋
│   │   │   ├── documentParser.ts          # AI 과업지시서 파서
│   │   │   └── gisApi.ts                  # 카카오/Vworld API
│   │   └── store/
│   │       └── projectStore.ts
│   ├── package.json
│   └── index.html
├── services/gis-service/        # FastAPI (port 8001)
├── .gitignore                   # .env 보호
├── vercel.json                  # Vercel 배포 설정
├── docker-compose.yml
├── detailed_steps_modification_processes.md
├── implementation.md
└── imsi.md                      # ← 이 파일
```

---

## ⚠️ 참고사항

### 로컬 Dev 서버 실행
```bash
cd "c:\Users\cho\Desktop\Temp\05 Code\260226_haema_arch\frontend"
npm run dev
# → http://localhost:3000
```

### 배포 사이트
```
https://260226haemaarch.vercel.app
```

### API 키 관리 룰 (절대 위반 금지!)
1. ❌ API 키를 `.ts`, `.js`, `.py` 파일에 직접 작성 금지
2. ✅ `frontend/.env` 파일에만 저장 (`.gitignore`로 보호)
3. ✅ Vercel 대시보드 → Settings → Environment Variables에서 관리
4. ✅ `git diff --staged`로 커밋 전 키 포함 여부 반드시 확인

### Vercel 환경변수 (등록 완료)
| 변수명 | 용도 | 상태 |
|--------|------|:---:|
| `GEMINI_API_KEY` | Gemini AI 분석 (법규/대지/과업지시서) | ✅ |
| `KAKAO_REST_KEY` | 주소 검색 + 지오코딩 | ✅ |
| `VWORLD_API_KEY` | 필지 폴리곤 + 지도 타일 | ✅ |

### 포트 충돌 / 좀비 프로세스
```bash
netstat -ano | findstr :3000
taskkill /PID [PID번호] /F
taskkill /IM node.exe /F
```
