const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// .env 파일에서 환경변수를 로드 (dotenv 불필요 — 빌드 시 주입)
const dotenv = (() => {
    try {
        const fs = require('fs');
        const envPath = path.resolve(__dirname, '.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const vars = {};
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#')) {
                    const [key, ...rest] = trimmed.split('=');
                    vars[key.trim()] = rest.join('=').trim();
                }
            });
            return vars;
        }
    } catch (e) { /* .env 파일 없어도 OK (Vercel에서는 환경변수 직접 설정) */ }
    return {};
})();

module.exports = {
    cache: false,
    entry: './src/main.tsx',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        clean: true,
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.jsx'],
        alias: {
            '@': path.resolve(__dirname, 'src'),
        },
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader', 'postcss-loader'],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './index.html',
        }),
        // 환경변수를 빌드 시 코드에 주입 (API 키를 소스코드에 넣지 않음)
        new webpack.DefinePlugin({
            'process.env.KAKAO_REST_KEY': JSON.stringify(dotenv.KAKAO_REST_KEY || process.env.KAKAO_REST_KEY || ''),
            'process.env.VWORLD_API_KEY': JSON.stringify(dotenv.VWORLD_API_KEY || process.env.VWORLD_API_KEY || ''),
        }),
    ],
    devServer: {
        port: 3000,
        hot: true,
        open: false,
        historyApiFallback: true,
        proxy: [
            {
                context: ['/api/gemini'],
                target: 'https://generativelanguage.googleapis.com',
                pathRewrite: { '^/api/gemini': `/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${dotenv.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''}` },
                changeOrigin: true,
                secure: true,
            },
            {
                context: ['/kakao-api'],
                target: 'https://dapi.kakao.com',
                pathRewrite: { '^/kakao-api': '' },
                changeOrigin: true,
                secure: true,
                headers: {
                    'Origin': 'http://localhost',
                    'Referer': 'http://localhost/',
                },
            },
            {
                context: ['/vworld-api'],
                target: 'http://api.vworld.kr',
                pathRewrite: { '^/vworld-api': '' },
                changeOrigin: true,
                headers: {
                    'Origin': 'http://localhost',
                    'Referer': 'http://localhost/',
                },
                onProxyRes: function (proxyRes, req, res) {
                    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
                }
            },
        ],
    },
};
