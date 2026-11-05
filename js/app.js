/* Tienda: catálogo, personalización, inicio de sesión, envío de pedidos y "Mis pedidos".
   Si Firebase está configurado, los productos y pedidos viven en la nube; si no, se usan los archivos de /data
   y los pedidos se envían por WhatsApp. */
import * as nube from "./nube.js";
import { opcionesDe, resumen, colorDe } from "./opciones.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const estado = { config: {}, productos: [], categoria: "Todos", busqueda: "", bolsa: [], usuario: null, perfil: null, despuesDeEntrar: null };
window.__tienda = estado;

/* ---------- utilidades ---------- */
export const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dinero = (n) => (estado.config.moneda || "$") + Number(n || 0).toFixed(2);
const tienePrecio = (p) => typeof p.price === "number" && !isNaN(p.price);
const linkWa = (texto, numero) => "https://wa.me/" + (numero || estado.config.whatsapp || "") + (texto ? "?text=" + encodeURIComponent(texto) : "");
export function aviso(msg, ms = 2400) {
  const d = document.createElement("div");
  d.className = "aviso";
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
function abrir(id) {
  $("#" + id).classList.remove("oculto");
  document.body.classList.add("sin-scroll");
}
function cerrar(id) {
  $("#" + id).classList.add("oculto");
  if (!$$(".modal-t:not(.oculto), .celebracion:not(.oculto), .panel-bolsa:not(.oculto)").length) document.body.classList.remove("sin-scroll");
}
$$(".modal-t").forEach((m) =>
  m.addEventListener("click", (e) => {
    if (e.target === m || e.target.closest("[data-cerrar]")) cerrar(m.id);
  })
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") $$(".modal-t:not(.oculto)").forEach((m) => cerrar(m.id));
});

/* ---------- fotos (pueden estar en la carpeta img/ o guardadas en la nube) ---------- */
const cacheFotos = new Map();
export async function urlFoto(ref) {
  if (!ref) return "";
  if (!ref.startsWith("fotos/")) return ref;
  if (cacheFotos.has(ref)) return cacheFotos.get(ref);
  const prom = nube.F.getDoc(nube.F.doc(nube.db, ref)).then((d) => (d.exists() ? d.data().data : ""));
  cacheFotos.set(ref, prom);
  return prom;
}
export function ponerFotos(raiz = document) {
  $$("img[data-foto]", raiz).forEach(async (img) => {
    const ref = img.dataset.foto;
    img.removeAttribute("data-foto");
    const url = await urlFoto(ref);
    if (url) img.src = url;
  });
}
const imgFoto = (ref, alt = "", extra = "") => (ref ? `<img data-foto="${esc(ref)}" alt="${esc(alt)}" ${extra}>` : "");

/* ---------- carga de datos ---------- */
async function cargarJson(ruta) {
  return fetch(ruta + "?v=" + Date.now()).then((r) => r.json());
}
async function iniciar() {
  try {
    estado.config = await cargarJson("data/config.json");
  } catch (e) {}
  if (nube.activa) {
    try {
      const d = await nube.F.getDoc(nube.F.doc(nube.db, "ajustes", "tienda"));
      if (d.exists()) estado.config = { ...estado.config, ...d.data() };
    } catch (e) {}
    pintarTextos();
    nube.F.onSnapshot(
      nube.F.collection(nube.db, "productos"),
      async (snap) => {
        if (snap.empty) {
          // todavía no se pasó el catálogo a la nube
          estado.productos = (await cargarJson("data/products.json")).filter((p) => p.visible !== false);
        } else {
          estado.productos = snap.docs
            .map((d) => ({ ...d.data(), id: d.id }))
            .filter((p) => p.visible !== false)
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
        }
        listo();
      },
      async () => {
        estado.productos = (await cargarJson("data/products.json")).filter((p) => p.visible !== false);
        listo();
      }
    );
  } else {
    try {
      estado.productos = (await cargarJson("data/products.json")).filter((p) => p.visible !== false);
    } catch (e) {
      $("#grilla").innerHTML = '<p class="vacio">No se pudo cargar el catálogo. Intenta recargar la página.</p>';
      return;
    }
    pintarTextos();
    listo();
  }
}
let primeraVez = true;
function listo() {
  if (primeraVez) cargarBolsa();
  primeraVez = false;
  pintarFiltros();
  pintarProductos();
  pintarCollage();
  pintarBolsa();
}

