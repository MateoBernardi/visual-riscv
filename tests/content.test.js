// El contenido didáctico es coherente con el simulador: cada ejemplo y cada programa de prueba termina con lo que
// dice su `expect`, y las referencias entre lecciones, ejemplos y la lista de preparación existen.
import { describe, it, expect } from 'vitest';
import { assemble, Pipeline, PIPELINE_TEST } from '../src/sim/index.js';
import { EXAMPLES, LESSONS, BUILD_CHECKLIST, TEST_CATEGORIES } from '../src/content/index.js';
import { VERIF } from '../src/content/verification.js';

function run(code, max = 5000) {
  const r = assemble(code === '__PIPELINE_TEST__' ? PIPELINE_TEST : code);
  expect(r.errors).toEqual([]);
  const p = new Pipeline(); p.load(r.words);
  let n = 0; while (!p.halted && n < max) { p.step(); n++; }
  return p;
}
function check(p, exp) {
  const bad = [];
  for (const [k, v] of Object.entries(exp.regs || {})) if ((p.regs[Number(k.slice(1))] >>> 0) !== (v >>> 0)) bad.push(`${k}: ${p.regs[Number(k.slice(1))]} != ${v}`);
  for (const [k, v] of Object.entries(exp.mem || {})) if ((p.dmem[Number(k)] >>> 0) !== (v >>> 0)) bad.push(`mem[${k}]: ${p.dmem[Number(k)]} != ${v}`);
  return bad;
}

describe('contenido', () => {
  for (const e of EXAMPLES) {
    it(`ejemplo ${e.id} cumple su expect`, () => {
      const p = run(e.code);
      expect(p.halted).toBe(true);
      expect(check(p, e.expect || {})).toEqual([]);
    });
  }
  for (const c of TEST_CATEGORIES) for (const prog of c.programs) {
    if (prog.neverHalts || prog.knownIssue) continue;
    it(`programa de prueba ${c.id} / ${prog.title}`, () => {
      const p = run(prog.code);
      expect(p.halted).toBe(true);
      expect(check(p, prog.expect || {})).toEqual([]);
    });
  }
  it('referencias de las lecciones', () => {
    const ids = new Set(LESSONS.map((l) => l.id)), ex = new Set(EXAMPLES.map((e) => e.id));
    for (const l of LESSONS) {
      if (l.next) expect(ids.has(l.next), `${l.id}.next = ${l.next}`).toBe(true);
      if (l.exampleId) expect(ex.has(l.exampleId), `${l.id}.exampleId = ${l.exampleId}`).toBe(true);
    }
    for (const c of BUILD_CHECKLIST) if (c.step) expect(ids.has(c.step), `checklist ${c.id}.step = ${c.step}`).toBe(true);
  });
  it('cada capa de verificación tiene herramienta o README', () => {
    const layers = VERIF.stages.flatMap((s) => s.layers.map((l) => l.id));
    for (const t of VERIF.tools) for (const u of t.usedBy) expect(layers, `${t.id} usa ${u}`).toContain(u);
  });
});
