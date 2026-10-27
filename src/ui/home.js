import { h, clear } from './dom.js';
import { HOME } from '../content/index.js';

/**
 * Pantalla de inicio (panel izquierdo): título, intro, caminos de entrada, qué incluye y link al repo.
 * callbacks: { onPath(pathId) }   pathId: 'entender' | 'construir' | 'simular' | 'debug'
 */
export function createHome(root, cb = {}) {
  clear(root);
  root.append(h('div', { class: 'hero card-col' },
    h('span', { class: 'eyebrow' }, 'Guía visual de un RISC-V RV32I'),
    h('h1', {}, HOME.title),
    h('p', { class: 'lead' }, HOME.tagline),
    h('div', { class: 'hero-intro prose', html: HOME.intro }),
    h('h3', { class: 'hero-h' }, 'Por dónde empezar'),
    h('div', { class: 'path-grid' }, HOME.paths.map((p, i) => h('button', { class: 'path-card p-' + p.id, type: 'button', onclick: () => cb.onPath && cb.onPath(p.id) },
      h('span', { class: 'pc-n' }, String(i + 1)),
      h('b', {}, p.title),
      h('span', { class: 'pc-t' }, p.text),
      h('span', { class: 'pc-cta' }, p.cta + ' →')))),
    h('h3', { class: 'hero-h' }, 'Qué incluye'),
    h('div', { class: 'feat-grid' }, HOME.features.map((f) => h('div', { class: 'feat' },
      h('span', { class: 'feat-i', 'aria-hidden': 'true' }, f.icon),
      h('b', {}, f.title),
      h('span', {}, f.text)))),
    h('a', { class: 'btn ghost hero-repo', href: HOME.repo.href, target: '_blank', rel: 'noopener' }, HOME.repo.label + ' ↗')));
}
