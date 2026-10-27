// Esquemas de ejemplo SOLO para el arnés de dev (los reales los escriben los agentes de contenido).
// Fieles a alu.v (alu_tp1) y debug/debug_unit.v.

const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });
const N = (id, from, to, name, width, live, desc = '') => ({ id, from, to, name, width, live, desc });

export const ALU = {
  id: 'alu_tp1', module: 'alu_tp1', file: 'pipeline/3_execute/alu.v', instance: 'u_alu', parent: 'riscv_pipeline',
  blockIds: ['alu'], title: 'ALU', stage: 'EX', kind: 'comb', grid: [10, 6],
  explain: { firstPrinciples: '', inThisProject: '', whyThisChoice: '' }, refs: [],
  ports: [
    P('i_data_a', 'in', 32, 'l', 'fwdMuxA', 'Operando A'), P('i_data_b', 'in', 32, 'l', 'aluSrcMux', 'Operando B'),
    P('i_data_op', 'in', 4, 't', 'idex', 'Código de operación'),
    P('o_data', 'out', 32, 'r', 'exmem', 'Resultado'), P('o_z', 'out', 1, 'r', 'branch', 'Resultado == 0'), P('o_o', 'out', 1, 'r', 'flow_ctrl', 'Overflow'),
    P('o_lt', 'out', 1, 'b', 'branch', 'a < b con signo'), P('o_ltu', 'out', 1, 'b', 'branch', 'a < b sin signo'),
  ],
  parts: [
    { id: 'shamt', kind: 'logic', label: 'shamt', width: 5, symbol: 'shamt', at: [1, 2], size: [1, 1], desc: 'i_data_b[4:0]: solo cuentan los 5 bits bajos', live: 'snap.signals.aluB' },
    { id: 'addsub', kind: 'adder', label: 'ADD / SUB', width: 32, at: [3, 0], size: [2, 1], desc: 'a + b y a - b', live: 'snap.signals.aluOut' },
    { id: 'bitwise', kind: 'logic', label: 'AND OR XOR NOR', width: 32, at: [3, 1], size: [2, 1], desc: 'Lógica bit a bit' },
    { id: 'shifter', kind: 'logic', label: 'SLL SRL SRA', width: 32, at: [3, 2], size: [2, 1], desc: 'Desplazador por shamt' },
    { id: 'cmp_lt', kind: 'cmp', label: 'a < b', width: 1, symbol: 'o_lt', at: [3, 3], size: [2, 1], desc: 'Comparación con signo', live: 'snap.signals.lt' },
    { id: 'cmp_ltu', kind: 'cmp', label: 'a <u b', width: 1, symbol: 'o_ltu', at: [3, 4], size: [2, 1], desc: 'Comparación sin signo', live: 'snap.signals.ltu' },
    { id: 'opmux', kind: 'mux', label: 'case i_data_op', width: 32, symbol: 'alu_result', at: [6, 0], size: [1, 5], desc: 'Selecciona el resultado según i_data_op', live: 'snap.signals.aluOp' },
    { id: 'zero', kind: 'cmp', label: '== 0', width: 1, at: [8, 1], size: [1, 1], desc: 'o_z = (alu_result == 0)', live: 'snap.signals.zero' },
    { id: 'ovf', kind: 'logic', label: 'overflow', width: 1, at: [7, 5], size: [2, 1], desc: 'Solo en ADD/SUB: signos de a, b y resultado' },
  ],
  nets: [
    N('a_add', 'port:i_data_a', 'addsub', 'i_data_a', 32, 'snap.signals.aluA'), N('a_bit', 'port:i_data_a', 'bitwise', 'i_data_a', 32),
    N('a_shf', 'port:i_data_a', 'shifter', 'i_data_a', 32), N('a_lt', 'port:i_data_a', 'cmp_lt', 'i_data_a', 32), N('a_ltu', 'port:i_data_a', 'cmp_ltu', 'i_data_a', 32),
    N('b_add', 'port:i_data_b', 'addsub', 'i_data_b', 32, 'snap.signals.aluB'), N('b_bit', 'port:i_data_b', 'bitwise', 'i_data_b', 32),
    N('b_sh', 'port:i_data_b', 'shamt', 'i_data_b', 32), N('b_lt', 'port:i_data_b', 'cmp_lt', 'i_data_b', 32), N('b_ltu', 'port:i_data_b', 'cmp_ltu', 'i_data_b', 32),
    N('sh_sh', 'shamt', 'shifter', 'shamt', 5),
    N('add_mux', 'addsub', 'opmux', 'alu_result', 32), N('bit_mux', 'bitwise', 'opmux', 'alu_result', 32), N('shf_mux', 'shifter', 'opmux', 'alu_result', 32),
    N('lt_mux', 'cmp_lt', 'opmux', 'o_lt', 1, 'snap.signals.lt'), N('ltu_mux', 'cmp_ltu', 'opmux', 'o_ltu', 1, 'snap.signals.ltu'),
    N('lt_out', 'cmp_lt', 'port:o_lt', 'o_lt', 1, 'snap.signals.lt'), N('ltu_out', 'cmp_ltu', 'port:o_ltu', 'o_ltu', 1, 'snap.signals.ltu'),
    N('op_mux', 'port:i_data_op', 'opmux', 'i_data_op', 4, 'snap.signals.aluOp'),
    N('res_out', 'opmux', 'port:o_data', 'o_data', 32, 'snap.signals.aluOut'), N('res_zero', 'opmux', 'zero', 'alu_result', 32),
    N('zero_out', 'zero', 'port:o_z', 'o_z', 1, 'snap.signals.zero'),
    N('res_ovf', 'opmux', 'ovf', 'alu_result', 32), N('ovf_out', 'ovf', 'port:o_o', 'o_o', 1),
  ],
};

