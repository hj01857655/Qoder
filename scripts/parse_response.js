'use strict';
// 提取泛型信封 Response 的 data 内部 schema
// 形态：function ENVELOPE(t,{...}){ ...DATA(t.data,{instancePath:e+"/data",...})... }
//
// 关键线索：
//   1. allowed 字段列表（envelope 层：code/data/message/requestId/success）
//   2. 对 data 调用另一个校验函数 DATA(...)
//   3. DATA 的函数体里嵌套更深（assigneeAgent.xxx）可继续下钻
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const out = process.argv[3];

// 取函数体（跳过参数表）
function fnBody(fnName, maxScan) {
  const fm = new RegExp('function\\s+' + fnName + '\\s*\\(').exec(src);
  if (!fm) return null;
  const start = src.indexOf('(', fm.index);
  let depth = 0, end = -1;
  for (let k = start; k < src.length; k++) {
    const ch = src[k];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end === -1) return null;
  const bs = src.indexOf('{', end);
  if (bs === -1 || bs - end > 300) return null;
  let bd = 0, be = -1;
  for (let k = bs; k < src.length && k < bs + (maxScan || 200000); k++) {
    if (src[k] === '{') bd++;
    else if (src[k] === '}') { bd--; if (bd === 0) { be = k; break; } }
  }
  return be === -1 ? null : src.slice(bs, be + 1);
}

// 从函数体解析字段（含嵌套路径）
function fieldsOf(fn) {
  const flat = {};
  // a) instancePath:e+"/x/y" 形式的字段名
  const pRe = /instancePath\s*:\s*e\s*\+\s*"((?:\/[^"]*)+)"/g;
  let p;
  while ((p = pRe.exec(fn)) !== null) {
    const path = p[1].split('/').filter(Boolean);
    const key = path.join('.');
    flat[key] = flat[key] || { path: path };
  }
  // b) allowed 字段
  const aRe = /l\s*===\s*"([A-Za-z_$][\w$]*)"|E\s*===\s*"([A-Za-z_$][\w$]*)"|h\s*===\s*"([A-Za-z_$][\w$]*)"/g;
  let a;
  while ((a = aRe.exec(fn)) !== null) {
    const n = a[1] || a[2] || a[3];
    if (n) flat[n] = flat[n] || { path: [n] };
  }
  // c) required
  const req = [];
  const rRe = /void 0\s*&&\s*\(\w+\s*=\s*"([^"]+)"\)/g;
  let r;
  while ((r = rRe.exec(fn)) !== null) req.push(r[1]);

  // d) 类型标注
  const types = {};
  const tRe = /properties\/([A-Za-z_$][\w$]*)(?:\/([A-Za-z_$][\w$]*))?\/type"\s*,\s*keyword\s*:\s*"type"\s*,\s*params\s*:\s*\{\s*type\s*:\s*"([^"]+)"/g;
  let t;
  while ((t = tRe.exec(fn)) !== null) {
    const k = t[2] ? t[1] + '.' + t[2] : t[1];
    types[k] = t[3];
  }
  // e) 格式校验（uuid/date-time）
  const fmts = {};
  const fRe = /properties\/([A-Za-z_$][\w$]*)\/format"\s*,\s*keyword\s*:\s*"format"\s*,\s*params\s*:\s*\{\s*format\s*:\s*"([^"]+)"/g;
  let f;
  while ((f = fRe.exec(fn)) !== null) fmts[f[1]] = f[2];

  Object.keys(flat).forEach(k => {
    if (types[k]) flat[k].type = types[k];
    if (fmts[k]) flat[k].format = fmts[k];
  });
  return { fields: flat, required: [...new Set(req)] };
}

// 主流程：TypeName -> ident -> fn -> dataFn
const pairs = {};
const pr = /([A-Z][A-Za-z0-9]{2,60}):([A-Za-z_$][\w$]{1,12}),/g;
let m;
while ((m = pr.exec(src)) !== null) pairs[m[1]] = m[2];

const apiOps = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
const respTypes = [...new Set(apiOps.flatMap(o => o.responses.map(r => r.split('=')[1])).filter(Boolean))];

const result = {};
for (const t of respTypes) {
  const ident = pairs[t];
  if (!ident) continue;
  const alias = new RegExp('var\\s+' + ident + '\\s*=\\s*([A-Za-z_$][\\w$]*)').exec(src);
  if (!alias) continue;
  const envFn = alias[1];
  const envBody = fnBody(envFn);
  if (!envBody) continue;

  // 找 data 的校验函数：DATA(t.data,{
  const dm = /(?:var\s+)?([A-Za-z_$][\w$]*)\s*\(\s*t\.data\s*,\s*\{instancePath\s*:\s*e\s*\+\s*"\/data"/.exec(envBody);
  if (!dm) continue;
  const dataFn = dm[1];
  const dataBody = fnBody(dataFn);
  if (!dataBody) continue;

  const parsed = fieldsOf(dataBody);
  if (!Object.keys(parsed.fields).length) continue;

  result[t] = {
    envelopeFn: envFn,
    dataFn,
    envelopeFields: ['code', 'message', 'success', 'data', 'requestId'],
    required: parsed.required,
    fields: parsed.fields,
  };
}

fs.writeFileSync(out, JSON.stringify(result, null, 1));
const keys = Object.keys(result);
console.log('响应类型总数: ' + respTypes.length);
console.log('成功提取 data schema: ' + keys.length);
console.log('-> ' + out);

console.log('\n=== 样例 ===');
[...keys.slice(0, 2), ...keys.slice(Math.floor(keys.length / 2), Math.floor(keys.length / 2) + 2)].forEach(k => {
  const r = result[k];
  console.log('\n' + k + '  (data=' + r.dataFn + ')');
  console.log('  required: ' + (r.required.join(', ') || '-'));
  Object.entries(r.fields).slice(0, 22).forEach(([n, f]) => {
    console.log('    ' + n + (f.type ? ':' + f.type : '') + (f.format ? '<' + f.format + '>' : ''));
  });
  if (Object.keys(r.fields).length > 22) console.log('    ... 共 ' + Object.keys(r.fields).length + ' 个');
});