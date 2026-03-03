
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows, PerspectiveCamera, Line, Text, Html, Bounds } from '@react-three/drei';
import { useProjectStore, polygonCentroid, polygonBBox, MOCK_SITE_CONTEXTS, type NearbyBuilding, type RoadSegment, type TreeData, type SiteContext } from '@/store/projectStore';
import { useMemo, useEffect, useRef } from 'react';
import * as THREE from 'three';

// ─── 층별 색상 매핑 ───
const FLOOR_COLORS: Record<string, string> = {
    parking: '#64748b',
    commercial: '#2e8fff',
    residential: '#f59e0b',
    office: '#06b6d4',
};

// ─── 카메라 자동 조정 (장면 대각선 기반 + 탑뷰 각도) ───
function CameraAdjuster() {
    const polygon = useProjectStore(s => s.landPolygon);
    const floorHeight = useProjectStore(s => s.floorHeight);
    const commercialFloors = useProjectStore(s => s.commercialFloors);
    const residentialFloors = useProjectStore(s => s.residentialFloors);
    const { camera, controls, size } = useThree();

    useEffect(() => {
        if (!polygon || polygon.length < 3) return;

        const center = polygonCentroid(polygon);
        const centered = polygon.map(([x, y]) => [x - center[0], y - center[1]] as [number, number]);
        const bbox = polygonBBox(centered);

        // 건물 높이 계산
        const totalFloors = commercialFloors + residentialFloors;
        const buildingHeight = totalFloors * floorHeight;

        // 장면의 3D 대각선 크기 — 주변 환경 건물 반경까지 포함
        const contextRadius = Math.max(bbox.width, bbox.height) * 3.5; // 주변 건물들 전부 포함
        const sceneDiagonal = Math.sqrt(
            contextRadius * contextRadius * 2 +
            buildingHeight * buildingHeight
        );

        console.log(`[Camera] 대지: ${bbox.width.toFixed(1)}x${bbox.height.toFixed(1)}m, 건물: ${buildingHeight.toFixed(1)}m, 컨텍스트반경: ${contextRadius.toFixed(1)}m`);

        // Forma/TestFit 스타일: 넓은 조감도 (주변 건물 전부 포함)
        const finalDistance = Math.max(sceneDiagonal * 1.3, 120);

        // 장면 중심 = 건물 높이의 1/5 (지면 중심에 가깝게)
        const targetY = buildingHeight / 5;

        // ★ Forma 스타일 — 약 30~35도에서 내려다보기 (넓은 도시 컨텍스트 조감도)
        const dir = new THREE.Vector3(0.55, 0.55, 0.75).normalize();
        camera.position.set(
            dir.x * finalDistance,
            targetY + dir.y * finalDistance,
            dir.z * finalDistance
        );

        // 동적 클리핑 평면
        (camera as any).near = Math.max(finalDistance * 0.001, 0.1);
        (camera as any).far = finalDistance * 20;

        // 장면 중심을 바라봄
        camera.lookAt(0, targetY, 0);
        camera.updateProjectionMatrix();

        if (controls && (controls as any).target) {
            (controls as any).target.set(0, targetY, 0);
            (controls as any).update();
        }

        console.log(`[Camera] dist=${finalDistance.toFixed(1)}, target=(0, ${targetY.toFixed(1)}, 0), pos=(${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)})`);

    }, [polygon, floorHeight, commercialFloors, residentialFloors, camera, controls, size]);

    return null;
}

// ─── 개별 층 컴포넌트 ───
function FloorBlock({
    width, depth, height, y, color, floorIndex, isSelected, onClick
}: {
    width: number; depth: number; height: number; y: number;
    color: string; floorIndex: number; isSelected: boolean; onClick: () => void;
}) {
    // 층별 PBR 재질 설정
    const materialProps = useMemo(() => {
        if (color === FLOOR_COLORS.parking) {
            // 주차층: 콘크리트 느낌
            return { roughness: 0.8, metalness: 0.2, clearcoat: 0, clearcoatRoughness: 0 };
        } else if (color === FLOOR_COLORS.commercial) {
            // 상업층: 유리 커튼월
            return { roughness: 0.15, metalness: 0.5, clearcoat: 0.8, clearcoatRoughness: 0.1 };
        } else {
            // 주거층: 따뜻한 마감
            return { roughness: 0.35, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.3 };
        }
    }, [color]);

    return (
        <mesh
            position={[0, y + height / 2, 0]}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            castShadow
            receiveShadow
        >
            <boxGeometry args={[width, height - 0.05, depth]} />
            <meshPhysicalMaterial
                color={color}
                transparent
                opacity={isSelected ? 1 : 0.85}
                emissive={isSelected ? color : '#000000'}
                emissiveIntensity={isSelected ? 0.2 : 0}
                {...materialProps}
                envMapIntensity={1.2}
            />
            {/* 최소한의 층 구분선만 표시 */}
            <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(width, height - 0.05, depth)]} />
                <lineBasicMaterial color="#000000" transparent opacity={0.04} />
            </lineSegments>
        </mesh>
    );
}

