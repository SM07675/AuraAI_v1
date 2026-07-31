# Requirements Document: Live Mode Full-Duplex

## Introduction

This document specifies the requirements for AURA AI 2.0 Live Mode - a full-duplex, face-to-face conversation system that provides continuous, always-listening, real-time interaction with mental health support capabilities. Live Mode extends the existing Chat Mode (turn-based, text/voice/camera) with a continuous audio pipeline, presence visual, and streaming emotion/crisis detection.

Live Mode provides a seamless conversational experience similar to Gemini Live or ChatGPT Advanced Voice Mode, while maintaining AURA's safety constraints and non-clinical persona.

## Glossary

- **Live_Mode**: The full-duplex conversation mode where the System listens continuously and supports real-time interruption
- **Chat_Mode**: The existing turn-based conversation mode with text/voice/camera input
- **System**: AURA AI backend including all audio processing, AI generation, and state management components
- **VAD_Engine**: Voice Activity Detection engine that identifies speech vs silence in audio streams
- **Presence_Visual**: The abstract, clearly-synthetic animated avatar (orb/hologram-style) displayed during Live Mode
- **Barge_In**: User interruption of AI speech mid-sentence
- **STT_Engine**: Speech-to-Text engine that transcribes audio to text
- **TTS_Engine**: Text-to-Speech engine that synthesizes speech from text
- **Partial_Transcript**: Intermediate STT output before utterance completion
- **Crisis_Detector**: Safety component that scans for crisis signals in user input
- **Emotion_Fusion_Engine**: Component that combines text, voice, and face emotion readings into unified state
- **Session**: A single conversation session maintaining memory and phase state
- **Mode_Switcher**: UI component that toggles between Chat Mode and Live Mode
- **Viseme**: Mouth shape or animation keyframe synchronized to word boundaries
- **Word_Boundary**: TTS event marking the start/duration of each spoken word
- **Rolling_Window**: Fixed-size buffer of recent audio/text for continuous analysis
- **Turn_Directive**: AI instruction generation based on session phase and emotion state
- **Avatar_State**: The current animation state of the Presence Visual (idle, listening, user_speaking, thinking, responding, interrupted, error)
- **Sentence_Chunk**: Complete sentence from LLM stream that can be sent to TTS independently
- **Latency_Budget**: Maximum time allowed for each pipeline stage to achieve target time-to-first-audio


## Requirements

### Requirement 1: Full-Duplex Audio Pipeline

**User Story:** As a user, I want to speak naturally without waiting for the AI to finish, so that I can interrupt and redirect the conversation at any time.

#### Acceptance Criteria

1. WHEN the user connects to Live Mode, THE System SHALL open a continuous audio stream with the microphone
2. WHILE the audio stream is open, THE VAD_Engine SHALL process incoming audio chunks in real-time with end-of-utterance detection latency under 100ms
3. WHEN the VAD_Engine detects speech start, THE System SHALL transition the Presence_Visual to user_speaking state within 50ms
4. WHEN the VAD_Engine detects speech end (silence after speech), THE System SHALL commit the audio buffer for STT processing within 100ms
5. WHEN the user speaks while the System is in responding state, THE System SHALL immediately cancel the current TTS playback and LLM generation (barge-in)
6. WHEN a barge-in occurs, THE System SHALL clear the output audio buffer and transition to interrupted state within 50ms
7. WHEN a barge-in occurs, THE System SHALL begin processing the new user utterance immediately
8. THE STT_Engine SHALL stream Partial_Transcript outputs during speech recognition
9. THE STT_Engine SHALL provide a final transcript with confidence score when utterance processing completes
10. FOR ALL audio pipeline stages, THE System SHALL process audio independently without blocking other components


### Requirement 2: Presence Visual with State-Driven Animation

**User Story:** As a user, I want to see a clearly-synthetic animated presence that reflects what the AI is doing, so that I know when it's listening, thinking, or speaking.

#### Acceptance Criteria

