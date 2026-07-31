# Implementation Plan: Live Mode Full-Duplex

## Overview

This implementation plan breaks down the Live Mode Full-Duplex feature into atomic, executable tasks following the 5-phase roadmap defined in the design document. The feature adds continuous, always-listening conversation capabilities to AURA AI 2.0 with full-duplex audio pipeline, presence visual, streaming emotion/crisis detection, and seamless mode switching.

**Implementation Priority:**
1. **Phase 1**: Foundation (state machine, data models, WebSocket protocol)
2. **Phase 2**: Audio pipeline (VAD, STT, audio handler)
3. **Phase 3**: Conversation pipeline (LLM streaming, TTS, sentence-level streaming)
4. **Phase 4**: Real-time analysis (continuous emotion fusion, streaming crisis detection)
5. **Phase 5**: Integration and polish (mode switching, viseme sync, monitoring)

**Technology Stack:**
- Backend: Python 3.11+, FastAPI, asyncio
- Database: PostgreSQL with SQLAlchemy ORM
- Testing: pytest, hypothesis (property-based testing)
- Audio Processing: WebRTC VAD / Silero VAD
- STT: Deepgram / AssemblyAI
- TTS: ElevenLabs / Azure Speech
- LLM: Existing AI Gateway (OpenAI, Gemini, NVIDIA NIM)

## Tasks

### Phase 1: Foundation and Core Infrastructure

- [ ] 1. Create state machine and core data models
  - [~] 1.1 Implement AvatarState enum and LiveStateMachine class
    - Create `backend/app/live/state_machine.py` with AvatarState enum (idle, listening, user_speaking, thinking, responding, interrupted, error)
    - Implement LiveStateMachine with state validation, transition history, and async callbacks
    - Implement `transition()` method with legal transition validation
    - Implement `_is_valid_transition()` with state transition rules from design
    - Add thread-safe state access with asyncio.Lock
    - _Requirements: 2.3, 2.11_

  - [ ]* 1.2 Write property test for state machine transitions
    - **Property 2: State Transition Event Emission**
    - **Validates: Requirements 2.11**
    - For all valid avatar state transitions, verify state change event is emitted with correct from_state and to_state
    - Use hypothesis to generate valid transition sequences
    - _Requirements: 2.11_

  - [ ]* 1.3 Write unit tests for state machine
    - Test all valid state transitions (listening → user_speaking, user_speaking → thinking, etc.)
    - Test all invalid transitions raise ValueError
    - Test transition history tracking
    - Test callback notification on state changes
    - _Requirements: 2.3, 2.11_

  - [~] 1.4 Create database schema updates for Live Mode
    - Create Alembic migration to add `mode` column to sessions table (default="chat")
    - Create LiveMetrics model in `backend/app/models/live_metrics.py` with all latency fields
    - Add `interrupted` boolean column to messages table
    - Run migration and verify schema changes
    - _Requirements: 3.13, 10.2, 10.7, 17.1_


  - [ ]* 1.5 Write unit tests for database models
    - Test Session.mode field accepts "chat" and "live" values
    - Test LiveMetrics model creation and relationships
    - Test Message.interrupted field
    - Test database constraints and foreign keys
    - _Requirements: 10.1, 10.2, 17.6_

- [ ] 2. Implement WebSocket protocol foundation
  - [~] 2.1 Create Live Mode WebSocket endpoint and manager
    - Create `backend/app/api/v1/live_ws.py` with /ws/live endpoint
    - Implement LiveWebSocketManager class with connection handling
    - Implement bidirectional message routing (JSON text, binary audio)
    - Add message type parsing for client messages (session_start, audio_chunk, mode_switch, interrupt, stop_session, ping)
    - Add session registry for tracking active Live Mode sessions
    - _Requirements: 8.1, 8.2, 8.3, 8.14_

  - [~] 2.2 Implement WebSocket message schemas
    - Create message schema classes for all server → client messages (session_ready, avatar_state, partial_transcript, final_transcript, emotion, crisis, sentence, audio_chunk, word_boundary, completed, error, pong)
    - Create message schema classes for all client → server messages (session_start, audio_chunk, mode_switch, interrupt, stop_session, ping)
    - Add JSON serialization/deserialization for all message types
    - Add binary audio frame handling for client and server
    - _Requirements: 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12_

  - [ ]* 2.3 Write integration tests for WebSocket protocol
    - Test WebSocket connection establishment to /ws/live
    - Test session_start message creates session and returns session_ready
    - Test binary audio frame reception and forwarding
    - Test JSON control message parsing (ping/pong, mode_switch)
    - Test WebSocket disconnect cleans up resources
    - Test message order preservation within each type (text/binary)
    - _Requirements: 8.1, 8.2, 8.3, 8.13, 8.15_

- [ ] 3. Implement LiveSession state management
  - [~] 3.1 Create LiveSession class with in-memory state
    - Create `backend/app/live/live_session.py` with LiveSession class
    - Implement session initialization with session_id, user_id, mode tracking
    - Integrate LiveStateMachine into LiveSession
    - Implement conversation history management with rolling window (last 12 turns)
    - Implement phase state and emotion state preservation
    - Add created_at and last_activity timestamp tracking
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8_


  - [ ]* 3.2 Write property test for conversation history size limit
    - **Property 10: Conversation History Size Limit**
    - **Validates: Requirements 10.8**
    - For any sequence of message additions, verify in-memory history never exceeds 12 turns
    - Use hypothesis to generate arbitrary message sequences (0-100 messages)
    - _Requirements: 10.8_

  - [ ]* 3.3 Write unit tests for LiveSession
    - Test session initialization with correct defaults
    - Test conversation history append and rolling window eviction
    - Test phase state preservation
    - Test emotion state preservation
    - Test session state serialization for reconnection
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.8_