/* ---------- textos ---------- */
function pintarTextos() {
  const c = estado.config;
  $$("[data-nombre]").forEach((el) => (el.textContent = c.nombre || "Mi tienda"));
  document.title = (c.nombre || "Mi tienda") + " · Crochet hecho a mano";
  $("#eslogan").textContent = c.eslogan || "";
  $("#descripcion").textContent = c.descripcion || "";
  $("#textoPedidos").textContent = c.textoPedidos || "";
  $("#anio").textContent = new Date().getFullYear();
  const saludo = "¡Hola " + (c.nombre || "") + "! 😊 Quisiera información sobre sus productos.";
  $$("[data-wa]").forEach((a) => {
    a.href = linkWa(saludo);
    a.target = "_blank";
    a.rel = "noopener";
  });
  const ig = $("#enlaceInstagram");
  if (c.instagram) ig.href = "https://instagram.com/" + c.instagram.replace(/^@/, "");
  else ig.classList.add("oculto");
  $("#btnPersonalizadoNube").classList.toggle("oculto", !nube.activa);
  $("#btnPersonalizadoWa").classList.toggle("btn-chico", nube.activa);
  if (nube.activa) $("#btnPersonalizadoWa").lastChild.textContent = " Prefiero por WhatsApp";
  $("#enviarBolsaWa").classList.toggle("oculto", !nube.activa);
  if (!nube.activa) $("#enviarBolsa").textContent = "Enviar pedido por WhatsApp";
}

function pintarCollage() {
  const fotos = estado.productos.filter((p) => p.image).sort((a, b) => tienePrecio(b) - tienePrecio(a));
  $("#collage").innerHTML = fotos
    .slice(0, 3)
    .map((p) => imgFoto(p.image))
    .join("");
  ponerFotos($("#collage"));
}

/* ---------- filtros ---------- */
function categorias() {
  const orden = estado.config.categorias || [];
  const usadas = [...new Set(estado.productos.map((p) => p.category || "Otros"))];
  usadas.sort((a, b) => (orden.indexOf(a) + 1 || 999) - (orden.indexOf(b) + 1 || 999));
  return ["Todos", ...usadas];
}
function pintarFiltros() {
  if (!categorias().includes(estado.categoria)) estado.categoria = "Todos";
  $("#filtros").innerHTML = categorias()
    .map((c) => `<button class="chip ${c === estado.categoria ? "activo" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`)
    .join("");
}
$("#filtros").addEventListener("click", (e) => {
  const b = e.target.closest("[data-cat]");
  if (!b) return;
  estado.categoria = b.dataset.cat;
  pintarFiltros();
  pintarProductos();
});
$("#buscar").addEventListener("input", (e) => {
  estado.busqueda = e.target.value.trim().toLowerCase();
  pintarProductos();
});

/* ---------- productos ---------- */
const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function textoPrecio(p) {
  if (!tienePrecio(p)) return `<div class="precio consultar">Precio a consultar</div>`;
  const conExtras = opcionesDe(p).some((o) => Number(o.precio) > 0 || (o.valores || []).some((v) => Number(v.precio) > 0));
  return `<div class="precio">${conExtras ? "<small>desde</small> " : ""}${dinero(p.price)}</div>`;
}
function pintarProductos() {
  const q = sinAcentos(estado.busqueda);
  const lista = estado.productos.filter((p) => {
    if (estado.categoria !== "Todos" && (p.category || "Otros") !== estado.categoria) return false;
    if (q && !sinAcentos([p.name, p.description, p.category].join(" ")).includes(q)) return false;
    return true;
  });
  if (!lista.length) {
    $("#grilla").innerHTML = '<p class="vacio">No encontramos productos. Prueba con otra palabra o pídelo personalizado 💕</p>';
    return;
  }
  $("#grilla").innerHTML = lista
    .map(
      (p) => `
    <article class="tarjeta" data-abrir="${esc(p.id)}">
      <div class="foto">
        ${imgFoto(p.image, p.name, 'loading="lazy"')}
        <span class="etiqueta-cat">${esc(p.category || "")}</span>
        <span class="etiqueta-perso">✨ Personalizable</span>
      </div>
      <div class="info">
        <h3>${esc(p.name)}</h3>
        ${p.description ? `<p class="nota">${esc(p.description)}</p>` : ""}
        ${textoPrecio(p)}
        <div class="botones">
          <button class="btn btn-rosa">Personalizar y pedir</button>
        </div>
      </div>
    </article>`
    )
    .join("");
  ponerFotos($("#grilla"));
}
$("#grilla").addEventListener("click", (e) => {
  const t = e.target.closest("[data-abrir]");
  if (t) abrirProducto(t.dataset.abrir);
});

