/**
 * 건축 법규 엔진 (Regulation Engine)
 * 
 * 한국 건축법 시행령 기반:
 * - 용도지역별 건폐율/용적률/높이 제한
 * - 정북일조 사선제한 (건축법 시행령 제86조)
 * - 대지 안의 공지 (건축법 시행령 제80조의2)
 * - 주차장법 시행령 기반 주차 대수 산정
 * - 폴리곤 오프셋(후퇴) 알고리즘
 * - Max Envelope 3D 볼륨 생성 (Phase 1-C)
 */

// ─── 용도지역별 법규 테이블 ───
export interface ZoneRegulation {
    code: string;
    name: string;
    maxBuildingCoverage: number;   // 건폐율 상한 (%)
    maxFloorAreaRatio: number;     // 용적률 상한 (%)
    maxHeight: number | null;      // 높이 제한 (m), null=무제한
    sunlightRestriction: boolean;  // 정북일조 사선제한 적용 여부
    category: '주거' | '상업' | '공업' | '녹지';
}

export const ZONE_REGULATIONS: Record<string, ZoneRegulation> = {
    '제1종 전용주거지역': {
        code: 'R-1E', name: '제1종 전용주거지역',
        maxBuildingCoverage: 50, maxFloorAreaRatio: 100, maxHeight: 25,
        sunlightRestriction: true, category: '주거',
    },
    '제2종 전용주거지역': {
        code: 'R-2E', name: '제2종 전용주거지역',
        maxBuildingCoverage: 50, maxFloorAreaRatio: 150, maxHeight: 25,
        sunlightRestriction: true, category: '주거',
    },
    '제1종 일반주거지역': {
        code: 'R-1G', name: '제1종 일반주거지역',
        maxBuildingCoverage: 60, maxFloorAreaRatio: 200, maxHeight: 25,
        sunlightRestriction: true, category: '주거',
    },
    '제2종 일반주거지역': {
        code: 'R-2G', name: '제2종 일반주거지역',
        maxBuildingCoverage: 60, maxFloorAreaRatio: 250, maxHeight: 50,
        sunlightRestriction: true, category: '주거',
    },
    '제3종 일반주거지역': {
        code: 'R-3G', name: '제3종 일반주거지역',
        maxBuildingCoverage: 50, maxFloorAreaRatio: 300, maxHeight: 55,
        sunlightRestriction: true, category: '주거',
    },
    '준주거지역': {
        code: 'R-Q', name: '준주거지역',
        maxBuildingCoverage: 70, maxFloorAreaRatio: 400, maxHeight: 70,
        sunlightRestriction: true, category: '주거',
    },
    '중심상업지역': {
        code: 'C-C', name: '중심상업지역',
        maxBuildingCoverage: 90, maxFloorAreaRatio: 1500, maxHeight: null,
        sunlightRestriction: false, category: '상업',
    },
    '일반상업지역': {
        code: 'C-G', name: '일반상업지역',
        maxBuildingCoverage: 80, maxFloorAreaRatio: 800, maxHeight: null,
        sunlightRestriction: false, category: '상업',
    },
    '근린상업지역': {
        code: 'C-N', name: '근린상업지역',
        maxBuildingCoverage: 70, maxFloorAreaRatio: 600, maxHeight: null,
        sunlightRestriction: false, category: '상업',
    },
    '준공업지역': {
        code: 'I-Q', name: '준공업지역',
        maxBuildingCoverage: 70, maxFloorAreaRatio: 400, maxHeight: null,
        sunlightRestriction: false, category: '공업',
    },
    '학교용지': {
        code: 'S-1', name: '학교용지',
        maxBuildingCoverage: 60, maxFloorAreaRatio: 180, maxHeight: 25,
        sunlightRestriction: true, category: '주거',
    },
    '자연녹지지역': {
        code: 'G-N', name: '자연녹지지역',
        maxBuildingCoverage: 20, maxFloorAreaRatio: 100, maxHeight: 20,
        sunlightRestriction: true, category: '녹지',
    },
    '보전녹지지역': {
        code: 'G-B', name: '보전녹지지역',
        maxBuildingCoverage: 20, maxFloorAreaRatio: 80, maxHeight: 15,
        sunlightRestriction: true, category: '녹지',
    },
    '생산녹지지역': {
        code: 'G-P', name: '생산녹지지역',
        maxBuildingCoverage: 20, maxFloorAreaRatio: 100, maxHeight: 20,
        sunlightRestriction: true, category: '녹지',
    },
};

