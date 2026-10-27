import { h, clear, STAGE_COLORS } from './dom.js';

const MAX_COLS = 60;
const MAX_ROWS = 60;

/**
 * Diagrama clásico de pipeline (cuerpo de la pestaña "Diagrama de ciclos" del dock).
 * callbacks: { onSelect(instrId) }
 * update({ history: snapshot[], selectedId?: number|null })   (history hasta el ciclo actual; el último es el actual)
 */
export function createTimeline(root, cb = {}) {
  const legend = h('div', { class: 'legend' },
    ...['IF', 'ID', 'EX', 'MEM', 'WB'].map((s) => h('span', { class: 'lg' }, h('i', { style: { background: STAGE_COLORS[s] } }), s)),
    h('span', { class: 'lg' }, h('i', { class: 'stall' }), 'stall'),
    h('span', { class: 'lg' }, h('i', { class: 'stall false' }), 'stall falso'),
    h('span', { class: 'lg' }, h('i', { class: 'flush' }), 'flush (descartada)'));
  const scroller = h('div', { class: 'tl-scroll' });
  const empty = h('p', { class: 'muted pad' }, 'Ejecutá un paso para ver cómo avanzan las instrucciones por el pipeline.');
  root.append(h('div', { class: 'timeline-body' }, legend, scroller));
  scroller.append(empty);
  /** Lleva la columna del ciclo actual a la vista (al abrir el dock). */
  function reveal() {
    const cur = scroller.querySelector('th.cur'); if (cur) scroller.scrollLeft = Math.max(0, cur.offsetLeft - scroller.clientWidth + 120);
    scroller.scrollTop = scroller.scrollHeight;
  }

  function build(history) {
    const hist = history.slice(-MAX_COLS);
    const rows = new Map(); // id -> { id, asm, pc, cells: Map(cycle -> {stage, kind}) }
    const prevAt = new Map(); // `${stage}` -> id del ciclo anterior
    for (const snap of hist) {
      const sg = snap.signals || {};
      for (const s of ['IF', 'ID', 'EX', 'MEM', 'WB']) {
        const st = snap.stages[s];
        if (!st || st.id == null || st.kind === 'bubble') continue;
        let r = rows.get(st.id);
        if (!r) { r = { id: st.id, asm: st.asm || '', pc: st.pc, cells: new Map(), first: snap.cycle }; rows.set(st.id, r); }
        let kind = 'ok';
        if (sg.redirect && (s === 'IF' || s === 'ID')) kind = 'flush';
        else if (sg.stall && (s === 'IF' || s === 'ID')) kind = sg.falseStall ? 'stall false' : 'stall';
        r.cells.set(snap.cycle, { stage: s, kind });
      }
    }
    const lastCycle = hist.length ? hist[hist.length - 1].cycle : 0;
    const list = [...rows.values()].sort((a, b) => a.id - b.id).slice(-MAX_ROWS);
    return { cols: hist.map((s) => s.cycle), rows: list, lastCycle };
  }

  function update({ history = [], selectedId = null } = {}) {
    if (!history.length) { clear(scroller).append(empty); return; }
    const { cols, rows, lastCycle } = build(history);
    const thead = h('tr', {}, h('th', { class: 'sticky corner' }, 'Instrucción'), cols.map((c) => h('th', { class: 'cyc' + (c === lastCycle ? ' cur' : '') }, String(c))));
    const body = rows.map((r) => h('tr', { class: 'tl-row' + (r.id === selectedId ? ' sel' : ''), onclick: () => cb.onSelect && cb.onSelect(r.id) },
      h('th', { class: 'sticky asm' }, h('span', { class: 'iid' }, '#' + r.id), h('span', { class: 'mono' }, r.asm)),
      cols.map((c) => {
        const cell = r.cells.get(c);
        if (!cell) return h('td', { class: c === lastCycle ? 'cur' : '' });
        const cls = 'cell ' + (cell.kind === 'ok' ? 's-' + cell.stage : cell.kind);
        return h('td', { class: c === lastCycle ? 'cur' : '' }, h('div', { class: cls, style: cell.kind === 'ok' ? { background: STAGE_COLORS[cell.stage] } : null, title: cell.kind.startsWith('stall') ? (cell.kind === 'stall' ? 'stall (' + cell.stage + ')' : 'stall falso (' + cell.stage + ')') : cell.kind === 'flush' ? 'descartada (flush)' : cell.stage }, cell.kind === 'flush' ? '×' : cell.stage));
      })));
    const prevLeft = scroller.scrollLeft, prevTop = scroller.scrollTop;
    clear(scroller).append(h('table', { class: 'tbl tl' }, h('thead', {}, thead), h('tbody', {}, body)));
    scroller.scrollTop = prevTop; scroller.scrollLeft = prevLeft;
    const cur = scroller.querySelector('th.cur');
    if (cur) {
      const x = cur.offsetLeft, w = scroller.clientWidth;
      if (x > scroller.scrollLeft + w - 60 || x < scroller.scrollLeft + 160) scroller.scrollLeft = Math.max(0, x - w + 120);
    }
    const sel = scroller.querySelector('tr.sel');
    if (sel && (sel.offsetTop < scroller.scrollTop || sel.offsetTop > scroller.scrollTop + scroller.clientHeight - 30)) scroller.scrollTop = sel.offsetTop - 40;
    else if (!sel) scroller.scrollTop = scroller.scrollHeight;
  }
  return { update, reveal };
}
