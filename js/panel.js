/* Panel de administración dentro de la misma página (solo aparece para los correos en ADMINS).
   Pedidos en tiempo real, productos con sus opciones, lectura de PDF y datos del negocio. */
import { opcionesDe, plantillaPara, colorDe, COLORES } from "./opciones.js";
import { leerPdf, recortar, slug, leerPrecio, categoriaDesdeArchivo } from "./lector-pdf.js";

let ctx; // utilidades que manda app.js
let F, db;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const st = { productos: [], borradores: [], paginas: [], pedidos: [], filtro: "activos", cargado: false, abiertos: new Set(), nuevosSinVer: 0 };
const idCorto = () => Math.random().toString(36).slice(2, 7);

export function abrirPanel(c) {
  ctx = c;
  F = ctx.nube.F;
  db = ctx.nube.db;
  if (!$("#panelAdmin")) montar();
  $("#panelAdmin").classList.remove("oculto");
  document.body.classList.add("sin-scroll");
  history.replaceState(null, "", "#panel");
  if (!st.cargado) {
    st.cargado = true;
    escucharPedidos();
    cargarProductos();
    pintarAjustes();
  }
}
function cerrarPanel() {
  $("#panelAdmin").classList.add("oculto");
  document.body.classList.remove("sin-scroll");
  history.replaceState(null, "", location.pathname);
}

/* ================= estructura ================= */
function montar() {
  const div = document.createElement("div");
  div.id = "panelAdmin";
  div.className = "panel-admin";
  div.innerHTML = `
  <header class="cabecera"><div class="contenedor">
    <span class="logo">Panel 🧶</span>
    <button class="btn btn-borde btn-chico" id="pnCerrar">← Volver a la tienda</button>
  </div></header>
  <main class="contenedor" style="padding:20px 0 60px">
    <div class="pestanas" role="tablist">
      <button class="pestana activa" data-pestana="pedidos">📩 Pedidos <span class="globo oculto" id="globoPedidos">0</span></button>
      <button class="pestana" data-pestana="productos">🧶 Productos</button>
      <button class="pestana" data-pestana="pdf">📄 Subir PDF</button>
      <button class="pestana" data-pestana="ajustes">⚙️ Mi negocio</button>
    </div>

    <section data-panel="pedidos">
      <div class="caja">
        <div class="fila-titulo"><h2>Pedidos</h2><button class="btn btn-borde btn-chico" id="pnNotif">🔔 Activar avisos</button></div>
        <div class="filtros izquierda" id="filtrosPedidos"></div>
        <div id="listaPedidos"><p class="vacio">Cargando pedidos…</p></div>
      </div>
    </section>

    <section data-panel="productos" class="oculto">
      <div class="caja oculto" id="cajaSembrar">
        <h2>Pasa tu catálogo a la nube ☁️</h2>
        <p class="ayuda">Tus productos todavía están en la versión inicial. Tócalo una sola vez para poder editarlos desde aquí.</p>
        <button class="btn btn-rosa" id="pnSembrar">Pasar mi catálogo a la nube</button>
      </div>
      <div class="caja">
        <div class="fila-titulo"><h2>Mis productos</h2><span class="guardado" id="estadoGuardado"></span></div>
        <p class="ayuda">Los cambios se guardan solos. Toca <b>✨ Opciones</b> para elegir qué puede personalizar el cliente (colores, extras, tarjeta…).</p>
        <div class="acciones" style="margin:0 0 16px"><button class="btn btn-borde btn-chico" id="pnNuevo">+ Agregar producto a mano</button></div>
        <div class="lista-edicion" id="listaProductos"></div>
      </div>
    </section>

    <section data-panel="pdf" class="oculto">
      <div class="caja">
        <h2>Subir catálogo en PDF</h2>
        <p class="ayuda">La página lee los nombres, precios y fotos de cada producto. Luego revisas, corriges y lo agregas.</p>
        <div class="campo" style="max-width:360px">
          <label for="inCategoriaPdf">Categoría de estos productos</label>
          <input id="inCategoriaPdf" list="pnCategorias" placeholder="Se toma del nombre del PDF">
        </div>
        <label class="zona-pdf" id="zonaPdf">
          <input type="file" id="inPdf" accept="application/pdf" hidden>
          <div class="icono">📄</div>
          <strong>Toca aquí para elegir tu PDF</strong>
          <span class="ayuda">o arrástralo a este cuadro</span>
        </label>
        <div class="progreso oculto" id="progreso">
          <p id="textoProgreso" style="font-weight:800;margin:0 0 6px">Preparando…</p>
          <div class="barra"><div id="barraProgreso"></div></div>
        </div>
      </div>
      <div class="caja oculto" id="cajaBorradores">
        <h2>Revisa antes de agregar</h2>
        <p class="ayuda">Marca los que quieres agregar. Si dejas el precio vacío saldrá "Precio a consultar".</p>
        <div class="lista-edicion" id="listaBorradores"></div>
        <div class="acciones">
          <button class="btn btn-rosa" id="btnAgregarBorradores">Agregar al catálogo</button>
          <button class="btn btn-borde" id="btnDescartarBorradores">Descartar</button>
        </div>
      </div>
    </section>

    <section data-panel="ajustes" class="oculto">
      <p class="guardado-flotante" id="estadoAjustes"></p>
      <div class="caja">
        <h2>🏪 Datos del negocio</h2>
        <div class="fila">
          <div class="campo"><label>Nombre del negocio</label><input data-cf="nombre"></div>
          <div class="campo"><label>Frase corta</label><input data-cf="eslogan"></div>
        </div>
        <div class="campo"><label>Descripción (sale en la portada)</label><textarea rows="3" data-cf="descripcion"></textarea></div>
        <div class="fila">
          <div class="campo"><label>WhatsApp (con código de país, ej: 50360070579)</label><input data-cf="whatsapp" inputmode="numeric"></div>
          <div class="campo"><label>Instagram (sin @)</label><input data-cf="instagram"></div>
        </div>
        <div class="campo"><label>Orden de las categorías del catálogo (separadas por coma)</label><input data-cf="categorias"></div>
      </div>

      <div class="caja">
        <h2>🔔 Avisos de pedidos nuevos</h2>
        <label class="interruptor"><input type="checkbox" data-cf="whatsappAlEnviar"> Al enviar un pedido, abrir WhatsApp con el pedido listo para mandártelo</label>
        <p class="ayuda">El cliente solo toca "Enviar" en WhatsApp y te llega el pedido completo a tu número.</p>
        <hr class="linea">
        <p><b>Aviso instantáneo a tu celular (gratis):</b> te llega una notificación con sonido aunque el cliente no envíe el WhatsApp.</p>
        <details class="pasos-token">
          <summary>¿Cómo lo activo? (2 minutos)</summary>
          <ol>
            <li>Instala la app <b>ntfy</b> en tu celular (<a href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">Android</a> · <a href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noopener">iPhone</a>).</li>
            <li>Toca <b>Generar nombre secreto</b> aquí abajo.</li>
            <li>En la app toca <b>+</b>, pega ese nombre en "Topic name" y toca <b>Subscribe</b>.</li>
            <li>Toca <b>Probar aviso</b>. ¡Te debe sonar el celular! 📲</li>
          </ol>
        </details>
        <div class="fila">
          <div class="campo"><label>Nombre secreto del aviso</label><input data-cf="avisoNtfy" placeholder="Toca Generar"></div>
          <div class="campo"><label>&nbsp;</label><div class="acciones" style="margin:0">
            <button class="btn btn-borde btn-chico" id="pnGenerarNtfy">🎲 Generar nombre secreto</button>
            <button class="btn btn-rosa btn-chico" id="pnProbarNtfy">📲 Probar aviso</button>
          </div></div>
        </div>
      </div>

      <div class="caja">
        <h2>🎨 Pedidos personalizados</h2>
        <div class="campo"><label>Texto que ven los clientes</label><textarea rows="4" data-cf="textoPersonalizados"></textarea></div>
        <label class="etiqueta-lista">Tipos de pedido y precio "desde" (deja el precio vacío si no quieres mostrarlo)</label>
        <div data-lista="personalizados"></div>
      </div>

      <div class="caja">
        <h2>🛵 Entregas y envíos</h2>
        <p class="ayuda">Marca "Pide dirección" en los envíos a domicilio o departamentales.</p>
        <div data-lista="entregas"></div>
        <div class="campo" style="margin-top:12px"><label>Nota de entregas</label><input data-cf="notaEntregas"></div>
        <div class="campo" style="max-width:260px"><label>Días de anticipación para pedir</label><input data-cf="diasAnticipacion" inputmode="numeric"></div>
      </div>

      <div class="caja">
        <h2>💳 Métodos de pago</h2>
        <div data-lista="pagos"></div>
      </div>

      <div class="caja">
        <h2>📋 ¿Cómo hacer tu pedido? (pasos)</h2>
        <div data-lista="pasos"></div>
      </div>

      <div class="caja">
        <h2>🔐 Inicio de sesión con Facebook</h2>
        <label class="interruptor"><input type="checkbox" data-cf="facebook"> Mostrar el botón "Continuar con Facebook"</label>
        <p class="ayuda">Actívalo solo después de configurar Facebook en Firebase (te pasé los pasos en el chat). Google y correo ya funcionan.</p>
      </div>
    </section>
  </main>
  <datalist id="pnCategorias"></datalist>

  <div class="modal oculto" id="modalRecorte">
    <div class="modal-caja">
      <h3>✂️ Elige la foto</h3>
      <p class="ayuda" style="margin:0">Arrastra con el dedo o el mouse sobre la foto del producto.</p>
      <div class="area-recorte"><canvas id="lienzoRecorte"></canvas></div>
      <div class="botones">
        <button class="btn btn-borde btn-chico" id="recorteCancelar">Cancelar</button>
        <button class="btn btn-borde btn-chico" id="recorteTodo">Usar toda la página</button>
        <button class="btn btn-rosa btn-chico" id="recorteOk">Usar este recorte</button>
      </div>
    </div>
  </div>`;
  $("#raizPanel").appendChild(div);

  $("#pnCerrar").addEventListener("click", cerrarPanel);
  $$(".pestana", div).forEach((b) =>
    b.addEventListener("click", () => {
      $$(".pestana", div).forEach((x) => x.classList.toggle("activa", x === b));
      $$("[data-panel]", div).forEach((p) => p.classList.toggle("oculto", p.dataset.panel !== b.dataset.pestana));
      if (b.dataset.pestana === "pedidos") {
        st.nuevosSinVer = 0;
        globo();
      }
    })
  );
  conectarPedidos();
  conectarProductos();
  conectarPdf();
  conectarAjustes();
}
const irA = (p) => $(`#panelAdmin .pestana[data-pestana="${p}"]`).click();

