/**
 * 태양 위치 계산기 (Solar Position Calculator)
 * 
 * 위도/경도/날짜/시간을 기반으로 태양의 고도(altitude)와 방위각(azimuth)을 계산합니다.
 * Three.js 좌표계(y-up, north=-z)로 변환된 3D 위치도 제공합니다.
 * 
 * 참고: NOAA Solar Calculator 알고리즘 기반
 * https://gml.noaa.gov/grad/solcalc/
 */

export interface SunPosition {
    azimuth: number;       // 방위각 (도, 0=북, 90=동, 180=남, 270=서)
    altitude: number;      // 고도각 (도, 0=수평선, 90=천정)
    x: number;             // Three.js x 좌표 (동쪽)
    y: number;             // Three.js y 좌표 (위쪽)
    z: number;             // Three.js z 좌표 (-북쪽)
    isDay: boolean;        // 일출~일몰 여부
    sunrise: number;       // 일출 시각 (시간, 소수점)
    sunset: number;        // 일몰 시각 (시간, 소수점)
}

/**
 * Julian Day Number 계산
 */
function toJulianDay(year: number, month: number, day: number): number {
    if (month <= 2) {
        year -= 1;
        month += 12;
    }
    const A = Math.floor(year / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
}

/**
 * 태양 적경(declination)과 시간 방정식(Equation of Time) 계산
 */
function solarParameters(julianDay: number) {
    const julianCentury = (julianDay - 2451545.0) / 36525.0;
    
    // 태양 기하학적 평균 경도 (Geometric Mean Longitude)
    const geomMeanLongSun = (280.46646 + julianCentury * (36000.76983 + 0.0003032 * julianCentury)) % 360;
    
    // 태양 기하학적 평균 이상 (Geometric Mean Anomaly)
    const geomMeanAnomSun = 357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury);
    
    // 지구 궤도 이심률 (Eccentricity of Earth's Orbit)
    const eccentEarthOrbit = 0.016708634 - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
    
    // 태양 중심 방정식 (Sun's Equation of Center)
    const anomRad = geomMeanAnomSun * Math.PI / 180;
    const sunEqOfCenter = Math.sin(anomRad) * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury)) +
        Math.sin(2 * anomRad) * (0.019993 - 0.000101 * julianCentury) +
        Math.sin(3 * anomRad) * 0.000289;
    
    // 태양 진 경도 (Sun True Longitude)
    const sunTrueLong = geomMeanLongSun + sunEqOfCenter;
    
    // 태양 겉보기 경도 (Sun Apparent Longitude)
    const omega = 125.04 - 1934.136 * julianCentury;
    const sunAppLong = sunTrueLong - 0.00569 - 0.00478 * Math.sin(omega * Math.PI / 180);
    
    // 황도 경사 (Mean Obliquity of Ecliptic)
    const meanObliqEcliptic = 23 + (26 + (21.448 - julianCentury * (46.815 + julianCentury * (0.00059 - julianCentury * 0.001813))) / 60) / 60;
    const obliqCorr = meanObliqEcliptic + 0.00256 * Math.cos(omega * Math.PI / 180);
    
    // 태양 적위 (Solar Declination)
    const declination = Math.asin(Math.sin(obliqCorr * Math.PI / 180) * Math.sin(sunAppLong * Math.PI / 180)) * 180 / Math.PI;
    
    // Equation of Time (분)
    const y = Math.tan(obliqCorr * Math.PI / 180 / 2) ** 2;
    const eqOfTime = 4 * (y * Math.sin(2 * geomMeanLongSun * Math.PI / 180) -
        2 * eccentEarthOrbit * Math.sin(anomRad) +
        4 * eccentEarthOrbit * y * Math.sin(anomRad) * Math.cos(2 * geomMeanLongSun * Math.PI / 180) -
        0.5 * y * y * Math.sin(4 * geomMeanLongSun * Math.PI / 180) -
        1.25 * eccentEarthOrbit * eccentEarthOrbit * Math.sin(2 * anomRad)) * 180 / Math.PI;
    
    return { declination, eqOfTime };
}

/**
 * 일출/일몰 시각 계산
 */