/* ---------- ventana de personalizar ---------- */
const vp = { p: null, eleccion: {}, cant: 1 };
function abrirProducto(id) {
  const p = estado.productos.find((x) => x.id === id);
  if (!p) return;
  vp.p = p;
  vp.eleccion = {};
  vp.cant = 1;
  $("#vpFoto").removeAttribute("src");
  urlFoto(p.image).then((u) => u && ($("#vpFoto").src = u));
  $("#vpCat").textContent = p.category || "";
  $("#vpNombre").textContent = p.name;
  $("#vpDesc").textContent = p.description || "";
  $("#vpPrecio").innerHTML = tienePrecio(p) ? dinero(p.price) : '<span class="consultar">Precio a consultar</span>';
  $("#vpNota").value = "";
  pintarOpciones();
  actualizarTotalVp();
  abrir("modalProducto");
  $(".ventana-producto").scrollTop = 0;
}
function pintarOpciones() {
  const ops = opcionesDe(vp.p);
  $("#vpOpciones").innerHTML = ops
    .map((o) => {
      const req = o.obligatorio ? ' <span class="req">*</span>' : "";
      const masPrecio = (n) => (Number(n) > 0 ? ` <small>+${dinero(n)}</small>` : "");
      let cuerpo = "";
      if (o.tipo === "colores") {
        cuerpo = `<div class="colores">${(o.valores || [])
          .map(
            (v) => `<button type="button" class="color ${vp.eleccion[o.id] === v.nombre ? "elegido" : ""}" data-op="${o.id}" data-v="${esc(v.nombre)}">
              <span class="bolita" style="background:${esc(v.color || colorDe(v.nombre))}"></span><span>${esc(v.nombre)}${masPrecio(v.precio)}</span></button>`
          )
          .join("")}</div>`;
      } else if (o.tipo === "opciones") {
        cuerpo = `<div class="chips-op">${(o.valores || [])
          .map((v) => `<button type="button" class="chip-op ${vp.eleccion[o.id] === v.nombre ? "elegido" : ""}" data-op="${o.id}" data-v="${esc(v.nombre)}">${esc(v.nombre)}${masPrecio(v.precio)}</button>`)
          .join("")}</div>`;
      } else if (o.tipo === "cantidad") {
        cuerpo = `<div class="cantidad grande"><button type="button" data-op="${o.id}" data-paso="-1">−</button><span>${vp.eleccion[o.id] || 0}</span><button type="button" data-op="${o.id}" data-paso="1">+</button>
          ${Number(o.precio) > 0 ? `<small>${dinero(o.precio)} c/u</small>` : ""}</div>`;
      } else {
        cuerpo = `<input type="text" data-op="${o.id}" data-texto value="${esc(vp.eleccion[o.id] || "")}" placeholder="${esc(o.ayuda || "Escribe aquí")}" maxlength="200">`;
      }
      const ayuda = o.ayuda && o.tipo !== "texto" ? `<div class="ayuda-op">${esc(o.ayuda)}</div>` : "";
      return `<div class="grupo-op"><div class="titulo-op">${esc(o.titulo)}${req}${o.tipo === "texto" && Number(o.precio) > 0 ? masPrecio(o.precio) : ""}</div>${cuerpo}${ayuda}</div>`;
    })
    .join("");
}
$("#vpOpciones").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-op]");
  if (!b) return;
  const o = opcionesDe(vp.p).find((x) => x.id === b.dataset.op);
  if (b.dataset.paso) {
    const v = Math.max(0, Math.min(o.max || 20, (vp.eleccion[o.id] || 0) + +b.dataset.paso));
    vp.eleccion[o.id] = v;
  } else {
    vp.eleccion[o.id] = vp.eleccion[o.id] === b.dataset.v && !o.obligatorio ? undefined : b.dataset.v;
  }
  pintarOpciones();
  actualizarTotalVp();
});
$("#vpOpciones").addEventListener("input", (e) => {
  if (e.target.dataset.texto != null) {
    vp.eleccion[e.target.dataset.op] = e.target.value;
    actualizarTotalVp();
  }
});
$("#vpMenos").addEventListener("click", () => {
  vp.cant = Math.max(1, vp.cant - 1);
  actualizarTotalVp();
});
$("#vpMas").addEventListener("click", () => {
  vp.cant = Math.min(50, vp.cant + 1);
  actualizarTotalVp();
});
function actualizarTotalVp() {
  $("#vpCant").textContent = vp.cant;
  const r = resumen(vp.p, vp.eleccion);
  $("#vpTotal").innerHTML = tienePrecio(vp.p) ? dinero((vp.p.price + r.extraUnidad) * vp.cant) : '<span class="consultar">A consultar</span>';
}
$("#vpAgregar").addEventListener("click", () => {
  const faltan = opcionesDe(vp.p).filter((o) => o.obligatorio && (vp.eleccion[o.id] == null || vp.eleccion[o.id] === ""));
  if (faltan.length) {
    aviso("Elige: " + faltan.map((o) => o.titulo).join(", "));
    return;
  }
  const r = resumen(vp.p, vp.eleccion);
  const nota = $("#vpNota").value.trim();
  if (nota) r.detalle.push({ titulo: "Nota", valor: nota, precio: 0 });
  estado.bolsa.push({ id: vp.p.id, cant: vp.cant, extra: r.extraUnidad, detalle: r.detalle });
  guardarBolsa();
  pintarBolsa();
  cerrar("modalProducto");
  aviso("¡Agregado a tu pedido! 🛍️");
  $("#abrirBolsa").classList.add("salta");
  setTimeout(() => $("#abrirBolsa").classList.remove("salta"), 700);
});

