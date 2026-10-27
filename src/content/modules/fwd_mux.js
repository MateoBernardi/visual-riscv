import { githubUrl } from '../repo.js';

const F = 'pipeline/riscv_pipeline.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: o.symbol ?? id, at, size, desc,
  ...(o.drill ? { drill: o.drill } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'fwd_mux',
  module: 'riscv_pipeline',
  file: F,
  pseudo: true,
  instance: null,
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu',
  blockIds: ['fwdMuxA', 'fwdMuxB'],
  title: 'Muxes de forwarding (A y B)',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Imaginá <code>add x1, x2, x3</code> seguida de <code>sub x4, x1, x5</code>. La segunda necesita el valor de <code>x1</code> justo cuando la primera recién terminó de calcularlo. Pero en un pipeline, "escribir el registro" ocurre varias etapas después de "calcular": el resultado de la suma existe en el registro EX/MEM un ciclo antes de que el regfile lo guarde.</p>
      <p>Esperar a que el valor llegue al banco de registros costaría burbujas (stalls) en casi cada instrucción. Pero el valor ya existe, solo que en otro lugar del chip. La solución mínima es <b>tomarlo de ahí</b>: agregar a la entrada de la ALU un multiplexor que, además del valor leído del banco (que puede ser viejo), acepte los resultados que todavía están en los registros de pipeline de las etapas siguientes.</p>
      <p>Hace falta un selector que diga "de qué fuente tomar" para cada operando, generado por una unidad que compara los registros fuente de la instrucción en EX con los destinos de las instrucciones que están más adelante. Ese selector es el que codifica <code>00 / 10 / 01</code>.</p>`,
    inThisProject: `
      <p>Hay un mux por operando, ambos escritos en un único <code>always @(*)</code> con un <code>case</code> sobre el selector que entrega ${g('u_fwd', 'forward_unit', F)}:</p>
      <ul>
        <li><code>2'b10</code>: ${g('fwd_a_val')} / ${g('fwd_b_val')} toman ${g('mem_result')} (la instrucción que está ahora en MEM, hace 1 instrucción). Ojo: es <code>mem_result</code>, el valor ya elegido por el mux <code>wb_sel</code>, no <code>mem_alu_out</code>; por eso también se reenvía el resultado de un load, un PC+4 o un LUI.</li>
        <li><code>2'b01</code>: toman ${g('wb_result')} (la instrucción en WB, hace 2).</li>
        <li><code>default</code> (<code>00</code>): toman <code>ex_rdata1</code> / <code>ex_rdata2</code>, lo que leyó el regfile en ID.</li>
      </ul>
      <p>La salida del mux B tiene un segundo destino: va a EX/MEM como <code>ex_rdata2</code>, es decir, es el dato que escribe un store, ya con forwarding. La dependencia a distancia 3 no necesita mux: la resuelve el bypass interno del regfile.</p>`,
    whyThisChoice: `
      <p>Dos muxes 3:1 son el hardware mínimo para tener CPI casi 1. La alternativa más simple, <b>sin forwarding</b> (solo stalls), se ofrece como modo didáctico en la GUI: el hardware es más chico, pero cada dependencia RAW cuesta hasta 2 burbujas. Una <b>red de bypass completa</b> agrega más fuentes (por ejemplo, la salida de la ALU en el mismo ciclo o varios pipes), algo que solo tiene sentido en diseños superescalares. La <b>planificación por el compilador</b> (MIPS I con delay slots) elimina el hardware a costa del código.</p>
      <p>Notar que este mux queda en el camino crítico: después de la lógica de comparación de la forward_unit y antes de la ALU.</p>`,
  },
  refs: [
    { label: 'fwd_a_val', sym: 'fwd_a_val' },
    { label: 'fwd_b_val', sym: 'fwd_b_val' },
    { label: 'forward_a', sym: 'forward_a' },
    { label: 'mem_result', sym: 'mem_result' },
    { label: 'wb_result', sym: 'wb_result' },
  ],
  grid: [8, 5],
  ports: [
    { name: 'ex_rdata1', dir: 'in', width: 32, side: 'l', ext: 'idex', desc: 'Valor de rs1 leído en ID y guardado en ID/EX. Es la entrada "00" del mux A.' },
    { name: 'mem_result', dir: 'in', width: 32, side: 'l', ext: 'wbMux', desc: 'Resultado de la instrucción en MEM (ya elegido por <code>mem_wb_sel</code>). Entrada "10" de ambos muxes.' },
    { name: 'wb_result', dir: 'in', width: 32, side: 'l', ext: 'memwb', desc: 'Resultado de MEM/WB. Entrada "01" de ambos muxes.' },
    { name: 'ex_rdata2', dir: 'in', width: 32, side: 'l', ext: 'idex', desc: 'Valor de rs2 leído en ID. Es la entrada "00" del mux B.' },
    { name: 'forward_a', dir: 'in', width: 2, side: 't', ext: 'forward', desc: 'Selector del mux A, generado por forward_unit.' },
    { name: 'forward_b', dir: 'in', width: 2, side: 'b', ext: 'forward', desc: 'Selector del mux B, generado por forward_unit.' },
    { name: 'fwd_a_val', dir: 'out', width: 32, side: 'r', ext: 'aluSrcMux', desc: 'Operando A con forwarding. Va al mux <code>alu_a</code>.' },
    { name: 'fwd_b_val', dir: 'out', width: 32, side: 'r', ext: 'aluSrcMux', desc: 'Operando B con forwarding. Va al mux <code>alu_b</code> y a EX/MEM (dato de store).' },
  ],
  parts: [
    P('fwd_a_val', 'mux', 'fwd_a_val', 32, [3, 0], [2, 2], 'Mux 3:1 del operando A: <code>10</code> mem_result, <code>01</code> wb_result, <code>00</code> ex_rdata1. Se escribe como un <code>case (forward_a)</code> con <code>default</code> en el valor leído del regfile.', { live: 'snap.signals.fwdAVal' }),
    P('fwd_b_val', 'mux', 'fwd_b_val', 32, [3, 3], [2, 2], 'Mux 3:1 del operando B, con la misma codificación. Su salida alimenta tanto a <code>alu_b</code> como al dato de los stores.', { live: 'snap.signals.fwdBVal' }),
  ],
  nets: [
    N('n_ex_rdata1', 'port:ex_rdata1', 'fwd_a_val', 'ex_rdata1', 32, 'Sale de ID/EX y entra al mux A como valor por defecto (sin hazard). Puede estar desactualizado si una instrucción reciente todavía no escribió su resultado.', 'snap.latches.idex.rdata1'),
    N('n_mem_result_a', 'port:mem_result', 'fwd_a_val', 'mem_result', 32, 'Sale del mux de resultado de MEM y vuelve al mux A de EX: es el camino de forwarding "10", un ciclo antes de que el dato se escriba en el banco.', 'snap.signals.memResult'),
    N('n_wb_result_a', 'port:wb_result', 'fwd_a_val', 'wb_result', 32, 'Sale de MEM/WB y entra al mux A: camino "01" para el resultado de hace dos instrucciones.', 'snap.signals.wbData'),
    N('n_forward_a', 'port:forward_a', 'fwd_a_val', 'forward_a', 2, 'Selector que dice de qué fuente sale el operando A: 00 regfile, 10 EX/MEM, 01 MEM/WB.', 'snap.signals.fwdA'),
    N('n_ex_rdata2', 'port:ex_rdata2', 'fwd_b_val', 'ex_rdata2', 32, 'Sale de ID/EX y entra al mux B como valor por defecto.', 'snap.latches.idex.rdata2'),
    N('n_mem_result_b', 'port:mem_result', 'fwd_b_val', 'mem_result', 32, 'El mismo <code>mem_result</code> que alimenta al mux A, ahora al mux B (camino "10").', 'snap.signals.memResult'),
    N('n_wb_result_b', 'port:wb_result', 'fwd_b_val', 'wb_result', 32, 'El mismo <code>wb_result</code> al mux B (camino "01").', 'snap.signals.wbData'),
    N('n_forward_b', 'port:forward_b', 'fwd_b_val', 'forward_b', 2, 'Selector del operando B, con la misma codificación.', 'snap.signals.fwdB'),
    N('n_fwd_a_out', 'fwd_a_val', 'port:fwd_a_val', 'fwd_a_val', 32, 'Operando A ya reenviado. Sigue hacia el mux <code>alu_a</code>, que puede reemplazarlo por el PC en AUIPC.', 'snap.signals.fwdAVal'),
    N('n_fwd_b_out', 'fwd_b_val', 'port:fwd_b_val', 'fwd_b_val', 32, 'Operando B ya reenviado. Va a <code>alu_b</code> y también a EX/MEM como dato del store.', 'snap.signals.fwdBVal'),
  ],
};
