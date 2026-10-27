import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles.css';
import './styles-app.css';


import { createScene } from './scene/index.js';
import { createShell } from './ui/shell.js';
import { createEditor } from './ui/editor.js';
import { createControls } from './ui/controls.js';
import { createTimeline } from './ui/timeline.js';
import { createDock } from './ui/dock.js';
import { createRegisters, createMemory } from './ui/state.js';
import { createVerify } from './ui/verify.js';
import { createBreadcrumb } from './ui/breadcrumb.js';
import { createLedTip } from './ui/ledTip.js';
import { createHoverCard, blockCard, interiorCard } from './ui/hoverCard.js';
import { createHome } from './ui/home.js';
import { createInspector } from './ui/inspector.js';
import { createLessons } from './ui/lessons.js';
import { createExamples } from './ui/examples.js';
import { createPopups } from './ui/popups.js';
import { mountDebugView } from './ui/debug/index.js';
import { loadProgramViaUart, skipUartLoad } from './ui/debug/uartLoader.js';
import { applySnapshot, pickEvent, isNotable, COLORS } from './ui/driver.js';
import { h, hex32, safeStorage } from './ui/dom.js';

import { Pipeline, assemble, DebugUnit, PIPELINE_TEST } from './sim/index.js';
import { EXAMPLES as RAW_EXAMPLES, LESSONS, BLOCK_INFO, EVENT_THEORY, ALTERNATIVES, isaCard } from './content/index.js';
import { VIEWS, viewForBlock, rtlPath } from './content/modules/index.js';

// ---------- ejemplos (el programa de prueba completo del repo se carga desde src/sim/programs) ----------
const EXAMPLES = RAW_EXAMPLES.map((e) => (e.code === '__PIPELINE_TEST__' ? { ...e, code: PIPELINE_TEST } : e));
const exampleById = (id) => EXAMPLES.find((e) => e.id === id);