1. THE Presence_Visual SHALL render as an abstract, clearly-synthetic animated form (orb or hologram-style)
2. THE Presence_Visual SHALL NOT render photorealistic human faces or bodies
3. THE System SHALL maintain Avatar_State with values: idle, listening, user_speaking, thinking, responding, interrupted, error
4. WHEN the System transitions to listening state, THE Presence_Visual SHALL animate to the listening appearance within 100ms
5. WHEN the System transitions to user_speaking state, THE Presence_Visual SHALL animate to the user_speaking appearance within 100ms
6. WHEN the System transitions to thinking state, THE Presence_Visual SHALL animate to the thinking appearance within 100ms
7. WHEN the System transitions to responding state, THE Presence_Visual SHALL animate to the responding appearance within 100ms
8. WHEN the System transitions to interrupted state, THE Presence_Visual SHALL animate to the interrupted appearance within 100ms
9. WHEN the System transitions to error state, THE Presence_Visual SHALL animate to the error appearance within 100ms
10. WHILE the System is in responding state, THE Presence_Visual SHALL animate mouth/pulse movements synchronized to Word_Boundary events from TTS
11. FOR ALL Avatar_State transitions, THE System SHALL emit state change events to the WebSocket client
12. THE Presence_Visual SHALL support smooth animation transitions between states


### Requirement 3: Mode Switcher with State Preservation

**User Story:** As a user, I want to switch between Chat Mode and Live Mode seamlessly, so that my conversation context and progress are preserved regardless of which mode I'm using.

#### Acceptance Criteria

1. THE Mode_Switcher SHALL display toggle controls for Chat_Mode and Live_Mode
2. WHEN the user clicks the Live Mode toggle, THE System SHALL transition from Chat_Mode to Live_Mode within 500ms
3. WHEN the user clicks the Chat Mode toggle, THE System SHALL transition from Live_Mode to Chat_Mode within 500ms
4. WHEN switching from Chat_Mode to Live_Mode, THE System SHALL preserve the current Session conversation history
5. WHEN switching from Chat_Mode to Live_Mode, THE System SHALL preserve the current Session phase state
6. WHEN switching from Chat_Mode to Live_Mode, THE System SHALL preserve the most recent Emotion_Fusion_Engine state
7. WHEN switching from Live_Mode to Chat_Mode, THE System SHALL preserve the current Session conversation history
8. WHEN switching from Live_Mode to Chat_Mode, THE System SHALL preserve the current Session phase state
9. WHEN switching from Live_Mode to Chat_Mode, THE System SHALL preserve the most recent Emotion_Fusion_Engine state
10. WHEN switching modes, THE System SHALL maintain the same Session ID
11. WHEN switching to Live_Mode, THE System SHALL initialize the VAD_Engine and audio stream
12. WHEN switching to Chat_Mode, THE System SHALL cleanly close the VAD_Engine and audio stream
13. FOR ALL mode switches, THE System SHALL complete the transition without data loss or conversation interruption


### Requirement 4: Continuous Emotion Fusion in Live Mode

**User Story:** As a user, I want the AI to continuously understand my emotional state during Live Mode, so that it can respond appropriately to my emotions in real-time.

#### Acceptance Criteria

1. WHILE Live_Mode is active, THE Emotion_Fusion_Engine SHALL run continuously on a Rolling_Window of the last 5 seconds
2. WHEN new camera frame data arrives, THE Emotion_Fusion_Engine SHALL update the face emotion reading within 150ms
3. WHEN new voice tone data arrives, THE Emotion_Fusion_Engine SHALL update the voice emotion reading within 150ms
4. WHEN a Partial_Transcript or final transcript arrives, THE Emotion_Fusion_Engine SHALL update the text emotion reading within 150ms
5. THE Emotion_Fusion_Engine SHALL fuse emotion readings from active sources (text, voice, face) every 500ms
6. THE Emotion_Fusion_Engine SHALL produce a unified emotion state with primaryEmotion, confidence, stressLevel, activeSources, and conflict fields
7. WHEN the Emotion_Fusion_Engine detects conflicting emotions across modalities, THE System SHALL set the conflict flag to true
8. THE Emotion_Fusion_Engine SHALL apply source weights: text=1.0, voice=0.7, face=0.4
9. THE Emotion_Fusion_Engine SHALL discard emotion readings older than 5 seconds from the Rolling_Window
10. WHEN switching from Chat_Mode to Live_Mode, THE Emotion_Fusion_Engine SHALL initialize with the last known emotion state from Chat_Mode
11. WHILE in Chat_Mode, THE Emotion_Fusion_Engine SHALL run once per turn (not continuously)
12. FOR ALL emotion fusion updates, THE System SHALL emit the fused state to the Turn_Directive component for context


### Requirement 5: Streaming Crisis Detection

**User Story:** As a user in distress, I want the system to detect crisis signals as I'm speaking (not after I finish), so that it can respond immediately if I express suicidal ideation or self-harm intent.

#### Acceptance Criteria