// ─── 대지 경계 폴리곤 (동적 중심점 계산) ───
function LandBoundary() {
    const polygon = useProjectStore(s => s.landPolygon);

    const { centeredPts, center } = useMemo(() => {
        const c = polygonCentroid(polygon);
        return {
            center: c,
            centeredPts: polygon.map(([x, y]) => [x - c[0], y - c[1]] as [number, number]),
        };
    }, [polygon]);

    const shape = useMemo(() => {
        if (!centeredPts || centeredPts.length < 3) {
            console.warn('[3D] Invalid polygon points:', centeredPts);
            return new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(10, 0), new THREE.Vector2(10, 10)]);
        }

        const pts = centeredPts.map(([x, y]) => {
            if (isNaN(x) || isNaN(y)) {
                console.error('[3D] NaN detected in centeredPts:', centeredPts);
                return new THREE.Vector2(0, 0);
            }
            return new THREE.Vector2(x, y);
        });
        return new THREE.Shape(pts);
    }, [centeredPts]);

    // 대지 면적 표시 좌표 (3D 공간)
    const bbox = useMemo(() => polygonBBox(centeredPts), [centeredPts]);

    return (
        <group position={[0, 0.01, 0]}>
            {/* 대지 면 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <shapeGeometry args={[shape]} />
                <meshPhysicalMaterial
                    color="#22c55e"
                    transparent
                    opacity={0.18}
                    roughness={0.6}
                    metalness={0}
                    side={THREE.DoubleSide}
                    envMapIntensity={0.5}
                />
            </mesh>

            {/* 대지 경계선 (3D 좌표 직접 지정) — 두꺼운 녹색 */}
            <Line
                points={[...centeredPts, centeredPts[0]].map(([x, y]) => [x, 0.06, -y] as [number, number, number])}
                color="#16a34a"
                lineWidth={4}
            />

            {/* 꼭짓점 마커 */}
            {centeredPts.map(([x, y], i) => (
                <mesh key={i} position={[x, 0.05, -y]}>
                    <sphereGeometry args={[0.2, 8, 8]} />
                    <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.5} />
                </mesh>
            ))}

            {/* 치수선 (가로) */}
            <Line
                points={[
                    [bbox.minX, 0.03, -bbox.minY + 1.5] as [number, number, number],
                    [bbox.maxX, 0.03, -bbox.minY + 1.5] as [number, number, number],
                ]}
                color="#94a3b8"
                lineWidth={1}
                dashed
                dashSize={0.3}
                gapSize={0.2}
            />
            {/* 치수선 (세로) */}
            <Line
                points={[
                    [bbox.maxX + 1.5, 0.03, -bbox.minY] as [number, number, number],
                    [bbox.maxX + 1.5, 0.03, -bbox.maxY] as [number, number, number],
                ]}
                color="#94a3b8"
                lineWidth={1}
                dashed
                dashSize={0.3}
                gapSize={0.2}
            />
        </group>
    );
}

// ─── 건물 매스 (Massing) ───
function BuildingMass() {
    const polygon = useProjectStore(s => s.landPolygon);
    const buildingCoverageLimit = useProjectStore(s => s.buildingCoverageLimit);
    const floorHeight = useProjectStore(s => s.floorHeight);
    const commercialFloors = useProjectStore(s => s.commercialFloors);
    const residentialFloors = useProjectStore(s => s.residentialFloors);
    const selectedFloor = useProjectStore(s => s.selectedFloor);
    const setSelectedFloor = useProjectStore(s => s.setSelectedFloor);

    const totalFloors = commercialFloors + residentialFloors;

    // 동적으로 건축 폴리곤의 중심/바운딩 박스에서 건물 크기 계산
    const { buildW, buildD } = useMemo(() => {
        const center = polygonCentroid(polygon);
        const centered = polygon.map(([x, y]) => [x - center[0], y - center[1]] as [number, number]);
        const bbox = polygonBBox(centered);
        const coverage = buildingCoverageLimit / 100;
        return {
            buildW: bbox.width * Math.sqrt(coverage) * 0.85,
            buildD: bbox.height * Math.sqrt(coverage) * 0.85,
        };
    }, [polygon, buildingCoverageLimit]);

    const floors = useMemo(() => {
        const result = [];
        for (let i = 0; i < totalFloors; i++) {
            let color = FLOOR_COLORS.residential;
            if (i === 0) color = FLOOR_COLORS.parking;
            else if (i < commercialFloors) color = FLOOR_COLORS.commercial;

            result.push({
                index: i,
                y: i * floorHeight,
                height: floorHeight,
                color,
                width: i === 0 ? buildW * 0.6 : buildW,
                depth: buildD,
            });
        }
        return result;
    }, [totalFloors, commercialFloors, floorHeight, buildW, buildD]);

    return (
        <group>
            {floors.map((f) => (
                <FloorBlock
                    key={f.index}
                    width={f.width}
                    depth={f.depth}
                    height={f.height}
                    y={f.y}
                    color={f.color}
                    floorIndex={f.index}
                    isSelected={selectedFloor === f.index}
                    onClick={() => setSelectedFloor(selectedFloor === f.index ? null : f.index)}
                />
            ))}
        </group>
    );
}

