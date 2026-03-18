const fs = require('fs');
const path = require('path');

function copyDirStructure(srcDir, destDir) {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    const entries = fs.readdirSync(srcDir, { withFileTypes: true });

    for (let entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            copyDirStructure(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

try {
    console.log("🚀 [1/4] Starting 04_3d_mass Code Migration...");

    const targetBase = path.join(__dirname, 'services', '04_3d_mass');

    // Copy src directory
    copyDirStructure(
        path.join(__dirname, 'frontend', 'src'),
        path.join(targetBase, 'src')
    );
    console.log("✅ [2/4] React Source Code Migrated!");

    // Copy build config
    const filesToCopy = ['tsconfig.json', 'tailwind.config.js', 'postcss.config.js'];
    filesToCopy.forEach(f => {
        const p = path.join(__dirname, 'frontend', f);
        if (fs.existsSync(p)) {
            fs.copyFileSync(p, path.join(targetBase, f));
        }
    });

    // Create vite.config.ts
    const viteConfig = `import { defineConfig } from 'vite';
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
    port: 3004, // 3D Mass는 3004번 포트 사용 
    host: '0.0.0.0',
    proxy: {
        '/api': {
            target: 'http://localhost:8001',
            changeOrigin: true
        }
    }
  },
});`;
    fs.writeFileSync(path.join(targetBase, 'vite.config.ts'), viteConfig);

    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>3D Mass Module - HAEMA ARCHI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;
    fs.writeFileSync(path.join(targetBase, 'index.html'), indexHtml);

    // Create main.tsx
    const mainTsxPath = path.join(targetBase, 'src', 'main.tsx');
    if (!fs.existsSync(mainTsxPath)) {
        const mainTsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
        fs.writeFileSync(mainTsxPath, mainTsx);
    }

    // Rewrite App.tsx to only show 3DMass for this specific container
    const appTsxPath = path.join(targetBase, 'src', 'App.tsx');
    if (fs.existsSync(appTsxPath)) {
        let appContent = fs.readFileSync(appTsxPath, 'utf8');
        // Replace full render logic with just the 3D Mass viewer
        appContent = appContent.replace(/export default function App\(\) \{[\s\S]*?return \([\s\S]*?\}\);?\s*\}/,
            `export default function App() {
    // 04_3d_mass 독립 MSA 컨테이너 전용 엔트리: 3D 엔진만 렌더링합니다.
    return (
        <div className="h-screen w-screen relative overflow-hidden bg-slate-50">
            <Suspense fallback={<LoadingSpinner />}>
                <SceneViewer />
            </Suspense>
            <MapPanel />
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 glass-panel px-6 py-2 flex items-center gap-4 z-10 shadow-sm border border-white/40">
                <div className="flex items-center gap-2">
                    <div className="w-16 h-[2px] bg-slate-400" />
                    <span className="text-[10px] text-slate-600 font-medium">10m</span>
                </div>
                <span className="text-[11px] text-slate-600 font-medium">[MSA] 3D Mass Engine</span>
            </div>
        </div>
    );
}`);
        fs.writeFileSync(appTsxPath, appContent);
    }

    // Rewrite package.json
    const frontendPkgPath = path.join(__dirname, 'frontend', 'package.json');
    const targetPkgPath = path.join(targetBase, 'package.json');
    let targetPkg = {};
    if (fs.existsSync(targetPkgPath)) {
        targetPkg = require(targetPkgPath);
    } else {
        targetPkg = {
            name: "haema-archi-3d-mass",
            version: "1.0.0",
            private: true,
            dependencies: {},
            devDependencies: {}
        };
    }

    if (fs.existsSync(frontendPkgPath)) {
        const frontendPkg = require(frontendPkgPath);
        targetPkg.dependencies = frontendPkg.dependencies || {};
    }

    targetPkg.devDependencies = targetPkg.devDependencies || {};
    Object.assign(targetPkg.devDependencies, {
        "@types/react": "^18.2.0",
        "@types/react-dom": "^18.2.0",
        "@types/three": "^0.160.0",
        "@vitejs/plugin-react": "^4.0.0",
        "autoprefixer": "^10.4.0",
        "postcss": "^8.4.0",
        "tailwindcss": "^3.4.0",
        "typescript": "^5.3.0",
    });

    targetPkg.scripts = {
        "dev": "vite",
        "build": "tsc && vite build",
        "preview": "vite preview"
    };

    fs.writeFileSync(path.join(targetBase, 'package.json'), JSON.stringify(targetPkg, null, 2));
    console.log("✅ [3/4] Vite Configuration & App.tsx Component Isolation Complete!");
    console.log("🎉 [4/4] 04_3D_Mass Module successfully migrated to MSA Structure.\n");
    console.log("👉 Now run the following commands to test the separated module:");
    console.log("   cd services/04_3d_mass");
    console.log("   npm install");
    console.log("   npm run dev");

} catch (e) {
    console.error("❌ Error migrating:", e);
}
