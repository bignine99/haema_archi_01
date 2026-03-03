---
description: Web-based 3D Visualization (건축 시각화) - Three.js 기반 고품질 3D 렌더링 가이드
---

# Web-based 3D Visualization 스킬

건축 기획 설계 결과를 **클라이언트·심사위원**에게 효과적으로 전달하기 위한 웹 3D 시각화 기술 가이드.

## 핵심 기술 스택

| 기술 | 용도 | 비고 |
|------|------|------|
| **Three.js** | 3D 렌더링 엔진 | WebGL 기반 |
| **React Three Fiber (R3F)** | React 통합 | `@react-three/fiber` |
| **Drei** | R3F 유틸리티 | `@react-three/drei` |
| **Postprocessing** | 후처리 효과 | `@react-three/postprocessing` |
| **Vworld 3D** | 실제 지형 데이터 | `api.vworld.kr` |
| **Cesium.js** | 대규모 지형 렌더링 (선택) | GIS 전용 |

---

## 1. 재질(Material) 품질 향상

### 건물 재질
```tsx
// ❌ 기본 (품질 낮음)
<meshStandardMaterial color="#f59e0b" />

// ✅ 고품질 PBR
<meshPhysicalMaterial
    color="#f5a623"
    roughness={0.3}
    metalness={0.1}
    clearcoat={0.4}
    clearcoatRoughness={0.2}
    envMapIntensity={1.5}
/>
```

### 유리 재질 (커튼월)
```tsx
<meshPhysicalMaterial
    color="#88ccff"
    roughness={0.05}
    metalness={0.9}
    transparent
    opacity={0.4}
    transmission={0.6}
    thickness={0.5}
    ior={1.5}
    envMapIntensity={2.0}
/>
```

### 대지(Land) 재질
```tsx
<meshStandardMaterial
    color="#4ade80"
    roughness={0.8}
    metalness={0}
    transparent
    opacity={0.5}
/>
```

---

## 2. 조명 설정

### 3-Point Lighting (건축 시각화 표준)
```tsx
{/* Key Light - 메인 태양광 */}
<directionalLight
    position={[30, 50, 20]}
    intensity={2.0}
    castShadow
    shadow-mapSize={[4096, 4096]}
    shadow-camera-left={-200}
    shadow-camera-right={200}
    shadow-camera-top={200}
    shadow-camera-bottom={-200}
/>

{/* Fill Light - 보조광 (그림자 영역 보강) */}
<directionalLight
    position={[-20, 30, -10]}
    intensity={0.6}
    color="#b8d4ff"
/>

{/* Rim Light - 윤곽광 */}
<directionalLight
    position={[0, 10, -30]}
    intensity={0.3}
    color="#ffd4a8"
/>

{/* Ambient - 전체 기본 밝기 */}
<ambientLight intensity={0.3} />
```

### HDRI 환경맵
```tsx
import { Environment } from '@react-three/drei';

// 프리셋 사용
<Environment preset="city" background={false} />

// 커스텀 HDR 파일
<Environment files="/hdri/studio_small_09_4k.hdr" />
```

---

## 3. 후처리 효과 (Postprocessing)

```bash
npm install @react-three/postprocessing
```

```tsx
import { EffectComposer, Bloom, SSAO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';

<EffectComposer>
    {/* 블룸 - 밝은 부분 빛 번짐 */}
    <Bloom
        intensity={0.3}
        luminanceThreshold={0.8}
        luminanceSmoothing={0.9}
    />
    
    {/* SSAO - 앰비언트 오클루전 (입체감) */}
    <SSAO
        radius={0.05}
        intensity={30}
        luminanceInfluence={0.6}
    />
    
    {/* 톤 매핑 - 영화적 색감 */}
    <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    
    {/* 비네팅 - 가장자리 어둡게 */}
    <Vignette
        offset={0.3}
        darkness={0.5}
        blendFunction={BlendFunction.NORMAL}
    />
</EffectComposer>
```

---

## 4. 건물 렌더링 패턴

### 층별 구분 렌더링
```tsx
function FloorBlock({ width, depth, height, y, type }) {
    const materialConfig = {
        parking: { color: '#64748b', roughness: 0.7, metalness: 0.3 },
        commercial: { color: '#3b82f6', roughness: 0.2, metalness: 0.5, clearcoat: 0.6 },
        residential: { color: '#f5a623', roughness: 0.4, metalness: 0.1 },
    };
    
    const mat = materialConfig[type];
    
    return (
        <mesh position={[0, y + height / 2, 0]}>
            <boxGeometry args={[width, height - 0.05, depth]} />
            <meshPhysicalMaterial {...mat} />
            
            {/* 층 구분선 (와이어프레임 대신) */}
            <lineSegments>
                <edgesGeometry args={[new THREE.BoxGeometry(width, height - 0.05, depth)]} />
                <lineBasicMaterial color="#ffffff" transparent opacity={0.08} />
            </lineSegments>
        </mesh>
    );
}
```

