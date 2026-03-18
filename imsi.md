# 🚀 내일 (2026-03-18) 오전 최우선 작업: 건축물대장 API 활성화 확인 + 3D 건물 품질 향상

> **전날 작업 요약 (3/17):**
> 1. 건물↔위성지도 좌표 정렬 **근본 해결** (동적 planeSize, Web Mercator 공식)
> 2. 위성 해상도 2배 향상 (zoom 18, 0.47m/px)
> 3. 키워드 필터 버그 수정 ('교'→'교량', 교회 누락 방지)
> 4. 건축물대장 API: 포털 미리보기는 "NORMAL SERVICE" 반환하지만 **외부 호출은 아직 401** (키 전파 대기)

---

## 🛠️ 작업 순서 (반드시 이 순서대로!)

### Step 0. Vite 서버 기동 확인 (최우선!)

```bash
cd services\04_3d_mass
npm run dev
```

서버가 `http://localhost:3004`에서 정상 기동되면 다음 단계로.

---

### Step 1. 🔑 건축물대장 API 키 외부 전파 확인 (5분) ← 최우선!

**작업 요일 기준 3일째 (3/15 토 신청 → 3/17 월 확인 시 401 → 3/18 화 재확인)**

브라우저 F12 콘솔에서 아래 테스트:

```javascript
(async function() {
    // 방법 1: 프록시 경유
    const url1 = '/building-api/1613000/BldRgstHubService/getBrTitleInfo' +
        '?serviceKey=' + encodeURIComponent('VAJkxQFCr4ViM45g0TSpV16Z+AVQXz3k+wpQPc9/X+rUlcA/GMvjdf6U6Cd3d/WXH+7vmtuQ9CnteJcJXu5dCg==') +
        '&sigunguCd=11680&bjdongCd=10300&_type=json&numOfRows=5&pageNo=1';
    
    try {
        const res = await fetch(url1);
        console.log('프록시 STATUS:', res.status);
        if (res.ok) {
            const data = await res.json();
            const items = data?.response?.body?.items?.item;
            if (items) {
                const list = Array.isArray(items) ? items : [items];
                console.log('✅ 건축물대장 성공:', list.length + '건');
                list.forEach(i => console.log(' -', i.bldNm || '무명', 'heit=' + i.heit + 'm', '층수=' + i.grndFlrCnt));
            } else {
                console.log('응답은 정상이나 데이터 없음:', JSON.stringify(data?.response?.header));
            }
        } else {
            console.log('❌ 여전히', res.status, '- API 키 외부 전파 미완료');
        }
    } catch(e) {
        console.log('ERROR:', e.message);
    }
})();
```

#### 결과별 대응:

| 결과 | 의미 | 대응 |
|------|------|------|
| `✅ 건축물대장 성공: N건` | API 키 전파 완료! | → **Step 2로 바로 진행** |
| `❌ 여전히 401` | 키 전파 미완료 | → 공공데이터포털 마이페이지에서 "활용 현황" 확인, 필요 시 1:1 문의 |
| `응답 정상이나 데이터 없음` | 파라미터 불일치 | → sigunguCd/bjdongCd 조합 변경하여 재시도 (Step 1-B 참고) |

#### Step 1-B. 다른 지역 파라미터로 테스트 (데이터 없음 시)

```javascript
// 서울 강남구 역삼동 — 건물 밀집 지역
'sigunguCd=11680&bjdongCd=10300'

// 서울 노원구 월계동 — 우리 테스트 사이트 근처
'sigunguCd=11350&bjdongCd=10100'

// 서울 중구 명동 — 다양한 건물
'sigunguCd=11140&bjdongCd=10400'
```

---

### Step 2. 건축물대장 API 성공 시: 3D 건물 높이 보강 테스트 (10분)

API가 활성화되면, 코드 수정 없이 자동으로 동작하는 파이프라인:

```
VWorld 건물 데이터 → enrichBuildingsWithRegisterHeight() 
→ 건축물대장 실측 높이(heit) 매칭 → heightSource='register' 설정
→ 3D 렌더링 시 해당 건물은 파란색으로 표시
```

#### 확인 사항:
1. 콘솔 로그에서 `[건축물대장] ✅ N개 건물 높이 데이터 확보` 메시지 확인
2. 3D 뷰에서 **일부 건물이 파란색 톤**으로 표시되면 성공
3. 파란색 건물의 높이가 다른 건물보다 **정확한 비율**로 보이면 정상

---

### Step 3. 3D 건물 렌더링 추가 품질 향상 (30분)

#### 3-1. 아직 남아있을 수 있는 문제점 확인

유저가 보고한 미해결 사항:
- **Fix 2**: 표시되지 않는 건물이 여전히 일부 존재 (VWorld LT_C_SPBD 데이터 자체의 한계)
- **Fix 4**: 도로/하천 위 건물 — planeSize 수정으로 대부분 해결되었으나, VWorld 데이터 자체가 부정확한 경우 잔존

#### 3-2. VWorld 건물 데이터 커버리지 확인

브라우저 콘솔에서 현재 로드된 건물 목록 확인:
```javascript
// 콘솔에서 주변 건물 데이터 확인
const store = window.__ZUSTAND_STORE__ || null;
// 또는 React DevTools에서 projectStore의 realSurroundingBuildings 배열 확인
```

