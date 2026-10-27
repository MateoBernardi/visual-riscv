import { githubUrl } from '../repo.js';

const F = 'pipeline/3_execute/branch_unit.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'branch_unit',
  module: 'branch_unit',
  file: F,
  instance: 'u_bu',
  parent: 'riscv_pipeline',
  blockIds: ['branch'],
  title: 'Unidad de branches',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Un salto condicional tiene que responder dos preguntas: <b>¿salto?</b> y <b>¿adónde?</b>. La segunda es aritmética pura: el destino es la dirección del propio branch más un desplazamiento que viene en la instrucción (<code>PC + imm</code>), un sumador. La primera depende de comparar dos registros y de qué condición pide la instrucción: igual, distinto, menor con signo, mayor o igual con signo, y las dos versiones sin signo.</p>
      <p>Comparar dos números es lo que ya hace la ALU cuando resta. En lugar de duplicar comparadores, la ALU entrega unas pocas banderas (el resultado de la resta es cero, el primero es menor con signo, es menor sin signo) y una unidad chica traduce "qué condición pidió la instrucción" a "cuál de esas banderas hay que mirar y si hay que invertirla". La instrucción lleva esa condición en los 3 bits de funct3.</p>
      <p>La separación entre quién <i>decide</i> el salto y quién lo <i>ejecuta</i> también importa. Esta unidad solo informa "la condición es verdadera"; que la instrucción realmente sea un branch lo determina el decodificador, y que haya que redirigir el PC y anular instrucciones lo ordena el pipeline.</p>
      <p>Por último, el destino del salto necesita su propio sumador porque la ALU está ocupada comparando: la ALU resta los registros mientras este sumador calcula <code>pc + imm</code>, en paralelo.</p>`,
    inThisProject: `
      <p>Es ${g('module:branch_unit', 'branch_unit')} (instancia <code>u_bu</code>) y tiene dos mitades independientes, ambas combinacionales:</p>
      <ul>
        <li>${g('branch_target')} <code>= pc + b_imm</code>, un sumador dedicado de 32 bits. <code>pc</code> es el PC del branch (<code>ex_pc</code>), no PC+4, y <code>b_imm</code> es <code>ex_imm</code> (en JAL, el inmediato J).</li>
        <li>${g('branch_taken')}: un <code>case (funct3)</code>: <code>000</code> BEQ = <code>zero</code>; <code>001</code> BNE = <code>~zero</code>; <code>100</code> BLT = <code>alu_lt</code>; <code>101</code> BGE = <code>~alu_lt</code>; <code>110</code> BLTU = <code>alu_ltu</code>; <code>111</code> BGEU = <code>~alu_ltu</code>; cualquier otro código da 0.</li>
      </ul>
      <p>La unidad no sabe si la instrucción en EX es un branch. En riscv_pipeline.v se compone: <code>branch_taken = ex_branch &amp; bu_taken</code>, <code>redirect = branch_taken | ex_jump</code> y <code>redirect_target = ex_is_jalr ? (alu_out &amp; ~1) : bu_target</code>. Es decir, <code>bu_target</code> sirve también para JAL (que no pasa por <code>branch_taken</code>), y el JALR calcula su destino en la ALU. El <code>funct3</code> de un JAL no tiene significado, pero da igual porque <code>ex_jump</code> fuerza el redirect de todas formas.</p>
      <p>En esta implementación los saltos se resuelven en la etapa EX; por eso un salto tomado vacía las dos instrucciones que entraron después (IF/ID e ID/EX). Otros diseños resuelven en ID para pagar un solo ciclo.</p>`,
    whyThisChoice: `
      <p>Resolver en EX reutiliza las banderas de la ALU y requiere cero hardware de forwarding nuevo hacia ID: los operandos ya llegaron con forwarding. El precio es 2 burbujas por salto tomado. La alternativa de <b>resolver en ID con un comparador temprano</b> baja la penalidad a 1 ciclo, pero obliga a agregar forwarding hacia ID y a frenar si el operando viene de un load (MIPS R3000, Cortex-M0+). Una <b>predicción</b> (BTFN estática, bimodal, gshare, BTB) evitaría la burbuja cuando acierta, con tablas y lógica de recuperación; el <b>salto retardado</b> de MIPS no es una opción en RISC-V porque no existe en la ISA; y la <b>ejecución predicada</b> (ARM, Zicond) evita saltos cortos.</p>
      <p>Contar con un sumador propio (en vez de reutilizar la ALU) cuesta unas decenas de LUTs pero evita un conflicto estructural: la ALU está ocupada restando para el branch.</p>`,
  },
  refs: [
    { label: 'branch_unit', sym: 'module:branch_unit' },
    { label: 'branch_target', sym: 'assign:branch_target' },
    { label: 'branch_taken', sym: 'branch_taken' },
    { label: 'funct3', sym: 'port:funct3' },
  ],
  grid: [8, 5],
  ports: [
    { name: 'funct3', dir: 'in', width: 3, side: 'l', ext: 'idex', desc: 'funct3 de la instrucción en EX: define la condición.' },
    { name: 'zero', dir: 'in', width: 1, side: 'l', ext: 'alu', desc: 'ALU: resultado == 0 (rs1 == rs2 tras la resta).' },
    { name: 'alu_lt', dir: 'in', width: 1, side: 'l', ext: 'alu', desc: 'ALU: rs1 &lt; rs2 con signo.' },
    { name: 'alu_ltu', dir: 'in', width: 1, side: 'l', ext: 'alu', desc: 'ALU: rs1 &lt; rs2 sin signo.' },
    { name: 'pc', dir: 'in', width: 32, side: 'b', ext: 'idex', desc: 'PC de la instrucción en EX.' },
    { name: 'b_imm', dir: 'in', width: 32, side: 'b', ext: 'idex', desc: 'Inmediato B (o J para JAL) ya extendido.' },
    { name: 'branch_taken', dir: 'out', width: 1, side: 'r', ext: 'pc', desc: 'La condición del branch es verdadera.' },
    { name: 'branch_target', dir: 'out', width: 32, side: 'r', ext: 'pc', desc: '<code>pc + b_imm</code>.' },
  ],
  parts: [
    P('branch_taken', 'mux', 'case (funct3)', 1, [3, 0], [2, 3], 'Evalúa la condición según funct3. BNE/BGE/BGEU son las negaciones de BEQ/BLT/BLTU, así que no hacen falta más comparadores.', { live: 'snap.signals.branchTaken' }),
    P('branch_target', 'adder', 'pc + b_imm', 32, [3, 4], [2, 1], 'Sumador dedicado: <code>assign branch_target = pc + b_imm</code>. También es el destino de JAL.', { live: 'snap.signals.branchTarget' }),
  ],
  nets: [
    N('n_funct3', 'port:funct3', 'branch_taken', 'funct3', 3, 'Elige qué bandera mirar y si se invierte.', 'snap.latches.idex.funct3'),
    N('n_zero', 'port:zero', 'branch_taken', 'zero', 1, 'Para BEQ y BNE.', 'snap.signals.zero'),
    N('n_lt', 'port:alu_lt', 'branch_taken', 'alu_lt', 1, 'Para BLT y BGE.', 'snap.signals.lt'),
    N('n_ltu', 'port:alu_ltu', 'branch_taken', 'alu_ltu', 1, 'Para BLTU y BGEU.', 'snap.signals.ltu'),
    N('n_pc', 'port:pc', 'branch_target', 'pc', 32, 'Dirección del branch.', 'snap.latches.idex.pc'),
    N('n_imm', 'port:b_imm', 'branch_target', 'b_imm', 32, 'Desplazamiento (múltiplo de 2) ya extendido.', 'snap.latches.idex.imm'),
    N('n_taken', 'branch_taken', 'port:branch_taken', 'branch_taken', 1, 'Vuelve a riscv_pipeline.v como <code>bu_taken</code>, donde se combina con <code>ex_branch</code> para formar <code>branch_taken</code>.', 'snap.signals.branchTaken'),
    N('n_target', 'branch_target', 'port:branch_target', 'branch_target', 32, 'Vuelve como <code>bu_target</code>, entrada del mux <code>redirect_target</code>.', 'snap.signals.branchTarget'),
  ],
};
