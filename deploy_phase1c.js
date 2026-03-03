const fs = require('fs');
const path = require('path');

// 절대 경로 사용
const srcBase = path.resolve(__dirname, 'frontend');
const dstBase = 'C:\\dev\\flexity-frontend';

const files = [
    'src/services/regulationEngine.ts',
    'src/components/three/SceneViewer.tsx',
    'src/components/ui/ControlPanel.tsx',
    'src/App.tsx',
    'src/store/projectStore.ts',
    'src/index.css',
    'src/main.tsx',
];

console.log('Source: ' + srcBase);
console.log('Dest:   ' + dstBase);

let ok = 0, fail = 0;
files.forEach(f => {
    const s = path.join(srcBase, f);
    const d = path.join(dstBase, f);
    try {
        if (!fs.existsSync(s)) {
            console.log('MISSING: ' + s);
            fail++;
            return;
        }
        fs.copyFileSync(s, d);
        const sSize = fs.statSync(s).size;
        const dSize = fs.statSync(d).size;
        if (sSize === dSize) {
            console.log('OK ' + f + ' (' + sSize + ' bytes)');
            ok++;
        } else {
            console.log('SIZE MISMATCH ' + f + ': src=' + sSize + ' dst=' + dSize);
            fail++;
        }
    } catch (e) {
        console.log('FAIL ' + f + ': ' + e.message);
        fail++;
    }
});
console.log('\nResult: ' + ok + ' OK, ' + fail + ' FAIL');
