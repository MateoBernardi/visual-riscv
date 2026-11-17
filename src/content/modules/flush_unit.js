import { githubUrl } from '../repo.js';

const F = 'pipeline/flow/flush_unit.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'flush_unit',
  module: 'flush_unit',
  file: F,
  instance: 'u_flush',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_flush',
  blockIds: ['flush'],
  title: 'Unidad de flush',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>El pipeline sigue trayendo instrucciones apostando a que el salto no se toma. Si se toma, las que entraron después no deben tener efecto: se las convierte en burbujas. Con resolución en EX son dos, las que están en IF/ID e ID/EX.</p>`,
    inThisProject: `
      <ul>
        <li>Es un passthrough: <code>flush_if_id = flush_id_ex = redirect</code>.</li>
        <li>En riscv_pipeline.v se le suman el halt (<code>stop_fetch</code>) y, en ID/EX, el stall.</li>
        <li>EX/MEM y MEM/WB no se tocan: tienen instrucciones anteriores al salto.</li>
      </ul>`,
    whyThisChoice: `
      <p>Con "no tomado" y resolución en EX no hace falta hardware de recuperación: dos señales y 2 ciclos fijos por salto. Es un módulo aparte, aunque solo copie una señal, para marcar dónde iría la política si se agrega un predictor.</p>`,
  },
  refs: [
    { label: 'flush_unit', sym: 'module:flush_unit' },
    { label: 'flush_if_id', sym: 'assign:flush_if_id' },
    { label: 'flush_id_ex', sym: 'assign:flush_id_ex' },
    { label: 'redirect', sym: 'port:redirect' },
  ],
  grid: [6, 3],
  ports: [
    { name: 'redirect', dir: 'in', width: 1, side: 'l', ext: 'branch', desc: 'EX: branch tomado, JAL o JALR.' },
    { name: 'flush_if_id', dir: 'out', width: 1, side: 'r', ext: 'ifid', desc: 'Vaciar IF/ID (la instrucción que sigue al salto).' },
    { name: 'flush_id_ex', dir: 'out', width: 1, side: 'r', ext: 'idex', desc: 'Meter una burbuja en ID/EX (la segunda instrucción después del salto).' },
  ],
  parts: [
    P('flush_if_id', 'logic', 'flush_if_id', 1, [2, 0], [2, 1], '<code>assign flush_if_id = redirect</code>: la instrucción que se buscó mientras el salto estaba en EX es del camino equivocado.', { live: 'snap.signals.redirect' }),
    P('flush_id_ex', 'logic', 'flush_id_ex', 1, [2, 2], [2, 1], '<code>assign flush_id_ex = redirect</code>: la instrucción que estaba en ID también.', { live: 'snap.signals.redirect' }),
    { id: 'flow_ctrl', kind: 'logic', label: 'stop_fetch / stall / halt', width: 1, symbol: 'flush_id_ex', at: [4, 1], size: [2, 1], drill: 'flow_ctrl',
      desc: '<p>Esta unidad solo copia <code>redirect</code>. En <code>riscv_pipeline.v</code> esas salidas se combinan con <code>stop_fetch</code> (halt) y <code>stall</code> (load-use) para decidir qué se congela y qué se anula. Entrá para ver esa lógica de control de flujo.</p>' },
  ],
  nets: [
    N('n_redirect_if', 'port:redirect', 'flush_if_id', 'redirect', 1, 'Viene de EX (OR de branch tomado y jump).', 'snap.signals.redirect'),
    N('n_redirect_id', 'port:redirect', 'flush_id_ex', 'redirect', 1, 'La misma señal alimenta ambas salidas.', 'snap.signals.redirect'),
    N('n_flush_if_id', 'flush_if_id', 'port:flush_if_id', 'flush_if_id', 1, 'Sale hacia riscv_pipeline.v como <code>flush_if_id_r</code>, se une con <code>stop_fetch</code> y llega a IF/ID.', 'snap.signals.redirect'),
    N('n_flush_id_ex', 'flush_id_ex', 'port:flush_id_ex', 'flush_id_ex', 1, 'Sale como <code>flush_id_ex_r</code>, se une con <code>stop_fetch</code> y <code>stall</code> y llega a ID/EX.', 'snap.signals.redirect'),
  ],
};
