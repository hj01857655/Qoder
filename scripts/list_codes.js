'use strict';
// 主进程 bundle 全面扫描：业务码分类统计 + 完整清单导出
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(process.argv[2], 'utf8');
const outDir = process.argv[3] || '.';

// 业务错误码
const codes = new Set();
const re = /\b((?:MCP|QODER|AGENT|WORKSPACE|GIT|SESSION|TERMINAL|RUNTIME|PLUGIN|AUTH|COLLAB)_[A-Z0-9_]{3,50})\b/g;
let m;
while ((m = re.exec(src)) !== null) codes.add(m[1]);

const byPrefix = {};
for (const c of codes) {
  const p = c.split('_')[0];
  (byPrefix[p] = byPrefix[p] || []).push(c);
}

console.log('业务码总数: ' + codes.size);
console.log('\n=== 按前缀 ===');
Object.entries(byPrefix).sort((a, b) => b[1].length - a[1].length).forEach(([p, arr]) => {
  console.log('  ' + String(arr.length).padStart(4) + '  ' + p + '_*');
});

// 导出完整清单
const file = path.join(outDir, 'business-codes.json');
fs.writeFileSync(file, JSON.stringify(byPrefix, null, 1));
console.log('\n完整清单 -> ' + file);
Object.entries(byPrefix).sort((a, b) => b[1].length - a[1].length).forEach(([p, arr]) => {
  console.log('\n--- ' + p + ' (' + arr.length + ') ---');
  console.log(arr.sort().join('\n'));
});