/* ================= PEDIDOS ================= */
const FILTROS = { activos: "Por atender", nuevo: "📩 Nuevos", proceso: "🧶 Tejiendo", listo: "🎁 Listos", entregado: "✅ Entregados", cancelado: "✖️ Cancelados", todos: "Todos" };
function escucharPedidos() {
  let inicial = true;
  const q = F.query(F.collection(db, "pedidos"), F.orderBy("creado", "desc"), F.limit(300));
  F.onSnapshot(
    q,
    (snap) => {
      if (!inicial) {
        const nuevos = snap.docChanges().filter((c) => c.type === "added" && !c.doc.metadata.hasPendingWrites);
        if (nuevos.length) avisarNuevo(nuevos.map((c) => c.doc.data()));
      }
      inicial = false;
      st.pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pintarPedidos();
    },
    (err) => ($("#listaPedidos").innerHTML = `<p class="vacio">${ctx.esc(ctx.nube.mensajeError(err))}</p>`)
  );
}
function avisarNuevo(lista) {
  const enPedidos = $("#panelAdmin .pestana.activa")?.dataset.pestana === "pedidos";
  if (!enPedidos || document.hidden) {
    st.nuevosSinVer += lista.length;
    globo();
  }
  ctx.aviso("📩 ¡Nuevo pedido de " + (lista[0].cliente?.nombre || "un cliente") + "!", 5000);
  sonar();
  try {
    if (Notification.permission === "granted") new Notification("¡Nuevo pedido! 🧶", { body: (lista[0].cliente?.nombre || "") + " · " + (lista[0].items || []).map((i) => i.nombre).join(", ") });
  } catch (e) {}
}
function globo() {
  const g = $("#globoPedidos");
  g.textContent = st.nuevosSinVer;
  g.classList.toggle("oculto", !st.nuevosSinVer);
}
function sonar() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1175, 1568].forEach((f, k) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = f;
      o.type = "sine";
      g.gain.setValueAtTime(0.0001, ac.currentTime + k * 0.15);
      g.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + k * 0.15 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + k * 0.15 + 0.3);
      o.connect(g).connect(ac.destination);
      o.start(ac.currentTime + k * 0.15);
      o.stop(ac.currentTime + k * 0.15 + 0.32);
    });
  } catch (e) {}
}
function telWa(t) {
  let d = String(t || "").replace(/\D/g, "");
  if (d.length === 8) d = "503" + d;
  return d;
}
function pintarPedidos() {
  const cuenta = (f) => st.pedidos.filter((p) => (f === "todos" ? true : f === "activos" ? ["nuevo", "proceso", "listo"].includes(p.estado) : p.estado === f)).length;
  $("#filtrosPedidos").innerHTML = Object.entries(FILTROS)
    .map(([k, t]) => `<button class="chip ${st.filtro === k ? "activo" : ""}" data-f="${k}">${t} (${cuenta(k)})</button>`)
    .join("");
  const lista = st.pedidos.filter((p) => (st.filtro === "todos" ? true : st.filtro === "activos" ? ["nuevo", "proceso", "listo"].includes(p.estado) : p.estado === st.filtro));
  if (!lista.length) {
    $("#listaPedidos").innerHTML = `<p class="vacio">${st.pedidos.length ? "No hay pedidos en esta lista." : "Aún no hay pedidos. Cuando un cliente envíe uno, aparecerá aquí al instante 💕"}</p>`;
    return;
  }
  const { esc, dinero, ESTADOS, fechaBonita, linkWa } = ctx;
  $("#listaPedidos").innerHTML = lista
    .map((p) => {
      const cod = p.id.slice(0, 6).toUpperCase();
      const msg = "¡Hola " + (p.cliente?.nombre || "") + "! 😊 Te escribimos de " + (ctx.estado.config.nombre || "la tienda") + " por tu pedido #" + cod + ".";
      return `<div class="pedido-admin estado-${esc(p.estado)}">
        <div class="cab">
          <div><b>#${cod}</b> · ${esc(p.cliente?.nombre || "Sin nombre")}<br><small>${fechaBonita(p.creado)}</small></div>
          <select data-estado="${p.id}">${Object.entries(ESTADOS)
            .map(([k, v]) => `<option value="${k}" ${p.estado === k ? "selected" : ""}>${v.e} ${v.t}</option>`)
            .join("")}</select>
        </div>
        <ul>${(p.items || [])
          .map(
            (i) => `<li><b>${i.cant} × ${esc(i.nombre)}</b> <span class="derecha">${i.subtotal == null ? "a consultar" : dinero(i.subtotal)}</span>
            ${(i.detalle || []).map((d) => `<div class="det">${esc(d.titulo)}: <b>${esc(d.valor)}</b>${d.precio ? " (+" + dinero(d.precio) + ")" : ""}</div>`).join("")}</li>`
          )
          .join("")}</ul>
        ${p.fotoRef ? `<a class="foto-ref" href="${p.fotoRef}" target="_blank" rel="noopener"><img src="${p.fotoRef}" alt="Foto de referencia"><span>📷 Foto de referencia (toca para ampliar)</span></a>` : ""}
        <div class="datos">
          <div>📞 ${esc(p.cliente?.telefono || "")} · ${esc(p.email || "")}</div>
          <div>🛵 ${esc(p.entrega || "")}${p.entregaPrecio ? " (" + dinero(p.entregaPrecio) + ")" : ""}${p.cliente?.direccion ? "<br>📍 " + esc(p.cliente.direccion) : ""}</div>
          ${p.pago ? `<div>💳 ${esc(p.pago)}</div>` : ""}
          ${p.fecha ? `<div>📅 Para el ${esc(p.fecha.split("-").reverse().join("/"))}</div>` : ""}
        </div>
        <div class="pie-pedido">
          <b>Total: ${p.total ? dinero(p.total) : "A consultar"}${p.total && p.hayPorConsultar ? " + a consultar" : ""}</b>
          <a class="btn btn-wa btn-chico" target="_blank" rel="noopener" href="${linkWa(msg, telWa(p.cliente?.telefono))}">Escribir por WhatsApp</a>
        </div>
      </div>`;
    })
    .join("");
}
function conectarPedidos() {
  $("#filtrosPedidos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (!b) return;
    st.filtro = b.dataset.f;
    pintarPedidos();
  });
  $("#listaPedidos").addEventListener("change", async (e) => {
    const s = e.target.closest("[data-estado]");
    if (!s) return;
    try {
      await F.updateDoc(F.doc(db, "pedidos", s.dataset.estado), { estado: s.value, actualizado: F.serverTimestamp() });
      ctx.aviso("Estado actualizado ✓ El cliente ya lo ve en \"Mis pedidos\"");
    } catch (err) {
      ctx.aviso(ctx.nube.mensajeError(err), 4000);
    }
  });
  $("#pnNotif").addEventListener("click", async () => {
    try {
      const r = await Notification.requestPermission();
      ctx.aviso(r === "granted" ? "¡Listo! Te avisaré con sonido y notificación mientras el panel esté abierto 🔔" : "No se activaron los avisos", 4000);
    } catch (e) {
      ctx.aviso("Este navegador no permite avisos");
    }
  });
}

