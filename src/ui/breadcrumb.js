import { h, clear } from './dom.js';
import { VIEWS, breadcrumb, rtlPath } from '../content/modules/index.js';
import { githubUrl } from '../content/repo.js';

/**
 * Barra de migas arriba al centro de la escena cuando se está dentro de un módulo.
 *   createBreadcrumb(root, { onBoard(), onCrumb(viewId), onUp() }) -> { update(schema|null), el }
 * "Vista general › alu_tp1": cada miga es clickeable salvo la actual. Debajo, la ruta en la jerarquía real del RTL (top_riscv › u_cpu › u_alu).
 */
export function createBreadcrumb(root, cb = {}) {
  const el = h('nav', { class: 'crumbs', 'aria-label': 'Ubicación dentro del diseño', hidden: true });
  const rtl = h('div', { class: 'crumb-rtl', hidden: true });
  root.append(el, rtl);
  const label = (v) => v.instance || v.module || v.title || v.id;
  const kindOf = (v) => (v.pseudo ? 'lógica inline' : 'módulo');
  const tipOf = (v) => (v.pseudo
      ? `${v.title}: no es un módulo aparte; es lógica escrita inline dentro de ${v.module}, separada acá para entenderla mejor.`
      : `${v.instance ? 'Instancia ' + v.instance + ' del módulo ' : 'Módulo '}${v.module} (${v.file}).`);
  function update(schema) {
    clear(el);
    if (!schema) { el.hidden = true; rtl.hidden = true; return; }
    el.hidden = false;
    const ids = breadcrumb(schema.id);
    el.append(h('button', { class: 'crumb-up', title: 'Subir un nivel (Esc)', onclick: () => cb.onUp && cb.onUp() }, '‹ Subir'));
    el.append(h('button', { class: 'crumb crumb-board', title: 'Vista general: diagrama simplificado del datapath (bloques agrupados por etapa). No es un módulo del RTL; es un dibujo para orientarse. Volver ahí.', onclick: () => cb.onBoard && cb.onBoard() }, 'Vista general'));
    ids.forEach((id, i) => {
      const v = VIEWS[id]; if (!v) return;
      el.append(h('span', { class: 'crumb-sep' }, '›'));
      const last = i === ids.length - 1;
      el.append(last
        ? h('span', { class: 'crumb cur', title: tipOf(v) }, label(v), h('i', { class: 'crumb-k' }, kindOf(v)))
        : h('button', { class: 'crumb', title: tipOf(v), onclick: () => cb.onCrumb && cb.onCrumb(id) }, label(v), h('i', { class: 'crumb-k' }, kindOf(v))));
    });
    el.append(h('span', { class: 'crumb-title' }, schema.title));
    const path = rtlPath(schema.id);
    clear(rtl); rtl.hidden = !path.length;
    rtl.append('en el RTL: ', h('a', { href: githubUrl('top/top_riscv.v', 'module:top_riscv'), target: '_blank', rel: 'noopener', title: 'Abrir top_riscv.v en GitHub' }, path[0]), ...path.slice(1).map((n, i) => [' › ', h('b', {}, n)]).flat());
  }
  return { update, el };
}
