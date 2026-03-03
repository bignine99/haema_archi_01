import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 3000,
        host: true,
        proxy: {
            '/kakao-api': {
                target: 'https://dapi.kakao.com',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/kakao-api/, ''),
                secure: true,
            },
            '/vworld-api': {
                target: 'https://api.vworld.kr',
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/vworld-api/, ''),
                secure: true,
            },
        },
    },
});
