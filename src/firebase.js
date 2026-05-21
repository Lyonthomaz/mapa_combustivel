// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth"; // Adicionado GoogleAuthProvider

const firebaseConfig = {
  apiKey: "AIzaSyC41xE2YbvNUh1CNodSYvY-Vh6E4b4klco",
  authDomain: "mapa-projeto-6c05c.firebaseapp.com",
  projectId: "mapa-projeto-6c05c",
  storageBucket: "mapa-projeto-6c05c.firebasestorage.app",
  messagingSenderId: "897064258634",
  appId: "1:897064258634:web:b5b1f33f0f692cc24daab3",
  measurementId: "G-MTZMR5GD0K"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider(); // Adicionado aqui!