- [~] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

### Phase 2: Audio Pipeline Components

- [ ] 5. Implement server-side audio handling
  - [~] 5.1 Create AudioStreamHandler with circular buffer
    - Create `backend/app/live/audio_handler.py` with AudioStreamHandler class
    - Implement circular buffer with 10MB memory limit
    - Implement `feed()` method to accept raw PCM audio chunks from WebSocket
    - Implement `frames()` async generator to yield audio frames for VAD processing
    - Implement buffer trimming when exceeding 10MB limit (remove oldest chunks)
    - Handle PCM format: 16kHz sample rate, 16-bit depth, mono
    - Support chunk sizes between 160 bytes (10ms) and 3200 bytes (200ms)
    - _Requirements: 14.1, 14.2, 14.5, 14.6, 14.8, 14.10, 14.11_

  - [ ]* 5.2 Write property test for audio buffer size limit
    - **Property 12: Audio Buffer Size Limit**
    - **Validates: Requirements 14.11**
    - For any sequence of audio chunk additions, verify buffer size never exceeds 10MB
    - Use hypothesis to generate arbitrary audio chunk sequences with varying sizes
    - _Requirements: 14.10, 14.11_

  - [ ]* 5.3 Write unit tests for AudioStreamHandler
    - Test circular buffer append and retrieval
    - Test buffer memory limit enforcement
    - Test oldest chunk trimming when limit exceeded
    - Test frames() async generator yields chunks correctly
    - Test handling of chunk loss gracefully
    - _Requirements: 14.5, 14.7, 14.8, 14.10, 14.11_

- [ ] 6. Implement Voice Activity Detection (VAD)
  - [~] 6.1 Integrate VAD engine (WebRTC VAD or Silero VAD)
    - Create `backend/app/live/vad_engine.py` with VoiceActivityDetector class
    - Integrate chosen VAD library (WebRTC VAD recommended for low latency)
    - Implement `process()` async generator that yields VADResult events (SPEECH_STARTED, SPEECH_ENDED, SILENCE)
    - Implement end-of-utterance detection with 700ms silence threshold
    - Implement minimum speech duration filter (300ms)
    - Add configurable aggressiveness parameter (0-3 for WebRTC VAD)
    - Track in_speech state and silence duration
    - _Requirements: 1.2, 1.3, 1.4_


  - [ ]* 6.2 Write unit tests for VAD engine
    - Test VAD initialization with different aggressiveness levels
    - Test speech detection on synthetic audio samples
    - Test SPEECH_STARTED event emission on speech detection
    - Test SPEECH_ENDED event emission after silence threshold
    - Test minimum speech duration filtering
    - Test VAD processing latency is under 100ms
    - _Requirements: 1.2, 1.3, 1.4_

- [ ] 7. Implement Speech-to-Text (STT) engine
  - [~] 7.1 Integrate STT provider with streaming support
    - Create `backend/app/live/stt_engine.py` with STTEngine class
    - Integrate Deepgram or AssemblyAI streaming API for real-time transcription
    - Implement `accumulate()` method to buffer audio frames during speech
    - Implement `transcribe_buffer()` method with partial transcript callback support
    - Implement `clear_buffer()` method for barge-in handling
    - Add support for partial transcript streaming via on_partial callback
    - Return TranscriptResult with text, confidence, is_final, language fields
    - _Requirements: 1.8, 1.9_

  - [ ]* 7.2 Write integration tests for STT engine
    - Test STT provider initialization and connection
    - Test audio buffer accumulation during speech
    - Test transcription of sample audio files with known text
    - Test partial transcript emission during transcription
    - Test final transcript with confidence score
    - Test buffer clearing on interrupt
    - _Requirements: 1.8, 1.9_

- [ ] 8. Wire audio pipeline components together
  - [~] 8.1 Integrate AudioHandler, VAD, and STT into LiveSession
    - Update LiveSession to initialize AudioStreamHandler, VoiceActivityDetector, and STTEngine
    - Implement audio pipeline flow: WebSocket → AudioHandler → VAD → STT
    - Implement state transitions: LISTENING → USER_SPEAKING on SPEECH_STARTED, USER_SPEAKING → THINKING on SPEECH_ENDED
    - Forward VAD events to state machine for avatar state updates
    - Send partial transcripts to WebSocket client as they arrive
    - Send final transcript to conversation manager when VAD detects end-of-utterance
    - Ensure all pipeline stages run independently without blocking
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8, 1.9, 1.10_

  - [ ]* 8.2 Write integration tests for audio pipeline flow
    - Test end-to-end audio flow: raw PCM → VAD → STT → transcript
    - Test state transitions during audio pipeline execution
    - Test partial transcript streaming to WebSocket client
    - Test final transcript delivery to conversation manager
    - Test VAD latency under 100ms budget
    - Test STT processing completes within reasonable time
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8, 1.9, 1.10_

