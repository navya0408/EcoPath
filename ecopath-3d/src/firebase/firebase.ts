import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 🔐 Your Firebase config
const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
  measurementId: "",
};

// ✅ Initialize Firebase ONCE
const app = initializeApp(firebaseConfig);

// ✅ Export Auth instance
export const auth = getAuth(app);

export default app;
