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
        // ⚠ DefinePlugin 은 빌드 시 '문자열 치환' 이다. 환경변수로 넣어도 번들 .js 에 값이 남는다.
        //    「소스코드에 넣지 않으니 안전하다」가 통하지 않는 자리였다 — 배포본에서 실측 확인.
        //    Gemini : 앱이 사용자에게 키를 입력받으므로 주입 자체가 불필요하다. 제거.
        //    Kakao  : REST 키는 도메인 제한이 없다. /api/kakao 프록시로 옮겼다. 제거.
        //    VWorld : 지도 타일 URL 에 들어가 프록시가 부적합하다. 대신 VWorld 콘솔에서
        //             도메인을 등록해 그 도메인에서만 동작하게 막는다(요청에 domain= 을 이미 보낸다).
        new webpack.DefinePlugin({
            'process.env.VWORLD_API_KEY': JSON.stringify(dotenv.VWORLD_API_KEY || process.env.VWORLD_API_KEY || ''),
        }),
    ],
    devServer: {
        port: 3001,
        hot: true,
        open: false,
        historyApiFallback: true,
        proxy: [
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
            {
                context: ['/land-use-api'],
                target: 'http://localhost:8010',
                pathRewrite: { '^/land-use-api': '' },
                changeOrigin: true,
            },
            {
                context: ['/api/land-use', '/api/pnu', '/api/zone-limits', '/api/fc', '/api/site'],
                target: 'http://localhost:8010',
                changeOrigin: true,
            },
        ],
    },
};
