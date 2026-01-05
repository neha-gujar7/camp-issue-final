// js/firebase.js
// =====================================
// Firebase initialization (COMPAT MODE)
// =====================================

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyD9Ipmqf2O5ru-bhHGwz_BWffhnE2SYkHU",
  authDomain: "project-2c036.firebaseapp.com",
  projectId: "project-2c036",
  storageBucket: "project-2c036.firebasestorage.app",
  messagingSenderId: "855264405134",
  appId: "1:855264405134:web:7505822b503eb2ef0f0bdf"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Services (GLOBAL — this fixes `auth is not defined`)
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage(); 

// Admin email
const ADMIN_EMAIL = "admin@campus.edu";

// Auth listener
// auth.onAuthStateChanged(user => {
//   if (user) {
//     console.log("👤 Logged in:", user.email);
//   } else {
//     console.log("👤 Not logged in");
//   }
// });

// js/firebase.js
auth.onAuthStateChanged(user => {
  console.log("Auth state:", user ? user.email : "No user");
});

