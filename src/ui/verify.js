import { h, clear, hex32, sdec } from './dom.js';
import { glossify } from './glossary.js';

const GH = 'https://github.com/MateoBernardi/arquitectura-de-computadoras/blob/tp3-RISCV/project_4/';
export const MODEL_URL = GH + 'host/tests/rv32i_model.py';
export const TB_URL = GH + 'project_4.srcs/sim_1/new/tb_pipeline.v';
const ext = (href, text) => h('a', { href, target: '_blank', rel: 'noopener' }, text);

/**
 * Pestaña "Verificación": valores esperados vs obtenidos del ejemplo, en vivo y al terminar.
 * update({ example, snap, halted }) -> { ok, total, pass, state } (resumen para la insignia del dock)
 */
export function createVerify(root) {
  const summary = h('div', { class: 'vf-sum' });
  const tableBox = h('div', { class: 'vf-table-wrap' });
  const prove = h('div', { class: 'vf-prove prose' });
  const golden = h('div', { class: 'vf-golden prose' },
    h('h4', {}, 'Cómo se verifica el diseño real'),
    h('p', {}, 'Es el enfoque de ', h('b', {}, 'modelo de referencia (golden model)'), ': un modelo de software del RV32I, escrito aparte y mucho más simple que el pipeline, ejecuta el mismo programa instrucción por instrucción. Si el hardware segmentado tiene algún error de forwarding, stall o flush, sus registros y su memoria terminan distintos de los del modelo.'),
    h('p', {}, 'En el repo, ', ext(MODEL_URL, 'host/tests/rv32i_model.py'), ' es ese modelo y ', ext(TB_URL, 'sim_1/new/tb_pipeline.v'), ' es el testbench que corre el pipeline en simulación y compara contra los valores esperados. Los valores de esta tabla son los que esperaría ese modelo para este programa.'));
  root.append(h('div', { class: 'vf' },
    h('div', { class: 'vf-main' }, summary, tableBox),
    h('div', { class: 'vf-side' }, h('h4', {}, 'Qué demuestra sobre el hardware'), prove, golden)));
  let provedFor = null;

  function rows(ex, snap) {
    const out = [];
    const e = (ex && ex.expect) || {};
    for (const [k, v] of Object.entries(e.regs || {})) {
      const i = Number(k.slice(1));
      out.push({ name: k, exp: v >>> 0, got: snap.regs[i] >>> 0 });
    }
    for (const [k, v] of Object.entries(e.mem || {})) {
      out.push({ name: `dmem[${k}]`, sub: '0x' + (Number(k) * 4).toString(16).padStart(4, '0'), exp: v >>> 0, got: snap.dmem[Number(k)] >>> 0 });
    }
    return out;
  }

  function update({ example = null, snap = null, halted = false } = {}) {
    const exp = example && example.expect;
    const key = example ? example.id : null;
    if (provedFor !== key) {
      provedFor = key;
      clear(prove);
      if (example && example.explainVerification) { prove.innerHTML = example.explainVerification; glossify(prove); }
      else prove.append(h('p', { class: 'muted' }, example ? 'Este programa no trae una explicación de lo que verifica.' : 'Cargá un ejemplo o escribí un programa con resultados esperados para ver qué prueba sobre el hardware.'));
    }
    clear(summary); clear(tableBox);
    if (!example || !exp || !((exp.regs && Object.keys(exp.regs).length) || (exp.mem && Object.keys(exp.mem).length))) {
      summary.append(h('div', { class: 'vf-state idle' }, h('b', {}, 'Sin valores esperados'), h('span', {}, example ? ' Este programa no define resultados para comparar.' : ' El programa del editor es propio, así que no hay con qué compararlo.')));
      return { ok: null, total: 0, pass: 0, state: 'none' };
    }
    const rs = rows(example, snap);
    const pass = rs.filter((r) => r.exp === r.got).length;
    const total = rs.length;
    const fail = total - pass;
    let state, label, tone;
    if (!halted) { state = 'running'; label = `En curso, ciclo ${snap.cycle}: ${pass} de ${total} valores ya coinciden con lo esperado`; tone = 'run'; }
    else if (!fail) { state = 'pass'; label = `Terminó en el ciclo ${snap.cycle}: los ${total} valores coinciden con lo esperado`; tone = 'ok'; }
    else { state = 'fail'; label = `Terminó en el ciclo ${snap.cycle}: ${fail} de ${total} valores difieren de lo esperado`; tone = 'bad'; }
    summary.append(h('div', { class: 'vf-state ' + tone }, h('span', { class: 'vf-ico' }, tone === 'ok' ? '✓' : tone === 'bad' ? '✗' : '…'), h('b', {}, label),
      !halted ? h('span', { class: 'muted' }, ' · los que todavía no coinciden se esperan al final de la ejecución') : null));
    const trs = rs.map((r) => {
      const ok = r.exp === r.got;
      const cls = ok ? 'ok' : halted ? 'bad' : 'wait';
      return h('tr', { class: 'vf-r ' + cls },
        h('td', { class: 'mono vf-n' }, r.name, r.sub ? h('span', { class: 'vf-sub' }, ' ' + r.sub) : null),
        h('td', { class: 'mono' }, hex32(r.exp), h('span', { class: 'vf-dec' }, ' ' + sdec(r.exp))),
        h('td', { class: 'mono' }, hex32(r.got), h('span', { class: 'vf-dec' }, ' ' + sdec(r.got))),
        h('td', { class: 'vf-mark', title: ok ? 'Coincide' : halted ? 'Difiere de lo esperado' : 'Todavía no alcanzó el valor esperado' }, ok ? '✓' : halted ? '✗' : '…'));
    });
    tableBox.append(h('table', { class: 'tbl vf-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Elemento'), h('th', {}, 'Esperado'), h('th', {}, 'Obtenido'), h('th', {}, ''))), h('tbody', {}, trs)));
    return { ok: state === 'pass', total, pass, state };
  }
  return { update };
}
