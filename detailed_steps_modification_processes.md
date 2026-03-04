# Flexity Clone - 개발 과정 상세 기록
> 작성일: 2026-02-26 (Step 2 업데이트: 2026-03-01)
> 프로젝트: 한국형 건축 법규 최적화 AI (Flexity Clone)

---

## 📋 프로젝트 개요

Flexity(플렉시티)와 유사한 한국형 건축 법규 최적화 AI SaaS를 직접 개발하는 프로젝트.
- **핵심 기능**: 지번 입력 → 건축법규 기반 최적 볼륨 3D 시각화
- **타겟**: 부동산 개발 초기 사업성 검토 (청년주택, 역세권 활성화 등)
- **아키텍처**: Docker 기반 마이크로서비스 (프론트엔드 + 4개 백엔드 서비스)

---

## 🏗️ 아키텍처 설계 (Docker / Container 분리)

사용자 요청에 따라, 매스 선정·배치도·건물 향 등의 기능을 **독립 컨테이너**로 분리하여 개발하는 구조를 채택함.

```
프로젝트 루트/
├── docker-compose.yml              # 5개 서비스 오케스트레이션
├── frontend/                       # Webpack + React + Three.js (포트 3000)
│   ├── src/
│   │   ├── main.tsx                # React 진입점
│   │   ├── App.tsx                 # 3컬럼 레이아웃
│   │   ├── index.css               # 다크 글래스모피즘 디자인 시스템
│   │   ├── components/
│   │   │   ├── three/SceneViewer.tsx   # Three.js 3D 건물 뷰어
│   │   │   └── ui/
│   │   │       ├── ControlPanel.tsx    # 좌측 - 필지 선택/검색, 파라미터 조절
│   │   │       └── Dashboard.tsx       # 우측 - 용적률 게이지/통계
│   │   └── store/projectStore.ts       # Zustand 상태 관리 + Mock 필지 데이터
│   ├── webpack.config.js
│   ├── package.json
│   └── Dockerfile
├── services/
│   ├── gis-service/                # [Step 2] 지적도/주소 API (포트 8001) ← NEW
│   │   ├── main.py                 # FastAPI 서버
│   │   ├── mock_data.py            # Mock 필지 데이터
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   ├── regulation-engine/          # [Step 3] 건축 법규 계산기 (포트 8002)
│   ├── optimization-engine/        # [Step 4] 매스 최적화 AI (포트 8003)
│   └── financial-analyzer/         # [Step 5] 사업성 분석기 (포트 8004)
├── implementation.md                # 상세 구현 명세
└── README.md
```

---

## ✅ 완료된 작업: Step 1 - Base UI & 3D 환경 구축

### 결과물
- **3컬럼 레이아웃**: 좌측 컨트롤 패널 + 중앙 3D 뷰어 + 우측 분석 대시보드
- **3D 뷰어**: React Three Fiber 기반, 층별 색상 구분, 대지 경계선, OrbitControls
- **조작**: 마우스 드래그(회전), 스크롤(확대), 우클릭(이동), 건물 층 클릭(선택)
- **실시간 반응**: 슬라이더 조절 시 3D 건물 및 대시보드 통계 동시 업데이트
- **Mock 계산**: 용도지역별 건폐율/용적률 프리셋, 주차대수 계산

---

## ✅ 완료된 작업: Step 2 - 지도 & 지적도 연동 (Mock 프레임워크)

### 2026-03-01 작업 내용

API 키 없이 **Mock 데이터 기반 프레임워크**를 먼저 구축하여, 나중에 Vworld/카카오 API 키만 꽂으면 바로 동작하는 구조.

### 새로 추가된 기능

#### 1. Mock 필지 데이터 6종
| 필지 | 주소 | 면적 | 형태 | 용도지역 |
|------|------|------|------|---------|
| 강남 역삼 | 강남구 역삼동 123-45 | 330㎡ | 직사각형 | 제2종 일반주거 |
| 마포 합정 | 마포구 합정동 456-12 | 255㎡ | 사다리꼴 | 준주거 |
| 성동 성수 | 성동구 성수동2가 789-3 | 368㎡ | ㄱ자형 | 준공업 |
| 용산 한남 | 용산구 한남동 234-7 | 195㎡ | 오각형 부정형 | 제3종 일반주거 |
| 서초 서초 | 서초구 서초동 567-89 | 600㎡ | 대형 육각형 | 일반상업 |
| 마포 연남 | 마포구 연남동 391-15 | 162㎡ | 소형 직사각형 | 제1종 일반주거 |

#### 2. 필지 선택 UI (ControlPanel.tsx)
- **주소 검색 드롭다운**: 검색어 입력 시 실시간 필터링
- **예시 필지 카드 목록**: SVG 미니 형상 미리보기, 면적/형태/용도지역 표시
- **대지 정보 카드**: 대지면적, 형태, 전면도로 폭, PNU 코드
- **Mock 모드 뱃지**: 현재 Mock 데이터 사용 중 표시

#### 3. 동적 폴리곤 3D 렌더링 (SceneViewer.tsx)
- **동적 중심점 계산**: polygonCentroid() 유틸리티로 모든 폴리곤 자동 중심 정렬
- **꼭짓점 마커**: 녹색 구체로 폴리곤 꼭짓점 시각화
- **치수선**: 가로/세로 대시 라인으로 대지 크기 표시
- **정북 방향 표시**: 빨간 화살표로 정북 방향 인디케이터
- **적응형 건물 매스**: 필지 바운딩 박스에 맞춰 건물 크기 자동 조절

#### 4. GIS 백엔드 서비스 구조 (services/gis-service/)
- **FastAPI 서버** (main.py): `/api/land/search`, `/api/land/parcel/{pnu}`, `/api/land/geocode`
- **Mock 데이터** (mock_data.py): 프론트엔드와 동일한 6개 필지
- **Dockerfile**: Docker Compose 연동 준비 완료
- **TODO 주석**: Vworld/카카오 API 연동 포인트 명시

### 수정된 파일

| 파일 | 변경 내용 |
|------|----------|
| `store/projectStore.ts` | Mock 필지 6종, selectParcel(), 폴리곤 유틸리티, roadWidth/shapeLabel 추가 |
| `components/ui/ControlPanel.tsx` | 주소 검색 드롭다운, 필지 카드 목록, ParcelShape SVG 컴포넌트 |
| `components/three/SceneViewer.tsx` | 동적 중심점, 꼭짓점 마커, 치수선, 정북 표시, 적응형 건물 크기 |
| `services/gis-service/main.py` | FastAPI 서버 (NEW) |
| `services/gis-service/mock_data.py` | Mock 필지 데이터 (NEW) |
| `services/gis-service/requirements.txt` | Python 의존성 (NEW) |
| `services/gis-service/Dockerfile` | 컨테이너 설정 (NEW) |

---

## 🔧 시행착오 기록 (문제 → 원인 → 해결)

### 1. create-next-app 실행 실패
- **문제**: `npx create-next-app` 명령어가 한글 경로에서 hang
- **원인**: Windows 터미널이 한글 문자(`건축기획설계+국내법규`)를 포함한 경로를 제대로 처리하지 못함
- **해결**: 수동으로 파일을 직접 생성하는 방식으로 전환

### 2. npm install 반복 실패 (unrs-resolver NAPI crash)
- **문제**: `npm install` 시 `unrs-resolver` 패키지의 postinstall 스크립트가 error code 3221225477로 크래시
- **원인**: `eslint-config-next`가 의존하는 `unrs-resolver`의 NAPI 바이너리가 Node v22.12.0과 호환되지 않음
- **시도**: eslint-config-next 버전 고정 → 여전히 실패
- **해결**: ESLint 관련 패키지를 완전히 제거하여 `unrs-resolver` 의존성 제거 → npm install 성공 (180 packages)

### 3. Next.js dev server silent crash
- **문제**: `npm run dev` 실행 시 `next dev`가 아무 에러 메시지 없이 즉시 종료
- **원인**: Next.js의 SWC 컴파일러(네이티브 바이너리)가 한글 경로 및 Windows Insider 빌드(26200.7840)에서 STATUS_ACCESS_VIOLATION 발생
- **시도**: `@next/swc-win32-x64-msvc` 수동 설치, UTF-8 코드페이지(chcp 65001) 설정 → 모두 실패
- **결론**: Next.js는 이 환경에서 사용 불가

### 4. Vite(esbuild)도 동일 크래시
- **문제**: Vite로 전환했으나 `esbuild`도 동일한 error code 3221225477 발생
- **원인**: esbuild의 네이티브 바이너리도 동일한 시스템 레벨 제약
- **시도**: `--ignore-scripts`로 설치 후 `esbuild-wasm` 별도 설치 → 여전히 실패

### 5. ✅ Webpack으로 최종 전환 → 성공
- **해결**: Webpack + ts-loader(순수 JavaScript 기반)는 네이티브 바이너리 의존이 없음
- **결과**: `npm install` 성공 (523 packages, 0 vulnerabilities), `webpack serve` 정상 작동

### 6. 한글 경로 회피
- **문제**: 한글이 포함된 원래 경로에서는 여전히 문제 발생 가능
- **해결**: `C:\dev\flexity-frontend\`로 프로젝트를 복사하여 실행
- **명령어**: `xcopy "원래경로\frontend" "C:\dev\flexity-frontend\" /E /I`

### 7. 포트 충돌 (EADDRINUSE)
- **문제**: 포트 3000이 이미 사용 중
- **해결**: `netstat -ano | findstr :3000` → PID 확인 → `taskkill /PID {번호} /F`

### 8. Next.js 잔여 파일 에러
- **문제**: `src/app/layout.tsx`, `src/app/page.tsx`가 `next` 모듈 import → 컴파일 에러
- **원인**: Next.js → Webpack 전환 시 남은 불필요한 파일
- **해결**: `rd /s /q src\app` 으로 해당 디렉토리 삭제

---

## � 실행 방법 (개발 서버)

