/* Panel de administración
   - Lee un PDF (pdf.js), reconoce el texto de cada página (Tesseract, gratis y dentro del navegador),
     encuentra nombres, precios y fotos, y deja editar todo antes de agregarlo.
   - Publica los cambios guardando data/products.json, data/config.json y las fotos en GitHub
     (un solo "commit" usando la API de GitHub con la llave personal del dueño). */
import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const estado = {
  token: "",
  repo: "",
  config: {},
  productos: [],
  original: "", // copia de lo publicado, para saber si hay cambios
  imagenesNuevas: new Map(), // ruta -> dataURL
  borradores: [],
  paginas: [], // canvases de las páginas del PDF actual
};

/* ================= utilidades ================= */
function aviso(msg, ms = 2600) {
  const d = document.createElement("div");
  d.className = "aviso";
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), ms);
}
const slug = (t) =>
  String(t || "producto")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "producto";
const idCorto = () => Math.random().toString(36).slice(2, 7);
function aOracion(t) {
  t = t.replace(/\s+/g, " ").trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  if (letras && letras === letras.toUpperCase()) t = t.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
function leerPrecio(v) {
  const s = String(v ?? "").replace(/[^0-9.,]/g, "").replace(",", ".");
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}
function categoriaDesdeArchivo(nombre) {
  let n = nombre.replace(/\.pdf$/i, "").replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, " ").replace(/[_-]+/g, " ").replace(/\b(cat[aá]logo|de|del|los|las)\b/gi, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n ? aOracion(n) : "Productos";
}
function categoriasConocidas() {
  const set = new Set(estado.config.categorias || []);
  estado.productos.forEach((p) => p.category && set.add(p.category));
  return [...set];
}

/* ================= conexión con GitHub ================= */
const API = "https://api.github.com";
async function gh(ruta, opciones = {}) {
  const r = await fetch(API + ruta, {
    ...opciones,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + estado.token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opciones.body ? { "Content-Type": "application/json" } : {}),
      ...(opciones.headers || {}),
    },
  });
  if (!r.ok) {
    let msg = r.status + "";
    try {
      msg += " " + (await r.json()).message;
    } catch (e) {}
    const err = new Error(msg);
    err.status = r.status;
    throw err;
  }
  return r.status === 204 ? null : r.json();
}

function repoPorDefecto() {
  const h = location.hostname;
  const m = h.match(/^([^.]+)\.github\.io$/i);
  if (!m) return "";
  const partes = location.pathname.split("/").filter(Boolean);
  const proyecto = partes.length && !partes[0].endsWith(".html") ? partes[0] : h;
  return m[1] + "/" + proyecto;
}

function pintarConexion(ok, texto) {
  $("#puntoConexion").classList.toggle("ok", ok);
  $("#textoConexion").textContent = texto;
  $("#formConexion").classList.toggle("oculto", ok);
  $("#btnDesconectar").classList.toggle("oculto", !ok);
  $("#nombreRepoAyuda").textContent = (estado.repo || "tu repositorio").split("/")[1] || "tu repositorio";
  actualizarBarra();
}

async function conectar(token, repo, silencioso) {
  estado.token = token.trim();
  estado.repo = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  try {
    const info = await gh("/repos/" + estado.repo);
    if (!info.permissions || !info.permissions.push) throw new Error("sin permiso");
    try {
      localStorage.setItem("gh_token", estado.token);
      localStorage.setItem("gh_repo", estado.repo);
    } catch (e) {}
    pintarConexion(true, "Conectado a " + estado.repo + " ✅");
    if (!silencioso) aviso("¡Conectado! Ya puedes publicar 🎉");
    return true;
  } catch (e) {
    estado.token = "";
    pintarConexion(false, "Sin conectar");
    if (!silencioso) {
      if (e.status === 401) aviso("La llave no es válida o ya venció. Crea una nueva.", 4500);
      else if (e.status === 404) aviso("No encuentro ese repositorio. Revisa que la llave tenga acceso a él.", 4500);
      else aviso("No se pudo conectar: revisa que la llave tenga permiso de Contents → Read and write.", 4500);
    }
    return false;
  }
}

$("#btnConectar").addEventListener("click", () => {
  const t = $("#inToken").value;
  const r = $("#inRepo").value;
  if (!t || !r) return aviso("Escribe tu llave y el repositorio");
  conectar(t, r);
});
$("#btnDesconectar").addEventListener("click", () => {
  try {
    localStorage.removeItem("gh_token");
  } catch (e) {}
  estado.token = "";
  $("#inToken").value = "";
  pintarConexion(false, "Sin conectar");
});

