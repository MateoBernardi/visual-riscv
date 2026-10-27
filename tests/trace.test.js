import { describe, it, expect } from 'vitest';
import { Pipeline, DebugUnit, assemble, encodeLoad, decodeDump, PIPELINE_TEST } from '../src/sim/index.js';
import { runTrace, classifyHostBytes } from '../src/ui/debug/trace.js';

const mk = () => { const p = new Pipeline(); return new DebugUnit(p); };

describe('trace de la debug unit', () => {
  it('clasifica los bytes de L', () => {
    const r = classifyHostBytes([0x4c, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0x53]);
    expect(r.map((x) => x.role)).toEqual(['cmd', 'len_lo', 'len_hi', 'data', 'data', 'data', 'data', 'data', 'data', 'data', 'data', 'cmd']);
    expect(r[7].word).toBe(1);
  });
  it('L carga la imem y responde K', () => {
    const dbg = mk();
    const res = assemble(PIPELINE_TEST);
    const frame = encodeLoad(res.words);
    const tr = runTrace(dbg, frame);
    expect(tr.items.filter((i) => i.rx).length).toBe(frame.length);
    expect(tr.items.filter((i) => i.imem).length).toBe(frame.length - 3);
    expect(tr.items.some((i) => i.kind === 'fill')).toBe(true);
    expect(tr.tx).toEqual([0x4b]);
    expect(Array.from(dbg.pipe.imem.slice(0, res.words.length))).toEqual(Array.from(res.words));
    expect(dbg.state).toBe('IDLE');
  });
  it('D devuelve 346 bytes decodificables', () => {
    const dbg = mk();
    const tr = runTrace(dbg, [0x44]);
    expect(tr.tx.length).toBe(346);
    expect(tr.items.filter((i) => i.tx).length).toBe(346);
    expect(() => decodeDump(Uint8Array.from(tr.tx))).not.toThrow();
  });
  it('S avanza un ciclo', () => {
    const dbg = mk();
    const tr = runTrace(dbg, [0x53]);
    expect(tr.cyclesRun).toBe(1);
    expect(tr.tx).toEqual([0x4b]);
  });
});
