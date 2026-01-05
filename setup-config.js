// Setup Helper Script - Run this in Node.js to update Firebase config
// Usage: node setup-config.js

const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupFirebase() {
  console.log('\n🔥 Firebase Configuration Setup\n');
  console.log('Please enter your Firebase configuration values:\n');

  const apiKey = await question('API Key: ');
  const authDomain = await question('Auth Domain: ');
  const projectId = await question('Project ID: ');
  const storageBucket = await question('Storage Bucket: ');
  const messagingSenderId = await question('Messaging Sender ID: ');
  const appId = await question('App ID: ');
  const adminEmail = await question('Admin Email (default: admin@campus.edu): ') || 'admin@campus.edu';

  const configContent = `// Firebase Configuration
// Replace these values with your Firebase project config
const firebaseConfig = {
  apiKey: "${apiKey}",
  authDomain: "${authDomain}",
  projectId: "${projectId}",
  storageBucket: "${storageBucket}",
  messagingSenderId: "${messagingSenderId}",
  appId: "${appId}"
};

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch (error) {
  console.error('Firebase initialization error:', error);
  showFirebaseError();
}

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Admin email (can be moved to Firestore for better security)
const ADMIN_EMAIL = "${adminEmail}";

// Check if Firebase is properly configured
function isFirebaseConfigured() {
  return firebaseConfig.apiKey !== "YOUR_API_KEY" && 
         firebaseConfig.projectId !== "YOUR_PROJECT_ID";
}

// Show error message if Firebase not configured
function showFirebaseError() {
  if (!isFirebaseConfigured()) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#f44336;color:white;padding:15px;text-align:center;z-index:10000;box-shadow:0 2px 4px rgba(0,0,0,0.2);';
    errorDiv.innerHTML = '⚠️ Firebase not configured! <a href="setup.html" style="color:white;text-decoration:underline;margin-left:10px;">Click here to configure</a>';
    document.body.insertBefore(errorDiv, document.body.firstChild);
  }
}

// Run check on load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', showFirebaseError);
}
`;

  fs.writeFileSync('js/firebase.js', configContent);
  console.log('\n✅ Configuration saved to js/firebase.js\n');
  console.log('You can now start your server and test the app!');
  rl.close();
}

setupFirebase().catch(console.error);