/* ================= cargar datos ================= */
async function leerJson(ruta) {
  if (estado.token) {
    try {
      const r = await fetch(API + "/repos/" + estado.repo + "/contents/" + ruta + "?t=" + Date.now(), {
        headers: { Accept: "application/vnd.github.raw+json", Authorization: "Bearer " + estado.token },
      });
      if (r.ok) return await r.json();
    } catch (e) {}
  }
  return fetch(ruta + "?v=" + Date.now()).then((r) => r.json());
}

async function iniciar() {
  let token = "",
    repo = "";
  try {
    token = localStorage.getItem("gh_token") || "";
    repo = localStorage.getItem("gh_repo") || "";
  } catch (e) {}
  repo = repo || repoPorDefecto();
  $("#inRepo").value = repo;
  estado.repo = repo;
  if (token) await conectar(token, repo, true);
  else pintarConexion(false, "Sin conectar");

  try {
    [estado.config, estado.productos] = await Promise.all([leerJson("data/config.json"), leerJson("data/products.json")]);
  } catch (e) {
    estado.config = estado.config || {};
    estado.productos = [];
    aviso("No pude leer los productos actuales.");
  }
  marcarPublicado();
  pintarAjustes();
  pintarProductos();
}

/* ================= pestañas ================= */
$$(".pestana").forEach((b) =>
  b.addEventListener("click", () => {
    $$(".pestana").forEach((x) => x.classList.toggle("activa", x === b));
    $$("[data-panel]").forEach((p) => {
      const mostrar = p.dataset.panel === b.dataset.pestana;
      if (p.id === "cajaBorradores") p.classList.toggle("oculto", !mostrar || !estado.borradores.length);
      else p.classList.toggle("oculto", !mostrar);
    });
  })
);
function irA(pestana) {
  $(`.pestana[data-pestana="${pestana}"]`).click();
}

