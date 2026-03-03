# Flexity Clone - 한국형 건축 법규 최적화 AI

## 프로젝트 구조 (마이크로서비스 아키텍처)

```
├── docker-compose.yml          # 전체 서비스 오케스트레이션
├── frontend/                   # Next.js + Three.js 3D 뷰어
│   ├── src/
│   │   ├── app/               # Next.js App Router
│   │   ├── components/
│   │   │   ├── three/         # 3D 시각화 컴포넌트
│   │   │   └── ui/            # UI 패널 컴포넌트
│   │   └── store/             # Zustand 상태 관리
│   └── Dockerfile
├── services/
│   ├── gis-service/           # [Step 2] 지적도/주소 API
│   ├── regulation-engine/     # [Step 3] 건축 법규 계산기
│   ├── optimization-engine/   # [Step 4] 매스 최적화 AI
│   └── financial-analyzer/    # [Step 5] 사업성 분석기
└── implementation.md           # 상세 구현 명세
```

## 실행 방법

### 방법 1: 로컬 개발 (Docker 없이)
```bash
cd frontend
npm install
npm run dev
```
→ http://localhost:3000

### 방법 2: Docker Compose (전체 서비스)
```bash
docker-compose up --build
```

## 현재 진행 상황
- ✅ Step 1: Base UI & 3D 환경 구축 (Mock 데이터)
- ⬜ Step 2: 지도 & 지적도 연동
- ⬜ Step 3: 법적 최대 크기 (Max Envelope)
- ⬜ Step 4: 층별 분할 및 스태킹
- ⬜ Step 5: 사업성 대시보드
