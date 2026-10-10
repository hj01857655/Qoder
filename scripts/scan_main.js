'use strict';
// 扫描主进程 bundle：IPC 通道 / 错误码 / QODER 常量 / 关键调用计数
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

function grab(re, label, limit) {
  const out = new Set();
  let m;
  while ((m = re.exec(src)) !== null) {
    out.add(m[1]);
    if (out.size > 5000) break;
  }
  const arr = [...out].sort();
  console.log('\n=== ' + label + ' (' + arr.length + ') ===');
  arr.slice(0, limit || 30).forEach(s => console.log('  ' + s));
  return arr;
}

// bundle 已压缩，IPC 通道名多以字符串字面量出现在调用参数里
grab(/(?:\.handle\(|\.on\(|\.invoke\()["'`]([a-z][a-zA-Z0-9_.\-]{4,55})["'`]/g,
  'IPC 风格通道', 45);

grab(/\b((?:MCP|QODER|AGENT|WORKSPACE|GIT|SESSION)_[A-Z0-9_]{3,45})\b/g,
  '错误码常量', 32);

grab(/\b(QODER_[A-Z0-9_]{3,45})\b/g, 'QODER_ 常量', 30);

console.log('\n--- 关键调用计数 ---');
const pairs = [
  ['ipcMain', /ipcMain/g],
  ['contextBridge', /contextBridge/g],
  ['safeStorage', /safeStorage/g],
  ['webContents.send', /webContents\.send/g],
  ['spawn(', /\bspawn\(/g],
  ['machineId', /machineId|machine_id/g],
];
for (const p of pairs) {
  console.log('  ' + p[0] + ': ' + (src.match(p[1]) || []).length);
}
console.log('\nbundle 字符数: ' + src.length);