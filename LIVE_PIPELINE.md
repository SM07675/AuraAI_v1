# Live conversation pipeline

Microphone PCM → voice activity detection → transcription and voice emotion → text emotion plus fresh camera emotion → quality-weighted fusion → conversation context and AI provider → phrase TTS → ordered browser playback.

Typed messages use the same voice conversation handler. Precomputed face and voice results are accepted without repeating inference. Camera observations expire after five seconds. Model failures leave the remaining modalities available; missing or zero-confidence signals are not reported as evidence. Explicit current first-person emotion statements take priority, while negated and quoted statements do not force an override.

Live turns avoid cancelling their own task. Interruptions stop local audio and notify the server without recursively triggering the interruption callback. Delayed output from cancelled turns is discarded. Audio decoding is serialized to preserve phrase order; speaking state ends after the browser playback queue drains, rather than when server generation ends. Microphone traffic waits for session readiness and is bounded when the connection backs up.

Aura is presented as an AI wellbeing companion. Responses favor listening, natural brevity, optional questions, user-described feelings, and professional support when needed. Facial expressions are uncertain observations and cannot diagnose mental illness.

## Validation

Run from backend: `.venv/Scripts/python.exe -m pytest tests/test_live_pipeline_regressions.py tests/communication -q`.
Run from frontend: `npm run build`.

Hardware acceptance still requires microphone/camera permission and configured speech, emotion, and AI providers. Test English and Hindi, interrupt during playback, pause before continuing a sentence, mute/unmute, disable the camera, and disconnect/reconnect. Confirm that speech remains audible in order, old replies never resume after interruption, and only available emotion sources appear. These changes improve the existing cascaded pipeline; they do not replace it with a native speech-to-speech realtime model or establish clinical effectiveness.

## Face-to-face repair verification

Removed the frontend import cycle by moving speech text utilities into a module without service dependencies. Live sessions no longer assume user 1; authenticated identity is derived from a verified access token. The screen connects independently of microphone permission and uses session readiness before routing messages. Captured browser transcripts wait for readiness. Whisper starts after a bounded browser-transcription grace period, and a transcript revision cancels obsolete inference when browser text arrives. Microphone resources are released when muted or leaving the screen.

Speech restarts for a new generation after cancellation. The server waits for queued synthesis before sending speech completion; provider waits are bounded. Typed messages appear once rather than being duplicated by the server transcript event. Connection and voice failures appear in the interface.

Verified on October 4, 2026: frontend production build; live-service startup/readiness test; 29 communication, language, and regression tests. A neutral greeting through the running live WebSocket began text output in 688 ms and delivered two audio phrases. Two subsequent neutral turns, including interruption recovery, delivered text and audio in 5.16 and 3.57 seconds total. Timing is an observation, not a guaranteed latency.

The browser successfully opened and connected face-to-face mode. Camera permission was denied in the test browser, so facial accuracy and real microphone speech were not verified. MediaPipe is absent from the current Python environment; FERPlus ONNX and Whisper loaded successfully. A synthetic mental-health provider test was rejected by automatic approval review; verification used neutral greetings instead.

Browser testing also reproduced premature cancellation from an existing microphone signal. Server interruption now requires a fresh speech onset and defers to browser echo-aware attribution when browser transcription is active.

Final browser check: muting kept the live connection open, a typed neutral greeting appeared once, and Aura returned a complete reply. Screenshot: face-to-face-verified.png. The local frontend and backend were left running for manual microphone/camera testing.

## Spoken-input handoff verification

The earlier typed checks did not establish that spoken input reached the pipeline. The spoken path had a locally scoped import that crashed the browser-final handler, depended indefinitely on browser final events, and could fail a follow-up turn with an invalid speaking-to-thinking transition. Whisper's lazy segment inference also blocked the socket event loop. These faults are repaired. Interim-only speech commits after a one-second quiet transcript window, recognition ending flushes pending words, browser errors enable server transcription, and background turn failures return a visible error instead of silently hanging. Natural pauses preserve pending audio; punctuation-only output is not sent to speech synthesis.

