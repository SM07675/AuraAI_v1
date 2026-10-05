# Aura frontend architecture

## Application shell

- `frontend/src/app/App.tsx` owns authentication, onboarding, screen switching, lazy loading, and teardown of active voice services on navigation.
- `ClaySidebar.tsx`, `TopBar.tsx`, and the mobile bottom navigation form the authenticated shell.
- `AmbientBackground.tsx` provides the shared, pointer-aware atmospheric layer and respects reduced motion.
- `ThemeContext.tsx` persists light/dark/system presentation state.

## Connected experiences

- `screens.tsx` contains the streaming text chat client and emotion overview.
- `VoiceScreen.tsx` uses `liveVoiceSocket`, `audioEngine`, Web Speech transcription, the duplex state machine, streaming TTS, interruption, language, and voice selection.
- `FaceToFaceScreen.tsx` owns camera permissions and capture, face-analysis WebSocket frames, full-duplex voice, text fallback, interruption, captions, and diagnostics.
- `MemoryScreen.tsx`, `AnalyticsScreen.tsx`, `ProfileScreen.tsx`, and onboarding retain their existing API integrations.

## Services preserved

- `authService.ts`: token/session handling and authenticated fetches.
- `wsHelper.ts`: authenticated WebSocket URL construction.
- `liveVoiceSocket.ts`: authoritative live conversation events and audio chunks.
- `audioEngine.ts`: microphone preprocessing, real RMS/peak telemetry, PCM streaming, TTS analysis, echo suppression, and playback cancellation.
- `duplexManager.ts`: conversation state and barge-in decisions.
- `voiceService.ts`, `streamingTtsService.ts`, `speechRecognitionService.ts`: TTS/STT playback and recognition fallbacks.

## Visual primitives

- Shared design tokens and glass primitives live in `frontend/src/styles/globals.css`.
- `AuraOrb.tsx` maps live microphone or TTS RMS to the Voice Mode orb. Visual state follows the real duplex state rather than decorative timers.
- Human imagery remains excluded from the normal shell and Voice Mode. The existing Face-to-Face implementation remains isolated in its lazy-loaded route.

## Current 3D asset status

No third-party humanoid model was added. The repository currently contains its pre-existing local Aura mascot image, but no verified, rigged VRM/GLB humanoid with a documented compatible license. A future humanoid asset must not ship until its source, license, morph targets, and redistribution terms are recorded in `MODELS_LICENSES.md`.

## Runtime verification still required

- Physical microphone levels, echo cancellation, TTS interruption, and device selection.
- Camera permission recovery and face-analysis throughput on representative phones and laptops.
- Backend-authenticated chat, memory, emotion, and analytics responses with a populated account.
- Browser testing in current Chrome, Edge, Safari, and mobile WebKit; visual checks at 375, 768, 1024, and 1440 px.
