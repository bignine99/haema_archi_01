import os
import json

base_dir = r"c:\Users\cho\Desktop\Temp\05 Code\260226_haema_arch"

services = [
    "01_dashboard", "02_regulation", "03_site_analysis", "04_3d_mass",
    "05_siteplan", "06_bubble", "07_floorplan", "08_elevation",
    "09_section", "10_concept", "11_concept_image"
]

dockerfile_content = """# ==========================================
# Stage 1: 의존성 설치 및 빌드 (Builder)
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
# 모듈 고유 의존성 설치
RUN npm install --legacy-peer-deps

# 소스코드 복사 및 빌드
COPY . .
RUN npm run build || echo "Build skipped or empty"

# ==========================================
# Stage 2: 운영 환경 (Production Runner)
# ==========================================
FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV production

# 빌더 스테이지 결과물 복사
COPY --from=builder /app/package.json ./
# React/Vite 빌드 결과물(dist 폴더)만 서빙하기 위해 리액트 환경 구성
COPY --from=builder /app/node_modules ./node_modules
# 만약 빌드 결과물이 있다면 복사 
RUN mkdir -p dist
COPY --from=builder /app/dist ./dist 2>/dev/null || true

# 가벼운 정적 파일 서빙 라이브러리 추가
RUN npm install -g serve

EXPOSE 3000

# 서빙
CMD ["serve", "-s", "dist", "-l", "3000"]
"""

for s in services:
    s_dir = os.path.join(base_dir, "services", s)
    os.makedirs(s_dir, exist_ok=True)
    
    # Write Dockerfile
    with open(os.path.join(s_dir, "Dockerfile"), "w", encoding="utf-8") as f:
        f.write(dockerfile_content)
        
    # Write package.json (Minimal React/Vite boilerplate)
    pkg = {
        "name": f"haema-archi-{s.replace('_', '-')}",
        "version": "1.0.0",
        "private": True,
        "scripts": {
            "dev": "vite",
            "build": "vite build",
            "preview": "vite preview"
        },
        "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0"
        },
        "devDependencies": {
            "vite": "^4.0.0"
        }
    }
    with open(os.path.join(s_dir, "package.json"), "w", encoding="utf-8") as f:
        json.dump(pkg, f, indent=4)
        
print("MSA Skeleton Modules successfully generated.")
