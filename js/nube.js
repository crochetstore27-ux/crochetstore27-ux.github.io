/* Conexión con Firebase: inicio de sesión (Auth) y base de datos (Firestore). */
import { firebaseConfig as configReal, ADMINS as adminsReales } from "./firebase-config.js";

// (solo para pruebas locales con los emuladores de Firebase)
const prueba = window.__PRUEBA_FIREBASE;
const firebaseConfig = prueba ? prueba.config : configReal;
const ADMINS = prueba ? prueba.admins : adminsReales;

export const activa = !!(firebaseConfig && firebaseConfig.apiKey);
export let auth = null;
export let db = null;
export let A = {}; // funciones de auth
export let F = {}; // funciones de firestore

if (activa) {
  const app = await import("../vendor/firebase/firebase-app.js");
  A = await import("../vendor/firebase/firebase-auth.js");
  F = await import("../vendor/firebase/firebase-firestore.js");
  const fb = app.initializeApp(firebaseConfig);
  auth = A.getAuth(fb);
  auth.languageCode = "es";
  db = F.initializeFirestore(fb, prueba ? {} : { localCache: F.persistentLocalCache() });
  if (prueba) {
    A.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    F.connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
}

export function esAdmin(usuario) {
  return !!(usuario && usuario.email && ADMINS.map((e) => e.toLowerCase()).includes(usuario.email.toLowerCase()));
}

export function alCambiarUsuario(fn) {
  if (!activa) return fn(null);
  A.onAuthStateChanged(auth, fn);
}

export async function entrarConGoogle() {
  const p = new A.GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  try {
    return await A.signInWithPopup(auth, p);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") return A.signInWithRedirect(auth, p);
    throw e;
  }
}
export const entrarConCorreo = (correo, clave) => A.signInWithEmailAndPassword(auth, correo, clave);
export async function crearCuenta(nombre, correo, clave) {
  const r = await A.createUserWithEmailAndPassword(auth, correo, clave);
  if (nombre) await A.updateProfile(r.user, { displayName: nombre });
  return r;
}
export const recuperarClave = (correo) => A.sendPasswordResetEmail(auth, correo);
export const salir = () => A.signOut(auth);

export function mensajeError(e) {
  const c = (e && e.code) || "";
  const m = {
    "auth/invalid-email": "Ese correo no es válido.",
    "auth/missing-password": "Escribe tu contraseña.",
    "auth/weak-password": "La contraseña debe tener al menos 6 letras o números.",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Toca \"Ya tengo cuenta\".",
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Contraseña incorrecta.",
    "auth/user-not-found": "No existe una cuenta con ese correo.",
    "auth/too-many-requests": "Demasiados intentos. Espera un momento.",
    "auth/popup-closed-by-user": "Cerraste la ventana antes de terminar.",
    "auth/cancelled-popup-request": "",
    "auth/unauthorized-domain": "Falta autorizar este dominio en Firebase (Authentication → Configuración → Dominios autorizados).",
    "auth/network-request-failed": "Sin conexión a internet. Intenta de nuevo.",
    "permission-denied": "No tienes permiso para hacer esto.",
  };
  return m[c] ?? "Algo salió mal (" + (c || (e && e.message) || "error") + "). Intenta de nuevo.";
}