- [~] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


### Phase 3: Conversation Pipeline and Streaming

- [ ] 10. Implement sentence-level streaming pipeline
  - [~] 10.1 Create SentenceStreamingPipeline class
    - Create `backend/app/live/sentence_streaming.py` with SentenceStreamingPipeline class
    - Implement token buffer that accumulates LLM tokens
    - Implement `feed_token()` method that buffers tokens until sentence boundary detected
    - Implement `_is_sentence_boundary()` method to detect punctuation markers (. ! ? \n)
    - Implement sentence queue (asyncio.Queue) for buffering complete sentences
    - Implement `_tts_worker()` background task to consume sentences and synthesize
    - Support concurrent LLM generation, TTS synthesis, and audio playback
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 10.2 Write property test for sentence boundary detection
    - **Property 6: Sentence Boundary Round-Trip Preservation**
    - **Validates: Requirements 6.2**
    - For any text input, verify splitting into sentences and rejoining preserves original content
    - Use hypothesis to generate arbitrary text with various punctuation
    - _Requirements: 6.2_

  - [ ]* 10.3 Write property test for sentence order preservation
    - **Property 7: Sentence Order Preservation**
    - **Validates: Requirements 6.12**
    - For any token stream, verify output sentences maintain input order
    - Use hypothesis to generate arbitrary token sequences
    - _Requirements: 6.12_

  - [ ]* 10.4 Write unit tests for sentence streaming pipeline
    - Test sentence boundary detection for all punctuation markers
    - Test token buffering until sentence complete
    - Test sentence queue enqueuing and dequeuing
    - Test concurrent LLM generation and TTS synthesis
    - Test pipeline cancellation on barge-in
    - Test sentence order preservation
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.12_

- [ ] 11. Implement Text-to-Speech (TTS) engine
  - [~] 11.1 Integrate TTS provider with word boundary support
    - Create `backend/app/live/tts_engine.py` with TTSEngine class
    - Integrate ElevenLabs or Azure Speech API with streaming support
    - Implement `synthesize_stream()` method that synthesizes text and streams audio chunks
    - Implement word boundary event extraction (word, offset_ms, duration_ms)
    - Implement audio chunk callbacks via `on_audio_chunk()` registration
    - Implement word boundary callbacks via `on_word_boundary()` registration
    - Implement `cancel()` method for barge-in support
    - Stream audio chunks to WebSocket client as they arrive
    - _Requirements: 6.10, 6.11_

  - [ ]* 11.2 Write integration tests for TTS engine
    - Test TTS provider initialization and connection
    - Test text synthesis produces audio chunks
    - Test word boundary event emission with correct timing
    - Test audio chunk streaming to WebSocket client
    - Test TTS cancellation on barge-in
    - Test TTS first audio latency under 200ms budget
    - _Requirements: 6.10, 6.11_


- [ ] 12. Integrate LLM streaming with sentence pipeline
  - [~] 12.1 Update conversation manager for Live Mode streaming
    - Update `backend/app/communication/conversation_manager.py` to support Live Mode
    - Add `generate_stream_live()` method that streams LLM tokens to SentenceStreamingPipeline
    - Integrate SentenceStreamingPipeline and TTSEngine into conversation flow
    - Implement state transition to RESPONDING when first audio chunk is ready
    - Send sentence chunks as JSON messages to WebSocket client
    - Track turn metrics (llm_first_token_ms, tts_first_audio_ms, total_time_to_first_audio_ms)
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 7.7, 7.8, 7.9_

  - [ ]* 12.2 Write integration tests for LLM streaming integration
    - Test LLM token stream feeds into sentence pipeline
    - Test first sentence triggers TTS synthesis
    - Test audio playback while LLM continues generating
    - Test concurrent sentence processing and audio playback
    - Test state transition to RESPONDING when first audio ready
    - Test sentence chunk messages sent to WebSocket client
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 13. Implement barge-in (interrupt) handling
  - [~] 13.1 Create InterruptManager for barge-in coordination
    - Create `backend/app/live/interrupt_manager.py` with InterruptManager class
    - Implement barge-in detection when user speaks during RESPONDING state
    - Implement cancellation of active LLM generation task
    - Implement cancellation of active TTS synthesis tasks
    - Clear output audio buffer and sentence queue
    - Transition to INTERRUPTED state, then USER_SPEAKING state
    - Mark partial assistant message as interrupted in database
    - _Requirements: 1.5, 1.6, 1.7, 6.8, 10.7_

  - [ ]* 13.2 Write property test for barge-in buffer clearing
    - **Property 1: Barge-in Buffer Clearing**
    - **Validates: Requirements 1.6**
    - For any audio buffer state, verify barge-in clears buffer to empty and transitions to interrupted
    - Use hypothesis to generate arbitrary buffer content (0-10MB)
    - _Requirements: 1.6_

  - [ ]* 13.3 Write integration tests for barge-in handling
    - Test barge-in detection when user speaks during RESPONDING
    - Test LLM generation cancellation on barge-in
    - Test TTS synthesis cancellation on barge-in
    - Test audio buffer clearing on barge-in
    - Test state transition RESPONDING → INTERRUPTED → USER_SPEAKING
    - Test barge-in latency under 50ms budget
    - Test partial assistant message marked as interrupted in database
    - _Requirements: 1.5, 1.6, 1.7, 6.8, 10.7_

