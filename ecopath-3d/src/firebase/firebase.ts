import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// 🔐 Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDoCkFT1_VCaibCzEmjF1fPnK4DgibjONs",
  authDomain: "ecopath-3d-5eeb2.firebaseapp.com",
  projectId: "ecopath-3d-5eeb2",
  storageBucket: "ecopath-3d-5eeb2.firebasestorage.app",
  messagingSenderId: "856233380146",
  appId: "1:856233380146:web:36f37f0ab07cb0ea3d6f2b",
  measurementId: "G-Y8S3S23524",
};

// ✅ Initialize Firebase ONCE
const app = initializeApp(firebaseConfig);

// ✅ Export Auth instance
export const auth = getAuth(app);

export default app;