/* ---------- bolsa / mi pedido ---------- */
function cargarBolsa() {
  try {
    const guardada = JSON.parse(localStorage.getItem("bolsa2") || "[]");
    estado.bolsa = guardada.filter((i) => estado.productos.some((p) => p.id === i.id));
  } catch (e) {
    estado.bolsa = [];
  }
}
function guardarBolsa() {
  try {
    localStorage.setItem("bolsa2", JSON.stringify(estado.bolsa));
  } catch (e) {}
}
const prodDe = (i) => estado.productos.find((x) => x.id === i.id);
function precioItem(i) {
  const p = prodDe(i);
  return p && tienePrecio(p) ? (p.price + (i.extra || 0)) * i.cant : null;
}
function totalBolsa() {
  return estado.bolsa.reduce((s, i) => s + (precioItem(i) || 0), 0);
}
function pintarBolsa() {
  estado.bolsa = estado.bolsa.filter(prodDe);
  const total = estado.bolsa.reduce((s, i) => s + i.cant, 0);
  $("#contador").textContent = total;
  $("#contador").classList.toggle("oculto", total === 0);
  if (!estado.bolsa.length) {
    $("#listaBolsa").innerHTML = '<p class="vacio">Tu pedido está vacío.<br>Toca un producto del catálogo para agregarlo.</p>';
  } else {
    $("#listaBolsa").innerHTML = estado.bolsa
      .map((i, k) => {
        const p = prodDe(i);
        const pr = precioItem(i);
        return `<div class="item-bolsa">
          ${imgFoto(p.image) || "<span></span>"}
          <div>
            <div class="nombre">${esc(p.name)}</div>
            ${(i.detalle || []).map((d) => `<div class="det">${esc(d.titulo)}: ${esc(d.valor)}</div>`).join("")}
            <div class="det-precio">${pr == null ? "Precio a consultar" : dinero(pr)}</div>
          </div>
          <div class="cantidad">
            <button data-menos="${k}" aria-label="Menos">−</button><span>${i.cant}</span><button data-mas="${k}" aria-label="Más">+</button>
          </div>
        </div>`;
      })
      .join("");
    ponerFotos($("#listaBolsa"));
  }
  $("#totalBolsa").textContent = dinero(totalBolsa());
}
$("#listaBolsa").addEventListener("click", (e) => {
  const mas = e.target.closest("[data-mas]");
  const menos = e.target.closest("[data-menos]");
  if (!mas && !menos) return;
  const k = +(mas || menos).dataset[mas ? "mas" : "menos"];
  estado.bolsa[k].cant += mas ? 1 : -1;
  if (estado.bolsa[k].cant <= 0) estado.bolsa.splice(k, 1);
  guardarBolsa();
  pintarBolsa();
});
function abrirBolsa(si) {
  $("#panelBolsa").classList.toggle("oculto", !si);
  $("#fondoBolsa").classList.toggle("oculto", !si);
  document.body.classList.toggle("sin-scroll", si);
}
$("#abrirBolsa").addEventListener("click", () => abrirBolsa(true));
$("#cerrarBolsa").addEventListener("click", () => abrirBolsa(false));
$("#fondoBolsa").addEventListener("click", () => abrirBolsa(false));
$("#vaciarBolsa").addEventListener("click", () => {
  estado.bolsa = [];
  guardarBolsa();
  pintarBolsa();
});
function textoWhatsapp() {
  const lineas = estado.bolsa.map((i) => {
    const p = prodDe(i);
    const pr = precioItem(i);
    return "• " + i.cant + " x " + p.name + (pr == null ? " (precio a consultar)" : " (" + dinero(pr) + ")") + (i.detalle || []).map((d) => "\n    - " + d.titulo + ": " + d.valor).join("");
  });
  const suma = totalBolsa();
  return "¡Hola! 😊 Quisiera hacer este pedido:\n\n" + lineas.join("\n") + (suma ? "\n\nTotal aproximado: " + dinero(suma) : "") + "\n\n¿Me confirmas disponibilidad y entrega?";
}
$("#enviarBolsaWa").addEventListener("click", () => {
  if (!estado.bolsa.length) return aviso("Tu pedido está vacío");
  window.open(linkWa(textoWhatsapp()), "_blank");
});
$("#enviarBolsa").addEventListener("click", () => {
  if (!estado.bolsa.length) return aviso("Tu pedido está vacío");
  if (!nube.activa) return window.open(linkWa(textoWhatsapp()), "_blank");
  abrirBolsa(false);
  conSesion("Inicia sesión para enviar tu pedido. ¡Es un solo toque! 💕", () => abrirConfirmar("bolsa"));
});