function calculateSunriseSunset(lat: number, declination: number, eqOfTime: number, lng: number, timezone: number) {
    const latRad = lat * Math.PI / 180;
    const declRad = declination * Math.PI / 180;
    
    // 일출/일몰 시각각 (Hour Angle)
    const cosHA = (Math.cos(90.833 * Math.PI / 180) / (Math.cos(latRad) * Math.cos(declRad)) - Math.tan(latRad) * Math.tan(declRad));
    
    if (cosHA > 1) return { sunrise: -1, sunset: -1 }; // 극야
    if (cosHA < -1) return { sunrise: 0, sunset: 24 };  // 백야
    
    const ha = Math.acos(cosHA) * 180 / Math.PI;
    
    // 태양 정오 (Solar Noon) - 분 단위
    const solarNoon = (720 - 4 * lng - eqOfTime + timezone * 60) / 60;
    
    const sunrise = solarNoon - ha * 4 / 60;
    const sunset = solarNoon + ha * 4 / 60;
    
    return { sunrise, sunset };
}

/**
 * 태양 위치 계산 (메인 함수)
 * 
 * @param lat 위도 (도)
 * @param lng 경도 (도)
 * @param year 년
 * @param month 월 (1-12)
 * @param day 일
 * @param hour 시 (0-24, 소수점 가능. 예: 14.5 = 14:30)
 * @param timezone 시간대 (한국 = 9)
 * @param distance 3D 좌표 거리 (기본 200m)
 */
export function calculateSunPosition(
    lat: number,
    lng: number,
    year: number,
    month: number,
    day: number,
    hour: number,
    timezone: number = 9,
    distance: number = 200
): SunPosition {
    const jd = toJulianDay(year, month, day);
    const { declination, eqOfTime } = solarParameters(jd);
    const { sunrise, sunset } = calculateSunriseSunset(lat, declination, eqOfTime, lng, timezone);
    
    // 태양 시간각 (Hour Angle)
    const trueSolarTime = (hour * 60 + eqOfTime + 4 * lng - 60 * timezone) % 1440;
    let hourAngle = trueSolarTime / 4 - 180;
    if (hourAngle < -180) hourAngle += 360;
    
    // 태양 고도 (Solar Altitude/Elevation)
    const latRad = lat * Math.PI / 180;
    const declRad = declination * Math.PI / 180;
    const haRad = hourAngle * Math.PI / 180;
    
    const sinAltitude = Math.sin(latRad) * Math.sin(declRad) +
        Math.cos(latRad) * Math.cos(declRad) * Math.cos(haRad);
    const altitude = Math.asin(sinAltitude) * 180 / Math.PI;
    
    // 태양 방위각 (Solar Azimuth)
    const cosAzimuth = (Math.sin(declRad) - Math.sin(latRad) * sinAltitude) /
        (Math.cos(latRad) * Math.cos(altitude * Math.PI / 180));
    let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * 180 / Math.PI;
    
    // 오후에는 방위각을 360 - azimuth로 보정
    if (hourAngle > 0) azimuth = 360 - azimuth;
    
    // Three.js 좌표 변환
    // y-up, 북쪽 = -z, 동쪽 = +x
    const altRad = Math.max(altitude, 1) * Math.PI / 180; // 최소 1도 (지평선 아래 방지)
    const aziRad = azimuth * Math.PI / 180;
    
    const x = distance * Math.sin(aziRad) * Math.cos(altRad);
    const y = distance * Math.sin(altRad);
    const z = -distance * Math.cos(aziRad) * Math.cos(altRad);
    
    return {
        azimuth,
        altitude,
        x,
        y,
        z,
        isDay: altitude > 0,
        sunrise,
        sunset,
    };
}

/**
 * 시간을 "HH:MM" 형식으로 변환
 */
export function formatTime(hour: number): string {
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * 방위각을 한국어 방향 문자열로 변환
 */
export function azimuthToDirection(azimuth: number): string {
    const dirs = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const idx = Math.round(azimuth / 45) % 8;
    return dirs[idx];
}

/**
 * 한국 건축법 일조 분석을 위한 기본 날짜 (동지 = 12월 22일)
 * 정북일조 사선제한은 동지 기준 09:00~15:00 연속 2시간 이상 일조 확보 필요
 */
export const WINTER_SOLSTICE = { month: 12, day: 22 };
export const LEGAL_ANALYSIS_HOURS = { start: 9, end: 15 };

/**
 * 특정 날짜의 시간대별 태양 위치 일괄 계산 (애니메이션/분석용)
 */
export function calculateDaySunPath(
    lat: number,
    lng: number,
    year: number,
    month: number,
    day: number,
    stepMinutes: number = 30,
    timezone: number = 9,
): SunPosition[] {
    const positions: SunPosition[] = [];
    for (let hour = 0; hour < 24; hour += stepMinutes / 60) {
        positions.push(calculateSunPosition(lat, lng, year, month, day, hour, timezone));
    }
    return positions;
}