// ─── 4방위 나침반 표시 (N/S/E/W) ───
function NorthIndicator() {
    const polygon = useProjectStore(s => s.landPolygon);
    const { compassPos, armLen, arrowSz, labelSz } = useMemo(() => {
        const c = polygonCentroid(polygon);
        const cp = polygon.map(([x, y]) => [x - c[0], y - c[1]] as [number, number]);
        const bbox = polygonBBox(cp);
        const sz = Math.max(bbox.width, bbox.height);
        // 대지 좌측 앞쪽 (카메라 기본 뷰에서 항상 보이는 위치)
        const arm = Math.max(sz * 0.25, 5);
        return {
            compassPos: [-(sz * 0.9), 0.5, -(bbox.minY - sz * 0.5)] as [number, number, number],
            armLen: arm,
            arrowSz: arm * 0.2,
            labelSz: Math.max(arm * 0.5, 2),
        };
    }, [polygon]);

    return (
        <group position={compassPos}>
            {/* 원형 베이스 링 */}
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[armLen * 0.9, armLen, 48]} />
                <meshStandardMaterial color="#64748b" transparent opacity={0.3} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
                <circleGeometry args={[armLen * 0.9, 48]} />
                <meshStandardMaterial color="#f8fafc" transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>

            {/* ── 북 (N) — 빨간색, 삼각형 화살촉 ── */}
            <Line points={[[0, 0.1, 0], [0, 0.1, -armLen]] as [number, number, number][]} color="#ef4444" lineWidth={3} />
            <mesh position={[0, 0.1, -(armLen + arrowSz)]} rotation={[Math.PI / 2, 0, 0]}>
                <coneGeometry args={[arrowSz * 0.6, arrowSz * 1.5, 4]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
            </mesh>
            <Html position={[0, 0.5, -(armLen + arrowSz * 3)]} center style={{ pointerEvents: 'none' }}>
                <div style={{ color: '#ef4444', fontSize: '18px', fontWeight: 'bold', textShadow: '0 0 4px rgba(0,0,0,0.5)', userSelect: 'none' }}>N</div>
            </Html>

            {/* ── 남 (S) ── */}
            <Line points={[[0, 0.1, 0], [0, 0.1, armLen]] as [number, number, number][]} color="#94a3b8" lineWidth={1.5} />
            <Html position={[0, 0.5, armLen + arrowSz * 1.5]} center style={{ pointerEvents: 'none' }}>
                <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 'bold', textShadow: '0 0 4px rgba(0,0,0,0.5)', userSelect: 'none' }}>S</div>
            </Html>

            {/* ── 동 (E) ── */}
            <Line points={[[0, 0.1, 0], [armLen, 0.1, 0]] as [number, number, number][]} color="#94a3b8" lineWidth={1.5} />
            <Html position={[armLen + arrowSz * 1.5, 0.5, 0]} center style={{ pointerEvents: 'none' }}>
                <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 'bold', textShadow: '0 0 4px rgba(0,0,0,0.5)', userSelect: 'none' }}>E</div>
            </Html>

            {/* ── 서 (W) ── */}
            <Line points={[[0, 0.1, 0], [-armLen, 0.1, 0]] as [number, number, number][]} color="#94a3b8" lineWidth={1.5} />
            <Html position={[-(armLen + arrowSz * 1.5), 0.5, 0]} center style={{ pointerEvents: 'none' }}>
                <div style={{ color: '#94a3b8', fontSize: '14px', fontWeight: 'bold', textShadow: '0 0 4px rgba(0,0,0,0.5)', userSelect: 'none' }}>W</div>
            </Html>

            {/* 중심 점 */}
            <mesh position={[0, 0.15, 0]}>
                <sphereGeometry args={[arrowSz * 0.3, 8, 8]} />
                <meshStandardMaterial color="#475569" />
            </mesh>
        </group>
    );
}

// ─── 주변 건물 매스 (Forma/TestFit 스타일) ───
const BUILDING_USE_COLORS: Record<string, string> = {
    residential: '#e2e8f0',
    commercial: '#cbd5e1',
    office: '#d4d4d8',
    mixed: '#d6d3d1',
    parking: '#c7c7c7',
};

