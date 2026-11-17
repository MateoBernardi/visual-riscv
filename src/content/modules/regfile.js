import { githubUrl } from '../repo.js';

const F = 'pipeline/2_decode/regfile.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.depth ? { depth: o.depth } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'regfile',
  module: 'regfile',
  file: F,
  instance: 'u_rf',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_rf',
  blockIds: ['regfile'],
  title: 'Banco de registros',
  stage: 'ID',
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>La instrucción solo trae los <i>números</i> de los registros; el banco entrega sus valores. Tiene que leer dos y escribir uno por ciclo, rápido, porque está entre ID y la ALU. Dos reglas de la ISA se vuelven hardware: <code>x0</code> siempre vale 0, y si WB escribe el registro que ID lee en el mismo ciclo, la lectura tiene que ver el valor nuevo.</p>`,
    inThisProject: `
      <ul>
        <li>${g('wr')} <code>= we &amp;&amp; waddr != 0</code>: escribir x0 no tiene efecto, y leerlo da 0.</li>
        <li>El reset borra x1..x31: por eso <code>X</code> de la debug unit limpia los registros.</li>
        <li><code>BYPASS</code> es un parámetro porque en un monociclo el write-through formaría un lazo combinacional.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Bypass interno</b> (si se lee lo que se está escribiendo, se entrega <code>wdata</code>): resuelve la dependencia a distancia 3 sin partir el ciclo en mitades, que es lo que hace el MIPS de libro y aprieta el timing.</p>
      <p><b>Flip-flops/LUTRAM y no BRAM</b>: 32×32 bits entran cómodos, la lectura es inmediata y el reset puede borrar todo en un ciclo, cosa que una BRAM no permite.</p>`,
  },
  refs: [
    { label: 'regfile', sym: 'module:regfile' },
    { label: 'regs', sym: 'reg:regs' },
    { label: 'rdata1', sym: 'assign:rdata1' },
    { label: 'wr', sym: 'wr' },
    { label: 'BYPASS', sym: 'param:BYPASS' },
  ],
  grid: [10, 7],
  ports: [
    { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj. La escritura es síncrona; las lecturas no dependen de él.' },
    { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug (i_rst)', desc: 'Reset sincrónico: borra x1..x31.' },
    { name: 'we', dir: 'in', width: 1, side: 'l', ext: 'memwb', desc: 'Habilita la escritura (<code>wb_reg_write &amp; en</code>).' },
    { name: 'waddr', dir: 'in', width: 5, side: 'l', ext: 'memwb', desc: 'Registro destino (<code>wb_rd</code>).' },
    { name: 'wdata', dir: 'in', width: 32, side: 'l', ext: 'memwb', desc: 'Dato a escribir (<code>wb_result</code>).' },
    { name: 'raddr1', dir: 'in', width: 5, side: 'l', ext: 'ifid', desc: 'rs1 de la instrucción en ID.' },
    { name: 'raddr2', dir: 'in', width: 5, side: 'l', ext: 'ifid', desc: 'rs2 de la instrucción en ID.' },
    { name: 'dbg_addr', dir: 'in', width: 5, side: 'b', ext: 'debug', desc: 'Registro que se lee por el puerto de debug.' },
    { name: 'rdata1', dir: 'out', width: 32, side: 'r', ext: 'idex', desc: 'Valor de rs1 (0 si es x0, con bypass).' },
    { name: 'rdata2', dir: 'out', width: 32, side: 'r', ext: 'idex', desc: 'Valor de rs2.' },
    { name: 'dbg_data', dir: 'out', width: 32, side: 'r', ext: 'debug', desc: 'Valor del registro pedido por la debug unit.' },
  ],
  parts: [
    P('BYPASS', 'const', 'BYPASS', 1, [4, 6], [2, 1], 'Parámetro: 1 = write-through. En el pipeline vale 1; con 0 una lectura en el ciclo de la escritura vería el valor viejo.'),
    P('wr', 'logic', 'wr = we && waddr != 0', 1, [2, 1], [2, 1], 'Escritura efectiva: ignora las escrituras a x0. Se usa para decidir el bypass en las lecturas.'),
    P('wr_port', 'logic', 'puerto de escritura', 32, [2, 3], [2, 1], '<code>always @(posedge clk)</code>: con <code>rst</code> borra x1..x31; si no, <code>if (we &amp;&amp; waddr != 0) regs[waddr] &lt;= wdata</code>. Es el único lugar que modifica el arreglo.', { symbol: null }),
    P('regs', 'regArray', 'regs[32]', 32, [5, 1], [2, 4], '32 registros de 32 bits. Se inicializan en cero (<code>initial</code>) y el reset los vuelve a limpiar.', { depth: 32 }),
    P('rdata1', 'mux', 'rdata1', 32, [8, 0], [2, 1], 'Lectura 1: <code>raddr1 == 0 ? 0 : (BYPASS &amp;&amp; wr &amp;&amp; waddr == raddr1) ? wdata : regs[raddr1]</code>. La prioridad es x0, luego bypass, luego el arreglo.', { live: 'snap.signals.idRdata1' }),
    P('rdata2', 'mux', 'rdata2', 32, [8, 3], [2, 1], 'Lectura 2, igual que la anterior con <code>raddr2</code>.', { live: 'snap.signals.idRdata2' }),
    P('dbg_data', 'logic', 'dbg_data', 32, [8, 5], [2, 1], '<code>regs[dbg_addr]</code>: lectura de debug, independiente de los dos puertos de la CPU y sin chequeo de x0.'),
  ],
  nets: [
    N('n_we', 'port:we', 'wr', 'we', 1, 'Viene de MEM/WB (<code>wb_reg_write</code>) combinado con <code>en</code>.', 'snap.signals.regWrite'),
    N('n_waddr_wr', 'port:waddr', 'wr', 'waddr', 5, 'Destino: si es 0, <code>wr</code> queda en 0.', 'snap.signals.wbRd'),
    N('n_we_port', 'port:we', 'wr_port', 'we', 1, 'Habilitación de la escritura sincrónica.', 'snap.signals.regWrite'),
    N('n_waddr_port', 'port:waddr', 'wr_port', 'waddr', 5, 'Selecciona qué registro del arreglo se escribe.', 'snap.signals.wbRd'),
    N('n_wdata_port', 'port:wdata', 'wr_port', 'wdata', 32, 'Valor que entra al registro elegido.', 'snap.signals.wbData'),
    N('n_rst', 'port:rst', 'wr_port', 'rst', 1, 'Con 1 todos los registros x1..x31 se borran.'),
    N('n_write', 'wr_port', 'regs', 'regs', 32, 'Escritura en el flanco de subida.'),
    N('n_raddr1', 'port:raddr1', 'rdata1', 'raddr1', 5, 'Número de rs1. Se compara con 0 (x0) y con <code>waddr</code> (bypass), y selecciona la palabra del arreglo.', 'snap.signals.idRs1'),
    N('n_raddr2', 'port:raddr2', 'rdata2', 'raddr2', 5, 'Número de rs2, con las mismas comparaciones.', 'snap.signals.idRs2'),
    N('n_regs1', 'regs', 'rdata1', 'regs', 32, 'Lectura asincrónica de la palabra <code>raddr1</code>.'),
    N('n_regs2', 'regs', 'rdata2', 'regs', 32, 'Lectura asincrónica de la palabra <code>raddr2</code>.'),
    N('n_wr1', 'wr', 'rdata1', 'wr', 1, 'Indica que en este ciclo hay una escritura efectiva (no a x0). Con <code>waddr == raddr1</code> activa el bypass A.', 'snap.signals.bypassA'),
    N('n_wr2', 'wr', 'rdata2', 'wr', 1, 'Lo mismo para el bypass B.', 'snap.signals.bypassB'),
    N('n_wdata1', 'port:wdata', 'rdata1', 'wdata', 32, 'Camino de bypass: el dato que WB está escribiendo pasa directo a la lectura, sin esperar al flanco.', 'snap.signals.wbData'),
    N('n_wdata2', 'port:wdata', 'rdata2', 'wdata', 32, 'Mismo bypass para la lectura 2.', 'snap.signals.wbData'),
    N('n_bypass1', 'BYPASS', 'rdata1', 'BYPASS', 1, 'Parámetro que habilita el bypass A en tiempo de elaboración.'),
    N('n_bypass2', 'BYPASS', 'rdata2', 'BYPASS', 1, 'Parámetro que habilita el bypass B.'),
    N('n_dbg_addr', 'port:dbg_addr', 'dbg_data', 'dbg_addr', 5, 'Índice pedido por la debug unit.'),
    N('n_regs_dbg', 'regs', 'dbg_data', 'regs', 32, 'Lectura de debug.'),
    N('n_rdata1', 'rdata1', 'port:rdata1', 'rdata1', 32, 'Va a ID/EX como operando A candidato.', 'snap.signals.idRdata1'),
    N('n_rdata2', 'rdata2', 'port:rdata2', 'rdata2', 32, 'Va a ID/EX como operando B candidato y dato del store.', 'snap.signals.idRdata2'),
    N('n_dbg_data', 'dbg_data', 'port:dbg_data', 'dbg_data', 32, 'Sale hacia el mux de debug de riscv_pipeline.v (palabras 22..53).'),
  ],
};
