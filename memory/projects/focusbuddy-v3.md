# FocusBuddy v3 — Project Memory

## Overview
Homeschool homework app for Zaiden (10, ADHD). React + Vite + TypeScript + Firebase Auth + Gemini AI. Deployed on Netlify.

## Links
- **Live**: https://focusbuddy-v3.netlify.app
- **GitHub**: emprestriedge/FocusBuddy (branch: v3-rebuild)
- **Netlify Site ID**: 6e7b2118-0f67-4965-ab12-709e2ba3fc20
- **Local**: ~/Desktop/VibeCoding/FocusBuddy-v3

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
- gemini-3-flash-preview — most tools (search, chat, vocab, etc.)
- gemini-3-pro-preview — curriculum generation
- gemini-2.5-flash-image — illustration generation
- gemini-2.5-flash-native-audio-preview — voice transcription

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

## Known Issues
- Parent-student account linking (linkedTo field exists but no UI for linking)
- LiveAssistant (Sparky voice assistant) not included in v3 — decision needed
- Gemini API key is baked into build via Vite define (not ideal for production security)
- The exposed API key from the old project needs to be rotated/cleaned up at Google

## Next Steps
- Test all Toolbox tools (Voice Note, Master Builder, Word Wizard, etc.)
- Test task completion flow with photo/voice accountability
- Test Gallery/Portfolio functionality
- Consider merging v3-rebuild into main once fully tested
- Sort out Erin's Google API keys (old one was accidentally public)
- Decide on LiveAssistant/Sparky inclusion
