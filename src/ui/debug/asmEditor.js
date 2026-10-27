// asmEditor.js - editor de ensamblador RISC-V reutilizable (Debug y, más adelante, Simulador).
//
// createAsmEditor(root, opts) -> api
//   opts: {
//     source?: string,                 texto inicial
//     examples?: [{id,title,code}],    si viene, muestra el selector de ejemplos ('__PIPELINE_TEST__' se reemplaza solo)
//     placeholder?: string,
//     rows?: number,                   alto mínimo en líneas (default 10)
//     showInfo?: boolean,              línea "N instrucciones · 4N bytes · ≈X ms" (default true)
//     debounceMs?: number,             retardo del auto-ensamblado (default 220)
//     onChange?(result, source),       tras cada (re)ensamblado; result = salida de assemble()
//     onSubmit?(result, source),       Ctrl/Cmd+Enter
//     onExample?(example|null),        cuando se elige un ejemplo
//   }
//   api: {
//     el, getSource(), setSource(text, {silent}), getResult(),   // result: { words, listing, labels, errors, ok }
//     setActiveLine(line|null, kind?),  resalta la línea que se está procesando (kind: 'write'|'pc')
//     setExample(id|null), focus(), destroy()
//   }
// El ensamblado es automático (con debounce): no hay botón "Ensamblar". Los errores salen como marcas
// en la línea (subrayado ondulado + punto rojo en el margen + mensaje al final de la línea).
import { h, clear, debounce } from '../dom.js';
import { assemble } from '../../sim/assembler.js';
import { PIPELINE_TEST } from '../../sim/programs/index.js';
import { bytesToMs, BAUD } from '../../sim/debugUnit.js';

const MNEMONICS = new Set(`lui auipc jal jalr beq bne blt bge bltu bgeu lb lh lw lbu lhu sb sh sw addi slti sltiu xori ori andi slli srli srai
add sub sll slt sltu xor srl sra or and nor ecall ebreak nop li mv not neg j jr ret call la beqz bnez bgt ble bgtu bleu seqz snez`.split(/\s+/));
const ABI = new Set('zero ra sp gp tp t0 t1 t2 t3 t4 t5 t6 s0 fp s1 s2 s3 s4 s5 s6 s7 s8 s9 s10 s11 a0 a1 a2 a3 a4 a5 a6 a7'.split(' '));
const isReg = (w) => /^x([0-9]|[12][0-9]|3[01])$/.test(w) || ABI.has(w);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (c, s) => `<span class="t-${c}">${esc(s)}</span>`;

// HTML coloreado de UNA línea de ensamblador (exportado para tests y para reutilizar en listados).
export function highlightLine(line) {
  const ci = (() => { const a = line.indexOf('#'), b = line.indexOf('//'); return a < 0 ? b : b < 0 ? a : Math.min(a, b); })();
  const code = ci < 0 ? line : line.slice(0, ci);
  const comment = ci < 0 ? '' : line.slice(ci);
  let out = '';
  let first = true;
  const re = /(\s+)|([A-Za-z_.$][\w.$]*)(\s*:)|(\.[A-Za-z]+)|(-?0x[0-9a-fA-F]+|-?\d+)|([A-Za-z_$][\w.$]*)|([(),])|(.)/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[1]) out += esc(m[1]);
    else if (m[2]) { out += span('label', m[2]) + span('punct', m[3]); }
    else if (m[4]) { out += span('dir', m[4]); first = false; }
    else if (m[5]) out += span('num', m[5]);
    else if (m[6]) {
      const w = m[6], lw = w.toLowerCase();
      if (first) { out += MNEMONICS.has(lw) ? span('mn', w) : span('bad', w); first = false; }
      else if (isReg(lw)) out += span('reg', w);
      else out += span('sym', w);
    } else if (m[7]) out += span('punct', m[7]);
    else out += esc(m[8]);
  }
  if (comment) out += span('cmt', comment);
  return out;
}

export function resolveExamples(examples) {
  return (examples || []).map((e) => (e.code === '__PIPELINE_TEST__' ? { ...e, code: PIPELINE_TEST } : e));
}