```bash
# 1. 프로젝트를 영문 경로로 복사 (최초 1회)
xcopy "원래경로\frontend" "C:\dev\flexity-frontend\" /E /I /Y

# 2. 의존성 설치 (최초 1회 또는 package.json 변경 시)
cd C:\dev\flexity-frontend
del package-lock.json
npm install

# 3. 개발 서버 실행
npm run dev

# 4. 브라우저에서 확인
# → http://localhost:3000
```

### 소스 업데이트 후 반영
```bash
# 원본 경로에서 소스만 다시 복사 후 dev server가 HMR로 자동 반영
chcp 65001
xcopy "원래경로\frontend\src" "C:\dev\flexity-frontend\src\" /E /I /Y
```

### 포트 충돌 시
```bash
netstat -ano | findstr :3000
taskkill /PID [PID번호] /F
npm run dev
```

---

## ✅ 완료된 작업: Step 2.5 — 법규 엔진 보강 및 UI 레이아웃 수정 (2026-03-01 오후)

### 2026-03-01 오후 작업 내용 (14:00 ~ 22:30)

오늘 오후 세션에서는 크게 **4가지 영역**의 작업을 수행했습니다:
1. 지도 패널 위치 및 크기 수정 (가시성 개선)
2. 좌우 패널 스크롤바 구현 (콘텐츠 접근성)
3. 법규 세부사항 팝업 대폭 보강 (9개 섹션)
4. `implementation.md` 전면 리뉴얼 (5대 핵심 기능 로드맵)

---

### 1. 지도 패널(MapPanel) 위치 및 크기 수정

#### 문제
- 지도 패널이 좌측 사이드바 최하단에 위치하여, 화면을 67% 수준으로 축소해야 겨우 보이는 상태
- 스크롤 없이는 지도에 접근 불가

#### 해결 과정
1. **1차 시도**: 지도를 3D 뷰어 영역의 절대 위치로 이동 (`absolute bottom-12 left-4`)
2. **2차 시도**: `bottom-14`로 조정하여 Three.js 축척 바(Scale Bar) 위에 배치
3. **3차 시도**: `z-index: 30`으로 상향하여 다른 UI 요소 위에 표시
4. **최종**: 크기 확대 — 기본 `280×200px`, 확대 시 `480×360px`

#### 수정 파일: `MapPanel.tsx`

| 속성 | 이전 | 최종 |
|------|------|------|
| 위치 | `absolute bottom-12 left-4` | `absolute bottom-14 left-4` |
| z-index | `z-20` | `z-30` |
| 기본 크기 | `w-[240px] h-[170px]` | `w-[280px] h-[200px]` |
| 확대 크기 | `w-[420px] h-[320px]` | `w-[480px] h-[360px]` |
| invalidateSize | 1회 호출 | 다중 타이밍 호출 (100ms, 300ms, 500ms, 1000ms) |

#### 수정 파일: `App.tsx`
- MapPanel을 좌측 ControlPanel `<aside>` 내부에서 → 중앙 `<main>` 영역 내부로 이동
- 3D 뷰어와 같은 상위 컨테이너에 배치하여 플로팅 오버레이로 동작

```diff
 {/* 중앙: 3D 뷰어 */}
 <main className="flex-1 relative overflow-hidden">
     <SceneViewer />
+    <MapPanel />
 </main>
```

---

### 2. 좌우 패널 스크롤바 구현

#### 문제
- ControlPanel(좌측)과 Dashboard(우측)에 스크롤바가 없어서 하단 콘텐츠 접근 불가
- `overflow-y-auto` 적용했으나 스크롤바가 보이지 않고 작동하지 않음

#### 근본 원인 분석
- 부모 `<aside>`에 `overflow-y-auto`를 적용했으나, 자식 컴포넌트가 고정 높이(`h-full`)를 사용하지 않아 콘텐츠가 넘치지 않는 것으로 인식됨
- 스크롤이 발생하려면 자식 컨테이너가 부모보다 커야 하는데, `h-full`이 아닌 자동 높이를 사용했기 때문

#### 해결 방법
- **각 패널 자체가 스크롤을 관리**하도록 변경
- `<aside>`에서 `overflow-y-auto custom-scrollbar` 제거
- 각 패널의 루트 `<motion.div>`에 `h-screen overflow-y-scroll custom-scrollbar` 직접 적용

#### 수정 파일별 상세

**`App.tsx`** — aside에서 스크롤 제거:
```diff
-<aside className="... overflow-y-auto custom-scrollbar" style={{ width: '340px' }}>
+<aside className="... bg-white" style={{ width: '340px' }}>
     <ControlPanel />
 </aside>

-<aside className="... overflow-y-auto custom-scrollbar">
+<aside className="... bg-white">
     <Dashboard />
 </aside>
```

**`ControlPanel.tsx`** — 패널 자체에서 스크롤 관리:
```diff
 <motion.div
-    className="w-[340px] p-3 flex flex-col gap-2.5"
+    className="w-[340px] h-screen overflow-y-scroll p-3 pb-10 custom-scrollbar flex flex-col gap-2.5"
 >
```

**`Dashboard.tsx`** — 패널 자체에서 스크롤 관리:
```diff
 <motion.div
-    className="w-[320px] p-4 flex flex-col gap-3"
+    className="w-[320px] h-screen overflow-y-scroll p-4 pb-10 flex flex-col gap-3 custom-scrollbar"
 >
```

**`index.css`** — 스크롤바 스타일 강화:
```css
/* 전역 스크롤바 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: #e2e8f0; }
::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #64748b; }

/* 커스텀 스크롤바 클래스 */
.custom-scrollbar { overflow-y: scroll !important; }
.custom-scrollbar::-webkit-scrollbar { width: 8px; display: block !important; }
.custom-scrollbar::-webkit-scrollbar-track { background: #f1f5f9; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 4px; min-height: 40px; }
```

---

### 3. 법규 세부사항 팝업 대폭 보강 (4섹션 → 9섹션 + 체크리스트)

#### 기존 4개 섹션 (유지)
| # | 섹션명 | 색상 | 내용 |
|---|--------|------|------|
| ① | 용도지역별 건폐율·용적률·높이 | 🔵 Blue | 14개 용도지역 테이블 (현재 선택 하이라이트) |
| ② | 정북일조 사선제한 | 🔴 Red | §86 수식 + H=15m, 20m 계산 예시 |
| ③ | 대지 안의 공지·건축선 후퇴 | 🟣 Purple | 4개 용도지역별 전면/측면/후면 후퇴거리 |
| ④ | 주차 대수 산정 | 🟡 Amber | 7개 용도별 산정 기준 (교육연구시설 포함) |

#### 신규 추가 5개 섹션
| # | 섹션명 | 색상 | 법적 근거 | 내용 |
|---|--------|------|----------|------|
| ⑤ | 가로구역별 최고높이 및 일조권 상세 | 🟤 Indigo | 건축법 §60, 시행령 §86의2 | 가로구역 높이제한, 채광일조 이격거리 산정식 (D≥0.5H, 0.8H, 1.0H), 경사지 지표면 산정 |
| ⑥ | 도로 및 대지 조건 건축선 제한 | 🟢 Teal | 지구단위계획 | 건축지정선(2~3m), 벽면한계선, 가각전제(8m 미만 교차), 막다른 도로(35m/6m) |
| ⑦ | 용도별 특화 법규 및 시설 기준 | 🟩 Emerald | 장애인법, CPTED, ZEB | 4행 테이블: 장애인 편의시설(3~5% 잠식), CPTED, ZEB 인증, BF 인증 |
| ⑧ | 구조 및 피난·방화 계통 | 🟠 Orange | 소방법, 건축법 | 소방차 진입로 6m(⚠️ 탈락 사유), 직통계단 30m/50m, DA(Dry Area) |
| ⑨ | 지구단위계획 및 경관 심의 | 🌹 Rose | 국토계획법 | 인센티브 테이블(공개공지~10%, ZEB~15% 등 5항목), 경관 가이드라인 |

#### 신규 추가 요약 테이블
| # | 섹션명 | 색상 | 내용 |
|---|--------|------|------|
| ✓ | 현상 설계 단계별 필수 체크리스트 | ⬛ Slate | 4대 영역(토지/높이/방재/인증) × 검토항목 × 영향요소 |

#### 수정 파일: `Dashboard.tsx`
- **RegulationDetailButton** 함수 내 팝업 본체에 5개 `<section>` + 1개 체크리스트 테이블 추가 (약 210줄 신규 코드)
- 팝업 푸터 문구 확장: `건축법·국토계획법·주차장법·소방법·장애인편의법`
- 팝업 최대 높이: `max-h-[85vh]` (기존 유지, 내부 스크롤로 모두 접근 가능)

#### 인센티브 테이블 데이터
```
공개공지 확보    → ~10%  (대지면적 5% 이상)
지능형 건축물    → ~5%   (IBS 인증)
녹색건축 인증    → ~6%   (최우수 등급)
에너지효율(ZEB) → ~15%  (1등급)
장수명 주택     → ~3%   (최우수)
```

---

### 4. implementation.md 전면 리뉴얼

#### 배경
- 기존: 5단계 Step 기반 단일 기능 개발 계획 (146줄)
- 변경 사유: 사용자가 Autodesk Forma, TestFit, Maket AI 등 14개 벤치마크 솔루션을 참조하여, 5대 핵심 기능을 **모두 실무적으로 구현**하고 **AI 대화형으로 상호보완적으로 동작**하는 플랫폼 구축 요청

#### 새 구조 (12개 섹션, ~400줄)