/* ================= cambios pendientes ================= */
const instantanea = () => JSON.stringify([estado.config, estado.productos]);
function marcarPublicado() {
  estado.original = instantanea();
  estado.imagenesNuevas.clear();
  actualizarBarra();
}
function hayCambios() {
  return instantanea() !== estado.original;
}
function actualizarBarra() {
  const cambios = estado.productos && hayCambios();
  $("#textoCambios").textContent = cambios ? "Tienes cambios sin publicar ✏️" : "Todo está publicado ✅";
  $("#btnPublicar").disabled = !cambios;
  $("#numProductos").textContent = estado.productos ? "(" + estado.productos.length + ")" : "";
  const dl = $("#listaCategorias");
  dl.innerHTML = categoriasConocidas().map((c) => `<option value="${esc(c)}">`).join("");
}
window.addEventListener("beforeunload", (e) => {
  if (hayCambios() || estado.borradores.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ================= ajustes del negocio ================= */
function pintarAjustes() {
  $$("[data-cf]").forEach((el) => {
    const v = estado.config[el.dataset.cf];
    el.value = Array.isArray(v) ? v.join(", ") : v ?? "";
  });
}
$$("[data-cf]").forEach((el) =>
  el.addEventListener("input", () => {
    const k = el.dataset.cf;
    if (k === "categorias") estado.config[k] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (k === "whatsapp") estado.config[k] = el.value.replace(/\D/g, "");
    else if (k === "instagram") estado.config[k] = el.value.trim().replace(/^@/, "");
    else estado.config[k] = el.value;
    actualizarBarra();
  })
);

/* ================= tarjeta editable (productos y borradores) ================= */
function htmlEditable(p, i, tipo) {
  const esBorrador = tipo === "borrador";
  const incluido = esBorrador ? p.incluir : p.visible !== false;
  const foto = esBorrador ? "" : p.image ? `<img src="${esc(estado.imagenesNuevas.get(p.image) || p.image)}" alt="">` : "Sin foto";
  return `
  <div class="editable ${incluido ? "" : "apagado"} ${p._nuevo ? "nuevo" : ""}" data-i="${i}" data-tipo="${tipo}">
    <div class="lado-foto">
      <div class="miniatura" data-miniatura>${foto}</div>
      ${
        esBorrador
          ? `<button class="btn btn-borde btn-chico" data-accion="recortar">✂️ Recortar foto</button>`
          : `<label class="btn btn-borde btn-chico">📷 Cambiar foto<input type="file" accept="image/*" hidden data-accion="foto"></label>`
      }
    </div>
    <div class="campos">
      <div class="campo"><label>Nombre</label><input data-campo="name" value="${esc(p.name)}" placeholder="Nombre del producto"></div>
      <div class="campo"><label>Precio ($)</label><input data-campo="price" inputmode="decimal" value="${p.price == null ? "" : Number(p.price).toFixed(2)}" placeholder="A consultar"></div>
      <div class="campo"><label>Categoría</label><input data-campo="category" list="listaCategorias" value="${esc(p.category)}"></div>
      <div class="campo"><label>Detalle (opcional)</label><input data-campo="description" value="${esc(p.description)}" placeholder="Ej: Se pueden agregar más rosas"></div>
      ${
        esBorrador
          ? `<div class="ancho">${p.pista ? `<span class="pista">⚠️ ${esc(p.pista)}</span> ` : ""}<span class="pagina-pdf">Página ${p.pagina + 1} del PDF</span></div>`
          : ""
      }
    </div>
    <div class="herramientas">
      ${
        esBorrador
          ? `<label class="interruptor"><input type="checkbox" data-campo="incluir" ${p.incluir ? "checked" : ""}> Agregar este</label>
             <span class="espacio"></span>
             <button class="btn btn-borde btn-chico" data-accion="duplicar">⧉ Otro de esta página</button>`
          : `<label class="interruptor"><input type="checkbox" data-campo="visible" ${p.visible !== false ? "checked" : ""}> Visible</label>
             <span class="espacio"></span>
             <button class="btn btn-borde btn-chico" data-accion="subir" title="Subir">▲</button>
             <button class="btn btn-borde btn-chico" data-accion="bajar" title="Bajar">▼</button>
             <button class="btn btn-borde btn-chico" data-accion="borrar">🗑️ Borrar</button>`
      }
    </div>
  </div>`;
}

function pintarProductos() {
  const lista = $("#listaProductos");
  if (!estado.productos.length) {
    lista.innerHTML = '<p class="vacio">Aún no hay productos. Sube un PDF o agrega uno a mano.</p>';
  } else {
    lista.innerHTML = estado.productos.map((p, i) => htmlEditable(p, i, "producto")).join("");
  }
  actualizarBarra();
}

function pintarBorradores() {
  const caja = $("#cajaBorradores");
  caja.classList.toggle("oculto", !estado.borradores.length);
  $("#listaBorradores").innerHTML = estado.borradores.map((b, i) => htmlEditable(b, i, "borrador")).join("");
  $$("#listaBorradores .editable").forEach((el) => dibujarMiniatura(estado.borradores[+el.dataset.i], $("[data-miniatura]", el)));
  const n = estado.borradores.filter((b) => b.incluir).length;
  $("#btnAgregarBorradores").textContent = "Agregar " + n + " producto" + (n === 1 ? "" : "s") + " al catálogo";
}

function dibujarMiniatura(b, cont) {
  const c = recortar(estado.paginas[b.pagina], b.recorte, 300);
  cont.innerHTML = "";
  cont.appendChild(c);
}

function manejarEdicion(e) {
  const el = e.target.closest(".editable");
  if (!el) return;
  const i = +el.dataset.i;
  const esBorrador = el.dataset.tipo === "borrador";
  const lista = esBorrador ? estado.borradores : estado.productos;
  const p = lista[i];
  const campo = e.target.dataset.campo;
  if (!campo) return;
  if (campo === "price") p.price = leerPrecio(e.target.value);
  else if (campo === "incluir" || campo === "visible") {
    p[campo] = e.target.checked;
    el.classList.toggle("apagado", !e.target.checked);
    if (esBorrador) pintarBorradores();
  } else p[campo] = e.target.value;
  if (!esBorrador) actualizarBarra();
}
$("#listaProductos").addEventListener("input", manejarEdicion);
$("#listaBorradores").addEventListener("input", manejarEdicion);
$("#listaBorradores").addEventListener("change", manejarEdicion);
$("#listaProductos").addEventListener("change", (e) => {
  if (e.target.dataset.accion === "foto") cambiarFoto(e);
  else manejarEdicion(e);
});

$("#listaProductos").addEventListener("click", (e) => {
  const b = e.target.closest("[data-accion]");
  if (!b || b.dataset.accion === "foto") return;
  const i = +b.closest(".editable").dataset.i;
  const L = estado.productos;
  if (b.dataset.accion === "borrar") {
    if (!confirm("¿Borrar \"" + (L[i].name || "este producto") + "\" del catálogo?")) return;
    L.splice(i, 1);
  } else if (b.dataset.accion === "subir" && i > 0) [L[i - 1], L[i]] = [L[i], L[i - 1]];
  else if (b.dataset.accion === "bajar" && i < L.length - 1) [L[i + 1], L[i]] = [L[i], L[i + 1]];
  pintarProductos();
});

$("#btnNuevoProducto").addEventListener("click", () => {
  estado.productos.unshift({ id: slug("nuevo") + "-" + idCorto(), name: "", price: null, category: (estado.config.categorias || [])[0] || "", description: "", image: "", visible: true, _nuevo: true });
  pintarProductos();
  $("#listaProductos [data-campo=name]").focus();
});

async function cambiarFoto(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const i = +e.target.closest(".editable").dataset.i;
  const p = estado.productos[i];
  const img = await cargarImagen(URL.createObjectURL(archivo));
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  c.getContext("2d").drawImage(img, 0, 0);
  const ruta = "img/productos/" + slug(p.name) + "-" + idCorto() + ".jpg";
  estado.imagenesNuevas.set(ruta, recortar(c, null, 900).toDataURL("image/jpeg", 0.85));
  p.image = ruta;
  pintarProductos();
}
function cargarImagen(src) {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = mal;
    im.src = src;
  });
}

/* ================= recortes de imagen ================= */
// recorte = {x, y, w, h} en proporción (0 a 1) de la página; null = toda la página
function recortar(origen, r, maximo) {
  r = r || { x: 0, y: 0, w: 1, h: 1 };
  const sx = r.x * origen.width,
    sy = r.y * origen.height,
    sw = r.w * origen.width,
    sh = r.h * origen.height;
  const escala = Math.min(1, maximo / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * escala));
  c.height = Math.max(1, Math.round(sh * escala));
  const ctx = c.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(origen, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/* Busca fotos con marco blanco (tipo polaroid) o fotos rectangulares dentro de la página. */
function detectarFotos(pagina) {
  const W = 240;
  const H = Math.round((pagina.height / pagina.width) * W);
  const c = recortar(pagina, null, Math.max(W, H));
  const w = c.width,
    h = c.height;
  const d = c.getContext("2d").getImageData(0, 0, w, h).data;
  const blanco = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4],
      g = d[i * 4 + 1],
      b = d[i * 4 + 2];
    blanco[i] = r > 238 && g > 238 && b > 238 ? 1 : 0;
  }
  const visto = new Uint8Array(w * h);
  const regiones = [];
  for (let s = 0; s < w * h; s++) {
    if (!blanco[s] || visto[s]) continue;
    let minx = w,
      miny = h,
      maxx = 0,
      maxy = 0,
      n = 0;
    const pila = [s];
    visto[s] = 1;
    while (pila.length) {
      const k = pila.pop();
      const x = k % w,
        y = (k / w) | 0;
      n++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      const vecinos = [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1];
      for (const v of vecinos) if (v >= 0 && blanco[v] && !visto[v]) {
        visto[v] = 1;
        pila.push(v);
      }
    }
    const bw = maxx - minx + 1,
      bh = maxy - miny + 1;
    const area = bw * bh;
    // Un marco: caja grande, pero con poco blanco adentro (la foto ocupa el centro)
    if (bw > w * 0.22 && bh > h * 0.18 && area < w * h * 0.85 && n / area < 0.55) {
      // revisar que el centro NO sea blanco (si no, es una tarjeta de texto)
      // y que adentro haya una foto de verdad (muchos tonos), no un cuadro de un solo color con texto
      let centroBlanco = 0,
        total = 0,
        s1 = 0,
        s2 = 0;
      for (let y = miny + bh * 0.2; y < miny + bh * 0.8; y += 2)
        for (let x = minx + bw * 0.2; x < minx + bw * 0.8; x += 2) {
          const k = (y | 0) * w + (x | 0);
          total++;
          centroBlanco += blanco[k];
          const lum = 0.3 * d[k * 4] + 0.59 * d[k * 4 + 1] + 0.11 * d[k * 4 + 2];
          s1 += lum;
          s2 += lum * lum;
        }
      const desviacion = Math.sqrt(Math.max(0, s2 / total - (s1 / total) ** 2));
      if (centroBlanco / total < 0.5 && desviacion > 22) {
        const m = 0.07; // quitar el borde blanco del marco
        regiones.push({ x: (minx + bw * m) / w, y: (miny + bh * m) / h, w: (bw * (1 - 2 * m)) / w, h: (bh * (1 - 2 * m)) / h });
      }
    }
  }
  return regiones;
}

