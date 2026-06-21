import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// ─── Notifications: ask permission once, then a small helper to schedule reminders ───
if ('Notification' in window && Notification.permission === 'default') {
  // Ask politely on first load — user can ignore. Only one prompt ever.
  setTimeout(() => Notification.requestPermission(), 3000);
}

// Schedule daily reminders using setTimeout chains (works while app/tab is open).
// For real background reminders on a closed app, you'd need a backend push service —
// out of scope for a personal PWA. Phone OS alarms (Google Keep / Samsung Reminders / iOS Reminders)
// are the simplest reliable alternative for that.
function scheduleDailyReminders() {
  if (Notification.permission !== 'granted') return;
  const reminders = [
    { hour: 6, minute: 0, title: '🏋️ Gym time', body: 'Your workout is waiting.' },
    { hour: 18, minute: 30, title: '📖 Study block starts now', body: 'VARC → DILR → Quant. Phone away.' },
    { hour: 21, minute: 15, title: '📝 Error log time', body: '15 minutes. What went wrong today?' },
  ];
  function scheduleNext(rem) {
    const now = new Date();
    const next = new Date();
    next.setHours(rem.hour, rem.minute, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    setTimeout(() => {
      new Notification(rem.title, { body: rem.body, icon: '/icon-192.png' });
      scheduleNext(rem); // re-schedule for tomorrow
    }, delay);
  }
  reminders.forEach(scheduleNext);
}

// Kick off scheduler once on load (works whenever app is open or running in background as PWA)
if ('Notification' in window) {
  if (Notification.permission === 'granted') {
    scheduleDailyReminders();
  } else {
    // try again after user maybe grants permission later
    const watcher = setInterval(() => {
      if (Notification.permission === 'granted') {
        scheduleDailyReminders();
        clearInterval(watcher);
      }
    }, 5000);
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