/* ================= PRODUCTOS ================= */
async function cargarProductos() {
  const snap = await F.getDocs(F.collection(db, "productos"));
  st.productos = snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  $("#cajaSembrar").classList.toggle("oculto", st.productos.length > 0);
  pintarProductos();
}
function categorias() {
  const set = new Set(ctx.estado.config.categorias || []);
  st.productos.forEach((p) => p.category && set.add(p.category));
  $("#pnCategorias").innerHTML = [...set].map((c) => `<option value="${ctx.esc(c)}">`).join("");
  return [...set];
}

function htmlEditable(p, i, tipo) {
  const { esc } = ctx;
  const esBorrador = tipo === "borrador";
  const incluido = esBorrador ? p.incluir : p.visible !== false;
  const ops = esBorrador ? [] : opcionesDe(p);
  return `
  <div class="editable ${incluido ? "" : "apagado"}" data-i="${i}" data-tipo="${tipo}">
    <div class="lado-foto">
      <div class="miniatura" data-miniatura>${esBorrador ? "" : p.image ? `<img data-foto="${esc(p.image)}" alt="">` : "Sin foto"}</div>
      ${
        esBorrador
          ? `<button class="btn btn-borde btn-chico" data-accion="recortar">✂️ Recortar foto</button>`
          : `<label class="btn btn-borde btn-chico">📷 Cambiar foto<input type="file" accept="image/*" hidden data-accion="foto"></label>`
      }
    </div>
    <div class="campos">
      <div class="campo"><label>Nombre</label><input data-campo="name" value="${esc(p.name)}" placeholder="Nombre del producto"></div>
      <div class="campo"><label>Precio ($)</label><input data-campo="price" inputmode="decimal" value="${p.price == null ? "" : Number(p.price).toFixed(2)}" placeholder="A consultar"></div>
      <div class="campo"><label>Categoría</label><input data-campo="category" list="pnCategorias" value="${esc(p.category)}"></div>
      <div class="campo"><label>Detalle (opcional)</label><input data-campo="description" value="${esc(p.description)}" placeholder="Ej: Se pueden agregar más rosas"></div>
      ${esBorrador ? `<div class="ancho">${p.pista ? `<span class="pista">⚠️ ${esc(p.pista)}</span> ` : ""}<span class="pagina-pdf">Página ${p.pagina + 1} del PDF</span></div>` : ""}
    </div>
    <div class="herramientas">
      ${
        esBorrador
          ? `<label class="interruptor"><input type="checkbox" data-campo="incluir" ${p.incluir ? "checked" : ""}> Agregar este</label>
             <span class="espacio"></span>
             <button class="btn btn-borde btn-chico" data-accion="duplicar">⧉ Otro de esta página</button>`
          : `<label class="interruptor"><input type="checkbox" data-campo="visible" ${p.visible !== false ? "checked" : ""}> Visible</label>
             <button class="btn btn-borde btn-chico" data-accion="opciones">✨ Opciones (${ops.length}) ${st.abiertos.has(p.id) ? "▴" : "▾"}</button>
             <span class="espacio"></span>
             <button class="btn btn-borde btn-chico" data-accion="subir" title="Subir">▲</button>
             <button class="btn btn-borde btn-chico" data-accion="bajar" title="Bajar">▼</button>
             <button class="btn btn-borde btn-chico" data-accion="borrar">🗑️</button>`
      }
    </div>
    ${!esBorrador && st.abiertos.has(p.id) ? `<div class="editor-opciones">${htmlOpciones(p)}</div>` : ""}
  </div>`;
}

