> **2026-07-11 snapshot (pre-migration cleanup):** Live at focusbuddy-v3.netlify.app — status: in revisions/debugging. Memory consolidated here (moved from central memory; old Apr-22 copy → Trash/OldMemory). ⚠️ GitHub: repo `FocusBuddy` exists (public) with a PRIORITY branch-untangling task (main vs v3-rebuild vs local vs Netlify) — do NOT push blindly; see Next Steps at bottom. Local `.env` holds secrets — keep out of git.

# FocusBuddy v3 — Project Memory

## Overview
Homeschool homework app for Zaiden (10, ADHD). React + Vite + TypeScript + Firebase Auth + Gemini AI. Deployed on Netlify.

## Links
- **Live**: https://focusbuddy-v3.netlify.app
- **GitHub**: emprestriedge/FocusBuddy (branch: v3-rebuild)
- **Netlify Site ID**: 6e7b2118-0f67-4965-ab12-709e2ba3fc20
- **Local**: ~/cowork/VibeCoding/FocusBuddy (Erin renamed the folder from FocusBuddy-v3, 2026-06-12; app/branch/site names still say v3)

## Architecture
- React 19 + Vite 8 + TypeScript + Tailwind CSS
- Firebase Auth (email/password) with parent/student roles
- Firebase Firestore for cloud sync (per-user UID)
- Google Gemini API (@google/genai) — key set as Netlify env var API_KEY
- Three-tier persistence: Memory → localStorage → IndexedDB
- PWA with service worker (cache v3)

