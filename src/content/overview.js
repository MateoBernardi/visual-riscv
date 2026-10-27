// "¿Qué es esta vista?": la Vista general (placa 3D) es la única raíz; el contenido que antes vivía en las vistas
// top_riscv y riscv_pipeline se muestra acá, en el inspector, cuando no hay ningún bloque seleccionado.
import top from './overview/top_riscv.js';
import cpu from './overview/riscv_pipeline.js';

const sec = (id, title, lead, v) => ({ id, title, lead, module: v.module, file: v.file, explain: v.explain, refs: v.refs || [] });

export const OVERVIEW = {
  intro: '<p>Esta <b>Vista general</b> es un dibujo simplificado del datapath del CPU, con los bloques agrupados por etapa (IF, ID, EX, MEM, WB) y la debug unit, la UART y el reloj/reset a un costado. No es un módulo de Verilog: es la forma más cómoda de ver cómo viajan los datos. Cada bloque abre el módulo real del RTL.</p><p>Para ubicarte en la jerarquía real del RTL, las migas muestran por ejemplo <code>top_riscv › u_cpu › u_alu</code>. Acá abajo está la explicación de los dos módulos que no tienen vista propia.</p>',
  sections: [
    sec('fpga', 'La FPGA (top_riscv)', 'El módulo top que se sintetiza: reloj, reset, UART, debug unit y CPU.', top),
    sec('cpu', 'El CPU (riscv_pipeline)', 'El núcleo de 5 etapas: es lo que muestra la placa 3D.', cpu),
  ],
};