### 건물 외곽 윤곽선 (Outline)
```tsx
import { Outlines } from '@react-three/drei';

<mesh>
    <boxGeometry args={[width, height, depth]} />
    <meshPhysicalMaterial color="#f5a623" />
    <Outlines thickness={1} color="#000000" opacity={0.2} />
</mesh>
```

---

## 5. 카메라 자동 프레이밍

### 장면 바운딩박스 기반 카메라 설정
```tsx
function CameraAdjuster() {
    const { camera, controls, size } = useThree();
    
    useEffect(() => {
        // 1. 장면 전체 바운딩박스 계산 (대지 + 건물)
        const sceneDiagonal = Math.sqrt(w*w + d*d + h*h);
        
        // 2. 대각선의 1.5배를 카메라 거리로 사용
        const distance = Math.max(sceneDiagonal * 1.5, 40);
        
        // 3. 방향벡터 정규화 필수!
        const dir = new THREE.Vector3(0.5, 1.0, 0.6).normalize();
        
        // 4. 카메라 위치 = 타겟 + 방향 * 거리
        camera.position.set(
            dir.x * distance,
            targetY + dir.y * distance,
            dir.z * distance
        );
        
        // 5. 동적 클리핑 (거대 필지 대응)
        camera.near = Math.max(distance * 0.001, 0.1);
        camera.far = distance * 20;
        
        camera.lookAt(0, targetY, 0);
        camera.updateProjectionMatrix();
    }, [dependencies]);
}
```

### ViewportFixer (Canvas 크기 보정)
```tsx
function ViewportFixer() {
    const { gl, camera } = useThree();
    
    useFrame(() => {
        const canvas = gl.domElement;
        const parent = canvas.parentElement;
        if (!parent) return;
        
        const w = parent.clientWidth;
        const h = parent.clientHeight;
        
        if (canvas.width !== w * devicePixelRatio || 
            canvas.height !== h * devicePixelRatio) {
            gl.setSize(w, h, false);
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
        }
    });
    
    return null;
}
```

---

## 6. Vworld 3D 데이터 연동

### 3D 타일맵 (건물 + 지형)
```javascript
// Vworld 3D 타일 API
const VWORLD_3D_TILE = `http://api.vworld.kr/req/wfs3d?service=wfs3d&version=1.0.0&request=GetFeature&typeName=building&bbox=${bbox}&key=${API_KEY}`;
```

### Cesium.js 통합 (선택)
```tsx
// 대규모 지형 렌더링이 필요할 때
import { Viewer, Cesium3DTileset } from 'resium';

<Viewer>
    <Cesium3DTileset 
        url="http://api.vworld.kr/req/3dtile/..."
    />
</Viewer>
```

---

## 7. 렌더링 최적화

### Level of Detail (LOD)
```tsx
import { Detailed } from '@react-three/drei';

<Detailed distances={[0, 50, 200]}>
    <HighDetailBuilding />  {/* 가까이 */}
    <MediumDetailBuilding /> {/* 중간 */}
    <LowDetailBuilding />   {/* 멀리 */}
</Detailed>
```

### 인스턴싱 (다수 건물)
```tsx
import { Instances, Instance } from '@react-three/drei';

<Instances>
    <boxGeometry />
    <meshStandardMaterial />
    {buildings.map(b => (
        <Instance key={b.id} position={b.pos} scale={b.scale} color={b.color} />
    ))}
</Instances>
```

---

## 8. 일조/조망 시뮬레이션

### 태양 위치 계산
```typescript
function getSunPosition(date: Date, lat: number, lng: number) {
    // SunCalc 라이브러리 활용
    const { altitude, azimuth } = SunCalc.getPosition(date, lat, lng);
    const distance = 100;
    return {
        x: distance * Math.cos(altitude) * Math.sin(azimuth),
        y: distance * Math.sin(altitude),
        z: distance * Math.cos(altitude) * Math.cos(azimuth),
    };
}
```

### 그림자 분석
```tsx
<directionalLight
    position={sunPosition}
    castShadow
    shadow-mapSize={[4096, 4096]}
    shadow-camera-far={500}
/>

{/* 지면에 그림자 수신 */}
<mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
    <planeGeometry args={[500, 500]} />
    <shadowMaterial opacity={0.3} />
</mesh>
```

---

## 체크리스트

- [ ] PBR 재질 적용 (roughness, metalness, clearcoat)
- [ ] 3-Point Lighting 설정
- [ ] HDRI 환경맵 적용
- [ ] EffectComposer 후처리 (Bloom, SSAO, ToneMapping)
- [ ] 건물 윤곽선/외곽선 개선
- [ ] 카메라 자동 프레이밍 + ViewportFixer
- [ ] 그림자 품질 향상 (4096 shadow map)
- [ ] Vworld 3D 타일 연동
- [ ] 일조 시뮬레이션
- [ ] LOD / 인스턴싱 최적화
