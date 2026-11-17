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
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_bu',
  blockIds: ['branch'],
  title: 'Unidad de branches',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Un branch pregunta <b>¿salto?</b> y <b>¿adónde?</b>. El destino es <code>PC + imm</code>, un sumador. La decisión reutiliza las banderas de la resta que ya hace la ALU: funct3 dice cuál mirar y si invertirla.</p>`,
    inThisProject: `
      <ul>
        <li>No sabe si la instrucción es un branch: el pipeline arma <code>branch_taken = ex_branch &amp; bu_taken</code> y <code>redirect = branch_taken | ex_jump</code>.</li>
        <li>${g('branch_target')} también sirve para JAL; JALR calcula su destino en la ALU (<code>alu_out &amp; ~1</code>).</li>
      </ul>`,
    whyThisChoice: `
      <p>Resolver en EX aprovecha que los operandos ya llegaron con forwarding y que la ALU ya restó: no hay comparador ni forwarding nuevos hacia ID. Cuesta 2 burbujas por salto tomado en lugar de 1. El sumador propio (unas decenas de LUTs) existe porque la ALU está ocupada comparando en ese mismo ciclo.</p>`,
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
