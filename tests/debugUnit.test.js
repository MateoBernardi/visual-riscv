import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { Pipeline, DebugUnit, encodeLoad, decodeDump, decodeWords, BAUD, bytesToMs } from '../src/sim/index.js';

const SIM = '/home/mateo/facu/arquitectura-de-computadoras/project_4/project_4.srcs/sim_1/new/';
const hexWords = (f) => fs.readFileSync(SIM + f, 'utf8').trim().split(/\s+/).map((h) => parseInt(h, 16));
const PROG = hexWords('pipeline_prog.hex');
const EXP = hexWords('pipeline_exp.hex');
const ch = (c) => c.charCodeAt(0);

let pipe, du, tx;
beforeEach(() => {
  pipe = new Pipeline();
  du = new DebugUnit(pipe);
  tx = [];
  du.onTx((b) => tx.push(b));
});

const send = (bytes) => { du.rxBytes(bytes); du.settle(); };
const cmd = (c) => send([ch(c)]);
const take = () => { const r = tx.slice(); tx.length = 0; return r; };
const takeStr = () => String.fromCharCode(...take());
const dump = () => {
  cmd('D');
  const bytes = Uint8Array.from(take());
  const count = bytes[0] | bytes[1] << 8;
  expect(bytes.length).toBe(2 + 4 * count);
  return { count, words: decodeWords(bytes.slice(2)), bytes };
};
// ejecuta ticks hasta que llegue un byte (o se agota el límite)
const runUntilTx = (limit = 5000) => { for (let i = 0; i < limit && tx.length === 0; i++) du.tick(); };

describe('debug unit (secuencia de tb_top_riscv.v)', () => {
  it('L -> K, D (86 palabras, pc 0), S, R -> K + H espontáneo, S -> H, X -> K, run otra vez', () => {
    send(encodeLoad(PROG));
    expect(takeStr()).toBe('K');
    expect(Array.from(pipe.imem.slice(0, 47))).toEqual(PROG);
    expect(pipe.imem[47]).toBe(0x13);
    expect(pipe.imem[255]).toBe(0x13);

    let d = dump();
    expect(d.count).toBe(86);
    expect(d.words[0]).toBe(0);

    cmd('S'); expect(takeStr()).toBe('K');
    expect(dump().words[0]).toBe(4);
    cmd('S'); cmd('S'); expect(takeStr()).toBe('KK');
    expect(dump().words[0]).toBe(0xc);

    cmd('R');
    expect(takeStr()).toBe('K');
    expect(du.leds.en).toBe(true);
    runUntilTx();
    expect(takeStr()).toBe('H');
    du.tick(5);
    expect(du.leds).toEqual({ halt: true, rst: false, en: false });
    expect(du.run).toBe(false);
    d = dump();
    expect(d.words.slice(22, 54)).toEqual(EXP.slice(0, 32));
    expect(d.words.slice(54, 70)).toEqual(EXP.slice(32, 48));
    expect(d.words[0]).toBe(0xb8);
    const dd = decodeDump(d.words);
    expect(dd.regs[3]).toBe(15);
    expect(decodeDump(d.bytes).pc).toBe(0xb8); // también acepta la respuesta cruda

    cmd('S'); expect(takeStr()).toBe('H');

    cmd('X'); expect(takeStr()).toBe('K');
    d = dump();
    expect(d.words[0]).toBe(0);
    expect(d.words.slice(22, 54).every((v) => v === 0)).toBe(true);
    expect(d.words[54]).toBe(0xf); // la dmem no se borra
    expect(Array.from(pipe.imem.slice(0, 47))).toEqual(PROG);
    cmd('R'); expect(takeStr()).toBe('K');
    runUntilTx(); expect(takeStr()).toBe('H');
    expect(dump().words.slice(22, 54)).toEqual(EXP.slice(0, 32));
  });

  it('el CPU queda en reset mientras se carga', () => {
    du.rxBytes(encodeLoad(PROG).slice(0, 20));
    du.tick(30);
    expect(du.state).toBe('LOAD_DATA');
    expect(du.leds.rst).toBe(true);
    du.rxBytes(encodeLoad(PROG).slice(20));
    du.settle();
    expect(du.leds.rst).toBe(false);
    expect(takeStr()).toBe('K');
  });

  it('pausa en ejecución continua (lazo infinito jal x0,0)', () => {
    send(encodeLoad([0x0000006f]));
    expect(takeStr()).toBe('K');
    cmd('R'); expect(takeStr()).toBe('K');
    du.tick(300);
    expect(du.leds.en).toBe(true);
    cmd('P');
    expect(takeStr()).toBe('K');
    expect(du.leds.en).toBe(false);
    const pc = dump().words[0];
    du.tick(500);
    expect(dump().words[0]).toBe(pc);
  });

  it('recarga más corta deja NOPs; programa de 258 palabras -> E con 256 guardadas', () => {
    send(encodeLoad(Array.from({ length: 256 }, (_, i) => (0xbeef0000 | (i * 4)) >>> 0)));
    expect(takeStr()).toBe('K');
    send(encodeLoad([1, 2, 3, 4, 5]));
    expect(takeStr()).toBe('K');
    expect(Array.from(pipe.imem.slice(0, 6))).toEqual([1, 2, 3, 4, 5, 0x13]);
    expect(pipe.imem.slice(5).every((w) => w === 0x13)).toBe(true);

    const big = Array.from({ length: 258 }, (_, i) => (0xd00d0000 | (i * 4)) >>> 0);
    send(encodeLoad(big));
    expect(takeStr()).toBe('E');
    expect(Array.from(pipe.imem)).toEqual(big.slice(0, 256));
    expect(dump().words[0]).toBe(0); // sigue sincronizado
  });

  it("comando desconocido 'Z' -> '?' ; programa vacío -> K", () => {
    cmd('Z'); expect(takeStr()).toBe('?');
    send(encodeLoad([]));
    expect(takeStr()).toBe('K');
    expect(pipe.imem.every((w) => w === 0x13)).toBe(true);
  });

  it('S sobre CPU en halt responde H; R sobre CPU en halt responde H', () => {
    send(encodeLoad([0x00100073]));
    take();
    cmd('R'); expect(takeStr()).toBe('K');
    runUntilTx(); expect(takeStr()).toBe('H');
    cmd('R'); expect(takeStr()).toBe('H');
    cmd('S'); expect(takeStr()).toBe('H');
  });

  it('el dump congela el CPU en ejecución y vuelve a correr después', () => {
    send(encodeLoad(PROG)); take();
    cmd('R'); take();
    du.tick(10);
    du.rxByte(ch('D'));
    du.tick(3); // ya está en DUMP_*
    expect(du.state).not.toBe('IDLE');
    expect(du.leds.en).toBe(false);
    const c = pipe.cycle;
    du.tick(100);
    expect(pipe.cycle).toBe(c);
    du.settle();
    expect(tx.length).toBe(2 + 4 * 86);
  });

  it('helpers de UART', () => {
    expect(BAUD).toBe(19200);
    expect(bytesToMs(1)).toBeCloseTo(10 / 19.2, 5);
    expect(bytesToMs(1 + 2 + 4 * 86)).toBeCloseTo(((347 * 10) / 19200) * 1000, 5);
  });
});
