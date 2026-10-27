// debugUnit.js - modelo de la debug unit (debug_unit_fsm/comb/regs.v) a nivel de byte.
//
// La FSM y sus registros se simulan ciclo a ciclo (un tick = un flanco del reloj del sistema),
// con la misma temporización que el RTL (los registros de salida imem_we, step, cpu_rst, reply
// se actualizan un ciclo después, etc.). Lo único que NO se simula es la temporización de bits
// de la UART: rxByte() encola el byte directamente en el FIFO de RX y el FIFO de TX nunca se llena
// (cada byte escrito sale por onTx en el mismo tick). Diferencias respecto del hardware:
//   - El FIFO de RX es ILIMITADO (en el RTL son 4 entradas y el host debe respetar el ritmo).
//   - tx_full es siempre 0.
// Hay un tick = un ciclo de reloj del sistema, así que los bytes se atienden como máximo uno por tick.
import { NOP } from './isa.js';
import { DBG_COUNT } from './pipeline.js';

export const BAUD = 19200;
// Tiempo (ms) que tarda la UART en transmitir n bytes (8N1 = 10 bits por byte).
export const bytesToMs = (n, baud = BAUD) => (n * 10 * 1000) / baud;

const IMEM_BYTES = 1024; // IMEM_ADDR_W = 10
export const STATES = ['IDLE', 'LOAD_LEN_LO', 'LOAD_LEN_HI', 'LOAD_DATA', 'LOAD_FILL', 'REPLY',
  'DUMP_CNT_LO', 'DUMP_CNT_HI', 'DUMP_ADDR', 'DUMP_LATCH', 'DUMP_BYTE'];
const S = Object.fromEntries(STATES.map((n, i) => [n, i]));
const CMD = { L: 0x4c, S: 0x53, R: 0x52, P: 0x50, X: 0x58, D: 0x44 };
const RSP = { K: 0x4b, E: 0x45, H: 0x48, '?': 0x3f };

export class DebugUnit {
  constructor(pipeline) {
    this.pipe = pipeline;
    this.rx = [];            // FIFO de RX (ilimitado)
    this.txCbs = [];
    this.reset();
  }

  // reset del sistema (i_reset)
  reset() {
    Object.assign(this, {
      _st: S.IDLE, _run: 0, _step: 0, _cpuRst: 0, _len: 0, _byteCnt: 0, _overflow: 0, _reply: 0,
      _imemWe: 0, _imemAddr: 0, _imemData: 0, _dbgAddr: 0, _dbgWord: 0, _byteIdx: 0,
    });
    this.rx.length = 0;
  }

  onTx(cb) { this.txCbs.push(cb); }
  rxByte(b) { this.rx.push(b & 0xff); }
  rxBytes(bytes) { for (const b of bytes) this.rxByte(b); }

  get state() { return STATES[this._st]; }
  get run() { return !!this._run; }
  get step() { return !!this._step; }
  get loading() { return this._st >= S.LOAD_LEN_LO && this._st <= S.LOAD_FILL; }
  get dumping() { return this._st >= S.DUMP_CNT_LO && this._st <= S.DUMP_BYTE; }
  get cpuEnable() { return !!((this._run | this._step) && !this.pipe.halted && !this.dumping); }
  get cpuReset() { return !!(this._cpuRst || this.loading); }
  // o_led = {cpu_halt, cpu_reset, cpu_enable}
  get leds() { return { halt: this.pipe.halted, rst: this.cpuReset, en: this.cpuEnable }; }
  get idle() { return this._st === S.IDLE && this.rx.length === 0 && !this._step && !this._cpuRst; }

  _tx(b) { for (const cb of this.txCbs) cb(b); }

  // Avanza n clocks del sistema.
  tick(n = 1) { for (let i = 0; i < n; i++) this._tick1(); }

  // Avanza hasta que la FSM queda en reposo (o max ticks). Devuelve los ticks usados.
  settle(max = 200000) {
    let t = 0;
    while (!this.idle && t < max) { this._tick1(); t++; }
    return t;
  }