/* ---------- inicio de sesión ---------- */
function conSesion(motivo, luego) {
  if (estado.usuario) return luego();
  estado.despuesDeEntrar = luego;
  $("#entrarMotivo").textContent = motivo;
  abrir("modalEntrar");
}
let modoEntrar = "entrar";
$$(".pestanas-mini button").forEach((b) =>
  b.addEventListener("click", () => {
    modoEntrar = b.dataset.modo;
    $$(".pestanas-mini button").forEach((x) => x.classList.toggle("activa", x === b));
    $("#campoNombre").classList.toggle("oculto", modoEntrar !== "crear");
    $("#btnCorreo").textContent = modoEntrar === "crear" ? "Crear mi cuenta" : "Entrar";
    $("#eClave").autocomplete = modoEntrar === "crear" ? "new-password" : "current-password";
    $("#btnOlvide").classList.toggle("oculto", modoEntrar === "crear");
  })
);
function errorEntrar(e) {
  const m = typeof e === "string" ? e : nube.mensajeError(e);
  $("#errorEntrar").textContent = m;
  $("#errorEntrar").classList.toggle("oculto", !m);
}
$("#btnGoogle").addEventListener("click", async () => {
  errorEntrar("");
  try {
    await nube.entrarConGoogle();
  } catch (e) {
    errorEntrar(e);
  }
});
$("#formCorreo").addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEntrar("");
  const btn = $("#btnCorreo");
  btn.disabled = true;
  try {
    if (modoEntrar === "crear") await nube.crearCuenta($("#eNombre").value.trim(), $("#eCorreo").value.trim(), $("#eClave").value);
    else await nube.entrarConCorreo($("#eCorreo").value.trim(), $("#eClave").value);
  } catch (err) {
    errorEntrar(err);
  } finally {
    btn.disabled = false;
  }
});
$("#btnOlvide").addEventListener("click", async () => {
  const correo = $("#eCorreo").value.trim();
  if (!correo) return errorEntrar("Escribe tu correo arriba y vuelve a tocar aquí.");
  try {
    await nube.recuperarClave(correo);
    errorEntrar("");
    aviso("Te enviamos un correo para cambiar tu contraseña 📧", 4000);
  } catch (e) {
    errorEntrar(e);
  }
});
$("#btnEntrar").addEventListener("click", () => conSesion("Inicia sesión para enviar tus pedidos y ver cómo van.", () => {}));

