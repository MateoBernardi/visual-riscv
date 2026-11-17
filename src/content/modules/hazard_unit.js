import { githubUrl } from '../repo.js';

const F = 'pipeline/flow/hazard_unit.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'hazard_unit',
  module: 'hazard_unit',
  file: F,
  instance: 'u_hazard',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_hazard',
  blockIds: ['hazard'],
  title: 'Unidad de riesgos (load-use)',
  stage: 'ID',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>El dato de un <code>lw</code> recién existe al final de MEM, y la instrucción que lo usa lo necesita al principio de su EX: el mismo ciclo. No se puede mandar un dato hacia atrás en el tiempo, así que hay que esperar uno: congelar PC e IF/ID y meter una burbuja en ID/EX.</p>`,
    inThisProject: `
      <ul>
        <li><code>stall = ex_mem_read &amp;&amp; ex_rd != 0 &amp;&amp; (ex_rd == id_rs1 || ex_rd == id_rs2)</code>. El efecto (congelar y burbuja) se aplica en riscv_pipeline.v.</li>
        <li>Compara los campos crudos <code>inst[19:15]</code> e <code>inst[24:20]</code> sin saber si la instrucción los usa: puede frenar sin necesidad (el simulador lo marca como <code>falseStall</code>). Cuesta ciclos, nunca corrección.</li>
      </ul>`,
    whyThisChoice: `
      <p>Solo hace falta detectar load-use: el forwarding cubre todo lo demás. Se probó quitar el stall adelantando el load desde MEM: menos ciclos, pero la dmem quedaba en el camino crítico y el reloj bajaba. Con stall y load adelantado desde WB se llega a 70 MHz, y el mutante <code>no_stall</code> de riscv-formal muestra que el stall es necesario.</p>
      <p>Arreglar los stalls falsos mirando si la instrucción usa rs1/rs2 (<code>hazard_unit_precise</code>) se midió: ahorra 0,2 % de ciclos en la suite oficial y nada en los programas. No se adoptó.</p>`,
  },
  refs: [
    { label: 'hazard_unit', sym: 'module:hazard_unit' },
    { label: 'stall', sym: 'stall' },
    { label: 'ex_mem_read', sym: 'port:ex_mem_read' },
    { label: 'ex_rd', sym: 'port:ex_rd' },
  ],
  grid: [9, 5],
  ports: [
    { name: 'ex_mem_read', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'La instrucción en EX es un load.' },
    { name: 'ex_rd', dir: 'in', width: 5, side: 'l', ext: 'idex', desc: 'Destino del load en EX.' },
    { name: 'id_rs1', dir: 'in', width: 5, side: 'l', ext: 'ifid', desc: 'Campo rs1 de la instrucción en ID.' },
    { name: 'id_rs2', dir: 'in', width: 5, side: 'l', ext: 'ifid', desc: 'Campo rs2 de la instrucción en ID.' },
    { name: 'stall', dir: 'out', width: 1, side: 'r', ext: 'pc / ifid / idex', desc: 'Congelar el PC e IF/ID y meter una burbuja en ID/EX.' },
  ],
  parts: [
    P('rd_nz', 'logic', 'ex_rd != 0', 1, [2, 0], [2, 1], 'Descarta el destino x0: un load a x0 no deja nada que esperar.', { symbol: null }),
    P('eq1', 'logic', 'ex_rd == id_rs1', 1, [2, 2], [2, 1], 'Comparador de 5 bits entre el destino del load y el primer fuente.', { symbol: null }),
    P('eq2', 'logic', 'ex_rd == id_rs2', 1, [2, 4], [2, 1], 'Comparador de 5 bits con el segundo fuente.', { symbol: null }),
    P('or', 'logic', 'OR', 1, [5, 3], [1, 1], '<code>ex_rd == id_rs1 || ex_rd == id_rs2</code>: coincide con cualquiera de los dos.', { symbol: null }),
    P('stall', 'logic', 'stall', 1, [7, 1], [2, 2], 'Resultado: AND de load en EX, destino distinto de x0 y coincidencia. Se asigna en un <code>always @(*)</code> con valor por defecto 0.', { live: 'snap.signals.stall' }),
  ],
  nets: [
    N('n_ex_mem_read', 'port:ex_mem_read', 'stall', 'ex_mem_read', 1, 'Solo un load puede producir load-use.', 'snap.latches.idex.mem_read'),
    N('n_ex_rd_nz', 'port:ex_rd', 'rd_nz', 'ex_rd', 5, 'Destino de la instrucción en EX.', 'snap.latches.idex.rd'),
    N('n_ex_rd_eq1', 'port:ex_rd', 'eq1', 'ex_rd', 5, 'Destino a comparar con rs1.', 'snap.latches.idex.rd'),
    N('n_ex_rd_eq2', 'port:ex_rd', 'eq2', 'ex_rd', 5, 'Destino a comparar con rs2.', 'snap.latches.idex.rd'),
    N('n_id_rs1', 'port:id_rs1', 'eq1', 'id_rs1', 5, 'Campo inst[19:15] sin interpretar el formato.', 'snap.signals.idRs1'),
    N('n_id_rs2', 'port:id_rs2', 'eq2', 'id_rs2', 5, 'Campo inst[24:20] sin interpretar el formato. En una instrucción tipo I esto son bits del inmediato: fuente de stalls falsos.', 'snap.signals.idRs2'),
    N('n_eq1', 'eq1', 'or', 'id_rs1', 1, 'Coincidencia con rs1.'),
    N('n_eq2', 'eq2', 'or', 'id_rs2', 1, 'Coincidencia con rs2.'),
    N('n_or', 'or', 'stall', 'stall', 1, 'Alguno de los dos fuentes coincide.'),
    N('n_rd_nz', 'rd_nz', 'stall', 'ex_rd', 1, 'El destino es distinto de x0.'),
    N('n_stall', 'stall', 'port:stall', 'stall', 1, 'Sale hacia tres destinos en riscv_pipeline.v: <code>pc_en</code>, <code>if_id_reg</code> y <code>flush_id_ex</code>.', 'snap.signals.stall'),
  ],
};
