# Lizzy Store · Página de crochet

Tienda: **https://crochetstore27-ux.github.io**

## Cómo funciona
- Los clientes ven el catálogo, **personalizan** cada producto (colores, extras, tarjeta…), inician sesión con **Google o correo** y **envían el pedido desde la página**. Ven el estado en "Mis pedidos".
- La dueña/el dueño entra con su cuenta en el **mismo link** y le aparece **Panel de administración**: pedidos en tiempo real, productos y sus opciones, subir catálogos en PDF y datos del negocio.
- Todo es gratis: GitHub Pages aloja la página y Firebase (plan gratuito Spark) guarda cuentas, productos, fotos y pedidos.

## Archivos (para el futuro)
- `index.html`, `css/`, `js/app.js`: la tienda.
- `js/panel.js`: el panel de administración (solo se carga para los administradores).
- `js/opciones.js`: tipos de personalización y plantillas por categoría.
- `js/lector-pdf.js`: lee catálogos PDF (pdf.js + Tesseract, incluidos en `vendor/`).
- `js/firebase-config.js`: configuración de Firebase y correos de administradores.
- `firestore.rules`: reglas de seguridad de la base de datos (se copian en la consola de Firebase).
- `data/`: catálogo inicial (se usa mientras Firebase no está configurado o vacío).
