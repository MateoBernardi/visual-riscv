// Fidelidad de las vistas de módulo contra el RTL indexado (src/content/rtl-index.json).
// Cada mensaje de error nombra: vista, campo y símbolo, para que se pueda corregir el schema directamente.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { VIEWS, viewForBlock, breadcrumb } from '../src/content/modules/index.js';
import { RTL_INDEX, fileEntry, moduleInfo, resolveSymbol, hasSymbol } from '../src/content/repo.js';
import { buildIndex, DEFAULT_RTL_ROOT } from '../scripts/rtl-index.mjs';

const BLOCK_IDS = ['pc', 'imem', 'ifid', 'control', 'regfile', 'immgen', 'idex', 'fwdMuxA', 'fwdMuxB', 'aluSrcMux', 'alu', 'branch',
  'exmem', 'dmem', 'wbMux', 'memwb', 'hazard', 'forward', 'flush', 'debug', 'uart', 'clkrst'];
const TOP_FILES = { top_riscv: 'top/top_riscv.v', riscv_pipeline: 'pipeline/riscv_pipeline.v' };
const views = Object.values(VIEWS);

function fail(errors) {
  if (errors.length) throw new Error('\n' + errors.map((e) => '  - ' + e).join('\n'));
}
const isNum = (x) => typeof x === 'number';

