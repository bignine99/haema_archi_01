FROM node:20-alpine

WORKDIR /app

# 의존성 먼저 설치 (캐시 레이어 활용)
COPY package.json package-lock.json ./
RUN npm ci

# 소스 코드 복사
COPY . .

EXPOSE 3000

# Webpack Dev Server 실행 (HMR 활성화, 0.0.0.0에 바인딩)
CMD ["npx", "webpack", "serve", "--mode", "development", "--host", "0.0.0.0", "--port", "3000"]
