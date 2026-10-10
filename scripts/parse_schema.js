'use strict';
// 字段级 schema 还原 —— 两条来源
//  A) var IDENT=FN,{properties:{...},required:[...]}   结构化字面量
//  B) zod 校验函数中的
//     schemaPath:"#/$defs/TYPE/properties/FIELD/keyword" + params
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const out = process.argv[3];

// ---------- A) 映射表 ----------
const pairs = {};
const pairRe = /([A-Z][A-Za-z0-9]{2,60}):([A-Za-z_$][\w$]{1,12}),/g;
let m;
while ((m = pairRe.exec(src)) !== null) pairs[m[1]] = m[2];

// ---------- B) 从 schemaPath 抽约束 ----------
const constraints = {};
const spRe = /\$defs\/([A-Za-z0-9_]+)\/properties\/([A-Za-z_$][\w$]*)\/([A-Za-z]+)"[\s\S]{0,240}?params\s*:\s*\{([\s\S]{0,240}?)\}/g;
let sp;
while ((sp = spRe.exec(src)) !== null) {
  const type = sp[1], field = sp[2], keyword = sp[3], raw = sp[4];
  const params = {};
  const pr = /([A-Za-z_$][\w$]*)\s*:\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?e?\d*|!0|!1))/g;
  let pp;
  while ((pp = pr.exec(raw)) !== null) params[pp[1]] = pp[2] !== undefined ? pp[2] : pp[3];
  const T = constraints[type] || (constraints[type] = {});
  const F = T[field] || (T[field] = {});
  F[keyword] = params;
  if (keyword === 'type' && params.type) F.type = params.type;
  if (keyword === 'format' && params.format) F.format = params.format;
}

