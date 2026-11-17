import { githubUrl } from '../repo.js';

const F = 'pipeline/riscv_pipeline.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: o.symbol ?? id, at, size, desc,
  ...(o.drill ? { drill: o.drill } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'wb_mux',
  module: 'riscv_pipeline',
  file: F,
  pseudo: true,
  instance: null,
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu',
  blockIds: ['wbMux'],
  title: 'Selección de resultado (wb_sel) y escritura',
  stage: 'MEM',
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>Una instrucción que escribe un registro entrega un valor, pero sale de lugares distintos: la ALU (aritmética), la memoria (loads), PC+4 (JAL/JALR) o el inmediato (LUI). Un mux de cuatro entradas elige, con un selector que decide el control en ID y viaja con la instrucción.</p>`,
    inThisProject: `
      <ul>
        <li><code>wb_sel</code>: <code>00</code> ALU, <code>01</code> dmem, <code>10</code> PC+4, <code>11</code> inmediato.</li>
        <li>El mux está en MEM: ${g('mem_result')} va a ${g('u_mem_wb')} y, salvo el dato de la dmem, también al forwarding (<code>mem_fwd</code>).</li>
      </ul>`,
    whyThisChoice: `
      <p>Elegir en MEM deja MEM/WB angosto y hace que el forwarding use un valor ya resuelto, sin un mux propio en EX. El costo es que un load atraviesa la dmem y este mux dentro de la misma etapa. Por eso la entrada de la dmem no se reenvía desde MEM: así sale del camino crítico.</p>`,
  },
  refs: [
    { label: 'mem_result_r', sym: 'mem_result_r' },
    { label: 'mem_result', sym: 'mem_result' },
    { label: 'u_mem_wb', sym: 'inst:u_mem_wb' },
    { label: 'u_rf', sym: 'inst:u_rf' },
    { label: 'wb_result', sym: 'wb_result' },
  ],
  grid: [10, 5],
  ports: [
    { name: 'mem_alu_out', dir: 'in', width: 32, side: 'l', ext: 'exmem', desc: 'Resultado de la ALU de la instrucción en MEM. Entrada "00".' },
    { name: 'mem_rdata', dir: 'in', width: 32, side: 'l', ext: 'dmem', desc: 'Dato leído de la dmem ya extendido. Entrada "01".' },
    { name: 'mem_pc4', dir: 'in', width: 32, side: 'l', ext: 'exmem', desc: 'PC+4 de la instrucción (calculado en ID). Entrada "10".' },
    { name: 'mem_imm', dir: 'in', width: 32, side: 'l', ext: 'exmem', desc: 'Inmediato (para LUI). Entrada "11".' },
    { name: 'mem_wb_sel', dir: 'in', width: 2, side: 't', ext: 'exmem', desc: 'Selector del mux, decodificado en ID como <code>wb_sel</code>.' },
    { name: 'mem_rd', dir: 'in', width: 5, side: 'b', ext: 'exmem', desc: 'Registro destino que acompaña al resultado.' },
    { name: 'mem_reg_write', dir: 'in', width: 1, side: 'b', ext: 'exmem', desc: 'Indica si la instrucción en MEM escribe un registro.' },
    { name: 'mem_result', dir: 'out', width: 32, side: 't', ext: 'fwdMuxA / fwdMuxB', desc: 'Resultado elegido en MEM; también vuelve a EX como forwarding "10".' },
    { name: 'wb_result', dir: 'out', width: 32, side: 'r', ext: 'fwdMuxA / fwdMuxB', desc: 'Resultado registrado en MEM/WB: se escribe al regfile y es el forwarding "01".' },
  ],
  parts: [
    P('mem_result_r', 'mux', 'mem_result', 32, [2, 0], [2, 4], 'Mux 4:1 por <code>mem_wb_sel</code>: ALU, dmem, PC+4, inmediato. Se escribe como <code>case</code> dentro de un <code>always @(*)</code> y se asigna a <code>mem_result</code>.', { live: 'snap.signals.memResult' }),
    P('u_mem_wb', 'submodule', 'mem_wb_reg', 39, [5, 1], [2, 2], 'Registro MEM/WB: separa MEM de WB. Guarda el resultado final, rd, reg_write y halt.', { drill: 'mem_wb_reg', live: 'snap.latches.memwb.result' }),
    P('u_rf', 'submodule', 'regfile (puerto de escritura)', 32, [8, 1], [2, 2], 'Banco de registros: recibe <code>wb_result</code>, <code>wb_rd</code> y <code>wb_reg_write &amp; en</code>. Escribe en el flanco; ignora x0.', { drill: 'regfile' }),
  ],
  nets: [
    N('n_mem_alu_out', 'port:mem_alu_out', 'mem_result_r', 'mem_alu_out', 32, 'Viene de EX/MEM: es el resultado aritmético, y también la dirección de memoria si la instrucción es load/store.', 'snap.latches.exmem.alu_out'),
    N('n_mem_rdata', 'port:mem_rdata', 'mem_result_r', 'mem_rdata', 32, 'Sale de la dmem (lectura asincrónica con extensión). Solo se elige cuando <code>wb_sel = 01</code>, es decir, en loads.', 'snap.signals.memRData'),
    N('n_mem_pc4', 'port:mem_pc4', 'mem_result_r', 'mem_pc4', 32, 'PC+4 que viajó desde ID. JAL y JALR lo guardan en rd como dirección de retorno.', 'snap.latches.exmem.pc4'),
    N('n_mem_imm', 'port:mem_imm', 'mem_result_r', 'mem_imm', 32, 'Inmediato U que viajó desde ID. LUI no usa la ALU: el valor sale directo de acá.', 'snap.latches.exmem.imm'),
    N('n_mem_wb_sel', 'port:mem_wb_sel', 'mem_result_r', 'mem_wb_sel', 2, 'Selector 00/01/10/11 que decodificó control en ID.', 'snap.latches.exmem.wb_sel'),
    N('n_mem_result', 'mem_result_r', 'u_mem_wb', 'mem_result', 32, 'Valor ya elegido que se captura en MEM/WB. WB recibe un solo campo de datos.', 'snap.signals.memResult'),
    N('n_mem_result_out', 'mem_result_r', 'port:mem_result', 'mem_result', 32, 'El mismo valor sale hacia los muxes de forwarding de EX: el resultado está disponible un ciclo antes de escribirse en el regfile.', 'snap.signals.memResult'),
    N('n_mem_rd', 'port:mem_rd', 'u_mem_wb', 'mem_rd', 5, 'Destino que viaja junto con el resultado.', 'snap.latches.exmem.rd'),
    N('n_mem_reg_write', 'port:mem_reg_write', 'u_mem_wb', 'mem_reg_write', 1, 'Marca si hay que escribir un registro. Una burbuja tiene 0.', 'snap.latches.exmem.reg_write'),
    N('n_wb_result', 'u_mem_wb', 'u_rf', 'wb_result', 32, 'Salida de MEM/WB: <code>wdata</code> del regfile.', 'snap.signals.wbData'),
    N('n_wb_rd', 'u_mem_wb', 'u_rf', 'wb_rd', 5, 'Dirección de escritura <code>waddr</code>. Si es 0, el regfile ignora la escritura.', 'snap.signals.wbRd'),
    N('n_wb_reg_write', 'u_mem_wb', 'u_rf', 'wb_reg_write', 1, 'Con <code>en</code> forma el <code>we</code> del regfile.', 'snap.signals.regWrite'),
    N('n_wb_result_out', 'u_mem_wb', 'port:wb_result', 'wb_result', 32, 'El mismo resultado también va a los muxes de forwarding como fuente "01".', 'snap.signals.wbData'),
  ],
};