/* ================= lectura del PDF ================= */
let lector = null;
async function obtenerLector() {
  if (lector) return lector;
  const base = new URL("../vendor/tesseract/", import.meta.url).href;
  lector = await Tesseract.createWorker("spa", 1, {
    workerPath: base + "worker.min.js",
    corePath: base + "core/",
    langPath: base + "lang/",
    gzip: true,
  });
  return lector;
}

function progreso(texto, fraccion) {
  $("#progreso").classList.remove("oculto");
  $("#textoProgreso").textContent = texto;
  $("#barraProgreso").style.width = Math.round(fraccion * 100) + "%";
}

async function leerPdf(archivo) {
  if (estado.borradores.length && !confirm("Ya tienes productos del PDF anterior sin agregar. ¿Reemplazarlos?")) return;
  const categoria = $("#inCategoriaPdf").value.trim() || categoriaDesdeArchivo(archivo.name);
  $("#inCategoriaPdf").value = categoria;
  estado.borradores = [];
  estado.paginas = [];
  pintarBorradores();
  try {
    progreso("Abriendo el PDF…", 0.02);
    const pdf = await pdfjsLib.getDocument({ data: await archivo.arrayBuffer() }).promise;
    progreso("Preparando el lector de texto (la primera vez tarda un poquito)…", 0.05);
    const worker = await obtenerLector();
    for (let n = 1; n <= pdf.numPages; n++) {
      progreso("Leyendo página " + n + " de " + pdf.numPages + "…", 0.05 + (0.95 * (n - 1)) / pdf.numPages);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const escala = Math.min(3, 1600 / Math.max(base.width, base.height));
      const vp = page.getViewport({ scale: escala });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      estado.paginas.push(canvas);

      // Texto: primero el que ya trae el PDF; si no trae (PDF de imágenes), se reconoce con OCR
      const fotos = detectarFotos(canvas);
      let lineas = await lineasDelPdf(page, vp);
      if (lineas.length < 2) {
        // 1) letras pequeñas y precios: imagen en alto contraste
        const { data } = await worker.recognize(prepararParaOcr(canvas, fotos), {}, { blocks: true, text: false });
        lineas = lineasDelOcr(data, 1);
        // 2) títulos grandes y letras decorativas: imagen original más pequeña
        const lado = Math.max(canvas.width, canvas.height);
        const chico = recortar(canvas, null, Math.round(lado * 0.4));
        const r2 = await worker.recognize(chico, {}, { blocks: true, text: false });
        const extra = lineasDelOcr(r2.data, canvas.width / chico.width);
        for (const l of extra) if (!lineas.some((a) => seTocan(a, l))) lineas.push(l);
      }
      const productos = armarProductos(lineas, fotos, canvas, n - 1, categoria);
      estado.borradores.push(...productos);
      pintarBorradores();
    }
    progreso("¡Listo! Encontré " + estado.borradores.length + " productos. Revísalos abajo 👇", 1);
    if (!estado.borradores.length) aviso("No encontré productos en este PDF.");
    $("#cajaBorradores").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    progreso("No se pudo leer el PDF 😕 (" + err.message + ")", 0);
  }
}