export function createAsmEditor(root, opts = {}) {
  const examples = resolveExamples(opts.examples);
  const rows = opts.rows || 10;
  const showInfo = opts.showInfo !== false;
  let result = { words: new Uint32Array(0), listing: [], labels: {}, errors: [], ok: true };
  let active = null, activeKind = 'write', curLine = 1, lastLines = 0, exampleId = null;

  const gutter = h('div', { class: 'ae-gutter', 'aria-hidden': 'true' });
  const pre = h('div', { class: 'ae-pre', 'aria-hidden': 'true' });
  const ta = h('textarea', { class: 'ae-ta', spellcheck: 'false', wrap: 'off', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', placeholder: opts.placeholder || 'addi x1, x0, 5', 'aria-label': 'Código ensamblador RISC-V' });
  const main = h('div', { class: 'ae-main' }, pre, ta);
  const body = h('div', { class: 'ae-body', style: { '--rows': rows } }, h('div', { class: 'ae-gutter-wrap' }, gutter), main);
  const info = h('div', { class: 'ae-info' });
  const sel = h('select', { class: 'ae-select', 'aria-label': 'Cargar un ejemplo', onchange: () => {
    const ex = examples.find((e) => e.id === sel.value);
    if (!ex) return;
    exampleId = ex.id;
    setSource(ex.code);
    if (opts.onExample) opts.onExample(ex);
  } }, h('option', { value: '' }, 'Ejemplos…'), examples.map((e) => h('option', { value: e.id }, e.title)));
  const head = examples.length ? h('div', { class: 'ae-head' }, h('span', { class: 'ae-title' }, h('i', { class: 'ae-dot' }), 'Ensamblador RV32I'), sel) : null;
  const el = h('div', { class: 'asm-ed' }, head, body, showInfo ? info : null);
  root.append(el);

  function render() {
    const lines = ta.value.split('\n');
    const errMap = new Map();
    for (const e of result.errors) if (!errMap.has(e.line)) errMap.set(e.line, e.msg);
    const gf = document.createDocumentFragment(), pf = document.createDocumentFragment();
    lines.forEach((ln, i) => {
      const n = i + 1;
      const g = h('div', { class: 'ae-gl' + (errMap.has(n) ? ' err' : '') + (n === curLine ? ' cur' : '') + (n === active ? ' act ' + activeKind : ''), title: errMap.get(n) || null }, String(n));
      gf.append(g);
      const p = h('div', { class: 'ae-ln' + (n === curLine ? ' cur' : '') + (errMap.has(n) ? ' err' : '') + (n === active ? ' act ' + activeKind : ''), html: highlightLine(ln) || '&#8203;' });
      if (errMap.has(n)) p.dataset.err = '‹ ' + errMap.get(n);
      pf.append(p);
    });
    clear(gutter).append(gf);
    clear(pre).append(pf);
    lastLines = lines.length;
    syncScroll();
  }
  function syncScroll() {
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
  }
  function updateInfo() {
    if (!showInfo) return;
    const n = result.words.length;
    clear(info);
    if (!result.ok) {
      const e = result.errors[0];
      info.className = 'ae-info bad';
      info.append(h('b', {}, `Línea ${e.line}`), ` · ${e.msg}`);
      if (result.errors.length > 1) info.append(h('span', { class: 'ae-more' }, ` (+${result.errors.length - 1} más)`));
      return;
    }
    const frame = 3 + 4 * n;
    const over = 4 * n > 1024;
    info.className = 'ae-info' + (over ? ' warn' : ' ok');
    info.append(h('b', {}, `${n} instrucciones`), ` · ${4 * n} B · trama L de ${frame} B ≈ `, h('b', {}, `${bytesToMs(frame).toFixed(0)} ms`), ` a ${BAUD} baudios`);
    if (over) info.append(h('span', { class: 'ae-more' }, ' · no entra en la IMEM (256 palabras): la debug unit contesta E'));
  }
  function doAssemble() {
    const src = ta.value;
    let r;
    try { r = assemble(src); } catch (e) { r = { words: new Uint32Array(0), listing: [], labels: {}, errors: [{ line: 1, msg: String(e.message || e) }] }; }
    result = { ...r, ok: !(r.errors && r.errors.length) };
    render(); updateInfo();
    if (opts.onChange) opts.onChange(result, src);
  }
  const later = debounce(doAssemble, opts.debounceMs || 220);

  function caretLine() { return ta.value.slice(0, ta.selectionStart).split('\n').length; }
  function onCaret() { const l = caretLine(); if (l !== curLine) { curLine = l; render(); } }

  ta.addEventListener('input', () => { exampleId = null; sel.value = ''; curLine = caretLine(); render(); later(); });
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keyup', onCaret);
  ta.addEventListener('click', onCaret);
  ta.addEventListener('focus', onCaret);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      if (e.shiftKey) {
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const m = /^ {1,4}/.exec(v.slice(ls));
        if (m) { ta.setRangeText('', ls, ls + m[0].length, 'preserve'); ta.selectionStart = Math.max(ls, s - m[0].length); ta.selectionEnd = Math.max(ls, en - m[0].length); }
      } else if (s !== en && v.slice(s, en).includes('\n')) {
        const ls = v.lastIndexOf('\n', s - 1) + 1;
        const block = v.slice(ls, en).replace(/^/gm, '    ');
        ta.setRangeText(block, ls, en, 'select');
      } else ta.setRangeText('    ', s, en, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault(); doAssemble();
      if (opts.onSubmit) opts.onSubmit(result, ta.value);
    } else if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      // conserva la sangría de la línea anterior
      const s = ta.selectionStart, v = ta.value;
      const ls = v.lastIndexOf('\n', s - 1) + 1;
      const ind = /^[ \t]*/.exec(v.slice(ls, s))[0];
      if (ind) { e.preventDefault(); ta.setRangeText('\n' + ind, s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  });

  function setSource(text, { silent = false } = {}) {
    ta.value = text;
    ta.scrollTop = 0;
    curLine = 1;
    if (silent) { render(); return; }
    doAssemble();
  }
  setSource(opts.source != null ? opts.source : (examples[0] ? examples[0].code : ''), { silent: false });
  if (opts.source == null && examples[0]) { exampleId = examples[0].id; sel.value = exampleId; }

  return {
    el,
    getSource: () => ta.value,
    setSource,
    getResult: () => result,
    flush: doAssemble,
    setActiveLine(line, kind = 'write') {
      if (line === active && kind === activeKind) return;
      active = line; activeKind = kind; render();
      if (line != null) {
        const lh = parseFloat(getComputedStyle(pre.firstChild || el).height) || 20;
        const top = (line - 1) * lh;
        if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - lh * 2) { ta.scrollTop = Math.max(0, top - ta.clientHeight / 2); syncScroll(); }
      }
    },
    setExample(id) { exampleId = id; sel.value = id || ''; },
    get exampleId() { return exampleId; },
    focus: () => ta.focus(),
    destroy: () => el.remove(),
  };
}
