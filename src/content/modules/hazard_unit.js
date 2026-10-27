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
      <p>Un riesgo de datos aparece cuando una instrucción necesita un valor que otra, anterior, todavía no terminó de calcular. La mayoría de estos casos se resuelven con <b>forwarding</b>: el valor ya existe en algún registro de pipeline y se lo lleva directo a la entrada de la ALU. Pero hay una excepción física, no un problema de diseño: el dato que trae un <code>lw</code> recién existe al final de la etapa MEM (cuando se lee la memoria), y la instrucción dependiente lo necesita al comienzo de su etapa EX, que es el <i>mismo ciclo</i>. No hay forma de mandar un dato hacia atrás en el tiempo.</p>
      <p>La única salida es esperar: la instrucción dependiente tiene que quedarse un ciclo más en ID y dejar pasar una "burbuja" por EX. Este mecanismo se llama <b>stall</b> o interlock y tiene tres partes: detectar la situación, congelar lo que está antes (el PC y el registro IF/ID, para que IF e ID repitan su trabajo) e insertar una burbuja (una instrucción inocua) en la etapa siguiente.</p>
      <p>La detección compara números de registro. Hay load-use cuando la instrucción en EX es un load, su destino no es x0 (x0 no guarda nada, así que no hay dependencia real) y coincide con alguno de los registros fuente de la instrucción en ID. Esta unidad solo detecta esa situación; las dependencias entre instrucciones aritméticas las resuelve el forwarding sin frenar.</p>`,
    inThisProject: `
      <p>Es ${g('module:hazard_unit', 'hazard_unit')} (instancia <code>u_hazard</code>), un <code>always @(*)</code> que implementa exactamente: <code>stall = ex_mem_read &amp;&amp; (ex_rd != 0) &amp;&amp; (ex_rd == id_rs1 || ex_rd == id_rs2)</code>.</p>
      <ul>
        <li>Las entradas <code>ex_mem_read</code> y <code>ex_rd</code> vienen de ID/EX; <code>id_rs1</code> e <code>id_rs2</code> son los campos <code>inst[19:15]</code> e <code>inst[24:20]</code> de IF/ID.</li>
        <li><b>Compara campos crudos</b>: no mira si la instrucción en ID realmente usa rs1/rs2. Una instrucción de tipo U o J, o una de tipo I (cuyo "rs2" son bits del inmediato), puede coincidir por casualidad con <code>ex_rd</code> y provocar un <b>stall falso</b>: un ciclo perdido sin necesidad (el sistema lo llama <code>falseStall</code> en el simulador). No afecta la corrección, solo el rendimiento.</li>
        <li>El efecto del stall se aplica en riscv_pipeline.v, no en esta unidad: <code>pc_en = en &amp; ~stall &amp; ~stop_fetch</code> congela el PC, <code>if_id_reg</code> recibe <code>.stall(stall)</code> y mantiene su contenido, y <code>flush_id_ex = flush_id_ex_r | stop_fetch | stall</code> mete una burbuja en ID/EX.</li>
        <li>Una burbuja y un salto no pueden coincidir con un stall: el stall requiere un load en EX, y el redirect un branch/jump en EX; son instrucciones distintas.</li>
      </ul>`,
    whyThisChoice: `
      <p>Detectar solo load-use es suficiente porque el forwarding cubre el resto, y es lo mínimo que hace falta para que el pipeline sea correcto. Comparar campos crudos ahorra decodificación pero cuesta ciclos en los casos falsos. El arreglo estándar es el <b>gating con <code>uses_rs1</code> / <code>uses_rs2</code></b> (PicoRV32, Ibex, Rocket): dos bits más en el decodificador y unas pocas compuertas, a cambio de eliminar los stalls falsos.</p>
      <p>Otras alternativas: un <b>interlock completo por scoreboard</b> (CDC 6600, Cortex-A53), necesario si hay unidades de latencia variable como multiplicadores o divisores; el <b>load delay slot</b> del MIPS I, que traslada el problema al compilador (el ISA define que la instrucción siguiente a un load no ve el dato; RISC-V no lo define así); una <b>memoria con latencia 0</b> que haría desaparecer el riesgo, y la <b>ejecución fuera de orden</b>, que deja avanzar instrucciones independientes mientras el load espera.</p>`,
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
