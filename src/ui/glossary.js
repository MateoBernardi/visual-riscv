import { GLOSSARY } from '../content/index.js';

// Términos del glosario (src/content/theory.js) en pop-ups y lecciones: subrayado punteado + tooltip al pasar el mouse.
const L = '[\\p{L}\\p{N}_]';
const SKIP = new Set(['CODE', 'PRE', 'A', 'BUTTON', 'SUMMARY', 'KBD', 'H3', 'H4', 'SCRIPT', 'STYLE']);
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TERMS = Object.keys(GLOSSARY).sort((a, b) => b.length - a.length);
const RX = new RegExp(`(?<!${L})(${TERMS.map(esc).join('|')})(?:s|es)?(?!${L})`, 'giu');
const LOOKUP = new Map(TERMS.map((t) => [t.toLowerCase(), t]));

let tip = null;
function tipEl() {
  if (tip) return tip;
  tip = document.createElement('div'); tip.className = 'gloss-tip'; tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip); return tip;
}
function showTip(target) {
  const t = tipEl(); const term = target.dataset.term;
  t.innerHTML = `<b>${term}</b>${GLOSSARY[term] || ''}`;
  t.classList.add('on');
  const r = target.getBoundingClientRect(), w = t.offsetWidth, hgt = t.offsetHeight;
  let x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
  let y = r.top - hgt - 8; if (y < 8) y = r.bottom + 8;
  t.style.left = x + 'px'; t.style.top = y + 'px';
}
const hideTip = () => { if (tip) tip.classList.remove('on'); };

/** Envuelve la primera aparición de cada término del glosario dentro de `root`. */
export function glossify(root) {
  if (!root) return root;
  const used = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      for (let p = n.parentNode; p && p !== root; p = p.parentNode) if (SKIP.has(p.nodeName) || (p.classList && p.classList.contains('gloss'))) return NodeFilter.FILTER_REJECT;
      return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const text = n.nodeValue; RX.lastIndex = 0;
    let m, last = 0, frag = null;
    while ((m = RX.exec(text))) {
      const term = LOOKUP.get(m[1].toLowerCase());
      if (!term || used.has(term)) continue;
      used.add(term);
      frag = frag || document.createDocumentFragment();
      frag.append(text.slice(last, m.index));
      const s = document.createElement('span'); s.className = 'gloss'; s.tabIndex = 0; s.dataset.term = term; s.textContent = m[0];
      s.addEventListener('mouseenter', () => showTip(s)); s.addEventListener('mouseleave', hideTip);
      s.addEventListener('focus', () => showTip(s)); s.addEventListener('blur', hideTip);
      frag.append(s); last = m.index + m[0].length;
    }
    if (frag) { frag.append(text.slice(last)); n.parentNode.replaceChild(frag, n); }
  }
  return root;
}