function checkView(v) {
  const e = [];
  const tag = (field, msg) => e.push(`[vista "${v.id}"] ${field}: ${msg}`);
  const file = v.file;
  if (!file || !fileEntry(file)) { tag('file', `"${file}" no existe en rtl-index.json (rutas relativas a ${RTL_INDEX.prefix})`); return e; }
  const mod = moduleInfo(file, v.module);
  if (!mod) {
    const have = (fileEntry(file).modules || []).map((m) => m.name).join(', ');
    tag('module', `"${v.module}" no existe en ${file} (módulos: ${have})`);
    return e;
  }
  if (v.id !== v.module && !v.pseudo && v.module !== 'riscv_pipeline') tag('id', `para un módulo real el id debería ser el nombre del módulo ("${v.module}"), es "${v.id}"`);
  if (v.parent != null && !VIEWS[v.parent]) tag('parent', `"${v.parent}" no es una vista registrada`);
  if (v.parent == null) {
    // vista raíz (cuelga de la Vista general): dice en qué módulo del RTL vive y por qué cadena de instancias se llega
    if (!TOP_FILES[v.within]) tag('within', `una vista con parent null necesita within = ${Object.keys(TOP_FILES).join(' | ')} (es "${v.within}")`);
    else if (!v.instancePath) tag('instancePath', 'falta instancePath (p. ej. "u_cpu.u_alu")');
    else {
      const segs = v.instancePath.split('.');
      const chain = v.within === 'riscv_pipeline' ? [['top/top_riscv.v', segs[0], 'u_cpu'], ...segs.slice(1).map((x) => [TOP_FILES.riscv_pipeline, x])] : segs.map((x) => [TOP_FILES.top_riscv, x]);
      if (v.within === 'riscv_pipeline' && segs[0] !== 'u_cpu') tag('instancePath', `debe empezar con u_cpu (es "${segs[0]}")`);
      for (const [f, name] of chain) if (!resolveSymbol(f, `inst:${name}`)) tag('instancePath', `"${name}" no es una instancia en ${f}`);
      const last = segs[segs.length - 1];
      if (v.instance && v.instance !== last) tag('instancePath', `termina en "${last}" pero instance es "${v.instance}"`);
    }
  } else if (v.within && !TOP_FILES[v.within]) tag('within', `"${v.within}" no es un módulo raíz del índice`);

  // ports
  const portNames = new Set();
  for (const p of v.ports || []) {
    portNames.add(p.name);
    if (v.pseudo) {
      if (!hasSymbol(file, p.name)) tag(`ports[${p.name}]`, `(pseudo-vista) "${p.name}" no es ningún símbolo de ${file}`);
      continue;
    }
    const rp = mod.ports.find((x) => x.name === p.name);
    if (!rp) { tag(`ports[${p.name}]`, `no existe como puerto de ${v.module} en ${file} (puertos: ${mod.ports.map((x) => x.name).join(', ')})`); continue; }
    if (isNum(p.width) && isNum(rp.width) && p.width !== rp.width) tag(`ports[${p.name}].width`, `el schema dice ${p.width} y el RTL ${rp.width}`);
    const dirOk = (p.dir === 'in' && rp.dir === 'input') || (p.dir === 'out' && rp.dir === 'output') || (p.dir === 'inout' && rp.dir === 'inout');
    if (p.dir && !dirOk) tag(`ports[${p.name}].dir`, `el schema dice "${p.dir}" y el RTL "${rp.dir}"`);
  }

  // parts
  const partIds = new Set();
  for (const p of v.parts || []) {
    if (partIds.has(p.id)) tag(`parts[${p.id}]`, 'id duplicado');
    partIds.add(p.id);
    if (p.symbol != null) {
      const pf = p.file || file;
      if (p.kind === 'submodule') {
        if (!resolveSymbol(pf, `inst:${p.symbol}`)) tag(`parts[${p.id}].symbol`, `"${p.symbol}" (submodule) no es una instancia en ${pf}`);
      } else if (!hasSymbol(pf, p.symbol)) {
        tag(`parts[${p.id}].symbol`, `"${p.symbol}" no existe en ${file} (probá con el nombre exacto del reg/wire/assign/instancia/localparam)`);
      }
    } else if (['reg', 'regArray', 'mem', 'submodule', 'ff'].includes(p.kind)) {
      tag(`parts[${p.id}].symbol`, `falta symbol (kind "${p.kind}")`);
    }
    if (p.drill && !VIEWS[p.drill]) tag(`parts[${p.id}].drill`, `"${p.drill}" no es una vista registrada`);
  }

  // nets
  const parentFile = v.parent && VIEWS[v.parent] ? VIEWS[v.parent].file : null;
  const netIds = new Set();
  const endOk = (x) => (typeof x === 'string' && x.startsWith('port:') ? portNames.has(x.slice(5)) : partIds.has(x));
  for (const n of v.nets || []) {
    if (netIds.has(n.id)) tag(`nets[${n.id}]`, 'id duplicado');
    netIds.add(n.id);
    for (const end of ['from', 'to']) {
      if (!endOk(n[end])) tag(`nets[${n.id}].${end}`, `"${n[end]}" no es un part id ni "port:<nombre>" de un puerto declarado en esta vista`);
    }
    if (n.name != null) {
      const ok = hasSymbol(file, n.name) || (parentFile && hasSymbol(parentFile, n.name));
      if (!ok) tag(`nets[${n.id}].name`, `"${n.name}" no existe en ${file}${parentFile ? ` ni en el padre ${parentFile}` : ''}`);
    }
  }

  // refs
  for (const r of v.refs || []) {
    if (!resolveSymbol(file, r.sym)) tag(`refs["${r.label}"].sym`, `${JSON.stringify(r.sym)} no se resuelve en ${file}`);
  }

  // fsm
  if (v.fsm) {
    const f = v.fsm;
    const ffile = f.file || file;
    if (!fileEntry(ffile)) tag('fsm.file', `"${ffile}" no existe en rtl-index.json`);
    else {
      if (f.stateSymbol && !hasSymbol(ffile, f.stateSymbol) && !hasSymbol(file, f.stateSymbol)) tag('fsm.stateSymbol', `"${f.stateSymbol}" no existe en ${ffile} ni en ${file}`);
      const names = new Set();
      for (const s of f.states || []) {
        names.add(s.name);
        let found = null;
        for (const m of fileEntry(ffile).modules) { const lp = m.localparams.find((x) => x.name === s.name); if (lp) { found = lp; break; } }
        if (!found) tag(`fsm.states[${s.name}]`, `no existe como localparam en ${ffile}`);
        else if (found.value !== s.code) tag(`fsm.states[${s.name}].code`, `el schema dice ${JSON.stringify(s.code)} y el localparam vale ${JSON.stringify(found.value)}`);
      }
      for (const [i, t] of (f.transitions || []).entries()) {
        for (const end of ['from', 'to']) if (!names.has(t[end])) tag(`fsm.transitions[${i}].${end}`, `"${t[end]}" no es un estado declarado en fsm.states`);
        if (t.caseLabel && !resolveSymbol(ffile, `case:${t.caseLabel}`)) tag(`fsm.transitions[${i}].caseLabel`, `"${t.caseLabel}" no es una etiqueta de case en ${ffile}`);
      }
    }
  }
  return e;
}

