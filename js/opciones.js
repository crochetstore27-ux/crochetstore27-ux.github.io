/* Opciones de personalización de los productos (colores, extras, tarjeta…).
   Cada producto puede tener su propia lista en "opciones". Si no la tiene, se usa la plantilla de su categoría.

   Tipos de opción:
   - colores:  elegir un color   -> valores: [{ nombre, color: "#hex", precio }]
   - opciones: elegir una opción -> valores: [{ nombre, precio }]
   - cantidad: un número (ej: rosas extra) -> precio (por unidad), max
   - texto:    escribir algo (ej: mensaje de la tarjeta) -> precio, ayuda
*/

export const COLORES = {
  Rojo: "#d32f2f",
  Rosado: "#f06292",
  "Rosado claro": "#f8bbd0",
  Fucsia: "#e91e63",
  Blanco: "#ffffff",
  Crema: "#f5ead6",
  Amarillo: "#fdd835",
  Naranja: "#fb8c00",
  Celeste: "#81d4fa",
  Azul: "#1e4fd8",
  Lila: "#ce93d8",
  Morado: "#7b1fa2",
  Verde: "#66bb6a",
  Café: "#8d6e63",
  Negro: "#222222",
  Gris: "#9e9e9e",
};
export const colorDe = (nombre) => {
  const n = String(nombre || "").trim().toLowerCase();
  const k = Object.keys(COLORES).find((c) => c.toLowerCase() === n);
  return k ? COLORES[k] : "#eeeeee";
};

const lista = (nombres) => nombres.map((n) => ({ nombre: n, color: COLORES[n], precio: 0 }));
const id = () => Math.random().toString(36).slice(2, 8);

export const PLANTILLAS = {
  Ramos: () => [
    { id: id(), tipo: "colores", titulo: "Color de las flores", obligatorio: true, valores: lista(["Rojo", "Rosado", "Rosado claro", "Blanco", "Amarillo", "Azul", "Lila", "Morado", "Naranja"]) },
    { id: id(), tipo: "opciones", titulo: "Color del papel", obligatorio: false, valores: [{ nombre: "Rosado", precio: 0 }, { nombre: "Blanco", precio: 0 }, { nombre: "Kraft (café)", precio: 0 }, { nombre: "Negro", precio: 0 }, { nombre: "Azul", precio: 0 }] },
    { id: id(), tipo: "cantidad", titulo: "Flores extra", precio: 0, max: 12, ayuda: "El costo extra te lo confirmamos" },
    { id: id(), tipo: "texto", titulo: "Mensaje para la tarjeta", precio: 0, ayuda: "Ej: ¡Feliz cumpleaños, mamá! 💕" },
  ],
  "Gorritos para mascotas": () => [
    { id: id(), tipo: "opciones", titulo: "Talla", obligatorio: true, valores: [{ nombre: "Gatito", precio: 0 }, { nombre: "Gato adulto", precio: 0 }, { nombre: "Perrito pequeño", precio: 0 }, { nombre: "Perrito mediano", precio: 0 }] },
    { id: id(), tipo: "colores", titulo: "Color principal", obligatorio: false, valores: lista(["Rosado", "Naranja", "Amarillo", "Verde", "Lila", "Celeste", "Blanco", "Rojo"]) },
    { id: id(), tipo: "texto", titulo: "Nombre de tu mascota", precio: 0, ayuda: "Opcional, para saber a quién se lo hacemos 🐾" },
  ],
  general: () => [
    { id: id(), tipo: "colores", titulo: "Color", obligatorio: false, valores: lista(["Rojo", "Rosado", "Blanco", "Amarillo", "Azul", "Lila", "Morado", "Verde"]) },
    { id: id(), tipo: "texto", titulo: "Detalles que quieras agregar", precio: 0, ayuda: "Ej: con un lazo blanco" },
  ],
};
PLANTILLAS.Flores = PLANTILLAS.Ramos;

export function plantillaPara(categoria) {
  const c = String(categoria || "").toLowerCase();
  if (/gorr|mascota|gat|perr/.test(c)) return PLANTILLAS["Gorritos para mascotas"]();
  if (/ramo|flor|rosa|tulip/.test(c)) return PLANTILLAS.Ramos();
  return PLANTILLAS.general();
}

export function opcionesDe(p) {
  return Array.isArray(p.opciones) ? p.opciones : plantillaPara(p.category);
}

/* eleccion = { [idOpcion]: valor }  (texto del color/opción, número de cantidad o texto)
   Devuelve { extraUnidad, detalle: [{ titulo, valor, precio }] } */
export function resumen(p, eleccion) {
  const detalle = [];
  let extra = 0;
  for (const o of opcionesDe(p)) {
    const v = eleccion[o.id];
    if (v == null || v === "" || v === 0) continue;
    if (o.tipo === "cantidad") {
      const precio = (Number(o.precio) || 0) * v;
      extra += precio;
      detalle.push({ titulo: o.titulo, valor: String(v), precio });
    } else if (o.tipo === "texto") {
      const precio = Number(o.precio) || 0;
      extra += precio;
      detalle.push({ titulo: o.titulo, valor: String(v), precio });
    } else {
      const val = (o.valores || []).find((x) => x.nombre === v);
      const precio = val ? Number(val.precio) || 0 : 0;
      extra += precio;
      detalle.push({ titulo: o.titulo, valor: String(v), precio });
    }
  }
  return { extraUnidad: extra, detalle };
}
