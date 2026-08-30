# ⚙️ CogniTask - Academic Planner (PWA)

CogniTask is an executive-grade Progressive Web Application (PWA) built for tracking academic assignments, project deadlines, and completion analytics.

## ✨ Features
- **Executive Dark Theme:** Premium slate, silver metallic, and high-contrast design.
- **Task Analytics:** Real-time progress stats (Total, Pending, Completed).
- **Search & Filter:** Dynamic client-side filtering and full-text search.
- **Edit After Save:** Click any task to edit its title, notes, or dates later.
- **Offline-first Storage:** Data lives in IndexedDB (with automatic migration from the old `localStorage`-only version), so the app fully works offline.
- **Optional Cloud Sync:** Sign in with email/password to sync tasks across devices via Firebase Auth + Firestore. Fully optional — the app works with zero setup if you skip this.
- **3D Holographic Calendar:** A rotating, drag-to-spin 360° "hologram" view of everything with a due date.
- **Accessible:** Icon-only buttons have `aria-label`s, focus rings, and keyboard support (Enter/Space to open a task from the list).
- **Notifications:** Local reminders at 1 day, 1 hour, and at the due moment while the app is open. See the optional Cloud Function for real closed-app push.

## 📁 Project structure
```
index.html
css/style.css
js/db.js        → IndexedDB data layer + localStorage migration
js/sync.js      → Optional Firebase Auth + Firestore sync
js/app.js       → App logic (render, CRUD, notifications, 3D calendar)
service-worker.js
manifest.json
functions/      → Optional Cloud Function for real push notifications
```

## 🚀 How to Deploy on GitHub Pages
1. Commit all files/folders above to your GitHub repository root.
2. Go to **Settings** > **Pages**.
3. Set Source to **Deploy from a branch**, select `main` branch `/ (root)`, and click **Save**.
4. Open the generated URL on your phone's browser, tap **Share** > **Add to Home Screen**.

## ☁️ Enabling Cross-Device Cloud Sync (optional)
The app works fully offline with no setup. If you want the same task list on your phone and laptop:

1. Go to https://console.firebase.google.com → create a free project.
2. **Build → Authentication → Get started** → enable the **Email/Password** sign-in method.
3. **Build → Firestore Database → Create database** (start in production mode).
4. In Firestore's **Rules** tab, paste and publish:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/tasks/{taskId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```
5. **Project settings → General → Your apps → Web app (`</>`)** → copy the config values into `FIREBASE_CONFIG` at the top of `js/sync.js`.
6. Reload the app — a "Sign in to sync" button appears in the header.

## 🔔 About Notifications — an honest limitation
While the app (tab) is open — even in a background tab — it checks due dates every minute and fires local notifications. This is genuinely reliable for that case.

What it **cannot** do on its own: notify you if the browser is fully closed. No static website can — that requires a server that wakes up independently of your device and pushes through Firebase Cloud Messaging (FCM). `functions/index.js` contains an optional, ready-to-deploy Cloud Function that does exactly this (checks every user's tasks every 15 minutes and sends a real push). It's optional, requires the Firebase "Blaze" pay-as-you-go plan (cost for personal use is typically pennies a month), and needs you to `firebase deploy` it yourself — instructions are in the file's comments.

## 🪐 3D Holographic Calendar
Switch to the "3D Calendar" tab to see every task with a due date arranged in a glowing ring. Drag left/right (mouse or touch) to spin it a full 360°, use the ◀ ▶ buttons, or hit ⟳ for auto-rotate.
