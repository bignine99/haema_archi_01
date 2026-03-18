import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import https from 'https';

export default defineConfig(({ mode }) => {
  // .env 파일에서 환경 변수 로드
  const env = loadEnv(mode, __dirname, '');

  return {
    plugins: [
      react(),
      // 건축물대장 API 서버 사이드 미들웨어 (프록시 대신 직접 Node.js 요청)
      {
        name: 'building-register-api-middleware',
        configureServer(server) {
          server.middlewares.use('/building-api', (req, res) => {
            // 원본 URL에서 /building-api 프리픽스 제거
            const apiPath = req.url || '';
            
            // URL을 수동 파싱하여 쿼리 스트링 재인코딩 방지
            const options = {
              hostname: 'apis.data.go.kr',
              port: 443,
              path: apiPath,  // 쿼리 스트링 그대로 유지
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Accept': '*/*',
              },
            };
            
            console.log(`[Building API] → GET https://apis.data.go.kr${apiPath.substring(0, 120)}...`);
            
            const apiReq = https.request(options, (apiRes) => {
              console.log(`[Building API] ← ${apiRes.statusCode}`);
              
              // CORS 헤더 추가
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Content-Type', apiRes.headers['content-type'] || 'application/json');
              
              res.statusCode = apiRes.statusCode || 200;
              apiRes.pipe(res);
            });
            
            apiReq.on('error', (err) => {
              console.error(`[Building API] ERROR:`, err.message);
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            });
            
            apiReq.end();
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
      'process.env.KAKAO_REST_KEY': JSON.stringify(env.KAKAO_REST_KEY || ''),
      'process.env.VWORLD_API_KEY': JSON.stringify(env.VWORLD_API_KEY || ''),
      'process.env.BUILDING_REGISTER_API_KEY': JSON.stringify(env.BUILDING_REGISTER_API_KEY || ''),
    },
    server: {
      port: 3004,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8001',
          changeOrigin: true,
        },
        '/massing-api': {
          target: 'http://127.0.0.1:8003',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/massing-api/, ''),
        },
        '/kakao-api': {
          target: 'https://dapi.kakao.com',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/kakao-api/, ''),
        },
        '/vworld-api': {
          target: 'https://api.vworld.kr',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/vworld-api/, ''),
          headers: {
            'Referer': 'http://localhost',
            'Origin': 'http://localhost',
          },
        },
        '/land-use-api': {
          target: 'http://127.0.0.1:8010',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/land-use-api/, ''),
        },
        // /building-api는 위 미들웨어 플러그인에서 처리 (프록시 대신 Node.js https.get)
      },
    },
  };
});