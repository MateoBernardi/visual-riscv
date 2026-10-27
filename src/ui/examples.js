import { h, clear, levelChip } from './dom.js';

/**
 * Grilla de ejemplos.
 * callbacks: { onLoad(exampleId) }
 * update({ examples })
 */
export function createExamples(root, cb = {}) {
  const box = h('div', { class: 'examples card-col' });
  root.append(box);
  function update({ examples = [] } = {}) {
    clear(box).append(
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, h('span', { class: 'eyebrow' }, 'Ejemplos'), h('h2', {}, 'Programas listos para correr'))),
      h('div', { class: 'ex-grid' }, examples.map((e) => h('article', { class: 'ex-card' },
        h('div', { class: 'ex-top' }, levelChip(e.level), h('span', { class: 'mono ex-n' }, `${(e.code || '').split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length} líneas`)),
        h('h3', {}, e.title),
        h('p', {}, e.summary),
        h('button', { class: 'btn primary small', onclick: () => cb.onLoad && cb.onLoad(e.id) }, 'Cargar y simular')))));
  }
  return { update };
}
