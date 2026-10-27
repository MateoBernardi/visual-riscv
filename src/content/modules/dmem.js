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
  '<code>sw ? wdata[31:24] : wdata[15:8]</code>: en SW toma el byte 3; en SB/SH toma el byte 1.',
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
      <p>Los registros son pocos y rápidos; los programas necesitan mucho más espacio para arreglos, pilas y variables. Para eso existe la memoria de datos: una gran tabla de bytes a la que se accede con una dirección. RISC-V es una arquitectura <b>load/store</b>: solo las instrucciones <code>lw/lh/lb</code> y <code>sw/sh/sb</code> la tocan, el resto trabaja con registros.</p>
      <p>El problema de diseño es que la memoria se organiza físicamente en palabras de 32 bits (más ancho = más datos por acceso), pero el programa quiere leer y escribir bytes y medias palabras. Para <i>escribir</i> un solo byte sin pisar los otros tres, la memoria se divide en cuatro <b>carriles de byte</b> independientes (lane 0 a 3), cada uno con su propia señal de habilitación (byte enable). Hay que además <b>mover</b> el dato al carril correcto: si guardás un byte en la dirección terminada en <code>01</code>, tiene que caer en el carril 1.</p>
      <p>Para <i>leer</i> el proceso es el inverso: se lee la palabra completa de los cuatro carriles, se elige el byte o la media palabra que corresponde según los bits bajos de la dirección y se la <b>extiende</b> a 32 bits (con signo en LB/LH, con ceros en LBU/LHU).</p>
      <p>Queda una cuestión de contrato: ¿qué pasa con un acceso desalineado (un <code>lw</code> a una dirección que no es múltiplo de 4)? La especificación permite que el hardware lo soporte con varios accesos, o que lo trate como excepción. Un procesador sin excepciones tiene que elegir otra cosa. Además se necesita un acceso de solo lectura aparte para que la debug unit pueda volcar el contenido sin interferir.</p>`,
    inThisProject: `
      <p>Es ${g('module:dmem', 'dmem')} (instancia <code>u_dmem</code>), con <code>DEPTH = 256</code> palabras (1 KB). Cuatro arreglos ${g('lane0')}, ${g('lane1')}, ${g('lane2')} y ${g('lane3')} de bytes: esta forma permite que Vivado la infiera como RAM distribuida (un arreglo plano de bytes con escrituras desalineadas se convierte en 8K flip-flops).</p>
      <ul>
        <li><b>Dirección</b>: ${g('widx')} <code>= addr[AW+1:2]</code> (AW = 8, así que <code>addr[9:2]</code>) y ${g('boff')} <code>= addr[1:0]</code>. Los bits altos de la dirección se ignoran: una dirección fuera de rango <i>da la vuelta</i> sin error.</li>
        <li><b>Byte enables</b> (${g('be')}): <code>case (funct3[1:0])</code>: SB → <code>4'b0001 &lt;&lt; boff</code>; SH → <code>boff[1] ? 4'b1100 : 4'b0011</code>; SW (y cualquier otro) → <code>4'b1111</code>.</li>
        <li><b>Dato por carril</b>: ${g('d0')}…${g('d3')} reordenan <code>wdata</code> según ${g('sb')} y ${g('sw')}, de forma que SB y SH ponen el dato en todos los carriles que podrían necesitarlo y el byte enable elige el correcto.</li>
        <li><b>Compuerta de escritura</b>: solo escribe si <code>we &amp;&amp; funct3[2] == 0 &amp;&amp; funct3[1:0] != 2'b11</code>, o sea para funct3 = 000, 001 o 010. Desde el pipeline <code>we = mem_mem_write &amp; en</code>.</li>
        <li><b>Lectura asincrónica</b>: ${g('word')} <code>= {lane3, lane2, lane1, lane0}[widx]</code>; ${g('b')} elige el byte con <code>word[boff*8 +: 8]</code> y ${g('h')} la media palabra con <code>boff[1]</code>. El <code>case (funct3)</code> final extiende: LB, LH con signo; LW; LBU, LHU con ceros; cualquier otro funct3 da 0.</li>
        <li><b>Puerto de debug</b>: ${g('dbg_data')} lee una palabra completa por índice, sin pasar por funct3.</li>
      </ul>
      <p>Propiedades de esta implementación que conviene saber: no hay trap en accesos desalineados, sino que se <b>alinean silenciosamente</b>: LW/SW ignoran <code>boff</code> por completo, LH/LHU/SH usan solo <code>boff[1]</code>. La dmem tampoco recibe la señal <code>mem_read</code>: siempre calcula <code>rdata</code>, y el pipeline la usa únicamente si <code>wb_sel = 01</code>. Además, tal como está escrito <code>d3</code>, un SB con <code>boff = 3</code> escribe en el carril 3 el valor <code>wdata[15:8]</code> en vez de <code>wdata[7:0]</code> (el resto de offsets de SB sí quedan bien).</p>`,
    whyThisChoice: `
      <p>Los carriles de byte con lectura asincrónica dan un acceso de un ciclo y mapean a LUTRAM. La alternativa más común en FPGA es la <b>BRAM síncrona</b>: más capacidad, pero el dato llega un ciclo después, lo que agrega una etapa o un load-use de 2 ciclos (VexRiscv, Rocket). Otras: <b>memoria unificada Von Neumann</b> (un solo puerto; IF y MEM compiten por él), <b>cachés L1 + memoria externa</b> para GBs de memoria (Cortex-A, BOOM), <b>MMIO + TCM</b> con un decodificador de direcciones para periféricos de latencia fija (Cortex-M, Ibex), y soporte de <b>acceso desalineado</b> con trap o con dos accesos.</p>
      <p>Alinear silenciosamente es lo más barato (sin excepciones, que este core no tiene), pero un programa con un bug de alineación produce resultados incorrectos sin avisar, algo que un procesador con trap haría visible. Notar que en esta implementación la memoria vive en la etapa MEM, de modo que un load tarda: ALU (dirección) → dmem (lectura combinacional) → mux <code>wb_sel</code>, todo dentro de un ciclo, lo que explica que el load-use necesite un stall de un ciclo.</p>`,
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
