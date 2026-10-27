#!/usr/bin/env node
// Indexador del RTL Verilog -> src/content/rtl-index.json (ver CONTRACT.md v2). Sin dependencias.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_RTL_ROOT = '/home/mateo/facu/arquitectura-de-computadoras/project_4/project_4.srcs/sources_1/new';
export const PREFIX = 'project_4/project_4.srcs/sources_1/new/';

const KEYWORDS = new Set(('module endmodule input output inout reg wire assign always initial if else begin end case casex casez endcase default for while ' +
  'function endfunction task endtask generate endgenerate genvar integer localparam parameter defparam posedge negedge or and nand nor xor xnor not buf ' +
  'return signed unsigned supply0 supply1 tri real time repeat forever fork join disable wait').split(' '));

// Quita comentarios y strings conservando saltos de línea y longitud (los offsets no cambian).
export function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } }
    else if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
    } else if (c === '"') {
      out += ' '; i++;
      while (i < n && src[i] !== '"') { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += ' '; i++;
    } else { out += c; i++; }
  }
  // directivas de compilador (`timescale, `include, `ifdef...) fuera; los macros `NAME se conservan
  return out.replace(/^[ \t]*`(timescale|include|define|ifdef|ifndef|else|endif|undef|default_nettype|resetall)\b.*$/gm, (m) => ' '.repeat(m.length));
}

const clog2 = (x) => (x <= 1 ? 0 : Math.ceil(Math.log2(x)));

// Evalúa una expresión constante simple. Devuelve número o null.
export function evalConst(expr, env = {}) {
  if (expr == null) return null;
  let e = String(expr).trim();
  if (!e) return null;
  let bad = false;
  e = e.replace(/(\d*)'([sS]?)([bBdDhHoO])([0-9a-fA-FxXzZ_?]+)/g, (m, w, s, b, v) => {
    if (/[xXzZ?]/.test(v)) { bad = true; return '0'; }
    const base = { b: 2, d: 10, h: 16, o: 8 }[b.toLowerCase()];
    const num = parseInt(v.replace(/_/g, ''), base);
    return String(Number.isNaN(num) ? (bad = true, 0) : num);
  });
  if (bad) return null;
  e = e.replace(/\$clog2/g, 'clog2');
  e = e.replace(/[A-Za-z_]\w*/g, (id) => {
    if (id === 'clog2') return id;
    if (Object.prototype.hasOwnProperty.call(env, id) && typeof env[id] === 'number') return String(env[id]);
    bad = true; return '0';
  });
  if (bad) return null;
  if (!/^[\d\s+\-*/%()<>&|^~,.clog2]*$/.test(e)) return null;
  try { const v = Function('clog2', `"use strict"; return (${e});`)(clog2); return Number.isFinite(v) ? Math.trunc(v) : null; } catch { return null; }
}

function splitTop(s, sep = ',') {
  const parts = [];
  let depth = 0, cur = '', start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    if (c === sep && depth === 0) { parts.push({ text: cur, off: start }); cur = ''; start = i + 1; } else cur += c;
  }
  parts.push({ text: cur, off: start });
  return parts;
}

function balanced(s, openIdx) { // s[openIdx] === '(' -> índice del ')' correspondiente
  let d = 0;
  for (let i = openIdx; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')') { d--; if (d === 0) return i; }
  }
  return -1;
}

function widthOf(range) {
  if (!range) return 1;
  const m = range.match(/^\[\s*([\s\S]*?)\s*:\s*([\s\S]*?)\s*\]$/);
  if (!m) return range.replace(/\s+/g, '');
  const msb = m[1].trim(), lsb = m[2].trim();
  const a = evalConst(msb), b = evalConst(lsb);
  if (a != null && b != null) return Math.abs(a - b) + 1;
  if (b === 0) {
    const mm = msb.match(/^([\s\S]+?)\s*-\s*1$/);
    if (mm) return mm[1].replace(/\s+/g, '').replace(/^\((.*)\)$/, '$1');
  }
  return `${msb}:${lsb}`.replace(/\s+/g, '');
}

export function indexFile(raw) {
  const text = stripComments(raw);
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lineStarts.push(i + 1);
  const lineAt = (idx) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
  const lines = raw.length === 0 ? 0 : raw.split('\n').length - (raw.endsWith('\n') ? 1 : 0);

  const modules = [];
  const modRe = /\bmodule\s+([A-Za-z_]\w*)/g;
  let mm;
  while ((mm = modRe.exec(text))) {
    const endM = /\bendmodule\b/g; endM.lastIndex = mm.index;
    const em = endM.exec(text);
    const endIdx = em ? em.index : text.length;
    modules.push(indexModule(text, mm.index, mm.index + mm[0].length, mm[1], endIdx, lineAt));
    modRe.lastIndex = endIdx;
  }
  return { lines, modules };
}

function indexModule(text, startIdx, afterName, name, endIdx, lineAt) {
  const mod = { name, start: lineAt(startIdx), end: lineAt(endIdx), params: [], localparams: [], ports: [], instances: [], regs: [], wires: [], assigns: [], always: [], cases: [] };
  const env = {};
  let p = afterName;
  const skipWs = () => { while (p < endIdx && /\s/.test(text[p])) p++; };
  const pushParam = (list, name_, valueStr, idx) => {
    const v = evalConst(valueStr, env);
    const value = v != null ? v : valueStr.trim().replace(/\s+/g, ' ');
    if (typeof value === 'number') env[name_] = value;
    list.push({ name: name_, value, line: lineAt(idx) });
  };
  const parseParamDecl = (seg, base, list) => {
    // seg: "[type] [range] NAME = value" con keyword opcional
    const m = seg.match(/^\s*(?:(?:parameter|localparam)\s+)?(?:(?:signed|integer|real)\s+)?(?:\[[^\]]*\]\s*)?([A-Za-z_]\w*)\s*=\s*([\s\S]*)$/);
    if (!m) return;
    const nameOff = seg.indexOf(m[1], seg.search(/\S/));
    pushParam(list, m[1], m[2], base + nameOff);
  };

  skipWs();
  if (text[p] === '#') { // parámetros del header
    p++; skipWs();
    if (text[p] === '(') {
      const close = balanced(text, p);
      const inner = text.slice(p + 1, close);
      for (const part of splitTop(inner)) parseParamDecl(part.text, p + 1 + part.off, mod.params);
      p = close + 1;
    }
  }
  skipWs();
  if (text[p] === '(') { // puertos ANSI
    const close = balanced(text, p);
    const inner = text.slice(p + 1, close);
    let dir = null, width = 1, isReg = false;
    for (const part of splitTop(inner)) {
      let s = part.text;
      if (!s.trim()) continue;
      const lead = s.search(/\S/);
      const dm = s.match(/^\s*(input|output|inout)\b/);
      if (dm) { dir = dm[1]; width = 1; isReg = false; }
      const rm = s.match(/(\[[^\]]*\])/);
      const hasDecl = !!dm;
      if (hasDecl) { width = rm ? widthOf(rm[1].replace(/\s+/g, ' ')) : 1; isReg = /\breg\b/.test(s.slice(0, rm ? rm.index : s.length)); }
      const nm = s.replace(/\[[^\]]*\]/g, ' ').match(/([A-Za-z_]\w*)\s*$/);
      if (!nm || !dir) continue;
      const idx = p + 1 + part.off + s.lastIndexOf(nm[1]);
      const line = lineAt(idx);
      mod.ports.push({ name: nm[1], dir, width, line });
      if (isReg) mod.regs.push({ name: nm[1], width, array: null, line });
      void lead;
    }
    p = close + 1;
  }
  const bodyStart = p;
  const body = text.slice(bodyStart, endIdx);
  const B = bodyStart;

  // parameter/localparam del cuerpo
  const lpRe = /\b(localparam|parameter)\b([^;]*);/g;
  let m;
  while ((m = lpRe.exec(body))) {
    const list = m[1] === 'localparam' ? mod.localparams : mod.params;
    const declStart = B + m.index + m[1].length;
    const decl = m[2];
    let first = true;
    for (const part of splitTop(decl)) {
      parseParamDecl(first ? part.text : part.text, declStart + part.off, list);
      first = false;
    }
  }

  // reg / wire (incluye arrays y multi-nombre)
  const declRe = /\b(reg|wire)\b(?!\s*\()([^;]*);/g;
  while ((m = declRe.exec(body))) {
    const kind = m[1];
    const declStart = B + m.index + m[1].length;
    let decl = m[2];
    // descartar "output reg"/"input wire" del estilo no-ANSI no es necesario: sólo se agregan nombres locales
    const rm = decl.match(/^\s*(?:signed\s+)?(\[[^\]]*\])/);
    const width = rm ? widthOf(rm[1].replace(/\s+/g, ' ')) : 1;
    const after = rm ? decl.slice(rm[0].length) : decl.replace(/^\s*signed\b/, '');
    const afterOff = rm ? rm[0].length : decl.length - after.length;
    for (const part of splitTop(after)) {
      const seg = part.text.replace(/=[\s\S]*$/, '');
      const nm = seg.match(/^\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)$/);
      if (!nm) continue;
      const idx = declStart + afterOff + part.off + seg.indexOf(nm[1]);
      const line = lineAt(idx);
      if (kind === 'wire') mod.wires.push({ name: nm[1], width, line });
      else {
        let array = null;
        const am = nm[2].match(/\[\s*([\s\S]*?)\s*:\s*([\s\S]*?)\s*\]/);
        if (am) { const a = evalConst(am[1]), b = evalConst(am[2]); array = a != null && b != null ? Math.abs(a - b) + 1 : `${am[1]}:${am[2]}`.replace(/\s+/g, ''); }
        mod.regs.push({ name: nm[1], width, array, line });
      }
    }
  }

  // assign
  const asRe = /\bassign\b\s*([^=;]+?)\s*=(?!=)/g;
  while ((m = asRe.exec(body))) {
    let lhs = m[1].trim();
    const base = lhs.match(/^([A-Za-z_]\w*)\s*(?:\[[^\]]*\])?$/);
    mod.assigns.push({ lhs: base ? base[1] : lhs.replace(/\s+/g, ' '), line: lineAt(B + m.index) });
  }
  // wire x = expr; también es un assign implícito
  const wiRe = /\bwire\b(?!\s*\()([^;=]*?)\b([A-Za-z_]\w*)\s*=(?!=)/g;
  while ((m = wiRe.exec(body))) {
    if (!/^\s*(signed\s+)?(\[[^\]]*\])?\s*$/.test(m[1])) continue;
    mod.assigns.push({ lhs: m[2], line: lineAt(B + m.index), implicit: true });
  }

  // always
  const alRe = /\balways(?:_ff|_comb|_latch)?\b\s*(@\s*(?:\*|\(([^)]*)\)))?/g;
  while ((m = alRe.exec(body))) {
    const sens = m[2] || '';
    mod.always.push({ line: lineAt(B + m.index), kind: /\b(posedge|negedge)\b/.test(sens) || /_ff/.test(m[0]) ? 'ff' : 'comb' });
  }

  // cases: sólo dentro de case...endcase (región exterior)
  const tokRe = /\b(case[xz]?|endcase)\b/g;
  let depth = 0, regStart = -1;
  const regions = [];
  while ((m = tokRe.exec(body))) {
    if (m[1] === 'endcase') { depth--; if (depth === 0 && regStart >= 0) { regions.push([regStart, m.index]); regStart = -1; } }
    else { if (depth === 0) regStart = m.index; depth++; }
  }
  const item = "(?:`?[A-Za-z_]\\w*|\\d*'[sS]?[bBdDhHoO][0-9a-fA-FxXzZ_?]+|\\d+)";
  const labRe = new RegExp(`(^|\\n)[ \\t]*(?:begin\\s+)?(${item}(?:\\s*,\\s*${item})*)\\s*:(?![=:])`, 'g');
  const seen = new Set();
  for (const [a, b] of regions) {
    const reg = body.slice(a, b);
    // saltar el "(expr)" del propio case
    const hdr = reg.indexOf('(');
    const hdrEnd = hdr >= 0 ? balanced(reg, hdr) : 0;
    labRe.lastIndex = Math.max(hdrEnd, 0);
    let lm;
    while ((lm = labRe.exec(reg))) {
      const idx = B + a + lm.index + lm[1].length;
      const lineNo = lineAt(idx + (lm[0].length - lm[1].length - lm[2].length) - 1 + 1);
      for (const lab of lm[2].split(',').map((x) => x.trim())) {
        if (['default', 'begin', 'end', 'else'].includes(lab)) continue;
        const key = lab + '@' + lineNo;
        if (seen.has(key)) continue;
        seen.add(key);
        mod.cases.push({ label: lab, line: lineNo });
      }
    }
  }
  mod.cases.sort((x, y) => x.line - y.line);

  // instancias (tokenizando)
  const toks = [];
  const tRe = /[A-Za-z_$`][\w$]*|\d[\w']*|'[bBdDhHoO]\w+|\S/g;
  while ((m = tRe.exec(body))) toks.push({ t: m[0], i: m.index });
  const stmtStart = new Set([';', 'begin', 'end', 'generate', 'endgenerate', ')', ':']);
  const isId = (t) => /^[A-Za-z_]/.test(t) && !KEYWORDS.has(t);
  for (let k = 0; k < toks.length; k++) {
    if (k > 0 && !stmtStart.has(toks[k - 1].t)) continue;
    const A = toks[k];
    if (!isId(A.t)) continue;
    let j = k + 1;
    if (toks[j] && toks[j].t === '#') {
      j++;
      if (!toks[j] || toks[j].t !== '(') continue;
      const close = balanced(body, toks[j].i);
      if (close < 0) continue;
      while (j < toks.length && toks[j].i <= close) j++;
    }
    const Bn = toks[j];
    if (!Bn || !isId(Bn.t)) continue;
    let q = j + 1;
    if (toks[q] && toks[q].t === '[') { while (q < toks.length && toks[q].t !== ']') q++; q++; }
    if (!toks[q] || toks[q].t !== '(') continue;
    const close = balanced(body, toks[q].i);
    if (close < 0) continue;
    mod.instances.push({ name: Bn.t, module: A.t, line: lineAt(B + A.i), end: lineAt(B + close) });
  }
  return mod;
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full, base));
    else if (/\.(v|vh)$/.test(e.name)) out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

export function buildIndex(root = process.env.RTL_ROOT || DEFAULT_RTL_ROOT) {
  let commit = null;
  try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { commit = null; }
  const files = {};
  for (const f of walk(root).sort()) files[f] = indexFile(fs.readFileSync(path.join(root, f), 'utf8'));
  return { commit, prefix: PREFIX, generatedFrom: root, files };
}

// JSON pretty pero compacto: una línea por entrada de lista.
export function stringifyIndex(idx) {
  const cl = (o) => JSON.stringify(o);
  const out = [];
  out.push('{');
  out.push(`  "commit": ${cl(idx.commit)},`);
  out.push(`  "prefix": ${cl(idx.prefix)},`);
  out.push(`  "generatedFrom": ${cl(idx.generatedFrom)},`);
  out.push('  "files": {');
  const fkeys = Object.keys(idx.files);
  fkeys.forEach((f, fi) => {
    const F = idx.files[f];
    out.push(`    ${cl(f)}: { "lines": ${F.lines}, "modules": [`);
    F.modules.forEach((M, mi) => {
      out.push(`      { "name": ${cl(M.name)}, "start": ${M.start}, "end": ${M.end},`);
      const keys = ['params', 'localparams', 'ports', 'instances', 'regs', 'wires', 'assigns', 'always', 'cases'];
      keys.forEach((k, ki) => {
        const arr = M[k];
        const last = ki === keys.length - 1;
        if (!arr.length) out.push(`        "${k}": []${last ? '' : ','}`);
        else {
          out.push(`        "${k}": [`);
          arr.forEach((e, ei) => out.push(`          ${cl(e)}${ei < arr.length - 1 ? ',' : ''}`));
          out.push(`        ]${last ? '' : ','}`);
        }
      });
      out.push(`      }${mi < F.modules.length - 1 ? ',' : ''}`);
    });
    out.push(`    ]}${fi < fkeys.length - 1 ? ',' : ''}`);
  });
  out.push('  }');
  out.push('}');
  return out.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const root = process.env.RTL_ROOT || DEFAULT_RTL_ROOT;
  const idx = buildIndex(root);
  const outPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/content/rtl-index.json');
  fs.writeFileSync(outPath, stringifyIndex(idx));
  const mods = Object.values(idx.files).reduce((n, f) => n + f.modules.length, 0);
  console.log(`rtl-index: ${Object.keys(idx.files).length} archivos, ${mods} módulos, commit ${idx.commit} -> ${outPath}`);
}
