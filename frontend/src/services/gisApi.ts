/**
 * GIS API Service - 카카오 + Vworld API 연동
 * 
 * 워크플로우:
 *   1. Kakao REST API: 주소 → 위경도(WGS84) + 법정동코드
 *   2. Vworld Data API: 좌표 → 지적도 필지 폴리곤(WKT/GeoJSON)
 *   3. 좌표 변환: WGS84(도) → 로컬 미터(m) → 3D 렌더링
 */

const KAKAO_REST_KEY = '72de5cd34b1d2979f85cdb428756c545';
const VWORLD_API_KEY = 'B8385331-2B58-3CEF-9209-33CB9AFD68A6';

// ─── 타입 정의 ───

export interface KakaoAddressResult {
    address_name: string;
    address_type: string;
    x: string; // longitude
    y: string; // latitude
    address?: {
        address_name: string;
        b_code: string;
        h_code: string;
        region_1depth_name: string;
        region_2depth_name: string;
        region_3depth_name: string;
        mountain_yn: string;
        main_address_no: string;
        sub_address_no: string;
    };
    road_address?: {
        address_name: string;
        building_name: string;
        zone_no: string;
    };
}

export interface ParcelResult {
    pnu: string;
    polygonLocal: [number, number][]; // 로컬 좌표 (미터)
    polygonWGS84: [number, number][]; // 원본 WGS84 좌표
    centerLng: number;
    centerLat: number;
    area: number; // ㎡
    jibun: string;
    addr: string;
}

// ─── WGS84 → 로컬 미터 좌표 변환 ───
// 서울 기준 (lat ≈ 37.5°): 1° lng ≈ 88,300m, 1° lat ≈ 111,320m

function wgs84ToLocalMeters(
    coords: [number, number][],
    centerLng: number,
    centerLat: number
): [number, number][] {
    const latToM = 111320;
    const lngToM = 111320 * Math.cos(centerLat * Math.PI / 180);

    return coords.map(([lng, lat]) => [
        (lng - centerLng) * lngToM,
        (lat - centerLat) * latToM,
    ]);
}

// 면적 계산 (Shoelace formula)
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

// ─── 1. 카카오 주소 검색 ───

export async function searchKakaoAddress(query: string): Promise<KakaoAddressResult[]> {
    if (!query.trim()) return [];

    const url = `/kakao-api/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`;

    const res = await fetch(url, {
        headers: { 'Authorization': `KakaoAK ${KAKAO_REST_KEY}` },
    });

    if (!res.ok) {
        const errText = await res.text();
        console.error('Kakao API error:', res.status, errText);
        try {
            const errObj = JSON.parse(errText);
            if (errObj.message) {
                throw new Error(`카카오 API 거부: ${errObj.message}`);
            }
        } catch (e) {
            // JSON 파싱 실패시 기본 메시지
        }
        throw new Error(`카카오 API 오류 (${res.status}): 활성화 설정을 확인해주세요.`);
    }

    const data = await res.json();
    return data.documents || [];
}

// ─── 2. Vworld 지적도 폴리곤 조회 ───

export async function getVworldParcel(lng: number, lat: number): Promise<ParcelResult | null> {
    // Vworld Data API 2.0 - GetFeature
    // 연속지적도 필지 레이어로 공간 검색
    const layers = ['LP_PA_CBND_BUBUN', 'LT_C_ADSIGOT'];

    for (const layer of layers) {
        try {
            const url = `/vworld-api/req/data?` +
                `service=data&request=GetFeature&data=${layer}` +
                `&key=${VWORLD_API_KEY}` +
                `&domain=http://localhost` +
                `&geomFilter=POINT(${lng} ${lat})` +
                `&geometry=true&crs=EPSG:4326&format=json&size=1`;

            console.log(`[GIS] Vworld 요청 (${layer}):`, url);
            const res = await fetch(url);

            if (!res.ok) {
                console.warn(`[GIS] Vworld ${layer} HTTP 에러:`, res.status);
                continue;
            }

            const data = await res.json();
            console.log(`[GIS] Vworld ${layer} 응답:`, data);

            const features = data?.response?.result?.featureCollection?.features;
            if (!features || features.length === 0) {
                console.warn(`[GIS] Vworld ${layer}: 피처 없음`);
                continue;
            }

            const feature = features[0];
            const geom = feature.geometry;
            const props = feature.properties || {};

            // Polygon 또는 MultiPolygon 처리
            let rawCoords: [number, number][];
            if (geom.type === 'MultiPolygon') {
                rawCoords = geom.coordinates[0][0]; // 첫 번째 폴리곤의 외곽 링
            } else if (geom.type === 'Polygon') {
                rawCoords = geom.coordinates[0]; // 외곽 링
            } else {
                console.warn(`[GIS] 지원하지 않는 geometry type:`, geom.type);
                continue;
            }

            // 마지막 점이 첫 점과 같으면 제거 (닫힌 폴리곤)
            if (rawCoords.length > 1) {
                const first = rawCoords[0];
                const last = rawCoords[rawCoords.length - 1];
                if (Math.abs(first[0] - last[0]) < 1e-10 && Math.abs(first[1] - last[1]) < 1e-10) {
                    rawCoords = rawCoords.slice(0, -1);
                }
            }

            // 중심점 계산
            let cLng = 0, cLat = 0;
            for (const [lo, la] of rawCoords) { cLng += lo; cLat += la; }
            cLng /= rawCoords.length;
            cLat /= rawCoords.length;

            // WGS84 → 로컬 미터 변환
            const localCoords = wgs84ToLocalMeters(rawCoords, cLng, cLat);
            const area = computeArea(localCoords);

            console.log(`[GIS] ✅ 필지 발견: PNU=${props.pnu}, 면적=${area.toFixed(1)}㎡, 꼭짓점=${localCoords.length}개`);

            return {
                pnu: props.pnu || props.PNU || '',
                polygonLocal: localCoords,
                polygonWGS84: rawCoords,
                centerLng: cLng,
                centerLat: cLat,
                area: Math.round(area),
                jibun: props.jibun || props.JIBUN || '',
                addr: props.addr || props.ADDR || '',
            };
        } catch (err) {
            console.warn(`[GIS] Vworld ${layer} 실패:`, err);
            continue;
        }
    }

    return null;
}

