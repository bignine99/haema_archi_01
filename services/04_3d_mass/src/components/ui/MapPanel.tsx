
import { useRef, useEffect, useState } from 'react';
import { useProjectStore } from '@/store/projectStore';
import { MapPin, Maximize2, Minimize2, Layers, X } from 'lucide-react';

declare const L: any; // Leaflet from CDN

const VWORLD_API_KEY = process.env.VWORLD_API_KEY || '';

// Vworld 타일 레이어 URL 템플릿
const TILE_LAYERS = {
    base: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Base/{z}/{y}/{x}.png`,
    satellite: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
    hybrid: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/Hybrid/{z}/{y}/{x}.png`,
};

// OSM 타일 (Vworld 실패 시 Fallback)
const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

export default function MapPanel() {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const polygonLayerRef = useRef<any>(null);
    const markerRef = useRef<any>(null);

    const [isExpanded, setIsExpanded] = useState(false);
    const [tileType, setTileType] = useState<'base' | 'satellite'>('base');
    const [mapReady, setMapReady] = useState(false);

    const store = useProjectStore();
    const { centerLat, centerLng, polygonWGS84, address, isRealParcel, landPolygon } = store;

    // 지도 초기화
    useEffect(() => {
        if (!mapContainerRef.current || typeof L === 'undefined') return;
        if (mapRef.current) return; // 이미 초기화됨

        const map = L.map(mapContainerRef.current, {
            center: [centerLat || 37.5665, centerLng || 126.978],
            zoom: 18,
            zoomControl: false,
            attributionControl: false,
        });

        // Vworld Base 타일 추가 (실패 시 OSM fallback)
        const baseLayer = L.tileLayer(TILE_LAYERS.base, {
            maxZoom: 19,
            errorTileUrl: '',
        });

        const osmLayer = L.tileLayer(OSM_TILE, {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
        });

        // Vworld 타일 로드 실패 시 OSM으로 전환
        baseLayer.on('tileerror', () => {
            if (!map.hasLayer(osmLayer)) {
                map.removeLayer(baseLayer);
                osmLayer.addTo(map);
            }
        });

        baseLayer.addTo(map);

        // 줌 컨트롤 (우하단)
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        mapRef.current = map;
        setMapReady(true);

        return () => {
            map.remove();
            mapRef.current = null;
        };
    }, []);

    // 타일 레이어 변경
    useEffect(() => {
        if (!mapRef.current || !mapReady) return;
        const map = mapRef.current;

        // 기존 타일 레이어 제거
        map.eachLayer((layer: any) => {
            if (layer._url && (layer._url.includes('vworld') || layer._url.includes('openstreetmap'))) {
                map.removeLayer(layer);
            }
        });

        const tileUrl = tileType === 'satellite' ? TILE_LAYERS.satellite : TILE_LAYERS.base;
        const newLayer = L.tileLayer(tileUrl, { maxZoom: 19 });
        newLayer.on('tileerror', () => {
            if (!map.hasLayer(L.tileLayer(OSM_TILE))) {
                map.removeLayer(newLayer);
                L.tileLayer(OSM_TILE, { maxZoom: 19 }).addTo(map);
            }
        });
        newLayer.addTo(map);

        // 위성 모드에서 하이브리드 레이블 추가
        if (tileType === 'satellite') {
            L.tileLayer(TILE_LAYERS.hybrid, { maxZoom: 19 }).addTo(map);
        }
    }, [tileType, mapReady]);

    // 폴리곤 & 마커 업데이트
    useEffect(() => {
        if (!mapRef.current || !mapReady) return;
        const map = mapRef.current;

        // 기존 폴리곤/마커 제거
        if (polygonLayerRef.current) {
            map.removeLayer(polygonLayerRef.current);
            polygonLayerRef.current = null;
        }
        if (markerRef.current) {
            map.removeLayer(markerRef.current);
            markerRef.current = null;
        }

        if (centerLat && centerLng) {
            // 지도 이동
            map.setView([centerLat, centerLng], 18);

            // WGS84 폴리곤이 있으면 그리기
            if (polygonWGS84 && polygonWGS84.length >= 3) {
                const latlngs = polygonWGS84.map(([lng, lat]: [number, number]) => [lat, lng]);
                const polygon = L.polygon(latlngs, {
                    color: '#22c55e',
                    weight: 3,
                    fillColor: '#22c55e',
                    fillOpacity: 0.2,
                    dashArray: '5, 5',
                });
                polygon.addTo(map);
                polygonLayerRef.current = polygon;

                // 폴리곤에 맞게 뷰 조정
                map.fitBounds(polygon.getBounds().pad(0.3));
            }

            // 중심 마커
            const icon = L.divIcon({
                html: `<div style="width:12px;height:12px;border-radius:50%;background:#2e8fff;border:2px solid white;box-shadow:0 0 8px rgba(46,143,255,0.6);"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6],
                className: '',
            });
            const marker = L.marker([centerLat, centerLng], { icon });
            marker.bindPopup(`<b style="font-size:11px;">${address}</b>`);
            marker.addTo(map);
            markerRef.current = marker;
        }
    }, [centerLat, centerLng, polygonWGS84, address, mapReady]);

    // 리사이즈 시 맵 갱신
    useEffect(() => {
        if (mapRef.current && mapReady) {
            setTimeout(() => mapRef.current?.invalidateSize(), 100);
            setTimeout(() => mapRef.current?.invalidateSize(), 500);
        }
    }, [isExpanded, mapReady]);

    // 마운트 후 추가 invalidateSize
    useEffect(() => {
        if (mapRef.current && mapReady) {
            const timers = [100, 300, 800, 1500].map(ms =>
                setTimeout(() => mapRef.current?.invalidateSize(), ms)
            );
            return () => timers.forEach(clearTimeout);
        }
    }, [mapReady]);

    const panelSize = isExpanded
        ? 'w-[560px] h-[400px]'
        : 'w-[360px] h-[240px]';

    return (
        <div className={`absolute bottom-14 left-4 ${panelSize} rounded-xl overflow-hidden border border-slate-300 shadow-2xl z-30 transition-all duration-300`}
            style={{ background: '#f1f5f9' }}
        >
            {/* 헤더 */}
            <div className="absolute top-0 left-0 right-0 h-7 bg-white/90 backdrop-blur-sm z-30 flex items-center px-3 gap-2 border-b border-slate-200">
                <MapPin size={10} className="text-green-600" />
                <span className="text-[9px] font-semibold text-slate-600">2D 지도</span>
                {isRealParcel && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">API</span>}

                <div className="ml-auto flex items-center gap-1">
                    {/* 타일 전환 */}
                    <button
                        onClick={() => setTileType(tileType === 'base' ? 'satellite' : 'base')}
                        className="p-1 rounded hover:bg-slate-100 transition-colors"
                        title={tileType === 'base' ? '위성 지도' : '일반 지도'}
                    >
                        <Layers size={10} className="text-slate-500" />
                    </button>
                    {/* 확대/축소 */}
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="p-1 rounded hover:bg-slate-100 transition-colors"
                    >
                        {isExpanded
                            ? <Minimize2 size={10} className="text-slate-500" />
                            : <Maximize2 size={10} className="text-slate-500" />
                        }
                    </button>
                </div>
            </div>

            {/* 지도 컨테이너 */}
            <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

            {/* 주소 표시 */}
            {address && (
                <div className="absolute bottom-1 left-1 right-1 z-30">
                    <div className="bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1.5 shadow-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        <span className="text-[8px] text-slate-700 truncate">{address}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