// ─── 정북일조 사선제한 (건축법 시행령 제86조) ───
/**
 * 건축물의 각 부분 높이(H)에 따라
 * 정북방향 대지경계선으로부터 띄워야 하는 최소 거리(D)
 * 
 * 규칙:
 *   H ≤ 9m  → D ≥ 1.5m
 *   H > 9m  → D ≥ H/2 (단, 최소 1.5m)
 * 
 * 역으로, 특정 거리(D)에서 허용되는 최대 높이:
 *   D < 1.5m → 건축 불가
 *   1.5m ≤ D → H_max = min(9, ...) (D=1.5m 구간)
 *   D ≥ 4.5m → H_max = 2D (D×2 구간)
 */
export function sunlightMaxHeight(distFromNorthBoundary: number): number {
    if (distFromNorthBoundary < 1.5) return 0;  // 건축 불가 구간
    if (distFromNorthBoundary <= 4.5) return 9;  // 9m 이하 구간 (1.5m 후퇴)
    return distFromNorthBoundary * 2;            // 9m 초과 구간 (H/2 후퇴)
}

/**
 * 정북일조 사선제한 프로파일 생성
 * 정북 방향 대지경계선으로부터의 거리에 따른 최대 높이 배열
 * 
 * @param northEdgeLength  정북 방향 대지 경계 길이 (m)
 * @param depth            대지의 남북 깊이 (m)
 * @returns Array of { distance, maxHeight } from north edge
 */
export function generateSunlightProfile(depth: number): { distance: number; maxHeight: number }[] {
    const profile: { distance: number; maxHeight: number }[] = [];
    const step = 0.5;  // 0.5m 간격

    for (let d = 0; d <= depth; d += step) {
        profile.push({
            distance: d,
            maxHeight: sunlightMaxHeight(d),
        });
    }

    return profile;
}

// ─── 대지 안의 공지 (건축법 시행령 제80조의2) ───
/**
 * 건축선 후퇴 거리 계산
 * 
 * 도로 폭원에 따른 후퇴:
 *   4m 미만 도로 → 도로 중심선에서 2m 후퇴
 *   막다른 도로(35m 이하) → 도로 중심선에서 2m 후퇴
 * 
 * 용도지역별 기본 후퇴:
 *   주거지역: 전면 1m, 측면/후면 0.5m
 *   상업지역: 후퇴 없음 (또는 지자체 조례)
 *   공업지역: 전면 2m, 측면 1m
 */
export interface SetbackResult {
    front: number;   // 전면 후퇴 (m)
    side: number;    // 측면 후퇴 (m)
    rear: number;    // 후면 후퇴 (m)
    north: number;   // 정북방향 최소 후퇴 (m) - 일조권
}

export function calculateSetback(
    zoneType: string,
    roadWidth: number,
    hasSunlightRestriction: boolean
): SetbackResult {
    const zone = ZONE_REGULATIONS[zoneType];

    // 도로 폭원 기반 건축선 후퇴
    let frontSetback = 0;
    if (roadWidth > 0 && roadWidth < 4) {
        frontSetback = (4 - roadWidth) / 2;  // 도로 중심선에서 2m 확보
    }

    // 용도지역별 기본 후퇴
    if (zone?.category === '주거') {
        return {
            front: Math.max(frontSetback, 1.0),
            side: 0.5,
            rear: 0.5,
            north: hasSunlightRestriction ? 1.5 : 0.5,
        };
    } else if (zone?.category === '공업') {
        return {
            front: Math.max(frontSetback, 2.0),
            side: 1.0,
            rear: 1.0,
            north: 1.0,
        };
    } else if (zone?.category === '녹지') {
        return {
            front: Math.max(frontSetback, 3.0),
            side: 1.5,
            rear: 1.5,
            north: hasSunlightRestriction ? 1.5 : 1.0,
        };
    } else {
        // 상업지역 등
        return {
            front: Math.max(frontSetback, 0),
            side: 0,
            rear: 0,
            north: hasSunlightRestriction ? 1.5 : 0,
        };
    }
}

// ─── 주차 대수 산정 (주차장법 시행령) ───
/**
 * 용도별 법정 주차 대수 산정
 * 
 * 서울시 기준:
 * - 단독/다가구/다세대: 시설면적 50㎡당 1대
 * - 아파트/오피스텔: 전용면적 기준 (85㎡ 이하: 1대, 85㎡ 초과: 1.2대)
 * - 근린생활시설: 시설면적 134㎡당 1대
 * - 업무시설: 시설면적 100㎡당 1대
 */