Verified October 4, 2026 using synthetic neutral spoken PCM streamed in real time into the running WebSocket, rather than submitting typed text: both server transcription and browser-supported mode with no final browser event produced the full transcript, a complete LLM response, three audio phrases, and turn completion. The browser-final handler independently produced a response and three audio phrases. Observed first response text arrived 3.6–5.6 seconds after the server's speech-end event; first audio arrived 5.2–6.7 seconds afterward. This confirms handoff and output, but the local cascaded pipeline still has noticeably higher latency than a native realtime speech model.

Final checks: 35 backend communication, language, and handoff tests passed; frontend production build passed; frontend startup and spoken-handoff tests passed, including interim-only, delayed-final deduplication, recognition-end, network-error, and session-readiness handling. Run the frontend checks with `node tests/live-startup.mjs` and `node tests/spoken-handoff.mjs`. The actual spoken verification script is `backend/scripts/verify_spoken_handoff.py`; it uses configured remote AI/TTS providers with neutral greetings. Real human microphone, camera accuracy, varied accents, and clinical usefulness still require separate acceptance checks.

## Speaker echo and smooth playback repair

All browser voice modes share microphone protection during active playback and a 700 ms room-echo tail. Suppressed PCM remains silence rather than being omitted, so server VAD continues to receive its clock. Confirmed transcript interruptions reopen capture; server-only overlap requires sustained strong near-end speech with verified browser AEC and low measured echo. Recognition retains the recent spoken text for 1.8 seconds after playback or interruption to reject delayed assistant transcripts. Onset alone no longer ducks or stops speech. Text is checked again before committing interim speech, and rejected results clear pending commits. Microphone and playback analysers now use matching FFT sizes, and quiet-input boost is disabled during playback.

Blob and HTML fallback playback wait for audible completion and settle on cancellation; HTML fallback also feeds the reference analyser. Streaming phrases retain cumulative spoken text for echo attribution, play sequentially, and finish only after the last audible phrase. The server now chunks at complete word and sentence/clause boundaries instead of splitting provider tokens mid-word. Voice mode enables browser transcription explicitly and switches to server transcription on recognition failure.

Validation: `node tests/echo-playback.mjs` verifies playback and delayed-result echo rejection, echo guard expiry, real stop interruptions, microphone playback/tail protection, sequential phrases, final completion, and cancellation. `node tests/spoken-handoff.mjs` verifies that assistant echo never produces a client transcript packet. All 36 backend tests in the focused communication/language suite pass, including word-boundary synthesis. Physical speaker/microphone tests remain necessary to measure real room echo and overlap accuracy; this is conservative overlap gating, not a replacement for a native acoustic echo canceller.

## Follow-up: strict speaker playback protection

The previous heuristic fix still allowed self-interruption: recognition confidence and loud microphone energy could bypass echo protection when Hindi/Hinglish transcription differed from the assistant text. This section supersedes the automatic talk-over behavior above. Speaker playback now locks both browser recognition and microphone PCM, including gaps between queued phrases and a 1.2-second echo tail. Browser recognition is aborted during assistant output; pending interim words are cleared; old recognition callbacks are rejected by instance identity; recognition restarts automatically when the lock clears. No confidence, keyword, or loudness heuristic bypasses this lock.

The browser sends playback state to the server, which blocks audio/transcript input while the actual playback queue remains active even after model generation finishes. Server VAD receives silence frames and cannot automatically stop speech from loud speaker bleed. The microphone button explicitly interrupts both live and fallback chat pipelines. The interface now explains tap-to-interrupt and no longer promises automatic full-duplex speaker talk-over. This intentionally prioritizes reliable speaker playback; it is turn-taking with explicit interruption, rather than native full-duplex echo cancellation.

