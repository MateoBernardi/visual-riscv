import { githubUrl } from '../repo.js';

const F = 'pipeline/regs/pipe_reg.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;

const FIELDS = [
  ['reg_write', 1, 'c', 'La instrucción en WB escribe un registro. Con <code>en</code> forma el <code>we</code> del regfile.', 'snap.latches.memwb.reg_write'],
  ['halt', 1, 'c', 'La instrucción es ECALL/EBREAK. Este bit es directamente la salida <code>o_halt</code> del core.', 'snap.latches.memwb.halt'],
  ['result', 32, 'd', 'Resultado final ya elegido en MEM (ALU, dmem, PC+4 o inmediato). Se escribe en rd y es la fuente "01" del forwarding.', 'snap.latches.memwb.result'],
  ['rd', 5, 'd', 'Registro destino de la escritura.', 'snap.latches.memwb.rd'],
];
const parts = [{
  id: 'prio', kind: 'logic', label: 'rst > en', width: 1, symbol: null, at: [2, 0], size: [1, 4],
  desc: 'Lógica de prioridad: <code>if (rst)</code> todo en 0; <code>else if (en)</code> carga lo que viene de MEM; si no, retiene. Sin flush ni stall.',
}];
const nets = [
  { id: 'n_rst', from: 'port:rst', to: 'prio', name: 'rst', width: 1, desc: 'Reset sincrónico: el estado de WB queda en "no escribe nada".' },
  { id: 'n_en', from: 'port:en', to: 'prio', name: 'en', width: 1, desc: 'Pausa del CPU: retiene.' },
];
const ports = [
  { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj del sistema.' },
  { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug (i_rst)', desc: 'Reset sincrónico.' },
  { name: 'en', dir: 'in', width: 1, side: 't', ext: 'debug (i_enable)', desc: 'Enable global (pausa).' },
];
FIELDS.forEach(([n, w, grp, desc, live], i) => {
  const src = n === 'result' ? 'mem_result' : `mem_${n}`;
  const dst = `wb_${n}`;
  parts.push({ id: dst, kind: 'ff', label: dst, width: w, symbol: dst, at: [4, i], size: [1, 1], desc: `${grp === 'c' ? '<b>Control.</b> ' : '<b>Dato.</b> '}${desc}`, live });
  nets.push({ id: `n_in_${n}`, from: `port:${src}`, to: dst, name: src, width: w, desc: `Entrada desde MEM: ${desc}` });
  nets.push({ id: `n_out_${n}`, from: dst, to: `port:${dst}`, name: dst, width: w, desc: `Salida hacia WB: ${desc}`, live });
  ports.push({ name: src, dir: 'in', width: w, side: 'l', ext: n === 'result' ? 'wbMux' : 'exmem', desc: `Entrada: ${desc}` });
  ports.push({ name: dst, dir: 'out', width: w, side: 'r', ext: n === 'result' ? 'regfile / fwdMuxA / fwdMuxB' : n === 'rd' ? 'regfile / forward' : n === 'halt' ? 'debug (o_halt)' : 'regfile', desc: `Salida: ${desc}` });
});
nets.push({ id: 'n_prio', from: 'prio', to: 'wb_result', name: null, width: 1, desc: 'La decisión (cargar / retener / reset) se aplica a los cuatro campos.' });

export default {
  id: 'mem_wb_reg',
  module: 'mem_wb_reg',
  file: F,
  instance: 'u_mem_wb',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_mem_wb',
  blockIds: ['memwb'],
  title: 'Registro MEM/WB',
  stage: 'WB',
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>El regfile necesita tres cosas estables durante todo el ciclo: qué escribir, dónde y si escribir. Este registro las sostiene. Además, el halt viaja hasta acá: recién en WB se sabe que todas las instrucciones anteriores terminaron.</p>`,
    inThisProject: `
      <ul>
        <li>Un solo campo de datos, <code>wb_result</code>, porque el resultado ya se eligió en MEM.</li>
        <li><code>wb_result</code> va al regfile, al camino <code>01</code> del forwarding y al mapa de debug. <code>wb_halt</code> es directamente <code>o_halt</code>.</li>
        <li>El <code>we</code> del regfile es <code>wb_reg_write &amp; en</code>: con el CPU pausado no se escribe.</li>
      </ul>`,
    whyThisChoice: `
      <p>Es el registro más chico (39 bits) porque el mux de resultado quedó en MEM. Ver el mux de write-back para el costo de esa decisión.</p>`,
  },
  refs: [
    { label: 'mem_wb_reg', sym: 'module:mem_wb_reg' },
    { label: 'wb_result', sym: 'wb_result' },
    { label: 'wb_halt', sym: 'wb_halt' },
    { label: 'wb_rd', sym: 'wb_rd' },
  ],
  grid: [7, 4],
  ports,
  parts,
  nets,
};