건물 수가 너무 적으면(< 30개), 아래 원인 고려:
- VWorld API `size` 파라미터 (기본 1000) — 더 늘릴 필요 없음
- VWorld `bboxRadius` 계산값이 너무 작음 → `radius/100000` → radius=200일 때 0.002도 ≈ 약 220m
- **해결**: fetchSurroundingBuildings 반경을 250m로 약간 증가 고려

#### 3-3. zoom 19 테스트 (선택사항)

VWorld이 해당 지역에서 zoom 19를 지원하는지 테스트:
```javascript
// SceneViewer.tsx에서 zoom을 임시로 19로 변경하여 확인
// 성공 시: ~0.23m/px 해상도 (항공사진급!)
// 실패 시: 빈 이미지 또는 에러 → zoom 18로 복원
```

---

### Step 4. heightSource 범례(Legend) UI 추가 (20분)

3D 뷰 **우측 상단**에 색상 범례 오버레이 UI 추가:

```
┌─────────────────┐
│ 건물 높이 출처    │
│ 🔵 실측 (건축물대장) │
│ 🟡 층수 기반 계산    │
│ ⚪ 기본 추정        │
└─────────────────┘
```

**수정 위치**: `SceneViewer.tsx` 하단 또는 별도 `HeightSourceLegend.tsx` 컴포넌트
**스타일**: 반투명 글래스모피즘, 작은 사각형 색상 칩 + 텍스트

---

### Step 5. 추가 개선 (시간 여유 시)

#### 5-1. 건축물대장 API 응답 분석 (시군구코드/법정동코드 매핑)
- VWorld 건물 데이터의 `bd_mgt_sn` (건물관리번호) 또는 좌표를 이용하여 
  역지오코딩 → sigunguCd/bjdongCd 추출 → 건축물대장 조회
- 현재 `enrichBuildingsWithRegisterHeight()`에서 이 로직이 구현되어 있지만,
  실제 API 응답을 보고 매칭 정확도를 확인해야 함

#### 5-2. 건물 클릭 시 상세 정보 팝업
- 건물을 클릭하면 건축물대장 정보 표시:
  - 건물명, 실측 높이, 층수, 주용도, 건축면적, 연면적, 구조, 지붕형태
- `SurroundingBuildings` 컴포넌트에서 `onClick` 이벤트 핸들러 추가

#### 5-3. Phase 1-D 일조 시뮬레이션 준비
- 태양 궤적 계산 (위도/경도/날짜 기반)
- 건물 그림자 투영 (ShadowMap 또는 레이캐스팅)
- 일조 시간 분석 (대지 위 각 지점별)

---

## 🖥️ 작업 시작용 프롬프트 (복사 붙여넣기용)

```
Antigravity, 어제(3/17) 밤에 건물↔위성지도 좌표 정렬 문제를 근본 해결했다 (동적 planeSize, Web Mercator 공식).
위성 해상도도 zoom 18로 올렸고, 키워드 필터 버그('교'→'교회' 매칭)도 수정했다.

1. 먼저 건축물대장 API(data.go.kr)이 활성화되었는지 확인해줘.
   - 프록시 경유(/building-api/...)로 sigunguCd=11680, bjdongCd=10300 조회
   - 여전히 401이면 알려줘
   - 성공하면 3D 뷰에서 파란색 건물이 표시되는지 확인

2. 건물 렌더링 품질을 다시 확인하고:
   - 위성지도와 건물 위치가 정확히 일치하는지
   - 누락된 건물이 있는지
   - 도로 위에 잘못 배치된 건물이 있는지

3. heightSource 범례(Legend) UI를 3D 뷰에 추가해줘.

4. 시간이 남으면 건물 클릭 시 상세 정보 팝업 구현을 시작하자.
```

---

## 📂 관련 파일 위치 (참고)

| 파일 | 역할 | 최근 수정 |
|------|------|----------|
| `services/04_3d_mass/.env` | API 키 3종 (VWorld, 카카오, 건축물대장) | 3/15 |
| `services/04_3d_mass/vite.config.ts` | 프록시 설정 (vworld, kakao, building-api) | 3/17 |
| `services/04_3d_mass/src/services/gisApi.ts` | 핵심 GIS API 로직 (건물 조회 + 필터링 + 높이 보강) | **3/17 야간** |
| `services/04_3d_mass/src/store/projectStore.ts` | Zustand 스토어 (showMassing=false, radius=200m) | **3/17 야간** |
| `services/04_3d_mass/src/components/three/SceneViewer.tsx` | 3D 렌더링 (UrbanGroundPlane, SurroundingBuildings, BuildingMass) | **3/17 야간** |

---

## ⚙️ 핵심 수치 정리 (Quick Reference)

| 항목 | 현재 값 | 비고 |
|------|---------|------|
| VWorld 위성 zoom | **18** | 0.47m/px, Google Maps 수준 |
| planeSize | **동적 계산** | `1024 × 156543.03 × cos(lat) / 2^18 ≈ 484m` |
| 건물 조회 반경 | **200m** | 위성 커버리지(484m) 절반 이내 |
| showMassing 기본값 | **false** | 사이트 건물 매스 숨김 |
| heightSource 색상 | 파랑/노랑/회색 | register/floors/estimate |
| 건축물대장 API | ⏳ 401 대기 | 키 외부 전파 대기 중 |
