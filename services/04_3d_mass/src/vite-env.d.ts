/// <reference types="vite/client" />

// Vite define으로 주입되는 process.env 변수 타입 선언
declare namespace NodeJS {
    interface ProcessEnv {
        KAKAO_REST_KEY: string;
        VWORLD_API_KEY: string;
        GEMINI_API_KEY: string;
        BUILDING_REGISTER_API_KEY: string;
    }
}

declare const process: {
    env: {
        KAKAO_REST_KEY: string;
        VWORLD_API_KEY: string;
        GEMINI_API_KEY: string;
        BUILDING_REGISTER_API_KEY: string;
        [key: string]: string | undefined;
    };
};
