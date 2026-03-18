/**
 * ShadowAnalysis — 그림자 히트맵 분석 엔진
 * 
 * 대지 위 각 지점의 일조 시간(시간)을 계산하고
 * 컬러 히트맵으로 시각화합니다.
 * 
 * 방법: CPU 레이캐스팅
 * - 대지 영역에 격자점 배치
 * - 각 시간 스텝(30분 간격)마다 태양 → 격자점 ray 발사
 * - 건물에 차단되면 음영, 아니면 일조
 * - 누적 일조시간으로 히트맵 생성
 */

import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { calculateSunPosition } from '@/utils/sunCalculator';

/** 분석 결과 타입 */
export interface ShadowAnalysisResult {
    gridSize: number;           // 격자 해상도
    gridWidth: number;          // x 격자 수
    gridHeight: number;         // z 격자 수
    totalHours: number;         // 분석 총 시간 (09~15 = 6시간)
    sunlightHours: Float32Array; // 각 격자점의 일조시간
    minSunlight: number;
    maxSunlight: number;
    avgSunlight: number;
    coveragePercent: number;    // 2시간 이상 일조 확보 비율(%)
    analysisDate: string;
    status: 'idle' | 'running' | 'done';
    progress: number;           // 0~1
}

interface ShadowHeatmapProps {
    enabled: boolean;
    analysisResult: ShadowAnalysisResult | null;
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/**
 * 그림자 히트맵 시각화 (Three.js 지면 오버레이)
 */
export function ShadowHeatmap({ enabled, analysisResult, bounds }: ShadowHeatmapProps) {
    const meshRef = useRef<THREE.Mesh>(null);

    const geometry = useMemo(() => {
        if (!analysisResult || analysisResult.status !== 'done') return null;

        const { gridWidth, gridHeight, sunlightHours, totalHours } = analysisResult;
        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxZ - bounds.minZ;

        const geo = new THREE.PlaneGeometry(width, height, gridWidth - 1, gridHeight - 1);
        const colors = new Float32Array(gridWidth * gridHeight * 3);

        for (let i = 0; i < gridWidth * gridHeight; i++) {
            const ratio = sunlightHours[i] / totalHours; // 0 = 완전 음영, 1 = 완전 일조

            // 컬러맵: 빨강(음영) → 노랑 → 초록(일조)
            let r: number, g: number, b: number;
            if (ratio < 0.33) {
                // 빨강 → 주황
                const t = ratio / 0.33;
                r = 0.9;
                g = 0.2 + t * 0.5;
                b = 0.1;
            } else if (ratio < 0.66) {
                // 주황 → 노랑
                const t = (ratio - 0.33) / 0.33;
                r = 0.9 - t * 0.2;
                g = 0.7 + t * 0.2;
                b = 0.1 + t * 0.1;
            } else {
                // 노랑 → 초록
                const t = (ratio - 0.66) / 0.34;
                r = 0.7 - t * 0.5;
                g = 0.9;
                b = 0.2 + t * 0.2;
            }

            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return geo;
    }, [analysisResult, bounds]);

    if (!enabled || !geometry || !analysisResult || analysisResult.status !== 'done') return null;

    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerZ = (bounds.minZ + bounds.maxZ) / 2;

    return (
        <mesh
            ref={meshRef}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[centerX, 0.15, centerZ]}
        >
            <primitive object={geometry} />
            <meshBasicMaterial
                vertexColors
                transparent
                opacity={0.55}
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
}

/**
 * 그림자 분석 실행 함수 (Web Worker 대신 청크 분할로 UI 블로킹 방지)
 */
export function useShadowAnalysis() {
    const { scene } = useThree();
    const [result, setResult] = useState<ShadowAnalysisResult | null>(null);
    const cancelRef = useRef(false);

    const runAnalysis = useCallback(async (
        lat: number,
        lng: number,
        year: number,
        month: number,
        day: number,
        bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
        gridResolution: number = 2,  // 격자 간격 (m)
        startHour: number = 9,
        endHour: number = 15,
        stepMinutes: number = 30,
    ) => {
        cancelRef.current = false;

        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxZ - bounds.minZ;
        const gridWidth = Math.max(2, Math.ceil(width / gridResolution));
        const gridHeight = Math.max(2, Math.ceil(height / gridResolution));
        const totalPoints = gridWidth * gridHeight;

        // 시간 스텝 계산
        const timeSteps: number[] = [];
        for (let h = startHour; h <= endHour; h += stepMinutes / 60) {
            timeSteps.push(h);
        }
        const totalHours = endHour - startHour;

        console.log(`[ShadowAnalysis] 격자: ${gridWidth}×${gridHeight} = ${totalPoints}점, 시간: ${timeSteps.length}스텝`);

        // 초기 결과
        const sunlightHours = new Float32Array(totalPoints);
        setResult({
            gridSize: gridResolution,
            gridWidth,
            gridHeight,
            totalHours,
            sunlightHours,
            minSunlight: 0,
            maxSunlight: 0,
            avgSunlight: 0,
            coveragePercent: 0,
            analysisDate: `${year}-${month}-${day}`,
            status: 'running',
            progress: 0,
        });

        // 건물 메시 수집 (castShadow가 true인 메시)
        const buildingMeshes: THREE.Mesh[] = [];
        scene.traverse((obj) => {
            if (obj instanceof THREE.Mesh && (obj.userData?.isBuildingMesh || (obj.castShadow && obj.geometry))) {
                // 지면/그림자 메시 제외
                if (obj.material instanceof THREE.ShadowMaterial) return;
                if (obj.geometry instanceof THREE.PlaneGeometry) return;
                buildingMeshes.push(obj);
            }
        });
        console.log(`[ShadowAnalysis] 건물 메시: ${buildingMeshes.length}개`);

        const raycaster = new THREE.Raycaster();
        const groundY = 0.5; // 지면 높이
        let completedSteps = 0;

        // 청크 단위로 비동기 처리 (UI 블로킹 방지)
        for (const hour of timeSteps) {
            if (cancelRef.current) break;

            const sunPos = calculateSunPosition(lat, lng, year, month, day, hour);

            if (!sunPos.isDay || sunPos.altitude <= 0) {
                completedSteps++;
                continue;
            }

            // 태양 방향 벡터 (지면 → 태양)
            const sunDir = new THREE.Vector3(sunPos.x, sunPos.y, sunPos.z).normalize();

            // 격자점 순회
            for (let iz = 0; iz < gridHeight; iz++) {
                for (let ix = 0; ix < gridWidth; ix++) {
                    const idx = iz * gridWidth + ix;
                    const x = bounds.minX + (ix / (gridWidth - 1)) * width;
                    const z = bounds.minZ + (iz / (gridHeight - 1)) * height;

                    const origin = new THREE.Vector3(x, groundY, z);
                    raycaster.set(origin, sunDir);
                    raycaster.far = 500;

                    const intersections = raycaster.intersectObjects(buildingMeshes, false);

                    if (intersections.length === 0) {
                        // 일조: 30분 스텝이면 0.5시간 추가
                        sunlightHours[idx] += stepMinutes / 60;
                    }
                }
            }

            completedSteps++;

            // 진행률 업데이트 (각 시간 스텝 완료 후)
            setResult(prev => prev ? {
                ...prev,
                progress: completedSteps / timeSteps.length,
                sunlightHours: new Float32Array(sunlightHours),
            } : null);

            // UI 렌더 기회 제공
            await new Promise(r => setTimeout(r, 10));
        }

        if (cancelRef.current) {
            console.log('[ShadowAnalysis] 취소됨');
            return;
        }

        // 통계 계산
        let min = Infinity, max = -Infinity, sum = 0, coverage2h = 0;
        for (let i = 0; i < totalPoints; i++) {
            const v = sunlightHours[i];
            if (v < min) min = v;
            if (v > max) max = v;
            sum += v;
            if (v >= 2) coverage2h++;
        }

        const finalResult: ShadowAnalysisResult = {
            gridSize: gridResolution,
            gridWidth,
            gridHeight,
            totalHours,
            sunlightHours: new Float32Array(sunlightHours),
            minSunlight: min,
            maxSunlight: max,
            avgSunlight: sum / totalPoints,
            coveragePercent: (coverage2h / totalPoints) * 100,
            analysisDate: `${year}-${month}-${day}`,
            status: 'done',
            progress: 1,
        };

        console.log('[ShadowAnalysis] 완료:', {
            min: min.toFixed(1),
            max: max.toFixed(1),
            avg: (sum / totalPoints).toFixed(1),
            coverage: `${finalResult.coveragePercent.toFixed(1)}%`,
        });

        setResult(finalResult);
        return finalResult;
    }, [scene]);

    const cancel = useCallback(() => {
        cancelRef.current = true;
    }, []);

    return { result, runAnalysis, cancel };
}
