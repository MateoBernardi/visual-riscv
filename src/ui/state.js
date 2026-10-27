import { h, clear, hex32, sdec, ABI } from './dom.js';

/**
 * Registros y memoria de datos (viven en el dock inferior, no en el inspector).
 *   createRegisters(root).update({ regs, prevRegs?, pc? })
 *   createMemory(root).update({ dmem, prevDmem?, lastWrite?: {addr} })
 * Resaltan lo que cambió respecto del ciclo anterior.
 */
export function createRegisters(root) {
  const cells = [];
  const grid = h('div', { class: 'rg-grid' }, Array.from({ length: 32 }, (_, i) => {
    const hx = h('b', { class: 'mono rg-hx' }, '0x00000000'), dc = h('span', { class: 'mono rg-dc' }, '0');
    const el = h('div', { class: 'rg-tile zero', title: `x${i} (${ABI[i]})` }, h('div', { class: 'rg-n' }, h('b', { class: 'mono' }, 'x' + i), h('span', {}, ABI[i])), hx, dc);
    cells.push({ el, hx, dc, v: null });
    return el;
  }));
  const pcTag = h('b', { class: 'mono' }, '0x00000000');
  root.append(h('div', { class: 'rg-wrap' },
    h('div', { class: 'rg-bar' }, h('span', { class: 'muted' }, 'Banco de registros de 32 × 32 bits. '), h('span', { class: 'muted' }, 'x0 vale siempre 0 (cableado). Se resalta lo que cambió en el último ciclo. PC = '), pcTag),
    grid));
  function update(d = {}) {
    if (d.pc != null) pcTag.textContent = hex32(d.pc);
    if (!d.regs) return;
    for (let i = 0; i < 32; i++) {
      const v = (d.regs[i] ?? 0) >>> 0, c = cells[i];
      if (c.v !== v) { c.hx.textContent = hex32(v); c.dc.textContent = sdec(v); c.v = v; }
      c.el.classList.toggle('changed', d.prevRegs ? ((d.prevRegs[i] ?? 0) >>> 0) !== v : false);
      c.el.classList.toggle('zero', v === 0);
    }
  }
  return { update };
}

export function createMemory(root) {
  const cells = [];
  const grid = h('div', { class: 'rg-grid mem-grid' }, Array.from({ length: 256 }, (_, i) => {
    const hx = h('b', { class: 'mono rg-hx' }, '0x00000000'), dc = h('span', { class: 'mono rg-dc' }, '0');
    const el = h('div', { class: 'rg-tile mem zero', title: `dmem[${i}] — dirección de byte 0x${(i * 4).toString(16).padStart(4, '0')}` }, h('div', { class: 'rg-n' }, h('b', { class: 'mono' }, '0x' + (i * 4).toString(16).padStart(4, '0')), h('span', {}, `[${i}]`)), hx, dc);
    cells.push({ el, hx, dc, v: null });
    return el;
  }));
  const hideZero = h('input', { type: 'checkbox', checked: true });
  hideZero.checked = true;
  const empty = h('p', { class: 'muted pad', style: { display: 'none' } }, 'Toda la memoria de datos está en cero: todavía ningún store escribió nada.');
  const apply = () => { grid.classList.toggle('hide-zero', hideZero.checked); };
  hideZero.addEventListener('change', apply); apply();
  root.append(h('div', { class: 'rg-wrap' },
    h('div', { class: 'rg-bar' }, h('span', { class: 'muted' }, 'dmem: 256 palabras (1 KB). Dirección de byte arriba, índice de palabra entre corchetes. '),
      h('label', { class: 'toggle small' }, hideZero, h('i'), h('span', {}, 'Ocultar ceros'))),
    empty, grid));
  function update(d = {}) {
    if (!d.dmem) return;
    let any = false;
    const lw = d.lastWrite ? d.lastWrite.addr >>> 2 : -1;
    for (let i = 0; i < 256; i++) {
      const v = (d.dmem[i] ?? 0) >>> 0, c = cells[i];
      if (c.v !== v) { c.hx.textContent = hex32(v); c.dc.textContent = sdec(v); c.v = v; }
      if (v !== 0) any = true;
      c.el.classList.toggle('changed', (d.prevDmem ? ((d.prevDmem[i] ?? 0) >>> 0) !== v : false) || i === lw);
      c.el.classList.toggle('zero', v === 0);
    }
    empty.style.display = any ? 'none' : '';
    grid.style.display = any || !hideZero.checked ? '' : 'none';
  }
  hideZero.addEventListener('change', () => { grid.style.display = ''; });
  return { update };
}