async function lineasDelPdf(page, vp) {
  const tc = await page.getTextContent();
  const items = tc.items
    .filter((it) => it.str && it.str.trim())
    .map((it) => {
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const alto = Math.hypot(it.transform[2], it.transform[3]) * vp.scale;
      return { texto: it.str.trim(), x0: x, y0: y - alto, x1: x + it.width * vp.scale, y1: y, alto };
    });
  // juntar piezas en la misma línea
  items.sort((a, b) => a.y1 - b.y1 || a.x0 - b.x0);
  const lineas = [];
  for (const it of items) {
    const l = lineas.find((l) => Math.abs(l.y1 - it.y1) < it.alto * 0.4 && it.x0 - l.x1 < it.alto * 2);
    if (l) {
      l.texto += " " + it.texto;
      l.x1 = Math.max(l.x1, it.x1);
      l.x0 = Math.min(l.x0, it.x0);
    } else lineas.push({ ...it });
  }
  return lineas;
}

/* Mejora el contraste para leer letras de color sobre fondos de color, y tapa las fotos
   (así el lector no se confunde con lo que hay dentro de ellas). */
function prepararParaOcr(canvas, fotos) {
  const c = document.createElement("canvas");
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext("2d");
  ctx.drawImage(canvas, 0, 0);
  ctx.fillStyle = "#fff";
  const tapar = () =>
    fotos.forEach((f) => {
      const m = 0.03;
      ctx.fillRect((f.x - f.w * m) * c.width, (f.y - f.h * m) * c.height, f.w * (1 + 2 * m) * c.width, f.h * (1 + 2 * m) * c.height);
    });
  tapar();
  // escala de grises usando el canal más oscuro (resalta letras rosadas, naranjas, verdes…)
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.min(d[i], d[i + 1], d[i + 2]);
    d[i] = v;
    if (v < 250) hist[v]++;
  }
  // umbral automático (Otsu) sin contar lo tapado
  let total = 0, suma = 0;
  for (let v = 0; v < 256; v++) { total += hist[v]; suma += v * hist[v]; }
  let sumB = 0, wB = 0, mejor = 0, umbral = 128;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB, mF = (suma - sumB) / wF;
    const entre = wB * wF * (mB - mF) * (mB - mF);
    if (entre > mejor) { mejor = entre; umbral = v; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > umbral ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function seTocan(a, b) {
  const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (ix <= 0 || iy <= 0) return false;
  return (ix * iy) / Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)) > 0.3;
}

