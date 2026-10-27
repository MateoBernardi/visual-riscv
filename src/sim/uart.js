// Modelo bit a bit de uart_rx / uart_tx (RTL: uart/uart_{rx,tx}_{fsm,comb,regs}.v), N_TICKS = 16, NB_DATA = 8.
// Cada llamada a tick() equivale a un flanco de clk: se calcula lo combinacional (fsm + comb) con los
// registros actuales y después se actualizan los registros (regs), igual que en el RTL.
export const N_TICKS = 16;
export const NB_DATA = 8;
export const UART_STATES = ['IDLE', 'START', 'DATA', 'STOP'];
const IDLE = 0, START = 1, DATA = 2, STOP = 3;
const S_MASK = N_TICKS - 1;
const N_MASK = NB_DATA - 1;

export class UartRx {
  constructor() { this.reset(); }
  reset() { this._state = IDLE; this._s = 0; this._n = 0; this._byte = 0; }
  get state() { return UART_STATES[this._state]; }
  get stateCode() { return this._state; }
  get s() { return this._s; }
  get n() { return this._n; }
  get byte() { return this._byte; }
  // rxLevel: 0/1 (línea ya sincronizada); baudTick: 0/1 (i_tick de baud_rate_gen)
  tick(rxLevel, baudTick) {
    const rx = rxLevel ? 1 : 0, tk = baudTick ? 1 : 0;
    const sHalf = this._s === N_TICKS / 2 - 1, sLast = this._s === N_TICKS - 1, nLast = this._n === NB_DATA - 1;
    let next = this._state, sClear = 0, sInc = 0, nClear = 0, nInc = 0, shift = 0, done = 0;
    switch (this._state) {
      case IDLE: if (!rx) { next = START; sClear = 1; } break;
      case START:
        if (tk) { if (sHalf) { next = DATA; sClear = 1; nClear = 1; } else sInc = 1; }
        break;
      case DATA:
        if (tk) {
          if (sLast) { sClear = 1; shift = 1; if (nLast) next = STOP; else nInc = 1; } else sInc = 1;
        }
        break;
      case STOP:
        if (tk) { if (sLast) { next = IDLE; done = rx; } else sInc = 1; }
        break;
      default: next = IDLE;
    }
    const out = { done: !!done, byte: this._byte };   // o_dout es el registro (el último bit ya se desplazó)
    this._s = sClear ? 0 : sInc ? (this._s + 1) & S_MASK : this._s;
    this._n = nClear ? 0 : nInc ? (this._n + 1) & N_MASK : this._n;
    if (shift) this._byte = ((rx << (NB_DATA - 1)) | (this._byte >> 1)) & 0xff;
    this._state = next;
    return out;
  }
}

export class UartTx {
  constructor() { this.reset(); }
  reset() { this._state = IDLE; this._s = 0; this._n = 0; this._byte = 0; this._tx = 1; }
  get state() { return UART_STATES[this._state]; }
  get stateCode() { return this._state; }
  get s() { return this._s; }
  get n() { return this._n; }
  get byte() { return this._byte; }
  get tx() { return this._tx; }
  tick(baudTick, txReady, din) {
    const tk = baudTick ? 1 : 0;
    const sLast = this._s === N_TICKS - 1, nLast = this._n === NB_DATA - 1;
    let next = this._state, sClear = 0, sInc = 0, nClear = 0, nInc = 0, load = 0, shift = 0, txData = 0, txLevel = 1, done = 0;
    switch (this._state) {
      case IDLE: txLevel = 1; if (txReady) { next = START; sClear = 1; load = 1; } break;
      case START:
        txLevel = 0;
        if (tk) { if (sLast) { next = DATA; sClear = 1; nClear = 1; } else sInc = 1; }
        break;
      case DATA:
        txData = 1;
        if (tk) {
          if (sLast) { sClear = 1; shift = 1; if (nLast) next = STOP; else nInc = 1; } else sInc = 1;
        }
        break;
      case STOP:
        txLevel = 1;
        if (tk) { if (sLast) { next = IDLE; done = 1; } else sInc = 1; }
        break;
      default: next = IDLE;
    }
    const txNext = txData ? this._byte & 1 : txLevel;
    const byteNext = load ? (din & 0xff) : shift ? this._byte >> 1 : this._byte;
    this._s = sClear ? 0 : sInc ? (this._s + 1) & S_MASK : this._s;
    this._n = nClear ? 0 : nInc ? (this._n + 1) & N_MASK : this._n;
    this._byte = byteNext;
    this._tx = txNext;
    this._state = next;
    return { done: !!done };
  }
}

// start (0), 8 bits LSB primero, stop (1)
export function frameBits(byte) {
  const out = [0];
  for (let i = 0; i < NB_DATA; i++) out.push((byte >> i) & 1);
  out.push(1);
  return out;
}

/**
 * Transmite `byte` con un UartTx cuya línea alimenta un UartRx, un flanco de clk por baud tick
 * (i_tick = 1 en todos). Traza [{t, tx, rxState, txState, s, n, rxS, rxN, rxDone, rxByte}]:
 * el estado mostrado es el de DESPUÉS del flanco t; tx es el nivel de la línea en ese instante.
 */
export function simulateByte(byte, { extra = 4 } = {}) {
  const tx = new UartTx(), rx = new UartRx();
  const trace = [];
  const max = (NB_DATA + 3) * N_TICKS + 8;
  let tail = 0;
  for (let t = 0; t < max; t++) {
    const line = tx.tx;                       // lo que ve el rx en este flanco
    tx.tick(1, t === 0, byte & 0xff);
    const r = rx.tick(line, 1);
    trace.push({ t, tx: tx.tx, rxState: rx.state, txState: tx.state, s: tx.s, n: tx.n, rxS: rx.s, rxN: rx.n, rxDone: r.done, rxByte: r.done ? r.byte : null });
    if (t > 0 && tx.state === 'IDLE' && rx.state === 'IDLE') { if (++tail > extra) break; }
  }
  return trace;
}