// ---------- 字面量收集 ----------
function braceAfter(idx, maxGap) {
  const b = src.indexOf('{', idx);
  if (b === -1 || b - idx > (maxGap || 200)) return null;
  let depth = 0, end = -1;
  for (let k = b; k < src.length && k < b + 20000; k++) {
    const ch = src[k];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return end === -1 ? null : src.slice(b, end + 1);
}
const defs = {};
const defRe = /var\s+([A-Za-z_$][\w$]{1,12})\s*=\s*[A-Za-z_$][\w$]*\s*,\s*/g;
let d;
while ((d = defRe.exec(src)) !== null) {
  const obj = braceAfter(d.index + d[0].length);
  if (obj && obj.indexOf('properties') !== -1) defs[d[1]] = obj;
}

// ---------- A) 字面量（若存在） ----------
function parseLiteral(obj) {
  const ps = obj.indexOf('properties:{');
  if (ps === -1) return { fields: {}, required: [] };
  const i = obj.indexOf('{', ps + 'properties:'.length);
  let depth = 0, k = i;
  for (; k < obj.length; k++) {
    if (obj[k] === '{') depth++;
    else if (obj[k] === '}') { depth--; if (depth === 0) break; }
  }
  if (k >= obj.length) return { fields: {}, required: [] };
  const block = obj.slice(i, k + 1);
  const fields = {};
  let pi = 1;
  while (pi < block.length) {
    const nm = /^([A-Za-z_$][\w$]*)\s*:\s*\{/.exec(block.slice(pi));
    if (!nm) break;
    const fname = nm[1];
    const fb = pi + nm[0].length - 1;
    let d2 = 0, e2 = fb;
    for (; e2 < block.length; e2++) {
      if (block[e2] === '{') d2++;
      else if (block[e2] === '}') { d2--; if (d2 === 0) break; }
    }
    const body = block.slice(fb, e2 + 1);
    pi = e2 + 1;
    while (pi < block.length && /[\s,]/.test(block[pi])) pi++;
    const info = {};
    const ty = /type\s*:\s*"([^"]+)"/.exec(body); if (ty) info.type = ty[1];
    const en = /enum\s*:\s*\[([^\]]*)\]/.exec(body);
    if (en) info.enum = en[1].split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    if (/\.optional\(\)/.test(body)) info.optional = true;
    if (/nullable/.test(body)) info.nullable = true;
    const fm = /format\s*:\s*"([^"]+)"/.exec(body); if (fm) info.format = fm[1];
    if (/properties\s*:/.test(body)) info.nested = true;
    if (/items\s*:/.test(body)) info.array = true;
    fields[fname] = info;
  }
  const required = [];
  const rq = obj.indexOf('required:[');
  if (rq !== -1) {
    obj.slice(rq + 9, obj.indexOf(']', rq)).split(',').forEach(x => {
      const t = x.trim().replace(/^["']|["']$/g, '');
      if (/^[A-Za-z_$][\w$]*$/.test(t)) required.push(t);
    });
  }
  return { fields, required, strict: /additionalProperties\s*:\s*!1|additionalProperties\s*:\s*false/.test(obj) };
}

// ---------- C) 仅校验函数形态：var IDENT=FN;function FN(...){...}
function parseFnBody(fnName) {
  const fre = new RegExp('function\\s+' + fnName + '\\s*\\(');
  const fm = fre.exec(src);
  if (!fm) return null;
  // 参数表结束位置 end；函数体从其后的 '{' 开始
  const start = src.indexOf('(', fm.index);
  let depth = 0, end = -1;
  for (let k = start; k < src.length; k++) {
    const ch = src[k];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end === -1) return null;

  // 从 end+1 起做花括号配平，取函数体
  const bodyStart = src.indexOf('{', end);
  if (bodyStart === -1 || bodyStart - end > 200) return null;
  let bd = 0, bodyEnd = -1;
  for (let k = bodyStart; k < src.length && k < bodyStart + 40000; k++) {
    const ch = src[k];
    if (ch === '{') bd++;
    else if (ch === '}') { bd--; if (bd === 0) { bodyEnd = k; break; } }
  }
  if (bodyEnd === -1) return null;
  const fn = src.slice(bodyStart, bodyEnd + 1);

  // 允许字段：!(h==="a"||h==="b")
  const allowed = [];
  const allowRe = /([a-zA-Z]\w*)!==\s*"([A-Za-z_$][\w$]*)"/g;
  let a;
  const allowMap = {};
  while ((a = allowRe.exec(fn)) !== null) {
    if (a[1] === 'h' || a[1] === 'c') allowMap[a[2]] = 1;
  }
  Object.keys(allowMap).forEach(k => allowed.push(k));

  // 允许字段（字面量或运算）： !==("a"||"b")
  const allow2 = /!==\s*\(([^)]{3,200})\)/g;
  let a2;
  while ((a2 = allow2.exec(fn)) !== null) {
    const lits = a2[1].match(/"([A-Za-z_$][\w$]*)"/g) || [];
    lits.forEach(l => { const v = l.replace(/"/g, ''); if (allowed.indexOf(v) === -1) allowed.push(v); });
  }

  // required：t.X===void 0&&(Y="X")
  const required = [];
  const reqRe = /t\.([A-Za-z_$][\w$]*)\s*===\s*void 0\s*&&\s*\(\w+\s*=\s*"([A-Za-z_$][\w$]*)"\)/g;
  let r1;
  while ((r1 = reqRe.exec(fn)) !== null) required.push(r1[2]);

  // 类型：#/properties/X/type  params:{type:"T"}
  const types = {};
  const tRe = /properties\/([A-Za-z_$][\w$]*)\/type"\s*,\s*keyword\s*:\s*"type"\s*,\s*params\s*:\s*\{\s*type\s*:\s*"([^"]+)"/g;
  let t2;
  while ((t2 = tRe.exec(fn)) !== null) types[t2[1]] = t2[2];

  // enum
  const enums = {};
  const eRe = /enum\s*:\s*\[([^\]]*)\]/g;
  let e2;
  while ((e2 = eRe.exec(fn)) !== null) {
    const before = fn.slice(Math.max(0, e2.index - 300), e2.index);
    const pm = [...before.matchAll(/([A-Za-z_$][\w$]*)\s*===\s*"/g)].pop();
    if (pm) {
      enums[pm[1]] = e2[1].split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
  }

  // 数字约束（裸比较）
  const numeric = {};
  const nRe = /properties\/([A-Za-z_$][\w$]*)\/(maximum|minimum|maxLength|minLength)"/g;
  let n2;
  while ((n2 = nRe.exec(fn)) !== null) {
    numeric[n2[1]] = numeric[n2[1]] || {};
    numeric[n2[1]][n2[2]] = true;
  }

  if (!allowed.length && !Object.keys(types).length && !required.length) return null;

  const fields = {};
  const names = new Set([...allowed, ...Object.keys(types), ...required]);
  names.forEach(n => {
    const f = { name: n };
    if (types[n]) f.type = types[n];
    if (enums[n]) f.enum = enums[n];
    if (numeric[n]) Object.assign(f, numeric[n]);
    const isReq = required.indexOf(n) !== -1;
    if (!isReq) f.optional = true;
    fields[n] = f;
  });

  return {
    fields,
    required,
    strict: /additionalProperties/.test(fn),
  };
}

// ---------- 合并 ----------
// 关键：校验函数（fn）是权威 —— 字面量常只列 enum 子集，required 字段可能缺失。
// 因此凡能取到校验函数的类型，一律用 fn 覆盖/补全 literal。
const result = {};
for (const [typeName, ident] of Object.entries(pairs)) {
  const lit = defs[ident] ? parseLiteral(defs[ident]) : null;

  // 取校验函数结果
  const alias = new RegExp('var\\s+' + ident + '\\s*=\\s*([A-Za-z_$][\\w$]*)').exec(src);
  const fn = alias ? parseFnBody(alias[1]) : null;

  const entry = { ident };
  const fieldMap = {};

  // 1) 先铺字面量
  if (lit) {
    Object.entries(lit.fields || {}).forEach(([n, f]) => { fieldMap[n] = Object.assign({}, f); });
    if (lit.required && lit.required.length) entry.required = lit.required.slice();
    if (lit.strict) entry.strict = true;
  }

  // 2) 校验函数补全/覆盖
  if (fn && Object.keys(fn.fields).length) {
    entry.fn = alias[1];
    Object.entries(fn.fields).forEach(([n, f]) => {
      fieldMap[n] = Object.assign({}, fieldMap[n], f);
    });
    // fn 的 required 更全，取并集
    const req = new Set([...(entry.required || []), ...fn.required]);
    entry.required = [...req];
    if (fn.strict) entry.strict = true;
  }

  if (!Object.keys(fieldMap).length) continue;

  entry.source = lit && fn ? 'literal+fn' : (lit ? 'literal' : 'fn');
  entry.fields = fieldMap;
  result[typeName] = entry;
}
for (const [typeName, fields] of Object.entries(constraints)) {
  if (!result[typeName]) result[typeName] = { source: 'zod', fields: {}, required: [] };
  else result[typeName].source += '+zod';
  for (const [fname, cons] of Object.entries(fields)) {
    result[typeName].fields[fname] = Object.assign({ name: fname }, result[typeName].fields[fname] || {}, cons);
  }
}

fs.writeFileSync(out, JSON.stringify(result, null, 1));
const keys = Object.keys(result);
console.log('映射对: ' + Object.keys(pairs).length);
console.log('字面量定义: ' + Object.keys(defs).length);
console.log('zod 约束类型: ' + Object.keys(constraints).length);
console.log('合计还原: ' + keys.length);
console.log('-> ' + out);

const apiFile = process.argv[4];
if (apiFile && fs.existsSync(apiFile)) {
  const api = JSON.parse(fs.readFileSync(apiFile, 'utf8'));
  const bodies = [...new Set(api.map(o => o.bodySchema).filter(Boolean))];
  const hit = bodies.filter(b => result[b]);
  console.log('\nbodySchema 覆盖: ' + hit.length + '/' + bodies.length);
  const miss = bodies.filter(b => !result[b]);
  if (miss.length) console.log('未覆盖(' + miss.length + '): ' + miss.join(', '));
}

console.log('\n=== CreateFileRequest ===');
const cf = result['CreateFileRequest'];
if (cf) {
  console.log('  source=' + cf.source);
  Object.entries(cf.fields).forEach(([n, f]) => {
    const b = [n];
    if (f.type) b.push(':' + f.type);
    if (f.format) b.push('<' + f.format + '>');
    const flat = (v) => (v && typeof v === 'object') ? JSON.stringify(v) : v;
    if (f.maxLength) b.push(' maxLen=' + flat(f.maxLength));
    if (f.minLength) b.push(' minLen=' + flat(f.minLength));
    if (f.maximum) b.push(' max=' + flat(f.maximum));
    if (f.minimum) b.push(' min=' + flat(f.minimum));
    if (f.enum) b.push(' =' + JSON.stringify(f.enum).slice(0, 46));
    if (f.optional) b.push('?');
    console.log('    ' + b.join(' '));
  });
} else console.log('  (未还原)');

console.log('\n=== 覆盖来源分布 ===');
if (fs.existsSync(apiFile || '')) {
  const apiOps = JSON.parse(fs.readFileSync(apiFile, 'utf8'));
  const bodies = [...new Set(apiOps.map(o => o.bodySchema).filter(Boolean))];
  const covered = bodies.filter(b => result[b]);
  const bySrc = {};
  covered.forEach(b => { const s = result[b].source; (bySrc[s] || (bySrc[s] = [])).push(b); });
  Object.entries(bySrc).forEach(([s, list]) => console.log('  ' + s + ': ' + list.length + ' 个'));

  console.log('\n--- MessageAPISendMessage ---');
  const ms = result['MessageAPISendMessage'];
  if (ms) {
    console.log('  source=' + ms.source + '  strict=' + ms.strict);
    console.log('  required: ' + (ms.required.join(', ') || '-'));
    Object.entries(ms.fields).forEach(([n, f]) => {
      const b = [n];
      if (f.type) b.push(':' + f.type);
      if (f.format) b.push('<' + f.format + '>');
      if (f.enum) b.push(' =' + JSON.stringify(f.enum).slice(0, 30));
      if (f.optional) b.push('?');
      console.log('    ' + b.join(' '));
    });
  }
  console.log('\n--- AssignIssueAgent ---');
  const ag = result['AssignIssueAgent'];
  if (ag) {
    console.log('  source=' + ag.source + '  strict=' + ag.strict);
    console.log('  required: ' + (ag.required.join(', ') || '-'));
    console.log('  fields: ' + Object.entries(ag.fields)
      .map(([n, f]) => n + (f.type ? ':' + f.type : '') + (f.optional ? '?' : '')).join(', '));
  }
}