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
  parent: 'riscv_pipeline',
  blockIds: ['memwb'],
  title: 'Registro MEM/WB',
  stage: 'WB',
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>El banco de registros es una memoria con una sola entrada de escritura por ciclo. Cuando una instrucción llega a su última etapa, hay que presentar a esa entrada tres cosas estables: <i>qué</i> escribir, <i>dónde</i> escribirlo y <i>si</i> hay que escribir. Si esas tres cosas dependieran de combinacionales de MEM, cambiarían a lo largo del ciclo (la lectura de la dmem es un camino largo) y podrían corromper el registro equivocado antes de estabilizarse.</p>
      <p>El último registro de pipeline captura, entonces, el resultado final y su destino, y los sostiene durante todo el ciclo WB. Además cumple otra función: su contenido es la segunda fuente de forwarding (la instrucción que terminó MEM hace un ciclo, o sea, a dos instrucciones de distancia).</p>
      <p>Por último, hay un asunto lógico con el halt. La instrucción que detiene al procesador (ECALL/EBREAK) tiene que viajar como cualquier otra hasta el final: solo cuando llega a WB se sabe que todas las instrucciones anteriores ya se retiraron, y recién ahí se puede avisar al exterior que el programa terminó.</p>`,
    inThisProject: `
      <p>Es ${g('module:mem_wb_reg', 'mem_wb_reg')}, instanciado como <code>u_mem_wb</code>. Es el registro más chico: <code>wb_reg_write</code>, <code>wb_halt</code>, <code>wb_result[31:0]</code> y <code>wb_rd[4:0]</code>. Prioridad: <code>if (rst)</code> a 0, <code>else if (en)</code> carga.</p>
      <ul>
        <li>Guarda <b>un solo</b> campo de datos, <code>wb_result</code>, porque en este diseño el mux <code>wb_sel</code> está en la etapa MEM (<code>mem_result</code>). Otros diseños guardan por separado el dato de la ALU y el de la memoria y eligen en WB.</li>
        <li><code>wb_halt</code> se asigna directamente a la salida <code>o_halt</code> del core (<code>assign o_halt = wb_halt</code>).</li>
        <li><code>wb_result</code> alimenta tres lugares: el puerto de escritura del regfile, el camino "01" de los muxes de forwarding y la palabra 20 del mapa de debug.</li>
        <li><code>wb_reg_write</code> se combina con <code>en</code> para formar el <code>we</code> del regfile, de modo que si el CPU está pausado no se escribe nada.</li>
      </ul>`,
    whyThisChoice: `
      <p>Dejar el mux de resultado en MEM hace que este registro sea mínimo y que el forwarding reutilice <code>mem_result</code> sin un mux adicional, a cambio de alargar la etapa MEM (lectura de dmem + mux). La alternativa <b>mux en WB</b> (diseños de libro de texto) mueve la selección después del registro: MEM es más corta pero hay que duplicar el mux para forward y guardar más bits acá. Otras variantes: <b>dos puertos de escritura</b> (superescalares) y <b>retiro con ROB</b> (fuera de orden), donde esta etapa deja de ser una escritura directa.</p>
      <p>En un procesador con <b>menos etapas</b> el write-back se fusiona con la etapa anterior; en uno con <b>más</b> hay varias etapas de retiro. En este diseño, 5 etapas es lo que hace al diseño explicable en un diagrama.</p>`,
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