const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const STAGE_BLOCK = { IF: 'imem', ID: 'ifid', EX: 'idex', MEM: 'exmem', WB: 'memwb' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const qs0 = new URLSearchParams(location.search);
const root = document.getElementById('app');
const visibleRect = (el) => (el && el.offsetParent !== null ? el.getBoundingClientRect() : null);
let scene = null;
const shell = createShell(root, {
  onView: (v) => onView(v),
  onTheme: (t) => scene && scene.setTheme(t),
  onResetView: () => scene && scene.resetView(),
  onLayout: () => setTimeout(() => updateInsets(false), 30),
  onTop: () => { if (curSchema) exitToBoard(); selectedBlock = null; focus = null; scene.setSelectedBlock(null); refreshInspector(); shell.setPanel('r', true); },
});
scene = createScene(shell.slots.scene, { theme: shell.getTheme() });

// ---------- estado de la app ----------
let pipe = null, dbg = null, program = null, running = false, speed = 1;
let currentExample = null, inDebug = false, uartBusy = false;
let selectedBlock = null, selectedInstr = null;
let curSchema = null, focus = null, insideMine = false; // zoom dentro de un módulo (lo maneja esta integración, no la vista Debug)
const toggles = { explain: false, pauseOnEvent: false, forwarding: true, uartLoad: false };
const cpiRec = new Map(); // fuente del programa -> { fwd, nofwd }

// ---------- módulos de UI ----------
const popups = createPopups(shell.slots.popups, {
  project: (id) => scene.projectAnchor(id),
  // el riel de explicación va del lado que tiene el panel cerrado (a la derecha si ambos están abiertos)
  railSide: () => { const lr = visibleRect(shell.slots.leftPanel), rr = visibleRect(shell.slots.rightPanel); return rr && !lr ? 'left' : 'right'; },
  onRailChange: () => setTimeout(() => {
    const ri = popups.railInfo(), app = shell.slots.stage.parentElement;
    app.classList.toggle('rail-r', !!ri && ri.side === 'right'); app.style.setProperty('--rail-w', ri ? ri.width + 'px' : '0px');
    updateInsets(false);
  }, 30),
  bounds: () => {
    // los pop-ups nunca tapan la barra superior, las migas ni el dock: quedan entre ambos
    const st = shell.slots.stage.getBoundingClientRect(), dr = visibleRect(shell.slots.dockEl);
    // los pop-ups no tapan los paneles laterales (inspector, editor, lección): quedan en la franja libre de la escena
    const lr = visibleRect(shell.slots.leftPanel), rr = visibleRect(shell.slots.rightPanel);
    const wide = st.width > 960;
    const tabs = wide && shell.getView() !== 'home' ? 32 : 8;
    const left = lr && wide ? lr.right - st.left + 8 : tabs, right = rr && wide ? rr.left - st.left - 8 : st.width - tabs;
    return { left: Math.max(tabs, left), top: curSchema ? 118 : 108, right: Math.max(left + 260, right), bottom: dr ? dr.top - st.top - 8 : st.height - 8, zones: [] };
  },
});
scene.onFrame(popups.update);
const ledTip = createLedTip(shell.slots.popups);
const hoverCard = createHoverCard(shell.slots.popups, shell.slots.scene);
scene.onBlockHover((id) => { if (!id || curSchema) { hoverCard.hide(); return; } hoverCard.show(blockCard(id, BLOCK_INFO[id], pipe && pipe.snapshot())); });
scene.onInteriorHover((hv) => {
  const c = hv && curSchema ? interiorCard(hv, curSchema, pipe ? liveCtx() : null) : null;
  if (c) hoverCard.show(c); else hoverCard.hide();
});
scene.onLedHover((d) => {
  if (!d) { ledTip.hide(); return; }
  const snap = pipe && pipe.snapshot();
  const st = inDebug && dbg ? dbg.leds : { halt: !!(snap && snap.halted), rst: false, en: !(snap && snap.halted) };
  ledTip.show(d.led, d.rect, st);
});

const editor = createEditor(shell.slots.left.editor, {
  onChange: (src) => {
    const ex = currentExample && currentExample.code === src ? currentExample : null;
    loadProgram(src, { example: ex });
  },
  onLineClick: (line) => {
    if (!program || !pipe) return;
    const ent = (program.listing || []).find((l) => l.line === line);
    if (ent) showIsa(ent.word, ent.addr, ent.src);
  },
});
const guardUart = () => { if (uartBusy) { skipUartLoad(); return true; } return false; };
const controls = createControls(shell.slots.dock.controls, {
  onReset: () => { if (guardUart()) return; stopRun(); resetSim(); },
  onBack: () => { if (guardUart()) return; stopRun(); stepBack(); },
  onStep: () => { if (guardUart()) return; stopRun(); doStep(true); },
  onRun: () => { if (guardUart()) return; startRun(); },
  onPause: () => stopRun(),
  onSpeed: (c) => { speed = c; },
  onToggle: (name, v) => {
    toggles[name] = v;
    if (name === 'forwarding') rebuildPipeline();
    if (name === 'explain') { if (v && pipe) explainStep(pipe.snapshot(), null); else popups.closeUnpinned(['resolver:main']); }
  },
});
const dock = createDock(shell.slots.dock.timeline, {
  onToggle: (open) => { if (open && dock.tab() === 'cycles') timeline.reveal(); setTimeout(() => updateInsets(false), 30); },
  onTab: (id) => { if (id === 'cycles' && dock.isOpen()) setTimeout(() => timeline.reveal(), 0); },
});
const timeline = createTimeline(dock.pane('cycles'), { onSelect: (id) => selectInstr(id) });
const regsView = createRegisters(dock.pane('regs'));
const memView = createMemory(dock.pane('mem'));
const verify = createVerify(dock.pane('verify'));
const crumbsUi = createBreadcrumb(shell.slots.crumbs, {
  onBoard: () => exitToBoard(),
  onCrumb: (id) => goView(VIEWS[id], {}),
  onUp: () => upOne(),
});
const inspector = createInspector(shell.slots.right.inspector, {
  onAlternatives: (id) => showAlternatives(id),
  onEnter: (viewId) => goView(VIEWS[viewId], { fromBlockId: selectedBlock }),
  onDrill: (viewId) => goView(VIEWS[viewId], { fromPartId: focus && focus.type === 'part' ? focus.id : undefined }),
  onClose: () => {
    // cerrar el inspector solo oculta el panel: no te saca del módulo en el que estás
    if (!curSchema) { selectedBlock = null; scene.setSelectedBlock(null); }
    refreshInspector();
    shell.setPanel('r', false, { persist: shell.getView() !== 'debug' });
  },
});
const lessons = createLessons(shell.slots.left.lessons, {
  onSelect: (l) => { if (l && l.focus && !curSchema) scene.focusBlock(l.focus); },
  onLoadExample: (exId, lesson) => {
    loadExample(exId, { focus: false });
    shell.setView('sim');
    shell.setPanel('l', true);
    if (lesson && lesson.focus) setTimeout(() => scene.focusBlock(lesson.focus), 60);
  },
  onWatch: (b) => watchBlock(b),
  onLoadProgram: (p, cat) => {
    loadProgram(p.code, { example: { id: 'test:' + cat.id + ':' + p.title, title: p.title, code: p.code, expect: p.expect, steps: [], explainVerification: (p.note || '') + (p.knownIssue ? p.knownIssue.html : '') } });
    shell.setView('sim');
    shell.setPanel('l', true);
    dock.setTab('verify', { open: true });
  },
});
const examplesView = createExamples(shell.slots.left.examples, {
  onLoad: (id) => { if (loadExample(id)) shell.setView('sim'); },
});
createHome(shell.slots.left.home, {
  onPath: (id) => {
    if (id === 'entender' || id === 'construir') { shell.setView('lessons'); lessons.update({ lessons: LESSONS, activeId: null, scrollTo: id }); }
    else if (id === 'simular') { shell.setView('sim'); shell.setPanel('l', true); }
    else if (id === 'debug') shell.setView('debug');
  },
});

// Aviso (descartable, se recuerda) la primera vez que se entra a un módulo: explica la jerarquía real vs. la vista general
const hierStore = safeStorage();
const banner = h('div', { class: 'hier-banner', hidden: true });
shell.slots.crumbs.append(banner);
function showBanner(schema) {
  if (hierStore.get('vr-hier-banner') === '1') { banner.hidden = true; return; }
  banner.hidden = false; banner.textContent = '';
  const path = rtlPath(schema.id);
  banner.append(
    h('div', { class: 'hb-t' }, h('b', {}, 'Dónde estás: '), h('code', {}, schema.module), schema.instance ? [' (instancia ', h('code', {}, schema.instance), ')'] : null),
    h('p', {}, 'Es el interior real del RTL', path.length > 1 ? [' (', h('code', {}, path.join(' › ')), ')'] : null, '. La ', h('b', {}, 'Vista general'), ' (la placa 3D) es el dibujo simplificado del CPU: de ahí cuelgan todos los módulos. Subí con ', h('kbd', {}, 'Esc'), ' o con las migas.'),
    h('div', { class: 'hb-a' },
      h('button', { class: 'btn small primary', type: 'button', onclick: () => { hierStore.set('vr-hier-banner', '1'); banner.hidden = true; } }, 'Entendido'),
      h('button', { class: 'btn small ghost', type: 'button', onclick: () => { hierStore.set('vr-hier-banner', '1'); banner.hidden = true; exitToBoard().then(() => shell.slots.stage.querySelector('.pill-top')?.click()); } }, '¿Qué es la Vista general?')));
}
const setCrumbs = (schema) => { if (schema) showBanner(schema); else banner.hidden = true; crumbsUi.update(schema); shell.slots.stage.parentElement.classList.toggle('in-module', !!schema); };
// "Qué mirar en la animación": resalta y centra el bloque
function watchBlock(b) {
  if (curSchema) return;
  scene.focusBlock(b);
  scene.highlightBlock(b, COLORS.orange);
  scene.setSelectedBlock(b);
  clearTimeout(watchBlock.t);
  watchBlock.t = setTimeout(() => { scene.setSelectedBlock(selectedBlock); scene.highlightBlock(b, null); if (pipe) render(pipe.snapshot(), null, { animate: false }); }, 3500);
}

// ---------- carga de programas ----------
function newPipe(withProgram) {
  pipe = new Pipeline({ forwarding: toggles.forwarding });
  if (withProgram && program) pipe.load(program.words);
  dbg = new DebugUnit(pipe);
}
function setSource(src) {
  const res = assemble(src);
  editor.update({ source: src, listing: res.listing, errors: res.errors });
  if (res.errors && res.errors.length) return false;
  program = res;
  program.src = src;
  return true;
}
function loadProgram(src, { example = null, noPipe = false } = {}) {
  if (!setSource(src)) return false;
  currentExample = example;
  if (noPipe) return true;
  stopRun();
  if (inDebug) leaveDebugMode();
  newPipe(true);
  selectedInstr = null;
  scene.clearPackets && scene.clearPackets();
  popups.closeUnpinned();
  render(pipe.snapshot(), null, { animate: false });
  return true;
}
function loadExample(id, { focus: doFocus = true, silent = false, noPipe = false, uart = true } = {}) {
  const ex = exampleById(id);
  if (!ex) return false;
  if (!loadProgram(ex.code, { example: ex, noPipe })) return false;
  if (!noPipe) {
    const first = ex.steps && ex.steps[0];
    if (doFocus && first && !curSchema) scene.focusBlock(first.focus);
    if (!silent && toggles.explain) explainStep(pipe.snapshot(), null);
    render(pipe.snapshot(), null, { animate: false });
    if (uart && toggles.uartLoad) runUartLoad();
  }
  return true;
}
// "Cargar como en el hardware": anima UART -> debug unit -> IMEM con el protocolo L real
const uartToast = h('div', { class: 'uart-toast', hidden: true });
shell.slots.stage.append(uartToast);
async function runUartLoad() {
  if (!program || inDebug || uartBusy) return;
  stopRun();
  if (curSchema) await exitToBoard();
  uartBusy = true;
  uartToast.hidden = false; uartToast.textContent = 'Cargando por UART como en la placa… tocá un control para saltar la animación';
  try {
    const fresh = new Pipeline({ forwarding: toggles.forwarding });
    const r = await loadProgramViaUart({
      scene, pipeline: fresh, words: program.words, explain: true, mode: 'animada', listing: program.listing,
      onProgress: (n, total) => { uartToast.textContent = `Cargando por UART: ${n}/${total} bytes · tocá un control para saltar`; },
    });
    if (uartBusy) { pipe = r.pipeline; dbg = r.debugUnit; selectedInstr = null; render(pipe.snapshot(), null, { animate: false }); }
  } catch (e) { console.warn('uart load', e); }
  uartBusy = false; uartToast.hidden = true;
  if (pipe) render(pipe.snapshot(), null, { animate: false });
}
function resetSim() {
  newPipe(true);
  selectedInstr = null;
  popups.closeUnpinned();
  render(pipe.snapshot(), null, { animate: false });
}
function rebuildPipeline() {
  if (!program) return;
  stopRun();
  if (inDebug) return;
  resetSim();
}

// ---------- ayudas de contenido ----------
function showIsa(word, pc, title, anchor) {
  if (curSchema) return;
  const card = isaCard(word, pc);
  popups.show({
    type: 'isa', anchorId: anchor || 'ifid', key: 'isa:w' + hex32(word) + ':' + pc,
    data: { ...card, open: true }, title: title || card.asm,
  });
}
function showAlternatives(blockId) {
  const a = ALTERNATIVES[blockId];
  if (!a) return;
  popups.show({ type: 'alternatives', anchorId: blockId, data: a, title: a.title, key: 'alt' });
}
// Nota del paso guiado del ejemplo cargado en este ciclo (se muestra como "En este ejemplo" en el pop-up)
const stepOf = (snap) => (currentExample && (currentExample.steps || []).find((s) => s.cycle === snap.cycle)) || null;
function eventPopup(ev, snap, example) {
  const th = EVENT_THEORY[ev.type];
  if (!th) return false;
  const block = ev.block || th.block || 'pc';
  popups.show({
    type: 'event', anchorId: block, key: 'event:' + ev.type,
    data: { title: th.title, what: th.what, ev, snap, why: th.why, rtl: th.rtl, cost: th.cost, example, onAlternatives: () => showAlternatives(block) },
  });
  return true;
}
// Modo explicación: pop-up del evento más interesante (con la nota del ejemplo) + ficha de la instrucción que entra a ID.
function explainStep(snap, prev) {
  if (curSchema) return;
  const keep = ['resolver:main'];
  const id = snap.stages.ID;
  const newId = id && id.kind !== 'bubble' && id.id != null && (!prev || !prev.stages.ID || prev.stages.ID.id !== id.id);
  if (id && id.kind !== 'bubble' && id.id != null) keep.push('isa:id' + id.id);
  popups.closeUnpinned(keep);
  const ev = pickEvent(snap.events);
  const st = stepOf(snap);
  if (ev) eventPopup(ev, snap, st ? st.note : null);
  if (newId || !prev) {
    const card = isaCard(id.inst, id.pc);
    popups.show({ type: 'isa', anchorId: 'control', key: 'isa:id' + id.id, data: { ...card }, title: id.asm || card.asm });
  }
}

// ---------- hazards: triángulo en la etapa afectada + resolutor + "Por qué funciona" ----------
const opName = (snap) => String((snap.stages.EX && snap.stages.EX.asm) || '').trim().split(/\s+/)[0];
function hazardLabel(ev, snap) {
  const d = ev.data || {};
  switch (ev.type) {
    case 'fwdExMem': case 'fwdMemWb': case 'bypassWB': return `RAW x${d.reg}`;
    case 'loadUseStall': return `load-use x${d.ex_rd}`;
    case 'rawStallNoFwd': return `RAW x${d.ex_rd}`;
    case 'falseStall': return 'stall falso';
    case 'branchTaken': return `control: ${opName(snap)} tomado`;
    case 'jump': return `control: ${opName(snap)}`;
    case 'flush': return 'control: flush';
    default: return ev.type;
  }
}
const RESOLVER_LABEL = { fwdExMem: 'forwarding EX/MEM', fwdMemWb: 'forwarding MEM/WB', bypassWB: 'bypass WB→ID', loadUseStall: 'stall + burbuja', falseStall: 'stall + burbuja', rawStallNoFwd: 'stall hasta WB', branchTaken: 'flush de 2 instr.', jump: 'flush de 2 instr.', flush: 'flush de 2 instr.' };
function showHazards(snap, { quiet = false } = {}) {
  scene.clearHazards();
  popups.closeType('resolver');
  const rr = (snap.events || []).find((e) => e.type === 'regRead');
  // el bypass solo es un hazard si ese operando es un registro fuente real (si no, los bits son parte del inmediato)
  const realOperand = (e) => e.type !== 'bypassWB' || !rr || (e.data.operand === 'A' ? rr.data.usesRs1 : rr.data.usesRs2);
  const evs = (snap.events || []).filter((e) => EVENT_THEORY[e.type] && EVENT_THEORY[e.type].hazard && realOperand(e));
  if (!evs.length) return;
  const seen = new Set();
  const ordered = [...evs].sort((a, b) => (a.type === 'flush') - (b.type === 'flush'));
  for (const ev of ordered) {
    const hz = EVENT_THEORY[ev.type].hazard;
    const label = hazardLabel(ev, snap);
    const key = hz.kind + hz.stage + (hz.kind === 'control' ? '' : label);
    if (seen.has(key)) continue;
    seen.add(key);
    scene.markHazard({ stage: hz.stage, kind: hz.kind, label });
  }
  const primary = pickEvent(evs, { routine: false }) || evs[0];
  const pth = EVENT_THEORY[primary.type];
  if (!pth.resolver) return;
  const same = evs.filter((e) => EVENT_THEORY[e.type].hazard.kind === pth.hazard.kind && EVENT_THEORY[e.type].hazard.stage === pth.hazard.stage && EVENT_THEORY[e.type].resolver);
  const blocks = [...new Set(same.flatMap((e) => EVENT_THEORY[e.type].resolver.blocks))];
  const wires = [...new Set(same.flatMap((e) => EVENT_THEORY[e.type].resolver.wires))];
  scene.showResolver({ blocks, wires, kind: pth.hazard.kind, label: RESOLVER_LABEL[primary.type] || '' });
  if (quiet || curSchema || inDebug || shell.slots.popups.clientWidth < 720) return;
  popups.show({
    type: 'resolver', anchorId: pth.resolver.blocks[0], key: 'resolver:main', title: pth.resolver.title,
    data: { html: pth.resolver.html, compact: !toggles.explain },
  });
}

// ---------- resultado y CPI ----------
function retiredCount(hist) {
  let n = 0;
  for (const s of hist) { const w = s.stages.WB; if (w && w.kind !== 'bubble' && w.id != null) n++; }
  return n;
}

// ---------- render de un snapshot ----------
function dbgCtx() {
  if (!dbg) return undefined;
  return { state: dbg.state, stateCode: dbg._st ?? 0, run: dbg.run, step: dbg.step, loading: dbg.loading, dumping: dbg.dumping, cpuEnable: dbg.cpuEnable, cpuReset: dbg.cpuReset, leds: dbg.leds };
}
const liveCtx = () => ({ snap: pipe.snapshot(), dbg: dbgCtx() });
function render(snap, prev, { animate }) {
  const dur = Math.min(650, 800 / speed);
  applySnapshot(scene, snap, prev, { animate, durationMs: dur });
  showHazards(snap, { quiet: running && speed > 3 });
  const retired = retiredCount(pipe.history);
  const key = program ? program.src : '';
  if (snap.halted && key && retired) {
    const r = cpiRec.get(key) || {};
    r[toggles.forwarding ? 'fwd' : 'nofwd'] = snap.cycle / retired;
    cpiRec.set(key, r);
  }
  const rec = cpiRec.get(key);
  controls.update({ cycle: snap.cycle, halted: snap.halted, canBack: pipe.history.length > 1, running, cpi: { cycles: snap.cycle, retired, compare: rec ? { fwd: rec.fwd, nofwd: rec.nofwd } : null } });
  dock.setCycle(snap.cycle);
  timeline.update({ history: pipe.history, selectedId: selectedInstr });
  const lastWrite = prev && prev.signals && prev.signals.memWrite ? { addr: prev.signals.memAddr } : null;
  regsView.update({ regs: snap.regs, prevRegs: prev && prev.regs, pc: snap.pc });
  memView.update({ dmem: snap.dmem, prevDmem: prev && prev.dmem, lastWrite });
  const vr = verify.update({ example: currentExample, snap, halted: snap.halted });
  dock.setBadge('verify', vr.state === 'pass' ? { text: `✓ ${vr.pass}/${vr.total}`, tone: 'ok' } : vr.state === 'fail' ? { text: `✗ ${vr.total - vr.pass}`, tone: 'bad' } : vr.state === 'running' ? { text: `${vr.pass}/${vr.total}`, tone: 'run' } : null);
  editor.update({ stages: snap.stages });
  if (curSchema || selectedBlock) refreshInspector();
  if (insideMine && curSchema) scene.setInteriorLive(liveCtx());
  if (inDebug) debugView.sync();
  scene.invalidate();
}

function afterStep(snap, prev, manual) {
  const tourStep = stepOf(snap);
  const ev = pickEvent(snap.events, { routine: false });
  if (toggles.explain) {
    explainStep(snap, prev);
    if (tourStep && !curSchema) scene.focusBlock(tourStep.focus);
  } else if (toggles.pauseOnEvent && ev && (running || manual)) {
    if (!curSchema) eventPopup(ev, snap, null);
  }
  if (running && toggles.pauseOnEvent && isNotable(ev)) stopRun();
}
function doStep(manual) {
  if (!pipe || pipe.halted) { stopRun(); return; }
  const prev = pipe.snapshot();
  const snap = pipe.step();
  render(snap, prev, { animate: manual ? true : speed <= 6 });
  afterStep(snap, prev, manual);
  if (snap.halted) {
    stopRun();
    // al terminar, mostrar la comparación esperado vs obtenido
    if (currentExample && currentExample.expect && !curSchema) dock.setTab('verify', { open: true });
  }
}
function stepBack() {
  if (pipe.history.length <= 1) return;
  pipe.stepBack();
  const h2 = pipe.history;
  render(pipe.snapshot(), h2.length > 1 ? h2[h2.length - 2] : null, { animate: false });
  if (toggles.explain) explainStep(pipe.snapshot(), h2.length > 1 ? h2[h2.length - 2] : null);
}
function seekCycle(c) {
  stopRun();
  if (c < pipe.cycle) newPipe(true);
  let prev = null;
  while (pipe.cycle < c && !pipe.halted) { prev = pipe.snapshot(); pipe.step(); }
  const snap = pipe.snapshot();
  render(snap, prev, { animate: false });
  const tourStep = stepOf(snap);
  if (toggles.explain) explainStep(snap, prev);
  if (tourStep && !curSchema) scene.focusBlock(tourStep.focus);
}
async function startRun() {
  if (running || !pipe || pipe.halted) return;
  running = true; controls.update({ running: true });
  while (running && pipe && !pipe.halted) {
    const t0 = performance.now();
    doStep(false);
    if (!running) break;
    await sleep(Math.max(0, 1000 / speed - (performance.now() - t0)));
  }
  running = false;
  if (pipe) controls.update({ running: false, halted: pipe.halted });
}
function stopRun() {
  if (!running) return;
  running = false; controls.update({ running: false });
}

// ---------- selección ----------
function selectInstr(id) {
  selectedInstr = id;
  const hist = pipe.history;
  let found = null;
  for (let i = hist.length - 1; i >= 0 && !found; i--) {
    for (const st of STAGES) {
      const e = hist[i].stages[st];
      if (e && e.id === id && e.kind !== 'bubble') { found = e; break; }
    }
  }
  if (!found) return;
  const cur = pipe.snapshot();
  let anchor = 'imem';
  for (const st of STAGES) if (cur.stages[st] && cur.stages[st].id === id) anchor = STAGE_BLOCK[st];
  showIsa(found.inst, found.pc, found.asm, anchor);
  timeline.update({ history: pipe.history, selectedId: id });
}

// ---------- inspector + zoom dentro de los módulos ----------
function refreshInspector() {
  if (curSchema) {
    const bid = (curSchema.blockIds && curSchema.blockIds[0]) || null;
    inspector.update({ blockId: bid || curSchema.id, view: curSchema, info: bid ? BLOCK_INFO[bid] : null, alt: bid ? ALTERNATIVES[bid] : null, ctx: liveCtx(), focus, inside: true });
  } else if (selectedBlock) {
    const v = viewForBlock(selectedBlock);
    inspector.update({ blockId: selectedBlock, view: v, info: BLOCK_INFO[selectedBlock], alt: ALTERNATIVES[selectedBlock], ctx: liveCtx(), inside: false });
  } else inspector.update(null);
}
function selectBlock(id, { quiet = false } = {}) {
  selectedBlock = id; focus = null;
  scene.setSelectedBlock(id);
  refreshInspector();
  // el inspector se abre solo al elegir un bloque (en Debug, como tarjeta flotante)
  if (!shell.isPanelOpen('r')) shell.setPanel('r', true);
  if (!quiet && (inDebug || !viewForBlock(id))) scene.focusBlock(id);
}
async function goView(schema, opts = {}) {
  if (!schema || inDebug) return;
  insideMine = true; curSchema = schema; focus = null;
  popups.closeUnpinned(); popups.closeType('resolver'); ledTip.hide();
  setCrumbs(schema);
  refreshInspector();
  if (!shell.isPanelOpen('r')) shell.setPanel('r', true);
  await scene.enterView(schema, opts);
  if (curSchema === schema) { scene.setInteriorLive(liveCtx()); updateInsets(false); }
}
async function exitToBoard() {
  if (!curSchema) return;
  curSchema = null; insideMine = false; focus = null;
  setCrumbs(null);
  refreshInspector();
  await scene.exitView();
  if (pipe) render(pipe.snapshot(), null, { animate: false });
  scene.setSelectedBlock(selectedBlock);
}
function upOne() {
  if (!curSchema) return;
  const parent = curSchema.parent && VIEWS[curSchema.parent];
  if (parent) goView(parent, {}); else exitToBoard();
}
scene.onBlockClick((id) => {
  if (shell.getView() === 'home') shell.setView('sim');
  selectBlock(id);
  if (!inDebug) { const v = viewForBlock(id); if (v) goView(v, { fromBlockId: id }); }
});
scene.onInteriorClick(({ type, id, schema }) => {
  if (!insideMine || !curSchema) return;
  if (type === 'part') {
    const part = (schema.parts || []).find((p) => p.id === id);
    if (part && part.drill && VIEWS[part.drill]) { goView(VIEWS[part.drill], { fromPartId: id }); return; }
  }
  focus = { type, id };
  scene.highlightInterior(id);
  refreshInspector();
  if (!shell.isPanelOpen('r')) shell.setPanel('r', true);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  const t = e.target;
  if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
  if (popups.has('alt')) { popups.closeType('alternatives'); return; }
  if (insideMine && curSchema && shell.getView() !== 'debug') { e.preventDefault(); upOne(); }
});

// ============================================================================
// Debug unit (vista Debug v2: todo vive en src/ui/debug/)
// ============================================================================
const debugView = mountDebugView({
  scene, shell, root: shell.slots.left.debug, rightPanel: shell.slots.rightPanel,
  examples: EXAMPLES, colors: COLORS,
  getSource: () => (program ? program.src : EXAMPLES[0].code),
  getPipe: () => pipe, getDbg: () => dbg,
  render: (snap, prev, o) => render(snap, prev, o),
});
function enterDebugMode() {
  inDebug = true;
  stopRun();
  popups.closeUnpinned();
  newPipe(false);
  render(pipe.snapshot(), null, { animate: false });
  scene.resetView();
  debugView.enter();
}
function leaveDebugMode() {
  inDebug = false;
  debugView.leave();
  newPipe(true);
  render(pipe.snapshot(), null, { animate: false });
  scene.setLeds({ halt: false, rst: false, en: false });
}

// ---------- vistas ----------
function onView(v) {
  updateInsets(true);
  scene.setIntro(v === 'home' && !qs0.has('shot') && !matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (v === 'debug' && insideMine) { curSchema = null; insideMine = false; setCrumbs(null); scene.exitView({ animate: false }); }
  if (v === 'debug' && !inDebug) enterDebugMode();
  else if (v !== 'debug' && inDebug) leaveDebugMode();
  if (v === 'home' && insideMine) exitToBoard();
  if (v === 'lessons') lessons.update({ lessons: LESSONS });
  popups.closeType('resolver');
  if (pipe && v !== 'debug') showHazards(pipe.snapshot());
}

// Los paneles flotan sobre la escena: avisarle qué zona queda libre para encuadrar el tablero.
function updateInsets(reset = false) {
  const st = shell.slots.stage.getBoundingClientRect();
  let ins;
  if (st.width <= 960) {
    const open = shell.getView() === 'home' || shell.slots.stage.parentElement.classList.contains('sheet-open');
    ins = { top: 64, left: 0, right: 0, bottom: open ? Math.min(shell.slots.sheet.scrollHeight, st.height * 0.58) + 8 : 56 };
    if (popups.hasRail()) ins.bottom = Math.max(ins.bottom, st.height * 0.4);
  } else {
    const l = visibleRect(shell.slots.leftPanel), d = visibleRect(shell.slots.dockEl);
    const r = visibleRect(shell.slots.rightPanel);
    ins = { top: curSchema ? 112 : 106, left: l ? l.right - st.left + 10 : 0, right: r ? st.right - r.left + 10 : 0, bottom: d ? st.bottom - d.top + 6 : 0 };
    const ri = popups.railInfo(); if (ri) ins[ri.side] += ri.width + 14; // la placa se encuadra fuera del riel de explicación
  }
  scene.setViewInsets(ins, { reset });
}
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => updateInsets(false));
  [shell.slots.stage, shell.slots.dockEl, shell.slots.leftPanel, shell.slots.rightPanel].forEach((e) => ro.observe(e));
}

