'use strict';
// 核实 webPreferences 配置的完整上下文（避免误判）
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');

const keys = ['contextIsolation', 'nodeIntegration', 'sandbox', 'webSecurity',
              'allowRunningInsecureContent', 'nodeIntegrationInWorker', 'nodeIntegrationInSubFrames',
              'webviewTag', 'experimentalFeatures', 'spellcheck'];

keys.forEach(k => {
  const re = new RegExp(k + '\\s*:\\s*(![01]|true|false)', 'g');
  const found = [...src.matchAll(re)].map(x => x[1]);
  if (!found.length) { console.log('  ' + k.padEnd(28) + '(未出现)'); return; }
  const uniq = [...new Set(found)];
  console.log('  ' + k.padEnd(28) + uniq.join(', ') + '   (' + found.length + ' 次)');
});

console.log('');
console.log('=== webPreferences 对象样例 ===');
const wp = /webPreferences\s*:\s*\{/.exec(src);
if (wp) {
  // 花括号配平
  const b = src.indexOf('{', wp.index);
  let d = 0, e = -1;
  for (let k = b; k < src.length && k < b + 3000; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { e = k; break; } }
  }
  if (e > 0) console.log(src.slice(b, e + 1).replace(/\n/g, ' ').slice(0, 700));
}