Validation: frontend build and recognition/playback tests pass; 38 backend tests pass. `backend/scripts/verify_speaker_echo.py` passed against the running service using neutral greetings: injected loud PCM and an unrelated echo transcript did not interrupt the original turn (three audio phrases), late echo while browser playback remained active was blocked, and an explicit interrupt stopped the next turn. This tests protocol protection, not physical-room acoustic quality. Browser behavior reference: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start documents that recognition without an audio track uses the microphone, independently of our processed PCM stream.

## Restored spoken interruption

Automatic spoken interruption is restored, superseding the strict recognition pause above. Browser recognition stays active during assistant playback. An interrupt now requires novel recognized text, at least 180 ms of sustained near-end acoustic evidence, verified microphone AEC, low echo probability, adequate signal-to-noise, and recognition confidence. Confidence, keywords, and loudness alone cannot stop playback. Rejected speech that began during playback remains rejected if its final result arrives after playback. Shared words such as "please" no longer make a different user sentence an echo.

Confirmed interruptions send cancellation before the user's transcript, reopen microphone capture immediately, and explicitly clear the server's normal echo-tail delay. Speaker PCM remains suppressed until attribution confirms a user interruption. The button remains available. Tests exercise the actual recognition service → duplex manager → live socket chain, checking that echo produces no input, while a genuine acoustic/transcript fixture sends interrupt then client transcript without waiting for a manual tap. This uses simulated microphone evidence; physical acoustic acceptance is still needed. Browsers that cannot verify AEC may require the interrupt button rather than automatic talk-over.


## Backend integration audit — October 5, 2026

Fixed the shared WebSocket URL helper to read the signed-in access token from the same storage as authentication. Session storage takes precedence; guest demo markers are omitted. Live voice logs no longer print token-bearing URLs. Face WebSocket authentication now rejects invalid/revoked tokens and follows the configured live authentication requirement. Camera tracking state is isolated per connection. Fixed the missing timestamp imports that turned successful camera inference into an error response.

Face-to-face profile requests now use authenticated fetching, format list-valued goals/interests, and no longer request the nonexistent `/goals` endpoint. No-face and unavailable messages clear the face observation sent to the live pipeline. The mobile navigation now displays “Face-to-Face.”

Repaired the offline Redis fallback: set membership and close methods were accidentally attached to a pipeline class; rate-limit increment and expiring set operations were absent. Set/hash writes discard expired contents and pipelines clear queued commands after execution. Regression tests cover offline rate limiting, expiry, session values, and repeated pipeline execution.

Voice emotion construction runs outside the WebSocket event loop within its optional analysis timeout. Singleton construction is locked against concurrent loads. Text and face service wrappers reuse warmed live analyzers rather than loading duplicate models. Startup warms voice emotion and retains/cancels its warmup task on shutdown. Detailed dependency checks run concurrently; model health reports degraded when a component uses a fallback, and synchronous model initialization runs in the endpoint worker thread.

Installed the missing SpeechBrain and MediaPipe dependencies into the existing backend environment. Whisper, FERPlus, MediaPipe FaceLandmarker Tasks, text emotion, and SpeechBrain loaded in the running backend. The model health endpoint reported healthy for all listed components; package dependency consistency passed.

Validation: 138 backend tests passed; frontend production build passed; frontend WebSocket authentication, live startup, spoken handoff, and echo/playback checks passed. Real synthetic spoken PCM traversed VAD → Whisper → AI → speech synthesis in both server-transcription and browser-supported-without-final modes; browser-final input also completed. Final observations: first response text 2.95–3.91 seconds after speech end; first audio 3.89–5.04 seconds afterward. Earlier provider timings varied substantially, so these are not latency guarantees. Real blank-camera inference returned no-face and its socket responded to ping. Successful-face response formatting and connection isolation are covered with mocked inference; human microphone/camera acceptance remains unverified. Test process teardown emits an upstream MediaPipe deallocator warning; runtime camera inference succeeded.

Backend and frontend are running locally at `http://127.0.0.1:8000` and `http://127.0.0.1:5173`. Open the app, enter the dashboard, and choose Face-to-Face. Browser microphone/camera permissions are needed for physical-device acceptance.