describe('rtl-index: vistas vs RTL', () => {
  if (views.length === 0) {
    it.skip('VIEWS está vacío (los schemas de src/content/modules/ todavía no están escritos): se omiten los chequeos por vista y globales', () => {});
  }
  for (const v of views) {
    it(`vista "${v.id}" coincide con el RTL`, () => fail(checkView(v)));
  }

  it.skipIf(views.length === 0)('cada bloque 3D (CONTRACT v1) tiene una vista', () => {
    const e = BLOCK_IDS.filter((b) => !viewForBlock(b)).map((b) => `el bloque 3D "${b}" no está en ningún blockIds de las vistas (viewForBlock devuelve null)`);
    fail(e);
  });

  it.skipIf(views.length === 0)('el breadcrumb de cada vista termina en una raíz (parent null) con within', () => {
    const e = [];
    for (const v of views) {
      const bc = breadcrumb(v.id);
      const root = VIEWS[bc[0]];
      if (!root || root.parent != null || !TOP_FILES[root.within]) e.push(`[vista "${v.id}"] breadcrumb = ${bc.join(' > ')}: la raíz "${bc[0]}" no tiene parent null + within (revisar la cadena de parent)`);
      if (bc.length > 8) e.push(`[vista "${v.id}"] cadena demasiado larga (¿ciclo de parent?)`);
    }
    fail(e);
  });
  it.skipIf(views.length === 0)('toda vista hija es alcanzable por un drill de su padre', () => {
    const e = [];
    for (const v of views) {
      if (v.parent == null) continue;
      const par = VIEWS[v.parent];
      if (par && !(par.parts || []).some((p) => p.drill === v.id)) e.push(`[vista "${v.id}"] el padre "${v.parent}" no tiene ninguna parte con drill: '${v.id}'`);
    }
    fail(e);
  });
});

describe('rtl-index: índice commiteado vs RTL en disco', () => {
  const root = process.env.RTL_ROOT || DEFAULT_RTL_ROOT;
  const exists = fs.existsSync(root);
  it.skipIf(!exists)('src/content/rtl-index.json está al día (corré `npm run rtl-index`)', () => {
    const fresh = buildIndex(root);
    // el commit puede avanzar sin cambiar los .v; se compara el contenido indexado
    expect(JSON.parse(JSON.stringify(fresh.files))).toEqual(RTL_INDEX.files);
    expect(fresh.prefix).toBe(RTL_INDEX.prefix);
  });
  it('el índice tiene los módulos esperados', () => {
    expect(moduleInfo('pipeline/3_execute/alu.v', 'alu_tp1')).toBeTruthy();
    expect(moduleInfo('pipeline/regs/pipe_reg.v', 'if_id_reg')).toBeTruthy();
    expect(resolveSymbol('debug/debug_unit_fsm.v', 'state:DUMP_BYTE')).toBeTruthy();
    expect(resolveSymbol('pipeline/riscv_pipeline.v', 'inst:u_mem_wb')).toBeTruthy();
  });
});
