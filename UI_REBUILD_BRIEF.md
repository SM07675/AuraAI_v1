# Aura AI — complete frontend inventory and UI rebuild brief

Prepared from the current source on October 4, 2026. This document describes the existing UI, its implemented behavior and limitations, and requirements for rebuilding it. “Connected” means frontend code calls a service; it does not establish that every backend operation or device has been tested successfully. Proposed improvements are explicitly identified.

## 1. Product and scope

Aura is an AI wellbeing companion for supportive text, voice, and camera-assisted conversations. The interface should feel calm, attentive, and personal while clearly identifying Aura as AI. The current face-to-face experience uses a mascot, chat, microphone, and the user's camera; it is not a photorealistic human video call or a proven lip-synchronized human avatar.

Primary actions: talk by text, talk by voice, start face-to-face mode, inspect or manage remembered information, set interests and goals, and review wellbeing activity. English and Hindi/Hinglish conversation are central to the current experience.

### Exact current counts

| Item | Count | Counting rule |
|---|---:|---|
| Distinct screen templates | 11 | Auth, onboarding, dashboard, chat, voice, face-to-face, memory, profile, emotion, analytics, debug |
| User-facing templates | 10 | All above except developer Debug |
| Desktop navigation entries | 9 | Dashboard, Chat, Voice Mode, Face-to-Face, Memory, Emotion, Analytics, Interests, Settings |
| Mobile/tablet navigation entries | 6 | Home, Chat, Voice, Face, Emotion, Settings |
| Conversation modes | 3 | Text Chat, Voice Mode, Face-to-Face |
| Theme choices | 2 | Dark and light |
| Onboarding interest options | 9 | Listed below |
| Onboarding communication styles | 3 | Warm/empathetic, direct/analytical, calm/reflective |
| Recognition language choices | 3 | Hindi hi-IN, Indian English en-IN, US English en-US |
| Curated voice definitions | 13 | Not all are exposed in every language-filtered selector or available with every provider |
| Top-level component/support files | 22 | Direct files in components; not 22 pages |
| UI primitive/support files | 48 | Direct files in components/ui; not 48 pages |
| Frontend service files | 9 | Direct files in services |
| Theme context files | 1 | ThemeContext |

Sign in and registration are two modes of one Auth template. Initial onboarding and Interests use one template. Home and Dashboard are aliases. Settings and Profile use one template. These aliases must not be counted as separate implemented screens. PlaceholderScreen exists but is not a selected app destination. Debug has an app switch case but no entry in the normal desktop/mobile navigation.

## 2. Overall navigation and layout

Current app flow: signed-out user → Auth → sign in/register → onboarding if required → Dashboard. Guest access skips onboarding and opens Dashboard. Returning local sessions read saved user/onboarding state. Interests opens onboarding in update mode. Saving it returns to Dashboard. Logout returns to Auth.

Desktop uses a 198 px sidebar with logo, nine menu entries, account summary and Logout. The main area contains TopBar and one selected screen. TopBar contains an “Aura is online” pill, theme toggle, and search field. The online pill is currently decorative, not a live health check; the search field currently has no search handler.

On mobile and tablet the sidebar is hidden and a floating six-item bottom navigation is shown. Page content has bottom padding to avoid it. Memory, Analytics and Interests do not have direct mobile tabs. A new design should provide a More menu or equivalent access to all destinations.

Navigation is currently React state, not URL routing. Browser history, bookmarkable screens and deep links need explicit implementation in a new frontend. Global and screen-specific error boundaries offer refresh, retry and return-to-dashboard actions.

MusicPlayer is inline in Chat, hidden on Dashboard, and otherwise rendered as a floating player by the app. The global QuickActionsFAB is imported but not rendered by App. Do not treat it as an active universal UI feature.

## 3. Page-by-page current inventory

### 1 — Authentication

Centered brand header and rounded form card. Tabs: Sign In and Register. Sign In fields: email and password. Register adds name. Actions: submit and Guest Access. Show missing-field feedback, loading state and backend credential errors. Registration/login call auth services and store returned access tokens.

Current limitation: certain service failures fall back to a local user session. This is UI access, not successful server authentication. The replacement must visibly distinguish guest/local access from an authenticated account, and must not silently convert failed login into authenticated success. Password recovery is not an implemented screen.

### 2 — Onboarding / Interests