1. WHILE Live_Mode is active, THE Crisis_Detector SHALL process Partial_Transcript outputs as they arrive from the STT_Engine
2. WHEN the Crisis_Detector identifies a crisis keyword or pattern in a Partial_Transcript, THE System SHALL immediately flag the session as crisis-active within 50ms
3. WHEN a crisis is detected mid-sentence, THE System SHALL interrupt any ongoing AI response and transition to crisis response mode
4. WHEN a crisis is detected, THE Crisis_Detector SHALL log the trigger reason with timestamp
5. WHEN a crisis is detected, THE System SHALL emit a crisis event to the WebSocket client with severity level
6. THE Crisis_Detector SHALL scan for crisis patterns including: suicide/suicidal, kill myself, end my life, hurt myself, cut myself, no point in living
7. THE Crisis_Detector SHALL use regex-based keyword matching with word boundaries to avoid false positives
8. WHILE in Chat_Mode, THE Crisis_Detector SHALL run once per completed user message (not on partial transcripts)
9. WHEN the Crisis_Detector flags a crisis, THE System SHALL provide the appropriate crisis response directive to the LLM
10. THE Crisis_Detector SHALL run independently of the LLM generation pipeline
11. THE Crisis_Detector SHALL complete crisis detection within 150ms of receiving a Partial_Transcript
12. FOR ALL crisis detections, THE System SHALL record the event in the Session analytics


### Requirement 6: Sentence-Level Streaming Pipeline

**User Story:** As a user, I want to hear the AI's response start as quickly as possible, so that the conversation feels natural and responsive.

#### Acceptance Criteria

1. WHEN the LLM begins generating a response, THE System SHALL buffer tokens until a complete Sentence_Chunk is identified
2. THE System SHALL identify sentence boundaries using punctuation markers: period, exclamation mark, question mark, or newline
3. WHEN a complete Sentence_Chunk is identified, THE System SHALL immediately send it to the TTS_Engine
4. WHILE the TTS_Engine is synthesizing the first Sentence_Chunk, THE LLM SHALL continue generating subsequent Sentence_Chunks
5. WHEN the TTS_Engine completes synthesis of a Sentence_Chunk, THE System SHALL immediately begin audio playback
6. WHILE the TTS_Engine is playing the first Sentence_Chunk audio, THE System SHALL begin synthesizing the second Sentence_Chunk
7. THE System SHALL maintain a pipeline where LLM generation, TTS synthesis, and audio playback run concurrently
8. WHEN a barge-in occurs, THE System SHALL cancel all pending Sentence_Chunks in the pipeline
9. THE System SHALL stream each Sentence_Chunk as a separate WebSocket message to the client
10. THE TTS_Engine SHALL emit Word_Boundary events for each word in the synthesized audio
11. THE System SHALL forward Word_Boundary events to the Presence_Visual for viseme synchronization
12. FOR ALL Sentence_Chunks, THE System SHALL maintain the correct sequence order in the pipeline


### Requirement 7: Latency Budget Compliance

**User Story:** As a user, I want the AI to respond quickly enough that it feels like a real conversation, so that I don't experience awkward pauses or delays.

#### Acceptance Criteria

1. WHEN the VAD_Engine detects end-of-utterance, THE System SHALL complete VAD processing within 100ms
2. WHEN VAD processing completes, THE System SHALL begin Crisis_Detector and Emotion_Fusion_Engine processing within 50ms
3. THE Crisis_Detector SHALL complete analysis of the transcript within 150ms
4. THE Emotion_Fusion_Engine SHALL complete fusion within 150ms
5. THE Turn_Directive generation SHALL complete within 200ms
6. WHEN Crisis detection, Emotion fusion, and Turn_Directive complete, THE System SHALL submit the request to the LLM within 50ms
7. THE LLM SHALL return the first token within 400ms of receiving the request
8. WHEN the first Sentence_Chunk is identified, THE TTS_Engine SHALL begin synthesis within 50ms
9. THE TTS_Engine SHALL return the first audio chunk within 200ms of receiving the first Sentence_Chunk
10. THE System SHALL achieve time-to-first-audio under 1000ms from end-of-utterance detection
11. THE System SHALL log Latency_Budget violations with component timing breakdown
12. WHILE the System is under load, THE System SHALL prioritize Live_Mode latency over Chat_Mode latency
13. FOR ALL pipeline stages, THE System SHALL execute Crisis_Detector, Emotion_Fusion_Engine, and Turn_Directive in parallel when possible


