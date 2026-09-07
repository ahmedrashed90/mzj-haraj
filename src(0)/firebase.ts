import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCFJSPtJ7zUieFJLek89bRjwbpjx4RTH4Q",
  authDomain: "mzj-haraj-manager.firebaseapp.com",
  projectId: "mzj-haraj-manager",
  storageBucket: "mzj-haraj-manager.firebasestorage.app",
  messagingSenderId: "1010745644909",
  appId: "1:1010745644909:web:f3c84b581bbba79d3d6c64",
  measurementId: "G-WD5ZRRKKR5"
};

export const ADMIN_EMAIL = "admin@mzj.com";
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
