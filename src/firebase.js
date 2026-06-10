// Inicialização do Firebase (SDK modular) — roda no navegador via Vite.
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBSxCEwDindYV9KVxpGxA2kvQqaQoDuQog",
  authDomain: "herbert-edu.firebaseapp.com",
  projectId: "herbert-edu",
  storageBucket: "herbert-edu.firebasestorage.app",
  messagingSenderId: "610927623824",
  appId: "1:610927623824:web:7ca3ac173175be1f0c6215",
  measurementId: "G-PX10HDQ4Q9",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Analytics só funciona em https/localhost e em ambiente de navegador;
// carregamos de forma "preguiçosa" para não quebrar nada caso indisponível.
export async function iniciarAnalytics() {
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    if (await isSupported()) return getAnalytics(app);
  } catch {
    /* ignora — analytics é opcional */
  }
  return null;
}
