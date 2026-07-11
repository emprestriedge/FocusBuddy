# How to Update Your Firestore Security Rules

**URGENT — Do this before your 3-day deadline or the app stops working.**

## Steps

1. Go to the Firebase Console:
   https://console.firebase.google.com/project/gen-lang-client-0838687198/firestore/rules

2. You'll see the current test-mode rules that look something like:
   ```
   allow read, write: if request.time < timestamp.date(2026, 4, 12);
   ```

3. **Select ALL the text** in the rules editor and **delete it**.

4. **Paste in the entire contents** of the `firestore.rules` file from this project folder.

5. Click **"Publish"**.

6. That's it! The rules are live immediately.

## What These Rules Do

- **User profiles** (`focusbuddy_users`): Any logged-in user can read profiles (needed for parent-student linking), but only the owner can edit their own profile.
- **Shared student data** (`focusbuddy_students`): Any logged-in user can read and write schedule and activity data. This is intentionally open for your family setup right now.
- **Everything else**: Denied by default.

## Testing After You Publish

1. Log into FocusBuddy on your Mac as yourself (parent account)
2. Add a task to Zaiden's schedule
3. Check Zaiden's account on his computer — it should appear
4. Have Zaiden check it off — it should update on your devices

If anything breaks after publishing the rules, the most likely issue is a typo during copy-paste. Re-copy the entire `firestore.rules` file and paste again.
