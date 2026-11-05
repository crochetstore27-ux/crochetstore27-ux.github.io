/* Configuración de Firebase (no es secreta: es normal que esté a la vista).
   Si firebaseConfig queda en null, la tienda funciona igual pero solo con pedidos por WhatsApp. */
export const firebaseConfig = {
  apiKey: "AIzaSyBmZBgPhkoTE7GMnJDzWKGm0zBPPBYRLO8",
  authDomain: "lizzy-store.firebaseapp.com",
  projectId: "lizzy-store",
  storageBucket: "lizzy-store.firebasestorage.app",
  messagingSenderId: "834128849063",
  appId: "1:834128849063:web:8f0456938c213c2a6c9382",
};

/* Correos de las personas que pueden entrar al panel de administración */
export const ADMINS = ["crochetstore27@gmail.com"];