const NOMBRE_TIPO = { colores: "🎨 Elegir color", opciones: "🔘 Elegir una opción", cantidad: "🔢 Cantidad extra", texto: "✏️ Texto libre" };
function htmlOpciones(p) {
  const { esc } = ctx;
  const ops = opcionesDe(p);
  const usandoPlantilla = !Array.isArray(p.opciones);
  return `
    ${usandoPlantilla ? `<p class="ayuda">Usando las opciones de la categoría "${esc(p.category || "general")}". Si cambias algo, se guarda solo para este producto.</p>` : ""}
    ${ops
      .map(
        (o, k) => `
      <div class="grupo-edit" data-g="${k}">
        <div class="cab-grupo">
          <span class="tipo">${NOMBRE_TIPO[o.tipo] || o.tipo}</span>
          <input data-o="titulo" value="${esc(o.titulo)}" placeholder="Título (ej: Color de las flores)">
          ${o.tipo === "colores" || o.tipo === "opciones" ? `<label class="interruptor chico"><input type="checkbox" data-o="obligatorio" ${o.obligatorio ? "checked" : ""}> Obligatorio</label>` : ""}
          <button class="btn btn-borde btn-chico" data-og="quitar" title="Quitar esta opción">✕</button>
        </div>
        ${
          o.tipo === "colores" || o.tipo === "opciones"
            ? `<div class="valores">${(o.valores || [])
                .map(
                  (v, j) => `<div class="valor" data-v="${j}">
                ${o.tipo === "colores" ? `<input type="color" data-ov="color" value="${esc(v.color || colorDe(v.nombre))}">` : ""}
                <input data-ov="nombre" value="${esc(v.nombre)}" placeholder="Nombre">
                <span class="mas">+$</span><input data-ov="precio" inputmode="decimal" value="${Number(v.precio) ? Number(v.precio).toFixed(2) : ""}" placeholder="0.00">
                <button data-og="quitarValor" title="Quitar">✕</button>
              </div>`
                )
                .join("")}
              <button class="enlace" data-og="agregarValor">+ Agregar ${o.tipo === "colores" ? "color" : "opción"}</button></div>`
            : o.tipo === "cantidad"
            ? `<div class="fila3"><label>Precio por cada una ($)<input data-o="precio" inputmode="decimal" value="${Number(o.precio) ? Number(o.precio).toFixed(2) : ""}" placeholder="0.00"></label>
               <label>Máximo<input data-o="max" inputmode="numeric" value="${o.max || 10}"></label>
               <label>Nota para el cliente<input data-o="ayuda" value="${esc(o.ayuda || "")}"></label></div>`
            : `<div class="fila3"><label>Ejemplo que ve el cliente<input data-o="ayuda" value="${esc(o.ayuda || "")}"></label>
               <label>Precio extra ($)<input data-o="precio" inputmode="decimal" value="${Number(o.precio) ? Number(o.precio).toFixed(2) : ""}" placeholder="0.00"></label></div>`
        }
      </div>`
      )
      .join("")}
    <div class="agregar-grupo">
      <span>Agregar:</span>
      <button class="btn btn-borde btn-chico" data-nuevo="colores">🎨 Colores</button>
      <button class="btn btn-borde btn-chico" data-nuevo="opciones">🔘 Opciones</button>
      <button class="btn btn-borde btn-chico" data-nuevo="cantidad">🔢 Cantidad extra</button>
      <button class="btn btn-borde btn-chico" data-nuevo="texto">✏️ Texto</button>
      <button class="enlace" data-og="plantilla">Volver a la plantilla de la categoría</button>
    </div>`;
}

