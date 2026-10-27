// home.js - texto de la pantalla de inicio. Sin DOM.
// HOME = { title, tagline, intro: html, features: [{icon, title, text}], paths: [{id, title, text, cta}], repo: {label, href} }
export const HOME = {
  title: 'visual·RISCV',
  tagline: 'Una guía visual para entender la implementación de un RV32I hecha en el repositorio.',
  intro: '<p>Esta página espeja un procesador <b>RISC-V RV32I de 5 etapas</b> escrito en Verilog para una FPGA Nexys4 DDR, junto con su <b>debug unit por UART</b>. Cada bloque enlaza al archivo exacto en GitHub.</p><p>La idea es que, con esta guía y el repo, puedas entender el chip completo, las decisiones de diseño y sus alternativas, y luego armar, probar y verificar tu propio RISC-V desde cero.</p>',
  features: [
    { icon: '🧊', title: 'Pipeline en 3D', text: 'Las cinco etapas, los cables y los datos viajando ciclo a ciclo.' },
    { icon: '🔍', title: 'Por dentro', text: 'Entrá a cada módulo: registros, muxes, FSMs y señales reales.' },
    { icon: '⚠️', title: 'Hazards explicados', text: 'Forwarding, load-use y flush, con el hardware que los resuelve.' },
    { icon: '🔌', title: 'Debug por UART', text: 'El protocolo real L/S/R/P/X/D a 19200 baudios.' },
    { icon: '✅', title: 'Verificación', text: 'Cada ejemplo comprueba sus resultados y explica qué prueban.' },
    { icon: '🔗', title: 'Links al RTL', text: 'Cada concepto apunta a la línea exacta del repo.' },
  ],
  paths: [
    { id: 'entender', title: 'Entender este chip', text: 'Doce lecciones: ISA, pipeline, hazards, memoria, HALT, debug unit y UART.', cta: 'Empezar las lecciones' },
    { id: 'construir', title: 'Construí tu propio RISC-V', text: 'Once pasos prácticos desde el subconjunto de ISA hasta una FPGA verificada.', cta: 'Ver la guía de construcción' },
    { id: 'simular', title: 'Simular', text: 'Escribí o elegí un programa y mirá cómo viaja por el pipeline.', cta: 'Abrir el simulador' },
    { id: 'debug', title: 'Debug por UART', text: 'Cargá, ejecutá y volcá el estado con el protocolo de la debug unit.', cta: 'Abrir la consola' },
  ],
  repo: { label: 'Ver el repositorio en GitHub', href: 'https://github.com/MateoBernardi/arquitectura-de-computadoras/tree/tp3-RISCV/project_4' },
};