const FSM_STATES = ['IDLE', 'LOAD_LEN_LO', 'LOAD_LEN_HI', 'LOAD_DATA', 'LOAD_FILL', 'REPLY', 'DUMP_CNT_LO', 'DUMP_CNT_HI', 'DUMP_ADDR', 'DUMP_LATCH', 'DUMP_BYTE'];

export const DEBUG = {
  id: 'debug_unit', module: 'debug_unit', file: 'debug/debug_unit.v', instance: 'u_debug', parent: 'top_riscv',
  blockIds: ['debug'], title: 'Debug Unit', stage: null, kind: 'struct', grid: [10, 5],
  explain: { firstPrinciples: '', inThisProject: '', whyThisChoice: '' }, refs: [],
  ports: [
    P('i_data_to_read', 'in', 8, 'l', 'uart', 'Byte de la FIFO RX'), P('i_fifo_rx_empty', 'in', 1, 'l', 'uart', ''), P('i_fifo_tx_full', 'in', 1, 'l', 'uart', ''),
    P('o_fifo_rx_read', 'out', 1, 'l', 'uart', ''), P('o_fifo_tx_write', 'out', 1, 'l', 'uart', ''), P('o_data_to_write', 'out', 8, 'l', 'uart', ''),
    P('i_reset', 'in', 1, 't', 'reset_gen', ''), P('i_cpu_halt', 'in', 1, 't', 'flush', ''),
    P('o_cpu_enable', 'out', 1, 'r', 'pc', ''), P('o_cpu_reset', 'out', 1, 'r', 'pc', ''),
    P('o_imem_write_enable', 'out', 1, 'r', 'imem', ''), P('o_imem_write_addr', 'out', 8, 'r', 'imem', ''), P('o_imem_write_data', 'out', 8, 'r', 'imem', ''),
    P('i_dbg_data', 'in', 32, 'b', 'regfile', ''), P('i_dbg_count', 'in', 16, 'b', 'regfile', ''), P('o_dbg_addr', 'out', 16, 'b', 'regfile', ''),
  ],
  parts: [
    { id: 'FSM', kind: 'fsm', label: 'FSM', width: 4, symbol: 'FSM', at: [1, 1], size: [2, 3], desc: 'debug_unit_fsm: decide el próximo estado y las salidas de control', live: 'dbg.stateCode' },
    { id: 'COMB', kind: 'submodule', label: 'COMB', symbol: 'COMB', at: [4, 1], size: [2, 3], desc: 'debug_unit_comb: camino de datos', drill: 'debug_unit_comb' },
    { id: 'REGS', kind: 'submodule', label: 'REGS', symbol: 'REGS', at: [7, 1], size: [2, 3], desc: 'debug_unit_regs: registros', drill: 'debug_unit_regs' },
  ],
  nets: [
    N('rx_fsm', 'port:i_data_to_read', 'FSM', 'i_data_to_read', 8), N('rxe_fsm', 'port:i_fifo_rx_empty', 'FSM', 'i_fifo_rx_empty', 1), N('txf_fsm', 'port:i_fifo_tx_full', 'FSM', 'i_fifo_tx_full', 1),
    N('rd_out', 'FSM', 'port:o_fifo_rx_read', 'o_fifo_rx_read', 1), N('wr_out', 'FSM', 'port:o_fifo_tx_write', 'o_fifo_tx_write', 1),
    N('tx_out', 'COMB', 'port:o_data_to_write', 'o_data_to_write', 8),
    N('rst_fsm', 'port:i_reset', 'FSM', 'i_reset', 1), N('halt_fsm', 'port:i_cpu_halt', 'FSM', 'i_cpu_halt', 1),
    N('ctl', 'FSM', 'COMB', 'imem_load', 1, 'dbg.loading'), N('rcode', 'FSM', 'COMB', 'reply_code', 8), N('wload', 'FSM', 'COMB', 'word_load', 1, 'dbg.dumping'),
    N('lz', 'COMB', 'FSM', 'len_zero', 1), N('ll', 'COMB', 'FSM', 'load_last', 1), N('bl', 'COMB', 'FSM', 'byte_last', 1),
    N('st_n', 'FSM', 'REGS', 'state_next', 4, 'dbg.stateCode'), N('run_n', 'FSM', 'REGS', 'run_next', 1, 'dbg.run'),
    N('st', 'REGS', 'FSM', 'state', 4, 'dbg.stateCode'),
    N('len_n', 'COMB', 'REGS', 'len_next', 16), N('dw_n', 'COMB', 'REGS', 'dbg_word_next', 32),
    N('len', 'REGS', 'COMB', 'len', 16), N('dw', 'REGS', 'COMB', 'dbg_word', 32),
    N('en_out', 'FSM', 'port:o_cpu_enable', 'o_cpu_enable', 1, 'dbg.cpuEnable'), N('cr_out', 'FSM', 'port:o_cpu_reset', 'o_cpu_reset', 1, 'dbg.cpuReset'),
    N('we_out', 'REGS', 'port:o_imem_write_enable', 'o_imem_write_enable', 1), N('wa_out', 'REGS', 'port:o_imem_write_addr', 'o_imem_write_addr', 8), N('wd_out', 'REGS', 'port:o_imem_write_data', 'o_imem_write_data', 8),
    N('dd_in', 'port:i_dbg_data', 'COMB', 'i_dbg_data', 32), N('dc_in', 'port:i_dbg_count', 'COMB', 'i_dbg_count', 16), N('da_out', 'REGS', 'port:o_dbg_addr', 'o_dbg_addr', 16),
  ],
  fsm: {
    stateSymbol: 'state', file: 'debug/debug_unit_fsm.v', live: 'dbg.state',
    states: FSM_STATES.map((name, code) => ({ name, code, desc: '', outputs: [] })), transitions: [], explain: '',
  },
};