function pintarProductos() {
  categorias();
  const lista = $("#listaProductos");
  lista.innerHTML = st.productos.length ? st.productos.map((p, i) => htmlEditable(p, i, "producto")).join("") : '<p class="vacio">Aún no hay productos en la nube.</p>';
  ctx.ponerFotos(lista);
}
function pintarUno(i) {
  const el = $(`#listaProductos .editable[data-i="${i}"]`);
  if (!el) return pintarProductos();
  el.outerHTML = htmlEditable(st.productos[i], i, "producto");
  ctx.ponerFotos($(`#listaProductos .editable[data-i="${i}"]`));
}

const temporizadores = new Map();
function marcarGuardado(texto) {
  $("#estadoGuardado").textContent = texto;
}
function guardarLuego(p, ms = 700) {
  marcarGuardado("Guardando…");
  clearTimeout(temporizadores.get(p.id));
  temporizadores.set(
    p.id,
    setTimeout(() => guardarProducto(p), ms)
  );
}
async function guardarProducto(p) {
  const { id, ...datos } = p;
  try {
    await F.setDoc(F.doc(db, "productos", id), limpiar(datos));
    marcarGuardado("Guardado ✓");
  } catch (e) {
    marcarGuardado("");
    ctx.aviso(ctx.nube.mensajeError(e), 4000);
  }
}
const limpiar = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === undefined ? null : v)));

function conectarProductos() {
  const lista = $("#listaProductos");
  lista.addEventListener("input", (e) => {
    const el = e.target.closest(".editable");
    if (!el) return;
    const p = st.productos[+el.dataset.i];
    const t = e.target;
    if (t.dataset.campo) {
      if (t.dataset.campo === "price") p.price = leerPrecio(t.value);
      else if (t.dataset.campo === "visible") {
        p.visible = t.checked;
        el.classList.toggle("apagado", !t.checked);
      } else p[t.dataset.campo] = t.value;
      guardarLuego(p);
      return;
    }
    // editor de opciones
    const g = t.closest("[data-g]");
    if (!g) return;
    if (!Array.isArray(p.opciones)) p.opciones = opcionesDe(p);
    const o = p.opciones[+g.dataset.g];
    if (t.dataset.o) {
      if (t.dataset.o === "obligatorio") o.obligatorio = t.checked;
      else if (t.dataset.o === "precio") o.precio = leerPrecio(t.value) || 0;
      else if (t.dataset.o === "max") o.max = Math.max(1, parseInt(t.value) || 1);
      else o[t.dataset.o] = t.value;
    } else if (t.dataset.ov) {
      const v = o.valores[+t.closest("[data-v]").dataset.v];
      if (t.dataset.ov === "precio") v.precio = leerPrecio(t.value) || 0;
      else if (t.dataset.ov === "nombre") {
        v.nombre = t.value;
        if (o.tipo === "colores" && COLORES[Object.keys(COLORES).find((c) => c.toLowerCase() === t.value.trim().toLowerCase())]) {
          v.color = colorDe(t.value);
          t.parentElement.querySelector("[data-ov=color]").value = v.color;
        }
      } else v[t.dataset.ov] = t.value;
    }
    guardarLuego(p);
  });
  lista.addEventListener("change", (e) => {
    if (e.target.dataset.accion === "foto") cambiarFoto(e);
  });
  lista.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const el = b.closest(".editable");
    if (!el) return;
    const i = +el.dataset.i;
    const p = st.productos[i];
    const L = st.productos;
    const acc = b.dataset.accion;
    if (acc === "opciones") {
      st.abiertos.has(p.id) ? st.abiertos.delete(p.id) : st.abiertos.add(p.id);
      return pintarUno(i);
    }
    if (acc === "borrar") {
      if (!confirm('¿Borrar "' + (p.name || "este producto") + '" del catálogo?')) return;
      L.splice(i, 1);
      pintarProductos();
      try {
        await F.deleteDoc(F.doc(db, "productos", p.id));
        if (p.image && p.image.startsWith("fotos/")) F.deleteDoc(F.doc(db, p.image)).catch(() => {});
        marcarGuardado("Borrado ✓");
      } catch (err) {
        ctx.aviso(ctx.nube.mensajeError(err), 4000);
      }
      return;
    }
    if ((acc === "subir" && i > 0) || (acc === "bajar" && i < L.length - 1)) {
      const j = acc === "subir" ? i - 1 : i + 1;
      [L[i], L[j]] = [L[j], L[i]];
      L.forEach((x, k) => (x.orden = k));
      pintarProductos();
      marcarGuardado("Guardando…");
      const lote = F.writeBatch(db);
      L.forEach((x) => lote.update(F.doc(db, "productos", x.id), { orden: x.orden }));
      lote.commit().then(() => marcarGuardado("Guardado ✓"));
      return;
    }
    // editor de opciones
    const og = b.dataset.og;
    const nuevo = b.dataset.nuevo;
    if (!og && !nuevo) return;
    if (!Array.isArray(p.opciones)) p.opciones = opcionesDe(p);
    if (nuevo) {
      const base = { id: idCorto(), tipo: nuevo, titulo: "", precio: 0 };
      if (nuevo === "colores") Object.assign(base, { titulo: "Color", valores: [{ nombre: "Rosado", color: COLORES.Rosado, precio: 0 }, { nombre: "Blanco", color: COLORES.Blanco, precio: 0 }] });
      if (nuevo === "opciones") Object.assign(base, { titulo: "Tamaño", valores: [{ nombre: "Pequeño", precio: 0 }, { nombre: "Grande", precio: 0 }] });
      if (nuevo === "cantidad") Object.assign(base, { titulo: "Rosas extra", max: 10 });
      if (nuevo === "texto") Object.assign(base, { titulo: "Mensaje para la tarjeta", ayuda: "Ej: ¡Te quiero mucho!" });
      p.opciones.push(base);
    } else if (og === "plantilla") {
      if (!confirm("¿Volver a las opciones de la categoría? Se pierden los cambios de este producto.")) return;
      p.opciones = null;
      delete p.opciones;
    } else {
      const g = b.closest("[data-g]");
      const o = p.opciones[+g.dataset.g];
      if (og === "quitar") p.opciones.splice(+g.dataset.g, 1);
      if (og === "agregarValor") o.valores.push({ nombre: "", precio: 0, ...(o.tipo === "colores" ? { color: "#f06292" } : {}) });
      if (og === "quitarValor") o.valores.splice(+b.closest("[data-v]").dataset.v, 1);
    }
    pintarUno(i);
    guardarLuego(p, 200);
  });
  $("#pnNuevo").addEventListener("click", async () => {
    const minOrden = Math.min(0, ...st.productos.map((x) => x.orden ?? 0));
    const p = { id: slug("nuevo") + "-" + idCorto(), name: "Producto nuevo", price: null, category: (ctx.estado.config.categorias || [])[0] || "", description: "", image: "", visible: false, orden: minOrden - 1 };
    st.productos.unshift(p);
    pintarProductos();
    await guardarProducto(p);
    ctx.aviso("Producto creado (oculto). Ponle nombre, foto y precio, y marca Visible ✓", 4500);
    $("#listaProductos [data-campo=name]").select();
  });
  $("#pnSembrar").addEventListener("click", sembrar);
}

