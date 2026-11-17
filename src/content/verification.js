// verification.js - cómo verificar un CPU, por capas, con el CPU de ejemplo (project_4/verif) como caso. Sin DOM.
//
// VERIF = { intro, principles: [{title, html}], stages: [{ id, title, question, layers: [...] }], tools: [...], links }
//   layer = { id, name, result, what, why, readme }        readme: ruta dentro de project_4/
//   tool  = { id, name, href, role, why, usedBy: [layer ids] }
import { REPO } from './repo.js';

const TREE = `https://github.com/${REPO.owner}/${REPO.repo}/tree/${REPO.ref}/project_4/`;
const BLOB = `https://github.com/${REPO.owner}/${REPO.repo}/blob/${REPO.ref}/project_4/`;
export const p4 = (path) => (/\.\w+$/.test(path) ? BLOB : TREE) + path;

export const VERIF = {
  title: 'Cómo verificar un CPU',
  lead: 'Ninguna prueba alcanza sola: cada capa responde una pregunta distinta. Conviene correrlas en el orden del flujo de diseño, de lo más barato (el RTL) a lo más real (la placa). Al lado de cada capa está el resultado del CPU de ejemplo, que las corre todas con un solo comando.',
  command: 'verif/run.sh',
  principles: [
    { title: 'Contra la especificación, no contra uno mismo', html: '<p>Si el mismo que escribió el CPU escribe los valores esperados, los dos pueden tener el mismo error. Por eso las pruebas principales tienen que comparar contra modelos <b>independientes</b>: la especificación formal de RV32I (riscv-formal) y Sail, el modelo oficial de la ISA (riscv-arch-test).</p>' },
    { title: 'Para cualquier programa, no para los que elegí', html: '<p>Un testbench prueba los programas que a uno se le ocurrieron. La verificación formal deja que el solver elija <b>cualquier</b> secuencia de instrucciones, incluidas las ilegales y los saltos raros, y busca una que rompa el CPU.</p>' },
    { title: 'Probar que la prueba sirve (mutantes)', html: '<p>Una propiedad que nunca falla puede estar vacía. Armá copias del RTL con un error inyectado a propósito (sacar el stall, escribir en un trap…) y exigí que <b>fallen</b>. Si un mutante pasa, la prueba no está mirando lo que dice mirar.</p>' },
    { title: 'Un SKIP nunca es un PASS', html: '<p>Que una capa dé PASS solo si corrió al menos una prueba y todas dieron bien. Si falta una herramienta, SKIP, y el resultado global no es verde. Así no se confunde "no se probó" con "funciona".</p>' },
  ],
  stages: [
    {
      id: 'rtl', title: 'RTL', question: '¿El Verilog hace lo que dice el manual de RISC-V?',
      layers: [
        { id: 'rvfi', name: 'riscv-formal', result: '45/45 + 7 mutantes',
          what: 'El CPU completo contra la ISA RV32I: cada instrucción retirada se compara con lo que dice la spec, incluidas las excepciones y que el CPU nunca se trabe.',
          why: 'Es la única prueba que cubre <b>todos</b> los programas posibles (BMC desde el reset). En el CPU de ejemplo encontró que un salto desalineado no generaba trap y que un load desalineado escribía rd.',
          readme: 'verif/formal/rvfi/README.md' },
        { id: 'act', name: 'riscv-arch-test', result: '39/39',
          what: 'La suite oficial de RISC-V International: un test por instrucción, autoverificado contra Sail.',
          why: 'Es lo que se usa para decir "cumple RV32I". Complementa al formal con programas largos y reales, en simulación.',
          readme: 'verif/sim/README.md' },
        { id: 'traps', name: 'traps', result: '19/19',
          what: 'Tests dirigidos: la causa y el PC de cada excepción, y que una instrucción del camino equivocado no provoque trap.',
          why: 'La suite oficial lee la causa de una excepción en <code>mcause</code>. Si tu CPU no tiene CSRs, ese hueco lo tenés que cubrir con tests propios.',
          readme: 'verif/sim/README.md' },
        { id: 'formal', name: 'propiedades por módulo', result: '25/25',
          what: 'Cada unidad chica (forwarding, hazards, control del pipeline) con sus <code>assert</code>, probada de forma exhaustiva o por inducción.',
          why: 'Se superponen con riscv-formal a propósito: corren en segundos y señalan el módulo que falla. También cubren lo que riscv-formal no mira, como el contenido de la memoria de datos.',
          readme: 'verif/README.md' },
        { id: 'rendimiento', name: 'rendimiento', result: '14/14',
          what: 'Ciclos y CPI del diseño y de cada variante que quieras evaluar; una variante tiene que terminar con el mismo estado que el diseño base.',
          why: 'Un testbench que mira solo el estado final no ve un ciclo de más. Esta capa sí, y es la que te deja comparar ideas con números. En el CPU de ejemplo decidió el load-use (ver abajo).',
          readme: 'verif/sim/README.md' },
        { id: 'sistema', name: 'sistema', result: '67/67',
          what: 'UART + debug unit + CPU simulados juntos, manejados desde la línea serie como lo haría la PC.',
          why: 'El CPU puede estar bien y el sistema no: un byte mal serializado o un comando que deja el CPU pausado no aparecen probando el pipeline solo.',
          readme: 'verif/system/README.md' },
      ],
    },
    {
      id: 'sintesis', title: 'Síntesis', question: '¿Vivado construyó lo que pide el RTL?',
      layers: [
        { id: 'sintesis', name: 'síntesis', result: '22/22',
          what: 'Cero latches, cada aviso de Vivado justificado por escrito, ninguna lógica secuencial eliminada y cada memoria implementada como la declara el RTL.',
          why: 'La síntesis puede cambiar el diseño en silencio (un <code>always</code> incompleto se vuelve latch). En vez de simular el netlist, se revisan las causas conocidas de diferencias, con mutantes que prueban que el chequeo las detecta.',
          readme: 'verif/fpga/README.md' },
      ],
    },
    {
      id: 'implementacion', title: 'Implementación', question: '¿Llega a tiempo a la frecuencia elegida, en el peor caso?',
      layers: [
        { id: 'implementacion', name: 'implementación', result: '22/22',
          what: 'STA completo: setup, hold y ancho de pulso con margen positivo, nada sin restringir, cruces de reloj seguros, todo ruteado y DRC limpio.',
          why: 'Un camino sin restricción es invisible para el STA y "pasa" sin haberse analizado. Por eso primero se exige que todo esté restringido y recién después se mira el margen. El STA prueba todos los caminos; una simulación con retardos solo los que se ejercitan.',
          readme: 'verif/fpga/README.md' },
      ],
    },
    {
      id: 'placa', title: 'Bitstream y placa', question: '¿La FPGA real hace lo mismo que la simulación?',
      layers: [
        { id: 'bitstream', name: 'bitstream + programar', result: 'PASS',
          what: 'Genera el bitstream de la implementación ya verificada y lo carga por JTAG solo si es de la versión actual del hardware (BUILD_ID).',
          why: 'Evita el error más común en el laboratorio: probar un bitstream viejo y creer que es el nuevo.',
          readme: 'verif/placa/README.md' },
        { id: 'placa', name: 'placa', result: '41/41',
          what: 'Programas y traps corridos en la placa por la UART y comparados con la simulación del RTL: ciclos, registros, memoria y causa del halt.',
          why: 'Es la prueba final de que todo lo anterior se sostiene en el silicio. Como compara contra la simulación, también valida que los números de rendimiento simulados son los de la placa.',
          readme: 'verif/placa/README.md' },
      ],
    },
  ],
  tools: [
    { id: 'riscv-formal', name: 'riscv-formal', href: 'https://github.com/YosysHQ/riscv-formal', role: 'Framework de verificación formal de CPUs RISC-V (interfaz RVFI).',
      why: 'El CPU publica cada instrucción que retira por los puertos RVFI y riscv-formal la compara con la especificación. Nació junto con PicoRV32 y es la forma habitual de verificar cores RISC-V abiertos.', usedBy: ['rvfi'] },
    { id: 'riscv-arch-test', name: 'riscv-arch-test (ACT4)', href: 'https://github.com/riscv-non-isa/riscv-arch-test', role: 'Suite oficial de pruebas de cumplimiento de RISC-V International.',
      why: 'Cada test trae adentro los resultados que calculó Sail, así que el CPU se autoverifica sin un modelo propio.', usedBy: ['act'] },
    { id: 'sail', name: 'Sail RISC-V', href: 'https://github.com/riscv/sail-riscv', role: 'El modelo de referencia formal y ejecutable de la ISA.',
      why: 'Es la especificación oficial escrita como programa: el "golden model" contra el que se calculan los resultados esperados de riscv-arch-test.', usedBy: ['act'] },
    { id: 'yosys', name: 'Yosys', href: 'https://github.com/YosysHQ/yosys', role: 'Síntesis libre de Verilog.',
      why: 'Lee el RTL sin modificarlo y lo convierte en el modelo que analiza el solver. Las señales internas se observan desde el script de Yosys, no tocando el Verilog.', usedBy: ['formal', 'rvfi'] },
    { id: 'sby', name: 'SymbiYosys', href: 'https://github.com/YosysHQ/sby', role: 'Front-end de verificación formal (BMC, inducción, cover).',
      why: 'Cada archivo .sby dice qué probar y con qué método; SymbiYosys llama a Yosys y a los solvers SMT y devuelve PASS, FAIL con contraejemplo, o ERROR.', usedBy: ['formal', 'rvfi'] },
    { id: 'verilator', name: 'Verilator', href: 'https://github.com/verilator/verilator', role: 'Simulador de Verilog que compila el RTL a C++.',
      why: 'Es órdenes de magnitud más rápido que un simulador por eventos: corre las 124 mil instrucciones de riscv-arch-test en segundos.', usedBy: ['act', 'traps', 'rendimiento'] },
    { id: 'iverilog', name: 'Icarus Verilog', href: 'https://github.com/steveicarus/iverilog', role: 'Simulador de Verilog por eventos.',
      why: 'Simula el sistema completo con la UART, sin Vivado, para que la capa de sistema corra en cualquier máquina.', usedBy: ['sistema'] },
    { id: 'oss-cad', name: 'OSS CAD Suite', href: 'https://github.com/YosysHQ/oss-cad-suite-build', role: 'Distribución con Yosys, SymbiYosys, los solvers, Verilator e Icarus.',
      why: 'Fijá una versión (una fecha concreta de la suite): así una corrida de hoy y una de dentro de un año usan las mismas herramientas.', usedBy: ['formal', 'rvfi', 'act', 'sistema'] },
    { id: 'gcc', name: 'GCC RISC-V (xPack)', href: 'https://github.com/xpack-dev-tools/riscv-none-elf-gcc-xpack', role: 'Compilador y ensamblador cruzado para RISC-V.',
      why: 'Compila los tests de riscv-arch-test y los programas de traps a ELF.', usedBy: ['act', 'traps'] },
    { id: 'vivado', name: 'AMD Vivado', href: 'https://www.amd.com/en/products/software/adaptive-socs-and-fpgas/vivado.html', role: 'Síntesis, place & route, STA y bitstream para el Artix-7.',
      why: 'Hace falta para implementar en FPGAs de AMD (como la Artix-7 del ejemplo), solo desde la síntesis en adelante: todo el RTL se puede verificar con herramientas libres.', usedBy: ['sintesis', 'implementacion', 'bitstream'] },
  ],
  decision: {
    title: 'Para qué sirve: la decisión del load-use en el CPU de ejemplo',
    html: `<p>En el diseño anterior el stall de load-use <b>sobraba</b>: el forwarding desde MEM ya entregaba el dato del load. El diseño pagaba un ciclo de stall y además tenía la lectura de la dmem en el camino crítico (50 MHz). Había dos arreglos coherentes y las capas de verificación permitieron compararlos con números:</p>
<ul><li><b>A</b>: sacar el stall. Cumple la ISA, menos ciclos, pero la dmem sigue en el camino crítico: 60 MHz.</li>
<li><b>B</b>: dejar el stall y adelantar el load solo desde WB. Mismos ciclos que antes, sin la dmem en el camino crítico: <b>70 MHz</b>.</li></ul>
<p>B ganó en todos los programas (+8 a +16 % de MIPS sobre A). riscv-formal confirmó que las dos cumplen RV32I, y el mutante <code>no_stall</code> prueba que con B el stall ya es necesario.</p>`,
    readme: 'verif/README.md',
  },
};
