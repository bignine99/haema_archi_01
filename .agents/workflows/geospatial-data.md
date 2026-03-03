---
description: Geospatial Data Handling (공간 데이터 처리) - 좌표계 변환, WKT/GeoJSON 파싱, 공간 연산 가이드
---

# Geospatial Data Handling 스킬

건축기획설계의 핵심인 **대지 분석**을 위한 좌표계 변환, 공간 데이터 파싱, 폴리곤 연산 기술 가이드.

---

## 1. 좌표계 체계 (CRS)

### 한국 건축 설계에서 사용하는 좌표계

| 좌표계 | EPSG | 용도 | 단위 | 사용처 |
|--------|------|------|------|--------|
| **WGS84** | 4326 | GPS, 전세계 표준 | 도 (°) | 카카오, 구글맵 |
| **Web Mercator** | 3857 | 웹 지도 타일 | 미터 (m) | Leaflet, Vworld 타일 |
| **중부원점 (TM)** | 5186 | 한국 공식 측량 | 미터 (m) | 국토정보, 지적도 |
| **중부원점 (GRS80)** | 5174 | 한국 구 좌표계 | 미터 (m) | 토지이음 |
| **UTM Zone 52N** | 32652 | 국제 측량 | 미터 (m) | 군사, 학술 |

### 좌표계 관계도

```
WGS84 (경위도, °)
  ├─ EPSG:4326  ← 카카오 REST API 출력
  ├─ EPSG:3857  ← Vworld 타일맵, Leaflet 내부
  └─ EPSG:5186  ← Vworld Data API (중부원점), 정밀 거리 계산
```

### ⚠️ 주의사항
- 카카오 API 좌표: `(longitude, latitude)` = `(x, y)` 순서
- GeoJSON 표준: `[longitude, latitude]` 순서
- 한국 지적도: 중부원점(EPSG:5186) 기준이지만 Vworld API에서 `crs=EPSG:4326` 요청 가능

---

## 2. 좌표 변환

### 2-1. WGS84 → 로컬 미터 (간이 변환)

프론트엔드에서 빠르게 변환할 때 사용. **소규모 필지(< 1km²)에 적합**.

```typescript
/**
 * WGS84(도) → 로컬 미터 좌표 (중심점 기준 상대 좌표)
 * 
 * 원리: 위도에 따라 경도 1°의 실제 거리가 달라짐
 * - 위도 1° ≈ 111,320m (일정)
 * - 경도 1° ≈ 111,320 × cos(위도) m
 * 
 * 서울(37.5°) 기준: 경도 1° ≈ 88,300m
 * 부산(35.1°) 기준: 경도 1° ≈ 91,150m
 * 제주(33.4°) 기준: 경도 1° ≈ 93,000m
 */
function wgs84ToLocalMeters(
    coords: [number, number][],       // [lng, lat][]
    centerLng: number,                 // 중심 경도
    centerLat: number                  // 중심 위도
): [number, number][] {
    const LAT_TO_METER = 111320;
    const LNG_TO_METER = 111320 * Math.cos(centerLat * Math.PI / 180);

    return coords.map(([lng, lat]) => [
        (lng - centerLng) * LNG_TO_METER,   // X (동-서)
        (lat - centerLat) * LAT_TO_METER,   // Y (남-북)
    ]);
}
```

### 2-2. 정밀 좌표 변환 (Proj4js)

대규모 필지나 정밀 측량이 필요할 때.

```bash
npm install proj4
```

```typescript
import proj4 from 'proj4';

// 좌표계 정의
proj4.defs('EPSG:5186', '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs');
proj4.defs('EPSG:5174', '+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +units=m +no_defs +towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43');

// WGS84 → 중부원점
function wgs84ToTM(lng: number, lat: number): [number, number] {
    return proj4('EPSG:4326', 'EPSG:5186', [lng, lat]) as [number, number];
}

// 중부원점 → WGS84
function tmToWgs84(x: number, y: number): [number, number] {
    return proj4('EPSG:5186', 'EPSG:4326', [x, y]) as [number, number];
}

// 폴리곤 일괄 변환
function transformPolygon(
    coords: [number, number][],
    fromCRS: string,
    toCRS: string
): [number, number][] {
    return coords.map(pt => proj4(fromCRS, toCRS, pt) as [number, number]);
}
```

### 2-3. 로컬 미터 → 3D (Three.js) 매핑