async function sembrar() {
  const b = $("#pnSembrar");
  b.disabled = true;
  b.textContent = "Pasando…";
  try {
    const productos = await fetch("data/products.json?v=" + Date.now()).then((r) => r.json());
    const config = await fetch("data/config.json?v=" + Date.now()).then((r) => r.json());
    const lote = F.writeBatch(db);
    productos.forEach((p, k) => {
      const { id, ...d } = p;
      lote.set(F.doc(db, "productos", id), limpiar({ ...d, orden: k }));
    });
    lote.set(F.doc(db, "ajustes", "tienda"), { ...config, ...ctx.estado.config }, { merge: true });
    await lote.commit();
    ctx.aviso("¡Listo! Tu catálogo ya está en la nube ☁️", 4000);
    await cargarProductos();
  } catch (e) {
    ctx.aviso(ctx.nube.mensajeError(e), 5000);
    b.disabled = false;
    b.textContent = "Pasar mi catálogo a la nube";
  }
}

/* ---------- fotos ---------- */
function cargarImagen(src) {
  return new Promise((ok, mal) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = mal;
    im.src = src;
  });
}
function aDataUrl(canvas) {
  // las fotos se guardan dentro de la base de datos (gratis); se comprimen para que pesen poco
  for (const [lado, q] of [
    [800, 0.82],
    [700, 0.75],
    [560, 0.7],
  ]) {
    const url = recortar(canvas, null, lado).toDataURL("image/jpeg", q);
    if (url.length < 700000) return url;
  }
  return recortar(canvas, null, 420).toDataURL("image/jpeg", 0.65);
}
async function guardarFoto(canvas) {
  const id = idCorto() + idCorto();
  await F.setDoc(F.doc(db, "fotos", id), { data: aDataUrl(canvas), creado: F.serverTimestamp() });
  return "fotos/" + id;
}
async function cambiarFoto(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const i = +e.target.closest(".editable").dataset.i;
  const p = st.productos[i];
  marcarGuardado("Subiendo foto…");
  try {
    const img = await cargarImagen(URL.createObjectURL(archivo));
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    const anterior = p.image;
    p.image = await guardarFoto(c);
    await guardarProducto(p);
    if (anterior && anterior.startsWith("fotos/")) F.deleteDoc(F.doc(db, anterior)).catch(() => {});
    pintarUno(i);
  } catch (err) {
    marcarGuardado("");
    ctx.aviso(ctx.nube.mensajeError(err), 4000);
  }
}

/* ================= PDF ================= */
function progreso(texto, fraccion) {
  $("#progreso").classList.remove("oculto");
  $("#textoProgreso").textContent = texto;
  $("#barraProgreso").style.width = Math.round(fraccion * 100) + "%";
}
function pintarBorradores() {
  $("#cajaBorradores").classList.toggle("oculto", !st.borradores.length);
  $("#listaBorradores").innerHTML = st.borradores.map((b, i) => htmlEditable(b, i, "borrador")).join("");
  $$("#listaBorradores .editable").forEach((el) => {
    const b = st.borradores[+el.dataset.i];
    const cont = $("[data-miniatura]", el);
    cont.innerHTML = "";
    cont.appendChild(recortar(st.paginas[b.pagina], b.recorte, 300));
  });
  const n = st.borradores.filter((b) => b.incluir).length;
  $("#btnAgregarBorradores").textContent = "Agregar " + n + " producto" + (n === 1 ? "" : "s") + " al catálogo";
}
async function procesarPdf(archivo) {
  if (st.borradores.length && !confirm("Ya tienes productos del PDF anterior sin agregar. ¿Reemplazarlos?")) return;
  const categoria = $("#inCategoriaPdf").value.trim() || categoriaDesdeArchivo(archivo.name);
  $("#inCategoriaPdf").value = categoria;
  st.borradores = [];
  st.paginas = [];
  pintarBorradores();
  try {
    const r = await leerPdf(archivo, categoria, (texto, f) => progreso(texto, f));
    st.paginas = r.paginas;
    st.borradores = r.borradores;
    pintarBorradores();
    if (!st.borradores.length) ctx.aviso("No encontré productos en este PDF.");
    else $("#cajaBorradores").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    console.error(err);
    progreso("No se pudo leer el PDF 😕 (" + err.message + ")", 0);
  }
}
function conectarPdf() {
  $("#inPdf").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) procesarPdf(f);
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
    if (f) procesarPdf(f);
    else ctx.aviso("Ese archivo no es un PDF");
  });
  const lb = $("#listaBorradores");
  const editar = (e) => {
    const el = e.target.closest(".editable");
    const c = e.target.dataset.campo;
    if (!el || !c) return;
    const b = st.borradores[+el.dataset.i];
    if (c === "price") b.price = leerPrecio(e.target.value);
    else if (c === "incluir") {
      b.incluir = e.target.checked;
      pintarBorradores();
    } else b[c] = e.target.value;
  };
  lb.addEventListener("input", editar);
  lb.addEventListener("change", editar);
  lb.addEventListener("click", (e) => {
    const b = e.target.closest("[data-accion]");
    if (!b) return;
    const i = +b.closest(".editable").dataset.i;
    if (b.dataset.accion === "recortar") abrirRecorte(i);
    if (b.dataset.accion === "duplicar") {
      st.borradores.splice(i + 1, 0, { ...st.borradores[i], name: "", price: null, description: "", incluir: true, pista: "Elige su foto con ✂️ Recortar foto" });
      pintarBorradores();
      abrirRecorte(i + 1);
    }
  });
  $("#btnDescartarBorradores").addEventListener("click", () => {
    if (!confirm("¿Descartar los productos leídos del PDF?")) return;
    st.borradores = [];
    pintarBorradores();
    $("#progreso").classList.add("oculto");
  });
  $("#btnAgregarBorradores").addEventListener("click", agregarBorradores);
  conectarRecorte();
}
async function agregarBorradores() {
  const elegidos = st.borradores.filter((b) => b.incluir);
  if (!elegidos.length) return ctx.aviso("Marca al menos un producto");
  if (elegidos.some((b) => !b.name.trim())) return ctx.aviso("Hay un producto marcado sin nombre. Escríbelo o desmárcalo.");
  if (!st.productos.length && !$("#cajaSembrar").classList.contains("oculto")) {
    if (confirm("Primero conviene pasar tu catálogo actual a la nube para no perderlo. ¿Lo hago ahora?")) await sembrar();
  }
  const btn = $("#btnAgregarBorradores");
  btn.disabled = true;
  try {
    const minOrden = Math.min(0, ...st.productos.map((p) => p.orden ?? 0));
    for (let k = 0; k < elegidos.length; k++) {
      const b = elegidos[k];
      progreso("Guardando " + (k + 1) + " de " + elegidos.length + "…", (k + 1) / elegidos.length);
      const foto = await guardarFoto(recortar(st.paginas[b.pagina], b.recorte, 1000));
      const id = slug(b.name) + "-" + idCorto();
      const p = { name: b.name.trim(), price: b.price, category: b.category.trim() || "Productos", description: (b.description || "").trim(), image: foto, visible: true, orden: minOrden - elegidos.length + k };
      await F.setDoc(F.doc(db, "productos", id), limpiar(p));
    }
    const cats = ctx.estado.config.categorias || [];
    const nuevas = [...new Set(elegidos.map((b) => b.category.trim()))].filter((c) => c && !cats.includes(c));
    if (nuevas.length) {
      ctx.estado.config.categorias = [...cats, ...nuevas];
      await F.setDoc(F.doc(db, "ajustes", "tienda"), { categorias: ctx.estado.config.categorias }, { merge: true });
      pintarAjustes();
    }
    st.borradores = [];
    pintarBorradores();
    $("#progreso").classList.add("oculto");
    await cargarProductos();
    irA("productos");
    ctx.aviso("¡Se agregaron " + elegidos.length + " productos! Ya los ven tus clientes 🎉", 4500);
  } catch (e) {
    ctx.aviso(ctx.nube.mensajeError(e), 5000);
  } finally {
    btn.disabled = false;
  }
}

