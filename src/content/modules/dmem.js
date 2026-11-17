import { githubUrl } from '../repo.js';

const F = 'pipeline/4_memory/dmem.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.depth ? { depth: o.depth } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

const LANES = [0, 1, 2, 3];
const DSRC = [
  'wdata[7:0]: siempre el byte bajo de rs2.',
  '<code>sb ? wdata[7:0] : wdata[15:8]</code>: en SB repite el byte bajo; en SH/SW toma el byte 1.',
  '<code>sw ? wdata[23:16] : wdata[7:0]</code>: en SW toma el byte 2; en SB/SH repite el byte bajo (así SH en la mitad alta de la palabra queda bien).',
  '<code>sw ? wdata[31:24] : (sb ? wdata[7:0] : wdata[15:8])</code>: en SW toma el byte 3; en SB repite el byte bajo; en SH toma el byte 1 (el alto de la media palabra).',
];

export default {
  id: 'dmem',
  module: 'dmem',
  file: F,
  instance: 'u_dmem',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_dmem',
  blockIds: ['dmem'],
  title: 'Memoria de datos',
  stage: 'MEM',
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>Los programas necesitan mucho más espacio que 32 registros. La memoria está organizada en palabras, pero el programa lee y escribe bytes y medias palabras: para escribir un byte sin pisar los otros se divide en cuatro <b>carriles</b> con su propio enable, y al leer se elige el byte o la media palabra y se extiende a 32 bits.</p>`,
    inThisProject: `
      <ul>
        <li>256 palabras (1 KB) en cuatro arreglos ${g('lane0')}…${g('lane3')}: así Vivado la infiere como RAM distribuida y no como 8K flip-flops.</li>
        <li>Un acceso desalineado o fuera de rango no llega acá: trap_unit lo detecta en EX y lo anula.</li>
        <li>No recibe <code>mem_read</code>: siempre calcula <code>rdata</code> y el pipeline lo usa solo si <code>wb_sel = 01</code>.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Lectura asincrónica</b> (LUTRAM): un acceso por ciclo, sin la etapa extra que exigiría una BRAM síncrona.</p>
      <p><b>Desalineado = trap.</b> Antes se alineaba en silencio: más barato, pero un bug de alineación daba resultados mal sin avisar, y riscv-formal lo marcó como violación de la ISA. Con el trap, el error se ve y queda la dirección.</p>
      <p>El dato del load existe recién al final de MEM; adelantarlo desde ahí ponía la dmem en el camino crítico. Por eso se adelanta desde WB y el load-use cuesta un ciclo.</p>`,
  },
  refs: [
    { label: 'dmem', sym: 'module:dmem' },
    { label: 'be', sym: 'reg:be' },
    { label: 'd3', sym: 'd3' },
    { label: 'word', sym: 'word' },
    { label: 'rdata', sym: 'port:rdata' },
    { label: 'lane0', sym: 'reg:lane0' },
  ],
  grid: [12, 8],
  ports: [
    { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj: la escritura es síncrona.' },
    { name: 'we', dir: 'in', width: 1, side: 'l', ext: 'exmem', desc: 'Habilitación de escritura (<code>mem_mem_write &amp; en</code>).' },
    { name: 'addr', dir: 'in', width: 32, side: 'l', ext: 'exmem', desc: 'Dirección de byte (<code>mem_alu_out</code>).' },
    { name: 'wdata', dir: 'in', width: 32, side: 'l', ext: 'exmem', desc: 'Dato del store (<code>mem_rdata2</code>).' },
    { name: 'funct3', dir: 'in', width: 3, side: 't', ext: 'exmem', desc: 'Ancho y signo del acceso.' },
    { name: 'dbg_addr', dir: 'in', width: 8, side: 'b', ext: 'debug', desc: 'Índice de palabra para el volcado.' },
    { name: 'rdata', dir: 'out', width: 32, side: 'r', ext: 'wbMux', desc: 'Dato leído y extendido.' },
    { name: 'dbg_data', dir: 'out', width: 32, side: 'r', ext: 'debug', desc: 'Palabra completa para la debug unit.' },
  ],
  parts: [
    P('widx', 'logic', 'widx = addr[9:2]', 8, [2, 0], [2, 1], 'Índice de palabra: descarta los 2 bits bajos y los bits altos (por eso hay wrap-around).'),
    P('boff', 'logic', 'boff = addr[1:0]', 2, [2, 1], [2, 1], 'Posición del byte dentro de la palabra.'),
    P('be', 'decoder', 'be (byte enables)', 4, [2, 2], [2, 1], '<code>case (funct3[1:0])</code>: genera 4 bits, uno por carril. SB enciende uno (<code>0001 &lt;&lt; boff</code>), SH dos (arriba o abajo), SW los cuatro.'),
    P('write_gate', 'logic', 'we & funct3 válido', 1, [2, 3], [2, 1], '<code>we &amp;&amp; funct3[2]==0 &amp;&amp; funct3[1:0]!=2\'b11</code>: solo SB, SH y SW escriben.', { symbol: null }),
    P('sw', 'logic', 'sw', 1, [2, 4], [2, 1], '<code>funct3[1:0] == 2\'b10</code>: es una escritura de palabra.'),
    P('sb', 'logic', 'sb', 1, [2, 5], [2, 1], '<code>funct3[1:0] == 2\'b00</code>: es una escritura de byte.'),
    ...LANES.map((k) => P(`d${k}`, 'mux', `d${k}`, 8, [4, 3 + k], [2, 1], `Dato que recibe el carril ${k}: ${DSRC[k]}`)),
    ...LANES.map((k) => P(`lane${k}`, 'regArray', `lane${k}[256]`, 8, [7, 3 + k], [2, 1], `Carril ${k}: byte ${k} de cada palabra (bits [${8 * k + 7}:${8 * k}]). Se escribe si <code>be[${k}]</code> y la compuerta lo habilitan.`, { depth: 256 })),
    P('word', 'logic', 'word', 32, [9, 3], [1, 2], 'Palabra completa: concatenación de los cuatro carriles en la posición <code>widx</code>.'),
    P('b', 'mux', 'b', 8, [10, 1], [1, 1], 'Byte elegido: <code>word[boff*8 +: 8]</code>.'),
    P('h', 'mux', 'h', 16, [10, 5], [1, 1], 'Media palabra elegida: <code>boff[1] ? word[31:16] : word[15:0]</code>. Con <code>boff[0]</code> impar se ignora ese bit.'),
    P('rdata', 'mux', 'extensión', 32, [11, 3], [1, 2], '<code>case (funct3)</code>: 000 LB (signo), 001 LH (signo), 010 LW, 100 LBU (ceros), 101 LHU (ceros); otros funct3 dan 0.', { live: 'snap.signals.memRData' }),
    P('dbg_data', 'logic', 'dbg_data', 32, [9, 7], [3, 1], 'Palabra de debug: <code>{lane3[dbg_addr], …, lane0[dbg_addr]}</code>. Sirve para el volcado de 32 palabras.'),
  ],
  nets: [
    N('n_addr_widx', 'port:addr', 'widx', 'addr', 32, 'Dirección de byte que viene de EX/MEM (resultado de la ALU).', 'snap.signals.memAddr'),
    N('n_addr_boff', 'port:addr', 'boff', 'addr', 32, 'Los 2 bits bajos eligen el byte.', 'snap.signals.memAddr'),
    N('n_funct3_be', 'port:funct3', 'be', 'funct3', 3, 'Define si el acceso es byte, media palabra o palabra.', 'snap.latches.exmem.funct3'),
    N('n_boff_be', 'boff', 'be', 'boff', 2, 'Posición dentro de la palabra: define qué carriles se habilitan en SB y SH.'),
    N('n_funct3_sw', 'port:funct3', 'sw', 'funct3', 3, 'funct3[1:0] decide si es SW.', 'snap.latches.exmem.funct3'),
    N('n_funct3_sb', 'port:funct3', 'sb', 'funct3', 3, 'funct3[1:0] decide si es SB.', 'snap.latches.exmem.funct3'),
    N('n_we', 'port:we', 'write_gate', 'we', 1, 'Viene de un store en MEM con el CPU habilitado.', 'snap.signals.memWrite'),
    N('n_funct3_gate', 'port:funct3', 'write_gate', 'funct3', 3, 'Filtra funct3 no válidos para un store.', 'snap.latches.exmem.funct3'),
    ...LANES.map((k) => N(`n_wdata_d${k}`, 'port:wdata', `d${k}`, 'wdata', 32, `Dato del store, que se reordena para el carril ${k}.`, 'snap.signals.memWData')),
    N('n_sb_d1', 'sb', 'd1', 'sb', 1, 'Selector del mux de d1.'),
    N('n_sw_d2', 'sw', 'd2', 'sw', 1, 'Selector del mux de d2.'),
    N('n_sw_d3', 'sw', 'd3', 'sw', 1, 'Selector del mux de d3.'),
    ...LANES.map((k) => N(`n_d${k}_lane`, `d${k}`, `lane${k}`, `d${k}`, 8, `Byte que se escribe en el carril ${k} si su byte enable está activo.`)),
    ...LANES.map((k) => N(`n_be_lane${k}`, 'be', `lane${k}`, 'be', 4, `El bit ${k} habilita la escritura del carril ${k}.`, 'snap.signals.memBe')),
    ...LANES.map((k) => N(`n_widx_lane${k}`, 'widx', `lane${k}`, 'widx', 8, `Fila (palabra) del carril ${k} que se lee o escribe.`)),
    N('n_gate_lane0', 'write_gate', 'lane0', 'we', 1, 'La compuerta habilita las escrituras de los cuatro carriles (se muestra sobre el carril 0).'),
    ...LANES.map((k) => N(`n_lane${k}_word`, `lane${k}`, 'word', `lane${k}`, 8, `Lectura asincrónica del byte ${k} de la palabra.`)),
    N('n_word_b', 'word', 'b', 'word', 32, 'La palabra completa se corta en bytes.'),
    N('n_word_h', 'word', 'h', 'word', 32, 'La palabra completa se corta en mitades.'),
    N('n_boff_b', 'boff', 'b', 'boff', 2, 'Elige el byte.'),
    N('n_boff_h', 'boff', 'h', 'boff', 2, 'Solo se usa el bit 1 para elegir la mitad.'),
    N('n_word_rdata', 'word', 'rdata', 'word', 32, 'LW devuelve la palabra completa.'),
    N('n_b_rdata', 'b', 'rdata', 'b', 8, 'Se extiende con signo (LB) o con ceros (LBU).'),
    N('n_h_rdata', 'h', 'rdata', 'h', 16, 'Se extiende con signo (LH) o con ceros (LHU).'),
    N('n_funct3_rdata', 'port:funct3', 'rdata', 'funct3', 3, 'Elige la forma de extensión.', 'snap.latches.exmem.funct3'),
    N('n_rdata', 'rdata', 'port:rdata', 'rdata', 32, 'Dato del load; entra al mux <code>wb_sel</code> de MEM.', 'snap.signals.memRData'),
    N('n_dbg_addr', 'port:dbg_addr', 'dbg_data', 'dbg_addr', 8, 'Índice de palabra pedido por la debug unit.'),
    N('n_dbg_data', 'dbg_data', 'port:dbg_data', 'dbg_data', 32, 'Va al mux de debug del pipeline (palabras 54..85).'),
  ],
};
