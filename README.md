# Remindly — personal reminders

A calm, monochrome reminder app with a pure-black dark mode, animated generative art, and soft synthesized interface sounds.

A fast, offline-first reminder app you can install on your phone or desktop. No accounts and no servers: your data stays on your device.

## Features

- **Smart quick add.** Type it the way you'd say it: `Call mom tomorrow at 6pm #personal !!`, `Pay rent every month on the 1st #bills`, `Stretch in 45 min`, `Gym every weekday at 7am`. As you type, chips preview the date, repeat, priority, list and tags it picked up.
- **Notifications.** System notifications with **✓ Done** and **⏰ Snooze 10 min** buttons, plus optional early alerts (5 min to 1 day before). There's an in-app banner with a chime while the app is open, a morning summary, and an app-icon badge with today's count.
- **Repeating reminders.** Daily, weekdays, weekly, every 2 weeks, monthly, yearly, every N days/weeks/months, or chosen weekdays. When you complete one, it moves on to the next occurrence.
- **Five tabs:**
  - **Today** has a progress ring and Overdue, Pinned, Today, Anytime and Completed sections.
  - **Upcoming** shows the next 30 days with a week strip, including future repeats.
  - **Calendar** has a month grid with colored dots and a day agenda.
  - **Lists** has smart lists (Today, Scheduled, All, Priority, Pinned, Completed), custom lists with emoji and color, and tags.
  - **Me** has your streak, weekly stats, a 7-day activity chart and all settings.
- **Rich reminders.** Notes, subtasks with a progress bar, tags, links, priority, pin to top, snooze, postpone and duplicate.
- **Gestures.** Swipe a reminder right to complete it or left to delete it. Long-press for more actions. Swipe between tabs, swipe right to go back, drag sheets down to close and swipe the calendar to change months. Every destructive action can be undone.
- **Smooth motion.** Transitions follow your finger. Lists reorder smoothly, items enter in a stagger, and buttons and toggles have a spring feel. The app respects "reduce motion".
- **Look and feel.** Light, dark or automatic theme, 9 accent colors, 12/24-hour time.
- **Your data.** Export and import a JSON backup. Works fully offline.
- **Keyboard shortcuts.** On desktop: `N` new reminder, `/` search, `1`–`5` switch tabs, `Esc` close.

## Run it

It's plain HTML/CSS/JS with no build step. Serve the folder over HTTP (service workers and notifications need `http://localhost` or HTTPS):

```bash
npx serve .          # or: python3 -m http.server 8080
```

Then open the printed URL.

## Install it on your phone

1. Host it on any HTTPS static host. The easiest is **GitHub Pages**: repo **Settings → Pages → Deploy from branch**, then pick this branch and `/ (root)`.
2. Open the URL on your phone:
   - **Android (Chrome):** menu ⋮ → **Install app** / **Add to Home screen**.
   - **iPhone (Safari, iOS 16.4+):** Share → **Add to Home Screen**. Then open it *from the home-screen icon*, because iOS only allows web-app notifications for installed apps.
3. Tap **Enable** on the notifications card (or in the Me tab).

### How notifications work

The app checks for due reminders every few seconds while it's open or running in the background, then shows a system notification through the service worker. If you tap **Done** or **Snooze** on a notification while the app is closed, that action is saved and applied the next time you open the app.

Without a push server, browsers can only fire notifications reliably while the app is still running (open or recently backgrounded). Browsers that support Notification Triggers also schedule alerts with the OS ahead of time. If you need alerts guaranteed even when the app has been fully closed for days, the next step would be adding a small push server (Web Push).

## Project structure

```
index.html            App shell + icon sprite
css/styles.css        Design tokens, light/dark themes, animations
js/app.js             Views, gestures, transitions, editor, wiring
js/store.js           State, localStorage persistence, undo, stats
js/notify.js          Alert engine, notifications, badge, chime
js/parse.js           Natural-language quick-add parser
js/dates.js           Date formatting & repeat rules
sw.js                 Offline cache + notification actions
manifest.webmanifest  Install metadata
```
