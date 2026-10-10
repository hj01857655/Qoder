'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const out = process.argv[3];

const ops = [];
let i = 0;

while (true) {
  const i0 = src.indexOf('path:"', i);
  if (i0 === -1) break;

  const vStart = i0 + 6;                 // 跳过 path:"  -> 指向值首字符
  let pEnd = src.indexOf('"', vStart);    // 值的闭合引号
  if (pEnd === -1) break;

  const path = src.slice(vStart, pEnd);
  i = pEnd + 1;
  if (path.indexOf('/api/') !== 0) continue;

  // operation 名：形如  name:{path:"..."  —— src[i0-1] 是 '{'，再往前是 ':'
  let s = i0 - 1;
  while (s > 0 && (src[s] === ':' || src[s] === '{' || src[s] === ' ' || src[s] === ',')) s--;
  const nameEnd = s + 1;
  while (s > 0 && /[\w$]/.test(src[s])) s--;
  const name = src.slice(s + 1, nameEnd);

  // 括号配平切出本对象体
  const bStart = src.lastIndexOf('{', i0);  // 外层对象起点（在 path 之前）
  if (bStart === -1) break;
  let depth = 0, k = bStart;
  for (; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { k++; break; } }
    if (k - bStart > 3000) break;
  }
  const obj = src.slice(bStart, k);
  i = k;

  const mM = /,\s*method\s*:\s*"([A-Z]+)"/.exec(obj);
  if (!mM) continue;

  const body = /bodySchema\s*:\s*"([^"]+)"/.exec(obj);
  const hdr = /requiredHeaders\s*:\s*\[([^\]]*)\]/.exec(obj);
  const codes = [];
  const ri = obj.indexOf('responses:');
  if (ri !== -1) {
    const re2 = /(\d{3})\s*:\s*"([^"]+)"/g;
    let r;
    while ((r = re2.exec(obj.slice(ri))) !== null) codes.push(r[1] + '=' + r[2]);
  }

  ops.push({
    name, path, method: mM[1],
    bodySchema: body ? body[1] : null,
    requiredHeaders: hdr ? hdr[1].replace(/\s/g, '') : null,
    responses: codes,
  });
}

fs.writeFileSync(out, JSON.stringify(ops, null, 1));

console.log('operation 数: ' + ops.length);
console.log('唯一 (method+path): ' + new Set(ops.map(o => o.method + ' ' + o.path)).size);
console.log('有 name: ' + ops.filter(o => o.name).length + '/' + ops.length);
console.log('带 bodySchema: ' + ops.filter(o => o.bodySchema).length);

const dist = {};
ops.forEach(o => dist[o.method] = (dist[o.method] || 0) + 1);
console.log('\n=== 方法分布 ===');
Object.entries(dist).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log('  ' + String(v).padStart(4) + '  ' + k));

console.log('\n=== 抽样 12 条 ===');
ops.slice(0, 12).forEach(o => {
  console.log('  ' + o.method.padEnd(6) + ' ' + o.path);
  console.log('        op=' + (o.name || '(空)') +
    (o.bodySchema ? '  body=' + o.bodySchema : '') +
    (o.responses.length ? '  resp=' + o.responses.join(',') : ''));
});
console.log('\n-> ' + out);