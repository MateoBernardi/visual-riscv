import { describe, it, expect } from 'vitest';
import { UartRx, UartTx, frameBits, simulateByte, N_TICKS } from '../src/sim/uart.js';

function runTx(byte) {
  const tx = new UartTx();
  const line = [];
  let dones = 0;
  tx.tick(1, true, byte); line.push(tx.tx);   // flanco con tx_ready -> START
  for (let i = 0; i < 12 * N_TICKS; i++) { const r = tx.tick(1, false, 0); if (r.done) dones++; line.push(tx.tx); }
  return { line, dones, tx };
}

describe('uart', () => {
  it('frameBits: start, LSB primero, stop', () => {
    expect(frameBits(0x4c)).toEqual([0, 0, 0, 1, 1, 0, 0, 1, 0, 1]);
  });

  it('TX 0x4C: trama correcta, 16 ticks por bit', () => {
    const { line, dones } = runTx(0x4c);
    // la línea es registrada: pasa a 0 un flanco después de cargar (IDLE->START), luego 16 ticks por bit
    const first0 = line.indexOf(0);
    expect(first0).toBeGreaterThan(-1);
    const bits = frameBits(0x4c);
    bits.forEach((b, i) => {
      for (let k = 0; k < N_TICKS; k++) expect(line[first0 + i * N_TICKS + k], `bit ${i} tick ${k}`).toBe(b);
    });
    expect(line[first0 + 10 * N_TICKS]).toBe(1);
    expect(dones).toBe(1);
  });

  it('RX alimentado por TX recupera 0x4C con rx_done una vez', () => {
    const trace = simulateByte(0x4c);
    const dones = trace.filter((x) => x.rxDone);
    expect(dones.length).toBe(1);
    expect(dones[0].rxByte).toBe(0x4c);
    for (const b of [0x00, 0xff, 0xa5, 0x01, 0x80]) {
      const d = simulateByte(b).filter((x) => x.rxDone);
      expect(d.length).toBe(1);
      expect(d[0].rxByte).toBe(b);
    }
  });

  it('RX muestrea a mitad del start (s==7) y luego cada 16 ticks', () => {
    const rx = new UartRx();
    const bits = frameBits(0x4c);
    const samples = [];
    const states = [];
    // línea idle, luego la trama con 16 ticks por bit
    rx.tick(1, true);
    const line = bits.flatMap((b) => Array(N_TICKS).fill(b));
    let prevN = rx.n, prevState = rx.state, startT = null;
    line.forEach((lv, t) => {
      const before = { st: rx.state, s: rx.s };
      rx.tick(lv, true);
      if (before.st === 'START' && rx.state === 'DATA') states.push({ t, s: before.s });
      if (before.st === 'DATA' && before.s === 15) samples.push(t);
      void prevN; void prevState; void startT;
    });
    expect(states).toHaveLength(1);
    expect(states[0].s).toBe(7);                    // transición START->DATA con s==7
    // la primera muestra de datos cae 16 ticks después de salir de START
    expect(samples[1] - samples[0]).toBe(N_TICKS);
    expect(samples).toHaveLength(8);
    // t=0 detecta el start (IDLE->START), START dura 8 ticks (s=0..7), cada bit de dato 16 ticks
    expect(samples[0]).toBe(states[0].t + N_TICKS);
    expect(states[0].t).toBe(8);
  });

  it('STOP debe ser 1 para rx_done', () => {
    const rx = new UartRx();
    const bits = frameBits(0x4c);
    bits[9] = 0;                                    // stop erróneo
    let dones = 0;
    for (const b of [1, ...bits.flatMap((x) => Array(N_TICKS).fill(x)), 1, 1]) { if (rx.tick(b, true).done) dones++; }
    expect(dones).toBe(0);
    // el RTL vuelve a IDLE aunque el stop sea 0 (y la línea baja re-dispara un start): sólo no hay rx_done
  });

  it('sin baud tick no avanza (salvo detectar el start en IDLE)', () => {
    const rx = new UartRx();
    rx.tick(0, false);
    expect(rx.state).toBe('START');
    for (let i = 0; i < 50; i++) rx.tick(0, false);
    expect(rx.state).toBe('START');
    expect(rx.s).toBe(0);
  });
});