  _tick1() {
    const p = this.pipe;
    const st = this._st;
    const halt = p.halted;
    const rxEmpty = this.rx.length === 0;
    const rxb = rxEmpty ? 0 : this.rx[0];
    // ---- combinacional (debug_unit_comb.v)
    const nBytes = (this._len << 2) & 0x3ffff;
    const nBytesRx = ((rxb << 8 | (this._len & 0xff)) << 2) & 0x3ffff;
    const nopByte = (this._byteCnt & 3) === 0 ? 0x13 : 0;
    const lenZero = nBytesRx === 0;
    const loadLast = this._byteCnt === ((nBytes - 1) & 0x3ffff);
    const inRange = this._byteCnt < IMEM_BYTES;
    const dbgLast = this._dbgAddr === DBG_COUNT - 1;
    const byteLast = this._byteIdx === 3;
    // ---- FSM (debug_unit_fsm.v)
    const o = {
      st, run: this._run, step: 0, cpuRst: 0, rxRead: 0, txWrite: 0, lenLo: 0, lenHi: 0, cntClear: 0, cntInc: 0,
      ovfLoad: 0, imemWe: 0, imemLoad: 0, imemFill: 0, replyLoad: 0, reply: RSP.K, addrClear: 0, addrInc: 0,
      wordLoad: 0, wordShift: 0, idxClear: 0, idxInc: 0, sendLo: 0, sendHi: 0, sendWord: 0,
    };
    switch (st) {
      case S.IDLE:
        if (this._run && halt) {
          o.run = 0; o.replyLoad = 1; o.reply = RSP.H; o.st = S.REPLY;
        } else if (!rxEmpty) {
          o.rxRead = 1;
          switch (rxb) {
            case CMD.L: o.run = 0; o.st = S.LOAD_LEN_LO; break;
            case CMD.S:
              o.run = 0; o.replyLoad = 1;
              if (halt) o.reply = RSP.H; else { o.step = 1; o.reply = RSP.K; }
              o.st = S.REPLY; break;
            case CMD.R:
              o.replyLoad = 1;
              if (halt) o.reply = RSP.H; else { o.run = 1; o.reply = RSP.K; }
              o.st = S.REPLY; break;
            case CMD.P: o.run = 0; o.replyLoad = 1; o.reply = RSP.K; o.st = S.REPLY; break;
            case CMD.X: o.run = 0; o.cpuRst = 1; o.replyLoad = 1; o.reply = RSP.K; o.st = S.REPLY; break;
            case CMD.D: o.addrClear = 1; o.st = S.DUMP_CNT_LO; break;
            default: o.replyLoad = 1; o.reply = RSP['?']; o.st = S.REPLY;
          }
        }
        break;
      case S.LOAD_LEN_LO:
        if (!rxEmpty) { o.rxRead = 1; o.lenLo = 1; o.st = S.LOAD_LEN_HI; }
        break;
      case S.LOAD_LEN_HI:
        if (!rxEmpty) {
          o.rxRead = 1; o.lenHi = 1; o.cntClear = 1; o.ovfLoad = 1;
          o.st = lenZero ? S.LOAD_FILL : S.LOAD_DATA;
        }
        break;
      case S.LOAD_DATA:
        if (!rxEmpty) {
          o.rxRead = 1; o.imemWe = inRange ? 1 : 0; o.imemLoad = 1; o.cntInc = 1;
          if (loadLast) o.st = S.LOAD_FILL;
        }
        break;
      case S.LOAD_FILL:
        if (inRange) { o.imemWe = 1; o.imemLoad = 1; o.imemFill = 1; o.cntInc = 1; }
        else { o.replyLoad = 1; o.reply = this._overflow ? RSP.E : RSP.K; o.st = S.REPLY; }
        break;
      case S.REPLY: o.txWrite = 1; o.st = S.IDLE; break; // tx_full = 0 siempre
      case S.DUMP_CNT_LO: o.txWrite = 1; o.sendLo = 1; o.st = S.DUMP_CNT_HI; break;
      case S.DUMP_CNT_HI: o.txWrite = 1; o.sendHi = 1; o.st = S.DUMP_ADDR; break; // count != 0
      case S.DUMP_ADDR: o.st = S.DUMP_LATCH; break;
      case S.DUMP_LATCH: o.wordLoad = 1; o.idxClear = 1; o.st = S.DUMP_BYTE; break;
      case S.DUMP_BYTE:
        o.txWrite = 1; o.sendWord = 1; o.wordShift = 1; o.idxInc = 1;
        if (byteLast) {
          if (dbgLast) o.st = S.IDLE; else { o.addrInc = 1; o.st = S.DUMP_ADDR; }
        }
        break;
      default: o.st = S.IDLE;
    }
    const cpuEnable = this.cpuEnable, cpuReset = this.cpuReset;
    const txData = o.sendLo ? DBG_COUNT & 0xff : o.sendHi ? (DBG_COUNT >> 8) & 0xff
      : o.sendWord ? this._dbgWord & 0xff : this._reply;
    const dbgData = p.dbgRead(this._dbgAddr);

    // ---- flanco de reloj: efectos sobre CPU, FIFOs y registros
    if (this._imemWe) p.imemWriteByte(this._imemAddr, this._imemData);
    p.clock(cpuReset, cpuEnable);
    if (o.rxRead) this.rx.shift();
    if (o.txWrite) this._tx(txData);
    // registros (debug_unit_regs.v)
    this._st = o.st;
    this._run = o.run;
    this._step = o.step;
    this._cpuRst = o.cpuRst;
    this._len = (o.lenHi ? rxb : this._len >> 8) << 8 | (o.lenLo ? rxb : this._len & 0xff);
    const cnt0 = this._byteCnt; // valor registrado antes del flanco
    this._byteCnt = o.cntClear ? 0 : o.cntInc ? (this._byteCnt + 1) & 0x3ffff : this._byteCnt;
    if (o.ovfLoad) this._overflow = nBytesRx > IMEM_BYTES ? 1 : 0;
    if (o.replyLoad) this._reply = o.reply;
    this._imemWe = o.imemWe;
    if (o.imemLoad) this._imemAddr = cnt0 & (IMEM_BYTES - 1);
    if (o.imemLoad) this._imemData = o.imemFill ? nopByte : rxb;
    this._dbgAddr = o.addrClear ? 0 : o.addrInc ? (this._dbgAddr + 1) & 0xffff : this._dbgAddr;
    this._dbgWord = o.wordLoad ? dbgData : o.wordShift ? this._dbgWord >>> 8 : this._dbgWord;
    this._byteIdx = o.idxClear ? 0 : o.idxInc ? (this._byteIdx + 1) & 3 : this._byteIdx;
  }
}

