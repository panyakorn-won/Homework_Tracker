/**
 * OPTIONAL — Real push notifications even when the app/browser is fully closed.
 *
 * A static site (GitHub Pages) can never send a push on its own — the device
 * needs *something* running server-side that wakes up, checks due dates, and
 * tells FCM (Firebase Cloud Messaging) to deliver a push. This Cloud Function
 * is that "something." It's entirely optional; the app works fine without it
 * (notifications will just only fire while the app/tab is open).
 *
 * SETUP (requires the Firebase "Blaze" pay-as-you-go plan — scheduled
 * functions are not available on the free Spark plan, though cost for a
 * personal app is typically a few cents a month or less):
 *   1. npm install -g firebase-tools
 *   2. firebase init functions   (choose your existing project)
 *   3. Copy this file into functions/index.js, then in functions/:
 *        npm install firebase-admin firebase-functions
 *   4. firebase deploy --only functions
 *   5. In the web app you'd also need to request an FCM token per device and
 *      save it to Firestore under users/{uid}/fcmTokens — this sample assumes
 *      that token exists at users/{uid}.fcmToken.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// Runs every 15 minutes. Checks every user's tasks for anything due soon
// or overdue that hasn't been push-notified yet, and sends an FCM push.
exports.checkDueTasks = functions.pubsub.schedule('every 15 minutes').onRun(async () => {
  const now = Date.now();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  const usersSnap = await db.collection('users').get();

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const fcmToken = userData.fcmToken;
    if (!fcmToken) continue;

    const tasksSnap = await userDoc.ref.collection('tasks').where('completed', '==', false).get();

    for (const taskDoc of tasksSnap.docs) {
      const task = taskDoc.data();
      if (!task.dueDate) continue;
      const dueTime = new Date(task.dueDate).getTime();
      if (isNaN(dueTime)) continue;
      const diff = dueTime - now;

      let title = null;
      let field = null;

      if (diff <= ONE_DAY && diff > ONE_HOUR && !task.pushNotified1Day) {
        title = `⚠️ อีก 1 วันครบกำหนดส่ง: ${task.title}`;
        field = 'pushNotified1Day';
      } else if (diff <= ONE_HOUR && diff > 0 && !task.pushNotified1Hour) {
        title = `🚨 รีบทำด่วน! เหลืออีก 1 ชม.: ${task.title}`;
        field = 'pushNotified1Hour';
      } else if (diff <= 0 && diff > -ONE_HOUR && !task.pushNotified) {
        title = `⏰ ถึงกำหนดส่งแล้ว!: ${task.title}`;
        field = 'pushNotified';
      }

      if (title && field) {
        try {
          await messaging.send({
            token: fcmToken,
            notification: { title, body: task.note || 'เปิดแอปเพื่อดูรายละเอียด' },
          });
          await taskDoc.ref.update({ [field]: true });
        } catch (err) {
          console.error(`Push failed for user ${userDoc.id}, task ${taskDoc.id}:`, err);
        }
      }
    }
  }

  return null;
});
