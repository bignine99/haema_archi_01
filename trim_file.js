const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, 'frontend', 'src', 'components', 'ui', 'RegulationPanel.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split(/\r?\n/);
const trimmed = lines.slice(0, 939).join('\r\n');
fs.writeFileSync(filePath, trimmed, 'utf8');
console.log('Done. Original lines:', lines.length, '-> Trimmed to:', trimmed.split('\r\n').length);