```typescript
/**
 * 로컬 미터 좌표를 Three.js 3D 공간에 매핑
 * 
 * 좌표계 차이:
 *   GIS: X=동, Y=북  (수평 평면)
 *   Three.js: X=우, Y=위, Z=-앞  (화면 기준)
 * 
 * 매핑:
 *   GIS X → Three.js X
 *   GIS Y → Three.js -Z  (Z축 반전)
 *   높이 → Three.js Y
 */
function localToThreeJS(
    gisCoords: [number, number][],    // [x_meter, y_meter]
    centroid: [number, number]        // 중심점
): THREE.Vector3[] {
    return gisCoords.map(([x, y]) => 
        new THREE.Vector3(
            x - centroid[0],    // X (동-서)
            0,                  // Y (높이, 지면=0)
            -(y - centroid[1])  // Z (남-북, 반전!)
        )
    );
}
```

---

## 3. WKT (Well-Known Text) 파싱

### WKT 포맷 예시

```
POLYGON((127.0 37.5, 127.001 37.5, 127.001 37.501, 127.0 37.501, 127.0 37.5))
MULTIPOLYGON(((127.0 37.5, 127.001 37.5, 127.001 37.501, 127.0 37.501, 127.0 37.5)))
```

### WKT 파서

```typescript
/**
 * WKT 문자열 → 좌표 배열
 * Vworld API가 WKT 형식으로 반환할 때 사용
 */
function parseWKT(wkt: string): [number, number][][] {
    const polygons: [number, number][][] = [];

    if (wkt.startsWith('MULTIPOLYGON')) {
        // MULTIPOLYGON(((x1 y1, x2 y2, ...)), ((x3 y3, ...)))
        const content = wkt.replace('MULTIPOLYGON(', '').slice(0, -1);
        const polyStrings = content.match(/\(\([^)]+\)\)/g) || [];
        
        for (const ps of polyStrings) {
            const cleaned = ps.replace(/[()]/g, '');
            const coords = parseCoordString(cleaned);
            polygons.push(coords);
        }
    } else if (wkt.startsWith('POLYGON')) {
        // POLYGON((x1 y1, x2 y2, ...))
        const content = wkt.replace('POLYGON((', '').replace('))', '');
        polygons.push(parseCoordString(content));
    } else if (wkt.startsWith('POINT')) {
        // POINT(x y)
        const content = wkt.replace('POINT(', '').replace(')', '');
        const [x, y] = content.trim().split(/\s+/).map(Number);
        polygons.push([[x, y]]);
    }

    return polygons;
}

function parseCoordString(str: string): [number, number][] {
    return str.split(',').map(pair => {
        const [x, y] = pair.trim().split(/\s+/).map(Number);
        return [x, y] as [number, number];
    });
}
```

### WKT 생성 (폴리곤 → WKT)

```typescript
function toWKT(coords: [number, number][], type: 'POLYGON' | 'POINT' = 'POLYGON'): string {
    if (type === 'POINT') {
        return `POINT(${coords[0][0]} ${coords[0][1]})`;
    }
    
    // 닫힌 폴리곤 확인
    const closed = [...coords];
    const first = closed[0];
    const last = closed[closed.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        closed.push(first); // 닫기
    }
    
    const coordStr = closed.map(([x, y]) => `${x} ${y}`).join(', ');
    return `POLYGON((${coordStr}))`;
}
```

---

## 4. GeoJSON 처리

### GeoJSON 구조

```typescript
interface GeoJSONFeature {
    type: 'Feature';
    geometry: {
        type: 'Polygon' | 'MultiPolygon' | 'Point';
        coordinates: number[][][] | number[][][][] | number[];
    };
    properties: Record<string, any>;
}

interface GeoJSONFeatureCollection {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
}
```

### Vworld API 응답 → 폴리곤 추출

```typescript
/**
 * Vworld GetFeature 응답에서 폴리곤 좌표 추출
 * 
 * Vworld 응답 구조:
 * response.result.featureCollection.features[0].geometry
 */
function extractPolygonFromVworld(feature: any): [number, number][] {
    const geom = feature.geometry;
    let rawCoords: [number, number][];

    switch (geom.type) {
        case 'MultiPolygon':
            rawCoords = geom.coordinates[0][0]; // 첫 번째 폴리곤, 외곽 링
            break;
        case 'Polygon':
            rawCoords = geom.coordinates[0]; // 외곽 링
            break;
        default:
            throw new Error(`Unsupported geometry: ${geom.type}`);
    }

    // 닫힌 폴리곤의 마지막 점 제거
    if (rawCoords.length > 1) {
        const [fx, fy] = rawCoords[0];
        const [lx, ly] = rawCoords[rawCoords.length - 1];
        if (Math.abs(fx - lx) < 1e-10 && Math.abs(fy - ly) < 1e-10) {
            rawCoords = rawCoords.slice(0, -1);
        }
    }

    return rawCoords;
}
```

