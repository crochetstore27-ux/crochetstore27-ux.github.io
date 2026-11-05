/* Tienda: lee data/config.json y data/products.json y arma la página. */
(function () {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const estado = { config: {}, productos: [], categoria: "Todos", busqueda: "", bolsa: [] };

  const sinCache = "?v=" + Date.now();
  Promise.all([
    fetch("data/config.json" + sinCache).then((r) => r.json()),
    fetch("data/products.json" + sinCache).then((r) => r.json()),
  ])
    .then(([config, productos]) => {
      estado.config = config;
      estado.productos = productos.filter((p) => p.visible !== false);
      cargarBolsa();
      pintarTextos();
      pintarFiltros();
      pintarProductos();
      pintarCollage();
      pintarBolsa();
    })
    .catch(() => {
      $("#grilla").innerHTML = '<p class="vacio">No se pudo cargar el catálogo. Intenta recargar la página.</p>';
    });

  /* ---------- utilidades ---------- */
  const esc = (t) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dinero = (n) => (estado.config.moneda || "$") + Number(n).toFixed(2);
  const tienePrecio = (p) => typeof p.price === "number" && !isNaN(p.price);
  const linkWa = (texto) => "https://wa.me/" + (estado.config.whatsapp || "") + (texto ? "?text=" + encodeURIComponent(texto) : "");
  function aviso(msg) {
    const d = document.createElement("div");
    d.className = "aviso";
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 2200);
  }

  /* ---------- textos ---------- */
  function pintarTextos() {
    const c = estado.config;
    document.querySelectorAll("[data-nombre]").forEach((el) => (el.textContent = c.nombre || "Mi tienda"));
    document.title = (c.nombre || "Mi tienda") + " · Crochet hecho a mano";
    $("#eslogan").textContent = c.eslogan || "";
    $("#descripcion").textContent = c.descripcion || "";
    $("#textoPedidos").textContent = c.textoPedidos || "";
    $("#anio").textContent = new Date().getFullYear();
    const saludo = "¡Hola " + (c.nombre || "") + "! 😊 Quisiera información sobre sus productos.";
    document.querySelectorAll("[data-wa]").forEach((a) => {
      a.href = linkWa(saludo);
      a.target = "_blank";
      a.rel = "noopener";
    });
    const ig = $("#enlaceInstagram");
    if (c.instagram) ig.href = "https://instagram.com/" + c.instagram.replace(/^@/, "");
    else ig.classList.add("oculto");
  }

  function pintarCollage() {
    // primero los productos con precio (suelen ser los más vistosos)
    const fotos = estado.productos.filter((p) => p.image).sort((a, b) => tienePrecio(b) - tienePrecio(a));
    const elegidas = fotos.slice(0, 3);
    $("#collage").innerHTML = elegidas.map((p) => `<img src="${esc(p.image)}" alt="">`).join("");
  }

  /* ---------- filtros ---------- */
  function categorias() {
    const orden = estado.config.categorias || [];
    const usadas = [...new Set(estado.productos.map((p) => p.category || "Otros"))];
    usadas.sort((a, b) => (orden.indexOf(a) + 1 || 999) - (orden.indexOf(b) + 1 || 999));
    return ["Todos", ...usadas];
  }
  function pintarFiltros() {
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
      <article class="tarjeta">
        <div class="foto" data-ver="${esc(p.image)}">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">` : ""}
          <span class="etiqueta-cat">${esc(p.category || "")}</span>
        </div>
        <div class="info">
          <h3>${esc(p.name)}</h3>
          ${p.description ? `<p class="nota">${esc(p.description)}</p>` : ""}
          ${tienePrecio(p) ? `<div class="precio">${dinero(p.price)}</div>` : `<div class="precio consultar">Precio a consultar</div>`}
          <div class="botones">
            <a class="btn btn-wa" target="_blank" rel="noopener" href="${linkWa(mensajeProducto(p))}">Pedir</a>
            <button class="btn btn-borde" data-agregar="${esc(p.id)}">+ Agregar</button>
          </div>
        </div>
      </article>`
      )
      .join("");
  }
  function mensajeProducto(p) {
    return (
      "¡Hola! 😊 Me interesa este producto:\n\n• " +
      p.name +
      (tienePrecio(p) ? " (" + dinero(p.price) + ")" : " (¿cuál es el precio?)") +
      "\n\n¿Está disponible?"
    );
  }

  $("#grilla").addEventListener("click", (e) => {
    const add = e.target.closest("[data-agregar]");
    if (add) {
      agregar(add.dataset.agregar);
      return;
    }
    const foto = e.target.closest("[data-ver]");
    if (foto && foto.dataset.ver) {
      $("#visor img").src = foto.dataset.ver;
      $("#visor").classList.remove("oculto");
    }
  });
  $("#visor").addEventListener("click", () => $("#visor").classList.add("oculto"));

  /* ---------- bolsa / mi pedido ---------- */
  function cargarBolsa() {
    try {
      const guardada = JSON.parse(localStorage.getItem("bolsa") || "[]");
      estado.bolsa = guardada.filter((i) => estado.productos.some((p) => p.id === i.id));
    } catch (e) {
      estado.bolsa = [];
    }
  }
  function guardarBolsa() {
    try {
      localStorage.setItem("bolsa", JSON.stringify(estado.bolsa));
    } catch (e) {}
  }
  function agregar(id) {
    const item = estado.bolsa.find((i) => i.id === id);
    if (item) item.cant++;
    else estado.bolsa.push({ id, cant: 1 });
    guardarBolsa();
    pintarBolsa();
    aviso("Agregado a tu pedido 🛍️");
  }
  function pintarBolsa() {
    const total = estado.bolsa.reduce((s, i) => s + i.cant, 0);
    $("#contador").textContent = total;
    $("#contador").classList.toggle("oculto", total === 0);
    if (!estado.bolsa.length) {
      $("#listaBolsa").innerHTML = '<p class="vacio">Tu pedido está vacío.<br>Agrega productos desde el catálogo.</p>';
    } else {
      $("#listaBolsa").innerHTML = estado.bolsa
        .map((i) => {
          const p = estado.productos.find((x) => x.id === i.id);
          return `<div class="item-bolsa">
            <img src="${esc(p.image)}" alt="">
            <div><div class="nombre">${esc(p.name)}</div><div>${tienePrecio(p) ? dinero(p.price) : "Precio a consultar"}</div></div>
            <div class="cantidad">
              <button data-menos="${esc(p.id)}" aria-label="Menos">−</button><span>${i.cant}</span><button data-mas="${esc(p.id)}" aria-label="Más">+</button>
            </div>
          </div>`;
        })
        .join("");
    }
    const suma = estado.bolsa.reduce((s, i) => {
      const p = estado.productos.find((x) => x.id === i.id);
      return s + (tienePrecio(p) ? p.price * i.cant : 0);
    }, 0);
    $("#totalBolsa").textContent = dinero(suma);
  }
  $("#listaBolsa").addEventListener("click", (e) => {
    const mas = e.target.closest("[data-mas]");
    const menos = e.target.closest("[data-menos]");
    const id = (mas || menos)?.dataset[mas ? "mas" : "menos"];
    if (!id) return;
    const item = estado.bolsa.find((i) => i.id === id);
    item.cant += mas ? 1 : -1;
    if (item.cant <= 0) estado.bolsa = estado.bolsa.filter((i) => i !== item);
    guardarBolsa();
    pintarBolsa();
  });
  function abrirBolsa(abrir) {
    $("#panelBolsa").classList.toggle("oculto", !abrir);
    $("#fondoBolsa").classList.toggle("oculto", !abrir);
  }
  $("#abrirBolsa").addEventListener("click", () => abrirBolsa(true));
  $("#cerrarBolsa").addEventListener("click", () => abrirBolsa(false));
  $("#fondoBolsa").addEventListener("click", () => abrirBolsa(false));
  $("#vaciarBolsa").addEventListener("click", () => {
    estado.bolsa = [];
    guardarBolsa();
    pintarBolsa();
  });
  $("#enviarBolsa").addEventListener("click", () => {
    if (!estado.bolsa.length) return aviso("Tu pedido está vacío");
    let suma = 0;
    const lineas = estado.bolsa.map((i) => {
      const p = estado.productos.find((x) => x.id === i.id);
      if (tienePrecio(p)) suma += p.price * i.cant;
      return "• " + i.cant + " x " + p.name + (tienePrecio(p) ? " (" + dinero(p.price) + " c/u)" : " (precio a consultar)");
    });
    const texto = "¡Hola! 😊 Quisiera hacer este pedido:\n\n" + lineas.join("\n") + (suma ? "\n\nTotal aproximado: " + dinero(suma) : "") + "\n\n¿Me confirmas disponibilidad y entrega?";
    window.open(linkWa(texto), "_blank");
  });

  /* ---------- pedido personalizado ---------- */
  $("#formPersonalizado").addEventListener("submit", (e) => {
    e.preventDefault();
    const fecha = $("#pFecha").value;
    const texto =
      "¡Hola! 😊 Quiero un pedido personalizado:\n\n" +
      "👤 Nombre: " + $("#pNombre").value.trim() + "\n" +
      "🧶 Quiero: " + $("#pQue").value.trim() + "\n" +
      ($("#pColores").value.trim() ? "🎨 Colores: " + $("#pColores").value.trim() + "\n" : "") +
      (fecha ? "📅 Para: " + fecha.split("-").reverse().join("/") + "\n" : "");
    window.open(linkWa(texto), "_blank");
  });
})();