### Requirement 8: Live Mode WebSocket Protocol

**User Story:** As a developer, I want a dedicated high-frequency WebSocket channel for Live Mode, so that real-time audio and state updates don't interfere with other system components.

#### Acceptance Criteria

1. THE System SHALL provide a dedicated WebSocket endpoint at /ws/live for Live_Mode connections
2. WHEN a client connects to /ws/live, THE System SHALL accept the connection and initialize Live_Mode state
3. THE System SHALL support bidirectional WebSocket messages with both text (JSON control) and binary (audio) frames
4. WHEN the client sends binary audio frames, THE System SHALL forward them to the VAD_Engine and audio pipeline
5. WHEN the client sends text control messages, THE System SHALL parse them as JSON and handle message types: ping, mode_switch, stop
6. THE System SHALL send Avatar_State transition events as JSON messages with type: avatar_state
7. THE System SHALL send Partial_Transcript updates as JSON messages with type: partial_transcript
8. THE System SHALL send emotion fusion updates as JSON messages with type: emotion
9. THE System SHALL send crisis detection events as JSON messages with type: crisis
10. THE System SHALL send Sentence_Chunk text as JSON messages with type: sentence
11. THE System SHALL send TTS audio chunks as binary messages
12. THE System SHALL send Word_Boundary events as JSON messages with type: word_boundary, containing word, offset_ms, and duration_ms fields
13. WHEN the client disconnects, THE System SHALL cleanly close the audio pipeline and release resources
14. THE System SHALL support ping/pong messages to maintain connection health
15. FOR ALL WebSocket messages, THE System SHALL maintain message order within each type (text or binary)


### Requirement 9: Viseme Synchronization

**User Story:** As a user, I want the presence visual to move its "mouth" or pulse in sync with the AI's speech, so that the interaction feels more natural and engaging.

#### Acceptance Criteria

1. THE TTS_Engine SHALL emit Word_Boundary events for each word in the synthesized audio with word text, offset_ms, and duration_ms
2. WHEN a Word_Boundary event is received, THE System SHALL forward it to the Viseme_Sync component within 10ms
3. THE Viseme_Sync component SHALL calculate a pulse magnitude between 0.0 and 1.0 based on word characteristics
4. THE Viseme_Sync component SHALL calculate pulse magnitude using vowel count: magnitude = min(1.0, 0.4 + vowels * 0.1)
5. WHEN a pulse magnitude is calculated, THE Viseme_Sync component SHALL emit the magnitude to the Presence_Visual within 10ms
6. THE Presence_Visual SHALL animate the pulse/mouth movement using the received magnitude value
7. WHILE the System is in responding state, THE Presence_Visual SHALL continuously update pulse animations as Word_Boundary events arrive
8. WHEN the System transitions out of responding state, THE Presence_Visual SHALL stop pulse animations within 100ms
9. THE Viseme_Sync component SHALL handle Word_Boundary events in the order they are received
10. FOR ALL Word_Boundary events, THE System SHALL maintain synchronization between audio playback timing and visual animation timing


### Requirement 10: Session State Continuity

**User Story:** As a user, I want my conversation memory and progress to persist across mode switches and reconnections, so that I don't lose context or have to repeat myself.

#### Acceptance Criteria

1. THE System SHALL maintain a single Session object for both Chat_Mode and Live_Mode
2. WHEN a mode switch occurs, THE System SHALL preserve the Session conversation history
3. WHEN a mode switch occurs, THE System SHALL preserve the Session phase state (if phase-based flow is active)
4. WHEN a mode switch occurs, THE System SHALL preserve the Session user goals and preferences
5. WHEN a mode switch occurs, THE System SHALL preserve the most recent Emotion_Fusion_Engine state
6. THE System SHALL append all user and assistant messages to the Session conversation history in chronological order
7. WHEN a barge-in occurs, THE System SHALL append the partial assistant response with an "[interrupted]" marker
8. THE System SHALL maintain conversation history with a rolling window of the last 12 turns in memory
9. THE System SHALL persist all messages to the database for long-term storage
10. WHEN the WebSocket disconnects, THE System SHALL mark the Session status as ended
11. WHEN the WebSocket reconnects with the same Session ID, THE System SHALL restore the conversation history and state
12. THE System SHALL maintain independent Session objects for authenticated and unauthenticated users
13. FOR ALL Session state updates, THE System SHALL ensure atomic consistency between in-memory and database state