// ─── 3. 통합 조회: 주소 → 좌표 → 폴리곤 ───

export async function searchAndGetParcel(address: string): Promise<{
    kakaoResult: KakaoAddressResult;
    parcel: ParcelResult | null;
} | null> {
    const addresses = await searchKakaoAddress(address);
    if (addresses.length === 0) return null;

    const addr = addresses[0];
    const lng = parseFloat(addr.x);
    const lat = parseFloat(addr.y);

    console.log(`[GIS] 카카오 좌표: lng=${lng}, lat=${lat}, 주소=${addr.address_name}`);

    const parcel = await getVworldParcel(lng, lat);

    return { kakaoResult: addr, parcel };
}

// ─── 4. 카카오 카테고리 검색으로 주변 실제 건물 조회 ───

export interface RealBuilding {
    id: string;
    name: string;
    category: string;        // 카카오 카테고리명
    categoryGroup: string;   // 카테고리 그룹코드
    x: number;               // 로컬 미터 (대지 중심 기준)
    z: number;               // 로컬 미터
    lng: number;             // WGS84
    lat: number;             // WGS84
    width: number;           // 추정 폭 (m)
    depth: number;           // 추정 깊이 (m)
    height: number;          // 추정 높이 (m)
    floors: number;          // 추정 층수
    use: 'residential' | 'commercial' | 'office' | 'school' | 'public' | 'mixed' | 'industrial' | 'natural';
    color: string;           // 3D 렌더링 색상
    distance: number;        // 대지 중심에서의 거리 (m)
}

// 카카오 카테고리 그룹코드
const CATEGORY_GROUPS = [
    { code: 'SC4', label: '학교', use: 'school' as const, height: 15, floors: 4, width: 40, depth: 30, color: '#c4b5fd' },
    { code: 'HP8', label: '병원', use: 'public' as const, height: 18, floors: 5, width: 35, depth: 25, color: '#fca5a5' },
    { code: 'PO3', label: '관공서', use: 'public' as const, height: 12, floors: 4, width: 25, depth: 20, color: '#93c5fd' },
    { code: 'BK9', label: '은행', use: 'commercial' as const, height: 9, floors: 3, width: 15, depth: 12, color: '#fde68a' },
    { code: 'MT1', label: '대형마트', use: 'commercial' as const, height: 12, floors: 3, width: 50, depth: 40, color: '#fdba74' },
    { code: 'CT1', label: '문화시설', use: 'public' as const, height: 15, floors: 4, width: 30, depth: 25, color: '#a5b4fc' },
    { code: 'AT4', label: '관광명소', use: 'public' as const, height: 9, floors: 2, width: 20, depth: 15, color: '#86efac' },
    { code: 'SW8', label: '지하철역', use: 'public' as const, height: 6, floors: 1, width: 20, depth: 15, color: '#c4b5fd' },
    { code: 'CE7', label: '카페', use: 'commercial' as const, height: 6, floors: 2, width: 10, depth: 8, color: '#fcd34d' },
    { code: 'CS2', label: '편의점', use: 'commercial' as const, height: 4, floors: 1, width: 8, depth: 6, color: '#d4d4d8' },
];

