# 내일 (2026-03-03) 바로 진행할 작업
> 최종 업데이트: 2026-03-02 21:50
> 상태: 🔵 내일 아침 바로 착수

---

## 🚨 긴급 수정 — 대시보드 잔여 이슈 (사용자 확인 사항)

> "아직도 수정할 부분이 좀 존재하는데" — 사용자 언급 (2026-03-02 21:41)

### 확인 필요 사항

| # | 예상 이슈 | 확인 방법 | 우선순위 |
|---|----------|----------|----------|
| 1 | **실제 PDF 과업지시서 파싱 검증** | 사용자의 실제 PDF 파일로 테스트 (현재 TXT만 검증됨) | 🔴 |
| 2 | **기타 사항 카드 내용 품질** | 스크린샷에서 설계 방향/시설 구성의 정확도 확인 | 🟡 |
| 3 | **주소 검색 후 3D 매스 전환** | 과업지시서 업로드 → 주소 검색 → 3D 뷰 전환 흐름 점검 | 🟡 |
| 4 | **반응형 레이아웃** | 화면 크기 축소 시 1컬럼으로 정상 전환되는지 | 🟢 |

### 착수 절차
```bash
# 1. Dev 서버 실행 (이전에 중단했다면)
cd "c:\Users\cho\Desktop\Temp\05 Code\260226_haema_arch\frontend"
npm run dev
# → http://localhost:3000

# 2. 실제 과업지시서 PDF로 테스트
# → 대시보드 > 과업지시서 업로드 카드 > 실제 PDF 드래그앤드롭

# 3. 브라우저 콘솔(F12) 확인
# → [과업지시서 파서] 로그가 추출된 텍스트와 파싱 결과를 출력함
```

---

## 🔵 오전 작업 (09:00~)

### ① 대시보드 잔여 수정사항 해결
- 사용자가 아직 수정이 필요하다고 언급한 부분 확인 및 수정
- 실제 PDF 파서 정확도 검증 → 필요시 정규식 보완
- 대시보드 카드 간 데이터 불일치 확인

### ② 법규분석 페이지 과업지시서 연동
- 과업지시서에서 추출한 건폐율/용적률/높이제한이 법규분석 페이지에도 반영되는지 확인
- 법규 세부사항 팝업에서 "현재 프로젝트 기준" 하이라이트 정확도 확인

### ③ 주소 검색 → 3D 매스 전환 플로우 검증
- 과업지시서 업로드 후 대시보드의 주소 검색에서 주소 입력 → 검색 → 3D 뷰 전환
- 3D 매스에 과업지시서의 규모(B1/3F), 건폐율(55%), 용적률(200%)이 반영되는지 확인
- landArea가 10,623㎡로 유지되는지 (loadRealParcel 수정 검증)

---

## 🟡 오후 작업 (14:00~)

### ④ Phase 1-D: 환경 시뮬레이션 기초
| 항목 | 내용 |
|------|------|
| 일조 분석 | 정북일조 사선제한을 3D로 시각화 (이미 Phase 1-C에서 경사면 구현, 시간대별 그림자 추가) |
| 바람길 분석 | 바람 방향 화살표 + 건물 배치에 따른 풍속 변화 시뮬레이션 |
| 소음 분석 | 전면도로 소음원 → 건물 차폐 효과 시각화 |
| 조망 분석 | 각 층/방향별 조망 점수 (산/강/도로 등) |

### ⑤ 대지분석 페이지 콘텐츠 보강
- 현재 빈 페이지 (개발 예정 Placeholder)
- 과업지시서 + 지도 데이터를 결합한 대지 종합 분석 페이지 구성

---

## ⬜ 이후 계획

| 순서 | 작업 | 설명 |
|------|------|------|
| 6 | Phase 1-E | 제너레이티브 배치 (GA 엔진) |
| 7 | Phase 1-F | 사업성 실시간 연동 (ROI/IRR) |
| 8 | Phase 2 | 평면도 자동 생성 (GNN/RL/GAN) |
| 9 | Phase 3 | 입면·단면·3D 매스 (파라메트릭) |
| 10 | Phase 4 | 컨셉 시각화 (SD+ControlNet) |
| 11 | Phase 5 | 면적표·실 구성 (실무 산출물) |

---

## 📁 현재 프로젝트 파일 구조

```
260226_haema_arch/
├── frontend/                    # React + Webpack + Three.js
│   ├── src/
│   │   ├── App.tsx              # 사이드바 + 라우팅
│   │   ├── main.tsx
│   │   ├── index.css            # 글래스모피즘 + 스크롤바
│   │   ├── components/
│   │   │   ├── three/
│   │   │   │   └── SceneViewer.tsx    # 3D 매스 + Max Envelope
│   │   │   └── ui/
│   │   │       ├── ControlPanel.tsx   # 주소검색 + 파라미터
│   │   │       ├── Dashboard.tsx      # 2단 대시보드 (과업지시서 통합)
│   │   │       ├── DocumentUploader.tsx # 과업지시서 업로드
│   │   │       ├── RegulationPanel.tsx  # 법규분석 전체화면
│   │   │       └── MapPanel.tsx        # Leaflet 미니맵
│   │   ├── services/
│   │   │   ├── regulationEngine.ts    # 법규 계산 + 오프셋
│   │   │   ├── documentParser.ts      # AI 과업지시서 파서 ★
│   │   │   └── gisApi.ts              # 카카오/Vworld API
│   │   └── store/
│   │       └── projectStore.ts        # Zustand 상태관리
│   ├── webpack.config.js
│   ├── package.json
│   └── index.html
├── services/gis-service/        # FastAPI (port 8001)
├── docker-compose.yml
├── detailed_steps_modification_processes.md  # 개발 과정 상세 기록
├── implementation.md            # 5대 기능 종합 로드맵
└── imsi.md                      # ← 이 파일
```

---

## ⚠️ 참고사항

### Dev 서버 재시작
```bash
cd "c:\Users\cho\Desktop\Temp\05 Code\260226_haema_arch\frontend"
npm run dev
# → http://localhost:3000
```

### 포트 충돌 시
```bash
netstat -ano | findstr :3000
taskkill /PID [PID번호] /F
```

### 좀비 Node 프로세스 정리
```bash
taskkill /IM node.exe /F
```

### 과업지시서 파서 디버깅
- 브라우저 F12 → 콘솔에서 `[과업지시서 파서]` 로그 확인
- 추출된 텍스트 3000자 + 파싱 결과 JSON이 출력됨
