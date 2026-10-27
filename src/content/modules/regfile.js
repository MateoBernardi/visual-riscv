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
      <p>La ALU necesita dos operandos por ciclo, pero una instrucción RISC-V solo tiene 5 bits para nombrar cada registro fuente: no puede traer los valores, solo sus <i>números</i>. Hace falta un lugar donde guardar los valores de los 32 registros de la arquitectura y que, dado un número, entregue el valor: una memoria pequeña y muy rápida, con <b>varios puertos</b>, porque en un mismo ciclo hay que leer dos registros (rs1 y rs2) y, a la vez, escribir el resultado de otra instrucción (rd).</p>
      <p>Esa memoria no puede tener la latencia de una RAM grande: sus lecturas están en el camino crítico entre la decodificación y la ALU. Por eso se implementa con flip-flops o con RAM distribuida (LUTRAM) y lecturas <b>asincrónicas</b>: el dato aparece en cuanto la dirección es estable.</p>
      <p>Hay dos reglas de la ISA que se vuelven hardware. La primera: el registro <code>x0</code> vale siempre cero y no se puede modificar; leerlo tiene que dar 0 y escribirlo tiene que ser inocuo. La segunda es un problema de tiempo: si WB escribe x5 en el mismo ciclo en que ID lee x5 (para otra instrucción), la lectura vería el valor viejo. Las soluciones clásicas son escribir en la primera mitad del ciclo y leer en la segunda, o hacer un <b>bypass interno</b> (write-through): si la dirección leída coincide con la escrita, el banco entrega directamente el dato que está entrando.</p>
      <p>Finalmente, en un sistema con debug hace falta un tercer acceso de lectura para volcar el estado a la PC sin interferir con los dos puertos de la CPU.</p>`,
    inThisProject: `
      <p>Es ${g('module:regfile', 'regfile')} (instancia <code>u_rf</code>, parametrizada con <code>BYPASS=1</code> desde riscv_pipeline.v). Contiene <code>reg [31:0] regs [0:31]</code>:</p>
      <ul>
        <li><b>Escritura</b> (síncrona): si <code>rst</code>, borra x1..x31 (por eso el reset de la debug unit limpia los registros); si no, <code>if (we &amp;&amp; waddr != 0) regs[waddr] &lt;= wdata</code>. Desde el pipeline <code>we = wb_reg_write &amp; en</code>, así que con el CPU pausado no se escribe. Incluso <code>regs[0]</code> nunca se modifica.</li>
        <li><b>Lecturas</b> (asincrónicas): ${g('rdata1')} y ${g('rdata2')} son asignaciones con dos ternarios encadenados: si <code>raddr == 0</code> entregan 0; si no, con <code>BYPASS</code>, <code>wr</code> (escritura efectiva: ${g('wr')} = <code>we &amp;&amp; waddr != 0</code>) y <code>waddr == raddr</code> entregan <code>wdata</code> (write-through); si no, <code>regs[raddr]</code>.</li>
        <li><b>Puerto de debug</b>: ${g('dbg_data')} <code>= regs[dbg_addr]</code>, sin chequeo de x0 (el mux de debug en riscv_pipeline.v fuerza el 0 de x0).</li>
      </ul>
      <p>El parámetro BYPASS existe porque el banco también podría usarse en un procesador monociclo; allí el write-through formaría un lazo combinacional. En el pipeline el bypass resuelve la dependencia a distancia 3 (instrucción en WB, consumidor en ID); a distancias 1 y 2 interviene el forwarding de EX. El bypass es combinacional desde <code>wdata</code>: no necesita esperar al flanco.</p>`,
    whyThisChoice: `
      <p>Con lecturas asincrónicas más bypass interno, el banco resuelve el conflicto "WB escribe lo que ID lee" sin tocar el reloj ni la duración de las fases. La alternativa clásica, <b>escribir en la primera mitad del ciclo y leer en la segunda</b> (MIPS R2000), no necesita comparadores, pero cada mitad dispone solo de medio ciclo y complica el timing. Otras opciones: <b>BRAM</b> en vez de LUTRAM (ahorra LUTs en bancos grandes, pero la lectura es sincrónica y agrega latencia o más bypass), <b>RV32E</b> (16 registros, mitad de área, no compatible con el ABI estándar), <b>más puertos</b> para un procesador superescalar (el área crece casi cuadráticamente) o <b>ventanas de registros</b> (SPARC), que optimizan las llamadas a función a costa de un banco enorme y trampas de overflow.</p>
      <p>En esta implementación 32×32 bits caben cómodos en LUTRAM de la Artix-7 y el reset puede borrar todo en un ciclo porque son flip-flops, algo que una BRAM no permitiría.</p>`,
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