- [~] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.


### Phase 4: Real-Time Analysis and Safety

- [ ] 15. Implement continuous emotion fusion for Live Mode
  - [~] 15.1 Extend EmotionFusionEngine for continuous mode
    - Update `backend/app/emotion/fusion.py` to support continuous mode
    - Add `enable_continuous_mode()` and `disable_continuous_mode()` methods
    - Implement 5-second rolling window for emotion readings
    - Implement `update_reading()` method to accept readings from text, voice, face sources
    - Implement temporal eviction: discard readings older than 5 seconds
    - Implement `fuse()` method that runs every 500ms in continuous mode
    - Apply source weights: text=1.0, voice=0.7, face=0.4
    - Emit fused emotion state to WebSocket client every 500ms
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [ ]* 15.2 Write property test for emotion fusion weight calculation
    - **Property 4: Emotion Fusion Weight Calculation**
    - **Validates: Requirements 4.8**
    - For any combination of emotion readings, verify weighted fusion applies correct weights
    - Use hypothesis to generate arbitrary emotion readings (0.0-1.0) for text, voice, face
    - _Requirements: 4.8_

  - [ ]* 15.3 Write property test for rolling window temporal eviction
    - **Property 5: Rolling Window Temporal Eviction**
    - **Validates: Requirements 4.9**
    - For any sequence of emotion readings with timestamps, verify only readings within 5s remain
    - Use hypothesis to generate arbitrary timestamp sequences
    - _Requirements: 4.9_

  - [ ]* 15.4 Write unit tests for continuous emotion fusion
    - Test continuous mode enable/disable
    - Test update_reading() from multiple sources
    - Test rolling window size enforcement (5 seconds)
    - Test temporal eviction of old readings
    - Test fusion calculation with correct weights
    - Test fuse() runs every 500ms in continuous mode
    - Test emotion state preservation during mode switch
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_

- [ ] 16. Implement streaming crisis detection
  - [~] 16.1 Extend CrisisDetector for partial transcript support
    - Update `backend/app/communication/crisis_detector.py` (or create new in app/live/)
    - Implement `check_partial()` method that processes partial transcripts as they arrive
    - Implement crisis pattern matching using regex with word boundaries
    - Add crisis patterns: suicide/suicidal, kill myself, end my life, hurt myself, cut myself, no point in living, want to die
    - Emit crisis event to WebSocket client immediately when detected (within 50ms)
    - Log crisis trigger reason and timestamp
    - Provide crisis resources (988 Suicide and Crisis Lifeline) in crisis event
    - Maintain fail-open behavior: continue processing if crisis detector fails
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9, 5.10, 5.11_


  - [ ]* 16.2 Write unit tests for streaming crisis detection
    - Test crisis pattern matching with known crisis phrases
    - Test crisis detection in partial transcripts
    - Test crisis event emission with correct severity and trigger
    - Test no false positives on similar but safe phrases
    - Test crisis detection latency under 150ms budget
    - Test fail-open behavior when crisis detector encounters errors
    - Test all crisis patterns comprehensively
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.10, 5.11_

- [ ] 17. Implement parallel pipeline execution
  - [~] 17.1 Update conversation manager for parallel task execution
    - Update conversation manager to use asyncio.gather for parallel execution
    - Execute Crisis_Detector, Emotion_Fusion, and Turn_Directive generation in parallel
    - Wait for all parallel tasks to complete before LLM generation
    - Handle task failures gracefully: continue with successful task results
    - Log duration of each parallel task for latency monitoring
    - Implement task cancellation on barge-in for all parallel tasks
    - Use asyncio locking primitives to avoid race conditions
    - Enforce timeouts on all parallel tasks to prevent hanging
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12_

  - [ ]* 17.2 Write integration tests for parallel pipeline execution
    - Test parallel execution of crisis detection, emotion fusion, turn directive
    - Test pipeline continues with partial results if one task fails
    - Test task duration logging for all parallel tasks
    - Test concurrent LLM generation, TTS synthesis, audio playback
    - Test all tasks cancelled on barge-in
    - Test no race conditions with concurrent task execution
    - Test timeout enforcement prevents indefinite hanging
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 15.9, 15.10, 15.11, 15.12_

- [~] 18. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

### Phase 5: Integration, UI, and Monitoring

- [ ] 19. Implement mode switching functionality
  - [~] 19.1 Create mode switching logic in session management
    - Update `backend/app/communication/session_manager.py` to support mode switching
    - Implement `switch_mode()` method that handles Chat Mode ↔ Live Mode transitions
    - Preserve conversation history during mode switch
    - Preserve phase state during mode switch
    - Preserve emotion state during mode switch
    - Maintain same Session ID across mode switches
    - Initialize VAD and audio stream when switching to Live Mode
    - Clean up VAD and audio stream when switching to Chat Mode
    - Complete mode switch within 500ms latency budget
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13_


  - [ ]* 19.2 Write property test for mode switch state preservation
    - **Property 3: Mode Switch State Preservation**
    - **Validates: Requirements 3.13**
    - For any session state, verify switching between Chat/Live modes preserves all data
    - Use hypothesis to generate arbitrary session states (history, phase, emotion)
    - _Requirements: 3.13_

  - [ ]* 19.3 Write integration tests for mode switching
    - Test Chat Mode → Live Mode transition preserves conversation history
    - Test Live Mode → Chat Mode transition preserves conversation history
    - Test phase state preservation across mode switches
    - Test emotion state preservation across mode switches
    - Test Session ID remains constant across mode switches
    - Test VAD and audio stream initialization on switch to Live Mode
    - Test VAD and audio stream cleanup on switch to Chat Mode
    - Test mode switch completes within 500ms latency budget
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13_

