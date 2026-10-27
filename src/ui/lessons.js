import { glossify } from './glossary.js';
import { h, clear, levelChip, safeStorage } from './dom.js';
import { TRACKS, BUILD_CHECKLIST, TEST_CATEGORIES, BLOCK_INFO } from '../content/index.js';

const TRACK_ORDER = ['entender', 'construir'];
const blockTitle = (id) => (BLOCK_INFO[id] ? BLOCK_INFO[id].title : id);

/**
 * Lecciones: lista agrupada por recorrido y lección en una sola vista con scroll.
 * callbacks: {
 *   onSelect(lesson|null),                    al abrir una lección o volver a la lista
 *   onLoadExample(exampleId, lesson),         botón "Cargar ejemplo"
 *   onWatch(blockId, lesson),                 un ítem de "Qué mirar en la animación"
 *   onLoadProgram(program, category),         botón "Cargar en el simulador" de los programas de prueba
 * }
 * update({ lessons, activeId?, scrollTo?: 'entender'|'construir' })   activeId=null vuelve a la lista.
 * El progreso (lecciones vistas) y la lista de preparación se guardan en localStorage (con try/catch).
 */
export function createLessons(root, cb = {}) {
  const store = safeStorage();
  let lessons = [], activeId = null;
  const load = (k) => { try { return new Set(JSON.parse(store.get(k) || '[]')); } catch { return new Set(); } };
  const seen = load('vr-lessons-seen'), checked = load('vr-build-checked');
  const save = (k, s) => store.set(k, JSON.stringify([...s]));
  const box = h('div', { class: 'lessons card-col' });
  root.append(box);
  const prose = (html) => { const d = h('div', { class: 'prose', html }); glossify(d); return d; };

  // ---------- lista ----------
  function trackBlock(tid) {
    const t = TRACKS[tid];
    const list = lessons.filter((l) => l.track === tid);
    const done = list.filter((l) => seen.has(l.id)).length;
    const sec = h('section', { class: 'trk trk-' + tid, id: 'trk-' + tid },
      h('div', { class: 'trk-head' },
        h('div', { class: 'trk-t' }, h('span', { class: 'eyebrow' }, tid === 'entender' ? 'Recorrido 1' : 'Recorrido 2'), h('h2', {}, t.title)),
        h('span', { class: 'progress-pill', title: 'Lecciones vistas' }, `${done}/${list.length}`)),
      h('p', { class: 'trk-blurb' }, t.blurb),
      h('div', { class: 'progress-bar' }, h('i', { style: { width: list.length ? (done / list.length) * 100 + '%' : '0%' } })),
      h('div', { class: 'cards' }, list.map((l, i) => h('button', { class: 'lesson-card' + (seen.has(l.id) ? ' seen' : ''), onclick: () => open(l.id) },
        h('span', { class: 'num' }, String(i + 1).padStart(2, '0')),
        h('span', { class: 'lc-body' }, h('b', {}, l.title), h('span', { class: 'lc-meta' }, levelChip(l.level), l.minutes ? h('span', { class: 'chip' }, `${l.minutes} min`) : null)),
        h('span', { class: 'lc-check' }, seen.has(l.id) ? '✓' : '›')))));
    if (tid === 'construir') sec.append(checklistBlock(), testsBlock());
    return sec;
  }

  function checklistBlock() {
    const n = BUILD_CHECKLIST.length;
    const cnt = h('span', { class: 'progress-pill' }, '');
    const groups = [...new Set(BUILD_CHECKLIST.map((c) => c.group))];
    const refresh = () => { cnt.textContent = `${BUILD_CHECKLIST.filter((c) => checked.has(c.id)).length}/${n}`; };
    const body = h('div', { class: 'ck-body' }, groups.map((g) => h('div', { class: 'ck-group' },
      h('h4', {}, g),
      BUILD_CHECKLIST.filter((c) => c.group === g).map((c) => {
        const inp = h('input', { type: 'checkbox' });
        inp.checked = checked.has(c.id);
        const row = h('div', { class: 'ck-item' + (inp.checked ? ' done' : '') },
          h('label', { class: 'ck-l' }, inp, h('span', { class: 'ck-t' }, c.title)),
          h('details', { class: 'ck-d' }, h('summary', {}, 'Cómo comprobarlo'), prose(c.detail),
            c.step && lessons.some((l) => l.id === c.step) ? h('button', { class: 'btn small ghost', type: 'button', onclick: () => open(c.step) }, 'Ir al paso: ' + lessons.find((l) => l.id === c.step).title) : null));
        inp.addEventListener('change', () => { if (inp.checked) checked.add(c.id); else checked.delete(c.id); save('vr-build-checked', checked); row.classList.toggle('done', inp.checked); refresh(); });
        return row;
      }))));
    refresh();
    return h('details', { class: 'blk-details', open: true },
      h('summary', {}, h('span', { class: 'eyebrow' }, 'Antes de escribir Verilog'), h('b', {}, 'Lista de preparación'), cnt),
      h('p', { class: 'muted small' }, 'Decisiones y tablas que conviene tener resueltas antes de la primera línea. Tu progreso queda guardado en este navegador.'), body);
  }

  function testsBlock() {
    return h('details', { class: 'blk-details' },
      h('summary', {}, h('span', { class: 'eyebrow' }, 'Para verificar tu diseño'), h('b', {}, 'Programas de prueba por categoría'), h('span', { class: 'progress-pill' }, String(TEST_CATEGORIES.reduce((n, c) => n + c.programs.length, 0)))),
      h('p', { class: 'muted small' }, 'Cada programa trae su resultado esperado. Cargalo en el simulador y mirá la pestaña Verificación; pegalo también en tu propio testbench.'),
      TEST_CATEGORIES.map((c) => h('div', { class: 'tc' },
        h('h4', {}, c.title),
        prose(c.what), h('details', { class: 'ck-d' }, h('summary', {}, 'Por qué importa'), prose(c.why)),
        c.programs.map((p) => h('div', { class: 'tc-prog' },
          h('div', { class: 'tc-top' }, h('b', {}, p.title),
            p.stats ? h('span', { class: 'chip', title: 'Instrucciones retiradas / stalls / saltos / ciclos con forwarding' }, `${p.stats.cycles} ciclos`) : null,
            h('button', { class: 'btn small primary', type: 'button', onclick: () => cb.onLoadProgram && cb.onLoadProgram(p, c) }, 'Cargar en el simulador')),
          p.note ? prose(p.note) : null,
          p.knownIssue ? h('div', { class: 'tc-issue' }, prose(p.knownIssue.html)) : null)))));
  }

  function renderList() {
    clear(box);
    box.append(h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, h('span', { class: 'eyebrow' }, 'Lecciones'), h('h2', {}, 'Dos recorridos'))));
    for (const tid of TRACK_ORDER) box.append(trackBlock(tid));
  }

  // ---------- una lección ----------
  function open(id) {
    activeId = id; seen.add(id); save('vr-lessons-seen', seen);
    renderView();
    box.parentElement && (box.parentElement.scrollTop = 0);
    const sc = box.closest('.panel'); if (sc) sc.scrollTop = 0;
    cb.onSelect && cb.onSelect(lessons.find((l) => l.id === id));
  }
  function back() { activeId = null; renderList(); const sc = box.closest('.panel'); if (sc) sc.scrollTop = 0; cb.onSelect && cb.onSelect(null); }
  function renderView() {
    const l = lessons.find((x) => x.id === activeId);
    if (!l) { renderList(); return; }
    clear(box);
    const same = lessons.filter((x) => x.track === l.track);
    const idx = same.indexOf(l);
    const next = l.next ? lessons.find((x) => x.id === l.next) : null;
    box.append(
      h('div', { class: 'lesson-top' },
        h('button', { class: 'btn small ghost', type: 'button', onclick: back }, '‹ Todas las lecciones'),
        h('span', { class: 'eyebrow' }, `${TRACKS[l.track].title} · lección ${idx + 1} de ${same.length}`)),
      h('header', { class: 'lesson-head' },
        h('h2', {}, l.title),
        h('div', { class: 'lesson-chips' }, levelChip(l.level), h('span', { class: 'chip track-chip t-' + l.track }, TRACKS[l.track].title), l.minutes ? h('span', { class: 'chip' }, `${l.minutes} min`) : null)),
      l.intro ? h('p', { class: 'lesson-intro' }, l.intro) : null);
    const article = h('article', { class: 'lesson-body' });
    for (const s of l.sections || []) article.append(h('section', { class: 'lesson-sec' }, h('h3', {}, s.heading), prose(s.html)));
    if (l.watch && l.watch.length) {
      article.append(h('section', { class: 'lesson-sec watch' },
        h('h3', {}, 'Qué mirar en la animación'),
        h('p', { class: 'muted small' }, 'Tocá un ítem para resaltar ese bloque en el 3D.'),
        h('ul', { class: 'watch-list' }, l.watch.map((w) => h('li', {}, h('button', { class: 'watch-item', type: 'button', onclick: (e) => { box.querySelectorAll('.watch-item.on').forEach((n) => n.classList.remove('on')); e.currentTarget.classList.add('on'); cb.onWatch && cb.onWatch(w.block, l); } },
          h('b', {}, w.title), h('span', { class: 'wb' }, blockTitle(w.block)), (() => { const d = h('span', { class: 'wh', html: w.html }); glossify(d); return d; })()))))));
    }
    if (l.repo && l.repo.length) {
      article.append(h('section', { class: 'lesson-sec' },
        h('h3', {}, 'En el repo'),
        h('ul', { class: 'repo-list' }, l.repo.map((r) => h('li', {}, h('a', { href: r.href, target: '_blank', rel: 'noopener' }, r.label + ' ↗'), r.note ? h('span', { class: 'muted' }, ' — ' + r.note) : null)))));
    }
    box.append(article,
      h('div', { class: 'lesson-actions' },
        l.exampleId ? h('button', { class: 'btn primary', type: 'button', onclick: () => cb.onLoadExample && cb.onLoadExample(l.exampleId, l) }, 'Cargar ejemplo') : null,
        next ? h('button', { class: 'btn accent', type: 'button', onclick: () => open(next.id) }, 'Siguiente lección ›') : null));
  }

  function update(d = {}) {
    if (d.lessons) lessons = d.lessons;
    if (d.activeId !== undefined) { activeId = d.activeId; if (activeId) seen.add(activeId); }
    renderView();
    if (d.scrollTo) requestAnimationFrame(() => { const el = box.querySelector('#trk-' + d.scrollTo); if (el) el.scrollIntoView({ block: 'start' }); });
  }
  return { update, open };
}
