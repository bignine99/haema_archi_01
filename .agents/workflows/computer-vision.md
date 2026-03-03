---
description: Computer Vision & Raster Analysis (이미지 분석) - OpenCV, OCR, 위성영상 분석 가이드
---

# Computer Vision & Raster Analysis 스킬

현상설계 지침서/위성영상/경관사진에서 **유의미한 공간·법규 정보를 자동 추출**하는 기술 가이드.

---

## 1. 기술 스택

| 기술 | 용도 | 설치 |
|------|------|------|
| **OpenCV** | 이미지 처리, 경사도 분석, 영역 분할 | `pip install opencv-python` |
| **Pillow** | 이미지 로드/변환/저장 | `pip install Pillow` |
| **NumPy** | 래스터 행렬 연산 | `pip install numpy` |
| **Rasterio** | GeoTIFF/DEM 처리 | `pip install rasterio` |
| **Tesseract OCR** | 범용 문자 인식 | `pip install pytesseract` |
| **PaddleOCR** | 한국어 특화 OCR | `pip install paddleocr paddlepaddle` |
| **Scikit-image** | 고급 이미지 분석 | `pip install scikit-image` |
| **GDAL** | 지리공간 래스터 변환 | `pip install GDAL` |

---

## 2. 위성 영상 / 지형 분석

### 2-1. 경사도 분석 (Slope Analysis from DEM)

```python
import numpy as np
import rasterio
import cv2

def analyze_slope(dem_path: str) -> dict:
    """
    DEM(Digital Elevation Model) 파일에서 경사도 분석
    
    건축 관련 기준:
    - 0~5°: 평지 (건축 최적)
    - 5~15°: 완만한 경사 (토목 공사 필요)
    - 15~30°: 급경사 (절토/성토 대규모)
    - 30°+: 건축 부적합
    """
    with rasterio.open(dem_path) as src:
        elevation = src.read(1).astype(float)
        transform = src.transform
        pixel_size = abs(transform[0])  # 미터/픽셀
    
    # Gradient 계산 (Sobel 필터)
    grad_x = cv2.Sobel(elevation, cv2.CV_64F, 1, 0, ksize=3) / pixel_size
    grad_y = cv2.Sobel(elevation, cv2.CV_64F, 0, 1, ksize=3) / pixel_size
    
    # 경사도 (도 단위)
    slope_rad = np.arctan(np.sqrt(grad_x**2 + grad_y**2))
    slope_deg = np.degrees(slope_rad)
    
    # 경사 방향 (Aspect)
    aspect = np.degrees(np.arctan2(-grad_y, grad_x))
    aspect[aspect < 0] += 360
    
    # 통계
    return {
        'mean_slope': float(np.mean(slope_deg)),
        'max_slope': float(np.max(slope_deg)),
        'min_elevation': float(np.min(elevation)),
        'max_elevation': float(np.max(elevation)),
        'elevation_diff': float(np.max(elevation) - np.min(elevation)),
        'slope_map': slope_deg,        # 경사도 맵 (2D array)
        'aspect_map': aspect,          # 경사방향 맵
        'buildable_ratio': float(np.mean(slope_deg < 15)),  # 건축가능 비율
    }
```

### 2-2. 위성 영상에서 토지 피복 분류

```python
import cv2
import numpy as np

def classify_land_cover(image_path: str) -> dict:
    """
    위성/항공 사진에서 토지 피복 분류 (HSV 색상 기반)
    
    Returns:
        각 피복 유형의 면적 비율
    """
    img = cv2.imread(image_path)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # 색상 범위 정의
    masks = {
        # 식생 (녹색 계열)
        'vegetation': cv2.inRange(hsv, (35, 40, 40), (85, 255, 255)),
        # 수체 (파란색 계열)
        'water': cv2.inRange(hsv, (100, 40, 40), (130, 255, 255)),
        # 건물/도로 (무채색 밝은 계열)
        'built_up': cv2.inRange(hsv, (0, 0, 160), (180, 40, 255)),
        # 나지 (갈색/황토색 계열)
        'bare_soil': cv2.inRange(hsv, (10, 40, 60), (30, 200, 200)),
    }
    
    total_pixels = img.shape[0] * img.shape[1]
    
    result = {}
    for name, mask in masks.items():
        ratio = float(np.count_nonzero(mask)) / total_pixels
        result[name] = round(ratio * 100, 1)  # 백분율
    
    result['other'] = round(100 - sum(result.values()), 1)
    
    return result
```

### 2-3. 일조 분석용 그림자 시뮬레이션 래스터

