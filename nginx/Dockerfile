FROM nginx:1.24-alpine

# 기존 기본 설정 파일 제거 (옵션)
RUN rm /etc/nginx/conf.d/default.conf

# 우리가 작성한 라우팅 룰(nginx.conf)을 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