- [ ] 20. Implement viseme synchronization
  - [~] 20.1 Create VisemeSyncEngine for pulse magnitude calculation
    - Create `backend/app/live/viseme_sync.py` with VisemeSyncEngine class
    - Implement `calculate_magnitude()` static method using vowel count formula
    - Formula: magnitude = min(1.0, 0.4 + vowel_count * 0.1)
    - Implement `process_word_boundary()` method that processes TTS word boundary events
    - Forward word boundary events with pulse magnitude to WebSocket client
    - Ensure word boundaries processed in order received
    - Maintain synchronization between audio playback timing and visual animation timing
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.9, 9.10_

  - [ ]* 20.2 Write property test for viseme magnitude bounds
    - **Property 8: Viseme Magnitude Formula Bounds**
    - **Validates: Requirements 9.4**
    - For any input word, verify magnitude is always in range [0.0, 1.0]
    - Use hypothesis to generate arbitrary strings (0-1000 chars)
    - _Requirements: 9.4_

  - [ ]* 20.3 Write property test for word boundary order preservation
    - **Property 9: Word Boundary Order Preservation**
    - **Validates: Requirements 9.9**
    - For any sequence of word boundary events, verify processing order matches input order
    - Use hypothesis to generate arbitrary word boundary sequences
    - _Requirements: 9.9_

  - [ ]* 20.4 Write unit tests for viseme synchronization
    - Test pulse magnitude calculation for words with different vowel counts
    - Test magnitude bounds enforcement (0.0-1.0)
    - Test word boundary event processing
    - Test magnitude calculation for edge cases (empty string, no vowels, all vowels)
    - Test word boundary order preservation
    - Test pulse animation stops when state transitions out of RESPONDING
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_


- [ ] 21. Implement error handling and recovery
  - [~] 21.1 Create error handling framework for Live Mode
    - Create `backend/app/live/error_handler.py` with error response classes
    - Define error codes for all component failures (VAD_INIT_FAILED, STT_TIMEOUT, TTS_SYNTHESIS_FAILED, etc.)
    - Implement ErrorResponse dataclass with code, message, component, recoverable, timestamp fields
    - Implement error recovery strategies: retry for transient errors, skip for recoverable errors, close for fatal errors
    - Implement graceful degradation for component failures (emotion analysis, crisis detection)
    - Emit error events to WebSocket client with descriptive messages
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.14_

  - [~] 21.2 Implement circuit breaker for external services
    - Create CircuitBreaker class in error handler module
    - Implement circuit breaker states: closed, open, half_open
    - Set failure threshold to 5 failures before opening circuit
    - Set half_open timeout to 10 seconds for recovery attempts
    - Apply circuit breaker to external service calls: STT, TTS, LLM
    - Emit service_unavailable error when circuit breaker is open
    - Reset circuit breaker after successful calls in half_open state
    - _Requirements: 13.11, 13.12, 13.13_

  - [ ]* 21.3 Write integration tests for error handling
    - Test VAD failure transitions to error state
    - Test STT timeout returns to listening state
    - Test LLM generation failure returns to listening state
    - Test TTS synthesis failure skips sentence chunk
    - Test emotion fusion failure continues with neutral emotion
    - Test crisis detector failure continues (fail-open)
    - Test WebSocket reconnection within 60s preserves session
    - Test session marked ended if reconnect fails after 60s
    - Test circuit breaker opens after 5 failures
    - Test circuit breaker resets after successful calls
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.11, 13.12, 13.13_

- [ ] 22. Implement performance monitoring and metrics
  - [~] 22.1 Create metrics collection for Live Mode pipeline
    - Create `backend/app/live/metrics.py` with metrics collection utilities
    - Track latency for each pipeline stage: VAD, STT, crisis detection, emotion fusion, turn directive, LLM first token, TTS first audio, total time-to-first-audio
    - Track total turn duration from end-of-utterance to response completion
    - Track barge-in events with partial response length and timing
    - Track latency budget violations with component breakdown
    - Track error events with codes, components, and messages
    - Store turn metrics in LiveMetrics database model
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [~] 22.2 Create Prometheus metrics endpoint
    - Create `/api/v1/metrics` endpoint exposing Prometheus format metrics
    - Expose percentile latencies (p50, p90, p95, p99) for each pipeline stage
    - Expose concurrent active Live Mode sessions count
    - Expose memory usage for audio buffers per session
    - Expose WebSocket message throughput (messages/sec, bytes/sec)
    - Include session_id, user_id, and timestamp labels for all metrics
    - _Requirements: 17.7, 17.8, 17.9, 17.10, 17.11, 17.12_


  - [ ]* 22.3 Write performance tests for latency budgets
    - Test VAD latency under 100ms budget
    - Test crisis detection latency under 150ms budget
    - Test emotion fusion latency under 150ms budget
    - Test LLM first token latency under 400ms budget
    - Test TTS first audio latency under 200ms budget
    - Test total time-to-first-audio under 1000ms budget
    - Test latency budget compliance across 100 test conversations
    - Test latency percentiles (p50, p90, p95, p99) meet targets
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7, 7.8, 7.9, 7.10, 17.8_