function lineasDelOcr(data, k) {
  const out = [];
  for (const b of data.blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || []) {
        const palabras = (l.words || []).filter((w) => w.confidence > 50 && /[\p{L}\p{N}$]/u.test(w.text));
        const texto = palabras.map((w) => w.text).join(" ").trim();
        if (!texto || !(/\p{L}{3}/u.test(texto) || RX_PRECIO.test(texto))) continue;
        // usar solo el área de las palabras que quedaron
        const x0 = Math.min(...palabras.map((w) => w.bbox.x0)) * k,
          x1 = Math.max(...palabras.map((w) => w.bbox.x1)) * k,
          y0 = Math.min(...palabras.map((w) => w.bbox.y0)) * k,
          y1 = Math.max(...palabras.map((w) => w.bbox.y1)) * k;
        out.push({ texto: texto.replace(/^[^\p{L}\p{N}$¡¿(]+|[^\p{L}\p{N})!?.]+$/gu, ""), x0, y0, x1, y1, alto: y1 - y0, conf: l.confidence });
      }
  return out;
}

const RX_PRECIO = /(?:\$|US\$|USD)\s*(\d{1,4}(?:[.,]\d{1,2})?)|(?:^|\s)[S§]\s?(\d{1,4}[.,]\d{2})\b/i;
const RX_PORTADA = /cat[aá]logo|pedidos|colecci[oó]n|gracias|contacto|s[ií]guenos/i;

function armarProductos(lineas, fotos, canvas, pagina, categoria) {
  const W = canvas.width,
    H = canvas.height;
  lineas = lineas.map((l) => ({ ...l, cx: (l.x0 + l.x1) / 2, cy: (l.y0 + l.y1) / 2, usada: false }));
  const precios = lineas.filter((l) => RX_PRECIO.test(l.texto));
  const productos = [];
  const letras = (t) => (t.match(/\p{L}/gu) || []).length;

  for (const pl of precios) {
    const m = pl.texto.match(RX_PRECIO);
    pl.usada = true;
    // nombre: líneas justo arriba del precio
    const arriba = lineas
      .filter((l) => !l.usada && l.y1 <= pl.y0 + pl.alto * 0.5 && pl.y0 - l.y1 < pl.alto * 3.5 && Math.abs(l.cx - pl.cx) < W * 0.35 && !l.texto.startsWith("(") && letras(l.texto) >= 3 && !RX_PRECIO.test(l.texto))
      .sort((a, b) => b.y1 - a.y1);
    const nombre = [];
    let tope = pl.y0;
    for (const l of arriba) {
      if (tope - l.y1 > Math.max(l.alto, pl.alto) * 2.6) break;
      nombre.unshift(l);
      tope = l.y0;
      if (nombre.length >= 3) break;
    }
    nombre.forEach((l) => (l.usada = true));
    // detalle: líneas entre paréntesis justo debajo
    const debajo = lineas
      .filter((l) => !l.usada && l.y0 >= pl.y1 - 4 && l.y0 - pl.y1 < pl.alto * 3 && Math.abs(l.cx - pl.cx) < W * 0.4)
      .sort((a, b) => a.y0 - b.y0);
    const detalle = [];
    if (debajo[0] && debajo[0].texto.startsWith("(")) {
      for (const l of debajo) {
        detalle.push(l);
        l.usada = true;
        if (l.texto.includes(")") || detalle.length >= 3) break;
      }
    }
    productos.push({
      name: aOracion(nombre.map((l) => l.texto).join(" ")),
      price: leerPrecio(m[1] || m[2]),
      description: detalle.map((l) => l.texto).join(" ").replace(/[()]/g, "").replace(/\s+/g, " ").trim(),
      ancla: { x: pl.cx / W, y: (nombre[0] ? (nombre[0].y0 + pl.y1) / 2 : pl.cy) / H },
    });
  }

  // Página sin precios: un producto con el título más grande
  if (!productos.length) {
    let candidatas = lineas.filter((l) => letras(l.texto) >= 3);
    const seguras = candidatas.filter((l) => (l.conf ?? 100) >= 65 && /\p{L}{4}/u.test(l.texto));
    if (seguras.length) candidatas = seguras;
    candidatas.sort((a, b) => b.alto - a.alto);
    if (candidatas.length) {
      const t = candidatas[0];
      const titulo = lineas.filter((l) => letras(l.texto) >= 3 && Math.abs(l.alto - t.alto) < t.alto * 0.4 && Math.abs(l.cx - t.cx) < W * 0.3 && Math.abs(l.cy - t.cy) < t.alto * 2.5).sort((a, b) => a.y0 - b.y0);
      const sub = candidatas.find((l) => !titulo.includes(l) && l.texto.split(" ").length >= 4);
      productos.push({ name: aOracion(titulo.map((l) => l.texto).join(" ")), price: null, description: sub ? aOracion(sub.texto.replace(/^[•·\-\s]+|[•·\-\s]+$/g, "")) : "", ancla: { x: t.cx / W, y: t.cy / H } });
    } else {
      productos.push({ name: "", price: null, description: "", ancla: { x: 0.5, y: 0.5 } });
    }
  }

  // asignar a cada producto la foto más cercana
  const libres = [...fotos];
  return productos.map((p) => {
    let recorte = null;
    if (libres.length) {
      libres.sort((a, b) => dist(a, p.ancla) - dist(b, p.ancla));
      recorte = libres.shift();
    }
    const esPortada = p.price == null && lineas.some((l) => RX_PORTADA.test(l.texto));
    let pista = "";
    if (!p.name) pista = "No encontré el nombre, escríbelo.";
    else if (p.price == null) pista = "No encontré precio. Escríbelo o déjalo vacío.";
    else if (!recorte) pista = "Revisa el recorte de la foto.";
    return { name: p.name, price: p.price, description: p.description, category: categoria, pagina, recorte, incluir: !esPortada && (!!p.name || !!fotos.length || lineas.length === 0), pista };
  });
}
const dist = (r, a) => Math.hypot(r.x + r.w / 2 - a.x, r.y + r.h / 2 - a.y);

