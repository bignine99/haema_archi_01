import type { Config } from 'tailwindcss';

const config: Config = {
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx,mdx}',
    ],
    theme: {
        extend: {
            colors: {
                'brand': {
                    50: '#eef7ff',
                    100: '#d9edff',
                    200: '#bbdfff',
                    300: '#8cccff',
                    400: '#55b0ff',
                    500: '#2e8fff',
                    600: '#1a72f5',
                    700: '#125be1',
                    800: '#154ab6',
                    900: '#17418f',
                    950: '#132957',
                },
                'surface': {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617',
                },
            },
            fontFamily: {
                sans: ['Pretendard', 'Inter', 'system-ui', 'sans-serif'],
            },
            animation: {
                'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
                'slide-up': 'slide-up 0.5s ease-out',
                'fade-in': 'fade-in 0.3s ease-out',
            },
            keyframes: {
                'glow-pulse': {
                    '0%, 100%': { boxShadow: '0 0 20px rgba(46, 143, 255, 0.3)' },
                    '50%': { boxShadow: '0 0 40px rgba(46, 143, 255, 0.6)' },
                },
                'slide-up': {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
            },
        },
    },
    plugins: [],
};

export default config;