/* ---------- recorte ---------- */
const rec = { i: -1, sel: null, inicio: null };
function abrirRecorte(i) {
  rec.i = i;
  const b = st.borradores[i];
  const pag = st.paginas[b.pagina];
  const l = $("#lienzoRecorte");
  l.width = pag.width;
  l.height = pag.height;
  rec.sel = b.recorte ? { ...b.recorte } : null;
  dibujarRecorte();
  $("#modalRecorte").classList.remove("oculto");
}
function dibujarRecorte() {
  const l = $("#lienzoRecorte");
  const pag = st.paginas[st.borradores[rec.i].pagina];
  const c = l.getContext("2d");
  c.drawImage(pag, 0, 0);
  if (!rec.sel) return;
  const s = rec.sel,
    W = l.width,
    H = l.height;
  c.fillStyle = "rgba(0,0,0,.45)";
  c.beginPath();
  c.rect(0, 0, W, H);
  c.rect(s.x * W, s.y * H, s.w * W, s.h * H);
  c.fill("evenodd");
  c.strokeStyle = "#e84e7c";
  c.lineWidth = Math.max(3, W / 250);
  c.setLineDash([12, 8]);
  c.strokeRect(s.x * W, s.y * H, s.w * W, s.h * H);
  c.setLineDash([]);
}
function conectarRecorte() {
  const l = $("#lienzoRecorte");
  const punto = (e) => {
    const r = l.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  l.addEventListener("pointerdown", (e) => {
    l.setPointerCapture(e.pointerId);
    rec.inicio = punto(e);
    rec.sel = { ...rec.inicio, w: 0, h: 0 };
  });
  l.addEventListener("pointermove", (e) => {
    if (!rec.inicio) return;
    const p = punto(e);
    rec.sel = { x: Math.min(p.x, rec.inicio.x), y: Math.min(p.y, rec.inicio.y), w: Math.abs(p.x - rec.inicio.x), h: Math.abs(p.y - rec.inicio.y) };
    dibujarRecorte();
  });
  l.addEventListener("pointerup", () => (rec.inicio = null));
  const cerrarR = () => $("#modalRecorte").classList.add("oculto");
  $("#recorteCancelar").addEventListener("click", cerrarR);
  $("#recorteTodo").addEventListener("click", () => {
    st.borradores[rec.i].recorte = null;
    cerrarR();
    pintarBorradores();
  });
  $("#recorteOk").addEventListener("click", () => {
    if (!rec.sel || rec.sel.w < 0.03 || rec.sel.h < 0.03) return ctx.aviso("Arrastra sobre la foto para marcarla");
    const b = st.borradores[rec.i];
    b.recorte = rec.sel;
    if (b.pista && /recorte|foto/i.test(b.pista)) b.pista = "";
    cerrarR();
    pintarBorradores();
  });
}

/* ================= AJUSTES ================= */
const LISTAS = {
  personalizados: { campos: [["emoji", "Emoji", "60px"], ["nombre", "Tipo (ej: Amigurumi)", "1fr"], ["desde", "Desde $", "90px", "numero"]], nuevo: { emoji: "✨", nombre: "", desde: null }, agregar: "+ Agregar tipo" },
  entregas: { campos: [["nombre", "Lugar o forma de entrega", "1fr"], ["precio", "Precio $", "90px", "numero"], ["pideDireccion", "Pide dirección", "auto", "check"]], nuevo: { nombre: "", precio: 1, pideDireccion: false }, agregar: "+ Agregar entrega" },
  pagos: { campos: [[null, "Método de pago", "1fr"]], nuevo: "", agregar: "+ Agregar método" },
  pasos: { campos: [["titulo", "Título del paso", "1fr"], ["texto", "Explicación", "2fr", "area"]], nuevo: { titulo: "", texto: "" }, agregar: "+ Agregar paso" },
};
function pintarLista(clave) {
  const def = LISTAS[clave];
  const filas = ctx.estado.config[clave] || [];
  const cont = $(`#panelAdmin [data-lista="${clave}"]`);
  const cols = def.campos.map((c) => c[2]).join(" ") + " auto";
  cont.innerHTML =
    filas
      .map(
        (f, k) => `<div class="fila-lista" style="grid-template-columns:${cols}" data-k="${k}">
        ${def.campos
          .map(([c, ph, , tipo]) => {
            const v = c == null ? f : f[c];
            if (tipo === "check") return `<label class="interruptor chico"><input type="checkbox" data-c="${c}" ${v ? "checked" : ""}> ${ph}</label>`;
            if (tipo === "area") return `<textarea rows="2" data-c="${c}" placeholder="${ph}">${ctx.esc(v ?? "")}</textarea>`;
            return `<input data-c="${c ?? ""}" placeholder="${ph}" value="${ctx.esc(tipo === "numero" ? (v == null || v === "" ? "" : v) : v ?? "")}" ${tipo === "numero" ? 'inputmode="decimal"' : ""}>`;
          })
          .join("")}
        <span class="mini-botones"><button data-lm="subir" title="Subir">▲</button><button data-lm="bajar" title="Bajar">▼</button><button data-lm="quitar" title="Quitar">✕</button></span>
      </div>`
      )
      .join("") + `<button class="enlace" data-lm="agregar">${def.agregar}</button>`;
}
function pintarAjustes() {
  $$("#panelAdmin [data-cf]").forEach((el) => {
    const v = ctx.estado.config[el.dataset.cf];
    if (el.type === "checkbox") el.checked = el.dataset.cf === "whatsappAlEnviar" ? v !== false : !!v;
    else el.value = Array.isArray(v) ? v.join(", ") : v ?? "";
  });
  Object.keys(LISTAS).forEach(pintarLista);
}
let tAjustes;
function guardarAjustes() {
  $("#estadoAjustes").textContent = "Guardando…";
  $("#estadoAjustes").classList.add("visible");
  clearTimeout(tAjustes);
  tAjustes = setTimeout(async () => {
    try {
      await F.setDoc(F.doc(db, "ajustes", "tienda"), limpiar(ctx.estado.config), { merge: true });
      $("#estadoAjustes").textContent = "Guardado ✓ Tus clientes ya lo ven al recargar la página";
      setTimeout(() => $("#estadoAjustes").classList.remove("visible"), 2500);
    } catch (e) {
      $("#estadoAjustes").classList.remove("visible");
      ctx.aviso(ctx.nube.mensajeError(e), 4000);
    }
  }, 800);
}
function conectarAjustes() {
  const panel = $('#panelAdmin [data-panel="ajustes"]');
  panel.addEventListener("input", (e) => {
    const el = e.target;
    const c = ctx.estado.config;
    if (el.dataset.cf) {
      const k = el.dataset.cf;
      if (el.type === "checkbox") c[k] = el.checked;
      else if (k === "categorias") c[k] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
      else if (k === "whatsapp") c[k] = el.value.replace(/\D/g, "");
      else if (k === "instagram") c[k] = el.value.trim().replace(/^@/, "");
      else if (k === "diasAnticipacion") c[k] = Math.max(0, parseInt(el.value) || 0);
      else if (k === "avisoNtfy") c[k] = el.value.trim().replace(/[^A-Za-z0-9_-]/g, "");
      else c[k] = el.value;
      return guardarAjustes();
    }
    const fila = el.closest("[data-k]");
    if (!fila) return;
    const clave = el.closest("[data-lista]").dataset.lista;
    const def = LISTAS[clave];
    const lista = c[clave] || (c[clave] = []);
    const k = +fila.dataset.k;
    const campo = el.dataset.c;
    const tipo = (def.campos.find((x) => (x[0] ?? "") === campo) || [])[3];
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (tipo === "numero") v = leerPrecio(v);
    if (campo === "") lista[k] = v;
    else lista[k] = { ...lista[k], [campo]: v };
    guardarAjustes();
  });
  panel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lm]");
    if (!b) return;
    const clave = b.closest("[data-lista]").dataset.lista;
    const c = ctx.estado.config;
    const lista = c[clave] || (c[clave] = []);
    const fila = b.closest("[data-k]");
    const k = fila ? +fila.dataset.k : -1;
    const acc = b.dataset.lm;
    if (acc === "agregar") lista.push(typeof LISTAS[clave].nuevo === "object" ? { ...LISTAS[clave].nuevo } : LISTAS[clave].nuevo);
    if (acc === "quitar") lista.splice(k, 1);
    if (acc === "subir" && k > 0) [lista[k - 1], lista[k]] = [lista[k], lista[k - 1]];
    if (acc === "bajar" && k < lista.length - 1) [lista[k + 1], lista[k]] = [lista[k], lista[k + 1]];
    pintarLista(clave);
    if (acc === "agregar") $(`#panelAdmin [data-lista="${clave}"] .fila-lista:last-of-type input, #panelAdmin [data-lista="${clave}"] .fila-lista:last-of-type textarea`)?.focus();
    guardarAjustes();
  });
  $("#pnGenerarNtfy").addEventListener("click", () => {
    const n = "lizzy-" + Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
    const inp = $('#panelAdmin [data-cf="avisoNtfy"]');
    inp.value = n;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    try {
      navigator.clipboard.writeText(n);
      ctx.aviso("Nombre copiado 📋 Pégalo en la app ntfy", 3500);
    } catch (e) {}
  });
  $("#pnProbarNtfy").addEventListener("click", async () => {
    const tema = (ctx.estado.config.avisoNtfy || "").trim();
    if (!tema) return ctx.aviso("Primero genera el nombre secreto");
    try {
      await fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify({ topic: tema, title: "¡Funciona! 🎉", message: "Así te avisaremos cuando llegue un pedido nuevo.", tags: ["yarn"], priority: 5 }) });
      ctx.aviso("Aviso enviado 📲 Revisa tu celular", 3500);
    } catch (e) {
      ctx.aviso("No se pudo enviar el aviso. Revisa tu internet.");
    }
  });
}
