/**
 * sync.js — Optional cross-device Cloud Sync (Firebase Auth + Firestore)
 *
 * This is 100% optional. If you never touch FIREBASE_CONFIG below, the app
 * keeps working exactly as before: fully offline, data stored on-device only.
 *
 * TO ENABLE CLOUD SYNC (free tier is enough for personal use):
 *   1. Go to https://console.firebase.google.com → Add project (free "Spark" plan).
 *   2. In your project: Build > Authentication > Get Started > enable
 *      "Email/Password" sign-in method.
 *   3. In your project: Build > Firestore Database > Create database
 *      (start in "production mode").
 *   4. Firestore > Rules tab, paste this and Publish:
 *
 *        rules_version = '2';
 *        service cloud.firestore {
 *          match /databases/{database}/documents {
 *            match /users/{userId}/tasks/{taskId} {
 *              allow read, write: if request.auth != null && request.auth.uid == userId;
 *            }
 *          }
 *        }
 *
 *   5. Project settings (gear icon) > General > "Your apps" > Web app (</>) >
 *      copy the firebaseConfig object's values into FIREBASE_CONFIG below.
 *   6. Reload the app — a "Sign in to sync" button will appear in the header.
 */

const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

const SyncModule = (() => {
  let auth = null;
  let db = null;
  let currentUser = null;
  let enabled = false;
  let unsubscribeSnapshot = null;
  let onRemoteTasksChanged = null;

  function isConfigured() {
    return FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey !== 'YOUR_API_KEY';
  }

  function loadFirebaseSDK() {
    return new Promise((resolve, reject) => {
      if (window.firebase && window.firebase.apps) return resolve();
      const urls = [
        'https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js',
        'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js',
      ];
      let loaded = 0;
      urls.forEach((src) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => { loaded++; if (loaded === urls.length) resolve(); };
        s.onerror = () => reject(new Error('Failed to load Firebase SDK (are you offline?)'));
        document.head.appendChild(s);
      });
    });
  }

  async function init(callback) {
    onRemoteTasksChanged = callback;
    if (!isConfigured()) {
      console.log('[Sync] Not configured — running fully offline on this device. See js/sync.js for setup steps.');
      return false;
    }
    try {
      await loadFirebaseSDK();
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      enabled = true;
      auth.onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
          listenToCloudTasks(user.uid);
          document.dispatchEvent(new CustomEvent('sync:login', { detail: { email: user.email } }));
        } else {
          if (unsubscribeSnapshot) unsubscribeSnapshot();
          document.dispatchEvent(new CustomEvent('sync:logout'));
        }
      });
      return true;
    } catch (err) {
      console.error('[Sync] Initialization failed:', err);
      enabled = false;
      return false;
    }
  }

  function listenToCloudTasks(uid) {
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    unsubscribeSnapshot = db
      .collection('users').doc(uid).collection('tasks')
      .onSnapshot(
        (snapshot) => {
          const tasks = snapshot.docs.map((d) => d.data());
          if (onRemoteTasksChanged) onRemoteTasksChanged(tasks);
        },
        (err) => console.error('[Sync] Realtime listener error:', err)
      );
  }

  async function pushTask(task) {
    if (!enabled || !currentUser) return;
    try {
      await db.collection('users').doc(currentUser.uid)
        .collection('tasks').doc(String(task.id)).set(task);
    } catch (err) {
      console.error('[Sync] Failed to push task to cloud:', err);
    }
  }

  async function removeRemoteTask(id) {
    if (!enabled || !currentUser) return;
    try {
      await db.collection('users').doc(currentUser.uid)
        .collection('tasks').doc(String(id)).delete();
    } catch (err) {
      console.error('[Sync] Failed to delete task from cloud:', err);
    }
  }

  async function register(email, password) {
    if (!enabled) throw new Error('Cloud sync is not configured yet.');
    return auth.createUserWithEmailAndPassword(email, password);
  }

  async function login(email, password) {
    if (!enabled) throw new Error('Cloud sync is not configured yet.');
    return auth.signInWithEmailAndPassword(email, password);
  }

  function logout() {
    if (enabled && auth) auth.signOut();
  }

  return {
    init,
    pushTask,
    removeRemoteTask,
    register,
    login,
    logout,
    isConfigured,
    isEnabled: () => enabled,
    isLoggedIn: () => !!currentUser,
    getUser: () => currentUser,
  };
})();

window.SyncModule = SyncModule;