export function calculateParkingRequired(
    grossFloorArea: number,
    buildingUse: string,
    residentialUnits: number = 0
): number {
    switch (buildingUse) {
        case '다가구주택':
        case '다세대주택':
            return Math.ceil(grossFloorArea / 50);
        case '공동주택(아파트)':
            return Math.ceil(residentialUnits * 1.0);
        case '오피스텔':
            return Math.ceil(grossFloorArea / 60);
        case '근린생활시설':
            return Math.ceil(grossFloorArea / 134);
        case '업무시설(오피스)':
            return Math.ceil(grossFloorArea / 100);
        case '숙박시설':
            return Math.ceil(grossFloorArea / 100);
        case '청년주택':
            return Math.ceil(residentialUnits * 0.5);
        case '교육연구시설':
            return Math.ceil(grossFloorArea / 150);
        case '의료시설':
            return Math.ceil(grossFloorArea / 100);
        case '종교시설':
            return Math.ceil(grossFloorArea / 150);
        default:
            return Math.ceil(grossFloorArea / 100);
    }
}

// ─── 폴리곤 오프셋 알고리즘 (Phase 1-C) ───
/**
 * 2D 폴리곤을 지정된 거리만큼 안쪽으로 수축 (inward offset)
 * 각 변의 법선 방향으로 이동한 후 인접 변 교차점을 계산
 * 
 * @param polygon  입력 폴리곤 꼭짓점 (반시계 방향)
 * @param offsets  각 변별 오프셋 거리 배열, 또는 단일 값
 * @returns 수축된 폴리곤 꼭짓점
 */
export function offsetPolygon(
    polygon: [number, number][],
    offsets: number | number[]
): [number, number][] {
    const n = polygon.length;
    if (n < 3) return polygon;

    // 폴리곤 방향 확인 (CCW 보장)
    const area = signedArea(polygon);
    const pts = area < 0 ? [...polygon].reverse() : [...polygon];
    const sign = 1; // inward for CCW

    // 각 변에 대해 오프셋된 직선(무한선) 생성
    const offsetLines: { px: number; py: number; dx: number; dy: number }[] = [];
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[j];

        // 변 방향 벡터
        const edx = x1 - x0;
        const edy = y1 - y0;
        const len = Math.sqrt(edx * edx + edy * edy);
        if (len < 1e-10) continue;

        // 내부 법선 (CCW 폴리곤의 경우 왼쪽 = 내부)
        const nx = -edy / len;
        const ny = edx / len;

        const d = typeof offsets === 'number' ? offsets : (offsets[i] || offsets[0]);

        // 오프셋 직선: 원래 변을 법선 방향으로 d만큼 이동
        offsetLines.push({
            px: x0 + nx * d * sign,
            py: y0 + ny * d * sign,
            dx: edx,
            dy: edy,
        });
    }

    // 인접 오프셋 직선의 교차점 계산
    const result: [number, number][] = [];
    const m = offsetLines.length;
    for (let i = 0; i < m; i++) {
        const j = (i + 1) % m;
        const L1 = offsetLines[i];
        const L2 = offsetLines[j];

        const pt = lineLineIntersection(
            L1.px, L1.py, L1.dx, L1.dy,
            L2.px, L2.py, L2.dx, L2.dy
        );

        if (pt) {
            result.push(pt);
        }
    }

    // 역방향이었으면 다시 뒤집기
    if (area < 0) result.reverse();

    return result.length >= 3 ? result : polygon;
}

/** Signed area of polygon (positive = CCW) */
function signedArea(pts: [number, number][]): number {
    let a = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        a += pts[i][0] * pts[j][1];
        a -= pts[j][0] * pts[i][1];
    }
    return a / 2;
}

/** Line-line intersection (parametric form) */
function lineLineIntersection(
    px1: number, py1: number, dx1: number, dy1: number,
    px2: number, py2: number, dx2: number, dy2: number
): [number, number] | null {
    const denom = dx1 * dy2 - dy1 * dx2;
    if (Math.abs(denom) < 1e-10) {
        // 평행 → 중점 반환
        return [(px1 + px2) / 2, (py1 + py2) / 2];
    }
    const t = ((px2 - px1) * dy2 - (py2 - py1) * dx2) / denom;
    return [px1 + t * dx1, py1 + t * dy1];
}

