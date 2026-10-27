import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '../src/styles.css';
import { createScene } from '../src/scene/index.js';
import { VIEWS } from '../src/content/modules/index.js';
import { ALU, DEBUG } from './samples.js';

const q = new URLSearchParams(location.search);
const host = document.getElementById('host');
const scene = createScene(host, { theme: q.get('theme') || 'light' });
if (q.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
window.scene = scene;
scene.setViewInsets({ top: 48 }, { reset: 'now' });
const bar = document.getElementById('bar'), info = document.getElementById('info');
const all = { 'sample:alu_tp1': ALU, 'sample:debug_unit': DEBUG, ...Object.fromEntries(Object.entries(VIEWS).map(([k, v]) => [k, v])) };
window.views = all;
const btn = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.onclick = f; bar.append(b); return b; };
btn('placa', () => scene.exitView());
const sel = document.createElement('select');
for (const k of Object.keys(all)) sel.append(new Option(k, k));
bar.append(sel);
btn('entrar', () => scene.enterView(all[sel.value], { fromBlockId: all[sel.value].blockIds?.[0] || 'alu' }));
btn('tema', () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; scene.setTheme(t); });
btn('hazard', () => { scene.markHazard({ stage: 'EX', kind: 'loadUse', label: 'load-use' }); scene.showResolver({ blocks: ['hazard', 'idex'], wires: ['hazard-idex'], label: 'stall' }); });
btn('limpiar', () => scene.clearHazards());
btn('status', () => { scene.setBlockStatus('alu', { text: 'ADD', tone: 'info' }); scene.setBlockStatus('hazard', { text: 'STALL', tone: 'danger' }); });
btn('pulso', () => scene.pulseClock());

// valores falsos en vivo
const STATES = ['IDLE', 'LOAD_LEN_LO', 'LOAD_LEN_HI', 'LOAD_DATA', 'LOAD_FILL', 'REPLY', 'DUMP_CNT_LO', 'DUMP_CNT_HI', 'DUMP_ADDR', 'DUMP_LATCH', 'DUMP_BYTE'];
let n = 0;
function ctx() {
  n++;
  const a = (n * 0x9e3779b1) >>> 0, b = (n * 0x85ebca6b + 7) >>> 0;
  const si = Math.floor(n / 3) % STATES.length;
  return {
    snap: { signals: { aluA: a, aluB: b, aluOp: n % 11, aluOut: (a + b) >>> 0, zero: n % 4 === 0, lt: n % 2 === 0, ltu: n % 3 === 0 }, latches: {} },
    dbg: { state: STATES[si], stateCode: si, run: n % 2, step: 0, loading: si >= 1 && si <= 4, dumping: si >= 6, cpuEnable: n % 3 > 0, cpuReset: n % 5 === 0, leds: {} },
    uart: { rx: { state: 0 }, tx: { state: 0 } },
  };
}
setInterval(() => scene.setInteriorLive(ctx()), 500);
scene.setInteriorLive(ctx());
scene.onInteriorClick((e) => { info.textContent = `click ${e.type} ${e.id}`; const p = e.type === 'part' && e.schema.parts.find((x) => x.id === e.id); if (p?.drill && all[p.drill]) scene.enterView(all[p.drill]); else scene.highlightInterior(e.id); });
scene.onInteriorHover((e) => { info.textContent = e ? `hover ${e.type} ${e.id}` : ''; });
scene.onBlockClick((id) => { const v = Object.values(VIEWS).find((x) => x.blockIds?.includes(id)) || (id === 'alu' ? ALU : id === 'debug' ? DEBUG : null); if (v) scene.enterView(v, { fromBlockId: id }); });
scene.onLedHover((e) => { info.textContent = e ? `led ${e.led}` : ''; });
if (q.get('enter')) scene.enterView(all[q.get('enter')], { fromBlockId: 'alu', animate: q.get('anim') === '1' });