- [ ] 23. Ensure backward compatibility with Chat Mode
  - [~] 23.1 Verify Chat Mode functionality unchanged
    - Verify existing /ws/chat endpoint continues to work
    - Verify Chat Mode uses turn-based pipeline (not continuous)
    - Verify emotion fusion runs once per turn in Chat Mode
    - Verify crisis detection runs once per message in Chat Mode
    - Verify Chat Mode does not activate VAD or continuous audio pipeline
    - Verify Chat Mode supports text, voice (push-to-talk), and camera input
    - Verify Chat Mode state machine and turn-based conversation flow unchanged
    - Test multiple concurrent sessions with different modes
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11_

  - [ ]* 23.2 Write integration tests for Chat Mode regression
    - Test /ws/chat endpoint connection and message handling
    - Test turn-based emotion fusion in Chat Mode
    - Test turn-based crisis detection in Chat Mode
    - Test text, voice, and camera input in Chat Mode
    - Test Chat Mode latency and performance characteristics unchanged
    - Test concurrent Chat Mode and Live Mode sessions
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11_

- [ ] 24. Implement safety and privacy constraints
  - [~] 24.1 Add safety constraints to Live Mode
    - Verify non-clinical persona maintained in LLM prompts (no diagnosis, no licensed professional claims)
    - Add crisis resource information (988 Suicide and Crisis Lifeline) to crisis events
    - Add visible "AI is listening" indicator to frontend when microphone active
    - Add visible "AI is watching" indicator when camera active
    - Require explicit user opt-in before camera activation
    - Require explicit user opt-in before microphone activation
    - Implement data encryption at rest (AES-256) for session data and emotion logs
    - Implement user-triggered delete path for session data, emotion logs, audio recordings
    - Ensure Presence Visual renders as clearly-synthetic (abstract orb/hologram)
    - Do not store raw audio recordings unless user explicitly consents
    - For unauthenticated users, do not persist emotion logs or session data beyond current session
    - For crisis detections, log event but not raw transcript text unless user authenticated and consented
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10, 11.11, 11.12, 11.13, 11.14_


  - [ ]* 24.2 Write tests for safety and privacy constraints
    - Test non-clinical persona in LLM responses
    - Test crisis resource information in crisis events
    - Test microphone/camera opt-in requirements
    - Test data encryption for session data and emotion logs
    - Test user-triggered delete path for all user data
    - Test no raw audio storage without consent
    - Test no data persistence for unauthenticated users beyond session
    - Test crisis event logging without raw transcript storage
    - _Requirements: 11.1, 11.2, 11.3, 11.6, 11.7, 11.8, 11.9, 11.11, 11.13, 11.14_

- [ ] 25. Implement frontend Mode Switcher UI component
  - [~] 25.1 Create Mode Switcher React component
    - Create React component with toggle/button group for "Chat Mode" and "Live Mode"
    - Display currently active mode with visual styling (highlighted, selected)
    - Send mode_switch WebSocket message when user clicks mode toggle
    - Display loading indicator while mode switch in progress
    - Update active mode indicator when server confirms mode switch
    - Display tooltip/help text explaining difference between modes
    - Ensure keyboard accessibility (tab navigation, enter/space activation)
    - Meet WCAG 2.1 AA standards for contrast and focus indicators
    - Disable Live Mode option if device does not support microphone
    - Prevent mode switching while system is actively speaking or processing
    - Provide immediate visual feedback (<100ms) on user interaction
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8, 16.9, 16.10, 16.11, 16.12_

  - [ ]* 25.2 Write frontend tests for Mode Switcher component
    - Test component renders with both mode options
    - Test active mode visual indication
    - Test mode_switch message sent on user click
    - Test loading indicator display during mode switch
    - Test mode indicator update on server confirmation
    - Test keyboard accessibility (tab, enter, space)
    - Test contrast and focus indicators meet WCAG 2.1 AA
    - Test Live Mode disabled when microphone unavailable
    - Test mode switch prevented during active speaking/processing
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.8, 16.9, 16.10, 16.11, 16.12_

- [ ] 26. Implement Presence Visual frontend component
  - [~] 26.1 Create Presence Visual React component
    - Create abstract, clearly-synthetic animated presence (orb or hologram-style)
    - Do NOT render photorealistic human faces or bodies
    - Implement avatar state animations: idle, listening, user_speaking, thinking, responding, interrupted, error
    - Animate transitions between states smoothly within 100ms
    - Implement pulse/mouth animation synchronized to word_boundary events during responding state
    - Use pulse_magnitude from word_boundary events to drive animation intensity
    - Stop pulse animations when transitioning out of responding state
    - Render as WebGL or Canvas animation for smooth 60fps performance
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12, 9.6, 9.7, 9.8, 11.10_


  - [ ]* 26.2 Write frontend tests for Presence Visual
    - Test presence visual renders as abstract/synthetic (not photorealistic)
    - Test avatar state animations render correctly for all states
    - Test smooth state transition animations within 100ms
    - Test pulse animation driven by word_boundary events
    - Test pulse magnitude scales animation intensity
    - Test pulse animation stops when leaving responding state
    - Test animation performance meets 60fps target
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12, 9.6, 9.7, 9.8_