| 섹션 | 내용 |
|------|------|
| §1 비전 | 올인원 기획설계 플랫폼 + 한국법규 8대 차별점 |
| §2 로드맵 | Phase 1~5 다이어그램 + 우선순위 테이블 |
| §3 벤치마크 | 14개 솔루션 4개 카테고리로 분류 |
| §4 아키텍처 | 7개 마이크로서비스 + AI/ML 레이어 |
| §5 Phase 1 | 배치도/대지분석 — A~F 6대 모듈 상세 (의사코드, GA 설계, UI 와이어프레임) |
| §6 Phase 2 | 평면도 자동 생성 — GNN/RL/GAN 알고리즘 |
| §7 Phase 3 | 입면·단면·3D 매스 — 파라메트릭 파사드 |
| §8 Phase 4 | 컨셉 시각화 — SD+ControlNet |
| §9 Phase 5 | 면적표·실 구성 — 실무 산출물 자동화 |
| §10 AI | 대화형 인터페이스 — 4턴 시나리오 + LLM Intent 분류 |
| §11 기술 | 16개 기술 스택 테이블 |
| §12 현황 | ✅/🔶/⬜ 3단계 추적 |

---

### 5. 과업지시서 데이터 반영 (이전 세션에서 완료)

오늘 오전~오후 초반에 수행한 작업:
- **교육연구시설** 용도를 `BuildingUse` 타입 및 `regulationEngine.ts`에 추가
- **학교용지, 자연녹지지역** 등 용도지역 추가
- 층수 슬라이더를 과업지시서 조건에 맞게 조정
- 예시 필지를 2개로 축소 (주거/상업 대표)
- 검색 결과가 대지정보 하단으로 들어가는 문제 수정

---

### 수정된 파일 총괄 (2026-03-01 오후)

| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `App.tsx` | MapPanel 위치 이동 (aside→main), aside 스크롤 제거 | ~10줄 |
| `MapPanel.tsx` | 크기 확대 (280×200/480×360), 위치 (bottom-14, z-30), invalidateSize 다중 호출 | ~20줄 |
| `ControlPanel.tsx` | h-screen overflow-y-scroll pb-10 custom-scrollbar 추가 | ~3줄 |
| `Dashboard.tsx` | h-screen overflow-y-scroll 추가 + 법규 팝업 5섹션+체크리스트 신규 | **~220줄** |
| `index.css` | 전역/커스텀 스크롤바 두께 8px, 색상, 항상 표시 | ~30줄 |
| `implementation.md` | 5대 기능 종합 로드맵으로 전면 리뉴얼 | **전면 재작성 (~400줄)** |

---

### 배포 이력 (2026-03-01 오후)

| 시각 | 배포 내용 |
|------|----------|
| ~15:30 | MapPanel 위치 이동 + 크기 조정 1차 |
| ~16:00 | MapPanel bottom-14, z-30 확정 |
| ~17:00 | aside overflow 제거, ControlPanel 스크롤 적용 |
| ~19:30 | 스크롤바 CSS 강화 (8px, 항상 표시) |
| ~20:00 | Dashboard 스크롤 적용 + MapPanel 크기 확대 (280×200) |
| ~21:50 | 법규 팝업 5섹션 + 체크리스트 추가 |
| ~22:15 | implementation.md 전면 리뉴얼 |

모든 배포는 `deploy.bat` 스크립트를 통해 `C:\dev\flexity-frontend\` 경로로 복사 후 HMR 자동 반영.
브라우저 캐시 이슈가 지속되어 `Ctrl+Shift+R` (하드 리프레시) 필수.

---

## 📊 전체 진행 상황 (업데이트: 2026-03-01)

| Step | 내용 | 상태 |
|------|------|------|
| Step 1 | Base UI & 3D 환경 구축 | ✅ 완료 |
| Step 2 | 지도 & 지적도 연동 (카카오/Vworld API) | ✅ 완료 |
| Step 2.5 | 법규 엔진 기초 + 법규 팝업 9섹션 | ✅ **완료** (2026-03-01) |
| Phase 1-A | 대지정보 수집 강화 (토지이용계획/DEM) | 🔶 부분완료 |
| Phase 1-B | Build-line 산출 (2D Offset → 3D) | 🔶 부분완료 |
| Phase 1-C | Max Envelope 3D (Boolean 절단) | ⬜ 다음 |
| Phase 1-D | 환경 시뮬레이션 (일조/바람/소음/조망) | ⬜ 예정 |
| Phase 1-E | 제너레이티브 배치 (GA 엔진) | ⬜ 예정 |
| Phase 1-F | 사업성 실시간 연동 (ROI/IRR) | ⬜ 예정 |
| Phase 2 | 평면도 자동 생성 | ⬜ 예정 |
| Phase 3 | 입면·단면·3D 매스 | ⬜ 예정 |
| Phase 4 | 컨셉 시각화 | ⬜ 예정 |
| Phase 5 | 면적표·실 구성 | ⬜ 예정 |

### 내일 (2026-03-02) 우선 작업 예정
> **Phase 1-C: Max Envelope 3D 실제 구현**
> 1. 대지 폴리곤에서 용도별 후퇴거리(Offset) → 축소 폴리곤 생성
> 2. 축소 폴리곤을 최대 높이까지 Extrude → 3D Bounding Box
> 3. 정북일조 사선제한 평면으로 3D Boolean Difference (절단)
> 4. 투명 와이어프레임으로 "법적 최대 건축 가능 영역" 3D 시각화
> 5. 사용자가 용도지역/층수 변경 시 실시간 업데이트
>
> → 이것이 Flexity/Forma/TestFit 같은 솔루션의 **핵심 차별화 요소**

---

## 🛠️ 기술 스택 (확정, 2026-03-01 업데이트)

| 분류 | 기술 | 비고 |
|------|------|------|
| Frontend | Webpack 5 + React 18 + TypeScript | 네이티브 바이너리 의존 없음 |
| 3D Engine | Three.js (@react-three/fiber, drei) | WebGL 기반 |
| State | Zustand | 경량 상태 관리 |
| Animation | Framer Motion | UI 애니메이션 |
| Icons | Lucide React | 아이콘 세트 |
| Styling | Tailwind CSS 3 + PostCSS | 다크 글래스모피즘 테마 |
| Font | Pretendard Variable | 한글 최적화 |
| Map | Leaflet + React-Leaflet | 2D 지적도 |
| Backend (Step 2) | FastAPI (Python) | GIS 서비스 구축 완료 |
| Container | Docker Compose | 7개 서비스 오케스트레이션 (예정) |
| 배포 | 로컬 deploy.bat → C:\dev\flexity-frontend | HMR 자동 반영 |
| 향후 AI | DEAP(GA), PyTorch(GAN/RL), GPT-4/Gemini | 배치 최적화 + 대화형 |
| 향후 렌더링 | Stable Diffusion + ControlNet | 컨셉 시각화 |
| 향후 Export | jsPDF, SheetJS, DXF-writer | 도면/리포트 출력 |

---

## ✅ 완료된 작업: Phase 1-C — Max Envelope 3D 실제 구현 (2026-03-02)

### 2026-03-02 작업 내용

**Phase 1-C: 법적 최대 건축 가능 영역(Max Envelope) 3D 볼륨 시각화**를 실제 기하학적 연산 기반으로 구현.

### 구현된 기능

#### 1. 폴리곤 오프셋(후퇴) 알고리즘 — `regulationEngine.ts`

| 함수 | 기능 | 알고리즘 |
|------|------|----------|
| `offsetPolygon()` | 2D 폴리곤을 지정 거리만큼 안쪽으로 수축 | 각 변의 법선 이동 → 인접 변 교차점 계산 |
| `signedArea()` | 폴리곤 방향(CW/CCW) 판별 | Shoelace formula |
| `lineLineIntersection()` | 두 직선 교차점 계산 | 매개변수 방정식 |
| `computeBuildablePolygon()` | 비균일 후퇴거리 적용 건축가능영역 생성 | 변 방향별 후퇴거리 자동 판별 |
| `computeSunlightClipVertices()` | 정북일조 사선제한 3D 클리핑 | 꼭짓점별 거리→높이 변환 |
| `polygonArea()` | 폴리곤 면적 계산 | Shoelace formula |

##### 후퇴거리 자동 판별 로직
```
폴리곤 각 변 → 수평/수직 판별
├── 수평 + 상단(정북방향) → north setback (1.5m 주거)
├── 수평 + 하단(전면도로) → front setback (1.0m 주거)
└── 수직(좌/우)         → side setback  (0.5m 주거)
```

#### 2. Max Envelope 3D 볼륨 렌더링 — `SceneViewer.tsx`

| 요소 | 구현 내용 | 시각화 |
|------|----------|--------|
| 건축가능영역 바닥면 | 후퇴 적용된 폴리곤 ShapeGeometry | 🟣 보라색 반투명 |
| 후퇴선 | 건축가능영역 경계 점선 (폴리곤 형태) | 🟣 보라색 점선 |
| 3D 볼륨 | BufferGeometry (바닥+상단+측면 삼각형 메쉬) | 🔵 파란색 반투명 (7%) |
| 상단 윤곽선 | 사선절단된 높이 프로파일 실선 | 🔵 파란색 실선 |
| 수직 모서리 | 하단→상단 꼭짓점 연결 점선 | 🔵 파란색 점선 |
| 높이 제한선 | 법정 최대높이 수평선 | 🔴 빨간 점선 |
| 사선제한 경사면 | 정북일조 기울기면 (9m~최대높이) | 🔴 빨간 반투명 |
| 사선 경사선 | 좌/우 경사 라인 + 9m 기준선 | 🔴 빨간 실선/점선 |
| 후퇴거리 레이블 | 전면/측면/정북 거리 @react-three/drei Text | 🟣🔴 색상별 텍스트 |

##### 3D 볼륨 생성 방식
```
1. 바닥면 (Y=0): offsetPolygon으로 생성된 건축가능영역 폴리곤
2. 상단면: 각 꼭짓점별 sunlightMaxHeight(dist) 적용된 가변 높이
3. 측면: 바닥↔상단 꼭짓점을 2개 삼각형으로 연결
4. 삼각형 분할: Fan triangulation (0→i→i+1)
```

##### 사선제한 경사면 계산
```
건축법 시행령 §86 (정북일조 사선제한):
  H ≤ 9m  → D ≥ 1.5m (수직 벽 가능)
  H > 9m  → D ≥ H/2  (기울기 = 2, 약 63.4°)