```python
import numpy as np

def compute_shadow_map(
    elevation: np.ndarray,
    sun_altitude: float,      # 태양 고도각 (도)
    sun_azimuth: float,       # 태양 방위각 (도, 북=0, 시계방향)
    pixel_size: float = 1.0   # 미터/픽셀
) -> np.ndarray:
    """
    DEM 기반 그림자 래스터 생성 (Ray casting)
    
    Returns:
        shadow_map: 0=그림자, 1=일조 (2D array)
    """
    h, w = elevation.shape
    shadow = np.ones((h, w), dtype=np.float32)
    
    # 태양 방향 벡터
    alt_rad = np.radians(sun_altitude)
    azi_rad = np.radians(sun_azimuth)
    
    dx = np.sin(azi_rad)  # 동-서 방향
    dy = -np.cos(azi_rad)  # 남-북 방향
    dz = np.tan(alt_rad)   # 높이 기울기
    
    # 각 픽셀에서 태양 방향으로 레이캐스팅
    for y in range(h):
        for x in range(w):
            ray_x, ray_y = float(x), float(y)
            ray_z = elevation[y, x]
            
            while True:
                ray_x += dx
                ray_y += dy
                ray_z += dz * pixel_size
                
                ix, iy = int(ray_x), int(ray_y)
                if ix < 0 or ix >= w or iy < 0 or iy >= h:
                    break
                
                if elevation[iy, ix] > ray_z:
                    shadow[y, x] = 0  # 그림자
                    break
    
    return shadow
```

---

## 3. OCR (문자 인식) - 법규 수치 추출

### 3-1. Tesseract OCR (범용)

```bash
# 설치 (Windows)
choco install tesseract
# 한국어 학습 데이터
# tesseract-ocr/tessdata에서 kor.traineddata 다운로드

pip install pytesseract
```

```python
import pytesseract
from PIL import Image
import re

def extract_text_from_image(image_path: str, lang: str = 'kor+eng') -> str:
    """이미지에서 텍스트 추출"""
    img = Image.open(image_path)
    text = pytesseract.image_to_string(img, lang=lang)
    return text
```

### 3-2. PaddleOCR (한국어 정확도 높음)

```python
from paddleocr import PaddleOCR

# 한국어 모델 초기화
ocr = PaddleOCR(lang='korean', use_gpu=False)

def extract_text_paddle(image_path: str) -> list[dict]:
    """
    PaddleOCR로 한국어 텍스트 추출
    
    Returns:
        [{'text': '건폐율 60%', 'confidence': 0.95, 'bbox': [...]}]
    """
    result = ocr.ocr(image_path)
    extracted = []
    
    for line in result[0]:
        bbox, (text, confidence) = line
        extracted.append({
            'text': text,
            'confidence': confidence,
            'bbox': bbox,  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
        })
    
    return extracted
```

### 3-3. 건축 법규 수치 자동 추출

```python
import re
from typing import Optional

def extract_building_regulations(text: str) -> dict:
    """
    OCR 텍스트에서 건축 법규 핵심 수치 추출
    
    추출 항목:
    - 건폐율 (Building Coverage Ratio)
    - 용적률 (Floor Area Ratio)
    - 높이 제한 (Height Limit)
    - 주차 대수 기준
    - 건축선 후퇴 거리
    - 일조 이격 거리
    """
    regulations = {}
    
    # 건폐율
    bcr = re.search(r'건폐율[:\s]*(\d+(?:\.\d+)?)\s*%', text)
    if bcr:
        regulations['building_coverage_ratio'] = float(bcr.group(1))
    
    # 용적률
    far = re.search(r'용적률[:\s]*(\d+(?:\.\d+)?)\s*%', text)
    if far:
        regulations['floor_area_ratio'] = float(far.group(1))
    
    # 높이 제한
    height = re.search(r'(?:최고)?높이[:\s]*(\d+(?:\.\d+)?)\s*(?:m|미터)', text)
    if height:
        regulations['height_limit'] = float(height.group(1))
    
    # 주차 대수
    parking_patterns = [
        r'주차[:\s]*(\d+)\s*대',
        r'(\d+)\s*세대당\s*(\d+(?:\.\d+)?)\s*대',
        r'(\d+)\s*㎡당\s*(\d+)\s*대',
    ]
    for pattern in parking_patterns:
        match = re.search(pattern, text)
        if match:
            regulations['parking_info'] = match.group(0)
            break
    
    # 건축선 후퇴
    setback = re.search(r'건축선\s*후퇴[:\s]*(\d+(?:\.\d+)?)\s*(?:m|미터)', text)
    if setback:
        regulations['setback_distance'] = float(setback.group(1))
    
    # 일조권 이격 거리
    sunlight = re.search(r'(?:일조|인동)\s*(?:간격|이격)[:\s]*(?:건물높이의?\s*)?(\d+(?:\.\d+)?)\s*(?:배|H)', text)
    if sunlight:
        regulations['sunlight_distance_ratio'] = float(sunlight.group(1))
    
    # 대지면적
    land_area = re.search(r'대지\s*면적[:\s]*(\d[\d,]*(?:\.\d+)?)\s*㎡', text)
    if land_area:
        regulations['land_area'] = float(land_area.group(1).replace(',', ''))
    
    return regulations
```