- [ ] 27. Implement frontend audio streaming
  - [~] 27.1 Create frontend audio capture and streaming
    - Implement microphone access with user opt-in consent
    - Capture raw PCM audio at 16kHz sample rate, 16-bit depth, mono
    - Send audio chunks via WebSocket binary frames (160-3200 bytes per chunk)
    - Implement audio chunk buffering to handle network latency
    - Display "AI is listening" indicator when microphone active
    - Handle audio permission denial gracefully
    - _Requirements: 1.1, 11.4, 11.7, 14.4_

  - [~] 27.2 Create frontend audio playback
    - Receive TTS audio chunks from WebSocket binary frames
    - Implement audio playback queue for smooth continuous playback
    - Handle audio chunk arrival and playback synchronization
    - Stop audio playback immediately on barge-in
    - _Requirements: 6.5, 6.6_

  - [ ]* 27.3 Write frontend tests for audio streaming
    - Test microphone access with user opt-in
    - Test audio capture at correct format (16kHz, 16-bit, mono)
    - Test audio chunk transmission via WebSocket
    - Test "AI is listening" indicator display
    - Test audio permission denial handling
    - Test TTS audio playback
    - Test audio playback cancellation on barge-in
    - _Requirements: 1.1, 11.4, 11.7, 14.4, 6.5, 6.6_

- [~] 28. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

### Phase 6: End-to-End Testing and Documentation

- [ ] 29. Implement end-to-end integration tests
  - [ ]* 29.1 Write complete user journey tests
    - Test complete Live Mode conversation: user speaks → VAD → STT → emotion → LLM → TTS → audio
    - Test partial transcript streaming to frontend
    - Test emotion updates streaming to frontend
    - Test crisis detection triggers appropriate response
    - Test barge-in interrupts AI response mid-sentence
    - Test mode switch preserves conversation history
    - Test viseme sync word boundaries drive presence visual animation
    - Test session state persistence across WebSocket reconnections
    - _Requirements: All requirements end-to-end validation_


  - [ ]* 29.2 Write performance and load tests
    - Test 50 concurrent Live Mode sessions
    - Test latency degradation under load (< 2x latency budget)
    - Test memory usage for audio buffers stays within limits
    - Test WebSocket message throughput under load
    - Test system handles barge-ins under concurrent load
    - _Requirements: 7.12, 17.9, 17.10, 17.11_

  - [ ]* 29.3 Write accessibility and safety tests
    - Test keyboard navigation through Mode Switcher and UI controls
    - Test WCAG 2.1 AA compliance for contrast and focus indicators
    - Test microphone/camera opt-in flows
    - Test "AI is listening" and "AI is watching" indicators
    - Test crisis detection and resource provision
    - Test non-clinical persona maintained in all responses
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 16.8, 16.9_

- [ ] 30. Create developer documentation
  - [~] 30.1 Write API documentation for Live Mode
    - Document /ws/live WebSocket endpoint and message protocol
    - Document all message types and schemas (client → server, server → client)
    - Document avatar state machine transitions
    - Document error codes and recovery strategies
    - Document latency budgets and performance targets
    - Document configuration options for VAD, STT, TTS providers
    - _Requirements: All requirements_

  - [~] 30.2 Write deployment and operations guide
    - Document infrastructure requirements (CPU, memory, network)
    - Document external service dependencies (Deepgram, ElevenLabs, etc.)
    - Document environment variables and configuration
    - Document monitoring and alerting setup (Prometheus metrics)
    - Document database migration steps
    - Document rollback procedures
    - _Requirements: All requirements_

  - [~] 30.3 Write user guide for Live Mode
    - Document how to switch between Chat Mode and Live Mode
    - Document microphone and camera permissions
    - Document presence visual states and what they mean
    - Document barge-in behavior and how to interrupt AI
    - Document crisis detection and resource information
    - Document privacy and data handling policies
    - _Requirements: 3.1, 11.3, 11.4, 11.5, 11.6, 11.9, 16.7_

- [ ] 31. Final integration and smoke testing
  - [~] 31.1 Run complete test suite
    - Run all unit tests (target 90% code coverage)
    - Run all property-based tests (12 properties)
    - Run all integration tests
    - Run all end-to-end tests
    - Run performance and load tests
    - Verify all tests pass
    - _Requirements: All requirements_

  - [~] 31.2 Conduct manual smoke testing
    - Test Live Mode activation and deactivation
    - Test basic conversation flow
    - Test barge-in behavior
    - Test mode switching
    - Test error scenarios and recovery
    - Test on different browsers and devices
    - Verify presence visual animations
    - Verify audio quality and latency
    - _Requirements: All requirements_


- [~] 32. Final checkpoint and handoff
  - Ensure all tests pass, ask the user if questions arise.
  - Review all 17 requirements and 212 acceptance criteria for coverage
  - Verify all 12 property-based tests are implemented and passing
  - Verify latency budgets met (time-to-first-audio < 1000ms)
  - Verify backward compatibility with Chat Mode maintained
  - Verify safety and privacy constraints implemented
  - Prepare feature for production deployment