### 폴리곤 → GeoJSON 생성

```typescript
function toGeoJSON(coords: [number, number][], properties: Record<string, any> = {}): GeoJSONFeature {
    const closed = [...coords, coords[0]]; // 닫기
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [closed],
        },
        properties,
    };
}
```

---

## 5. 공간 연산 (Spatial Operations)

### 5-1. 면적 계산 (Shoelace Formula)

```typescript
/**
 * 폴리곤 면적 계산 (미터 좌표 기준)
 * Shoelace (Surveyor's) Formula
 * 
 * 주의: 입력 좌표는 미터 단위여야 함!
 *       WGS84(도)로 계산하면 오차 매우 큼
 */
function computeArea(pts: [number, number][]): number {
    let area = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += pts[i][0] * pts[j][1];
        area -= pts[j][0] * pts[i][1];
    }
    return Math.abs(area) / 2;
}
```

### 5-2. 중심점 (Centroid)

```typescript
function polygonCentroid(pts: [number, number][]): [number, number] {
    let cx = 0, cy = 0;
    for (const [x, y] of pts) {
        cx += x;
        cy += y;
    }
    return [cx / pts.length, cy / pts.length];
}
```

### 5-3. 바운딩 박스 (Bounding Box)

```typescript
function polygonBBox(pts: [number, number][]): {
    minX: number; maxX: number; minY: number; maxY: number;
    width: number; height: number;
} {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    
    for (const [x, y] of pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
```

### 5-4. Point-in-Polygon (점 포함 여부)

```typescript
/**
 * Ray Casting 알고리즘
 * 점이 폴리곤 내부에 있는지 판별
 */
function isPointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
    const [px, py] = point;
    let inside = false;
    const n = polygon.length;
    
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        
        if ((yi > py) !== (yj > py) &&
            px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    
    return inside;
}
```

### 5-5. 폴리곤 오프셋 (건축선 후퇴)

```typescript
/**
 * 건축법상 건축선 후퇴 (setback) 계산
 * 폴리곤을 안쪽으로 offset만큼 축소
 * 
 * 간단한 방법: 각 변의 법선 방향으로 이동
 */
function offsetPolygon(pts: [number, number][], offset: number): [number, number][] {
    const n = pts.length;
    const result: [number, number][] = [];
    
    for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];
        
        // 이전 변의 법선
        const dx1 = curr[0] - prev[0];
        const dy1 = curr[1] - prev[1];
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
        const nx1 = -dy1 / len1;
        const ny1 = dx1 / len1;
        
        // 다음 변의 법선
        const dx2 = next[0] - curr[0];
        const dy2 = next[1] - curr[1];
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        const nx2 = -dy2 / len2;
        const ny2 = dx2 / len2;
        
        // 이등분선 방향
        const bx = nx1 + nx2;
        const by = ny1 + ny2;
        const bLen = Math.sqrt(bx * bx + by * by);
        
        if (bLen > 0.001) {
            const scale = offset / (bLen * Math.cos(
                Math.atan2(ny2 - ny1, nx2 - nx1) / 2
            ));
            result.push([
                curr[0] + (bx / bLen) * offset,
                curr[1] + (by / bLen) * offset,
            ]);
        } else {
            result.push([curr[0] + nx1 * offset, curr[1] + ny1 * offset]);
        }
    }
    
    return result;
}
```

---

## 6. Vworld API 연동 패턴

### 6-1. API 엔드포인트

| API | 용도 | URL |
|-----|------|-----|
| **Data API** | 지적도 폴리곤 | `api.vworld.kr/req/data` |
| **WMS** | 배경지도 이미지 | `api.vworld.kr/req/wms` |
| **WMTS** | 타일 지도 | `api.vworld.kr/req/wmts` |
| **WFS** | 피처 데이터 | `api.vworld.kr/req/wfs` |

### 6-2. 지적도 레이어

| 레이어 코드 | 설명 | 비고 |
|------------|------|------|
| `LP_PA_CBND_BUBUN` | 연속지적도 필지 (부분) | 가장 세밀 |
| `LT_C_ADSIGOT` | 행정구역 경계 | 폴백용 |
| `LP_PA_CBND` | 연속지적도 (전체) | 대규모 |
| `LT_C_USELD` | 토지이용계획 | 용도지역 |

### 6-3. 프록시 설정 (CORS 대응)

