'use strict';
// 从 bundled-resources 的 zip 中提取指定文件（不整包解压）
// 用法: node unzip_pick.js <zip路径> <输出目录> [文件名过滤子串...]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const zipPath = process.argv[2];
const outDir = process.argv[3];
const filters = process.argv.slice(4);

const tmp = path.join(outDir, '_tmp');
fs.mkdirSync(tmp, { recursive: true });

// PowerShell Expand-Archive 解压到临时目录
execFileSync('powershell', ['-NoProfile', '-Command',
  `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmp.replace(/'/g, "''")}' -Force`
], { stdio: 'inherit' });

function walk(dir, base) {
  base = base || dir;
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

const all = walk(tmp);
const pick = filters.length
  ? all.filter(f => filters.some(x => f.includes(x)))
  : all;

for (const rel of pick) {
  const src = path.join(tmp, rel);
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('  ' + (fs.statSync(dest).size / 1024).toFixed(1).padStart(9) + ' KB  ' + rel);
}
console.log(`\n提取 ${pick.length}/${all.length} 个文件 -> ${outDir}`);