/**
 * SunlightSimulation — Three.js 태양광 시뮬레이션 컴포넌트
 * 
 * 기능:
 * 1. SunLight: 태양 위치를 기반으로 DirectionalLight를 동적 제어
 * 2. SunOrb: 태양 위치를 시각적으로 표시하는 구체 + 광선
 * 3. SunPath: 하루 동안의 태양 궤적을 3D 호로 표시
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { calculateSunPosition, calculateDaySunPath, type SunPosition } from '@/utils/sunCalculator';

interface SunLightProps {
    enabled: boolean;
    sunPosition: SunPosition;
    shadowRadius?: number;    // 그림자 영역 반경 (기본 300m)
}

/**
 * 동적 태양광 — 시간에 따라 위치가 변하는 DirectionalLight
 */
export function SunLight({ enabled, sunPosition, shadowRadius = 300 }: SunLightProps) {
    const lightRef = useRef<THREE.DirectionalLight>(null);
    const targetRef = useRef<THREE.Object3D>(null);

    useEffect(() => {
        if (!lightRef.current || !enabled) return;

        const light = lightRef.current;
        light.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
        light.target.position.set(0, 0, 0);
        light.target.updateMatrixWorld();

        // 그림자 카메라 범위 설정 (주변 건물까지 커버)
        light.shadow.camera.left = -shadowRadius;
        light.shadow.camera.right = shadowRadius;
        light.shadow.camera.top = shadowRadius;
        light.shadow.camera.bottom = -shadowRadius;
        light.shadow.camera.near = 1;
        light.shadow.camera.far = sunPosition.y > 0 ? sunPosition.y * 4 : 1000;
        light.shadow.camera.updateProjectionMatrix();
    }, [sunPosition, enabled, shadowRadius]);

    if (!enabled) return null;

    // 태양 고도에 따른 조명 강도 및 색상 조절
    const intensity = sunPosition.isDay
        ? Math.max(0.3, Math.min(2.5, sunPosition.altitude / 30))
        : 0.05;

    // 일출/일몰 시 따뜻한 색상
    const color = sunPosition.altitude < 15
        ? '#ffb366' // 황혼
        : sunPosition.altitude < 30
            ? '#ffe0b2' // 아침/저녁
            : '#ffffff'; // 한낮

    return (
        <>
            <directionalLight
                ref={lightRef}
                position={[sunPosition.x, sunPosition.y, sunPosition.z]}
                intensity={intensity}
                color={color}
                castShadow
                shadow-mapSize={[4096, 4096]}
                shadow-bias={-0.0003}
            />
            {/* 태양 반대편 약한 보조광 */}
            <directionalLight
                position={[-sunPosition.x * 0.3, sunPosition.y * 0.5, -sunPosition.z * 0.3]}
                intensity={0.15}
                color="#b8d4ff"
            />
        </>
    );
}

interface SunOrbProps {
    enabled: boolean;
    sunPosition: SunPosition;
}

/**
 * 태양 시각화 구체 + 광선 효과
 */
export function SunOrb({ enabled, sunPosition }: SunOrbProps) {
    const orbRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (!orbRef.current || !enabled) return;
        orbRef.current.position.set(sunPosition.x, sunPosition.y, sunPosition.z);
    });

    if (!enabled || !sunPosition.isDay) return null;

    // 태양 고도에 따른 색상
    const color = sunPosition.altitude < 15 ? '#ff6600' : sunPosition.altitude < 30 ? '#ffaa00' : '#ffdd00';

    return (
        <mesh ref={orbRef} position={[sunPosition.x, sunPosition.y, sunPosition.z]}>
            <sphereGeometry args={[8, 16, 16]} />
            <meshBasicMaterial color={color} transparent opacity={0.9} />
            {/* 글로우 이펙트 */}
            <mesh scale={2.5}>
                <sphereGeometry args={[8, 16, 16]} />
                <meshBasicMaterial color={color} transparent opacity={0.15} />
            </mesh>
        </mesh>
    );
}

interface SunPathProps {
    enabled: boolean;
    lat: number;
    lng: number;
    year: number;
    month: number;
    day: number;
}

/**
 * 하루 동안의 태양 궤적을 3D 곡선으로 표시
 */
export function SunPathArc({ enabled, lat, lng, year, month, day }: SunPathProps) {
    const pathPoints = useMemo(() => {
        if (!enabled) return [];

        const positions = calculateDaySunPath(lat, lng, year, month, day, 15); // 15분 간격
        return positions
            .filter(p => p.altitude > 0) // 일출~일몰만
            .map(p => new THREE.Vector3(p.x, p.y, p.z));
    }, [enabled, lat, lng, year, month, day]);

    if (!enabled || pathPoints.length < 2) return null;

    const curve = new THREE.CatmullRomCurve3(pathPoints);
    const curvePoints = curve.getPoints(100);

    return (
        <group>
            {/* 태양 궤적 호 */}
            <line>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={curvePoints.length}
                        array={new Float32Array(curvePoints.flatMap(p => [p.x, p.y, p.z]))}
                        itemSize={3}
                    />
                </bufferGeometry>
                <lineBasicMaterial color="#ffaa00" transparent opacity={0.4} linewidth={1} />
            </line>

            {/* 시간 마커 (매 1시간) */}
            {(() => {
                const markers: JSX.Element[] = [];
                const allPositions = calculateDaySunPath(lat, lng, year, month, day, 60); // 1시간 간격
                allPositions
                    .filter(p => p.altitude > 0)
                    .forEach((p, i) => {
                        const hour = Math.round(p.sunrise + i);
                        markers.push(
                            <group key={`marker-${i}`} position={[p.x, p.y, p.z]}>
                                <mesh>
                                    <sphereGeometry args={[2, 8, 8]} />
                                    <meshBasicMaterial color="#ffaa00" transparent opacity={0.5} />
                                </mesh>
                            </group>
                        );
                    });
                return markers;
            })()}
        </group>
    );
}
