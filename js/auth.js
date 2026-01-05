// Authentication Logic

// Sign up function
async function signUp(email, password) {
  try {
    // Works in both Firebase and demo mode
    const userCredential = await auth.createUserWithEmailAndPassword(email, password);
    console.log("User signed up:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    // Handle auth errors (works for both Firebase and demo mode)
    let errorMessage = "Signup failed. Please try again.";
    if (error.code === "auth/email-already-in-use" || error.message.includes("already registered")) {
      errorMessage = "This email is already registered. Please login instead.";
    } else if (error.code === "auth/weak-password") {
      errorMessage = "Password should be at least 6 characters.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Sign in function
async function signIn(email, password) {
  try {
    // Works in both Firebase and demo mode
    const userCredential = await auth.signInWithEmailAndPassword(email, password);
    console.log("User signed in:", userCredential.user.email);
    return userCredential.user;
  } catch (error) {
    // Handle auth errors (works for both Firebase and demo mode)
    let errorMessage = "Login failed. Please check your credentials.";
    if (error.code === "auth/user-not-found" || error.message.includes("not found")) {
      errorMessage = "No account found with this email. Please sign up first.";
    } else if (error.code === "auth/wrong-password" || error.message.includes("Wrong password")) {
      errorMessage = "Incorrect password. Please try again.";
    } else if (error.code === "auth/invalid-email") {
      errorMessage = "Invalid email address.";
    } else if (error.code === "auth/user-disabled") {
      errorMessage = "This account has been disabled.";
    } else if (error.message) {
      errorMessage = error.message;
    }
    throw new Error(errorMessage);
  }
}

// Sign out function
function signOut() {
  return auth.signOut();
}

// Check if user is admin
function isAdmin(email) {
  return email === ADMIN_EMAIL || email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Redirect user based on role
// function redirectUser(user) {
//   if (isAdmin(user.email)) {
//     window.location.href = "admin.html";
//   } else {
//     window.location.href = "report.html";
//   }
// }

function redirectUser(user) {
  const page = window.location.pathname;

  if (isAdmin(user.email)) {
    if (!page.includes("admin.html")) {
      window.location.href = "admin.html";
    }
  } else {
    if (!page.includes("report.html")) {
      window.location.href = "report.html";
    }
  }
}

auth.onAuthStateChanged((user) => {
  if (user && window.location.pathname.includes("index.html")) {
    redirectUser(user);
  }
});





// Auth state observer - redirect if already logged in
// Wait for auth to be initialized
// function setupAuthObserver() {
//   if (auth && typeof auth.onAuthStateChanged === 'function') {
//     auth.onAuthStateChanged((user) => {
//       if (user && window.location.pathname.includes("index.html")) {
//         redirectUser(user);
//       } else if (!user && !window.location.pathname.includes("index.html")) {
//         window.location.href = "index.html";
//       }
//     });
//   } else {
//     // Retry if auth not ready yet
//     setTimeout(setupAuthObserver, 200);
//   }
// }

// // Start observer setup
// if (typeof document !== 'undefined') {
//   if (document.readyState === 'loading') {
//     document.addEventListener('DOMContentLoaded', setupAuthObserver);
//   } else {
//     setupAuthObserver();
//   }
// }