function SurroundingBuildings({ context }: { context: SiteContext }) {
    return (
        <group>
            {context.buildings.map((b) => {
                const color = b.color || BUILDING_USE_COLORS[b.use] || '#e2e8f0';
                return (
                    <group key={b.id} position={[b.x, 0, -b.z]}>
                        {/* 건물 매스 */}
                        <mesh position={[0, b.height / 2, 0]} castShadow receiveShadow>
                            <boxGeometry args={[b.width, b.height, b.depth]} />
                            <meshStandardMaterial
                                color={color}
                                roughness={0.85}
                                metalness={0.05}
                            />
                        </mesh>

                        {/* 층 분리선 (3층 이상) */}
                        {b.floors >= 3 && Array.from({ length: Math.min(b.floors - 1, 15) }, (_, i) => {
                            const lineY = (i + 1) * (b.height / b.floors);
                            return (
                                <Line
                                    key={`fl-${i}`}
                                    points={[
                                        [-b.width / 2 - 0.02, lineY, b.depth / 2 + 0.02] as [number, number, number],
                                        [b.width / 2 + 0.02, lineY, b.depth / 2 + 0.02] as [number, number, number],
                                    ]}
                                    color="#b0b8c4"
                                    lineWidth={0.5}
                                />
                            );
                        })}

                        {/* 옥상 디테일 (높은 건물) */}
                        {b.height > 20 && (
                            <mesh position={[b.width * 0.15, b.height + 1.2, -b.depth * 0.1]} castShadow>
                                <boxGeometry args={[b.width * 0.3, 2.4, b.depth * 0.25]} />
                                <meshStandardMaterial color="#94a3b8" roughness={0.9} />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </group>
    );
}

// ─── 도로 표면 ───
function RoadSurfaces({ context }: { context: SiteContext }) {
    return (
        <group>
            {context.roads.map((road) => {
                const p0 = road.points[0];
                const p1 = road.points[road.points.length - 1];
                const dx = p1[0] - p0[0];
                const dz = p1[1] - p0[1];
                const length = Math.sqrt(dx * dx + dz * dz);
                const angle = Math.atan2(dx, dz);
                const cx = (p0[0] + p1[0]) / 2;
                const cz = (p0[1] + p1[1]) / 2;

                const roadColor = road.type === 'main' ? '#6b7280' : road.type === 'local' ? '#78716c' : '#9ca3af';
                const roadY = road.type === 'main' ? 0.02 : 0.01;

                return (
                    <group key={road.id}>
                        {/* 도로면 */}
                        <mesh
                            rotation={[-Math.PI / 2, angle, 0]}
                            position={[cx, roadY, -cz]}
                        >
                            <planeGeometry args={[road.width, length]} />
                            <meshStandardMaterial
                                color={roadColor}
                                roughness={0.95}
                                metalness={0}
                            />
                        </mesh>

                        {/* 도로 중앙선 (메인 도로) */}
                        {road.type === 'main' && (
                            <Line
                                points={road.points.map(([x, z]) => [x, roadY + 0.02, -z] as [number, number, number])}
                                color="#fbbf24"
                                lineWidth={1.5}
                                dashed
                                dashSize={1.5}
                                gapSize={1}
                            />
                        )}

                        {/* 도로명 라벨 */}
                        {road.name && (
                            <Text
                                position={[cx, roadY + 0.1, -cz]}
                                fontSize={road.type === 'main' ? 1.8 : 1.2}
                                color="#9ca3af"
                                anchorX="center"
                                anchorY="middle"
                                rotation={[-Math.PI / 2, 0, 0]}
                            >
                                {road.name}
                            </Text>
                        )}

                        {/* 인도 (메인 도로 양쪽) */}
                        {road.type === 'main' && (
                            <>
                                {[-1, 1].map(side => {
                                    const sw = 1.5; // 인도 폭
                                    const offset = (road.width / 2 + sw / 2) * side;
                                    // 도로가 수평인지 수직인지
                                    const isHorizontal = Math.abs(dx) > Math.abs(dz);
                                    return (
                                        <mesh
                                            key={`sw-${side}`}
                                            rotation={[-Math.PI / 2, angle, 0]}
                                            position={[
                                                cx + (isHorizontal ? 0 : offset),
                                                0.04,
                                                -(cz + (isHorizontal ? offset : 0))
                                            ]}
                                        >
                                            <planeGeometry args={[isHorizontal ? sw : sw, isHorizontal ? length : length]} />
                                            <meshStandardMaterial color="#d1d5db" roughness={0.9} />
                                        </mesh>
                                    );
                                })}
                            </>
                        )}
                    </group>
                );
            })}
        </group>
    );
}

// ─── 수목 (간이 3D 나무) ───
function TreeInstances({ context }: { context: SiteContext }) {
    return (
        <group>
            {context.trees.map((tree, i) => {
                const trunkH = tree.height * 0.4;
                const canopyH = tree.height * 0.6;
                const trunkR = tree.canopyRadius * 0.15;
                const isConifer = tree.type === 'conifer';

                return (
                    <group key={`tree-${i}`} position={[tree.x, 0, -tree.z]}>
                        {/* 줄기 */}
                        <mesh position={[0, trunkH / 2, 0]} castShadow>
                            <cylinderGeometry args={[trunkR, trunkR * 1.3, trunkH, 6]} />
                            <meshStandardMaterial color="#78716c" roughness={0.9} />
                        </mesh>
                        {/* 수관 */}
                        {isConifer ? (
                            <mesh position={[0, trunkH + canopyH / 2, 0]} castShadow>
                                <coneGeometry args={[tree.canopyRadius, canopyH, 8]} />
                                <meshStandardMaterial color="#4d7c51" roughness={0.8} />
                            </mesh>
                        ) : (
                            <mesh position={[0, trunkH + canopyH * 0.4, 0]} castShadow>
                                <sphereGeometry args={[tree.canopyRadius, 8, 6]} />
                                <meshStandardMaterial color="#5b9e5f" roughness={0.75} />
                            </mesh>
                        )}
                    </group>
                );
            })}
        </group>
    );
}

// ─── 확장 지면 (도시 블록 느낌) ───
function UrbanGroundPlane() {
    return (
        <group>
            {/* 넓은 지면 (밝은 회색) */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} receiveShadow>
                <planeGeometry args={[400, 400]} />
                <meshStandardMaterial color="#f0f0f0" roughness={0.95} metalness={0} />
            </mesh>
        </group>
    );
}

// ─── 주변 환경 통합 레이어 ───
function SiteContextLayer() {
    const selectedParcelId = useProjectStore(s => s.selectedParcelId);
    const polygon = useProjectStore(s => s.landPolygon);
    const isRealParcel = useProjectStore(s => s.isRealParcel);
    const realBuildings = useProjectStore(s => s.realSurroundingBuildings);

    // 실제 건물 데이터가 있으면 변환하여 사용
    const context = useMemo((): SiteContext | null => {
        const c = polygonCentroid(polygon);
        const cp = polygon.map(([x, y]) => [x - c[0], y - c[1]] as [number, number]);
        const bbox = polygonBBox(cp);
        const scale = Math.max(bbox.width, bbox.height);

        // ★ 실제 주변 건물 데이터가 있으면 우선 사용
        if (realBuildings && realBuildings.length > 0) {
            console.log(`[3D] 실제 주변 건물 ${realBuildings.length}개 렌더링`);

            const buildings: NearbyBuilding[] = realBuildings.map(rb => ({
                id: rb.id,
                x: rb.x,
                z: rb.z,
                width: rb.width,
                depth: rb.depth,
                height: rb.height,
                floors: rb.floors,
                use: rb.use === 'school' ? 'residential' :
                    rb.use === 'public' ? 'office' :
                        rb.use === 'industrial' ? 'mixed' :
                            rb.use === 'natural' ? 'residential' :
                                rb.use as any,
                color: rb.color,
            }));

            return {
                buildings,
                roads: [
                    { id: 'ar1', points: [[-(scale * 3.5), bbox.minY - 5], [scale * 3.5, bbox.minY - 5]], width: 8, name: '전면도로', type: 'main' },
                    { id: 'ar2', points: [[bbox.minX - 8, -(scale * 3.5)], [bbox.minX - 8, scale * 3.5]], width: 6, type: 'local' },
                ],
                trees: [
                    { x: -scale * 0.5, z: bbox.minY - 4, height: 6, canopyRadius: 2, type: 'deciduous' },
                    { x: scale * 0.3, z: bbox.minY - 4, height: 5, canopyRadius: 2, type: 'deciduous' },
                    { x: -scale * 0.8, z: -scale * 0.3, height: 7, canopyRadius: 2.5, type: 'deciduous' },
                    { x: scale * 0.9, z: scale * 0.2, height: 5, canopyRadius: 2, type: 'conifer' },
                ],
            };
        }

        // Mock 필지일 경우 미리 정의된 데이터 사용
        if (selectedParcelId && MOCK_SITE_CONTEXTS[selectedParcelId]) {
            return MOCK_SITE_CONTEXTS[selectedParcelId];
        }

        // API 필지이지만 실제 건물이 아직 로드 안 됐을 때 — 기본 Mock
        if (isRealParcel && polygon.length >= 3) {
            return {
                buildings: [
                    { id: 'an1', x: -scale * 0.8, z: -scale * 0.6, width: scale * 0.4, depth: scale * 0.35, height: 15, floors: 5, use: 'residential' },
                    { id: 'an2', x: scale * 0.5, z: -scale * 0.7, width: scale * 0.5, depth: scale * 0.3, height: 21, floors: 7, use: 'office' },
                    { id: 'an3', x: -scale * 0.6, z: scale * 0.8, width: scale * 0.45, depth: scale * 0.3, height: 12, floors: 4, use: 'commercial' },
                    { id: 'an4', x: scale * 0.7, z: scale * 0.5, width: scale * 0.3, depth: scale * 0.4, height: 18, floors: 6, use: 'mixed' },
                ],
                roads: [
                    { id: 'ar1', points: [[-(scale * 3.5), bbox.minY - 5], [scale * 3.5, bbox.minY - 5]], width: 8, name: '전면도로', type: 'main' },
                    { id: 'ar2', points: [[bbox.minX - 8, -(scale * 3.5)], [bbox.minX - 8, scale * 3.5]], width: 6, type: 'local' },
                ],
                trees: [],
            };
        }

        return MOCK_SITE_CONTEXTS['gangnam-yeoksam'] || null;
    }, [selectedParcelId, polygon, isRealParcel, realBuildings]);

    if (!context) return null;

    return (
        <group>
            <RoadSurfaces context={context} />
            <SurroundingBuildings context={context} />
            <TreeInstances context={context} />
        </group>
    );
}

// ─── Max Envelope 3D 시각화 (Phase 1-C: 실제 기하학적 볼륨) ───
function MaxEnvelopeVisualization() {
    const showMaxEnvelope = useProjectStore(s => s.showMaxEnvelope);
    const maxEnvelope = useProjectStore(s => s.maxEnvelope);
    const polygon = useProjectStore(s => s.landPolygon);
    const northAngle = useProjectStore(s => s.northAngle);

    // 대지 중심점 기반 좌표 변환
    const { center, centeredLandPts } = useMemo(() => {
        const c = polygonCentroid(polygon);
        return {
            center: c,
            centeredLandPts: polygon.map(([x, y]) => [x - c[0], y - c[1]] as [number, number]),
        };
    }, [polygon]);

    // ── 건축가능영역(후퇴 적용) 폴리곤을 중심 기준으로 변환 ──
    const centeredBuildable = useMemo(() => {
        if (!maxEnvelope?.buildablePolygon) return [];
        return maxEnvelope.buildablePolygon.map(
            ([x, y]) => [x - center[0], y - center[1]] as [number, number]
        );
    }, [maxEnvelope, center]);

    // ── 사선절단 3D 꼭짓점을 중심 기준으로 변환 ──
    const centeredClipVerts = useMemo(() => {
        if (!maxEnvelope?.sunlightClipVertices) return [];
        return maxEnvelope.sunlightClipVertices.map(
            ([x, h, z]) => [x - center[0], h, z - center[1]] as [number, number, number]
        );
    }, [maxEnvelope, center]);

    // ── Max Envelope 3D 볼륨 지오메트리 생성 ──
    const envelopeGeometry = useMemo(() => {
        if (centeredBuildable.length < 3 || centeredClipVerts.length < 3) return null;

        const n = centeredBuildable.length;
        const positions: number[] = [];
        const indices: number[] = [];

        // ── 바닥면 (Y=0) ──
        // 바닥 꼭짓점: indices 0 ~ n-1
        for (const [x, y] of centeredBuildable) {
            positions.push(x, 0, -y); // Three.js: Z = -Y(2D)
        }

        // ── 상단면 (사선절단된 높이) ──
        // 상단 꼭짓점: indices n ~ 2n-1
        for (const [x, h, z] of centeredClipVerts) {
            positions.push(x, h, -z); // Three.js: Z = -Z(2D Y)
        }

        // ── 바닥면 삼각형 (fan triangulation) ──
        for (let i = 1; i < n - 1; i++) {
            indices.push(0, i + 1, i); // CCW winding from below
        }

        // ── 상단면 삼각형 ──
        for (let i = 1; i < n - 1; i++) {
            indices.push(n, n + i, n + i + 1); // CCW winding from above
        }

        // ── 측면 삼각형 (하단-상단 연결) ──
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const bi = i;       // 바닥 i
            const bj = j;       // 바닥 j
            const ti = n + i;   // 상단 i
            const tj = n + j;   // 상단 j
            // 2개 삼각형으로 사각형 면 구성
            indices.push(bi, bj, tj);
            indices.push(bi, tj, ti);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        return geo;
    }, [centeredBuildable, centeredClipVerts]);

    // ── 와이어프레임 라인 데이터 ──
    const wireframeLines = useMemo(() => {
        if (centeredBuildable.length < 3 || centeredClipVerts.length < 3) return { bottom: [], top: [], verticals: [] };

        const n = centeredBuildable.length;

        // 바닥 윤곽선
        const bottom: [number, number, number][] = [
            ...centeredBuildable.map(([x, y]) => [x, 0.03, -y] as [number, number, number]),
            [centeredBuildable[0][0], 0.03, -centeredBuildable[0][1]],
        ];

        // 상단 윤곽선 (사선절단)
        const top: [number, number, number][] = [
            ...centeredClipVerts.map(([x, h, z]) => [x, h, -z] as [number, number, number]),
            [centeredClipVerts[0][0], centeredClipVerts[0][1], -centeredClipVerts[0][2]],
        ];

        // 수직 모서리선
        const verticals: [number, number, number][][] = [];
        for (let i = 0; i < n; i++) {
            verticals.push([
                [centeredBuildable[i][0], 0, -centeredBuildable[i][1]],
                [centeredClipVerts[i][0], centeredClipVerts[i][1], -centeredClipVerts[i][2]],
            ]);
        }

        return { bottom, top, verticals };
    }, [centeredBuildable, centeredClipVerts]);

    // ── 사선제한 경사면 (정북방향 사선 시각화) ──
    const slopeGeometry = useMemo(() => {
        if (!maxEnvelope?.sunlightApplied || centeredBuildable.length < 3) return null;

        const bbox = polygonBBox(centeredBuildable);
        const envH = maxEnvelope.effectiveMaxHeight;
        const slopeStartH = 9; // 9m 이하: 1.5m 후퇴만

        // 사선 경계: 9m 높이에서 시작, 최대높이까지 기울어지는 면
        // 9m → 시작점(정북 경계 + 1.5m 후퇴)
        // envH → 끝점(시작점 + (envH-9)/2 만큼 남쪽으로 이동)
        const slopeDepth = (envH - slopeStartH) / 2; // H/2 기울기의 수평 이동거리

        // 사선면의 4개 꼭짓점
        const northZ = -bbox.maxY; // 정북 = 3D의 -Z 방향
        const slopeVerts = [
            [bbox.minX - 1, slopeStartH, northZ],        // 좌 하단 (9m)
            [bbox.maxX + 1, slopeStartH, northZ],        // 우 하단 (9m)
            [bbox.maxX + 1, envH, northZ + slopeDepth],  // 우 상단 (최대높이)
            [bbox.minX - 1, envH, northZ + slopeDepth],  // 좌 상단 (최대높이)
        ];

        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array([
            ...slopeVerts[0], ...slopeVerts[1], ...slopeVerts[2],
            ...slopeVerts[0], ...slopeVerts[2], ...slopeVerts[3],
        ] as number[]);
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return { geo, verts: slopeVerts };
    }, [maxEnvelope, centeredBuildable]);

    // ── 후퇴거리 레이블 ──
    const setbackLabels = useMemo(() => {
        if (!maxEnvelope) return [];
        const sb = maxEnvelope.setback;
        const landBbox = polygonBBox(centeredLandPts);
        const buildBbox = polygonBBox(centeredBuildable);

        return [
            { text: `전면 ${sb.front}m`, pos: [0, 0.5, -landBbox.minY + 0.5] as [number, number, number], color: '#8b5cf6' },
            { text: `정북 ${sb.north}m`, pos: [0, 0.5, -landBbox.maxY - 0.5] as [number, number, number], color: '#ef4444' },
            { text: `측면 ${sb.side}m`, pos: [landBbox.maxX + 0.5, 0.5, -(landBbox.minY + landBbox.maxY) / 2] as [number, number, number], color: '#8b5cf6' },
        ];
    }, [maxEnvelope, centeredLandPts, centeredBuildable]);

    if (!showMaxEnvelope || !maxEnvelope) return null;

    const envH = maxEnvelope.effectiveMaxHeight;

    return (
        <group rotation={[0, (northAngle * Math.PI) / 180, 0]}>
            {/* ── 건축가능영역 바닥면 (후퇴 적용) ── */}
            {centeredBuildable.length >= 3 && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
                    <shapeGeometry args={[(() => {
                        const shape = new THREE.Shape();
                        shape.moveTo(centeredBuildable[0][0], centeredBuildable[0][1]);
                        for (let i = 1; i < centeredBuildable.length; i++) {
                            shape.lineTo(centeredBuildable[i][0], centeredBuildable[i][1]);
                        }
                        shape.closePath();
                        return shape;
                    })()]} />
                    <meshPhysicalMaterial
                        color="#8b5cf6"
                        transparent
                        opacity={0.15}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                    />
                </mesh>
            )}

            {/* ── 후퇴선 (건축가능영역 경계 — 보라색 점선) ── */}
            {wireframeLines.bottom.length > 0 && (
                <Line
                    points={wireframeLines.bottom}
                    color="#8b5cf6"
                    lineWidth={2}
                    dashed
                    dashSize={0.4}
                    gapSize={0.2}
                />
            )}

            {/* ── Max Envelope 3D 볼륨 (반투명 파란색) ── */}
            {envelopeGeometry && (
                <mesh geometry={envelopeGeometry}>
                    <meshPhysicalMaterial
                        color="#3b82f6"
                        transparent
                        opacity={0.07}
                        roughness={0.5}
                        metalness={0}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                    />
                </mesh>
            )}

            {/* ── 상단 윤곽선 (사선절단 — 파란색 실선) ── */}
            {wireframeLines.top.length > 0 && (
                <Line
                    points={wireframeLines.top}
                    color="#3b82f6"
                    lineWidth={2}
                />
            )}

            {/* ── 수직 모서리선 (파란색 점선) ── */}
            {wireframeLines.verticals.map((vLine, i) => (
                <Line
                    key={`vert-${i}`}
                    points={vLine}
                    color="#3b82f6"
                    lineWidth={1}
                    dashed
                    dashSize={0.3}
                    gapSize={0.2}
                />
            ))}

            {/* ── 높이 제한 표시선 (수평 빨간 점선) ── */}
            {centeredBuildable.length >= 3 && (() => {
                const bb = polygonBBox(centeredBuildable);
                return (
                    <Line
                        points={[
                            [bb.minX - 2, envH, -bb.maxY] as [number, number, number],
                            [bb.maxX + 2, envH, -bb.maxY] as [number, number, number],
                        ]}
                        color="#ef4444"
                        lineWidth={1.5}
                        dashed
                        dashSize={0.5}
                        gapSize={0.3}
                    />
                );
            })()}

            {/* ── 정북일조 사선제한 경사면 (빨간 반투명) ── */}
            {slopeGeometry && (
                <>
                    <mesh geometry={slopeGeometry.geo}>
                        <meshPhysicalMaterial
                            color="#ef4444"
                            transparent
                            opacity={0.12}
                            side={THREE.DoubleSide}
                            depthWrite={false}
                        />
                    </mesh>

                    {/* 사선 경사 시각화 라인 (좌/우 2개) */}
                    <Line
                        points={[
                            slopeGeometry.verts[0] as [number, number, number],
                            slopeGeometry.verts[3] as [number, number, number],
                        ]}
                        color="#ef4444"
                        lineWidth={2}
                    />
                    <Line
                        points={[
                            slopeGeometry.verts[1] as [number, number, number],
                            slopeGeometry.verts[2] as [number, number, number],
                        ]}
                        color="#ef4444"
                        lineWidth={2}
                    />

                    {/* 9m 기준선 (수평 점선) */}
                    <Line
                        points={[
                            slopeGeometry.verts[0] as [number, number, number],
                            slopeGeometry.verts[1] as [number, number, number],
                        ]}
                        color="#ef4444"
                        lineWidth={1}
                        dashed
                        dashSize={0.3}
                        gapSize={0.2}
                    />
                </>
            )}

            {/* ── 후퇴거리 레이블 ── */}
            {setbackLabels.map((label, i) => (
                <Text
                    key={`label-${i}`}
                    position={label.pos}
                    fontSize={0.6}
                    color={label.color}
                    anchorX="center"
                    anchorY="middle"
                    rotation={[-Math.PI / 2, 0, 0]}
                >
                    {label.text}
                </Text>
            ))}
        </group>
    );
}

// ─── 메인 3D 뷰어 ───
// ─── 뷰포트 강제 보정 (매 프레임) ───
function ViewportFixer() {
    const { gl, camera } = useThree();

    useFrame(() => {
        const canvas = gl.domElement;
        const parent = canvas.parentElement;
        if (!parent) return;

        const w = parent.clientWidth;
        const h = parent.clientHeight;

        // Canvas 내부 해상도와 CSS 표시 크기가 다르면 강제 맞춤
        if (canvas.width !== w * window.devicePixelRatio || canvas.height !== h * window.devicePixelRatio) {
            gl.setSize(w, h, false);
            (camera as any).aspect = w / h;
            camera.updateProjectionMatrix();
        }
    });

    return null;
}

export default function SceneViewer() {
    const containerRef = useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Canvas
                shadows
                gl={{
                    antialias: true,
                    alpha: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.2,
                }}
                style={{ display: 'block' }}
                onCreated={({ gl }) => {
                    gl.outputColorSpace = THREE.SRGBColorSpace;
                    const canvas = gl.domElement;
                    const parent = canvas.parentElement;
                    if (parent) {
                        gl.setSize(parent.clientWidth, parent.clientHeight, false);
                        console.log(`[Canvas] 초기 크기: ${parent.clientWidth}x${parent.clientHeight}, dpr=${window.devicePixelRatio}`);
                    }
                }}
            >
                <ViewportFixer />
                <PerspectiveCamera makeDefault position={[50, 40, 50]} fov={45} near={0.1} far={100000} />
                <CameraAdjuster />
                <OrbitControls
                    makeDefault
                    enableDamping
                    dampingFactor={0.05}
                    minDistance={10}
                    maxDistance={50000}
                    maxPolarAngle={Math.PI / 2.1}
                />

                {/* === 3-Point Lighting === */}
                {/* Key Light (메인 태양광) */}
                <directionalLight
                    position={[30, 50, 20]}
                    intensity={2.0}
                    castShadow
                    shadow-mapSize={[4096, 4096]}
                    shadow-camera-left={-100}
                    shadow-camera-right={100}
                    shadow-camera-top={100}
                    shadow-camera-bottom={-100}
                    shadow-camera-near={0.5}
                    shadow-camera-far={500}
                    shadow-bias={-0.0001}
                />
                {/* Fill Light (보조광) */}
                <directionalLight position={[-20, 30, -10]} intensity={0.6} color="#b8d4ff" />
                {/* Rim Light (윤곽광) */}
                <directionalLight position={[0, 10, -30]} intensity={0.3} color="#ffd4a8" />
                {/* Ambient */}
                <ambientLight intensity={0.35} />

                {/* === 환경 === */}
                <Environment preset="city" />
                <fog attach="fog" args={['#e8ecf0', 500, 2500]} />

                {/* === 그리드 바닥 === */}
                <Grid
                    position={[0, -0.01, 0]}
                    args={[2000, 2000]}
                    cellSize={2}
                    cellThickness={0.3}
                    cellColor="#e5e7eb"
                    sectionSize={10}
                    sectionThickness={0.6}
                    sectionColor="#d1d5db"
                    fadeDistance={300}
                    infiniteGrid
                />

                {/* === 도시 지면 + 그림자 수신 === */}
                <UrbanGroundPlane />
                <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                    <planeGeometry args={[2000, 2000]} />
                    <shadowMaterial transparent opacity={0.2} />
                </mesh>

                {/* === 주변 환경 (Forma/TestFit 스타일) === */}
                <SiteContextLayer />

                {/* === 대지 및 건물 === */}
                <group>
                    <LandBoundary />
                    <BuildingMass />
                </group>

                {/* 정북 표시 */}
                <NorthIndicator />

                {/* Phase 1-C: 법적 최대 볼륨 (Max Envelope) */}
                <MaxEnvelopeVisualization />

                {/* Contact Shadows (부드러운 바닥 그림자) */}
                <ContactShadows
                    position={[0, 0, 0]}
                    opacity={0.25}
                    scale={500}
                    blur={3}
                    far={200}
                    resolution={1024}
                />
            </Canvas>
        </div>
    );
}
