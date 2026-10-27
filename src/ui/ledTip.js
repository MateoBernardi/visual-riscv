import { h } from './dom.js';
import { githubUrl } from '../content/repo.js';

const LED_URL = githubUrl('top/top_riscv.v', 'assign:o_led');
const LEDS = {
  halt: { name: 'HALT', bit: 'o_led[2]', sig: 'cpu_halt', color: '#e5533d',
    text: '<b>cpu_halt</b> (viene de <code>wb_halt</code>): un <code>ebreak</code> o <code>ecall</code> llegó a WB y congeló el CPU. Queda prendido hasta que se resetea.' },
  rst: { name: 'RST', bit: 'o_led[1]', sig: 'cpu_reset', color: '#f0a53a',
    text: '<b>cpu_reset</b>: reset del CPU. Se activa con el botón, con el comando <code>X</code> y mientras dura la carga de un programa (<code>L</code>).' },
  en: { name: 'EN', bit: 'o_led[0]', sig: 'cpu_enable', color: '#2fd18a',
    text: '<b>cpu_enable</b> = <code>(run | step) &amp; ~halt &amp; ~dumping</code>: el reloj del CPU avanza. Es el único LED prendido mientras el programa corre.' },
};

/** Tooltip de los LEDs de la placa. show(led, rect) / hide(). */
export function createLedTip(layer) {
  const el = h('div', { class: 'led-tip', role: 'tooltip' });
  layer.append(el);
  function show(led, rect, state) {
    const d = LEDS[led]; if (!d) return hide();
    const on = state && state[led];
    el.innerHTML = '';
    el.append(
      h('div', { class: 'lt-head' }, h('i', { style: { background: d.color } }), h('b', {}, d.name), h('code', {}, d.bit + ' = ' + d.sig), h('span', { class: 'lt-state ' + (on ? 'on' : '') }, on ? 'prendido ahora' : 'apagado ahora')),
      h('div', { class: 'lt-body', html: d.text }),
      h('a', { class: 'lt-gh', href: LED_URL, target: '_blank', rel: 'noopener' }, 'Ver la asignación de o_led en GitHub ↗'));
    el.classList.add('on');
    const lr = layer.getBoundingClientRect();
    const w = el.offsetWidth, hh = el.offsetHeight;
    let x = rect.left + rect.width / 2 - lr.left - w / 2;
    x = Math.max(8, Math.min(x, lr.width - w - 8));
    let y = rect.top - lr.top - hh - 10;
    if (y < 80) y = rect.bottom - lr.top + 10;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  function hide() { el.classList.remove('on'); }
  // el tooltip se puede tocar (link a GitHub): se oculta con un retardo corto
  let t = 0;
  el.addEventListener('pointerenter', () => clearTimeout(t));
  el.addEventListener('pointerleave', hide);
  return {
    show(led, rect, state) { clearTimeout(t); show(led, rect, state); },
    hide() { clearTimeout(t); t = setTimeout(hide, 220); },
  };
}