## Notes

- **Tasks marked with `*` are optional** and can be skipped for faster MVP delivery
- **Property-based tests** validate universal correctness properties using hypothesis library
- **Unit tests** validate specific examples and edge cases for each component
- **Integration tests** validate component interactions and external service behavior
- **End-to-end tests** validate complete user journeys through the system
- **Performance tests** validate latency budgets and system behavior under load
- Each task references specific requirements for traceability (e.g., _Requirements: 1.2, 1.3_)
- Checkpoints ensure incremental validation at major milestones
- All audio processing runs server-side to avoid frontend conflicts
- Parallel execution optimizes latency where possible
- Error handling ensures graceful degradation for component failures
- Mode switching preserves session state for seamless transitions

## Requirements Coverage Summary

This task list implements all 17 requirements with 212 acceptance criteria:

1. **Full-Duplex Audio Pipeline** (Req 1): Tasks 5-8, 13
2. **Presence Visual** (Req 2): Tasks 1, 26
3. **Mode Switcher** (Req 3): Tasks 19, 25
4. **Continuous Emotion Fusion** (Req 4): Task 15
5. **Streaming Crisis Detection** (Req 5): Task 16
6. **Sentence-Level Streaming** (Req 6): Tasks 10-12
7. **Latency Budget** (Req 7): Tasks 17, 22
8. **WebSocket Protocol** (Req 8): Task 2
9. **Viseme Synchronization** (Req 9): Task 20
10. **Session State Continuity** (Req 10): Tasks 3, 19
11. **Safety and Privacy** (Req 11): Task 24
12. **Backward Compatibility** (Req 12): Task 23
13. **Error Handling** (Req 13): Task 21
14. **Audio Stream Ownership** (Req 14): Task 5
15. **Parallel Pipeline** (Req 15): Task 17
16. **Mode Switcher UI** (Req 16): Task 25
17. **Performance Monitoring** (Req 17): Task 22

## Property-Based Tests Coverage

This task list includes all 12 properties from the design document:

1. **Property 1: Barge-in Buffer Clearing** (Task 13.2) - Validates Req 1.6
2. **Property 2: State Transition Event Emission** (Task 1.2) - Validates Req 2.11
3. **Property 3: Mode Switch State Preservation** (Task 19.2) - Validates Req 3.13
4. **Property 4: Emotion Fusion Weight Calculation** (Task 15.2) - Validates Req 4.8
5. **Property 5: Rolling Window Temporal Eviction** (Task 15.3) - Validates Req 4.9
6. **Property 6: Sentence Boundary Round-Trip** (Task 10.2) - Validates Req 6.2
7. **Property 7: Sentence Order Preservation** (Task 10.3) - Validates Req 6.12
8. **Property 8: Viseme Magnitude Bounds** (Task 20.2) - Validates Req 9.4
9. **Property 9: Word Boundary Order** (Task 20.3) - Validates Req 9.9
10. **Property 10: History Size Limit** (Task 3.2) - Validates Req 10.8
11. **Property 11: Session State Consistency** (Covered by integration tests) - Validates Req 10.13
12. **Property 12: Audio Buffer Size Limit** (Task 5.2) - Validates Req 14.11


## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.4", "2.2"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "1.3", "1.5", "2.1", "3.1"]
    },
    {
      "id": 2,
      "tasks": ["2.3", "3.2", "3.3"]
    },
    {
      "id": 3,
      "tasks": ["5.1", "6.1", "7.1"]
    },
    {
      "id": 4,
      "tasks": ["5.2", "5.3", "6.2", "7.2"]
    },
    {
      "id": 5,
      "tasks": ["8.1"]
    },
    {
      "id": 6,
      "tasks": ["8.2"]
    },
    {
      "id": 7,
      "tasks": ["10.1", "11.1"]
    },
    {
      "id": 8,
      "tasks": ["10.2", "10.3", "10.4", "11.2"]
    },
    {
      "id": 9,
      "tasks": ["12.1"]
    },
    {
      "id": 10,
      "tasks": ["12.2", "13.1"]
    },
    {
      "id": 11,
      "tasks": ["13.2", "13.3"]
    },
    {
      "id": 12,
      "tasks": ["15.1", "16.1", "17.1"]
    },
    {
      "id": 13,
      "tasks": ["15.2", "15.3", "15.4", "16.2", "17.2"]
    },
    {
      "id": 14,
      "tasks": ["19.1", "20.1", "21.1", "22.1"]
    },
    {
      "id": 15,
      "tasks": ["19.2", "19.3", "20.2", "20.3", "20.4", "21.2", "22.2"]
    },
    {
      "id": 16,
      "tasks": ["21.3", "22.3", "23.1"]
    },
    {
      "id": 17,
      "tasks": ["23.2", "24.1"]
    },
    {
      "id": 18,
      "tasks": ["24.2", "25.1", "26.1", "27.1", "27.2"]
    },
    {
      "id": 19,
      "tasks": ["25.2", "26.2", "27.3"]
    },
    {
      "id": 20,
      "tasks": ["29.1", "29.2", "29.3", "30.1", "30.2", "30.3"]
    },
    {
      "id": 21,
      "tasks": ["31.1", "31.2"]
    }
  ]
}
```
