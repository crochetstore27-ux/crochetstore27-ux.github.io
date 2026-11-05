/* Lector de catálogos PDF: abre el PDF (pdf.js), reconoce el texto de cada página con Tesseract
   (gratis, dentro del navegador) y arma una lista de productos con nombre, precio y recorte de foto. */
import * as pdfjsLib from "../vendor/pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

export const slug = (t) =>
  String(t || "producto")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "producto";
export function aOracion(t) {
  t = t.replace(/\s+/g, " ").trim();
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  if (letras && letras === letras.toUpperCase()) t = t.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export function leerPrecio(v) {
  const s = String(v ?? "").replace(/[^0-9.,]/g, "").replace(",", ".");
  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : Math.round(n * 100) / 100;
}
export function categoriaDesdeArchivo(nombre) {
  let n = nombre.replace(/\.pdf$/i, "").replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{6,}\b/gi, " ").replace(/[_-]+/g, " ").replace(/\b(cat[aá]logo|de|del|los|las)\b/gi, " ");
  n = n.replace(/\s+/g, " ").trim();
  return n ? aOracion(n) : "Productos";
}

/* ================= recortes de imagen ================= */
// recorte = {x, y, w, h} en proporción (0 a 1) de la página; null = toda la página
export function recortar(origen, r, maximo) {
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
  if (!window.Tesseract) {
    await new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = new URL("../vendor/tesseract/tesseract.min.js", import.meta.url).href;
      s.onload = ok;
      s.onerror = mal;
      document.head.appendChild(s);
    });
  }
  const base = new URL("../vendor/tesseract/", import.meta.url).href;
  lector = await Tesseract.createWorker("spa", 1, {
    workerPath: base + "worker.min.js",
    corePath: base + "core/",
    langPath: base + "lang/",
    gzip: true,
  });
  return lector;
}

/* Devuelve { paginas: [canvas], borradores: [...] }. alAvanzar(texto, fraccion, borradoresHastaAhora) */
export async function leerPdf(archivo, categoria, alAvanzar = () => {}) {
  const paginas = [];
  const borradores = [];
  alAvanzar("Abriendo el PDF…", 0.02, borradores);
  const pdf = await pdfjsLib.getDocument({ data: await archivo.arrayBuffer() }).promise;
  alAvanzar("Preparando el lector de texto (la primera vez tarda un poquito)…", 0.05, borradores);
  const worker = await obtenerLector();
  for (let n = 1; n <= pdf.numPages; n++) {
    alAvanzar("Leyendo página " + n + " de " + pdf.numPages + "…", 0.05 + (0.95 * (n - 1)) / pdf.numPages, borradores);
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
    paginas.push(canvas);

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
    borradores.push(...armarProductos(lineas, fotos, canvas, n - 1, categoria));
  }
  alAvanzar("¡Listo! Encontré " + borradores.length + " productos. Revísalos abajo 👇", 1, borradores);
  return { paginas, borradores };
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