// ---------- arranque ----------
lessons.update({ lessons: LESSONS });
examplesView.update({ examples: EXAMPLES });
inspector.update(null);
loadExample(EXAMPLES[0].id, { focus: false, silent: true, uart: false });
shell.setTheme(shell.getTheme());
shell.setView('home');
updateInsets('now');

// parámetros de URL para depurar:
//   ?view=sim&theme=dark&steps=5&nosplash&example=load-use&explain&lesson=<id>&alt=hazard&isa=2
//   ?blockclick=alu (como hacer clic en el bloque) &enter=alu_tp1 (entrar a una vista) &focus=part:<id>|net:<id> &dock=cycles|regs|mem|verify
const qs = new URLSearchParams(location.search);
if (qs.has('nobanner')) hierStore.set('vr-hier-banner', '1');
if (qs.get('theme')) shell.setTheme(qs.get('theme') === 'dark' ? 'dark' : 'light');
if (qs.get('example')) loadExample(qs.get('example'), { focus: false, silent: true, uart: false });
if (qs.get('view')) { shell.setView(qs.get('view')); updateInsets('now'); }
if (qs.has('explain')) { toggles.explain = true; controls.update({ toggles: { explain: true } }); }
{
  const n = Number(qs.get('steps') || 0);
  let prev = null;
  for (let i = 0; i < n && !pipe.halted; i++) { prev = pipe.snapshot(); pipe.step(); }
  if (n) render(pipe.snapshot(), prev, { animate: false });
}
if (qs.has('explain')) explainStep(pipe.snapshot(), null);
if (qs.get('dock')) dock.setTab({ cycles: 'cycles', regs: 'regs', mem: 'mem', verif: 'verify', verify: 'verify' }[qs.get('dock')] || 'cycles', { open: true });
if (qs.has('blockclick')) {
  if (qs.get('view') == null) shell.setView('sim');
  selectBlock(qs.get('blockclick'), { quiet: !qs.has('enter') && qs.has('inspect') });
  if (!qs.has('inspect')) { const v = viewForBlock(qs.get('blockclick')); if (v) goView(v, { fromBlockId: qs.get('blockclick'), animate: false }); }
}
if (qs.get('enter')) {
  if (qs.get('view') == null) shell.setView('sim');
  const v = VIEWS[qs.get('enter')];
  if (v) goView(v, { fromBlockId: (v.blockIds && v.blockIds[0]) || undefined, animate: false }).then(() => {
    const f = qs.get('focus');
    if (f) { const [t, ...rest] = f.split(':'); focus = { type: t, id: rest.join(':') }; scene.highlightInterior(focus.id); refreshInspector(); }
  });
}
if (qs.has('isa')) { const w = program.listing[Number(qs.get('isa')) || 0]; if (w) showIsa(w.word, w.addr, w.src, 'ifid'); }
if (qs.get('lesson')) { shell.setView('lessons'); lessons.update({ lessons: LESSONS, activeId: qs.get('lesson') }); }
if (qs.get('track')) { shell.setView('lessons'); lessons.update({ lessons: LESSONS, activeId: null, scrollTo: qs.get('track') }); }
if (qs.get('alt')) showAlternatives(qs.get('alt'));

