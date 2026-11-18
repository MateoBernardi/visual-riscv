import { githubUrl } from '../repo.js';

const F = 'pipeline/2_decode/illegal_check.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'illegal_check',
  module: 'illegal_check',
  file: F,
  instance: 'u_illegal',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_illegal',
  blockIds: ['illegal'],
  title: 'Chequeo de instrucción ilegal',
  stage: 'ID',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>De los 2<sup>32</sup> valores posibles de una palabra, solo unos pocos son instrucciones de la ISA que implementás. El resto tiene que tener un efecto definido: la spec dice que es una <b>instrucción ilegal</b>, una excepción. Si el decodificador solo mira el opcode, una codificación inválida se ejecuta como la instrucción válida más parecida.</p>`,
    inThisProject: `
      <ul>
        <li>Acepta exactamente las 40 codificaciones de RV32I. Todo lo demás es ilegal: CSR, <code>fence.i</code>, <code>mret</code>, <code>wfi</code> y cualquier palabra con <code>instr[1:0] != 11</code>.</li>
        <li>${g('ecall')} y ${g('ebreak')} comparan la palabra completa: son las dos únicas SYSTEM legales.</li>
        <li>En riscv_pipeline.v, <code>id_stop</code> junta ilegal, fuera de la imem y halt; la instrucción no escribe nada y la causa viaja hasta EX.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Un módulo aparte del control.</b> El control solo arma las señales del datapath; decidir qué es legal es otra tabla, más estricta (mira funct3 y funct7 donde el control no los necesita). Separadas, cada una es fácil de leer y de probar.</p>
      <p><b>Detectar en ID, actuar en EX.</b> Una instrucción ilegal puede estar en el camino equivocado de un salto: si actuara en ID, un salto tomado no alcanzaría a descartarla y habría un trap que el programa nunca pidió.</p>`,
  },
  refs: [
    { label: 'illegal_check', sym: 'module:illegal_check' },
    { label: 'ecall', sym: 'ecall' },
    { label: 'ebreak', sym: 'ebreak' },
  ],
  grid: [9, 5],
  ports: [
    { name: 'instr', dir: 'in', width: 32, side: 'l', ext: 'ifid', desc: 'La instrucción en ID.' },
    { name: 'illegal', dir: 'out', width: 1, side: 'r', ext: 'idex', desc: 'No es una codificación de RV32I (causa 2).' },
    { name: 'ecall', dir: 'out', width: 1, side: 'r', ext: 'idex', desc: 'Es exactamente <code>ecall</code> (causa 11).' },
    { name: 'ebreak', dir: 'out', width: 1, side: 'r', ext: 'idex', desc: 'Es exactamente <code>ebreak</code> (causa 3).' },
  ],
  parts: [
    P('case', 'mux', 'case (opcode)', 1, [3, 0], [3, 2], 'Por opcode, qué valores de funct3 y funct7 son válidos. Un opcode que no es de RV32I cae en <code>default</code>: ilegal.', { symbol: 'illegal', live: 'snap.signals.idIllegal' }),
    P('ecall', 'logic', "instr == 32'h00000073", 1, [3, 3], [3, 1], 'Comparación con la palabra completa.'),
    P('ebreak', 'logic', "instr == 32'h00100073", 1, [3, 4], [3, 1], 'Comparación con la palabra completa.'),
  ],
  nets: [
    N('n_instr', 'port:instr', 'case', 'instr', 32, 'opcode, funct3 y funct7.', 'snap.latches.ifid.inst'),
    N('n_instr_ec', 'port:instr', 'ecall', 'instr', 32, 'La palabra entera.', 'snap.latches.ifid.inst'),
    N('n_instr_eb', 'port:instr', 'ebreak', 'instr', 32, 'La palabra entera.', 'snap.latches.ifid.inst'),
    N('n_sys', 'ecall', 'case', 'ecall', 1, 'En SYSTEM, solo ecall y ebreak son legales.'),
    N('n_sys_b', 'ebreak', 'case', 'ebreak', 1, 'En SYSTEM, solo ecall y ebreak son legales.'),
    N('n_illegal', 'case', 'port:illegal', 'illegal', 1, 'Va a riscv_pipeline.v como <code>id_illegal</code>.', 'snap.signals.idIllegal'),
    N('n_ecall', 'ecall', 'port:ecall', 'ecall', 1, 'Elige la causa 11.'),
    N('n_ebreak', 'ebreak', 'port:ebreak', 'ebreak', 1, 'Elige la causa 3.'),
  ],
};