/**
 * 비균일 후퇴거리를 적용하여 건축가능영역 폴리곤 생성
 * 전면/측면/후면/정북에 각각 다른 후퇴거리를 적용
 * 
 * 간소화: 폴리곤의 바운딩 박스를 기준으로
 *   - 가장 아래 변(남쪽/전면): front setback
 *   - 가장 위 변(북쪽): north setback  
 *   - 좌/우 변(측면): side setback
 */
export function computeBuildablePolygon(
    polygon: [number, number][],
    setback: SetbackResult
): [number, number][] {
    const n = polygon.length;
    if (n < 3) return polygon;

    const bbox = polygonBBox(polygon);

    // 각 변에 맞는 후퇴거리를 결정
    const offsets: number[] = [];
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const mx = (polygon[i][0] + polygon[j][0]) / 2;
        const my = (polygon[i][1] + polygon[j][1]) / 2;

        // 변의 방향을 판단하여 후퇴거리 결정
        const edx = polygon[j][0] - polygon[i][0];
        const edy = polygon[j][1] - polygon[i][1];
        const isHorizontal = Math.abs(edx) > Math.abs(edy);

        if (isHorizontal) {
            // 수평 변: 위쪽(정북)이면 north, 아래쪽(전면)이면 front
            const nearTop = Math.abs(my - bbox.maxY) < Math.abs(my - bbox.minY);
            offsets.push(nearTop ? setback.north : setback.front);
        } else {
            // 수직 변: 측면
            offsets.push(setback.side);
        }
    }

    return offsetPolygon(polygon, offsets);
}

/**
 * 정북일조 사선제한에 의한 3D 클리핑 프로파일 생성
 * 정북방향 대지경계선으로부터의 거리에 따라 최대높이가 달라지는 3D 꼭짓점 배열
 * 
 * @returns Array of [x, maxHeight, z] for the clipped envelope top surface
 */
export function computeSunlightClipVertices(
    buildablePolygon: [number, number][],
    effectiveMaxHeight: number,
    northBoundaryY: number  // 정북 방향 대지경계선의 Y 좌표 (centered 기준)
): [number, number, number][] {
    const vertices: [number, number, number][] = [];

    for (const [x, y] of buildablePolygon) {
        // 정북방향 대지경계선으로부터의 거리
        const distFromNorth = Math.abs(northBoundaryY - y);
        // 사선제한 적용 높이
        const sunlightH = sunlightMaxHeight(distFromNorth);
        // 유효 높이: 사선제한과 법정 최대높이 중 낮은 값
        const clippedH = Math.min(sunlightH, effectiveMaxHeight);
        vertices.push([x, clippedH, y]);
    }

    return vertices;
}

/**
 * 폴리곤 면적 계산 (Shoelace formula)
 */
export function polygonArea(pts: [number, number][]): number {
    return Math.abs(signedArea(pts));
}

// ─── Max Envelope 계산 ───
export interface MaxEnvelopeResult {
    // 건축 가능 영역
    buildableArea: number;             // 건축 가능 면적 (건폐율 적용, ㎡)
    maxGrossFloorArea: number;         // 최대 연면적 (용적률 적용, ㎡)
    maxFloors: number;                 // 최대 층수
    effectiveMaxHeight: number;        // 유효 최대 높이 (m)

    // 후퇴 정보
    setback: SetbackResult;

    // 정북일조 프로파일
    sunlightProfile: { distance: number; maxHeight: number }[];
    sunlightApplied: boolean;

    // Phase 1-C: 3D 볼륨 데이터
    buildablePolygon: [number, number][];   // 후퇴 적용된 건축가능영역 2D 폴리곤
    sunlightClipVertices: [number, number, number][];  // 사선절단 3D 꼭짓점
    buildablePolygonArea: number;           // 건축가능영역 실 면적 (㎡)

    // 주차
    parkingRequired: number;
    parkingFloorArea: number;          // 주차장 필요 면적 (㎡, 1대당 약 30㎡)

    // 법규 적합성
    bcrCompliant: boolean;             // 건폐율 적합
    farCompliant: boolean;             // 용적률 적합
    heightCompliant: boolean;          // 높이 적합
    allCompliant: boolean;             // 전체 적합
}

