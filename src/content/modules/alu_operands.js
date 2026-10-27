import { githubUrl } from '../repo.js';

const F = 'pipeline/riscv_pipeline.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: o.symbol ?? id, at, size, desc,
  ...(o.drill ? { drill: o.drill } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'alu_operands',
  module: 'riscv_pipeline',
  file: F,
  pseudo: true,
  instance: null,
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu',
  blockIds: ['aluSrcMux'],
  title: 'Operandos de la ALU (alu_a / alu_b)',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>La ALU es un circuito con dos entradas y una operación. Pero no todas las instrucciones usan los mismos dos números: <code>add x1,x2,x3</code> suma dos registros, <code>addi x1,x2,5</code> suma un registro y una constante que viene dentro de la propia instrucción, <code>lw</code> y <code>sw</code> suman un registro base más un desplazamiento, y <code>auipc</code> suma una constante al <i>PC</i>, no a un registro.</p>
      <p>Para reutilizar una única ALU para todo, hay que decidir antes de la ALU qué dos números entran. Cada decisión de "esto o aquello" es un multiplexor, y el bit de selección sale del decodificador de control, que ya sabe de qué instrucción se trata.</p>`,
    inThisProject: `
      <p>Son dos asignaciones continuas con operador ternario, después del forwarding:</p>
      <ul>
        <li>${g('alu_a')} <code>= ex_is_auipc ? ex_pc : fwd_a_val</code>. Solo AUIPC desvía el operando A al PC; <code>ex_is_auipc</code> se calcula en ID comparando el opcode (<code>id_is_auipc</code>) y viaja por ID/EX. LUI no pasa por la ALU: su resultado sale directo del inmediato por el mux <code>wb_sel</code>.</li>
        <li>${g('alu_b')} <code>= ex_alu_src ? ex_imm : fwd_b_val</code>. <code>alu_src = 1</code> para I-type, loads, stores, JALR y AUIPC; vale 0 para R-type y branches (que comparan dos registros).</li>
      </ul>
      <p>Como el mux de forwarding está <i>antes</i>, un inmediato nunca se reenvía: <code>fwd_b_val</code> se calcula igual y se descarta. Esto es seguro aunque <code>forward_b</code> coincida por casualidad con bits del inmediato en I-type (ver quirk de comparar campos crudos), porque <code>alu_src</code> manda. El dato de un store sí usa <code>fwd_b_val</code> directamente, no <code>alu_b</code>, porque en un store <code>alu_b</code> es el offset.</p>`,
    whyThisChoice: `
      <p>Dos muxes 2:1 chicos dejan la ALU simple: sin ellos habría que tener sumadores separados para PC+imm, base+offset, etc. La alternativa es mover la lógica: <b>LUI vía ALU</b> (A=0, B=imm) eliminaría el camino <code>wb_sel = 11</code> pero obligaría a forzar A=0; <b>AUIPC con sumador propio</b> evitaría el mux A pero duplica hardware. En cores con más puertos o ejecución fuera de orden estos muxes se transforman en la red de bypass completa.</p>
      <p>En este diseño la elección mantiene los muxes de selección fuera de la ALU, que queda como un módulo puramente aritmético.</p>`,
  },
  refs: [
    { label: 'alu_a', sym: 'alu_a' },
    { label: 'alu_b', sym: 'alu_b' },
    { label: 'ex_is_auipc', sym: 'ex_is_auipc' },
    { label: 'ex_alu_src', sym: 'ex_alu_src' },
  ],
  grid: [8, 5],
  ports: [
    { name: 'fwd_a_val', dir: 'in', width: 32, side: 'l', ext: 'fwdMuxA', desc: 'Operando A con forwarding.' },
    { name: 'ex_pc', dir: 'in', width: 32, side: 'l', ext: 'idex', desc: 'PC de la instrucción en EX (usado solo por AUIPC).' },
    { name: 'fwd_b_val', dir: 'in', width: 32, side: 'l', ext: 'fwdMuxB', desc: 'Operando B con forwarding.' },
    { name: 'ex_imm', dir: 'in', width: 32, side: 'l', ext: 'idex', desc: 'Inmediato de la instrucción en EX.' },
    { name: 'ex_is_auipc', dir: 'in', width: 1, side: 't', ext: 'idex', desc: 'Selector del mux A: 1 si la instrucción es AUIPC.' },
    { name: 'ex_alu_src', dir: 'in', width: 1, side: 'b', ext: 'idex', desc: 'Selector del mux B: 1 elige el inmediato.' },
    { name: 'alu_a', dir: 'out', width: 32, side: 'r', ext: 'alu', desc: 'Operando A que entra a la ALU.' },
    { name: 'alu_b', dir: 'out', width: 32, side: 'r', ext: 'alu', desc: 'Operando B que entra a la ALU.' },
  ],
  parts: [
    P('alu_a', 'mux', 'alu_a', 32, [3, 0], [2, 2], 'Mux 2:1 con <code>ex_is_auipc</code> como selector: PC para AUIPC, operando reenviado para todo lo demás.', { live: 'snap.signals.aluA' }),
    P('alu_b', 'mux', 'alu_b', 32, [3, 3], [2, 2], 'Mux 2:1 con <code>ex_alu_src</code> como selector: inmediato (I, load, store, JALR, AUIPC) o registro (R-type, branch).', { live: 'snap.signals.aluB' }),
  ],
  nets: [
    N('n_fwd_a_val', 'port:fwd_a_val', 'alu_a', 'fwd_a_val', 32, 'Sale del mux de forwarding A y entra a la entrada "0" de <code>alu_a</code>.', 'snap.signals.fwdAVal'),
    N('n_ex_pc', 'port:ex_pc', 'alu_a', 'ex_pc', 32, 'El PC de la instrucción en EX (viajó por ID/EX). AUIPC calcula <code>pc + imm</code>.', 'snap.latches.idex.pc'),
    N('n_ex_is_auipc', 'port:ex_is_auipc', 'alu_a', 'ex_is_auipc', 1, 'Bandera calculada en ID (<code>id_is_auipc</code>, comparación de opcode) y guardada en ID/EX. Con 1, el mux A toma el PC.', 'snap.latches.idex.is_auipc'),
    N('n_fwd_b_val', 'port:fwd_b_val', 'alu_b', 'fwd_b_val', 32, 'Sale del mux de forwarding B y entra a la entrada "0" de <code>alu_b</code> (instrucciones con dos registros).', 'snap.signals.fwdBVal'),
    N('n_ex_imm', 'port:ex_imm', 'alu_b', 'ex_imm', 32, 'Inmediato extendido en signo que vino de ID: offset de loads/stores, constante de I-type, U-immediate de AUIPC.', 'snap.latches.idex.imm'),
    N('n_ex_alu_src', 'port:ex_alu_src', 'alu_b', 'ex_alu_src', 1, 'Bandera de control decodificada en ID: 1 si el segundo operando es el inmediato.', 'snap.latches.idex.alu_src'),
    N('n_alu_a_out', 'alu_a', 'port:alu_a', 'alu_a', 32, 'Operando A definitivo: va a la ALU (y al mapa de debug, palabra 9).', 'snap.signals.aluA'),
    N('n_alu_b_out', 'alu_b', 'port:alu_b', 'alu_b', 32, 'Operando B definitivo: va a la ALU (y al mapa de debug, palabra 10).', 'snap.signals.aluB'),
  ],
};
