# CAT 2026 Personal Tracker

Personal app to track CAT 2026 prep. Daily checklist, streak counter, phase progression, gym routines, nutrition targets.

Available as both:
- **A real Android APK** (installs once, works offline, no ongoing hosting) — see below
- **A web app** (deploy to Railway, add to phone home screen) — see further down

---

## Get the Android APK (no Android Studio needed)

The actual APK is compiled automatically by **GitHub Actions** in the cloud — you don't need Android Studio, the Android SDK, or any local build tools.

### Step 1 — Push this project to GitHub

```bash
git init
git add .
git commit -m "Initial CAT tracker with Android build"
git remote add origin https://github.com/YOUR_USERNAME/cat-tracker.git
git push -u origin main
```

### Step 2 — Let GitHub Actions build it

The moment you push, GitHub automatically starts building your APK (defined in `.github/workflows/build-apk.yml`). This takes about 3-5 minutes.

To watch it happen: go to your repo on GitHub → **Actions** tab → click the running workflow.

### Step 3 — Download the APK

Once the workflow finishes (green checkmark):
1. Click on the completed workflow run.
2. Scroll down to **Artifacts**.
3. Click **cat-tracker-apk** to download a zip containing `app-debug.apk`.

### Step 4 — Install on your phone

1. Transfer the APK to your phone (email it to yourself, use Google Drive, USB cable, whatever's easiest).
2. Tap the APK file on your phone.
3. Android will warn about "unknown sources" — go to **Settings → allow this app to install unknown apps** (Android will prompt you directly the first time, just follow it).
4. Install. You now have a real app icon — **CAT 2026 Tracker** — on your home screen.

### What you get

- Works fully offline (no internet needed to open/use it — your data lives on your phone).
- No hosting, no servers, no recurring anything.
- To update it later: change the code, push to GitHub, download the new APK from the next Actions run, reinstall (Android will update it in place since the package ID stays the same).

### Re-running the build manually

If you want to trigger a fresh build without pushing new code: go to **Actions** tab → **Build Android APK** workflow → **Run workflow** button.

---

## Notifications — How They Actually Work

The app schedules 3 daily reminders:
- **6:00 AM** — Gym
- **6:30 PM** — Study block starts
- **9:15 PM** — Error log time

### In the Android APK:

The current build still uses the same JS `setTimeout`-based scheduling as the web version (see `src/main.jsx`). This means:
- **While the app is open** → notifications fire reliably.
- **App closed/backgrounded** → Android may suspend background JS execution to save battery (this happens to all apps without special permissions, not just this one), so reminders can be missed.

### What works best in practice for a personal tracker:

1. Use the in-app notifications as a soft nudge when you're already using your phone.
2. **For guaranteed reminders, use your phone's native Clock/Reminders app** to set the same 3 daily alarms. Takes 30 seconds, 100% reliable, works even with the app fully closed. Treat the in-app notifications as a bonus, not the primary mechanism.

### If you want truly reliable notifications even when the app is closed:

This requires either:
- Adding the `@capacitor/local-notifications` plugin (schedules real OS-level alarms instead of JS timers — survives app closure). This is a real upgrade path if the simple version isn't enough; it's a moderate amount of additional Capacitor plugin setup.
- Or a backend push service (Firebase Cloud Messaging) for true server-triggered push — more setup, only worth it if you want notifications to survive phone restarts too.

Both are reasonable next steps later, not needed to get started.

## Updating the App

Edit any file, push to GitHub, Railway auto-redeploys within 1-2 minutes. Your phone PWA auto-updates on next open.

## Backup Your Data

Your checkboxes/streak/progress live in your phone's browser localStorage. To back up:

1. Open your app in desktop Chrome.
2. F12 → Application tab → Local Storage → copy the `cat2026-tracker-v2` value.
3. Save it somewhere safe (e.g., a Google Doc).

If you ever lose data, paste it back into the same key.