### 3-4. PDF 설계지침서 일괄 처리 파이프라인

```python
import fitz  # PyMuPDF
from pathlib import Path

def process_guideline_pdf(pdf_path: str, output_dir: str = './ocr_output') -> dict:
    """
    설계지침서 PDF → 페이지별 이미지 → OCR → 법규 수치 추출
    
    Returns:
        {
            'page_count': 120,
            'regulations': { 건폐율, 용적률, ... },
            'raw_texts': ['페이지1 내용', ...]
        }
    """
    Path(output_dir).mkdir(exist_ok=True)
    doc = fitz.open(pdf_path)
    
    all_text = []
    all_regulations = {}
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # 텍스트 직접 추출 (텍스트 PDF)
        text = page.get_text()
        
        if len(text.strip()) < 20:
            # 이미지 기반 PDF → OCR 필요
            pix = page.get_pixmap(dpi=300)
            img_path = f"{output_dir}/page_{page_num:03d}.png"
            pix.save(img_path)
            text = extract_text_from_image(img_path)
        
        all_text.append(text)
        
        # 법규 수치 추출
        regs = extract_building_regulations(text)
        for key, val in regs.items():
            if key not in all_regulations:
                all_regulations[key] = val
    
    return {
        'page_count': len(doc),
        'regulations': all_regulations,
        'raw_texts': all_text,
    }
```

---

## 4. 이미지 전처리 파이프라인

### 4-1. 도면 이미지 정제

```python
import cv2
import numpy as np

def preprocess_drawing(image_path: str) -> np.ndarray:
    """
    건축 도면 이미지 전처리 (OCR 정확도 향상)
    
    1. 그레이스케일
    2. 이진화 (Adaptive Threshold)
    3. 노이즈 제거
    4. 기울기 보정 (Deskew)
    """
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    
    # 적응형 이진화 (조명 불균일 대응)
    binary = cv2.adaptiveThreshold(
        img, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 15, 8
    )
    
    # 모폴로지 연산 (노이즈 제거 + 문자 연결)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    cleaned = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    
    # 기울기 보정
    coords = np.column_stack(np.where(cleaned < 128))
    if len(coords) > 100:
        angle = cv2.minAreaRect(coords)[-1]
        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle
        
        if abs(angle) > 0.5:
            h, w = cleaned.shape
            M = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
            cleaned = cv2.warpAffine(
                cleaned, M, (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE
            )
    
    return cleaned
```

### 4-2. 위성 영상 전처리

```python
def preprocess_satellite(image_path: str, target_size: tuple = (512, 512)) -> np.ndarray:
    """
    위성 영상 전처리 (분류/세그멘테이션 모델 입력용)
    
    1. 리사이즈
    2. 히스토그램 평활화 (대비 향상)
    3. 정규화 (0~1)
    """
    img = cv2.imread(image_path)
    img = cv2.resize(img, target_size, interpolation=cv2.INTER_LANCZOS4)
    
    # CLAHE (대비 향상)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    img = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
    
    # 정규화
    normalized = img.astype(np.float32) / 255.0
    
    return normalized
```

---

## 5. 프론트엔드 통합 (웹 기반 이미지 분석)

### Canvas API를 활용한 클라이언트 사이드 이미지 처리

```typescript
/**
 * 브라우저에서 이미지 히스토그램 분석
 * (서버 없이 간단한 이미지 분석)
 */
function analyzeImageHistogram(imageElement: HTMLImageElement): {
    brightness: number;
    contrast: number;
    greenRatio: number;
} {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    ctx.drawImage(imageElement, 0, 0);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalBrightness = 0;
    let greenPixels = 0;
    const pixelCount = data.length / 4;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        totalBrightness += (r + g + b) / 3;
        
        // 식생 판별 (녹색 우세)
        if (g > r * 1.2 && g > b * 1.2 && g > 60) {
            greenPixels++;
        }
    }
    
    return {
        brightness: totalBrightness / pixelCount / 255,
        contrast: 0, // TODO: 표준편차 계산
        greenRatio: greenPixels / pixelCount,
    };
}
```

---

## 체크리스트

- [ ] OpenCV + Rasterio 환경 구축
- [ ] DEM 기반 경사도 분석 구현
- [ ] 위성 영상 토지 피복 분류
- [ ] PaddleOCR 한국어 모델 설정
- [ ] 건축 법규 정규표현식 패턴 테스트
- [ ] PDF 일괄 처리 파이프라인
- [ ] 도면 이미지 전처리 (기울기 보정)
- [ ] 그림자 시뮬레이션 래스터 생성
- [ ] 프론트엔드 이미지 분석 (Canvas API)