const nombreCorto = (u) => (u.displayName || estado.perfil?.nombre || u.email || "").split(/[ @]/)[0];
nube.alCambiarUsuario(async (u) => {
  estado.usuario = u;
  $("#btnEntrar").classList.toggle("oculto", !nube.activa || !!u);
  $("#menuUsuario").classList.toggle("oculto", !u);
  if (!u) {
    estado.perfil = null;
    return;
  }
  try {
    const d = await nube.F.getDoc(nube.F.doc(nube.db, "usuarios", u.uid));
    estado.perfil = d.exists() ? d.data() : null;
  } catch (e) {}
  const ini = (nombreCorto(u)[0] || "🙂").toUpperCase();
  $("#btnAvatar").innerHTML = u.photoURL ? `<img src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer">` : esc(ini);
  $("#quien").innerHTML = `<b>¡Hola, ${esc(nombreCorto(u))}!</b><br><small>${esc(u.email || "")}</small>`;
  const admin = nube.esAdmin(u);
  $("#irPanel").classList.toggle("oculto", !admin);
  if (!$("#modalEntrar").classList.contains("oculto")) {
    cerrar("modalEntrar");
    aviso("¡Bienvenida/o, " + nombreCorto(u) + "! 💕");
  }
  if (estado.despuesDeEntrar) {
    const f = estado.despuesDeEntrar;
    estado.despuesDeEntrar = null;
    f();
  }
  if (admin && location.hash === "#panel") abrirPanel();
});
$("#btnAvatar").addEventListener("click", (e) => {
  e.stopPropagation();
  $("#desplegable").classList.toggle("oculto");
});
document.addEventListener("click", () => $("#desplegable").classList.add("oculto"));
$("#desplegable").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ir]");
  if (!b) return;
  if (b.dataset.ir === "salir") {
    await nube.salir();
    aviso("Sesión cerrada. ¡Vuelve pronto! 👋");
  }
  if (b.dataset.ir === "mispedidos") abrirMisPedidos();
  if (b.dataset.ir === "panel") abrirPanel();
});

