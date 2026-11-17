// home.js - texto de la pantalla de inicio. Sin DOM.
// HOME = { title, tagline, intro: html, facts: [{k, v}], paths: [{id, title, text, cta}], repo: {label, href} }
import { REPO } from './repo.js';

export const HOME = {
  title: 'visual·RISCV',
  tagline: 'Por qué el RV32I de este repo está hecho como está, visto por dentro y ciclo a ciclo.',
  intro: '<p>Un procesador <b>RISC-V RV32I de 5 etapas</b> en Verilog, corriendo en una FPGA Nexys4 DDR, con una <b>debug unit por UART</b> para cargarlo y observarlo desde la PC. Cada bloque del tablero enlaza a su archivo en GitHub.</p>',
  facts: [
    { k: '70 MHz', v: 'en el peor caso de timing' },
    { k: 'CPI 1,34–1,62', v: 'medido en la placa' },
    { k: '45/45', v: 'chequeos de riscv-formal' },
    { k: '39/39', v: 'tests oficiales de RV32I' },
  ],
  paths: [
    { id: 'entender', title: 'Entender este chip', text: 'Nueve lecciones cortas: cada una, una decisión de diseño y su por qué.', cta: 'Empezar' },
    { id: 'simular', title: 'Simular', text: 'Elegí un programa y mirá cómo viaja por el pipeline.', cta: 'Abrir el simulador' },
    { id: 'verificacion', title: 'Cómo se verificó', text: 'Las capas de prueba, de la spec a la placa, y los repos de cada herramienta.', cta: 'Ver la verificación' },
    { id: 'construir', title: 'Construí tu propio RISC-V', text: 'Siete pasos, en el orden en que conviene darlos.', cta: 'Ver los pasos' },
    { id: 'debug', title: 'Debug por UART', text: 'El protocolo real de la debug unit, byte a byte.', cta: 'Abrir la consola' },
  ],
  repo: { label: 'Ver project_4 en GitHub', href: `https://github.com/${REPO.owner}/${REPO.repo}/tree/main/project_4` },
};