export function calculateMaxEnvelope(params: {
    landArea: number;
    landPolygon: [number, number][];
    zoneType: string;
    buildingUse: string;
    floorHeight: number;
    roadWidth: number;
    northAngle: number;
    commercialFloors: number;
    residentialFloors: number;
}): MaxEnvelopeResult {
    const zone = ZONE_REGULATIONS[params.zoneType];
    if (!zone) {
        // fallback
        return getDefaultEnvelope(params);
    }

    const hasSunlight = zone.sunlightRestriction;
    const setback = calculateSetback(params.zoneType, params.roadWidth, hasSunlight);

    // Phase 1-C: 실제 후퇴 적용 건축가능영역 폴리곤 산출
    const buildablePolygon = computeBuildablePolygon(params.landPolygon, setback);
    const buildablePolygonArea = polygonArea(buildablePolygon);

    // 건축 가능 면적 (건폐율 적용)
    const buildableArea = params.landArea * (zone.maxBuildingCoverage / 100);

    // 최대 연면적 (용적률 적용)
    const maxGrossFloorArea = params.landArea * (zone.maxFloorAreaRatio / 100);

    // 최대 층수 (높이 제한 / 층고)
    const totalFloors = params.commercialFloors + params.residentialFloors;
    const currentHeight = totalFloors * params.floorHeight;
    const effectiveMaxHeight = zone.maxHeight || (params.floorHeight * 50); // 높이 무제한이면 50층
    const maxFloors = Math.floor(effectiveMaxHeight / params.floorHeight);

    // 정북일조 프로파일
    const bbox = polygonBBox(params.landPolygon);
    const depth = bbox.height;  // 남북 깊이
    const sunlightProfile = hasSunlight ? generateSunlightProfile(depth) : [];

    // Phase 1-C: 정북일조 사선제한 3D 클리핑
    const northBoundaryY = bbox.maxY;  // 정북방향 = Y 최대값
    const sunlightClipVertices = hasSunlight
        ? computeSunlightClipVertices(buildablePolygon, effectiveMaxHeight, northBoundaryY)
        : buildablePolygon.map(([x, y]) => [x, effectiveMaxHeight, y] as [number, number, number]);

    // 주차 대수
    const currentGross = buildableArea * totalFloors;
    const clampedGross = Math.min(currentGross, maxGrossFloorArea);
    const parkingRequired = calculateParkingRequired(clampedGross, params.buildingUse);
    const parkingFloorArea = parkingRequired * 30; // 1대당 약 30㎡ (램프 포함)

    // 법규 적합성 판단
    const actualBCR = (buildableArea / params.landArea) * 100;
    const actualFAR = (clampedGross / params.landArea) * 100;

    const bcrCompliant = actualBCR <= zone.maxBuildingCoverage;
    const farCompliant = actualFAR <= zone.maxFloorAreaRatio;
    const heightCompliant = zone.maxHeight ? currentHeight <= zone.maxHeight : true;

    return {
        buildableArea,
        maxGrossFloorArea,
        maxFloors,
        effectiveMaxHeight,
        setback,
        sunlightProfile,
        sunlightApplied: hasSunlight,
        buildablePolygon,
        sunlightClipVertices,
        buildablePolygonArea,
        parkingRequired,
        parkingFloorArea,
        bcrCompliant,
        farCompliant,
        heightCompliant,
        allCompliant: bcrCompliant && farCompliant && heightCompliant,
    };
}

function getDefaultEnvelope(params: any): MaxEnvelopeResult {
    const defaultSetback = { front: 1, side: 0.5, rear: 0.5, north: 1.5 };
    const bp = computeBuildablePolygon(params.landPolygon, defaultSetback);
    return {
        buildableArea: params.landArea * 0.6,
        maxGrossFloorArea: params.landArea * 2.5,
        maxFloors: 10,
        effectiveMaxHeight: 33,
        setback: defaultSetback,
        sunlightProfile: [],
        sunlightApplied: false,
        buildablePolygon: bp,
        sunlightClipVertices: bp.map(([x, y]) => [x, 33, y] as [number, number, number]),
        buildablePolygonArea: polygonArea(bp),
        parkingRequired: Math.ceil(params.landArea * 2.5 / 100),
        parkingFloorArea: Math.ceil(params.landArea * 2.5 / 100) * 30,
        bcrCompliant: true,
        farCompliant: true,
        heightCompliant: true,
        allCompliant: true,
    };
}

// 유틸: polygonBBox (store에서도 사용하지만 여기서도 필요)
function polygonBBox(pts: [number, number][]) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
