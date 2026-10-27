import { githubUrl } from '../repo.js';

const F = 'pipeline/riscv_pipeline.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: o.symbol ?? id, at, size, desc,
  ...(o.drill ? { drill: o.drill } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'if_pc',
  module: 'riscv_pipeline',
  file: F,
  pseudo: true,
  instance: null,
  parent: 'riscv_pipeline',
  blockIds: ['pc'],
  title: 'Program Counter y próximo PC',
  stage: 'IF',
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>Un procesador ejecuta un programa que está guardado en memoria como una lista de instrucciones. Para saber cuál toca, necesita recordar "en qué instrucción voy": un número que se guarda entre un ciclo y el siguiente. Ese número es el <b>program counter</b> (PC) y, como tiene que <i>recordar</i>, es un registro (flip-flops que cargan en el flanco de clock).</p>
      <p>Cada instrucción RV32I ocupa 4 bytes, así que lo normal es que el PC pase de <code>pc</code> a <code>pc + 4</code>. Pero un salto rompe la secuencia: el destino se calcula más adelante en el pipeline y hay que poder sobrescribir el PC. Eso exige un <b>multiplexor</b> con dos candidatos: el siguiente secuencial y el destino del salto.</p>
      <p>Por último, a veces el PC no debe avanzar (si el pipeline se frena, el CPU está pausado o hay que dejar de buscar instrucciones). Eso se resuelve con un <b>enable</b> de escritura del registro: si vale 0, el PC se queda con su valor.</p>`,
    inThisProject: `
      <p>El registro es ${g('pc')} y se actualiza en cada flanco: reset sincrónico a <code>32'd0</code>, y si ${g('pc_en')} vale 1 carga ${g('pc_next')}. El enable se arma como <code>pc_en = en &amp; ~stall &amp; ~stop_fetch</code>: se congela con la pausa de la debug unit (<code>en</code>), con un load-use (<code>stall</code>) y cuando hay un halt en camino (<code>stop_fetch</code>).</p>
      <p>El próximo PC es <code>pc_next = redirect ? redirect_target : (pc + 32'd4)</code>. El sumador +4 no tiene nombre propio: está escrito dentro de esa misma asignación. En cambio <code>redirect</code> y ${g('redirect_target')} vienen de la etapa EX: es un camino "hacia atrás" en el pipeline, por eso un salto tomado deja entrar dos instrucciones equivocadas antes de corregir el PC (y ahí interviene el flush).</p>
      <p>No hay predictor: se supone siempre "no tomado" y la instrucción siguiente es la secuencial. Los bits bajos del PC no se descartan: se calcula en 32 bits y la imem solo mira <code>addr[ADDR_W-1:2]</code>.</p>`,
    whyThisChoice: `
      <p>Cargar PC+4 por defecto y corregir desde EX es lo más barato posible: un sumador, un mux y cero estado extra. La contrapartida es la penalidad de 2 ciclos por salto tomado. Las alternativas listadas para este bloque ofrecen compromisos: una <b>predicción estática BTFN</b> (saltos hacia atrás tomados) acertaría en loops con un sumador de destino temprano; un <b>predictor bimodal o gshare</b> con <b>BTB</b> hace la predicción ya en IF a costa de tablas y de lógica de recuperación; el <b>salto retardado</b> (MIPS) evita flush pero expone la microarquitectura al ISA.</p>
      <p>Para un core didáctico donde importa ver el flush, la solución simple es la que mejor se entiende.</p>`,
  },
  refs: [
    { label: 'pc', sym: 'reg:pc' },
    { label: 'pc_next', sym: 'pc_next' },
    { label: 'pc_en', sym: 'pc_en' },
    { label: 'redirect_target', sym: 'redirect_target' },
    { label: 'stop_fetch', sym: 'stop_fetch' },
  ],
  grid: [9, 5],
  ports: [
    { name: 'redirect', dir: 'in', width: 1, side: 'l', ext: 'branch', desc: 'EX ordena cambiar el PC (branch tomado, JAL o JALR). Viene de la etapa EX.' },
    { name: 'redirect_target', dir: 'in', width: 32, side: 'l', ext: 'branch', desc: 'Destino del salto calculado en EX: <code>pc + imm</code> o <code>(rs1 + imm) &amp; ~1</code>.' },
    { name: 'stall', dir: 'in', width: 1, side: 'b', ext: 'hazard', desc: 'Load-use detectado por hazard_unit: el PC debe quedarse quieto.' },
    { name: 'stop_fetch', dir: 'in', width: 1, side: 'b', ext: 'flush', desc: 'Hay un halt en EX o ya registrado: no se debe seguir buscando instrucciones.' },
    { name: 'en', dir: 'in', width: 1, side: 'b', ext: 'debug', desc: 'Alias de <code>i_enable</code>: pausa del CPU desde la debug unit.' },
    { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug', desc: 'Alias de <code>i_rst</code>: reset sincrónico, lleva el PC a 0.' },
    { name: 'pc', dir: 'out', width: 32, side: 'r', ext: 'imem', desc: 'Dirección de la instrucción en fetch. Va a la imem y a IF/ID.' },
  ],
  parts: [
    P('pc_plus4', 'adder', 'pc + 4', 32, [4, 3], [1, 1], 'Sumador de la secuencia normal: cada instrucción mide 4 bytes. No tiene nombre propio en el RTL, está dentro de <code>assign pc_next</code>.', { symbol: 'pc_next' }),
    P('pc_next', 'mux', 'pc_next', 32, [4, 1], [1, 2], 'Mux 2:1: <code>redirect</code> elige entre el destino del salto y PC+4.', { live: 'snap.signals.redirect' }),
    P('pc_en', 'logic', 'pc_en', 1, [6, 4], [2, 1], '<code>en &amp; ~stall &amp; ~stop_fetch</code>: condición para que el PC avance. Es el enable del registro, no un reloj gateado.'),
    P('pc', 'ff', 'pc', 32, [6, 1], [2, 2], 'Registro de 32 bits con reset a 0 y enable. Sale hacia la imem y hacia IF/ID.', { live: 'snap.pc' }),
  ],
  nets: [
    N('n_redirect', 'port:redirect', 'pc_next', 'redirect', 1, 'Viene de EX (OR de branch tomado y jump) y es el selector del mux: 1 elige el destino del salto.', 'snap.signals.redirect'),
    N('n_redirect_target', 'port:redirect_target', 'pc_next', 'redirect_target', 32, 'Viene de EX con el destino calculado, y entra a la entrada "1" del mux.', 'snap.signals.redirectTarget'),
    N('n_pc_plus4', 'pc_plus4', 'pc_next', 'pc_next', 32, 'La rama secuencial <code>pc + 32\'d4</code> no tiene nombre propio: es la expresión dentro de <code>assign pc_next</code>, entrada "0" del mux.'),
    N('n_pc_loop', 'pc', 'pc_plus4', 'pc', 32, 'El PC actual vuelve al sumador para calcular la dirección siguiente.', 'snap.pc'),
    N('n_pc_next', 'pc_next', 'pc', 'pc_next', 32, 'Salida del mux: el valor que el PC va a tomar en el próximo flanco si <code>pc_en</code> vale 1.'),
    N('n_pc_en', 'pc_en', 'pc', 'pc_en', 1, 'Enable del registro: con 0 el PC conserva su valor.'),
    N('n_stall', 'port:stall', 'pc_en', 'stall', 1, 'Viene de hazard_unit. Un load-use congela el PC y IF/ID un ciclo.', 'snap.signals.stall'),
    N('n_stop_fetch', 'port:stop_fetch', 'pc_en', 'stop_fetch', 1, 'Viene de la lógica de halt: el PC deja de avanzar apenas un halt llega a EX.', 'snap.signals.stopFetch'),
    N('n_en', 'port:en', 'pc_en', 'en', 1, 'Pausa externa de la debug unit; con 0 todo el estado se congela.'),
    N('n_rst', 'port:rst', 'pc', 'rst', 1, 'Reset sincrónico: tiene prioridad sobre el enable y lleva el PC a 0.'),
    N('n_pc_out', 'pc', 'port:pc', 'pc', 32, 'El PC sale hacia la imem (dirección de fetch) y hacia IF/ID.', 'snap.pc'),
  ],
};