// ---------------------------------------------------------------- helpers de protocolo
// Trama de carga: 'L', n (16 bits LE) y cada palabra en little-endian. Devuelve Uint8Array.
export function encodeLoad(words) {
  const n = words.length;
  if (n > 0xffff) throw new Error('el programa supera las 65535 instrucciones');
  const out = new Uint8Array(3 + 4 * n);
  out[0] = CMD.L; out[1] = n & 0xff; out[2] = (n >> 8) & 0xff;
  for (let i = 0; i < n; i++) {
    const w = words[i] >>> 0;
    out[3 + 4 * i] = w & 0xff; out[4 + 4 * i] = (w >>> 8) & 0xff;
    out[5 + 4 * i] = (w >>> 16) & 0xff; out[6 + 4 * i] = w >>> 24;
  }
  return out;
}

// Bytes LE -> palabras de 32 bits.
export function decodeWords(bytes) {
  const out = [];
  for (let i = 0; i + 3 < bytes.length; i += 4) {
    out.push((bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16 | bytes[i + 3] << 24) >>> 0);
  }
  return out;
}

const WB_SEL_N = ['alu', 'mem', 'pc+4', 'imm'];
const ALU_N = ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'nor'];
const FWD_N = ['reg', 'wb', 'mem', '?'];

// Igual que decode_dump de debug_protocol.py. Acepta:
//  - un array/Uint32Array de palabras, o
//  - un Uint8Array de bytes: la respuesta completa del comando D (count_lo count_hi + palabras LE)
//    o solamente los bytes de las palabras.
export function decodeDump(x) {
  let w;
  if (x instanceof Uint8Array) {
    let bytes = x;
    if (bytes.length >= 2 && bytes.length === 2 + 4 * (bytes[0] | bytes[1] << 8)) bytes = bytes.slice(2);
    w = decodeWords(bytes);
  } else w = Array.from(x, (v) => v >>> 0);
  if (w.length < 54) throw new Error(`dump de ${w.length} palabras: se esperaban al menos 54`);
  const c = w[3], f = w[4], fl = w[13];
  const bit = (v, i) => (v >>> i) & 1;
  return {
    pc: w[0],
    if_id: { pc: w[1], inst: w[2] },
    id_ex: {
      reg_write: bit(c, 0), mem_read: bit(c, 1), mem_write: bit(c, 2), branch: bit(c, 3), jump: bit(c, 4),
      is_jalr: bit(c, 5), is_auipc: bit(c, 6), halt: bit(c, 7), alu_src: bit(c, 8),
      wb_sel: WB_SEL_N[(c >>> 9) & 3], alu_op: ALU_N[(c >>> 11) & 15] ?? '?',
      rs1: f & 31, rs2: (f >>> 5) & 31, rd: (f >>> 10) & 31, funct3: (f >>> 15) & 7,
      pc: w[5], rdata1: w[6], rdata2: w[7], imm: w[8],
    },
    ex: {
      alu_a: w[9], alu_b: w[10], alu_out: w[11], target: w[12],
      stall: bit(fl, 0), flush_if_id: bit(fl, 1), flush_id_ex: bit(fl, 2), redirect: bit(fl, 3),
      taken: bit(fl, 4), zero: bit(fl, 5), overflow: bit(fl, 6), halting: bit(fl, 7),
      fwd_a: FWD_N[(fl >>> 8) & 3], fwd_b: FWD_N[(fl >>> 10) & 3],
    },
    ex_mem: {
      reg_write: bit(w[14], 0), mem_read: bit(w[14], 1), mem_write: bit(w[14], 2), halt: bit(w[14], 3),
      wb_sel: WB_SEL_N[(w[14] >>> 4) & 3], alu_out: w[15], rdata2: w[16], rd: w[17] & 31,
      funct3: (w[17] >>> 5) & 7, dmem_rdata: w[18],
    },
    mem_wb: { reg_write: bit(w[19], 0), halt: bit(w[19], 1), result: w[20], rd: w[21] & 31 },
    regs: w.slice(22, 54),
    dmem: w.slice(54),
  };
}