Personalized title, selectable topic cards, communication-style choices and finish/save action. At least one interest remains selected. Nine topics: Mindfulness & Meditation; Stress & Anxiety Relief; Focus & Productivity; Speech & Conversation Practice; Emotion & Mood Analysis; Daily Reflection & Journaling; Sleep & Deep Relaxation; Confidence & Habit Building; Creative Thinking.

Three styles: Warm & Empathetic, Direct & Analytical, Calm & Reflective. Initial defaults select mindfulness, stress relief and emotion tracking. Interests update mode reuses this layout with different text. Selections are stored locally and sent to profile/interests services. The completion payload also uses selected interests as goals; this does not constitute a distinct goal-planning UI.

### 3 — Dashboard / Home

Desktop has two columns; small screens stack them. Main elements: personalized greeting, floating robot mascot, four primary action tiles (Chat, Voice, Face-to-Face, Memory), emotion trend chart, voice entry action, wellbeing/insight cards and four quick actions.

Quick action behavior matters: Journal opens Chat; Breathing opens Voice Mode; Focus opens Chat; Music opens Chat, which has an inline player. Journal and Pomodoro labels do not represent dedicated journal or timer pages. Dashboard emotion values, chart series and insight text are currently largely static examples; they must not be presented as measured user outcomes in a rebuilt product.

### 4 — Chat

Conversation panel with Aura header/avatar, left-aligned assistant bubbles, right-aligned user bubbles, timestamps, typing/streaming state, bottom text composer, microphone input and Send. Enter sends text. Messages use the chat WebSocket; partial output updates the current assistant bubble. A final reply can be spoken through the voice service. Transcript feedback comes from the shared recognition service. Music is inline.

Current limitation: disconnected Chat can generate canned local responses. Those are not LLM responses. Messages are held in component state; a durable conversation history/archive is not established by this screen. A replacement should show delivery/error state, preserve unsent text, and clearly identify unavailable AI instead of disguising a failure as a personalized answer.

### 5 — Voice Mode

Compact voice conversation panel. Header controls: language, voice/persona selector, live state and optional diagnostics. Center: robot mascot and animated waveform. Below: status text, “You said” interim/final transcript, “Aura response” streamed text and error notification. Bottom controls: listen/pause, stop speaking and reset session.

Flow: microphone → voice session → transcription → response text → ordered speech output. Recognition languages are Hindi, Indian English and US English. Automatic spoken interruption is restored: it requires novel recognized speech plus sustained near-end acoustic evidence, verified AEC and low echo. Button interruption remains available. Device behavior still requires hardware testing; this is not a guaranteed native realtime speech-to-speech system.

Do not show a decorative waveform as proof of microphone capture. Distinguish disconnected, connecting, listening, user speaking, processing, assistant speaking, interruption, muted and voice-unavailable states. Speech failure should retain the text answer.

### 6 — Face-to-Face

Current desktop layout uses 12 grid columns: camera area 4, main conversation 5, context/summary 3. Small screens stack these sections. Header offers language, voice, breathing and developer diagnostics controls.

Camera area: mirrored self-preview, camera toggle/start action, offline placeholder, permission-error banner, face observation/quality indicators, optional face diagnostics. Camera frames are sent for facial analysis. Camera permission failure should not disable text or microphone conversation.

Conversation area: Aura mascot/header, chat bubbles, live interim/final transcript, streamed assistant response, listening/speaking status strip, typed composer, microphone button and Send. Genuine interruptions cancel active speech/generation before forwarding the user's words. Echo filtering remains active; late output from canceled generations must not return.

Context area: emotion observations/fusion when available, current goal, known interest/project, session summary and optional latency metadata. Freshness and available modalities matter: do not invent face observations when the camera is off, voice emotion when unavailable, or a clinical diagnosis from any signal.

Breathing is an inline panel with a repeating 4-second inhale, 3-second hold and 5-second exhale cycle. It is not the dashboard's advertised 4-7-8 label. A replacement should use one consistent exercise definition and clearly show start/stop and current phase.

Face-to-face must remain usable without camera access. The current mascot is a robot asset/animation, not a human avatar. A new human-like avatar would be additional work requiring assets and speaking/listening animation synchronization.

### 7 — Memory

Two views: memories and relationship graph. Header has view switch and Add Memory. Memory view has search and category filtering; cards show type, key/title, value, importance and optional confidence/version/date metadata. Controls: edit and delete. Add/edit modal contains type, key, value, importance, save and cancel. Graph view displays entities and relationships.