```javascript
// webpack.config.js
devServer: {
    proxy: {
        '/vworld-api': {
            target: 'http://api.vworld.kr',
            changeOrigin: true,
            pathRewrite: { '^/vworld-api': '' },
        },
        '/kakao-api': {
            target: 'https://dapi.kakao.com',
            changeOrigin: true,
            pathRewrite: { '^/kakao-api': '' },
        },
    },
}
```

---

## 7. 수치형 행렬 변환 (AI/ML 용)

### 폴리곤 → 정규화 행렬

```typescript
/**
 * 폴리곤 좌표를 AI 모델 입력용 정규화 행렬로 변환
 * 
 * [x1, y1]     [0.0, 0.0]
 * [x2, y2]  →  [0.5, 0.0]    (0~1 범위로 정규화)
 * [x3, y3]     [0.5, 1.0]
 * [x4, y4]     [0.0, 1.0]
 */
function normalizePolygon(pts: [number, number][], maxPoints: number = 32): number[][] {
    const bbox = polygonBBox(pts);
    
    // 0~1 범위로 정규화
    const normalized = pts.map(([x, y]) => [
        bbox.width > 0 ? (x - bbox.minX) / bbox.width : 0,
        bbox.height > 0 ? (y - bbox.minY) / bbox.height : 0,
    ]);
    
    // 고정 길이 패딩 (모델 입력 크기 통일)
    while (normalized.length < maxPoints) {
        normalized.push([-1, -1]); // 패딩값
    }
    
    return normalized.slice(0, maxPoints);
}
```

### 폴리곤 특성 벡터

```typescript
/**
 * 폴리곤에서 건축 기획에 유용한 특성 벡터 추출
 */
function extractFeatures(pts: [number, number][]): Record<string, number> {
    const bbox = polygonBBox(pts);
    const area = computeArea(pts);
    const perimeter = computePerimeter(pts);
    const centroid = polygonCentroid(pts);
    
    // 형상 지표
    const compactness = (4 * Math.PI * area) / (perimeter * perimeter);
    const aspectRatio = bbox.width / bbox.height;
    const rectangularity = area / (bbox.width * bbox.height);
    
    return {
        area,                    // 면적 (㎡)
        perimeter,               // 둘레 (m)
        vertexCount: pts.length, // 꼭짓점 수
        width: bbox.width,       // 가로 (m)
        height: bbox.height,     // 세로 (m)
        compactness,             // 원형도 (0~1, 원=1)
        aspectRatio,             // 장단비
        rectangularity,          // 정형도 (0~1, 직사각형=1)
        centroidX: centroid[0],
        centroidY: centroid[1],
    };
}

function computePerimeter(pts: [number, number][]): number {
    let peri = 0;
    for (let i = 0; i < pts.length; i++) {
        const j = (i + 1) % pts.length;
        const dx = pts[j][0] - pts[i][0];
        const dy = pts[j][1] - pts[i][1];
        peri += Math.sqrt(dx * dx + dy * dy);
    }
    return peri;
}
```

---

## 8. 통합 파이프라인 (현 프로젝트)

```
[사용자 입력]  "경남 김해시 주촌면 농소리 631-2"
       ↓
[① 카카오 REST API]  주소 → WGS84 (lng=128.xxx, lat=35.xxx) + 법정동코드
       ↓
[② Vworld Data API]  좌표 → GeoJSON Polygon (WGS84)
       ↓
[③ 좌표 변환]  WGS84(도) → 로컬 미터(m) (중심점 기준)
       ↓
[④ 공간 연산]  면적·바운딩박스·중심점·형상지표 계산
       ↓
[⑤ 3D 매핑]  로컬 미터 → Three.js (X, 0, -Y)
       ↓
[⑥ 렌더링]   BuildingMass + LandBoundary + Camera Auto-fit
```

---

## 체크리스트

- [x] WGS84 → 로컬 미터 간이 변환 (현재 gisApi.ts에 구현됨)
- [x] Shoelace 면적 계산 (현재 gisApi.ts에 구현됨)
- [x] Vworld GeoJSON 파싱 (Polygon/MultiPolygon) (현재 구현됨)
- [x] CORS 프록시 설정 (webpack devServer에 구현됨)
- [ ] Proj4js 정밀 좌표 변환 (선택 사항)
- [ ] WKT 파서/생성기 (Vworld WKT 응답 대응)
- [ ] Point-in-Polygon 판별
- [ ] 폴리곤 오프셋 (건축선 후퇴)
- [ ] 정규화 행렬 변환 (AI/ML 파이프라인)
- [ ] 폴리곤 특성 벡터 추출