### Requirement 11: Safety and Privacy Constraints

**User Story:** As a user, I want to trust that the AI is a support tool (not a person or licensed professional), and that my sensitive data is protected, so that I can use the system safely and confidently.

#### Acceptance Criteria

1. THE System SHALL maintain a non-clinical persona and never diagnose mental health conditions
2. THE System SHALL never claim to be a licensed professional, therapist, or counselor
3. WHEN a crisis is detected, THE System SHALL provide crisis resource information (988 Suicide and Crisis Lifeline)
4. THE System SHALL display a visible "AI is listening" indicator when the microphone is active in Live_Mode
5. THE System SHALL display a visible "AI is watching" indicator when the camera is active
6. THE System SHALL require explicit user opt-in before activating the camera
7. THE System SHALL require explicit user opt-in before activating the microphone
8. THE System SHALL encrypt all health-adjacent data at rest using AES-256
9. THE System SHALL provide a user-triggered delete path for all Session data, emotion logs, and audio recordings
10. THE Presence_Visual SHALL render as clearly-synthetic (abstract orb/hologram) and NOT photorealistic
11. THE System SHALL NOT store raw audio recordings unless explicitly consented by the user
12. THE System SHALL NOT share user data with third parties without explicit consent
13. WHERE the user is unauthenticated, THE System SHALL NOT persist emotion logs or Session data beyond the current session
14. FOR ALL crisis detections, THE System SHALL log the event but NOT store the raw transcript text unless the user is authenticated and has consented


### Requirement 12: Backward Compatibility with Chat Mode

**User Story:** As a user, I want Chat Mode to continue working exactly as it does today, so that I can choose the mode that fits my current needs without losing functionality.

#### Acceptance Criteria

1. THE System SHALL maintain the existing Chat_Mode WebSocket endpoint at /ws/chat
2. WHEN a user connects to /ws/chat, THE System SHALL initialize Chat_Mode with the existing turn-based pipeline
3. WHILE in Chat_Mode, THE Emotion_Fusion_Engine SHALL run once per completed turn (not continuously)
4. WHILE in Chat_Mode, THE Crisis_Detector SHALL run once per completed user message (not on partial transcripts)
5. WHILE in Chat_Mode, THE System SHALL NOT activate the VAD_Engine or continuous audio pipeline
6. WHILE in Chat_Mode, THE System SHALL support text input, voice input (push-to-talk), and camera input
7. WHILE in Chat_Mode, THE System SHALL use the existing state machine transitions for turn-based conversation
8. THE System SHALL NOT modify existing Chat_Mode API contracts or message formats
9. THE System SHALL maintain existing Chat_Mode latency and performance characteristics
10. THE System SHALL support users running multiple Sessions with different modes simultaneously
11. FOR ALL Chat_Mode functionality, THE System SHALL preserve existing behavior without regression


### Requirement 13: Error Handling and Recovery

**User Story:** As a user, I want the system to handle errors gracefully and recover when possible, so that temporary issues don't force me to restart my entire conversation.

#### Acceptance Criteria

1. WHEN the VAD_Engine fails, THE System SHALL transition to error state and emit an error event to the client
2. WHEN the STT_Engine fails to transcribe an utterance, THE System SHALL log the error and transition back to listening state
3. WHEN the LLM generation fails, THE System SHALL emit an error event and return to listening state within 500ms
4. WHEN the TTS_Engine fails to synthesize audio, THE System SHALL log the error and skip that Sentence_Chunk
5. WHEN the Emotion_Fusion_Engine fails, THE System SHALL log a warning and continue with neutral emotion state
6. WHEN the Crisis_Detector fails, THE System SHALL log an error and continue processing (fail-open for safety)
7. IF the WebSocket connection drops during Live_Mode, THEN THE System SHALL attempt to preserve Session state for 60 seconds
8. WHEN the WebSocket reconnects within 60 seconds, THE System SHALL restore the Session and continue from the last known state
9. IF the WebSocket does not reconnect within 60 seconds, THEN THE System SHALL mark the Session as ended
10. WHEN a component exceeds its Latency_Budget, THE System SHALL log a performance warning but continue execution
11. THE System SHALL maintain a circuit breaker for external API failures (STT, TTS, LLM) with 5 failures threshold
12. WHEN the circuit breaker trips, THE System SHALL emit a service_unavailable error and transition to error state
13. THE System SHALL reset the circuit breaker after 30 seconds of no failures
14. FOR ALL error states, THE System SHALL provide descriptive error messages to the client with error codes