Calls memory list, graph, create, update and delete services. Current limitations: service errors can populate example memories/graph; deletion can remove a card locally even when the request fails; save closes the modal without verifying success. Replacement must show real empty/error states, confirm destructive actions and only claim successful persistence after acknowledgement. Advanced knowledge-graph detail should be optional in a wellbeing UI.

### 8 — Profile / Settings

Editable identity and preference cards: name, email display, communication style, comma-separated active goals and interests/hobbies. Save action and transient saved feedback. Account/session information and Logout. Requests fetch/update profile and update goals/interests; local storage also caches preferences.

Current limitations: save feedback can appear even if remote requests fail; default example profile values can appear before user data loads. Onboarding style identifiers differ from Profile style identifiers and need normalization in a rebuild. This is not a full settings system: device selection, notification preferences, password change, account deletion and export are not implemented here.

### 9 — Emotion Insight

Two main cards: current state with emoji, label, confidence and four emotion bars; mood-over-day area chart. Current numbers include Calm 85%, Joy 72%, Focus 64%, Stress 18%. This screen uses hard-coded values and does not fetch live emotion data despite its “live” wording.

Replacement needs real self-reports/observations, time range, provenance and unavailable-data state. Confidence is model confidence, not certainty about a person's feelings. Allow users to correct an observation. Do not infer illness or assign a diagnosis through this UI.

### 10 — Analytics

Header, period selectors, refresh, loading/error feedback, KPI cards and charts. Periods: 7 days, 30 days and “All Time”; current “All Time” sends 90 days. KPIs: average mood, mood shift, total sessions, total duration, streak, dominant emotion and active goals. Charts: wellbeing over time, focus rhythm, emotion distribution and interaction-mode usage. Insight cards complete the page.

Connected to analytics overview. On failure it shows a warning and example baseline data. Replacement should not treat those examples as the user's history or measured improvements. Use a proper all-time query or label “90 days.” Explain score meaning and use honest empty states.

### 11 — Debug — internal only

Developer diagnostics with refresh and four tabs: Turn Latency Traces, Knowledge Graph Topology, 7-Layer Memory State, Gateway & Environment. Connected to debug services. Includes system/model state and timing details. A graph request currently uses a fixed user ID.

Keep outside normal user navigation and restrict access in a replacement. Microphone, echo, VAD, face and model debugging overlays should also remain behind an advanced/support toggle rather than dominating conversation pages.

## 4. Shared controls, assets and visual design

Style: rounded claymorphism/bento cards, raised surfaces, inset controls, soft bevels and highlights, pill-shaped status/buttons, pastel accents and a friendly robot mascot. Dark mode uses deep purple surfaces; light mode uses warm cream surfaces. The theme persists locally and otherwise follows system preference, with a dark fallback.

| Token/use | Current reference |
|---|---|
| Light canvas | #F4EBE6; app gradient #FBF4F0 → #F5ECE6 → #EDE1DB |
| Light card | #FAF4F0 → #F5ECE5 |
| Dark app canvas | #12101B → #171424 → #0E0C17 |
| Light primary text | #2E2544 |
| Dark primary text | #F3EFFC / white |
| Muted text | #777287 light; #9E98B4 dark |
| Lavender | #C7B5F3 |
| Purple | #A98BE8; darker #6E50B7 |
| Mint | #BFE6D8; darker #1F7E67 |
| Peach | #F7C8BA; darker #C25B48 |
| Yellow | #F3D991 |
| Blue | #BBDCF5 |
| Coral | #F1A6A6 |
| Main card radius | 32 px; several panels use 22–24 px |
| Secondary card radius | 20 px |
| Sidebar radius | 36 px |
| Pills | 999 px |
| Font family | Plus Jakarta Sans, Inter, system fallback |

Typography currently varies: main titles roughly 23–32 px; face/voice headers 19–21 px; many labels/body elements are only 9–13 px. For the new UI, use readable 14–16 px body text, clear hierarchy and comfortable controls rather than reproducing tiny diagnostic labels. This is a proposed readability improvement, not the current scale.

Animations: 250 ms page fade/vertical transitions, spring navigation/press effects, slow mascot floating, waveform bars, animated chart bars, typing state and breathing pulses. Respect reduced-motion preference in the rebuild. Avoid continuous distracting movement during sensitive conversation.