if (qs.has('nosplash')) document.querySelector('.loading')?.remove();
const fontsReady = (document.fonts && document.fonts.ready) ? Promise.race([document.fonts.ready, sleep(2500)]) : Promise.resolve();
Promise.all([fontsReady, sleep(qs.has('nosplash') ? 0 : 900)]).then(() => shell.hideLoading());

// útil para depurar desde la consola
window.__visual = { scene, shell, get pipe() { return pipe; }, get dbg() { return dbg; }, popups, debugView, goView, upOne, exitToBoard, dock, lessons, selectBlock };

if (qs.has('debug')) setTimeout(() => console.warn('DBG ' + JSON.stringify(scene.debugInfo())), 1200);

// guion de pruebas para depurar: ?script=step,step,click:alu,enter:alu_tp1,up,dock:verify,instr:2,back,run,explain,ex:load-use,seek:4,led:halt,dbg:L,delay:1500
if (qs.get('script')) {
  const steps = qs.get('script').split(',');
  let t = 400;
  for (const a of steps) {
    const [k, v] = a.split(':');
    if (k === 'delay') { t += Number(v); continue; }
    setTimeout(() => {
      if (k === 'step') doStep(true); else if (k === 'back') stepBack(); else if (k === 'run') startRun(); else if (k === 'pause') stopRun();
      else if (k === 'click') { selectBlock(v); const vw = viewForBlock(v); if (vw && !inDebug) goView(vw, { fromBlockId: v }); }
      else if (k === 'enter') goView(VIEWS[v], { fromBlockId: (VIEWS[v].blockIds && VIEWS[v].blockIds[0]) || undefined });
      else if (k === 'up') upOne();
      else if (k === 'board') exitToBoard();
      else if (k === 'dock') { if (v === 'close') dock.close(); else dock.setTab({ verif: 'verify' }[v] || v, { open: true }); }
      else if (k === 'inspect') selectBlock(v);
      else if (k === 'panel') shell.setPanel(v[0], v[1] === '1', { persist: true });
      else if (k === 'instr') selectInstr(Number(v));
      else if (k === 'speed') speed = Number(v);
      else if (k === 'toggle') { toggles[v] = true; controls.update({ toggles: { [v]: true } }); if (v === 'explain') explainStep(pipe.snapshot(), null); }
      else if (k === 'fwd') { toggles.forwarding = v !== 'off'; controls.update({ toggles: { forwarding: toggles.forwarding } }); rebuildPipeline(); }
      else if (k === 'view') shell.setView(v);
      else if (k === 'zoom') { const [f, x, z] = v.split('/').map(Number); scene.zoomTo(f, isNaN(x) ? undefined : x, isNaN(z) ? undefined : z); }
      else if (k === 'ex') { loadExample(v); shell.setView('sim'); }
      else if (k === 'seek') seekCycle(Number(v));
      else if (k === 'alt') showAlternatives(v);
      else if (k === 'led') { const r = shell.slots.scene.getBoundingClientRect(); ledTip.show(v, { left: r.left + r.width * 0.3, top: r.top + r.height * 0.7, right: r.left + r.width * 0.3 + 24, bottom: r.top + r.height * 0.7 + 24, width: 24, height: 24 }, { halt: pipe.halted, rst: false, en: !pipe.halted }); }
      else if (k === 'isaw') { const w = program.listing[Number(v)]; if (w) showIsa(w.word, w.addr, w.src, 'control'); }
      else if (k === 'dbg') {
        if (v === 'rate') debugView.setMode(a.split(':')[2]);
        else debugView.command(v);
      }
      else if (k === 'bad') loadProgram('addi x1, x0, 5\nfoo x1, x2\nadd x3, x1');
    }, t); t += 450;
  }
}