### Requirement 14: Audio Stream Server-Side Ownership

**User Story:** As a developer, I want the backend to own and manage the audio stream, so that we avoid frontend microphone conflicts and can apply server-side processing consistently.

#### Acceptance Criteria

1. THE System SHALL receive raw PCM audio chunks from the WebSocket client
2. THE System SHALL process all VAD, STT, and audio buffering server-side
3. THE System SHALL NOT rely on client-side VAD or speech detection
4. THE System SHALL accept audio in PCM format with 16kHz sample rate and 16-bit depth
5. THE System SHALL buffer incoming audio chunks in a server-side circular buffer
6. WHEN the VAD_Engine detects end-of-utterance, THE System SHALL extract the relevant audio segment from the buffer
7. THE System SHALL handle audio chunk loss gracefully by logging warnings without crashing
8. THE System SHALL support audio chunk sizes between 160 bytes (10ms) and 3200 bytes (200ms)
9. THE System SHALL process audio chunks as they arrive without waiting for complete utterances
10. THE System SHALL maintain audio buffer memory limits at 10MB per active Session
11. WHEN the audio buffer exceeds memory limits, THE System SHALL trim the oldest chunks
12. FOR ALL audio processing, THE System SHALL run independently of client-side audio device state


### Requirement 15: Parallel Pipeline Execution

**User Story:** As a user, I want the system to process multiple stages simultaneously, so that I get the fastest possible response time.

#### Acceptance Criteria

1. WHEN an utterance completes, THE System SHALL execute Crisis_Detector, Emotion_Fusion_Engine, and Turn_Directive generation in parallel
2. THE System SHALL use asyncio.gather or equivalent to run parallel tasks concurrently
3. THE System SHALL wait for all parallel tasks to complete before proceeding to LLM generation
4. IF any parallel task fails, THE System SHALL continue with the results from successful tasks
5. THE System SHALL log the duration of each parallel task for latency monitoring
6. WHILE the LLM is generating tokens, THE System SHALL buffer and identify Sentence_Chunks concurrently
7. WHILE the TTS_Engine is synthesizing a Sentence_Chunk, THE LLM SHALL continue generating subsequent tokens
8. WHILE audio is playing, THE System SHALL continue processing the next Sentence_Chunk in the TTS pipeline
9. THE System SHALL maintain independent task queues for LLM generation, TTS synthesis, and audio playback
10. THE System SHALL support cancellation of all parallel tasks when a barge-in occurs
11. FOR ALL parallel execution, THE System SHALL avoid race conditions using proper async locking primitives
12. FOR ALL parallel tasks, THE System SHALL enforce timeouts to prevent indefinite hanging


### Requirement 16: Mode Switcher UI Component

**User Story:** As a user, I want a clear, accessible control to switch between Chat and Live modes, so that I can easily choose the interaction style that works best for me.

#### Acceptance Criteria

1. THE Mode_Switcher SHALL display as a toggle or button group with "Chat Mode" and "Live Mode" options
2. THE Mode_Switcher SHALL indicate the currently active mode with visual styling (highlighted, selected)
3. WHEN the user clicks "Live Mode", THE Mode_Switcher SHALL send a mode_switch WebSocket message to the System
4. WHEN the user clicks "Chat Mode", THE Mode_Switcher SHALL send a mode_switch WebSocket message to the System
5. WHILE a mode switch is in progress, THE Mode_Switcher SHALL display a loading indicator
6. WHEN the System confirms the mode switch, THE Mode_Switcher SHALL update the active mode indicator
7. THE Mode_Switcher SHALL display a tooltip or help text explaining the difference between modes
8. THE Mode_Switcher SHALL be keyboard accessible with tab navigation and enter/space activation
9. THE Mode_Switcher SHALL meet WCAG 2.1 AA accessibility standards for contrast and focus indicators
10. WHERE the user's device does not support microphone access, THE Mode_Switcher SHALL disable the Live Mode option
11. THE Mode_Switcher SHALL prevent mode switching while the System is actively speaking or processing
12. FOR ALL mode switch interactions, THE Mode_Switcher SHALL provide immediate visual feedback (< 100ms)


### Requirement 17: Performance Monitoring and Analytics

**User Story:** As a developer, I want detailed performance metrics for the Live Mode pipeline, so that I can identify bottlenecks and optimize latency.

#### Acceptance Criteria

