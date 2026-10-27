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
      <p>Un pipeline no espera a saber si un salto se toma: sigue trayendo las instrucciones que están a continuación en memoria, apostando a que el salto no ocurre ("predecir no tomado"). Si el salto sí se toma, esas instrucciones eran del camino equivocado y <b>no deben tener efecto</b>: ni escribir un registro, ni escribir memoria, ni cambiar el PC.</p>
      <p>No se las puede "sacar" del pipeline, solo neutralizar. Se las convierte en <b>burbujas</b>: instrucciones que ocupan la etapa pero no hacen nada, como un NOP. Descartar las instrucciones equivocadas se llama <b>flush</b>. Para saber cuántas hay que descartar basta contar cuántas entraron antes de conocer el resultado.</p>
      <p>Si el salto se resuelve en EX, en el momento de decidir hay una instrucción en ID y otra recién traída en IF. Como los registros de pipeline se actualizan en el próximo flanco, hay que anular los dos registros que van a recibir esas instrucciones: IF/ID (la que se acaba de buscar) e ID/EX (la que está en ID). Así el costo es de 2 ciclos por salto tomado; si se resolviera en ID serían 1, y con un predictor que acierte, 0.</p>`,
    inThisProject: `
      <p>Es ${g('module:flush_unit', 'flush_unit')} (instancia <code>u_flush</code>) y es un <b>passthrough</b>: <code>assign flush_if_id = redirect</code> y <code>assign flush_id_ex = redirect</code>. Está separado para dejar explícita la intención y marcar el lugar donde agregar política (por ejemplo, un predictor) sin tocar riscv_pipeline.v.</p>
      <ul>
        <li><code>redirect</code> viene de EX: <code>branch_taken | ex_jump</code>, o sea branch tomado, JAL o JALR. Los saltos no tomados no producen flush.</li>
        <li>Lo que sale se llama <code>flush_if_id_r</code> y <code>flush_id_ex_r</code> en riscv_pipeline.v, donde se combinan con otras condiciones: <code>flush_if_id = flush_if_id_r | stop_fetch</code> y <code>flush_id_ex = flush_id_ex_r | stop_fetch | stall</code>. El halt y el load-use se resuelven fuera de esta unidad (ver la vista "control de flujo").</li>
        <li>En IF/ID el flush carga un NOP (<code>0x13</code>) y PC = 0; en ID/EX, una burbuja con todo en cero. EX/MEM y MEM/WB no se tocan: contienen instrucciones <i>anteriores</i> al salto, que son correctas.</li>
        <li>El flush solo se aplica con el CPU habilitado (<code>en</code>); con <code>en = 0</code> se ignora.</li>
      </ul>`,
    whyThisChoice: `
      <p>Con "predecir no tomado" y resolución en EX no hace falta ningún hardware de recuperación: bastan estas dos señales, y la penalidad fija es de 2 ciclos. Otras estrategias: <b>predicción + checkpoint</b> (BOOM, P6) para especulación profunda, que exige restaurar un mapa de registros al fallar; la <b>predicación</b> (ARM, Itanium), que no vacía nada pero ocupa los slots; el <b>flush selectivo por bit de validez</b> (Ibex, Rocket), que no pone todo a cero sino que invalida; o <b>vaciar solo las señales de control</b> sin tocar los datos, lo que ahorra lógica de reset pero deja basura visible al depurar. En esta implementación se pone en cero todo el registro ID/EX, lo que simplifica la lectura del estado en la interfaz.</p>
      <p>Que RISC-V no tenga delay slots (a diferencia de MIPS) es lo que obliga a descartar las instrucciones de esta forma.</p>`,
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
