import { githubUrl } from '../repo.js';

const F = 'pipeline/regs/pipe_reg.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;

// [campo, ancho, grupo, descripción, live]
const FIELDS = [
  ['reg_write', 1, 'c', 'La instrucción escribe un registro. forward_unit lo mira para decidir si vale la pena reenviar este resultado.', 'snap.latches.exmem.reg_write'],
  ['mem_read', 1, 'c', 'Es un load.', 'snap.latches.exmem.mem_read'],
  ['mem_write', 1, 'c', 'Es un store: habilita la escritura de la dmem (junto con <code>en</code>).', 'snap.latches.exmem.mem_write'],
  ['halt', 1, 'c', 'Viaja hacia WB; ahí levanta <code>o_halt</code>.', 'snap.latches.exmem.halt'],
  ['wb_sel', 2, 'c', 'Selector del mux de resultado que está en MEM: 00 ALU, 01 dmem, 10 PC+4, 11 inmediato.', 'snap.latches.exmem.wb_sel'],
  ['alu_out', 32, 'd', 'Resultado de la ALU. En loads y stores es la dirección de byte; en el resto, el valor a escribir.', 'snap.latches.exmem.alu_out'],
  ['rdata2', 32, 'd', 'Dato de un store: el valor de rs2 <i>ya con forwarding</i> (sale del mux <code>fwd_b_val</code>, no del regfile).', 'snap.latches.exmem.rdata2'],
  ['pc4', 32, 'd', 'PC+4 que viene desde ID; JAL/JALR lo escriben en rd.', 'snap.latches.exmem.pc4'],
  ['imm', 32, 'd', 'Inmediato; LUI lo escribe en rd tal cual.', 'snap.latches.exmem.imm'],
  ['rd', 5, 'd', 'Registro destino. forward_unit lo compara con rs1/rs2 de EX.', 'snap.latches.exmem.rd'],
  ['funct3', 3, 'd', 'Ancho y signo del acceso a memoria (LB/LH/LW/LBU/LHU, SB/SH/SW).', 'snap.latches.exmem.funct3'],
];

const parts = [{
  id: 'prio', kind: 'logic', label: 'rst > en', width: 1, symbol: null, at: [2, 0], size: [1, 6],
  desc: 'Lógica de prioridad: <code>if (rst)</code> pone todo en 0; <code>else if (en)</code> carga lo que viene de EX; con <code>en = 0</code> retiene. No hay <code>flush</code> ni <code>stall</code> en este registro.',
}];
const nets = [
  { id: 'n_rst', from: 'port:rst', to: 'prio', name: 'rst', width: 1, desc: 'Reset sincrónico: todos los campos a 0.' },
  { id: 'n_en', from: 'port:en', to: 'prio', name: 'en', width: 1, desc: 'Pausa del CPU: si vale 0, el registro retiene su contenido.' },
];
const ports = [
  { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj del sistema.' },
  { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug (i_rst)', desc: 'Reset sincrónico.' },
  { name: 'en', dir: 'in', width: 1, side: 't', ext: 'debug (i_enable)', desc: 'Enable global (pausa).' },
];
const idx = { c: 0, d: 0 };
for (const [n, w, grp, desc, live] of FIELDS) {
  const i = idx[grp]++;
  const col = grp === 'c' ? 4 : 6 + (i < 3 ? 0 : 1);
  const row = grp === 'c' ? i : (i < 3 ? i : i - 3);
  parts.push({
    id: `mem_${n}`, kind: 'ff', label: `mem_${n}`, width: w, symbol: `mem_${n}`, at: [col, row], size: [1, 1],
    desc: `${grp === 'c' ? '<b>Control.</b> ' : '<b>Dato.</b> '}${desc}`, live,
  });
  nets.push({ id: `n_in_${n}`, from: `port:ex_${n}`, to: `mem_${n}`, name: `ex_${n}`, width: w, desc: `Entrada desde EX: ${desc}` });
  nets.push({ id: `n_out_${n}`, from: `mem_${n}`, to: `port:mem_${n}`, name: `mem_${n}`, width: w, desc: `Salida hacia MEM: ${desc}`, live });
  ports.push({ name: `ex_${n}`, dir: 'in', width: w, side: 'l', ext: n === 'alu_out' ? 'alu' : n === 'rdata2' ? 'fwdMuxB' : 'idex', desc: `Entrada: ${desc}` });
  ports.push({ name: `mem_${n}`, dir: 'out', width: w, side: 'r', ext: n === 'rd' || n === 'reg_write' ? 'dmem / forward / wbMux' : 'MEM', desc: `Salida: ${desc}` });
}
nets.push({ id: 'n_prio_c', from: 'prio', to: 'mem_reg_write', name: null, width: 1, desc: 'La decisión (cargar / retener / reset) vale para todos los campos de control.' });
nets.push({ id: 'n_prio_d', from: 'prio', to: 'mem_alu_out', name: null, width: 1, desc: 'Y para todos los campos de datos.' });

export default {
  id: 'ex_mem_reg',
  module: 'ex_mem_reg',
  file: F,
  instance: 'u_ex_mem',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_ex_mem',
  blockIds: ['exmem'],
  title: 'Registro EX/MEM',
  stage: 'MEM',
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Retiene lo que EX produjo para que MEM y WB lo usen el ciclo siguiente. A esta altura ya no hace falta casi nada de ID/EX: queda el resultado (que es la dirección en loads y stores), el dato del store, rd y el control restante. Su contenido es también la primera fuente de forwarding.</p>`,
    inThisProject: `
      <ul>
        <li>Sin flush ni stall: una instrucción anulada ya llega como burbuja desde ID/EX.</li>
        <li>El dato del store viene de <code>fwd_b_val</code>, ya con forwarding; si no, <code>sw</code> guardaría un valor viejo.</li>
        <li><code>imm</code> viaja solo para LUI y <code>pc4</code> para JAL/JALR.</li>
      </ul>`,
    whyThisChoice: `
      <p>Guardar solo lo que se sigue usando lo deja en 142 bits contra los 190 de ID/EX. Que no necesite flush es consecuencia de resolver los saltos en EX: si se resolvieran en MEM, habría que anular también esta etapa.</p>`,
  },
  refs: [
    { label: 'ex_mem_reg', sym: 'module:ex_mem_reg' },
    { label: 'mem_alu_out', sym: 'mem_alu_out' },
    { label: 'mem_rdata2', sym: 'mem_rdata2' },
    { label: 'mem_rd', sym: 'mem_rd' },
  ],
  grid: [9, 6],
  ports,
  parts,
  nets,
};