// 카카오 키워드 검색으로 아파트/주택 가져오기
const KEYWORD_SEARCHES = [
    { keyword: '아파트', use: 'residential' as const, height: 45, floors: 15, width: 50, depth: 15, color: '#e2e8f0' },
    { keyword: '빌라', use: 'residential' as const, height: 15, floors: 5, width: 12, depth: 10, color: '#e2e8f0' },
    { keyword: '오피스텔', use: 'mixed' as const, height: 36, floors: 12, width: 20, depth: 18, color: '#d4d4d8' },
    { keyword: '공장', use: 'industrial' as const, height: 10, floors: 2, width: 40, depth: 30, color: '#a8a29e' },
];

async function kakaoKeywordSearch(
    keyword: string,
    lng: number,
    lat: number,
    radius: number = 500
): Promise<any[]> {
    try {
        const url = `/kakao-api/v2/local/search/keyword.json?query=${encodeURIComponent(keyword)}&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`;
        const res = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${KAKAO_REST_KEY}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.documents || [];
    } catch {
        return [];
    }
}

async function kakaoCategorySearch(
    categoryGroup: string,
    lng: number,
    lat: number,
    radius: number = 500
): Promise<any[]> {
    try {
        const url = `/kakao-api/v2/local/search/category.json?category_group_code=${categoryGroup}&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`;
        const res = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${KAKAO_REST_KEY}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.documents || [];
    } catch {
        return [];
    }
}

export async function fetchSurroundingBuildings(
    centerLng: number,
    centerLat: number,
    radius: number = 500
): Promise<RealBuilding[]> {
    console.log(`[GIS] 주변 건물 검색 시작: (${centerLng}, ${centerLat}), 반경=${radius}m`);

    const buildings: RealBuilding[] = [];
    const seen = new Set<string>(); // 중복 제거 (좌표 기반)

    // 1) 카카오 카테고리 검색
    for (const cat of CATEGORY_GROUPS) {
        const docs = await kakaoCategorySearch(cat.code, centerLng, centerLat, radius);
        for (const doc of docs) {
            const bLng = parseFloat(doc.x);
            const bLat = parseFloat(doc.y);
            const key = `${bLng.toFixed(5)}_${bLat.toFixed(5)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const [localX, localZ] = wgs84ToLocalMeters([[bLng, bLat]], centerLng, centerLat)[0];
            const dist = Math.sqrt(localX * localX + localZ * localZ);

            // 대지 자체 위치(10m 이내)는 제외
            if (dist < 10) continue;

            // 거리에 따라 크기 약간 변동 (먼 건물은 더 클 수 있음)
            const sizeFactor = 0.8 + Math.random() * 0.4;

            buildings.push({
                id: `cat_${cat.code}_${doc.id || buildings.length}`,
                name: doc.place_name || '',
                category: cat.label,
                categoryGroup: cat.code,
                x: localX,
                z: localZ,
                lng: bLng,
                lat: bLat,
                width: cat.width * sizeFactor,
                depth: cat.depth * sizeFactor,
                height: cat.height * (0.8 + Math.random() * 0.4),
                floors: cat.floors,
                use: cat.use,
                color: cat.color,
                distance: dist,
            });
        }
    }

    // 2) 키워드 검색 (아파트, 빌라, 오피스텔 등)
    for (const kw of KEYWORD_SEARCHES) {
        const docs = await kakaoKeywordSearch(kw.keyword, centerLng, centerLat, radius);
        for (const doc of docs) {
            const bLng = parseFloat(doc.x);
            const bLat = parseFloat(doc.y);
            const key = `${bLng.toFixed(5)}_${bLat.toFixed(5)}`;
            if (seen.has(key)) continue;
            seen.add(key);

            const [localX, localZ] = wgs84ToLocalMeters([[bLng, bLat]], centerLng, centerLat)[0];
            const dist = Math.sqrt(localX * localX + localZ * localZ);
            if (dist < 10) continue;

            const sizeFactor = 0.8 + Math.random() * 0.4;

            buildings.push({
                id: `kw_${kw.keyword}_${doc.id || buildings.length}`,
                name: doc.place_name || '',
                category: kw.keyword,
                categoryGroup: 'KW',
                x: localX,
                z: localZ,
                lng: bLng,
                lat: bLat,
                width: kw.width * sizeFactor,
                depth: kw.depth * sizeFactor,
                height: kw.height * (0.7 + Math.random() * 0.6),
                floors: kw.floors,
                use: kw.use,
                color: kw.color,
                distance: dist,
            });
        }
    }

    // 거리순 정렬
    buildings.sort((a, b) => a.distance - b.distance);

    console.log(`[GIS] ✅ 총 ${buildings.length}개 실제 주변 건물 발견`);
    return buildings;
}