Assets: aura-mascot-3d.png is present in src/assets and public. Custom clay icons and robot/blob/mascot components provide the existing illustration language. Lucide supplies general icons. Use consistent icon size/stroke and accessible text labels.

The reusable primitive library includes buttons, cards, inputs, textarea, select, checkbox, switch, radio group, forms, badges, avatar, dialogs, sheets, drawers, popovers, tooltips, tabs, tables, calendar, charts, accordion, navigation, progress, sliders, skeletons, scroll areas and notifications. Their presence in the library does not imply a separate product feature.

Music controls: collapsed/expanded player, play/pause, previous/next, volume and dismiss/collapse. Three default ambient tracks are defined; the server can replace the list. It uses remote audio and a generated-tone fallback. Progress is simulated rather than tied to media playback time. Rebuild progress from actual media events and coordinate music with voice capture/output so background music does not become input or mask speech.

Thirteen voice definitions: Alice, Sarah, Ava, Emma, Swara, Madhur, Neerja Expressive, Neerja Classic, Prabhat, Aria, Jenny, Sonia and Aarohi. Some require provider configuration. British English/Marathi voice definitions do not mean the recognition-language selector supports those languages. Live-session voice selection must actually reach the server TTS configuration; frontend persona selection alone must not be advertised as applied to all playback paths.

## 5. Data and behavior contract for a replacement frontend

Preserve these integration families without embedding technical details in normal screens:

| UI area | Current integration |
|---|---|
| Authentication | POST /api/v1/auth/login and /api/v1/auth/register |
| Profile | GET/PATCH /api/v1/users/me |
| Personalization | PUT /api/v1/users/me/interests and /api/v1/users/me/goals |
| Conversation | /api/v1/ws/chat |
| Live voice | /api/v1/ws/voice |
| Speech synthesis | POST /api/v1/tts/synthesize |
| Face analysis | Emotion/vision WebSocket client in FaceToFaceScreen; preserve its current frame/result schema |
| Memory | /api/v1/memory and /api/v1/memory/graph; item update/delete by ID |
| Analytics | GET /api/v1/analytics/overview?days=... |
| Goals/context | GET /api/v1/goals |
| Ambient audio | GET /api/v1/music/ambient |
| Internal diagnostics | /api/v1/debug/status, /latency and /graph |

Current frontend uses React/TypeScript, Vite, Tailwind, Motion, Recharts and Lucide. It runs locally on port 3000 and proxies /api to port 8000; local live sockets connect to backend port 8000 directly. The current screen switch lives in App.tsx.

REST authentication and consistent authorization headers must be audited in the rebuild: many existing fetch calls do not explicitly attach an access token. WebSocket helper attaches a stored token. UI state such as a saved name is not sufficient evidence of a valid authenticated account. Sign-out must clear credentials and terminate active capture/playback, not just hide the account screen.

Persisted frontend items include theme, user/onboarding state, access token, language/voice preferences and interests/goals/style caches. Preserve server-backed data as the source of truth and distinguish cached/offline state. Draft text should survive temporary connection failure.

Live event requirements: session readiness before input; interim/final transcripts; streamed response; ordered audio; current turn/generation IDs; interrupt/cancel; playback-completion state; modality/emotion results; errors and reconnect. A new UI must not simplify these to one generic loading spinner. Server generation complete and audible playback complete are different events.

## 6. Required states and interaction rules

Every data page: initial loading, loaded, truly empty, error with retry, offline/cached, submitting, success and failed submission. Example/demo data must be labeled and separate from personal data.

Conversation: connecting, ready, microphone permission pending/denied, listening, user speaking, partial transcript, final transcript, processing, first output, assistant speaking, user interruption, canceled generation, text-only response when TTS fails, reconnecting and ended. Show a simple plain-language state, not raw model internals. Ignore old response/audio events after interruption and avoid duplicate message bubbles.

Face input: camera off, permission pending, denied, warming up, face found, no face, multiple/poor-quality face, stale observation and temporarily unavailable analysis. Permission controls must explain camera/microphone use before requesting it in the redesigned flow. Let users turn off each modality independently.

Automatic spoken interruption: keep recognition active during assistant output; use actual near-end evidence and low echo plus recognized text; do not cancel solely on transcript confidence or keyword appearance. Retain delayed-echo protection. Confirmed user speech must immediately get to the pipeline after cancellation. Provide an explicit Stop/Interrupt button as fallback. Do not promise the same accuracy for every speaker, room, browser or microphone.

