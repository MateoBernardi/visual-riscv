import { githubUrl } from '../repo.js';

const F = 'pipeline/2_decode/immgen.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;

const FMT = [
  ['i', 'I', '000', '<code>{{20{instr[31]}}, instr[31:20]}</code>: los 12 bits altos de la instrucción son el inmediato; el resto se llena replicando el signo (<code>instr[31]</code>). Lo usan ADDI y compañía, loads y JALR.', 'inst[31:20]'],
  ['s', 'S', '001', '<code>{{20{instr[31]}}, instr[31:25], instr[11:7]}</code>: en un store el inmediato se parte en dos porque los bits [11:7] (donde otros formatos tienen rd) quedaron ocupados; <code>rs2</code> está en su lugar de siempre.', 'inst[31:25|11:7]'],
  ['b', 'B', '010', '<code>{{19{instr[31]}}, instr[31], instr[7], instr[30:25], instr[11:8], 1\'b0}</code>: el bit 0 es siempre 0 (los destinos son múltiplos de 2) y no se guarda; el bit 11 del offset está en <code>instr[7]</code> y el 12 (signo) en <code>instr[31]</code>.', 'inst[31|7|30:25|11:8] &lt;&lt; 1'],
  ['u', 'U', '011', '<code>{instr[31:12], 12\'b0}</code>: los 20 bits altos van a las posiciones altas del inmediato y los 12 bajos quedan en 0. Lo usan LUI y AUIPC.', 'inst[31:12] &lt;&lt; 12'],
  ['j', 'J', '100', '<code>{{11{instr[31]}}, instr[31], instr[19:12], instr[20], instr[30:21], 1\'b0}</code>: JAL. Mismo truco que B: bit 0 implícito, el bit 20 del offset en <code>instr[20]</code> y el signo en <code>instr[31]</code>.', 'inst[31|19:12|20|30:21] &lt;&lt; 1'],
];

const parts = FMT.map(([k, F2, code, desc, lbl], i) => ({
  id: `imm_${k}`, kind: 'logic', label: `${F2}  (${code})`, width: 32, symbol: null, at: [2, i], size: [2, 1],
  desc: `Formato <b>${F2}</b> (<code>imm_sel = ${code}</code>). ${desc} Bits: ${lbl}.`,
}));
parts.push({
  id: 'imm', kind: 'mux', label: 'case (imm_sel)', width: 32, symbol: 'imm', at: [5, 0], size: [2, 5],
  desc: 'Mux 5:1 escrito como <code>case (imm_sel)</code> dentro de un <code>always @(*)</code>. Cualquier valor no definido (<code>101</code>, <code>110</code>, <code>111</code>) da <code>imm = 0</code>.',
  live: 'snap.signals.idImm',
});

export default {
  id: 'immgen',
  module: 'immgen',
  file: F,
  instance: 'u_immgen',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_immgen',
  blockIds: ['immgen'],
  title: 'Generador de inmediatos',
  stage: 'ID',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Cada formato guarda la constante en bits distintos (12 en I/S, 13 en B, 20 en U/J). Hay que juntarlos y extender el signo a 32 bits. RISC-V deja el signo siempre en <code>inst[31]</code> y ordena los bits de B y J para que el mux final sea chico.</p>`,
    inThisProject: `
      <ul>
        <li><code>imm_sel</code>: <code>000</code> I, <code>001</code> S, <code>010</code> B, <code>011</code> U, <code>100</code> J. JALR usa I; LUI y AUIPC usan U.</li>
        <li>Los shifts inmediatos toman el shamt de los 5 bits bajos; la ALU descarta el resto.</li>
      </ul>`,
    whyThisChoice: `
      <p>Un mux de 5 vías con los bits ya recableados: no hay lógica, solo cables. Se calcula en ID en paralelo con la lectura del regfile, así que no suma al camino crítico.</p>`,
  },
  refs: [
    { label: 'immgen', sym: 'module:immgen' },
    { label: 'imm', sym: 'port:imm' },
    { label: 'imm_sel', sym: 'port:imm_sel' },
    { label: 'instr', sym: 'port:instr' },
  ],
  grid: [8, 5],
  ports: [
    { name: 'instr', dir: 'in', width: 32, side: 'l', ext: 'ifid', desc: 'Instrucción completa en ID (<code>id_inst</code>).' },
    { name: 'imm_sel', dir: 'in', width: 3, side: 'b', ext: 'control', desc: 'Formato del inmediato decidido por control.v.' },
    { name: 'imm', dir: 'out', width: 32, side: 'r', ext: 'idex', desc: 'Inmediato de 32 bits extendido en signo.' },
  ],
  parts,
  nets: [
    ...FMT.map(([k, F2, code]) => ({
      id: `n_instr_${k}`, from: 'port:instr', to: `imm_${k}`, name: 'instr', width: 32,
      desc: `La instrucción completa llega al armado del formato ${F2}: cada formato toma bits de lugares distintos.`,
    })),
    ...FMT.map(([k, F2, code]) => ({
      id: `n_${k}_mux`, from: `imm_${k}`, to: 'imm', name: null, width: 32,
      desc: `Inmediato armado como formato ${F2}, entrada ${code} del mux.`,
    })),
    { id: 'n_imm_sel', from: 'port:imm_sel', to: 'imm', name: 'imm_sel', width: 3, desc: 'Selector del mux: control.v lo decide por opcode (LOAD/I/JALR → 000, STORE → 001, BR → 010, LUI/AUIPC → 011, JAL → 100).' },
    { id: 'n_imm', from: 'imm', to: 'port:imm', name: 'imm', width: 32, desc: 'Inmediato final, que se guarda en ID/EX.', live: 'snap.signals.idImm' },
  ],
};
