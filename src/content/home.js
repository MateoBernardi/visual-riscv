// home.js - texto de la pantalla de inicio. Sin DOM.
// HOME = { title, tagline, intro: html, paths: [{id, title, text, cta}], example: {title, text}, facts: [{k, v}], repo: {label, href} }
import { REPO } from './repo.js';

export const HOME = {
  title: 'visual·RISCV',
  tagline: 'Cómo se construye un CPU RISC-V: qué hay que decidir, por qué, y cómo saber que funciona.',
  intro: '<p>La guía recorre un <b>RV32I de 5 etapas</b> desde la ISA hasta la placa. En cada paso plantea el problema, las opciones y cómo elegir entre ellas, para que puedas encarar tu propio diseño.</p><p>Para que no quede en teoría, todo se muestra sobre un <b>CPU de ejemplo</b> real: un RV32I en Verilog que corre en una FPGA Nexys4 DDR. Podés verlo por dentro, simularlo ciclo a ciclo y leer su código.</p>',
  paths: [
    { id: 'entender', title: 'Cómo funciona un CPU segmentado', text: 'Nueve lecciones: cada problema de diseño, sus soluciones y cómo elegir.', cta: 'Empezar' },
    { id: 'construir', title: 'Construí tu propio RISC-V', text: 'Siete pasos, en el orden en que conviene darlos.', cta: 'Ver los pasos' },
    { id: 'simular', title: 'Simular', text: 'Elegí un programa y mirá cómo viaja por un pipeline real.', cta: 'Abrir el simulador' },
    { id: 'verificacion', title: 'Cómo verificar un CPU', text: 'Qué prueba cada capa, de la spec a la placa, y con qué herramientas.', cta: 'Ver la verificación' },
    { id: 'debug', title: 'Debug por UART', text: 'Un protocolo para cargar y observar un CPU, byte a byte.', cta: 'Abrir la consola' },
  ],
  example: { title: 'El CPU de ejemplo', text: 'RV32I de 5 etapas con forwarding, en una Nexys4 DDR.' },
  facts: [
    { k: '70 MHz', v: '' },
    { k: 'CPI 1,34–1,62', v: 'medido en la placa' },
    { k: '45/45', v: 'chequeos de riscv-formal' },
    { k: '39/39', v: 'tests oficiales de RV32I' },
  ],
  repo: { label: 'Ver Repo en GitHub', href: `https://github.com/${REPO.owner}/${REPO.repo}` },
};