/* ---------- confirmar y enviar pedido ---------- */
let tipoEnvio = "bolsa";
let personalizado = null;
function abrirConfirmar(tipo) {
  tipoEnvio = tipo;
  const items = itemsParaEnviar();
  $("#resumenPedido").innerHTML =
    items
      .map((it) => `<div class="fila-res"><span>${it.cant} × ${esc(it.nombre)}</span><b>${it.subtotal == null ? "A consultar" : dinero(it.subtotal)}</b></div>`)
      .join("") + (tipo === "bolsa" && totalBolsa() ? `<div class="fila-res total"><span>Total aproximado</span><b>${dinero(totalBolsa())}</b></div>` : "");
  const u = estado.usuario;
  const perf = estado.perfil || {};
  $("#cNombre").value = perf.nombre || u.displayName || (tipo === "personalizado" ? personalizado.nombre : "") || "";
  $("#cTel").value = perf.telefono || "";
  $("#cDir").value = perf.direccion || "";
  $("#cFecha").value = tipo === "personalizado" ? personalizado.fecha : "";
  $("#cFecha").min = new Date().toISOString().slice(0, 10);
  $("#errorConfirmar").classList.add("oculto");
  abrir("modalConfirmar");
}
function itemsParaEnviar() {
  if (tipoEnvio === "personalizado") {
    const d = [{ titulo: "Quiere", valor: personalizado.que, precio: 0 }];
    if (personalizado.colores) d.push({ titulo: "Colores", valor: personalizado.colores, precio: 0 });
    return [{ productoId: "personalizado", nombre: "Pedido personalizado", imagen: "", cant: 1, precioUnidad: null, subtotal: null, detalle: d }];
  }
  return estado.bolsa.map((i) => {
    const p = prodDe(i);
    return { productoId: p.id, nombre: p.name, imagen: p.image || "", cant: i.cant, precioUnidad: tienePrecio(p) ? p.price + (i.extra || 0) : null, subtotal: precioItem(i), detalle: i.detalle || [] };
  });
}
$("#cEntrega").addEventListener("click", (e) => {
  const b = e.target.closest("[data-v]");
  if (!b) return;
  $$("#cEntrega .chip-op").forEach((x) => x.classList.toggle("elegido", x === b));
  $("#campoDir").classList.toggle("oculto", b.dataset.v !== "Envío a domicilio");
});
$("#formConfirmar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const u = estado.usuario;
  if (!u) return;
  const entrega = $("#cEntrega .elegido").dataset.v;
  const datos = {
    nombre: $("#cNombre").value.trim(),
    telefono: $("#cTel").value.trim(),
    direccion: entrega === "Envío a domicilio" ? $("#cDir").value.trim() : "",
  };
  if (entrega === "Envío a domicilio" && !datos.direccion) {
    $("#errorConfirmar").textContent = "Escribe la dirección de entrega.";
    $("#errorConfirmar").classList.remove("oculto");
    return;
  }
  const items = itemsParaEnviar();
  const total = items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const pedido = {
    uid: u.uid,
    email: u.email || "",
    cliente: datos,
    entrega,
    fecha: $("#cFecha").value || "",
    items,
    total: Math.round(total * 100) / 100,
    hayPorConsultar: items.some((i) => i.subtotal == null),
    estado: "nuevo",
    creado: nube.F.serverTimestamp(),
  };
  const btn = $("#btnConfirmar");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    const ref = await nube.F.addDoc(nube.F.collection(nube.db, "pedidos"), pedido);
    nube.F.setDoc(nube.F.doc(nube.db, "usuarios", u.uid), { ...datos, email: u.email || "", actualizado: nube.F.serverTimestamp() }, { merge: true }).catch(() => {});
    estado.perfil = { ...(estado.perfil || {}), ...datos };
    if (tipoEnvio === "bolsa") {
      estado.bolsa = [];
      guardarBolsa();
      pintarBolsa();
    } else {
      $("#formPersonalizado").reset();
    }
    cerrar("modalConfirmar");
    celebrar(ref.id.slice(0, 6).toUpperCase());
  } catch (err) {
    console.error(err);
    $("#errorConfirmar").textContent = nube.mensajeError(err);
    $("#errorConfirmar").classList.remove("oculto");
  } finally {
    btn.disabled = false;
    btn.textContent = "💌 Enviar pedido";
  }
});

/* ---------- celebración ---------- */
function celebrar(codigo) {
  $("#codigoPedido").textContent = "#" + codigo;
  const colores = ["#e84e7c", "#ffd6e4", "#fdd835", "#81d4fa", "#ce93d8", "#66bb6a", "#fb8c00", "#ffffff"];
  const formas = ["", "redondo", "corazon"];
  $("#confeti").innerHTML = Array.from({ length: 90 }, () => {
    const f = formas[Math.floor(Math.random() * formas.length)];
    return `<i class="${f}" style="left:${Math.random() * 100}%;background:${f === "corazon" ? "none" : colores[Math.floor(Math.random() * colores.length)]};animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(2.4 + Math.random() * 2).toFixed(2)}s;--giro:${Math.floor(Math.random() * 720 - 360)}deg">${f === "corazon" ? "💗" : ""}</i>`;
  }).join("");
  $("#celebracion").classList.remove("oculto");
  document.body.classList.add("sin-scroll");
  try {
    navigator.vibrate && navigator.vibrate([60, 40, 60]);
  } catch (e) {}
}
$("#exitoCerrar").addEventListener("click", () => {
  $("#celebracion").classList.add("oculto");
  document.body.classList.remove("sin-scroll");
});
$("#exitoMisPedidos").addEventListener("click", () => {
  $("#celebracion").classList.add("oculto");
  abrirMisPedidos();
});