## Design Decisions
### Palette (FINAL — approved 2026-04-06)
- Background gradient: cool slate (#1e2830 → #2a3540 → #435560 → #6E7C7C → back down)
- Cards: cool coffee glass rgba(81, 55, 33, 0.55) with border rgba(122, 99, 80, 0.30)
- Text: warm cream #F0E2CE
- Secondary text: sage #C8C6A7
- Accent (sparingly): teal-green #5DD3B6
- Glass tiles: rgba(81, 55, 33, 0.42)

### Fonts
- Headings: Instrument Serif (font-serif)
- Body: Inter
- All pages use the ScheduleCalendar header pattern: uppercase tracking label + large serif title with period

### Layout
- Student sees: Today / Week / Gallery / Toolbox
- Parent sees: Planner / Gallery
- Parent defaults to ADMIN mode, student to STUDENT mode

### Toolbox Organization
- 3 main tools: Voice Note, Master Builder, Word Wizard
- 2 folders: Study Tools (Study Chat, Researcher, Visualizer), Hands-On (Photo Insight, Manual Lookup)
- Brain Break removed
- Voice Note is most-used tool, centered full-width layout

### Task System
- Weekly homework planner (Mon-Fri, no time slots)
- Per-task accountability: photo / voice / both / none
- Parent activity feed for remote check-ins
- Parent pushes tasks to student account via Firestore

## Gemini Models Used
- gemini-2.5-flash — most tools (search, chat, vocab, curriculum, transcription, etc.)
- gemini-2.0-flash-preview-image-generation — illustration generation (Visualizer)
- gemini-2.5-flash-native-audio-preview-12-2025 — Live API voice chat (Study Chat & Researcher voice modes)

## Files (19 total)
- src/App.tsx — Auth flow, task management, celebration animations
- src/main.tsx, src/index.css, src/types.ts, src/constants.tsx
- src/services/geminiService.ts — All Gemini API calls with ADHD-friendly prompts
- src/services/storageService.ts — Firebase Auth + Firestore + IndexedDB
- src/components/Login.tsx — Email/password with role picker
- src/components/Layout.tsx — Role-based navigation
- src/components/AdminPanel.tsx — Weekly planner, AI Planner, activity feed
- src/components/ScheduleCalendar.tsx — This Week view
- src/components/TaskDetail.tsx — Task completion with proof uploads
- src/components/Portfolio.tsx — Gallery with favorites, search, infinite scroll
- src/components/Toolbox.tsx — All tools + folder system
- index.html, package.json, vite.config.ts, server.ts, service-worker.js, netlify.toml

## Progress Log
### 2026-04-06 — Full v3 rebuild + deployment
- Rebuilt entire app from v2 codebase (was in FocusBuddy/ folder)
- Replaced family code login with Firebase email/password auth + roles
- Replaced time-based scheduling with weekly homework planner
- Reorganized Toolbox from 9 flat tools to 3 + 2 folders, removed Brain Break
- Added per-task accountability types (photo/voice/both/none)
- Added parent activity feed
- Tightened all Gemini prompts with STUDENT_CONTEXT and SAFETY_PREAMBLE
- Fixed component file structure (moved to src/components and src/services)
- Fixed import mismatches (default vs named exports in Toolbox/Portfolio)
- Fixed Toolbox parse error (optional chaining on assignment)
- Multiple palette iterations: started warm coffee → too reddish → cooler browns → final slate background + coffee cards
- Final palette: slate gradient background + coffee glass cards + cream text + teal-green accent
- Restyled Toolbox to match ScheduleCalendar design language (serif fonts, glass-tile cards, header pattern)
- Replaced all hardcoded old rgba(248,250,229,...) values across every component
- Pushed to GitHub: emprestriedge/FocusBuddy on v3-rebuild branch
- Deployed to Netlify: focusbuddy-v3.netlify.app
- Enabled Firebase Auth (email/password) on gen-lang-client-0838687198 project
- Tested: login working, parent→student task sync working

### 2026-04-09 — Schedule sync rebuild + voice recording UX
- **Fixed timezone bug**: Replaced all `toISOString().split('T')[0]` with `toLocalDateString()` helper (constants.tsx). This was causing Thursday tasks to show under Wednesday on devices in Central Time when saved in the evening.
- **Rebuilt sync architecture**: 
  - NEW shared Firestore path: `focusbuddy_students/{studentUid}/schedule/current` — all accounts read/write to the same doc
  - Every local write (add, complete, delete, update) auto-pushes to Firestore immediately via `autoPushToCloud()`
  - Both parent AND student accounts subscribe to the same schedule via `onSnapshot`
  - Echo suppression (`_suppressCloudUpdate` flag) prevents infinite loops when the device that wrote also receives the snapshot
  - One-time migration from old path (`focusbuddy_users/{uid}/schedule/current`) to new shared path
  - Activity feed also moved to shared path (`focusbuddy_students/{studentUid}/activity`)
- **Multi-parent support**: `linkParentStudent` now uses `arrayUnion` to add to `linkedStudents[]` and `linkedParents[]` arrays, plus keeps legacy `linkedTo` for backwards compat
- **Live sync indicator**: AdminPanel header shows a green "Live Sync" badge when cloud sync is active
- **Voice recording UX overhaul** (TaskDetail.tsx):
  - 3-2-1 countdown with visual numbers and audio tick before recording starts
  - Ascending beep tone on recording start, descending tone on stop
  - Large red recording state panel with animated waveform bars and running timer
  - Explicit "Stop Recording" button (big, red, unmissable)
  - "Tap to Record" button with helper text about the countdown
  - "Transcribing your voice..." overlay during AI transcription
  - Added `waveBar` CSS keyframe animation in index.css

### 2026-04-09 — Study Chat & Researcher fixes
- **Voice chat (Live API) fix**: Added full error handling around the Gemini Live API connection flow. Previously if the WebSocket connection failed or closed immediately, the button would flip on then off with no feedback. Now shows step-by-step status ("Getting microphone...", "Connecting to AI...", error messages), disables the button during connection, and shows helpful fallback text if voice fails.
- **Text chat follow-up fix**: Study Chat and Researcher text modes had a `sticky bottom-0` input that scrolled off-screen on longer responses because the parent had no fixed height. Restructured both to use a scrollable results area (max 50vh) with the input always rendered below it in normal flow — never hidden.
- **Study Chat conversation context**: `runStudyChat` now passes the full conversation history to Gemini so follow-up questions have context (previously each message was sent standalone).
- **Researcher text input**: Updated placeholder to say "Ask a follow-up question..." after first response.
- Applied same error handling pattern to both Study Chat and Researcher voice modes.

### 2026-04-15 — Exposed API key cleanup + branch confusion discovered
- **Google flagged the old CoJg Gemini API key as publicly exposed.** The exposure was NOT from the current local folder or v3-rebuild branch — it was from an old `migrated_prompt_history/prompt_2026-01-17T06:30:07.995Z.json` file sitting on the `main` branch of GitHub. That JSON was a chat/prompt log that had the key pasted inside.
- **Erin revoked the CoJg key in Google AI Studio** — it's dead, can't be abused.
- **Erin deleted the leaked file from GitHub's `main` branch via the web UI.**
- **Current Gemini key (ending Ny_U)** is in local `.env` (gitignored) and baked into Netlify's dist/ (normal for Vite). Not in GitHub.
- **Hardened local `.gitignore` on v3-rebuild branch** (committed locally, NOT yet pushed to GitHub — sandbox git was crashing). Added blocks for: `.env.*`, `migrated_prompt_history/`, `prompt_history/`, `prompt_*.json`, `*_prompt_history*`, `chat_history/`, `deploy-*.zip`. Firebase config key in src/services/storageService.ts is fine as-is (web Firebase keys are designed to be public).
- **BRANCH CONFUSION DISCOVERED — needs resolution next session:**
  - `main` branch = old full app, NEVER had a `.gitignore` (which is why the leak happened)
  - `v3-rebuild` branch = only `memory/` and `src/` committed, plus a proper `.gitignore`
  - Erin's local folder (on v3-rebuild) has ALL the files (package.json, index.html, dist/, etc.) — but most are UNTRACKED in git, meaning they exist on disk but aren't saved to either branch
  - Netlify gets the real current version via manual drag-and-drop, so Netlify is the source of truth
  - UNRESOLVED: is v3-rebuild meant to fully replace main? Did someone start a rebuild and never finish migrating everything? Need to compare v3-rebuild's src/ vs main's src/ and figure out what belongs on which branch before any merges or pushes happen.

### 2026-04-10 — Voice chat fix + deployment pipeline
- **Fixed Gemini Live API voice chat**: The old model `gemini-2.5-flash-preview-native-audio-dialog` was deprecated and removed on March 19, 2026. Updated to `gemini-2.5-flash-native-audio-preview-12-2025` in geminiService.ts. This was causing the instant connect/disconnect behavior (session opened then closed in a split second).
- **Fixed audio pipeline race condition** (Toolbox.tsx): The mic audio capture was being set up inside the `onOpen` callback, but `chatSessionRef.current` / `researchSessionRef.current` wasn't assigned until AFTER `connectLiveSession()` returned. Every audio chunk hit `if (!ref.current) return` and was silently dropped. Moved audio pipeline setup to AFTER the session ref assignment in both `startChatLive` and `startResearchLive`.
- **Deployment via Mac Terminal**: Netlify MCP remote builds kept failing (exit code 2 — likely TypeScript strictness differences). Switched to building locally on Erin's Mac (`npm run build`) then deploying the `dist` folder via `npx netlify-cli deploy --prod`. This works reliably.
- **Voice chat confirmed working**: Study Chat and Researcher voice modes both connect and hold conversation. Some latency/turn-taking quirks are normal for the Gemini Live API at this stage — not a bug, just how real-time AI voice works currently.
- **Text chat confirmed working**: Follow-up text input works correctly in both Study Chat and Researcher.

## Known Issues
- LiveAssistant (Sparky voice assistant) not included in v3 — decision needed
- Gemini API key is baked into build via Vite define (not ideal for production security)
- The exposed API key from the old project needs to be rotated/cleaned up at Google
- Gemini Live API voice has some turn-taking latency — model sometimes responds to previous statement rather than latest one. This is normal for the current `gemini-2.5-flash-native-audio-preview-12-2025` model. May improve with newer model versions.
- Old data in `focusbuddy_users/{uid}/schedule/current` will be auto-migrated on first login, but that old path can be cleaned up eventually
- Firestore security rules updated 2026-04-09 (Erin applied in console)
- Netlify MCP remote builds fail with exit code 2 — use local build + netlify-cli deploy instead

## Next Steps
- **🔴 PRIORITY: Untangle the branch situation.** Before any new commits or pushes, compare `main` vs `v3-rebuild` vs Erin's local folder vs Netlify. Figure out: (1) which files are on which branch, (2) which branch represents the true current app, (3) whether to merge v3-rebuild → main, abandon main, or migrate remaining files into v3-rebuild. Don't guess — per Erin's rules, work off Netlify as source of truth.
- **Push the hardened `.gitignore`** to GitHub's v3-rebuild branch once branch situation is clear. Currently only updated locally.
- Test multi-device sync (Erin Mac, Erin iPad, Zaiden computer, Erin's mom computer)
- Link Erin's mom's account to Zaiden (she needs a parent account first)
- Test voice recording countdown + beep on iOS Safari (Web Audio API quirks)
- Test Gallery/Portfolio functionality
- Decide on LiveAssistant/Sparky inclusion
- Watch for newer Gemini Live API models that may improve voice chat latency (e.g. `gemini-3.1-flash-live-preview`)
