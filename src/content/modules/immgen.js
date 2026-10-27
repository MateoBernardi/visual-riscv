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
      <p>Una instrucción de 32 bits tiene que guardar muchas cosas: opcode, registros, y a veces una constante (el inmediato). Para que los registros siempre estén en el mismo lugar (así el banco de registros se puede leer antes de saber qué instrucción es), los bits sobrantes se usan para el inmediato, y su tamaño y ubicación dependen del tipo de instrucción: 12 bits en I y S, 13 en B, 20 en U y J.</p>
      <p>Pero la ALU y el sumador de saltos necesitan un número de 32 bits. Hay que <b>reconstruir</b> el inmediato: juntar los bits de donde estén, rellenar los bits altos y, si el número es con signo, repetir el bit de signo (extensión de signo) para que el valor numérico se preserve. En RISC-V el bit de signo es siempre <code>inst[31]</code>: se puede empezar a extender el signo en paralelo con la decodificación, sin esperar a saber el formato.</p>
      <p>El orden "desordenado" de los bits en B y J no es un capricho: está elegido para que cada bit del resultado salga de la menor cantidad posible de posiciones distintas entre formatos, con lo que el mux final es más chico. Además B y J no guardan el bit 0 (los destinos son múltiplos de 2), lo que duplica el alcance con los mismos bits.</p>
      <p>El hardware resultante es un multiplexor de cinco entradas, una por formato, cuyo selector sale de la unidad de control. No hay ninguna operación aritmética: es puro recableado más un mux.</p>`,
    inThisProject: `
      <p>Es ${g('module:immgen', 'immgen')} (instancia <code>u_immgen</code>). Recibe la instrucción completa (<code>instr</code>) y <code>imm_sel</code> de 3 bits, y entrega <code>imm</code> con un <code>case</code> dentro de <code>always @(*)</code>, con la codificación <code>000=I, 001=S, 010=B, 011=U, 100=J</code>.</p>
      <ul>
        <li>I: <code>{{20{instr[31]}}, instr[31:20]}</code></li>
        <li>S: <code>{{20{instr[31]}}, instr[31:25], instr[11:7]}</code></li>
        <li>B: <code>{{19{instr[31]}}, instr[31], instr[7], instr[30:25], instr[11:8], 1'b0}</code></li>
        <li>U: <code>{instr[31:12], 12'b0}</code></li>
        <li>J: <code>{{11{instr[31]}}, instr[31], instr[19:12], instr[20], instr[30:21], 1'b0}</code></li>
      </ul>
      <p>Notas de esta implementación: en <code>control.v</code> la instrucción JAL fija <code>imm_sel = 100</code>, y JALR usa I (<code>000</code>); AUIPC y LUI usan U (<code>011</code>). Para instrucciones sin inmediato (R-type) <code>imm_sel</code> queda en <code>000</code> y el resultado simplemente se ignora. El caso <code>default</code> devuelve 0. En los inmediatos tipo I de operaciones lógicas (ANDI, ORI, XORI) la extensión también es con signo, como manda la especificación. Los shifts inmediatos (SLLI/SRLI/SRAI) toman el shamt de los 5 bits bajos del inmediato; la ALU descarta el resto.</p>`,
    whyThisChoice: `
      <p>Un mux de 5 vías con los bits ya recableados es la implementación mínima: sin lógica, solo cables y un selector. Las alternativas son poco prácticas para un core de este tamaño: podrías <b>expandir el inmediato por formato en el decodificador</b> (un solo bloque control+immgen) pero se pierde la modularidad; con la <b>extensión C</b> (instrucciones comprimidas) se necesitarían más formatos de inmediato y una etapa previa de expansión; y en un procesador con <b>decodificación por uses_rs1/uses_rs2</b> el immgen no cambia, pero la lógica de hazards sí.</p>
      <p>En esta implementación el cálculo se hace en ID, en paralelo a la lectura del banco de registros, de modo que no suma tiempo al camino crítico: el inmediato llega a ID/EX junto con los operandos.</p>`,
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
