const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

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
    ],
    devServer: {
        port: 3000,
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
            },
        ],
    },
};
