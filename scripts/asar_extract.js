'use strict';
// 按索引从 asar 提取文件。用法: node asar_extract.js <asar> <index.json> <模式> <输出目录>
// 模式: all | js | main | pattern
const fs = require('fs');
const path = require('path');

const [, , asarPath, indexPath, mode, outDir] = process.argv;
const buf = fs.readFileSync(asarPath);
const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
const dataStart = idx.dataStart;

let list = idx.files;

if (mode === 'js') {
  list = list.filter(f => /\.js$|\.cjs$|\.mjs$|\.json$/.test(f.path));
} else if (mode === 'main') {
  list = list.filter(f => f.path.startsWith('/out/main/'));
} else if (mode && mode.startsWith('/')) {
  list = list.filter(f => f.path.startsWith(mode));
}

let saved = 0, bytes = 0;
for (const f of list) {
  const rel = f.path.replace(/^\//, '');
  const dest = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const start = dataStart + Number(f.offset);
  fs.writeFileSync(dest, buf.subarray(start, start + f.size));
  saved++; bytes += f.size;
}
console.log(`提取 ${saved} 个文件, ${(bytes / 1048576).toFixed(2)} MB -> ${outDir}`);