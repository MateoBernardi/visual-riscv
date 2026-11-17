import { h, clear } from './dom.js';
import { glossify } from './glossary.js';
import { VERIF, p4 } from '../content/verification.js';

const ext = (href, text, cls) => h('a', { href, target: '_blank', rel: 'noopener', class: cls }, text);
const prose = (html) => { const d = h('div', { class: 'prose', html }); glossify(d); return d; };

/**
 * Vista "Verificación": las capas de verif/ en el orden del flujo, y las herramientas con sus repos.
 * callbacks: { onLesson(id) }  (link a la lección relacionada)
 */
export function createVerification(root, cb = {}) {
  const box = h('div', { class: 'verif card-col' });
  root.append(box);
  const layerName = {};
  for (const s of VERIF.stages) for (const l of s.layers) layerName[l.id] = l.name;

  function toolCard(t) {
    return h('article', { class: 'vt-card', id: 'tool-' + t.id },
      h('div', { class: 'vt-top' }, ext(t.href, t.name + ' ↗', 'vt-name'), h('span', { class: 'vt-role' }, t.role)),
      prose(`<p>${t.why}</p>`),
      h('div', { class: 'vt-used' }, h('span', { class: 'muted small' }, 'Se usa en:'), t.usedBy.map((id) => h('button', { class: 'chip vt-chip', type: 'button', onclick: () => jump('layer-' + id) }, layerName[id] || id))));
  }
  function layerCard(l) {
    const tools = VERIF.tools.filter((t) => t.usedBy.includes(l.id));
    return h('article', { class: 'vl-card', id: 'layer-' + l.id },
      h('div', { class: 'vl-top' }, h('b', {}, l.name), h('span', { class: 'vl-res' }, l.result)),
      prose(`<p>${l.what}</p>`),
      h('div', { class: 'vl-why' }, prose(`<p><b>Por qué:</b> ${l.why}</p>`)),
      h('div', { class: 'vl-links' },
        ext(p4(l.readme), 'README en el repo ↗'),
        tools.map((t) => h('button', { class: 'chip vt-chip', type: 'button', title: t.role, onclick: () => jump('tool-' + t.id) }, t.name))));
  }
  function jump(id) {
    const el = box.querySelector('#' + id);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function render() {
    clear(box).append(
      h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, h('span', { class: 'eyebrow' }, 'Verificación'), h('h2', {}, VERIF.title))),
      h('p', { class: 'lead small-lead' }, VERIF.lead),
      h('div', { class: 'vf-cmd' }, h('code', {}, VERIF.command), ext(p4('verif/README.md'), 'verif/README.md ↗'), ext(p4('RESULTADOS.md'), 'RESULTADOS.md ↗')),
      h('h3', { class: 'hero-h' }, 'Cuatro ideas'),
      h('div', { class: 'vp-grid' }, VERIF.principles.map((p) => h('div', { class: 'vp' }, h('b', {}, p.title), prose(p.html)))),
      h('h3', { class: 'hero-h' }, 'Las capas, en el orden del flujo'),
      h('ol', { class: 'vs-flow' }, VERIF.stages.map((s, i) => h('li', { class: 'vs' },
        h('div', { class: 'vs-head' }, h('span', { class: 'vs-n' }, String(i + 1)), h('div', {}, h('b', {}, s.title), h('span', { class: 'vs-q' }, s.question))),
        h('div', { class: 'vs-layers' }, s.layers.map(layerCard))))),
      h('section', { class: 'vd' }, h('h3', {}, VERIF.decision.title), prose(VERIF.decision.html),
        h('div', { class: 'vl-links' }, ext(p4(VERIF.decision.readme) + '#variantes-probar-ideas-sin-vivado', 'La evaluación completa ↗'),
          cb.onLesson ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => cb.onLesson('load-use') }, 'Lección: load-use') : null)),
      h('h3', { class: 'hero-h' }, 'Herramientas y repositorios'),
      h('div', { class: 'vt-grid' }, VERIF.tools.map(toolCard)));
  }
  render();
  return { update: render, jump };
}