1. THE System SHALL log the duration of each pipeline stage: VAD, STT, Crisis Detection, Emotion Fusion, Turn Directive, LLM First Token, TTS Synthesis, Total Time-to-First-Audio
2. THE System SHALL log the total turn duration from end-of-utterance to response completion
3. THE System SHALL log barge-in events with the partial response length and timing
4. THE System SHALL log Latency_Budget violations with component timing breakdown
5. THE System SHALL log error events with error codes, component names, and error messages
6. THE System SHALL track Session metrics: total turns, total barge-ins, average latency, crisis detections
7. THE System SHALL expose performance metrics via a /metrics endpoint in Prometheus format
8. THE System SHALL calculate and log percentile latencies (p50, p90, p95, p99) for each pipeline stage
9. THE System SHALL log concurrent active Live_Mode sessions count
10. THE System SHALL log memory usage for audio buffers per Session
11. THE System SHALL log WebSocket message throughput (messages/sec, bytes/sec)
12. FOR ALL logged metrics, THE System SHALL include Session ID, user ID (if authenticated), and timestamp


## Property-Based Testing Guidance

This section provides guidance on which acceptance criteria are suitable for property-based testing (PBT) vs integration testing.

### Suitable for Property-Based Testing

**Requirement 1 (Full-Duplex Audio Pipeline):**
- AC 6: Barge-in clears output buffer and transitions to interrupted state
  - **Property:** For all audio buffer states, barge-in should result in empty buffer + interrupted state
  - **Rationale:** Behavior varies with buffer content size and position

**Requirement 2 (Presence Visual):**
- AC 11: Avatar state transitions emit events to WebSocket
  - **Property:** For all valid state transitions, an event should be emitted
  - **Rationale:** State machine behavior with multiple valid paths

**Requirement 4 (Continuous Emotion Fusion):**
- AC 8: Source weights applied correctly (text=1.0, voice=0.7, face=0.4)
  - **Property:** Weighted fusion formula should be associative and commutative for same inputs
  - **Rationale:** Mathematical property that should hold for all input combinations

- AC 9: Readings older than 5 seconds discarded from rolling window
  - **Property:** For all timestamp inputs, only readings within 5s window remain
  - **Rationale:** Temporal invariant that must hold for all time values

**Requirement 6 (Sentence-Level Streaming):**
- AC 2: Sentence boundaries identified by punctuation markers
  - **Property (Round-trip):** parse_sentences(text) should split on boundaries, join(parse_sentences(text)) should preserve content
  - **Rationale:** Parsing/formatting round-trip property

- AC 12: Sentence chunks maintain correct sequence order
  - **Property (Invariance):** For all input token streams, output sentence order matches input order
  - **Rationale:** Order preservation is a critical invariant

**Requirement 9 (Viseme Synchronization):**
- AC 4: Pulse magnitude calculation formula
  - **Property:** magnitude = min(1.0, 0.4 + vowels * 0.1) should always return value in [0.0, 1.0]
  - **Rationale:** Mathematical invariant that must hold for all inputs

- AC 9: Word boundary events processed in order received
  - **Property (Confluence):** Order of processing should not affect final state if events are from same timestamp
  - **Rationale:** Order independence for concurrent events

**Requirement 10 (Session State Continuity):**
- AC 8: Conversation history maintains rolling window of last 12 turns
  - **Property (Invariance):** len(history) <= 12 for all operations
  - **Rationale:** Size invariant that must hold regardless of input

- AC 13: Atomic consistency between in-memory and database state
  - **Property (Model-based):** In-memory state should match database state after commit
  - **Rationale:** Consistency property across two implementations

**Requirement 14 (Audio Stream):**
- AC 11: Trim oldest chunks when buffer exceeds 10MB
  - **Property (Invariance):** buffer_size <= 10MB for all operations
  - **Rationale:** Memory limit invariant

### Suitable for Integration Testing (NOT Property-Based)

**Requirement 1 (Full-Duplex Audio Pipeline):**
- AC 1-5, 7-10: External service behavior (VAD, STT)
  - **Rationale:** Testing external service wiring, not our logic
  - **Approach:** 2-3 representative examples with real/mocked services

**Requirement 3 (Mode Switcher):**
- All criteria: State preservation during mode switch
  - **Rationale:** Integration behavior between components, not input-variant logic
  - **Approach:** Test a few mode switch scenarios with different session states

**Requirement 5 (Streaming Crisis Detection):**
- AC 2-6: Crisis keyword detection
  - **Rationale:** Regex matching is deterministic, external behavior tested by library
  - **Approach:** 10-15 example transcripts with known crisis patterns + edge cases

