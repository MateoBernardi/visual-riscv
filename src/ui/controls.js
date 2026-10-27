import { h } from './dom.js';

// número que "rueda" hasta su nuevo valor (ease-out); no escribe si no cambia
function tween(el, to, { digits = 0, ms = 380 } = {}) {
  const from = parseFloat(el.dataset.v ?? el.textContent);
  el.dataset.v = String(to);
  if (!isFinite(from) || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toFixed(digits); return; }
  const t0 = performance.now();
  cancelAnimationFrame(el._raf);
  const step = (t) => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = (from + (to - from) * e).toFixed(digits); if (k < 1) el._raf = requestAnimationFrame(step); };
  el._raf = requestAnimationFrame(step);
}

/**
 * Controles de simulación.
 * callbacks: { onReset, onBack, onStep, onRun, onPause, onSpeed(cps), onToggle(name, value) }  name: 'explain' | 'pauseOnEvent' | 'forwarding' | 'uartLoad'
 * update({ cycle, running, speed?, toggles?: {explain, pauseOnEvent, forwarding}, canBack?, halted?, pc? })
 */
export function createControls(root, cb = {}) {
  const mk = (cls, label, title, fn) => h('button', { class: 'btn ' + cls, title, onclick: fn }, label);
  const bReset = mk('ghost', '⟲ Reset', 'Reiniciar (PC=0)', () => cb.onReset && cb.onReset());
  const bBack = mk('ghost', '⟵ Atrás', 'Paso atrás: volver un ciclo', () => cb.onBack && cb.onBack());
  const bStep = mk('primary', 'Paso ⟶', 'Avanzar un ciclo', () => cb.onStep && cb.onStep());
  const bRun = mk('accent', '▶ Run', 'Ejecutar continuamente', () => { if (running) cb.onPause && cb.onPause(); else cb.onRun && cb.onRun(); });
  let running = false;

  const speed = h('input', { type: 'range', min: '-1', max: '1.30103', step: '0.01', value: '0', class: 'slider', 'aria-label': 'Velocidad', title: 'Velocidad de Run en ciclos por segundo' });
  const speedLbl = h('span', { class: 'mono speed-v' }, '1.0 c/s');
  const toCps = (v) => Math.pow(10, parseFloat(v)) ; // 0.1..20 -> limitamos a 0.5..20
  const fromCps = (c) => Math.log10(c);
  speed.min = String(fromCps(0.5)); speed.max = String(fromCps(20)); speed.value = String(fromCps(1));
  speed.addEventListener('input', () => { const c = Math.round(toCps(speed.value) * 10) / 10; speedLbl.textContent = c.toFixed(1) + ' c/s'; cb.onSpeed && cb.onSpeed(c); });

  const cycle = h('div', { class: 'cycle-badge' }, h('span', { class: 'eyebrow' }, 'Ciclo'), h('b', { class: 'mono' }, '0'));
  const cpiBox = h('div', { class: 'cpi-badge', title: 'CPI = ciclos / instrucciones retiradas' }, h('span', { class: 'eyebrow' }, 'CPI'), h('b', { class: 'mono cpi-v' }, '—'), h('span', { class: 'cpi-d mono' }, ''), h('span', { class: 'cpi-cmp mono' }, ''));
  const stateTag = h('span', { class: 'chip halted', style: { display: 'none' } }, 'HALT');

  const toggles = {};
  const tg = (name, label, on) => {
    const input = h('input', { type: 'checkbox', checked: on ? true : null });
    input.checked = !!on;
    const text = h('span', {}, label);
    input.addEventListener('change', () => { cb.onToggle && cb.onToggle(name, input.checked); refresh(); });
    const lab = h('label', { class: 'toggle' }, input, h('i'), text);
    const TIPS = {
      explain: 'Muestra la teoría del evento de cada ciclo (en el riel lateral) y la ficha de la instrucción que entra a ID',
      pauseOnEvent: 'Durante Run, frena cuando pasa algo interesante (hazard, stall, flush)',
      forwarding: 'Apagarlo es una alternativa didáctica: sin forwarding el pipeline frena (stall) en cada dependencia RAW',
    };
    if (TIPS[name]) lab.title = TIPS[name];
    if (name === 'uartLoad') lab.title = 'Al cargar un programa, animar la transferencia UART → debug unit → memoria de instrucciones (más lento)';
    toggles[name] = { input, text, lab, label };
    return lab;
  };
  const row2 = h('div', { class: 'ctl-toggles' }, tg('explain', 'Explicación', false), tg('pauseOnEvent', 'Pausar en eventos', false), tg('forwarding', 'Forwarding', true), tg('uartLoad', 'Cargar como en el hardware', false), cpiBox);
  function refresh() {
    const f = toggles.forwarding;
    f.text.textContent = f.input.checked ? 'Forwarding' : 'Sin forwarding';
    f.lab.classList.toggle('alt', !f.input.checked);
  }
  refresh();

  root.append(h('div', { class: 'controls card' },
    h('div', { class: 'ctl-row' }, cycle, h('div', { class: 'ctl-btns' }, bReset, bBack, bStep, bRun), stateTag,
      h('div', { class: 'ctl-speed' }, h('span', { class: 'eyebrow' }, 'Velocidad'), speed, speedLbl)),
    row2));

  function update(d = {}) {
    if (d.cycle !== undefined) { tween(cycle.lastChild, d.cycle, { ms: 220 }); cycle.classList.remove('bump'); void cycle.offsetWidth; cycle.classList.add('bump'); }
    if (d.running !== undefined) { running = d.running; bRun.textContent = running ? '❚❚ Pausa' : '▶ Run'; bRun.classList.toggle('running', running); }
    if (d.canBack !== undefined) bBack.disabled = !d.canBack;
    if (d.halted !== undefined) { stateTag.style.display = d.halted ? '' : 'none'; bStep.disabled = d.halted; bRun.disabled = d.halted; }
    if (d.cpi !== undefined) {
      const c = d.cpi;
      const cv = cpiBox.querySelector('.cpi-v');
      if (c && c.retired) tween(cv, c.cycles / c.retired, { digits: 2 }); else { cv.textContent = '—'; delete cv.dataset.v; }
      cpiBox.querySelector('.cpi-d').textContent = c ? `${c.cycles} ciclos / ${c.retired} instr.` : '';
      cpiBox.title = 'CPI = ciclos / instrucciones retiradas' + (c ? ` (${c.cycles} ciclos / ${c.retired} instr.)` : '');
      const cmp = c && c.compare;
      cpiBox.querySelector('.cpi-cmp').textContent = cmp ? `con fwd ${cmp.fwd != null ? cmp.fwd.toFixed(2) : '?'} · sin fwd ${cmp.nofwd != null ? cmp.nofwd.toFixed(2) : '?'}` : '';
    }
    if (d.disabled !== undefined) root.firstChild.classList.toggle('disabled', !!d.disabled);
    if (d.speed !== undefined) { speed.value = String(fromCps(d.speed)); speedLbl.textContent = d.speed.toFixed(1) + ' c/s'; }
    if (d.toggles) for (const [k, v] of Object.entries(d.toggles)) if (toggles[k]) toggles[k].input.checked = !!v;
    refresh();
  }
  return { update };
}