경사면 4개 꼭짓점:
  좌하(9m, 정북경계), 우하(9m, 정북경계)
  좌상(최대높이, +남쪽이동), 우상(최대높이, +남쪽이동)
  남쪽이동거리 = (maxH - 9) / 2
```

#### 3. Max Envelope 컨트롤 UI — `ControlPanel.tsx`

| 요소 | 내용 |
|------|------|
| 토글 버튼 | Eye/EyeOff 아이콘, 표시중/숨김 상태 |
| 건축가능영역 면적 | 후퇴 적용 후 실 면적 (㎡) |
| 최대 높이/층수 | 법정 최대높이(m) + 환산 층수 |
| 후퇴거리 4방향 | 전면/측면/후면/정북 각각 수치 표시 |
| 법규 적합성 | ShieldCheck (✅ 적합) / ShieldAlert (❌ 초과) |
| 사선제한 뱃지 | 정북일조 사선제한 적용 여부 표시 |

#### 4. MaxEnvelopeResult 인터페이스 확장

기존 필드에 추가된 Phase 1-C 필드:
```typescript
buildablePolygon: [number, number][];      // 후퇴 적용된 건축가능영역 2D 폴리곤
sunlightClipVertices: [number, number, number][];  // 사선절단 3D 꼭짓점 [x, h, z]
buildablePolygonArea: number;              // 건축가능영역 실 면적 (㎡)
```

### 수정된 파일 총괄 (2026-03-02)

| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `services/regulationEngine.ts` | 폴리곤 오프셋 알고리즘 6개 함수, MaxEnvelopeResult 3필드 추가, calculateMaxEnvelope 3D 데이터 생성 | **+175줄** (13.7KB → 21.1KB) |
| `components/three/SceneViewer.tsx` | MaxEnvelopeVisualization 완전 재구성 — 실제 BufferGeometry 볼륨, 와이어프레임, 사선경사면, 후퇴거리 레이블 | **+180줄 / -125줄** |
| `components/ui/ControlPanel.tsx` | Max Envelope 컨트롤 섹션 추가 — 토글, 면적, 후퇴거리, 법규적합성 | **+74줄** |
| `App.tsx` | 하단 축척 바 레이블 업데이트 | 1줄 |

### 빌드 결과

```
✅ webpack 5.105.3 compiled successfully in 12225 ms
   에러 0개, 경고 0개
