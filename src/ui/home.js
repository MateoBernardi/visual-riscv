import { h, clear } from './dom.js';
import { HOME } from '../content/index.js';

/**
 * Pantalla de inicio (panel izquierdo): título, intro, números clave, caminos de entrada y link al repo.
 * callbacks: { onPath(pathId) }   pathId: 'entender' | 'construir' | 'simular' | 'verificacion' | 'debug'
 */
export function createHome(root, cb = {}) {
  clear(root);
  root.append(h('div', { class: 'hero card-col' },
    h('span', { class: 'eyebrow' }, 'Guía visual de un RISC-V RV32I'),
    h('h1', {}, HOME.title),
    h('p', { class: 'lead' }, HOME.tagline),
    h('div', { class: 'hero-intro prose', html: HOME.intro }),
    h('div', { class: 'facts' }, HOME.facts.map((f) => h('div', { class: 'fact' }, h('b', {}, f.k), h('span', {}, f.v)))),
    h('h3', { class: 'hero-h' }, 'Por dónde empezar'),
    h('div', { class: 'path-grid' }, HOME.paths.map((p, i) => h('button', { class: 'path-card p-' + p.id + (i === 0 ? ' main' : ''), type: 'button', onclick: () => cb.onPath && cb.onPath(p.id) },
      h('b', {}, p.title),
      h('span', { class: 'pc-t' }, p.text),
      h('span', { class: 'pc-cta' }, p.cta + ' →')))),
    h('a', { class: 'btn ghost hero-repo', href: HOME.repo.href, target: '_blank', rel: 'noopener' }, HOME.repo.label + ' ↗')));
}
