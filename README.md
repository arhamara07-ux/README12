# Remindly — personal reminders

A calm, monochrome reminder app: pure-black dark mode, animated generative art, a focus timer with an ambient soundscape, and soft synthesized interface sounds. It installs on your phone like a native app, works offline, and has no accounts or servers. Your data stays on your device.

## Features

- **Smart quick add.** Type it the way you'd say it: `Call mom tomorrow at 6pm #personal !!`, `Pay rent every month on the 1st #bills`, `Stretch in 45 min`, `Gym every weekday at 7am`. Chips preview what was understood, and one-tap suggestions appear while the box is empty.
- **Notifications.** System notifications with **Done** and **Snooze 10 min** buttons, optional early alerts, an in-app banner with a chime, a morning summary and an app-icon badge. For must-not-miss reminders, **Add to Google Calendar** (long-press menu or editor) hands the alarm to your phone's calendar.
- **Focus mode.** A full-screen timer (5 to 90 min) with breathing generative art and an optional ambient soundscape (warm noise, a slow pad and rare bells, all synthesized). Start it from the Today cards, a reminder's long-press menu or its editor. Pause, add 5 minutes or end early. When it finishes you can mark the reminder done. The screen stays awake, lock-screen media controls work while the soundscape plays, a live pill shows the time left when you leave the focus screen, and sessions survive closing the app. Focus time shows up in your stats.
- **Repeating reminders.** Daily, weekdays, weekly, every 2 weeks, monthly, yearly, every N days/weeks/months, or chosen weekdays. Completing one rolls it to the next occurrence.
- **Five tabs:**
  - **Today:** time-of-day header, swipeable art cards (next reminder with a live countdown, today's progress, focus, streak), then Overdue (with "Move to today"), Pinned, Today, Anytime and Completed.
  - **Upcoming:** the next 30 days with a week strip, including future repeats.
  - **Calendar:** a month grid with a day agenda.
  - **Lists:** your lists as circular line-art icons, smart lists and tags.
  - **Me:** streak, weekly stats, focus time, a 7-day chart and all settings.
- **Rich reminders.** Notes, subtasks, tags, links, priority, pinning, snooze, postpone and duplicate.
- **Gestures.** Swipe a reminder right to complete it or left to delete it, and long-press for more. Swipe between tabs, swipe right to go back, and drag sheets down to close. The Android back gesture closes whatever is on top. Everything destructive can be undone.
- **Motion.** Screens update by patching only what changed, so nothing flickers. Items glide when lists reorder, new ones rise in, and removed ones fade out in place while the list closes the gap without the scroll position jumping. Art adapts its frame rate to the device, and the app respects "reduce motion".
- **Sound.** Interface tones are synthesized live, all in one key; each tab plays its own note. Turn them off in Me.
- **Look.** Dark (pure black), light or automatic theme, monochrome or a soft accent, 12/24-hour time.
- **Your data.** Export and import a JSON backup.
- **Keyboard shortcuts.** On desktop: `N` new reminder, `/` search, `F` focus, `1`–`5` switch tabs, `Esc` close.

## Run it

It's plain HTML/CSS/JS with no build step. Serve the folder over HTTP (service workers and notifications need `http://localhost` or HTTPS):

```bash
npx serve .          # or: python3 -m http.server 8080
```

Then open the printed URL.

## Install it on your phone

1. Host it on any HTTPS static host. The easiest is **GitHub Pages**: repo **Settings → Pages → Deploy from branch**, then pick this branch and `/ (root)`.
2. Open the URL on your phone:
   - **Android (Chrome):** menu (three dots) → **Install app** / **Add to Home screen**.
   - **iPhone (Safari, iOS 16.4+):** Share → **Add to Home Screen**. Then open it *from the home-screen icon*, because iOS only allows web-app notifications for installed apps.
3. Tap **Enable** on the notifications card (or in the Me tab).

### How notifications work

The app checks for due reminders every few seconds while it's open or running in the background, then shows a system notification through the service worker. If you tap **Done** or **Snooze** on a notification while the app is closed, that action is saved and applied the next time you open the app.

Without a push server, browsers can only fire notifications reliably while the app is still running (open, recently backgrounded, or playing the focus soundscape). For alerts that must fire even when the app has been closed for days, use **Add to Google Calendar** on that reminder, or add a small push server (Web Push) later.

## Project structure

```
index.html            App shell + icon sprite
css/styles.css        Design tokens, light/dark themes, animations
js/app.js             Views, gestures, transitions, editor, wiring
js/motion.js          DOM morphing + FLIP / exit animations
js/focus.js           Focus mode: timer, soundscape, wake lock, media controls
js/art.js             Generative canvas art + line-art list glyphs
js/sfx.js             Synthesized UI sounds and the ambient soundscape
js/store.js           State, localStorage persistence, undo, stats
js/notify.js          Alert engine, notifications, badge
js/parse.js           Natural-language quick-add parser
js/dates.js           Date formatting & repeat rules
sw.js                 Versioned offline cache + notification actions
manifest.webmanifest  Install metadata
```