/* --- botones de borradores --- */
$("#listaBorradores").addEventListener("click", (e) => {
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  const i = +b.closest(".editable").dataset.i;
  if (b.dataset.accion === "recortar") abrirRecorte(i);
  if (b.dataset.accion === "duplicar") {
    const copia = { ...estado.borradores[i], name: "", price: null, description: "", incluir: true, pista: "Elige su foto con ✂️ Recortar foto" };
    estado.borradores.splice(i + 1, 0, copia);
    pintarBorradores();
    abrirRecorte(i + 1);
  }
});
$("#btnDescartarBorradores").addEventListener("click", () => {
  if (!confirm("¿Descartar los productos leídos del PDF?")) return;
  estado.borradores = [];
  pintarBorradores();
  $("#progreso").classList.add("oculto");
});
$("#btnAgregarBorradores").addEventListener("click", () => {
  const elegidos = estado.borradores.filter((b) => b.incluir);
  if (!elegidos.length) return aviso("Marca al menos un producto");
  const sinNombre = elegidos.find((b) => !b.name.trim());
  if (sinNombre) return aviso("Hay un producto marcado sin nombre. Escríbelo o desmárcalo.");
  estado.productos.forEach((p) => delete p._nuevo);
  const nuevos = elegidos.map((b) => {
    const id = slug(b.name) + "-" + idCorto();
    const ruta = "img/productos/" + id + ".jpg";
    estado.imagenesNuevas.set(ruta, recortar(estado.paginas[b.pagina], b.recorte, 900).toDataURL("image/jpeg", 0.85));
    return { id, name: b.name.trim(), price: b.price, category: b.category.trim() || "Productos", description: (b.description || "").trim(), image: ruta, visible: true, _nuevo: true };
  });
  estado.productos.unshift(...nuevos);
  const cats = estado.config.categorias || (estado.config.categorias = []);
  nuevos.forEach((p) => !cats.includes(p.category) && cats.push(p.category));
  pintarAjustes();
  estado.borradores = [];
  pintarBorradores();
  $("#progreso").classList.add("oculto");
  pintarProductos();
  irA("productos");
  aviso("Se agregaron " + nuevos.length + " productos. Toca Publicar para que todos los vean 🚀", 4000);
});