```

---

## 📊 전체 진행 상황 (업데이트: 2026-03-02)

| Step | 내용 | 상태 |
|------|------|------|
| Step 1 | Base UI & 3D 환경 구축 | ✅ 완료 |
| Step 2 | 지도 & 지적도 연동 (카카오/Vworld API) | ✅ 완료 |
| Step 2.5 | 법규 엔진 기초 + 법규 팝업 9섹션 | ✅ 완료 |
| Phase 1-A | 대지정보 수집 강화 (토지이용계획/DEM) | 🔶 부분완료 |
| Phase 1-B | Build-line 산출 (2D Offset → 3D) | ✅ **완료** (2026-03-02) |
| Phase 1-C | Max Envelope 3D (Boolean 절단) | ✅ **완료** (2026-03-02) |
| Phase 1-D | 환경 시뮬레이션 (일조/바람/소음/조망) | ⬜ 다음 |
| Phase 1-E | 제너레이티브 배치 (GA 엔진) | ⬜ 예정 |
| Phase 1-F | 사업성 실시간 연동 (ROI/IRR) | ⬜ 예정 |
| Phase 2 | 평면도 자동 생성 | ⬜ 예정 |
| Phase 3 | 입면·단면·3D 매스 | ⬜ 예정 |
| Phase 4 | 컨셉 시각화 | ⬜ 예정 |
| Phase 5 | 면적표·실 구성 | ⬜ 예정 |

---

## ✅ 완료된 작업: UI 전면 리스트럭처링 + 과업지시서 업로드 (2026-03-02 오후)

### 2026-03-02 오후 작업 내용 (13:00 ~ 17:30)

오후 세션에서 크게 **5가지 영역**의 작업을 수행:

### 1. 좌측 사이드바 메뉴 + 라우팅 전면 재구성

#### 변경 사유
- 기존: 3컬럼 레이아웃 (좌측 컨트롤 / 중앙 3D / 우측 대시보드)이 고정되어, 메뉴 항목이 늘어날 수록 화면이 복잡해짐
- 변경: 좌측에 **11개 메뉴 버튼**을 배치하고, 클릭 시 우측 메인 화면이 전환되는 구조로 전환

#### 메뉴 항목 (MENU_ITEMS)
| # | ID | 이름 | 아이콘 | 기능 |
|---|-----|------|--------|------|
| 1 | search | 주소검색 | Search | 주소 검색 + 필지 선택 |
| 2 | dashboard | 프로젝트 대시보드 | LayoutDashboard | 용적률/건폐율/통계 + **과업지시서 업로드** |
| 3 | regulation | 법규분석 | Scale3d | 9섹션 법규 세부사항 전체화면 |
| 4 | site | 대지분석 | MapPin | 대지 정보 패널 |
| 5 | layout | 배치도 | PenTool | (개발 예정) |
| 6 | bubble | 버블다이어그램 | GitBranch | (개발 예정) |
| 7 | floorplan | 평면도 및 실별면적표 | Grid3X3 | (개발 예정) |
| 8 | elevation | 입면도 | Frame | (개발 예정) |
| 9 | section | 단면도 | Layers | (개발 예정) |
| 10 | 3dmass | 3D 매스 | Box | 3D 매스 모델 + 지도 (전체화면) |
| 11 | concept | 개념도 | Lightbulb | (개발 예정) |
| 12 | rendering | 컨셉이미지 | Image | (개발 예정) |

#### renderContent 로직
```typescript
switch(activeMenu) {
  case '3dmass':  → 전체화면 <SceneViewer /> + <MapPanel />
  case 'search':  → 단독 <ControlPanel />
  case 'dashboard': → 단독 <Dashboard /> (과업지시서 업로드 포함)
  case 'regulation': → 단독 <RegulationPanel />
  case 'site':      → 단독 <ControlPanel />
  default:          → 개발 예정 Placeholder
}
```

#### 수정 파일: `App.tsx`
- 기존 3컬럼 레이아웃 → 사이드바(1/7 폭) + 메인 콘텐츠(6/7 폭) 2분할 레이아웃
- `framer-motion` AnimatePresence로 화면 전환 애니메이션
- 상단 헤더바에 모듈명 + System Normal 상태 표시

---

### 2. 법규분석 독립 패널 (RegulationPanel.tsx) — 신규 생성

#### 기능
- 기존 Dashboard 안에 모달로 열리던 법규 세부사항을 **독립 전체화면 뷰**로 분리
- 9개 섹션 + 체크리스트 그대로 유지, 전체화면에서 스크롤로 확인
- 좌측 메뉴 "법규분석" 클릭 시 전체 노출

#### 수정 파일
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `components/ui/RegulationPanel.tsx` | 전체화면 법규분석 뷰 (신규) | **+705줄** |
| `App.tsx` | RegulationPanel import + 라우팅 연결 | +5줄 |

---

### 3. 과업지시서 업로드 기능 (DocumentUploader + documentParser)

#### 기능 요약
- PDF 또는 TXT 파일을 **드래그앤드롭 또는 클릭**으로 업로드
- 파일 내 텍스트에서 프로젝트 정보를 **자동 추출하여 대시보드에 반영**
- 추출 항목: 사업명, 위치, 대지면적, 연면적, 건폐율, 용적률, 높이제한, 용도지역, 주용도, 규모, 총사업비, 인증사항

#### 신규 파일
| 파일 | 기능 | 규모 |
|------|------|------|
| `services/documentParser.ts` | PDF(CDN pdf.js 동적 로드) / TXT 텍스트 추출 + 정규식 파싱 | **+145줄** |
| `components/ui/DocumentUploader.tsx` | 드래그앤드롭 UI + 로딩/성공/에러 상태 관리 | **+130줄** |

#### 파서 추출 필드 목록
```
사업명           → projectName
대지위치/위치     → address
용도지역/지역지구 → zoneType
대지면적          → landArea (㎡)
연면적            → grossFloorArea (㎡)
건폐율            → buildingCoverageLimit (%)
용적률            → floorAreaRatioLimit (%)
높이제한          → maxHeight (m)
주용도            → buildingUse
규모(지하X층,지상Y층) → totalFloors, commercialFloors, residentialFloors
총사업비/공사비    → constructionCost
인증(ZEB,BF,녹색 등) → certifications[]
```

#### PDF 처리 방식
- `pdfjs-dist` npm 패키지 대신 **CDN 동적 스크립트 로딩** 사용
- 이유: webpack 환경에서 pdfjs-dist 모듈 해석 에러 발생 → CDN 방식으로 우회
- CDN: `cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js`

#### 상태관리 수정: `projectStore.ts`
| 추가 항목 | 설명 |
|----------|------|
| `projectName: string` | 프로젝트명 (기본값: '미정 프로젝트') |
| `updateFromDocument(data)` | 파싱 결과를 store에 병합 + recalculate() 호출 |

#### Dashboard 연동: `Dashboard.tsx`
- 상단에 프로젝트명(`store.projectName`) + 주소 표시
- `<DocumentUploader />` 컴포넌트를 게이지 위에 배치
- `glass-panel`에 `overflow-visible` 적용 (42px 잘림 버그 수정)

#### 테스트 결과
업로드 전→후 변화 확인:
```
프로젝트명: 미정 프로젝트 → 김해제2특수학교
주소: 서울특별시 강남구 역삼동 → 경상남도 김해시 삼계동
연면적: 825㎡ → 35,000㎡
주차대수: 14대 → 584대
```

---

### 4. 쓰레기 파일 정리

루트 디렉토리에 이전 디버깅 과정에서 생성된 불필요한 파일들을 삭제:
```
삭제된 파일:
  {                              ← 잘못된 파일명
  {fs.copyFileSync(p.join(b      ← 잘못된 파일명
  console.log(r.status            ← 잘못된 파일명
  debug_copy.js                   ← 디버깅용 스크립트
  test.js                         ← 일회성 테스트
  test.py                         ← 일회성 테스트
  vworld_test.js                  ← API 테스트
  copy.js                         ← 파일 복사 스크립트
```

---

### 5. 인프라 개선 시도 → 중단 (다음 세션에서 진행)

#### 문제 인식
- 소스 편집(`frontend\src`) → 배포(`deploy.bat`) → `C:\dev\flexity-frontend`로 복사 → HMR 반영
- 이 과정이 매 수정마다 30초~1분 소요 → 개발 속도 저하

#### 시도한 개선
1. **frontend 폴더에서 직접 dev 서버 실행** 시도
   - webpack 설정(port 3000, 프록시 등) 동일하게 존재
   - **실패 원인**: 한글 경로(`건축기획설계+국내법규`)에서 webpack이 빌드 자체를 시작하지 않음
   - node 프로세스 19개가 좀비로 남아있는 것도 발견 → 모두 kill

2. **폴더명 변경** 시도 (`260226_건축기획설계+국내법규` → `260226_haema_arch`)
   - VS Code가 폴더를 점유하고 있어 rename 실패
   - **→ 사용자가 수동으로 폴더명 변경 후 다음 세션에서 이어서 진행 예정**

---

### 수정/생성된 파일 총괄 (2026-03-02 오후)

| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `App.tsx` | 좌측 사이드바 메뉴 + 라우팅 전면 재구성, RegulationPanel 연동 | **전면 재작성** |
| `components/ui/RegulationPanel.tsx` | 법규분석 전체화면 독립 패널 (신규) | **+705줄** |
| `components/ui/Dashboard.tsx` | 프로젝트명 표시, DocumentUploader 삽입, overflow 수정 | ~30줄 |
| `components/ui/DocumentUploader.tsx` | 과업지시서 업로드 UI 컴포넌트 (신규) | **+130줄** |
| `services/documentParser.ts` | PDF/TXT 파서 (CDN pdf.js) (신규) | **+145줄** |
| `store/projectStore.ts` | projectName 필드, updateFromDocument() 액션 추가 | +15줄 |
| `deploy.bat` | documentParser.ts, DocumentUploader.tsx 복사 추가 | +2줄 |
| `sample_task_directive.txt` | 테스트용 과업지시서 샘플 (신규) | 30줄 |

---

## 📊 전체 진행 상황 (업데이트: 2026-03-02 17:30)

| Step | 내용 | 상태 |
|------|------|------|
| Step 1 | Base UI & 3D 환경 구축 | ✅ 완료 |
| Step 2 | 지도 & 지적도 연동 (카카오/Vworld API) | ✅ 완료 |
| Step 2.5 | 법규 엔진 기초 + 법규 팝업 9섹션 | ✅ 완료 |
| Phase 1-B | Build-line 산출 (2D Offset → 3D) | ✅ 완료 |
| Phase 1-C | Max Envelope 3D (Boolean 절단) | ✅ 완료 |
| **UI 리스트럭처링** | **11개 메뉴 사이드바 + 라우팅** | ✅ **완료** (2026-03-02) |
| **법규분석 패널** | **RegulationPanel.tsx 독립 뷰** | ✅ **완료** (2026-03-02) |
| **과업지시서 업로드** | **PDF/TXT 파싱 → 대시보드 자동 입력** | ✅ **완료** (2026-03-02) |
| **인프라 개선** | **한글 경로 → 영문 경로 변경** | 🔶 **진행 중** (폴더명 수동 변경 필요) |
| Phase 1-A | 대지정보 수집 강화 | 🔶 부분완료 |
| Phase 1-D | 환경 시뮬레이션 (일조/바람/소음/조망) | ⬜ 예정 |
| Phase 1-E | 제너레이티브 배치 (GA 엔진) | ⬜ 예정 |
| Phase 1-F | 사업성 실시간 연동 (ROI/IRR) | ⬜ 예정 |
| Phase 2 | 평면도 자동 생성 | ⬜ 예정 |
| Phase 3 | 입면·단면·3D 매스 | ⬜ 예정 |
| Phase 4 | 컨셉 시각화 | ⬜ 예정 |
| Phase 5 | 면적표·실 구성 | ⬜ 예정 |

### 다음 세션 우선 작업
> 1. **폴더명 변경** (`260226_haema_arch`) 후 frontend 직접 dev 서버 실행 확인
> 2. **Docker Compose 설정** 완성
> 3. Phase 1-D 또는 Phase 1-E 진행

---

## 🛠️ 기술 스택 (확정, 2026-03-02 업데이트)

| 분류 | 기술 | 비고 |
|------|------|------|
| Frontend | Webpack 5 + React 18 + TypeScript | 네이티브 바이너리 의존 없음 |
| 3D Engine | Three.js (@react-three/fiber, drei) | WebGL 기반 |
| State | Zustand | 경량 상태 관리 |
| Animation | Framer Motion | UI 애니메이션 |
| Icons | Lucide React | 아이콘 세트 |
| Styling | Tailwind CSS 3 + PostCSS | 다크 글래스모피즘 테마 |
| Font | Pretendard Variable | 한글 최적화 |
| Map | Leaflet + React-Leaflet | 2D 지적도 |
| PDF Parser | pdf.js (CDN 동적 로딩) | 클라이언트 사이드 PDF 텍스트 추출 |
| Geometry | 자체 구현 (offsetPolygon 등) | 2D 기하연산 (Phase 1-C) |
| Backend (Step 2) | FastAPI (Python) | GIS 서비스 구축 완료 |
| Container | Docker Compose | 7개 서비스 오케스트레이션 (예정) |
| 배포 | deploy.bat → C:\dev\flexity-frontend | HMR 자동 반영 (→ 직접 실행 전환 예정) |
| 향후 AI | DEAP(GA), PyTorch(GAN/RL), GPT-4/Gemini | 배치 최적화 + 대화형 |
| 향후 렌더링 | Stable Diffusion + ControlNet | 컨셉 시각화 |
| 향후 Export | jsPDF, SheetJS, DXF-writer | 도면/리포트 출력 |

---

## ✅ 완료된 작업: 대시보드 2단 레이아웃 + AI 기반 과업지시서 분석 고도화 (2026-03-02 저녁)

### 2026-03-02 저녁 작업 내용 (18:00 ~ 21:50)

이전 세션의 과업지시서 업로드·파싱 기능을 대폭 개선하고, 대시보드 레이아웃을 전면 재구성함.
크게 **4가지 핵심 작업** 수행:

---

### 1. 대시보드(Dashboard.tsx) 2단 레이아웃 전면 재구성

#### 변경 사유
- 기존: 단일 컬럼에 카드가 세로로 나열 → 스크롤이 길고 정보 파악이 어려움
- 주소 검색 결과가 과업지시서 업로드 카드 하단에 가려져 확인 불가
- 사용자 요청: "대시보드 콘텐츠를 모두 2단으로 배치하자"

#### 새 레이아웃 구조 (5행 × 2열)

| 행 | 좌측 | 우측 |
|----|------|------|
| 1 | 주소 검색 | 과업지시서 업로드 |
| 2 | 과업 개요 | 면적 및 규모 |
| 3 | 사업비 & 인증 | 기타 사항 |
| 4 | 일반지침 | 설계지침 |
| 5 | 성과품 작성 및 납품 | 주요 확인사항 |

#### 주요 개선사항
- `grid grid-cols-1 lg:grid-cols-2` 기반 반응형 2단 배치
- 카카오 주소 검색 드롭다운 z-index 문제 해결 (카드 내부 절대위치로 전환)
- `SectionCard`, `BulletList` 재사용 컴포넌트 신규 작성
- 과업지시서 미업로드 시 안내 문구 표시, 업로드 후 조건부 렌더링
- 마이크로서비스 상태 표시바 하단 배치

#### 수정 파일: `Dashboard.tsx` — **전면 재작성 (약 310줄)**

---

### 2. 과업지시서 파서(documentParser.ts) AI 수준 고도화

#### 핵심 원칙 (사용자 요구)
> "pdf 과업 지시서를 매우 꼼꼼하게 읽고 분석한 후,
> 설계자에게 직접적으로 도움이 될 사항 또는 특별히 주의하여야 할 사항을 기재한다."

#### 이전 문제
- 단순 목차/제목(예: "공통사항", "일반사항", "제 3 장 일반 지침")이 그대로 추출됨
- 설계자에게 실질적으로 도움이 되지 않는 내용이 표시됨
- 파편화된 텍스트 조각이 의미 없이 나열됨

#### 해결: `isDesignerRelevant()` 필터 함수 도입

```typescript
function isDesignerRelevant(line: string): boolean {
    // 제외: 6자 미만, 순수 목차/제목, 단순 카테고리명
    // 포함 우선: 구체적 수치(m, ㎡, %, 층), 행위 지시(설계, 적용, 준수, 필수, 금지)
    // 포함 우선: 법규/인증 관련 키워드
    // 포함: 15자 이상의 구체적 문장
}
```

#### 추출 품질 비교 (Before → After)

**설계지침:**
| Before (단순 목차) | After (AI 핵심 분석) |
|---|---|
| "건축분야 설계 포함" | **특수학교 특성상 휠체어 이동 원활한 복도폭 2.4m 이상 확보** |
| "구조분야 설계 포함 (내진설계 적용)" | **교실 면적 기준: 일반교실 66㎡ 이상, 특별교실 99㎡ 이상** |
| "토목분야 설계 포함" | **내진설계 적용 (내진 I등급, 중요도계수 1.5)** |

**일반지침:**
| Before | After |
|---|---|
| "공통사항" | **건축물 에너지 소비 최소화를 위한 패시브 설계 기법 적용** |
| "일반사항" | **화재 시 특수교육 학생의 안전한 피난을 위한 수평피난 계획 수립** |

**주요 확인사항:**
| Before | After |
|---|---|
| "제 3 장 일반 지침" | **장애인등편의법 및 편의증진법 적용 필수** |
| "설립부지 현황" | **소방시설법 적용 (방화구획, 피난시설 계획)** |

#### 파서 신규 추출 필드 (6개)

```
generalGuidelines[]   ← 일반지침 (설계 시 주의사항)
designGuidelines[]    ← 설계지침 (분야별 핵심 요구사항)
deliverables[]        ← 성과품 작성 및 납품
keyNotes[]            ← 주요 확인사항 (법규, 특기사항)
facilityList[]        ← 시설 구성 (교실, 체육관 등)
designDirection[]     ← 설계 방향 (프로젝트 고유 요구)
```

#### 인증 추출 개선
- ZEB 등급(3등급 등) 정확 추출
- 에너지효율 등급 추출
- CPTED 명칭 포함

#### 용적률 파싱 개선
- `"200% 이하"` 패턴 지원 (`이하` 키워드 앞/뒤 숫자 모두 처리)
- 대안 패턴: `용적률` 뒤 가장 가까운 `숫자%` 검색

#### 부지면적 우선 추출
- `부지면적`을 `대지면적`보다 우선 검색 (과업지시서에서 실제 개발 면적)

#### 수정 파일: `documentParser.ts` — **전면 재작성 (약 330줄)**

---

### 3. loadRealParcel 데이터 우선순위 수정 (projectStore.ts)

#### 문제
- 과업지시서에서 부지면적 `10,623㎡`로 설정된 후, 주소 검색으로 3D 뷰 전환 시 지도 API에서 받은 `34,353㎡`(필지 전체면적)로 덮어씌워짐
- 용적률, 건폐율 등도 동일하게 재계산으로 덮어씌워지는 문제

#### 원인
- `loadRealParcel()`에서 `set({ landArea: parcel.area })` 가 무조건 실행
- 과업지시서 데이터의 존재 여부를 확인하지 않음

#### 해결 (hasDocument 분기 추가)

```typescript
loadRealParcel: async (kakaoResult) => {
    const hasDocument = !!get().documentInfo;
    // ...
    if (hasDocument) {
        // 과업지시서 있으면: 폴리곤/좌표만 갱신
        // landArea, address, zoneType 등은 과업지시서 값 보존
        mapUpdate.pnu = kakaoResult.address?.b_code || '';
    } else {
        // 과업지시서 없으면: 모든 데이터를 지도에서 가져오기
        mapUpdate.address = kakaoResult.address_name;
        mapUpdate.landArea = parcel.area;
    }
}
```

#### 수정 파일: `projectStore.ts` — loadRealParcel 함수 (~45줄 수정)

---

### 4. DocumentUploader compact 모드 + projectStore 필드 확장

#### DocumentUploader.tsx
- `compact` prop 추가 — 2단 레이아웃 내부에 임베딩 시 외부 glass-panel 제거, 패딩 축소

#### projectStore.ts
- `ProjectState` 인터페이스에 6개 필드 추가:
  ```
  generalGuidelines, designGuidelines, deliverables,
  keyNotes, facilityList, designDirection
  ```
- `updateFromDocument()` 액션에서 6개 필드 매핑 추가
- `regulationCalculate()`에서 과업지시서 값 우선 보존 (totalFloors, grossFloorArea)

---

### 수정/생성된 파일 총괄 (2026-03-02 저녁)

| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `components/ui/Dashboard.tsx` | 2단 레이아웃 전면 재구성, SectionCard/BulletList 신규, 5행×2열 | **전면 재작성 (~310줄)** |
| `services/documentParser.ts` | AI 수준 핵심 추출, isDesignerRelevant(), 용적률/부지면적 개선 | **전면 재작성 (~330줄)** |
| `store/projectStore.ts` | loadRealParcel 과업지시서 우선, 6개 세부 필드, updateFromDocument 확장 | **~80줄 수정** |
| `components/ui/DocumentUploader.tsx` | compact prop 추가 | ~10줄 |

### 검증 결과 (브라우저 테스트)

| 검증 항목 | 결과 |
|----------|------|
| 대지면적 과업지시서 우선 (10,623㎡) | ✅ PASS |
| 용적률 정확 표시 (200%) | ✅ PASS |
| 일반지침 핵심 내용만 추출 | ✅ PASS |
| 설계지침 구체적 수치 포함 (2.4m, 66㎡, I등급) | ✅ PASS |
| 주요 확인사항 법규 중심 (장애인편의법, 소방법) | ✅ PASS |
| 2단 레이아웃 정상 표시 | ✅ PASS |
| 스크롤바 정상 작동 | ✅ PASS |

---

## 📊 전체 진행 상황 (업데이트: 2026-03-02 21:50)

| Step | 내용 | 상태 |
|------|------|------|
| Step 1 | Base UI & 3D 환경 구축 | ✅ 완료 |
| Step 2 | 지도 & 지적도 연동 (카카오/Vworld API) | ✅ 완료 |
| Step 2.5 | 법규 엔진 기초 + 법규 팝업 9섹션 | ✅ 완료 |
| Phase 1-B | Build-line 산출 (2D Offset → 3D) | ✅ 완료 |
| Phase 1-C | Max Envelope 3D (Boolean 절단) | ✅ 완료 |
| UI 리스트럭처링 | 11개 메뉴 사이드바 + 라우팅 | ✅ 완료 |
| 법규분석 패널 | RegulationPanel.tsx 독립 뷰 | ✅ 완료 |
| 과업지시서 업로드 | PDF/TXT 파싱 → 대시보드 자동 입력 | ✅ 완료 |
| **대시보드 2단 레이아웃** | **5행×2열, 주소검색+세부지침 통합** | ✅ **완료** (2026-03-02 저녁) |
| **AI 과업지시서 분석** | **설계자 핵심 정보 추출, 데이터 우선순위** | ✅ **완료** (2026-03-02 저녁) |
| 인프라 개선 | 한글→영문 경로 전환, 직접 실행 | ✅ 완료 |
| Phase 1-A | 대지정보 수집 강화 | 🔶 부분완료 |
| Phase 1-D | 환경 시뮬레이션 (일조/바람/소음/조망) | ⬜ 예정 |
| Phase 1-E | 제너레이티브 배치 (GA 엔진) | ⬜ 예정 |
| Phase 1-F | 사업성 실시간 연동 (ROI/IRR) | ⬜ 예정 |
| Phase 2 | 평면도 자동 생성 | ⬜ 예정 |
| Phase 3 | 입면·단면·3D 매스 | ⬜ 예정 |
| Phase 4 | 컨셉 시각화 | ⬜ 예정 |
| Phase 5 | 면적표·실 구성 | ⬜ 예정 |

---

## ✅ 완료된 작업: Gemini 법규분석 서비스 + 대지분석 + 3D 매스 + 배포 (2026-03-03)

### 2026-03-03 전일 작업 내용 (종일)

오늘은 **6개 핵심 영역**의 대규모 작업을 수행:
1. Gemini AI 기반 법규분석 서비스 신규 구현
2. 법규분석 페이지 UI 전면 재구성 (2단 레이아웃 + 카드)
3. Gemini AI 기반 대지분석 서비스 신규 구현
4. 3D 매스 모듈 개선 (나침반, 주변건물 API, 주소검색바)
5. Git 초기화 + GitHub 푸시 + Vercel 프로덕션 배포
6. API 키 유출 사고 대응 + 환경변수 방식 전환

---

### 1. Gemini AI 법규분석 서비스 (regulationAnalysisService.ts) — 신규 생성

#### 핵심 기능
- 과업지시서에서 추출한 프로젝트 기본정보를 Gemini AI(`gemini-2.5-flash-lite`)에 전달
- 7대 카테고리 30+ 법규를 **자동 분석**하여 리스크 등급별 카드로 표시
- "교육연구시설(특수학교)" 프로젝트 컨텍스트를 완벽 반영

#### 7대 카테고리
| # | 카테고리 | 주요 법규 | 아이콘 |
|---|---------|----------|--------|
| B1 | 입지 및 도시계획 | 국토계획법, 도로법, 문화재보호법 | 🏛️ |
| B2 | 기능 및 교통 | 주차장법, 도시교통정비촉진법 | 🚗 |
| B3 | 안전 및 방재 | 소방시설법, 지진화산재해대책법 | 🔥 |
| B4 | 복지 및 보건 | 장애인등편의법, 영유아보육법 | ♿ |
| B5 | 환경 및 에너지 | 녹색건축물법, 환경영향평가법 | 🌿 |
| B6 | 기반시설 및 기술 | 하수도법, 신재생에너지법 | ⚡ |
| B7 | 기타 특수 법규 | 교육환경보호법, 건축물관리법 | 📋 |

#### Gemini 프롬프트 설계
```
20년차 건축사 수준의 전문성으로 분석:
- 프로젝트 조건에 맞는 구체적 기준/수치 명시
- 리스크 등급: required(필수) / review(검토) / info(참고)
- 각 항목 1~2줄 불릿 스타일, 구체적 수치 포함
- 과업지시서 원문 참조 (최대 3000자)
```

#### 수정 파일
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `services/regulationAnalysisService.ts` | Gemini 법규분석 프롬프트 + API 호출 (신규) | **+281줄** |

---

### 2. 법규분석 페이지 UI 전면 재구성 (RegulationPanel.tsx v2)

#### 변경 사유
- 기존 RegulationPanel.tsx는 하드코딩된 정적 법규 테이블 (705줄)
- 사용자 요청: Gemini AI 분석 결과를 동적으로 표시 + 2단 카드 레이아웃

#### 새 구조
```
법규분석 페이지
├── 상단: 프로젝트 기본정보 패널 (과업지시서 연동)
│   ├── 사업명, 대지위치, 건폐율/용적률, 면적
│   └── "AI 법규 종합 분석 시작" 버튼
├── 중앙: 7대 카테고리 분석 결과 (2단 카드 레이아웃)
│   ├── 카테고리별 접이식 카드 (Accordion)
│   ├── 법규별 리스크 등급 색상 표시 (🔴/🟡/🔵)
│   └── 핵심 수치 하이라이트
└── 하단: 요약 대시보드 (필수/검토/참고 건수)
```

#### 용도 오류 수정
- **기존**: 건축물 용도가 "오피스텔"로 하드코딩되어 있었음
- **수정**: 과업지시서에서 추출한 "교육연구시설(특수학교)"로 동적 표시
- Store의 `buildingUse` 필드를 참조하도록 변경

#### 콘텐츠 양 대폭 증가
- 기존: 정적 법규 테이블 4~9개 섹션
- 변경: Gemini AI가 30+ 법규를 동적 분석, 각 항목 상세 불릿 제공
- "법규 재분석" 버튼으로 콘텐츠 보강 가능

#### 2단 카드 레이아웃
- `grid grid-cols-1 md:grid-cols-2` 반응형 2단 배치
- 기존 1단 구성에서 공간 활용도 대폭 개선

#### 수정 파일
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `components/ui/RegulationPanel.tsx` | 전면 재작성 — Gemini 연동 + 2단 카드 UI | **전면 재작성** |

---

### 3. Gemini AI 대지분석 서비스 (siteAnalysisService.ts) — 신규 생성

#### 핵심 기능
- 과업지시서 + 법규분석 결과를 기반으로 5대 영역 종합 대지분석 수행
- Gemini AI가 구체적 수치와 설계 전략을 도출

#### 5대 분석 영역
| # | 영역 | 아이콘 | 주요 분석 항목 |
|---|------|--------|--------------|
| S1 | 물리적·기하학적 환경 | 🏔️ | 대지형상, 경사도, 건축가능영역, 절성토 |
| S2 | 미기후 및 환경 성능 | ☀️ | 일조, 풍향, 소음, 정온환경 배치 |
| S3 | 인프라 및 교통 접근성 | 🚗 | 진출입, 스쿨존, BF 동선, 인입점 |
| S4 | 인문·사회적 맥락 | 🏘️ | 조망, 지역 거점, 유사 사례 참고 |
| S5 | 종합 분석 및 디자인 전략 | 🎯 | SWOT, 매스 배치, 인증 체크리스트 |

#### 신규 타입 정의
```typescript
interface SiteAnalysisResult {
    sections: AnalysisSection[];       // 5대 영역 분석 결과
    swot: SwotItem[];                  // SWOT 분석
    designStrategies: DesignStrategy[]; // 디자인 전략 제안
    massRecommendations: string[];     // 매스 배치 추천
    certChecklist: string[];           // 인증 체크리스트
    analyzedAt: string;
}
```

#### 대지분석 페이지 UI (SiteAnalysisPanel — App.tsx 내장)
- 상단: 프로젝트 기본정보 + "AI 대지분석 시작" 버튼
- 중앙: 5대 영역 분석 결과 카드 (2단 레이아웃)
- 각 영역별 중요도 색상 표시 (critical/high/medium/low)
- SWOT 분석 4분할 테이블
- 디자인 전략 우선순위 리스트

#### 수정 파일
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `services/siteAnalysisService.ts` | Gemini 대지분석 프롬프트 + API 호출 (신규) | **+264줄** |
| `App.tsx` | 대지분석 renderContent 케이스 + SiteAnalysis UI 코드 | **+200줄** |

---

### 4. 3D 매스 모듈 개선

#### 4-1. 좌측 메뉴 순서 수정
- 3D 매스 메뉴를 좌측 사이드바 하단에서 → **대지분석 바로 다음**으로 이동
- MENU_ITEMS 배열 순서 재배치

#### 4-2. 주변 건물 API 연동 (fetchSurroundingBuildings)
- `gisApi.ts`에 `fetchSurroundingBuildings()` 함수 추가
- 카카오 API (카테고리 검색 + 키워드 검색) 500m 반경 내 실제 주변 건물 데이터 취득
- `projectStore.ts`에 `realSurroundingBuildings` 상태 추가
- `SceneViewer.tsx`에서 Mock 건물 대신 실제 건물 데이터 우선 사용

#### 4-3. 나침반(Compass) 표시 수정
- 기존 `@react-three/drei Text` 컴포넌트가 렌더링 안 되는 문제
- `@react-three/drei Html` 컴포넌트로 교체하여 CSS 기반 렌더링
- 'N' 라벨 빨간색으로 강조 표시

#### 4-4. 헤더 주소검색바 통합
- 기존 과업지시서 분석 페이지에만 있던 주소검색 기능을 **3D 매스 헤더**로 이동
- `MassAddressSearch` 컴포넌트 신규 생성
- 공통 헤더에서 `activeMenu === '3dmass'` 조건으로 검색바 표시
- 헤더 높이 80px → 60px 축소, 콘텐츠 영역 `calc(100vh - 60px)` 조정
- 3D 매스 뷰 내부의 중복 헤더 제거

#### 수정 파일
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `App.tsx` | 메뉴 순서 변경, 헤더 주소검색바, 높이 조정, 중복 헤더 제거 | ~60줄 |
| `services/gisApi.ts` | fetchSurroundingBuildings() 함수 추가 | +50줄 |
| `store/projectStore.ts` | realSurroundingBuildings 상태 + loadRealParcel에서 자동 호출 | +20줄 |
| `components/three/SceneViewer.tsx` | 나침반 Html 교체, 실제 건물 데이터 우선 표시 | ~30줄 |

---

### 5. Git 초기화 + GitHub 푸시 + Vercel 프로덕션 배포

#### Git 초기화
- `git init` → `.gitignore` 생성 (node_modules, .env, dist, IDE 파일 등 제외)
- 루트에 잔존하던 잘못된 파일명 (`frontend/{if(dd.file){const{line}`) 삭제
- `git add -A` → 초기 커밋 생성
- `git branch -M main` → 기본 브랜치 이름을 `main`으로 변경
- `git remote add origin https://github.com/bignine99/haema_archi_01.git`
- `git push -u origin main` → GitHub 리포지토리에 푸시 성공

#### Vercel 배포 설정
- `vercel.json` 신규 생성:
  ```json
  {
    "buildCommand": "cd frontend && npm install && npm run build",
    "installCommand": "cd frontend && npm install",
    "outputDirectory": "frontend/dist",
    "rewrites": [
      { "source": "/kakao-api/:path*", "destination": "https://dapi.kakao.com/:path*" },
      { "source": "/vworld-api/:path*", "destination": "http://api.vworld.kr/:path*" }
    ]
  }
  ```
- `npx -y vercel --prod --yes` → 프로덕션 배포 성공
- 배포 URL: `https://260226haemaarch.vercel.app`
- 과업지시서 분석: 정상 작동 확인
- 법규분석: **에러 발생** → API 키 유출 문제 발견

#### 수정/생성 파일
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `.gitignore` | Git 제외 파일 설정 (node_modules, .env 등) | 신규 31줄 |
| `vercel.json` | Vercel 배포 설정 (빌드, API 리라이트) | 신규 21줄 |

---

### 6. 🚨 API 키 유출 사고 + 환경변수 방식 전환 (보안 수정)

#### 사고 경위
1. GitHub **Public** 리포지토리에 Gemini/카카오/Vworld API 키가 하드코딩된 상태로 푸시
2. Google의 자동 보안 스캐너가 Gemini API 키를 감지 → **즉시 차단** (403 Forbidden)
3. 에러 메시지: `"Your API key was reported as leaked. Please use another API key."`
4. 카카오/Vworld 키는 자동 차단 시스템이 없어 정상 작동 중

#### 영향 범위
| API | 키 | 차단 여부 | 다른 프로그램 영향 |
|-----|---|----------|-----------------|
| 🔴 Gemini | `AIzaSyAkuPhA6...` (구 키) | **차단됨** | 이 키 사용하는 20+ 프로그램 모두 영향 |
| 🟢 카카오 REST | `72de5cd3...` | 정상 | 영향 없음 |
| 🟢 Vworld | `B8385331...` | 정상 | 영향 없음 |

#### 해결 조치
1. **새 Gemini API 키 발급**: `AIzaSyBpjTpY-pvfpbUovwKES2WGD7ejDu02bKk`
2. **모든 하드코딩 API 키 제거** → `process.env` 환경변수로 교체
3. **`webpack.config.js`에 `webpack.DefinePlugin` 추가** — .env → 빌드 시 주입
4. **로컬 `frontend/.env` 파일 생성** (Git에 포함되지 않음)
5. **Vercel 대시보드에 3개 환경변수 등록** (GEMINI, KAKAO, VWORLD)
6. **재배포 성공** — `260226haemaarch.vercel.app` Ready 상태

#### 수정된 파일 상세
| 파일 | 변경 내용 | 규모 |
|------|----------|------|
| `frontend/webpack.config.js` | `webpack.DefinePlugin` 추가 — .env → process.env 주입 | 전면 재작성 (~90줄) |
| `frontend/.env` | 실제 API 키 저장 (Git 미포함) | 신규 4줄 |
| `.gitignore` | `frontend/.env`, `frontend/.env.local` 추가 | 2줄 추가 |
| `frontend/src/services/geminiService.ts` | `process.env.GEMINI_API_KEY` 교체 | 1줄 |
| `frontend/src/services/regulationAnalysisService.ts` | `process.env.GEMINI_API_KEY` 교체 | 1줄 |
| `frontend/src/services/siteAnalysisService.ts` | `process.env.GEMINI_API_KEY` 교체 | 1줄 |
| `frontend/src/services/gisApi.ts` | `process.env.KAKAO_REST_KEY`, `process.env.VWORLD_API_KEY` 교체 | 2줄 |
| `frontend/src/components/ui/MapPanel.tsx` | `process.env.VWORLD_API_KEY` 교체 | 1줄 |
| `services/gis-service/main.py` | `os.getenv()` 기본값에서 키 제거 | 2줄 |
| `docker-compose.yml` | 환경변수 기본값에서 키 제거 | 2줄 |

#### Git 커밋 이력
| 시각 | 커밋 해시 | 메시지 |
|------|----------|--------|
| ~20:45 | `8731bf7` | `feat: HAEMA ARCHI AI Architecture Platform - Initial Release` |
| ~21:35 | `2b05436` | `security: Remove all hardcoded API keys, use environment variables via webpack.DefinePlugin` |

#### Vercel 배포 이력
| 시각 | 상태 | URL |
|------|------|-----|
| ~21:00 | ✅ Ready (초기 배포) | `260226haemaarch-bn6k5dajc-danny-chos-projects.vercel.app` |
| ~21:40 | ✅ Ready (보안 수정) | `260226haemaarch.vercel.app` |

---

### 수정/생성된 파일 총괄 (2026-03-03 전일)

| 파일 | 변경 내용 | 변경 규모 |
|------|----------|----------|
| `services/regulationAnalysisService.ts` | Gemini 법규분석 프롬프트 + API (신규) | **+281줄** |
| `services/siteAnalysisService.ts` | Gemini 대지분석 5대영역 + API (신규) | **+264줄** |
| `services/gisApi.ts` | fetchSurroundingBuildings + 환경변수 교체 | +50줄 |
| `services/geminiService.ts` | 환경변수 교체 | 1줄 |
| `components/ui/RegulationPanel.tsx` | Gemini 연동 법규분석 2단 카드 UI | **전면 재작성** |
| `components/three/SceneViewer.tsx` | 나침반 Html 교체, 실제 건물 우선 | ~30줄 |
| `components/ui/MapPanel.tsx` | 환경변수 교체 | 1줄 |
| `App.tsx` | 대지분석 UI, 메뉴 순서, 헤더 검색바, 높이 조정 | ~260줄 |
| `store/projectStore.ts` | realSurroundingBuildings 상태 추가 | +20줄 |
| `frontend/webpack.config.js` | DefinePlugin + .env 로딩 | **전면 재작성 (~90줄)** |
| `frontend/.env` | API 키 저장 (Git 미포함) | 신규 4줄 |
| `.gitignore` | .env 보호 + frontend/.env 추가 | ~35줄 |
| `vercel.json` | Vercel 배포 설정 | 신규 21줄 |
| `docker-compose.yml` | 환경변수 기본값 제거 | 2줄 |
| `services/gis-service/main.py` | 환경변수 기본값 제거 | 2줄 |

---

## 📊 전체 진행 상황 (업데이트: 2026-03-03 21:50)

| Step | 내용 | 상태 |
|------|------|------|
| Step 1 | Base UI & 3D 환경 구축 | ✅ 완료 |
| Step 2 | 지도 & 지적도 연동 (카카오/Vworld API) | ✅ 완료 |
| Step 2.5 | 법규 엔진 기초 + 법규 팝업 9섹션 | ✅ 완료 |
| Phase 1-B | Build-line 산출 (2D Offset → 3D) | ✅ 완료 |
| Phase 1-C | Max Envelope 3D (Boolean 절단) | ✅ 완료 |
| UI 리스트럭처링 | 11개 메뉴 사이드바 + 라우팅 | ✅ 완료 |
| 과업지시서 업로드 | PDF/TXT 파싱 → 대시보드 자동 입력 | ✅ 완료 |
| 대시보드 2단 레이아웃 | 5행×2열, 주소검색+세부지침 통합 | ✅ 완료 |
| AI 과업지시서 분석 | 설계자 핵심 정보 추출, 데이터 우선순위 | ✅ 완료 |
| 인프라 개선 | 한글→영문 경로 전환, 직접 실행 | ✅ 완료 |
| **Gemini 법규분석 서비스** | **7대 카테고리 30+ 법규 AI 자동 분석** | ✅ **완료** (2026-03-03) |
| **법규분석 UI v2** | **Gemini 연동 + 2단 카드 + 리스크 등급** | ✅ **완료** (2026-03-03) |
| **Gemini 대지분석 서비스** | **5대 영역 종합 분석 + SWOT + 디자인 전략** | ✅ **완료** (2026-03-03) |
| **3D 매스 모듈 개선** | **나침반, 주변건물 API, 헤더 주소검색** | ✅ **완료** (2026-03-03) |
| **Git + Vercel 배포** | **GitHub 푸시 + Vercel 프로덕션 배포** | ✅ **완료** (2026-03-03) |
| **API 키 보안 수정** | **환경변수 전환 + Vercel 환경변수 등록** | ✅ **완료** (2026-03-03) |
| Phase 1-A | 대지정보 수집 강화 | 🔶 부분완료 |
| Phase 1-D | 환경 시뮬레이션 (일조/바람/소음/조망) | ⬜ 예정 |
| Phase 1-E | 제너레이티브 배치 (GA 엔진) | ⬜ 예정 |
| Phase 1-F | 사업성 실시간 연동 (ROI/IRR) | ⬜ 예정 |
| Phase 2 | 평면도 자동 생성 | ⬜ 예정 |
| Phase 3 | 입면·단면·3D 매스 | ⬜ 예정 |
| Phase 4 | 컨셉 시각화 | ⬜ 예정 |
| Phase 5 | 면적표·실 구성 | ⬜ 예정 |

---

## 🛠️ 기술 스택 (확정, 2026-03-03 업데이트)

| 분류 | 기술 | 비고 |
|------|------|------|
| Frontend | Webpack 5 + React 18 + TypeScript | 네이티브 바이너리 의존 없음 |
| 3D Engine | Three.js (@react-three/fiber, drei) | WebGL 기반 |
| State | Zustand | 경량 상태 관리 |
| Animation | Framer Motion | UI 애니메이션 |
| Icons | Lucide React | 아이콘 세트 |
| Styling | Tailwind CSS 3 + PostCSS | 다크 글래스모피즘 테마 |
| Font | Pretendard Variable | 한글 최적화 |
| Map | Leaflet + React-Leaflet | 2D 지적도 |
| PDF Parser | pdf.js (CDN 동적 로딩) | 클라이언트 사이드 PDF 텍스트 추출 |
| Geometry | 자체 구현 (offsetPolygon 등) | 2D 기하연산 (Phase 1-C) |
| **AI 분석** | **Gemini 2.5 Flash Lite** | **법규분석 + 대지분석 + 과업지시서** |
| **API 키 관리** | **webpack DefinePlugin + .env** | **환경변수 방식 (Git 미포함)** |
| GIS API | 카카오 REST + Vworld | 주소검색 + 필지 + 지도타일 |
| Backend (Step 2) | FastAPI (Python) | GIS 서비스 구축 완료 |
| Container | Docker Compose | 7개 서비스 오케스트레이션 (예정) |
| **배포** | **Vercel (프로덕션)** | **`260226haemaarch.vercel.app`** |
| **VCS** | **Git + GitHub** | **`bignine99/haema_archi_01` (Public)** |
| 향후 AI | DEAP(GA), PyTorch(GAN/RL) | 배치 최적화 |
| 향후 렌더링 | Stable Diffusion + ControlNet | 컨셉 시각화 |
| 향후 Export | jsPDF, SheetJS, DXF-writer | 도면/리포트 출력 |

---

## ✅ 완료된 작업: 3D 매스 VWorld 위성지도 렌더링 확인 및 CORS 해결 (2026-03-04)

### 2026-03-04 주요 수정 프로세스

#### 1. VWorld API 위성지도(PHOTO) 텍스처 렌더링 오류 해결
- 기존에 위성지도가 렌더링되지 않고 회색/흰색 평면으로 나오던 문제를 해결함.
- `THREE.TextureLoader`로 텍스처를 불러온 후, WebGL GPU 업로드를 강제로 실행시키기 위해 `tex.needsUpdate = true` 코드를 명시적으로 추가함.
- 카메라 시점 변화에도 지면에 텍스처가 정상 렌더링 되도록 플레인 매테리얼에 `side={THREE.DoubleSide}` 속성 적용.
- 3D 씬 내의 조명 계산에 의해 텍스처가 하얗게 타버리는(blow-out) 이슈를 방지하기 위해 `meshStandardMaterial`에서 조명에 영향을 받지 않는 `meshBasicMaterial`로 재질을 변경함.

#### 2. CORS(Cross-Origin Resource Sharing) 이슈 완벽 해결
- 로컬 웹팩(Webpack) 프록시(`webpack.config.js`) 설정의 `/vworld-api` 엔드포인트에 `Access-Control-Allow-Origin: '*'` 헤더를 강제로 주입하도록 `onProxyRes` 이벤트를 삽입.
- `SceneViewer.tsx`의 `TextureLoader`에 `loader.setCrossOrigin('anonymous')` 설정을 부여해 WebGL에서 타일맵 이미지 크로스도메인 오류를 무시하도록 처리.

#### 3. 통신 검증용 사이드 스크립트 작성 (디버깅 과정)
- `test_png.js`, `test_png_full.js`, `test_proxy.js`, `test_basemaps.js`, `photo_test.js` 등 다수의 Node.js 기반 검증 스크립트를 생성하여 VWorld API 이미지 수신 상태의 바이트(Byte) 크기, HTTP 상태 코드 및 Hex 헤더를 터미널에서 1차 검증함.
- `Puppeteer`를 활용한 브라우저 디버깅 스크립트(`test_puppeteer.js`)를 작성해 컴포넌트 생명주기 내 발생하는 네트워크 요청과 콘솔 오류를 추적.

#### 4. Webpack 기반 빌드 파이프라인으로 전환
- 한글 경로 및 Windows 환경에서 발생하는 Vite/Next.js의 C++ 네이티브 바이너리 의존성 컴파일 오류를 원천 차단하기 위해 순수 Webpack 기반으로 개발 서버 전환을 완료하였음.
