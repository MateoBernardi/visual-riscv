import { githubUrl } from '../repo.js';

const F = 'pipeline/flow/forward_unit.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'forward_unit',
  module: 'forward_unit',
  file: F,
  instance: 'u_fwd',
  parent: 'riscv_pipeline',
  blockIds: ['forward'],
  title: 'Unidad de forwarding',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Con <code>add x1, x2, x3</code> seguida de <code>sub x4, x1, x5</code>, la segunda instrucción llega a su etapa EX cuando la primera está recién un paso más adelante, en MEM. El resultado de la suma ya está calculado y guardado en el registro EX/MEM, pero no llegará al banco de registros hasta dos ciclos después. Esperar esos ciclos costaría burbujas en casi cada instrucción dependiente. La solución es <b>reenviar</b> (forwarding): tomar el valor de donde ya está y llevarlo a la entrada de la ALU.</p>
      <p>Para reenviar, el hardware tiene que responder una pregunta por cada operando: ¿alguna de las instrucciones que están más adelante en el pipeline va a escribir el registro que yo estoy a punto de leer? Eso es comparar el número del registro fuente (<code>rs1</code>, <code>rs2</code>) de la instrucción en EX con el registro destino (<code>rd</code>) de las instrucciones en MEM y en WB.</p>
      <p>La condición necesita tres partes, y conviene entender por qué: (1) la instrucción de adelante efectivamente <b>escribe</b> un registro (un store o un branch no producen un valor para rd); (2) su rd <b>no es x0</b>, porque lo que "produce" no queda en ningún lado; (3) su rd <b>coincide</b> con el fuente.</p>
      <p>Si las dos etapas coinciden (dos instrucciones seguidas escribieron el mismo registro), manda la más reciente, la de MEM, porque su valor es el que quedaría al final. La salida son dos selectores de 2 bits, uno por operando, que gobiernan los multiplexores de la ALU.</p>`,
    inThisProject: `
      <p>Es ${g('module:forward_unit', 'forward_unit')} (instancia <code>u_fwd</code>), un <code>always @(*)</code> con valor por defecto <code>2'b00</code> para ambos. La codificación es: <code>00</code> usar el regfile, <code>10</code> reenviar desde EX/MEM (<code>mem_result</code>) y <code>01</code> reenviar desde MEM/WB (<code>wb_result</code>).</p>
      <ul>
        <li><b>Primero MEM</b>: <code>if (mem_reg_write &amp;&amp; mem_rd != 0)</code> y <code>mem_rd == ex_rs1</code> → <code>forward_a = 10</code>; lo mismo con rs2 → <code>forward_b = 10</code>.</li>
        <li><b>Luego WB, con menor prioridad</b>: <code>if (wb_reg_write &amp;&amp; wb_rd != 0)</code> y <code>wb_rd == ex_rs1</code> y <i>no</i> <code>(mem_reg_write &amp;&amp; mem_rd == ex_rs1)</code> → <code>forward_a = 01</code>. Esa exclusión garantiza que MEM gane aunque ambos coincidan.</li>
        <li>Como hay dos selectores independientes, es posible que A venga de MEM y B de WB, o cualquier combinación.</li>
        <li>Lo que se reenvía desde MEM es <code>mem_result</code> (el resultado ya elegido por <code>wb_sel</code>), por lo que también se reenvían los resultados de loads, JAL/JALR (PC+4) y LUI.</li>
      </ul>
      <p>Igual que hazard_unit, esta unidad compara los <b>campos crudos</b> <code>ex_rs1</code>/<code>ex_rs2</code>, sin saber si la instrucción en EX realmente usa rs1/rs2. Si el formato no los usa (por ejemplo, en una instrucción tipo I el campo rs2 son bits del inmediato), puede activarse un forwarding sin sentido; es <b>inofensivo</b>, porque el mux <code>alu_b</code> elige el inmediato con <code>ex_alu_src</code> y el dato reenviado se descarta. A diferencia del stall falso, no cuesta ciclos. Tampoco cubre la dependencia a distancia 3, que resuelve el bypass interno del regfile.</p>`,
    whyThisChoice: `
      <p>Con dos fuentes (MEM y WB) y dos muxes de 3 entradas, el pipeline queda casi sin burbujas excepto el load-use, a un costo de unos pocos comparadores de 5 bits. Frente a un diseño <b>sin forwarding</b> (solo stalls, el modo alternativo de la interfaz), reduce el CPI pero alarga el camino crítico: la ALU espera por los comparadores y el mux. La <b>red de bypass completa</b> de un procesador más ancho agrega más fuentes y crece de forma cuadrática; un <b>scoreboard</b> o <b>Tomasulo con renombrado</b> reemplaza la comparación de índices por tablas de registros pendientes y estaciones de reserva, necesarios cuando hay ejecución fuera de orden; la <b>planificación por el compilador</b> (MIPS I, VLIW) elimina el hardware pero ata el binario a la microarquitectura.</p>
      <p>El arreglo habitual de los falsos positivos es el <b>gating con <code>uses_rs1</code> / <code>uses_rs2</code></b>: como acá es inofensivo, esta implementación no lo necesita en forward_unit, aunque sí le sería útil a hazard_unit.</p>`,
  },
  refs: [
    { label: 'forward_unit', sym: 'module:forward_unit' },
    { label: 'forward_a', sym: 'port:forward_a' },
    { label: 'forward_b', sym: 'port:forward_b' },
    { label: 'mem_rd', sym: 'port:mem_rd' },
    { label: 'wb_rd', sym: 'port:wb_rd' },
  ],
  grid: [10, 7],
  ports: [
    { name: 'ex_rs1', dir: 'in', width: 5, side: 'l', ext: 'idex', desc: 'Fuente 1 de la instrucción en EX.' },
    { name: 'ex_rs2', dir: 'in', width: 5, side: 'l', ext: 'idex', desc: 'Fuente 2 de la instrucción en EX.' },
    { name: 'mem_rd', dir: 'in', width: 5, side: 'l', ext: 'exmem', desc: 'Destino de la instrucción en MEM.' },
    { name: 'mem_reg_write', dir: 'in', width: 1, side: 'l', ext: 'exmem', desc: 'La instrucción en MEM escribe un registro.' },
    { name: 'wb_rd', dir: 'in', width: 5, side: 'l', ext: 'memwb', desc: 'Destino de la instrucción en WB.' },
    { name: 'wb_reg_write', dir: 'in', width: 1, side: 'l', ext: 'memwb', desc: 'La instrucción en WB escribe un registro.' },
    { name: 'forward_a', dir: 'out', width: 2, side: 'r', ext: 'fwdMuxA', desc: 'Selector del mux A: 00 regfile, 10 EX/MEM, 01 MEM/WB.' },
    { name: 'forward_b', dir: 'out', width: 2, side: 'r', ext: 'fwdMuxB', desc: 'Selector del mux B.' },
  ],
  parts: [
    P('mem_ok', 'logic', 'mem_reg_write && mem_rd != 0', 1, [2, 0], [2, 1], 'La instrucción en MEM produce un valor útil: escribe un registro y no es x0.', { symbol: null }),
    P('mem_eq1', 'logic', 'mem_rd == ex_rs1', 1, [2, 1], [2, 1], 'Comparador de 5 bits para el operando A contra MEM.', { symbol: null }),
    P('mem_eq2', 'logic', 'mem_rd == ex_rs2', 1, [2, 2], [2, 1], 'Comparador de 5 bits para el operando B contra MEM.', { symbol: null }),
    P('wb_ok', 'logic', 'wb_reg_write && wb_rd != 0', 1, [2, 4], [2, 1], 'La instrucción en WB produce un valor útil.', { symbol: null }),
    P('wb_eq1', 'logic', 'wb_rd == ex_rs1 && !MEM', 1, [2, 5], [2, 1], 'Coincidencia con WB, anulada si MEM ya cubre el mismo rs1 (<code>!(mem_reg_write &amp;&amp; mem_rd == ex_rs1)</code>).', { symbol: null }),
    P('wb_eq2', 'logic', 'wb_rd == ex_rs2 && !MEM', 1, [2, 6], [2, 1], 'Idem para rs2.', { symbol: null }),
    P('forward_a', 'mux', 'forward_a', 2, [6, 1], [2, 2], 'Prioridad para A: por defecto 00; si coincide MEM → 10; si no, si coincide WB → 01.', { live: 'snap.signals.fwdA' }),
    P('forward_b', 'mux', 'forward_b', 2, [6, 4], [2, 2], 'Prioridad para B, con la misma lógica sobre rs2.', { live: 'snap.signals.fwdB' }),
  ],
  nets: [
    N('n_mem_rw', 'port:mem_reg_write', 'mem_ok', 'mem_reg_write', 1, 'Sin escritura no hay valor para reenviar (stores, branches).', 'snap.latches.exmem.reg_write'),
    N('n_mem_rd_ok', 'port:mem_rd', 'mem_ok', 'mem_rd', 5, 'Se verifica que el destino no sea x0.', 'snap.latches.exmem.rd'),
    N('n_mem_rd_1', 'port:mem_rd', 'mem_eq1', 'mem_rd', 5, 'Destino de MEM contra rs1.', 'snap.latches.exmem.rd'),
    N('n_mem_rd_2', 'port:mem_rd', 'mem_eq2', 'mem_rd', 5, 'Destino de MEM contra rs2.', 'snap.latches.exmem.rd'),
    N('n_rs1_mem', 'port:ex_rs1', 'mem_eq1', 'ex_rs1', 5, 'Campo rs1 que viaja en ID/EX.', 'snap.latches.idex.rs1'),
    N('n_rs2_mem', 'port:ex_rs2', 'mem_eq2', 'ex_rs2', 5, 'Campo rs2 que viaja en ID/EX.', 'snap.latches.idex.rs2'),
    N('n_wb_rw', 'port:wb_reg_write', 'wb_ok', 'wb_reg_write', 1, 'La instrucción en WB debe escribir.', 'snap.latches.memwb.reg_write'),
    N('n_wb_rd_ok', 'port:wb_rd', 'wb_ok', 'wb_rd', 5, 'Se verifica que el destino no sea x0.', 'snap.latches.memwb.rd'),
    N('n_wb_rd_1', 'port:wb_rd', 'wb_eq1', 'wb_rd', 5, 'Destino de WB contra rs1.', 'snap.latches.memwb.rd'),
    N('n_wb_rd_2', 'port:wb_rd', 'wb_eq2', 'wb_rd', 5, 'Destino de WB contra rs2.', 'snap.latches.memwb.rd'),
    N('n_rs1_wb', 'port:ex_rs1', 'wb_eq1', 'ex_rs1', 5, 'rs1 contra WB.', 'snap.latches.idex.rs1'),
    N('n_rs2_wb', 'port:ex_rs2', 'wb_eq2', 'ex_rs2', 5, 'rs2 contra WB.', 'snap.latches.idex.rs2'),
    N('n_mem_a', 'mem_ok', 'forward_a', 'mem_reg_write', 1, 'Habilita el camino "10" para A si además hay coincidencia de rs1.'),
    N('n_mem_a_eq', 'mem_eq1', 'forward_a', 'mem_rd', 1, 'Coincidencia de rs1 con MEM: forward_a = 10.'),
    N('n_wb_a', 'wb_eq1', 'forward_a', 'wb_rd', 1, 'Coincidencia con WB sin que MEM cubra: forward_a = 01.'),
    N('n_mem_b', 'mem_ok', 'forward_b', 'mem_reg_write', 1, 'Habilita el camino "10" para B si además hay coincidencia de rs2.'),
    N('n_mem_b_eq', 'mem_eq2', 'forward_b', 'mem_rd', 1, 'Coincidencia de rs2 con MEM: forward_b = 10.'),
    N('n_wb_b', 'wb_eq2', 'forward_b', 'wb_rd', 1, 'Coincidencia con WB sin que MEM cubra: forward_b = 01.'),
    N('n_wb_ok_a', 'wb_ok', 'forward_a', 'wb_reg_write', 1, 'Habilita el camino "01" para A.'),
    N('n_wb_ok_b', 'wb_ok', 'forward_b', 'wb_reg_write', 1, 'Habilita el camino "01" para B.'),
    N('n_forward_a', 'forward_a', 'port:forward_a', 'forward_a', 2, 'Va al mux <code>fwd_a_val</code> de EX.', 'snap.signals.fwdA'),
    N('n_forward_b', 'forward_b', 'port:forward_b', 'forward_b', 2, 'Va al mux <code>fwd_b_val</code> de EX.', 'snap.signals.fwdB'),
  ],
};
