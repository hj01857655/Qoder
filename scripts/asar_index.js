'use strict';
// 解析 asar 头部，输出目录树与体积分布
const fs = require('fs');

const asarPath = process.argv[2];
const buf = fs.readFileSync(asarPath);

// asar 头: [u32 pickleSize][u32 headerSize][u32 headerPickleSize][u32 jsonSize][json...]
const headerSize = buf.readUInt32LE(4);
const jsonSize = buf.readUInt32LE(12);
const header = JSON.parse(buf.toString('utf8', 16, 16 + jsonSize));
const dataStart = 8 + headerSize;

const files = [];
function walk(node, prefix) {
  for (const name in node.files) {
    const entry = node.files[name];
    const full = prefix + '/' + name;
    if (entry.files) walk(entry, full);
    else files.push({ path: full, size: entry.size, offset: entry.offset });
  }
}
walk(header, '');

console.log('文件总数: ' + files.length);
const total = files.reduce((a, f) => a + f.size, 0);
console.log('解包后总大小: ' + (total / 1048576).toFixed(1) + ' MB');
console.log('数据区起始偏移: ' + dataStart);

// 按二级目录聚合
const agg = {};
for (const f of files) {
  const seg = f.path.split('/');
  const key = seg[1] || '(root)';
  agg[key] = (agg[key] || 0) + f.size;
}
console.log('\n=== 顶层目录体积 ===');
Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 20)
  .forEach(([k, v]) => console.log('  ' + (v / 1048576).toFixed(2).padStart(8) + ' MB  ' + k));

// 最大的单文件
console.log('\n=== 最大单文件 Top 15 ===');
files.slice().sort((a, b) => b.size - a.size).slice(0, 15)
  .forEach(f => console.log('  ' + (f.size / 1048576).toFixed(2).padStart(8) + ' MB  ' + f.path));

// 导出供后续提取
fs.writeFileSync(process.argv[3] || 'index.json', JSON.stringify({ dataStart, files }, null, 1));
console.log('\n索引已写出');