**Requirement 7 (Latency Budget):**
- All criteria: Timing measurements
  - **Rationale:** Performance characteristics, not correctness properties
  - **Approach:** Load testing with monitoring, not property tests

**Requirement 8 (WebSocket Protocol):**
- All criteria: Protocol compliance and message handling
  - **Rationale:** Testing infrastructure behavior, not algorithmic correctness
  - **Approach:** Protocol conformance tests with example messages

**Requirement 11 (Safety and Privacy):**
- All criteria: Security and privacy constraints
  - **Rationale:** Policy enforcement, not variant behavior
  - **Approach:** Security audit with representative scenarios

**Requirement 13 (Error Handling):**
- All criteria: Error recovery paths
  - **Rationale:** Testing specific error scenarios, not general input space
  - **Approach:** Fault injection tests with known error conditions

**Requirement 15 (Parallel Pipeline):**
- All criteria: Concurrency behavior
  - **Rationale:** Testing race conditions requires specific timing scenarios
  - **Approach:** Concurrency stress tests with deterministic scenarios

**Requirement 16 (Mode Switcher UI):**
- All criteria: UI component behavior
  - **Rationale:** User interaction testing, not algorithmic correctness
  - **Approach:** End-to-end UI tests with accessibility checks

**Requirement 17 (Performance Monitoring):**
- All criteria: Metrics collection
  - **Rationale:** Testing instrumentation, not business logic
  - **Approach:** Verify metrics are logged correctly with example scenarios

### Key Property-Based Testing Priorities

1. **Sentence parsing round-trip** (Req 6, AC 2): Critical for streaming pipeline correctness
2. **Emotion fusion weight calculation** (Req 4, AC 8): Mathematical correctness for safety
3. **Rolling window size invariants** (Req 4, AC 9; Req 10, AC 8; Req 14, AC 11): Memory safety
4. **Order preservation** (Req 6, AC 12; Req 9, AC 9): Prevents subtle sequencing bugs
5. **State machine transitions** (Req 2, AC 11): Ensures valid state space coverage


## Requirements Summary

This requirements document specifies 17 major requirements with 212 total acceptance criteria for implementing Live Mode Full-Duplex in AURA AI 2.0.

### Core Capabilities

1. **Full-Duplex Audio Pipeline** (10 AC): Always-open microphone, VAD, barge-in handling
2. **Presence Visual** (12 AC): State-driven abstract avatar with viseme sync
3. **Mode Switcher** (13 AC): Seamless toggle preserving session state
4. **Continuous Emotion Fusion** (12 AC): Real-time multi-modal emotion analysis
5. **Streaming Crisis Detection** (12 AC): Mid-sentence crisis signal detection
6. **Sentence-Level Streaming** (12 AC): Concurrent LLM generation and TTS synthesis
7. **Latency Budget** (13 AC): Sub-1-second time-to-first-audio

### Infrastructure

8. **WebSocket Protocol** (15 AC): Dedicated high-frequency channel for Live Mode
9. **Viseme Synchronization** (10 AC): Word-boundary driven animation
10. **Session State Continuity** (13 AC): Persistent conversation context
11. **Safety and Privacy** (14 AC): Non-clinical persona, opt-in sensors, data encryption
12. **Backward Compatibility** (11 AC): Chat Mode functionality preserved
13. **Error Handling** (14 AC): Graceful degradation and recovery
14. **Audio Stream Ownership** (12 AC): Server-side audio processing
15. **Parallel Pipeline** (12 AC): Concurrent task execution for low latency
16. **Mode Switcher UI** (12 AC): Accessible mode toggle component
17. **Performance Monitoring** (12 AC): Comprehensive latency and error tracking

### Critical Success Factors

- **Latency:** Time-to-first-audio under 1 second (Req 7)
- **Safety:** Crisis detection on partial transcripts (Req 5), non-clinical persona (Req 11)
- **Continuity:** Seamless mode switching without data loss (Req 3, 10)
- **Responsiveness:** Real-time barge-in handling (Req 1)
- **Natural Interaction:** Viseme-synced presence visual (Req 2, 9)

### Next Steps

After requirements approval, the next phase will create the design document specifying:
- Component architecture and interfaces
- State machine diagrams for Avatar and Session states
- WebSocket message format specifications
- Pipeline flow diagrams with timing
- Database schema updates
- API endpoint specifications
- Error handling strategies