/* ---------- mis pedidos ---------- */
export const ESTADOS = {
  nuevo: { t: "Recibido", e: "📩" },
  proceso: { t: "Tejiendo", e: "🧶" },
  listo: { t: "Listo para entregar", e: "🎁" },
  entregado: { t: "Entregado", e: "✅" },
  cancelado: { t: "Cancelado", e: "✖️" },
};
export const fechaBonita = (ts) => {
  const d = ts && ts.toDate ? ts.toDate() : null;
  return d ? d.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("es", { hour: "numeric", minute: "2-digit" }) : "Ahora";
};
let quitarMisPedidos = null;
function abrirMisPedidos() {
  if (!estado.usuario) return conSesion("Inicia sesión para ver tus pedidos.", abrirMisPedidos);
  abrir("modalMisPedidos");
  quitarMisPedidos && quitarMisPedidos();
  const q = nube.F.query(nube.F.collection(nube.db, "pedidos"), nube.F.where("uid", "==", estado.usuario.uid));
  quitarMisPedidos = nube.F.onSnapshot(
    q,
    (snap) => {
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creado?.seconds ?? 9e9) - (a.creado?.seconds ?? 9e9));
      if (!lista.length) {
        $("#listaMisPedidos").innerHTML = '<p class="vacio">Todavía no tienes pedidos. ¡Mira el catálogo! 💕</p>';
        return;
      }
      const pasos = ["nuevo", "proceso", "listo", "entregado"];
      $("#listaMisPedidos").innerHTML = lista
        .map((p) => {
          const idx = pasos.indexOf(p.estado);
          return `<div class="pedido-cliente">
            <div class="cab"><b>Pedido #${p.id.slice(0, 6).toUpperCase()}</b><small>${fechaBonita(p.creado)}</small></div>
            ${
              p.estado === "cancelado"
                ? '<div class="estado-chip cancelado">✖️ Cancelado</div>'
                : `<div class="linea-tiempo">${pasos.map((s, k) => `<div class="hito ${k <= idx ? "hecho" : ""}"><span>${ESTADOS[s].e}</span><small>${ESTADOS[s].t}</small></div>`).join("")}</div>`
            }
            <ul>${(p.items || []).map((i) => `<li>${i.cant} × ${esc(i.nombre)}${(i.detalle || []).length ? `<small> · ${i.detalle.map((d) => esc(d.titulo + ": " + d.valor)).join(" · ")}</small>` : ""}</li>`).join("")}</ul>
            <div class="pie-pedido"><span>${esc(p.entrega || "")}${p.fecha ? " · para el " + esc(p.fecha.split("-").reverse().join("/")) : ""}</span><b>${p.total ? dinero(p.total) : "A consultar"}${p.total && p.hayPorConsultar ? " + a consultar" : ""}</b></div>
          </div>`;
        })
        .join("");
    },
    (err) => ($("#listaMisPedidos").innerHTML = `<p class="vacio">${esc(nube.mensajeError(err))}</p>`)
  );
}

/* ---------- pedido personalizado ---------- */
let botonPersonalizado = "wa";
$("#btnPersonalizadoNube").addEventListener("click", () => (botonPersonalizado = "nube"));
$("#btnPersonalizadoWa").addEventListener("click", () => (botonPersonalizado = "wa"));
$("#formPersonalizado").addEventListener("submit", (e) => {
  e.preventDefault();
  personalizado = {
    nombre: $("#pNombre").value.trim(),
    que: $("#pQue").value.trim(),
    colores: $("#pColores").value.trim(),
    fecha: $("#pFecha").value,
  };
  if (nube.activa && botonPersonalizado === "nube") {
    conSesion("Inicia sesión para enviar tu pedido personalizado 💕", () => abrirConfirmar("personalizado"));
    return;
  }
  const texto =
    "¡Hola! 😊 Quiero un pedido personalizado:\n\n" +
    "👤 Nombre: " + personalizado.nombre + "\n" +
    "🧶 Quiero: " + personalizado.que + "\n" +
    (personalizado.colores ? "🎨 Colores: " + personalizado.colores + "\n" : "") +
    (personalizado.fecha ? "📅 Para: " + personalizado.fecha.split("-").reverse().join("/") + "\n" : "");
  window.open(linkWa(texto), "_blank");
});

/* ---------- visor de fotos ---------- */
$("#vpFoto").addEventListener("click", () => {
  $("#visor img").src = $("#vpFoto").src;
  $("#visor").classList.remove("oculto");
});
$("#visor").addEventListener("click", () => $("#visor").classList.add("oculto"));

/* ---------- panel de administración (solo para el dueño) ---------- */
async function abrirPanel() {
  if (!nube.esAdmin(estado.usuario)) return;
  const m = await import("./panel.js");
  m.abrirPanel({ estado, nube, aviso, urlFoto, ponerFotos, esc, dinero, linkWa, ESTADOS, fechaBonita });
}

iniciar();