Keyboard/accessibility: labeled controls; visible focus; semantic buttons instead of clickable decorative divs; keyboard send/stop; dialog focus management; live announcements for important state changes; captions/transcript available even with audio; sufficient contrast; reduced motion. Proposed touch targets should be at least 44 px. Do not convey state by color alone.

Responsive rebuild targets: compact phone, larger phone, tablet, desktop and wide desktop. Current design uses common sm/md/lg breakpoints; test at 375, 768, 1024 and 1440 px as proposed acceptance widths. Keep the composer visible above navigation and the on-screen keyboard, avoid nested-scroll traps, and collapse secondary emotion/context cards below the primary conversation.

## 7. Missing features versus existing labels

Not currently distinct implemented pages: journal, meditation library, Pomodoro/focus timer, music library, conversation history/archive, report export, password recovery, privacy/data deletion, notifications and support/help. Do not add these to the current page count.

Highest-priority rebuild corrections: real service-connected online status; functional search or removal; removal/labelling of fabricated personal metrics; honest authentication and persistence errors; consistent personalization identifiers; mobile access to all pages; genuine all-time analytics; applied voice selection in the live pipeline; accessible text sizes; less technical clutter in the live conversation; visible permission and device recovery.

Optional expansion plan: retain the 10 current user-facing templates; add dedicated Journal, Exercises, History and Privacy & Data templates only if those services/features are implemented. That would be 14 user-facing templates plus one internal Debug template, or 15 total. Do not create empty destinations simply to reach this count.

## 8. Ready-to-use prompt for a new UI designer/builder

Design and implement a complete responsive frontend for Aura AI, an AI wellbeing companion. Use this document as the inventory and behavior contract. Preserve the 10 user-facing templates and keep developer diagnostics separate. Provide sign-in/register and guest states, onboarding/interests, dashboard, chat, voice, face-to-face, memory, profile/settings, emotion and analytics. Treat Settings/Profile and Interests/Onboarding as shared templates.

Use a calm dark-purple and warm-cream visual system with lavender, mint and peach accents, rounded cards, a consistent Aura mascot and readable typography. Desktop needs persistent navigation and a top utility bar; mobile needs compact navigation plus access to every page. Prioritize the conversation, keep advanced diagnostics hidden, and avoid making the interface look like a medical diagnosis dashboard.

Implement real interactions and every loading, empty, permission, error, reconnect and completion state. Preserve the existing service and live-event contracts. Never replace unavailable personal data with fabricated metrics, canned AI replies or fake success states. Voice and face-to-face must show transcript and text response, play audio in order, support genuine spoken interruption with echo protection, cancel obsolete output and recover input immediately. Allow camera-off and text-only use. Show accurate connection and microphone state. Voice selection must be applied to the actual output provider.

Produce reusable components and design tokens, test responsive and accessible behavior, and deliver a page/feature checklist stating what is implemented and what depends on a backend or device. Do not invent Journal, Exercises, History or Privacy pages as working features unless their functionality is also built. Preserve the app's identity as AI and avoid claims of clinical effectiveness or perfect emotion recognition.

## 9. Source map

- App shell, screen selection and account/onboarding flow: frontend/src/app/App.tsx.
- Navigation: components/ClaySidebar.tsx; utilities: components/TopBar.tsx.
- Dashboard, Chat, Emotion and unused placeholder: components/screens.tsx.
- Individual screens: AuthScreen.tsx, OnboardingInterestsScreen.tsx, VoiceScreen.tsx, FaceToFaceScreen.tsx, MemoryScreen.tsx, ProfileScreen.tsx, AnalyticsScreen.tsx, DebugScreen.tsx.
- Shared presentation: clay-icons.tsx, aura-robot.tsx, glass-card.tsx, music-player.tsx; primitives in components/ui.
- Live behavior: services/audioEngine.ts, speechRecognitionService.ts, duplexManager.ts, liveVoiceSocket.ts, voiceService.ts, streamingTtsService.ts, clientVad.ts, speechText.ts and wsHelper.ts.
- Theme: context/ThemeContext.tsx; styles: frontend/src/styles/globals.css, fonts.css, theme.css and tailwind.css.
- Prior pipeline verification: LIVE_PIPELINE.md. UI inventory above is source-based; it is not a claim that all screens underwent end-to-end testing during this documentation task.
