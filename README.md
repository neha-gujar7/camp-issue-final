# 🏫 Smart Campus Issue Reporter

A modern web application for reporting and managing campus maintenance issues, built with Firebase for Google-themed hackathon.

## 🚀 Features

- **Student Portal**: Report issues with images, categories, and location
- **Admin Dashboard**: Manage and track all reported issues
- **Real-time Updates**: Firebase Firestore for instant data sync
- **Image Upload**: Images stored as base64 in Firestore (no Storage setup needed!)
- **Status Tracking**: Pending → In Progress → Resolved workflow

## 🛠 Tech Stack

- **Frontend**: HTML, CSS, Vanilla JavaScript
- **Backend**: Firebase (Authentication, Firestore, Storage)

## 📁 Project Structure

```
smart-campus-reporter/
├── index.html        # Login & Signup
├── report.html       # Student issue submission
├── admin.html        # Admin dashboard
├── setup.html        # Firebase Setup Wizard ⭐
├── css/
│   └── style.css     # Modern styling
├── js/
│   ├── demo-mode.js  # Demo mode (localStorage) - Works without Firebase!
│   ├── firebase.js   # Firebase configuration
│   ├── auth.js       # Authentication logic
│   ├── report.js     # Issue submission
│   └── admin.js      # Admin dashboard logic
├── FIREBASE_SETUP_COMPLETE_GUIDE.md  # 🔥 Complete Firebase setup guide
├── INNOVATIVE_FEATURES.md            # 💡 Feature suggestions
├── QUICK_START.md    # Quick setup guide
├── MENTOR_GUIDE.md   # Detailed mentor guide
└── README.md
```

## 🔧 Setup Instructions

### ⚡ Quick Setup (Recommended)

**Use the interactive Setup Wizard** - The easiest way to configure Firebase:

1. Start your server: `python -m http.server 8080`
2. Open: `http://localhost:8080/setup.html`
3. Follow the step-by-step wizard
4. Done! Your app is configured

📖 **See [FIREBASE_SETUP_COMPLETE_GUIDE.md](FIREBASE_SETUP_COMPLETE_GUIDE.md) for COMPLETE step-by-step instructions**

💡 **Want to add more features? Check [INNOVATIVE_FEATURES.md](INNOVATIVE_FEATURES.md) for ideas!**

### Manual Setup

#### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Authentication → Email/Password
4. Create Firestore Database (start in test mode)
5. Enable Storage
6. Copy your Firebase config from Project Settings → General → Your apps
7. Replace the config in `js/firebase.js`

#### 2. Update Firebase Config

Edit `js/firebase.js` and replace with your Firebase credentials:

```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

#### 3. Set Admin Email

In `js/firebase.js`, update the admin email:

```javascript
const ADMIN_EMAIL = "admin@campus.edu"; // Change to your admin email
```

### 4. Run Locally

Simply open `index.html` in a modern web browser or use a local server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server
```

Then visit: `http://localhost:8000`

## 👥 User Roles

### Student
- Sign up / Login
- Report issues with details and images
- View their submitted issues and status

### Admin
- Login with admin email
- View all reported issues
- Filter by status/category
- Update issue status

## 📊 Firestore Data Model

**Collection: `issues`**
```javascript
{
  title: "Broken Light near Library",
  description: "Street light not working since 2 days",
  category: "Electricity",
  imageUrl: "firebase_storage_url",
  status: "Pending" | "In Progress" | "Resolved",
  reportedBy: "student@email.com",
  location: "Library Block",
  timestamp: Firestore Timestamp
}
```

## 🎨 UI Features

- Modern card-based layout
- Responsive design (mobile & desktop)
- Clean Google-style color palette
- Smooth animations and transitions
- Intuitive user interface

## 🔐 Security Notes

- For production, implement proper Firestore security rules
- Move admin detection to Firestore user document
- Add email verification
- Implement proper Storage security rules

## 💡 Future Enhancements

See [INNOVATIVE_FEATURES.md](INNOVATIVE_FEATURES.md) for:
- 📍 Map integration
- 🔔 Real-time notifications
- 📊 Advanced analytics
- 🤖 AI-powered features
- 📱 PWA support
- And 50+ more innovative ideas!

## 📝 License

Built for hackathon demonstration purposes.

