import os
import shutil
import json

base_dir = r"c:\Users\cho\Desktop\Temp\05 Code\260226_haema_arch"
frontend_dir = os.path.join(base_dir, "frontend")
target_dir = os.path.join(base_dir, "services", "04_3d_mass")

# 1. Copy essential configuration files
files_to_copy = [
    "tsconfig.json",
    "tailwind.config.js",
    "postcss.config.js"
]

for f in files_to_copy:
    src = os.path.join(frontend_dir, f)
    dst = os.path.join(target_dir, f)
    if os.path.exists(src):
        shutil.copy2(src, dst)

# 2. Copy the src folder
src_dir = os.path.join(frontend_dir, "src")
target_src_dir = os.path.join(target_dir, "src")
if os.path.exists(target_src_dir):
    shutil.rmtree(target_src_dir)
shutil.copytree(src_dir, target_src_dir)

# 3. Create Vite configuration
vite_config = """import { defineConfig } from 'vite';
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
    host: '0.0.0.0',
    proxy: {
        '/api': {
            target: 'http://localhost:8001',
            changeOrigin: true
        }
    }
  },
});
"""
with open(os.path.join(target_dir, "vite.config.ts"), "w", encoding="utf-8") as f:
    f.write(vite_config)

# 4. Create index.html for Vite
index_html = """<!DOCTYPE html>
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
</html>
"""
with open(os.path.join(target_dir, "index.html"), "w", encoding="utf-8") as f:
    f.write(index_html)

# 5. Create main.tsx
main_tsx_path = os.path.join(target_src_dir, "main.tsx")
if not os.path.exists(main_tsx_path):
    # fallback to creating one
    main_tsx = """import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
"""
    with open(main_tsx_path, "w", encoding="utf-8") as f:
        f.write(main_tsx)

# 6. Update target package.json
target_pkg_path = os.path.join(target_dir, "package.json")
with open(os.path.join(frontend_dir, "package.json"), "r", encoding="utf-8") as f:
    frontend_pkg = json.load(f)

with open(target_pkg_path, "r", encoding="utf-8") as f:
    target_pkg = json.load(f)

# Merge dependencies
target_pkg["dependencies"] = frontend_pkg.get("dependencies", {})
target_pkg["devDependencies"].update({
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/three": "^0.160.0",
    "@vitejs/plugin-react": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
})
target_pkg["scripts"] = {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
}

with open(target_pkg_path, "w", encoding="utf-8") as f:
    json.dump(target_pkg, f, indent=4)

print("04_3d_mass module correctly bootstrapped with Vite wrapper and sources.")