/* --- subir PDF --- */
$("#inPdf").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (f) leerPdf(f);
  e.target.value = "";
});
const zona = $("#zonaPdf");
["dragenter", "dragover"].forEach((ev) =>
  zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add("encima");
  })
);
["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("encima")));
zona.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = [...e.dataTransfer.files].find((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (f) leerPdf(f);
  else aviso("Ese archivo no es un PDF");
});

/* ================= ventana de recorte ================= */
const rec = { i: -1, sel: null, inicio: null, escala: 1 };
const lienzo = $("#lienzoRecorte");
function abrirRecorte(i) {
  rec.i = i;
  const b = estado.borradores[i];
  const pag = estado.paginas[b.pagina];
  lienzo.width = pag.width;
  lienzo.height = pag.height;
  rec.sel = b.recorte ? { ...b.recorte } : null;
  dibujarRecorte();
  $("#modalRecorte").classList.remove("oculto");
}
function dibujarRecorte() {
  const b = estado.borradores[rec.i];
  const pag = estado.paginas[b.pagina];
  const ctx = lienzo.getContext("2d");
  ctx.drawImage(pag, 0, 0);
  if (rec.sel) {
    const s = rec.sel,
      W = lienzo.width,
      H = lienzo.height;
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(s.x * W, s.y * H, s.w * W, s.h * H);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#e84e7c";
    ctx.lineWidth = Math.max(3, W / 250);
    ctx.setLineDash([12, 8]);
    ctx.strokeRect(s.x * W, s.y * H, s.w * W, s.h * H);
    ctx.setLineDash([]);
  }
}
function puntoRelativo(e) {
  const r = lienzo.getBoundingClientRect();
  return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
}
lienzo.addEventListener("pointerdown", (e) => {
  lienzo.setPointerCapture(e.pointerId);
  rec.inicio = puntoRelativo(e);
  rec.sel = { x: rec.inicio.x, y: rec.inicio.y, w: 0, h: 0 };
});
lienzo.addEventListener("pointermove", (e) => {
  if (!rec.inicio) return;
  const p = puntoRelativo(e);
  rec.sel = { x: Math.min(p.x, rec.inicio.x), y: Math.min(p.y, rec.inicio.y), w: Math.abs(p.x - rec.inicio.x), h: Math.abs(p.y - rec.inicio.y) };
  dibujarRecorte();
});
lienzo.addEventListener("pointerup", () => (rec.inicio = null));
function cerrarRecorte() {
  $("#modalRecorte").classList.add("oculto");
}
$("#recorteCancelar").addEventListener("click", cerrarRecorte);
$("#recorteTodo").addEventListener("click", () => {
  estado.borradores[rec.i].recorte = null;
  cerrarRecorte();
  pintarBorradores();
});
$("#recorteOk").addEventListener("click", () => {
  if (!rec.sel || rec.sel.w < 0.03 || rec.sel.h < 0.03) return aviso("Arrastra sobre la foto para marcarla");
  const b = estado.borradores[rec.i];
  b.recorte = rec.sel;
  if (b.pista && /recorte|foto/i.test(b.pista)) b.pista = "";
  cerrarRecorte();
  pintarBorradores();
});

/* ================= publicar ================= */
$("#btnPublicar").addEventListener("click", publicar);
async function publicar() {
  if (!estado.token) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return aviso("Primero conecta tu llave de GitHub (arriba) para poder publicar.", 4000);
  }
  const sinNombre = estado.productos.find((p) => !String(p.name).trim());
  if (sinNombre) {
    irA("productos");
    return aviso("Hay un producto sin nombre. Escríbelo antes de publicar.");
  }
  const btn = $("#btnPublicar");
  btn.disabled = true;
  btn.textContent = "Publicando…";
  try {
    const repo = "/repos/" + estado.repo;
    const info = await gh(repo);
    const rama = info.default_branch;
    const ref = await gh(repo + "/git/ref/heads/" + encodeURIComponent(rama));
    const commitBase = await gh(repo + "/git/commits/" + ref.object.sha);

    const productosLimpios = estado.productos.map(({ _nuevo, ...p }) => p);
    const usadas = new Set(productosLimpios.map((p) => p.image));
    const arbol = [];
    for (const [ruta, dataUrl] of estado.imagenesNuevas) {
      if (!usadas.has(ruta)) continue;
      const blob = await gh(repo + "/git/blobs", { method: "POST", body: JSON.stringify({ content: dataUrl.split(",")[1], encoding: "base64" }) });
      arbol.push({ path: ruta, mode: "100644", type: "blob", sha: blob.sha });
    }
    // borrar fotos que ya nadie usa
    const anteriores = JSON.parse(estado.original)[1] || [];
    anteriores.forEach((p) => {
      if (p.image && p.image.startsWith("img/productos/") && !usadas.has(p.image)) arbol.push({ path: p.image, mode: "100644", type: "blob", sha: null });
    });
    arbol.push({ path: "data/products.json", mode: "100644", type: "blob", content: JSON.stringify(productosLimpios, null, 2) + "\n" });
    arbol.push({ path: "data/config.json", mode: "100644", type: "blob", content: JSON.stringify(estado.config, null, 2) + "\n" });

    const tree = await gh(repo + "/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commitBase.tree.sha, tree: arbol }) });
    const commit = await gh(repo + "/git/commits", { method: "POST", body: JSON.stringify({ message: "Actualizar catálogo desde el panel", tree: tree.sha, parents: [ref.object.sha] }) });
    await gh(repo + "/git/refs/heads/" + encodeURIComponent(rama), { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });

    estado.productos.forEach((p) => delete p._nuevo);
    marcarPublicado();
    pintarProductos();
    aviso("¡Publicado! 🎉 En 1 o 2 minutos lo verás en tu página.", 6000);
  } catch (e) {
    console.error(e);
    if (e.status === 401 || e.status === 403) aviso("Tu llave no tiene permiso o venció. Crea una nueva llave.", 6000);
    else if (e.status === 409 || e.status === 422) aviso("Alguien cambió la página al mismo tiempo. Recarga el panel e intenta de nuevo.", 6000);
    else aviso("No se pudo publicar (" + e.message + "). Revisa tu internet e intenta otra vez.", 6000);
  } finally {
    btn.textContent = "🚀 Publicar en mi página";
    actualizarBarra();
  }
}

iniciar();
