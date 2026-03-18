"""
██████████████████████████████████████████████████████████████████████
███ Skill 9: Solar Sun Path Calculator (태양 궤적 & 그림자 연산)    ███
███ ─────────────────────────────────────────────────────           ███
███ NOAA Solar Calculator 알고리즘 — 순수 Python math 구현          ███
██████████████████████████████████████████████████████████████████████

외부 라이브러리 의존성: 없음 (순수 math 모듈)

기능:
  1. 위도/경도 + 일시 → 태양 방위각(Azimuth) + 고도각(Altitude)
  2. 태양 위치 → Three.js DirectionalLight 벡터 변환
  3. 그림자 방향 + 길이 비율 계산
  4. 하루 전체 태양 경로 (1시간 간격)
  5. 동지일 유효 일조시간 계산 (건축법 기준: 최소 연속 2시간)

참조:
  - NOAA Solar Calculator: https://gml.noaa.gov/grad/solcalc/
  - Jean Meeus, "Astronomical Algorithms" (1991)

작성일: 2026-03-06
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from pydantic import BaseModel, Field


# ══════════════════════════════════════════════════════════════
# 데이터 모델
# ══════════════════════════════════════════════════════════════

class SolarInput(BaseModel):
    """태양 궤적 계산 입력"""
    latitude: float = Field(..., description="위도 (도). 북위 양수, 남위 음수")
    longitude: float = Field(..., description="경도 (도). 동경 양수, 서경 음수")
    date_time: str = Field(
        ..., 
        description="시뮬레이션 일시 (ISO8601 또는 'YYYY-MM-DD HH:MM'). 예: '2026-12-22T12:00:00'"
    )
    timezone_offset: float = Field(
        9.0, description="UTC 오프셋 (시간). 한국=+9"
    )
    
    # ── 하루 경로 옵션 ──
    include_daily_path: bool = Field(
        True, description="하루 전체 태양 경로를 포함할지 여부"
    )
    
    # ── 동지일 일조시간 분석 ──
    include_winter_solstice: bool = Field(
        True, description="동지일 일조시간 분석 포함 여부"
    )


class Vec3(BaseModel):
    """3D 벡터"""
    x: float
    y: float
    z: float


class SunPathPoint(BaseModel):
    """태양 경로 한 시점"""
    hour: float
    azimuth_deg: float
    altitude_deg: float
    shadow_length_ratio: float = 0
    is_above_horizon: bool = False


class SolarResult(BaseModel):
    """태양 궤적 계산 결과"""
    # ── 요청 시간의 태양 위치 ──
    azimuth_deg: float = Field(0, description="방위각 (0°=N, 90°=E, 180°=S, 270°=W)")
    altitude_deg: float = Field(0, description="고도각 (0°=수평, 90°=천정)")
    is_above_horizon: bool = Field(False, description="일출~일몰 사이 여부")
    
    # ── Three.js 직접 사용 벡터 ──
    sun_direction: Vec3 = Field(
        default_factory=lambda: Vec3(x=0, y=1, z=0),
        description="태양 방향 단위벡터 (Three.js DirectionalLight position용)"
    )
    shadow_direction: Vec3 = Field(
        default_factory=lambda: Vec3(x=0, y=0, z=0),
        description="그림자 방향 단위벡터 (수평면 투영)"
    )
    shadow_length_ratio: float = Field(
        0, description="높이 1m 건물의 그림자 길이 (m). = 1/tan(altitude)"
    )
    
    # ── 일출/일몰 ──
    sunrise_time: str = Field("", description="일출 시각 (HH:MM)")
    sunset_time: str = Field("", description="일몰 시각 (HH:MM)")
    daylight_hours: float = Field(0, description="낮 시간 (시간)")
    
    # ── 하루 전체 태양 경로 ──
    daily_path: list[SunPathPoint] = Field(
        default_factory=list, 
        description="1시간 간격 태양 경로 [{hour, azimuth, altitude, shadow_ratio}, ...]"
    )
    
    # ── 동지일 일조시간 (건축법 기준) ──
    winter_solstice_hours: float = Field(
        0, description="동지일 유효 일조시간 (time)"
    )
    winter_solstice_date: str = Field("", description="동지일 날짜")
    
    # ── 메타 ──
    input_datetime: str = ""
    latitude: float = 0
    longitude: float = 0
    
    # ── 오류 ──
    error: Optional[str] = None


# ══════════════════════════════════════════════════════════════
# NOAA Solar Position Algorithm (순수 Python math)
# ══════════════════════════════════════════════════════════════

def _to_julian_date(dt: datetime) -> float:
    """datetime → Julian Date 변환"""
    y = dt.year
    m = dt.month
    d = dt.day + (dt.hour + dt.minute / 60 + dt.second / 3600) / 24
    
    if m <= 2:
        y -= 1
        m += 12
    
    A = math.floor(y / 100)
    B = 2 - A + math.floor(A / 4)
    
    return math.floor(365.25 * (y + 4716)) + math.floor(30.6001 * (m + 1)) + d + B - 1524.5


def _sun_position(lat: float, lng: float, dt: datetime) -> tuple[float, float]:
    """
    NOAA Solar Calculator — 태양의 방위각(Azimuth)과 고도각(Altitude) 계산.
    
    References:
        - NOAA Solar Calculator Spreadsheet
        - Jean Meeus "Astronomical Algorithms"
    
    Args:
        lat: 위도 (도)
        lng: 경도 (도)
        dt: UTC datetime
    
    Returns:
        (azimuth_deg, altitude_deg)
        azimuth: 0°=N, 90°=E, 180°=S, 270°=W
        altitude: 0°=수평, 90°=천정
    """
    jd = _to_julian_date(dt)
    jc = (jd - 2451545.0) / 36525.0  # Julian Century from J2000.0
    
    # ── 태양 기하학적 평균 경도 (Geometric Mean Longitude) ──
    L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    
    # ── 태양 평균 이심이각 (Mean Anomaly) ──
    M = (357.52911 + jc * (35999.05029 - jc * 0.0001537)) % 360
    M_rad = math.radians(M)
    
    # ── 지구 궤도 이심률 ──
    e = 0.016708634 - jc * (0.000042037 + jc * 0.0000001267)
    
    # ── 태양 중심차 (Equation of Center) ──
    C = (
        (1.914602 - jc * (0.004817 + jc * 0.000014)) * math.sin(M_rad) +
        (0.019993 - jc * 0.000101) * math.sin(2 * M_rad) +
        0.000289 * math.sin(3 * M_rad)
    )
    
    # ── 태양 진경도 (True Longitude) ──
    sun_true_lng = L0 + C
    
    # ── 태양 겉보기 경도 (Apparent Longitude) ──
    omega = 125.04 - 1934.136 * jc
    sun_apparent_lng = sun_true_lng - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    
    # ── 황도 경사각 (Obliquity of the Ecliptic) ──
    mean_obliquity = (
        23 + (26 + (21.448 - jc * (46.8150 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    )
    obliquity_corr = mean_obliquity + 0.00256 * math.cos(math.radians(omega))
    obliquity_rad = math.radians(obliquity_corr)
    
    # ── 태양 적위 (Declination) ──
    sin_dec = math.sin(obliquity_rad) * math.sin(math.radians(sun_apparent_lng))
    declination = math.degrees(math.asin(sin_dec))
    dec_rad = math.radians(declination)
    
    # ── 균시차 (Equation of Time, 분) ──
    y_var = math.tan(obliquity_rad / 2) ** 2
    L0_rad = math.radians(L0)
    eq_time = 4 * math.degrees(
        y_var * math.sin(2 * L0_rad) -
        2 * e * math.sin(M_rad) +
        4 * e * y_var * math.sin(M_rad) * math.cos(2 * L0_rad) -
        0.5 * y_var * y_var * math.sin(4 * L0_rad) -
        1.25 * e * e * math.sin(2 * M_rad)
    )
    
    # ── 시간 계산 ──
    # 경과 시간 (분, 자정부터)
    time_decimal = dt.hour + dt.minute / 60 + dt.second / 3600
    
    # 태양 시간각 (Hour Angle)
    # True Solar Time = 시간(분) + 균시차 + 4×경도 - 60×시간대
    # UTC 기준이므로 시간대 = 0
    true_solar_time = (time_decimal * 60 + eq_time + 4 * lng) % 1440
    
    if true_solar_time / 4 < 0:
        hour_angle = true_solar_time / 4 + 180
    else:
        hour_angle = true_solar_time / 4 - 180
    
    ha_rad = math.radians(hour_angle)
    lat_rad = math.radians(lat)
    
    # ── 고도각 (Solar Altitude/Elevation) ──
    sin_alt = (
        math.sin(lat_rad) * math.sin(dec_rad) +
        math.cos(lat_rad) * math.cos(dec_rad) * math.cos(ha_rad)
    )
    altitude = math.degrees(math.asin(max(-1, min(1, sin_alt))))
    
    # ── 방위각 (Solar Azimuth) ──
    cos_zenith = math.sin(lat_rad) * math.sin(dec_rad) + \
                 math.cos(lat_rad) * math.cos(dec_rad) * math.cos(ha_rad)
    zenith = math.degrees(math.acos(max(-1, min(1, cos_zenith))))
    zenith_rad = math.radians(zenith)
    
    if zenith_rad != 0:
        cos_azi = (
            (math.sin(lat_rad) * math.cos(zenith_rad) - math.sin(dec_rad)) /
            (math.cos(lat_rad) * math.sin(zenith_rad))
        )
        cos_azi = max(-1, min(1, cos_azi))
        
        if hour_angle > 0:
            azimuth = (math.degrees(math.acos(cos_azi)) + 180) % 360
        else:
            azimuth = (540 - math.degrees(math.acos(cos_azi))) % 360
    else:
        azimuth = 180  # 태양이 정확히 천정에 있을 때
    
    return round(azimuth, 2), round(altitude, 2)


def _calculate_sunrise_sunset(lat: float, lng: float, dt: datetime) -> tuple[float, float]:
    """
    일출/일몰 시각 계산 (UTC 시간).
    
    Returns:
        (sunrise_hour_utc, sunset_hour_utc:)
    """
    jd = _to_julian_date(datetime(dt.year, dt.month, dt.day, 12, 0, 0))
    jc = (jd - 2451545.0) / 36525.0
    
    M = (357.52911 + jc * (35999.05029 - jc * 0.0001537)) % 360
    M_rad = math.radians(M)
    e = 0.016708634 - jc * (0.000042037 + jc * 0.0000001267)
    L0 = (280.46646 + jc * (36000.76983 + jc * 0.0003032)) % 360
    
    C = (
        (1.914602 - jc * (0.004817 + jc * 0.000014)) * math.sin(M_rad) +
        (0.019993 - jc * 0.000101) * math.sin(2 * M_rad) +
        0.000289 * math.sin(3 * M_rad)
    )
    
    sun_true_lng = L0 + C
    omega = 125.04 - 1934.136 * jc
    sun_apparent_lng = sun_true_lng - 0.00569 - 0.00478 * math.sin(math.radians(omega))
    
    mean_obliquity = (
        23 + (26 + (21.448 - jc * (46.8150 + jc * (0.00059 - jc * 0.001813))) / 60) / 60
    )
    obliquity_corr = mean_obliquity + 0.00256 * math.cos(math.radians(omega))
    obliquity_rad = math.radians(obliquity_corr)
    
    sin_dec = math.sin(obliquity_rad) * math.sin(math.radians(sun_apparent_lng))
    declination = math.degrees(math.asin(sin_dec))
    dec_rad = math.radians(declination)
    lat_rad = math.radians(lat)
    
    # 균시차
    y_var = math.tan(obliquity_rad / 2) ** 2
    L0_rad = math.radians(L0)
    eq_time = 4 * math.degrees(
        y_var * math.sin(2 * L0_rad) -
        2 * e * math.sin(M_rad) +
        4 * e * y_var * math.sin(M_rad) * math.cos(2 * L0_rad) -
        0.5 * y_var * y_var * math.sin(4 * L0_rad) -
        1.25 * e * e * math.sin(2 * M_rad)
    )
    
    # 일출/일몰 시간각
    cos_ha0 = (
        math.cos(math.radians(90.833)) / (math.cos(lat_rad) * math.cos(dec_rad)) -
        math.tan(lat_rad) * math.tan(dec_rad)
    )
    
    if abs(cos_ha0) > 1:
        # 극야 또는 백야
        return (-1, -1)
    
    ha0 = math.degrees(math.acos(cos_ha0))
    
    # 일출/일몰 (UTC 분)
    sunrise_min = 720 - 4 * (lng + ha0) - eq_time
    sunset_min = 720 - 4 * (lng - ha0) - eq_time
    
    return sunrise_min / 60, sunset_min / 60


# ══════════════════════════════════════════════════════════════
# Three.js 벡터 변환
# ══════════════════════════════════════════════════════════════

def _sun_to_threejs_vector(azimuth_deg: float, altitude_deg: float) -> Vec3:
    """
    태양 방위각/고도각 → Three.js DirectionalLight 위치 벡터.
    
    Three.js 좌표계: X=East, Y=Up, Z=South (right-handed)
    건축 방위: N=0°, E=90°, S=180°, W=270°
    
    변환:
        x = cos(alt) × sin(azi)    → 동서 방향
        y = sin(alt)               → 상하 (태양 높이)
        z = -cos(alt) × cos(azi)   → 남북 방향 (Three.js Z = -North)
    """
    azi_rad = math.radians(azimuth_deg)
    alt_rad = math.radians(altitude_deg)
    
    cos_alt = math.cos(alt_rad)
    
    # 단위벡터 × 스케일 (DirectionalLight는 방향만 중요, 크기 1000으로 설정)
    scale = 1000
    x = cos_alt * math.sin(azi_rad) * scale
    y = math.sin(alt_rad) * scale
    z = -cos_alt * math.cos(azi_rad) * scale  # Three.js Z = 남쪽이 양수
    
    return Vec3(x=round(x, 1), y=round(y, 1), z=round(z, 1))


def _shadow_vector(azimuth_deg: float, altitude_deg: float) -> tuple[Vec3, float]:
    """
    태양 위치 → 그림자 방향 벡터 + 길이 비율.
    
    그림자 방향 = 태양 반대쪽 (수평 투영)
    그림자 길이 = height / tan(altitude)
    """
    if altitude_deg <= 0:
        return Vec3(x=0, y=0, z=0), 0
    
    shadow_azi = (azimuth_deg + 180) % 360
    shadow_azi_rad = math.radians(shadow_azi)
    
    # 그림자 수평 방향 단위벡터
    sx = math.sin(shadow_azi_rad)
    sz = -math.cos(shadow_azi_rad)  # Three.js Z 보정
    
    # 길이 비율: 높이 1m 건물의 그림자 길이
    alt_rad = math.radians(altitude_deg)
    if alt_rad > 0.01:
        shadow_ratio = 1.0 / math.tan(alt_rad)
    else:
        shadow_ratio = 100  # 거의 수평 → 매우 긴 그림자
    
    return Vec3(x=round(sx, 4), y=0, z=round(sz, 4)), round(shadow_ratio, 2)


# ══════════════════════════════════════════════════════════════
# 메인 계산 함수
# ══════════════════════════════════════════════════════════════

def calculate_solar(inp: SolarInput) -> SolarResult:
    """
    태양 궤적 & 그림자 계산 메인 함수.
    
    Steps:
        1. 입력 일시를 UTC로 변환
        2. NOAA 알고리즘으로 방위각/고도각 계산
        3. Three.js 벡터 변환
        4. 그림자 벡터/길이 계산
        5. (옵션) 하루 전체 경로
        6. (옵션) 동지일 일조시간
    """
    try:
        # ── 1. 일시 파싱 ──
        dt_local = _parse_datetime(inp.date_time)
        dt_utc = dt_local - timedelta(hours=inp.timezone_offset)
        
        # ── 2. 태양 위치 계산 ──
        azimuth, altitude = _sun_position(inp.latitude, inp.longitude, dt_utc)
        is_above = altitude > 0
        
        # ── 3. Three.js 벡터 ──
        sun_vec = _sun_to_threejs_vector(azimuth, altitude) if is_above else Vec3(x=0, y=-1, z=0)
        
        # ── 4. 그림자 ──
        shadow_vec, shadow_ratio = _shadow_vector(azimuth, altitude)
        
        #  ── 5. 일출/일몰 ──
        sr_utc, ss_utc = _calculate_sunrise_sunset(inp.latitude, inp.longitude, dt_utc)
        
        # UTC 시간이 음수일 수 있음 (동경 127° 서울: 일출=UTC 전일 22시 → -1.28h)
        # % 24로 래핑하여 현지 시간 변환
        if sr_utc != -1 and ss_utc != -1:
            sunrise_local = (sr_utc + inp.timezone_offset) % 24
            sunset_local = (ss_utc + inp.timezone_offset) % 24
            daylight = sunset_local - sunrise_local
            if daylight < 0:
                daylight += 24  # 자정 경계 넘는 경우
        else:
            sunrise_local = -1
            sunset_local = -1
            daylight = 0
        
        # ── 6. 하루 전체 경로 ──
        daily_path = []
        if inp.include_daily_path:
            for hr in range(0, 24):
                hr_dt = datetime(dt_local.year, dt_local.month, dt_local.day, hr, 0, 0)
                hr_utc = hr_dt - timedelta(hours=inp.timezone_offset)
                azi_h, alt_h = _sun_position(inp.latitude, inp.longitude, hr_utc)
                _, sr_h = _shadow_vector(azi_h, alt_h)
                daily_path.append(SunPathPoint(
                    hour=hr,
                    azimuth_deg=azi_h,
                    altitude_deg=alt_h,
                    shadow_length_ratio=sr_h,
                    is_above_horizon=alt_h > 0,
                ))
        
        # ── 7. 동지일 일조시간 ──
        ws_hours = 0.0
        ws_date = ""
        if inp.include_winter_solstice:
            # 동지일: 해당 연도의 12월 21일 또는 22일 (근사)
            ws_dt = datetime(dt_local.year, 12, 22, 12, 0, 0)
            ws_date = ws_dt.strftime("%Y-%m-%d")
            
            # 동지일의 유효 일조 시간 (altitude > 0인 시간 합산, 30분 간격)
            effective_hours = 0
            for half_hr in range(0, 48):
                hr = half_hr * 0.5
                ws_check = datetime(ws_dt.year, ws_dt.month, ws_dt.day, 
                                   int(hr), int((hr % 1) * 60), 0)
                ws_utc = ws_check - timedelta(hours=inp.timezone_offset)
                _, alt_ws = _sun_position(inp.latitude, inp.longitude, ws_utc)
                if alt_ws > 0:
                    effective_hours += 0.5
            
            ws_hours = round(effective_hours, 1)
        
        return SolarResult(
            azimuth_deg=azimuth,
            altitude_deg=altitude,
            is_above_horizon=is_above,
            sun_direction=sun_vec,
            shadow_direction=shadow_vec,
            shadow_length_ratio=shadow_ratio,
            sunrise_time=_hour_to_hhmm(sunrise_local) if sunrise_local >= 0 else "",
            sunset_time=_hour_to_hhmm(sunset_local) if sunset_local >= 0 else "",
            daylight_hours=round(daylight, 1),
            daily_path=daily_path,
            winter_solstice_hours=ws_hours,
            winter_solstice_date=ws_date,
            input_datetime=dt_local.strftime("%Y-%m-%d %H:%M"),
            latitude=inp.latitude,
            longitude=inp.longitude,
        )
        
    except Exception as e:
        return SolarResult(
            error=f"태양 궤적 계산 오류: {str(e)}",
        )


# ══════════════════════════════════════════════════════════════
# 유틸리티
# ══════════════════════════════════════════════════════════════

def _parse_datetime(s: str) -> datetime:
    """다양한 형식의 날짜/시간 문자열 파싱"""
    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
    ]:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    
    raise ValueError(f"지원하지 않는 날짜 형식: '{s}'. 예: '2026-12-22T12:00:00'")


def _hour_to_hhmm(hour: float) -> str:
    """시간(소수) → HH:MM 문자열"""
    h = int(hour) % 24
    m = int((hour % 1) * 60)
    return f"{h:02d}:{m:02d}"
