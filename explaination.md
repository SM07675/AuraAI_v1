# 🌸 Aura AI 2.0 — Comprehensive Technical Explanation & System Reference

---

## 1. Executive Summary & Mission

**Aura AI 2.0** is an **emotion-aware, multimodal AI clinical companion and cognitive counseling platform**. Traditional conversational AI agents operate exclusively in the textual or acoustic domain; they cannot perceive non-verbal cues, micro-expressions, facial action units, or physiological markers of distress. Furthermore, typical chatbots suffer from conversational amnesia and tend to deliver generic, unsolicited advice prematurely.

Aura AI 2.0 bridges this gap by unifying:
1. **Real-time Computer Vision**: 478 3D facial landmarks, 52 ARKit blendshapes, and FACS (Facial Action Coding System) Action Units running at sub-10ms CPU latency.
2. **Full-Duplex Speech & Acoustic Intelligence**: Live Web Audio echo cancellation, RMS energy tracking, speech-to-text with continuous background resilience, and sub-200ms conversational barge-in / interruption handling.
3. **Cognitive Memory & Knowledge Graph**: PostgreSQL-backed episodic memory, entity-relationship triples, and hybrid vector retrieval for long-term therapeutic continuity.
4. **Clinical Phase-Context Engine (APCE)**: Therapeutic state progression (`check_in` $\rightarrow$ `explore` $\rightarrow$ `identify` $\rightarrow$ `offer` $\rightarrow$ `wrap_up`) with a strict **Context Sufficiency Gate** ensuring clinical interventions (CBT reframing, somatic pacing, grounding) are delivered only when substantial context is established.
5. **Hardware Lifecycle & Privacy Protection**: Automatic, hardware-level shutdown of camera and microphone streams when the session concludes.
6. **Tactile 3D Claymorphic Interface**: An intuitive, calming user experience utilizing soft-clay depth, custom 3D iconography, and responsive telemetry HUDs.

---

## 2. End-to-End System Architecture

```
                                  USER DEVICE (Webcam & Microphone)
                                                  │
                 ┌────────────────────────────────┴────────────────────────────────┐
                 │                                                                 │
                 ▼ (2 FPS Canvas 480x360 Frames)                                   ▼ (Full-Duplex Speech & Audio)
┌──────────────────────────────────────────────────┐             ┌──────────────────────────────────────────────────┐
│          Visual Emotion Pipeline                 │             │            Acoustic & Speech Pipeline            │
│  - MediaPipe Tasks Vision (478 3D Mesh)          │             │  - WebAudioEngine (AEC, RMS Energy Correlator)   │
│  - FACS Action Units (AU04, AU06, AU12, AU45)    │             │  - SpeechRecognitionService (Auto-restart STT)   │
│  - Head Pose (OpenCV SolvePnP: Pitch, Yaw, Roll) │             │  - DuplexManager (Barge-in / Interruption engine)│
│  - Gaze Vector & Attention Scoring               │             │  - StreamingTtsService (Microsoft Edge-TTS)      │
│  - FERPlus ONNX 8-Class Deep Emotion Network     │             │  - Hardware Stream Teardown (Mic Track Stop)     │
└────────────────────────┬─────────────────────────┘             └────────────────────────┬─────────────────────────┘
                         │                                                                │
                         ▼ (Base64 JPEG / WebSocket)                                      ▼ (Text Utterance & Events)
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       FastAPI Gateway & WebSocket Server (:8000)                                  │
│         /api/v1/emotion/ws (Vision Stream)                            /api/v1/ws/chat (Duplex Streaming Chat)     │
└────────────────────────┬────────────────────────────────────────────────────────────────┬─────────────────────────┘
                         │                                                                │
                         ▼                                                                ▼
┌──────────────────────────────────────────────────┐             ┌──────────────────────────────────────────────────┐
│           FaceBehaviorService (Backend)          │             │         ConversationService (Turn Orchestrator)  │
│  - 7-Factor Quality Calibration                  │             │  - User Authentication & Session Validation      │
│  - EMA Temporal Smoothing (alpha = 0.35)         │             │  - WebSocket streaming generator & chunking      │
│  - Affective Discrepancy Detection               │             │  - Solution card & crisis event dispatch         │
└────────────────────────┬─────────────────────────┘             └────────────────────────┬─────────────────────────┘
                         │                                                                │
                         └────────────────────────────────┬───────────────────────────────┘
                                                          │
                                                          ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                         AI Core & Clinical Reasoning Layer                                        │
│  ┌─────────────────────────────────┐   ┌──────────────────────────────────┐   ┌────────────────────────────────┐  │
│  │   ContextSufficiencyTracker     │   │     TurnDirectiveClassifier      │   │        SolutionEngine          │  │
│  │  - 6 clinical context dimensions│   │   - Active clinical phase routing│   │  - Structured Solution Schema  │  │
│  │  - Gate: Turn >= 3, domains,    │   │   - Emotion discrepancy handling │   │  - CBT Cognitive Reframing     │  │
│  │    blockers known, score >= 0.65│   │   - Empathetic counselor steering│   │  - 4-4-4-4 Box Breathing       │  │
│  │  - Instant panic/request paths  │   │   - Mandatory session closing dir│   │  - 5-4-3-2-1 Sensory Grounding │  │
│  └─────────────────────────────────┘   └──────────────────────────────────┘   └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┬─────────────────────────────────────────────────────────┘
                                                          │
                         ┌────────────────────────────────┴────────────────────────────────┐
                         │                                                                 │
                         ▼                                                                 ▼
┌──────────────────────────────────────────────────┐             ┌──────────────────────────────────────────────────┐
│       Cognitive Memory & Knowledge Graph         │             │           Resilient Multi-LLM Gateway            │
│  - PostgreSQL 16 Relational & Graph Storage      │             │  - Primary: NVIDIA NIM (Llama-3.2/Nemotron-70B)  │
│  - Entity-Relationship Engine (Triples)          │             │  - Fallbacks: Google Gemini 1.5, OpenAI GPT-4o   │
│  - Hybrid Retrieval (Dense Vectors + BM25)       │             │  - Autonomous Circuit Breaker (Auto-failover)    │
│  - Rolling Session Summarizer (Turn count >= 6)  │             │  - Dynamic Clinical Prompt Builder               │
└──────────────────────────────────────────────────┘             └──────────────────────────────────────────────────┘
```

---

## 3. Visual Emotion & FACS Telemetry Pipeline

The visual perception system operates across client-side canvas capture and backend neural inference.

### 3.1 Google MediaPipe Tasks 3D Mesh Alignment
- **Frame Ingestion**: Captured from the webcam via an off-screen HTML5 `<canvas>` at 480x360 resolution and 2 FPS, encoded to Base64 JPEG.
- **Landmark Extraction**: Detects **478 3D facial landmarks** ($X, Y, Z$) normalized to camera coordinates with sub-10ms CPU inference.
- **Blendshapes**: Extracts **52 ARKit-compatible blendshape scores** ($0.0$ to $1.0$), capturing subtle muscular displacements (e.g., `eyeBlinkLeft`, `jawOpen`, `mouthSmileRight`).

### 3.2 FACS Action Unit (Facial Action Coding System) Computation
The system translates geometric distances and blendshapes into standardized clinical Action Units:
- **AU12 (Lip Corner Puller / Zygomaticus Major)**:
  Measures smile activation intensity ($0.0$ to $5.0$). Computed from the Euclidean distance between outer lip corners (landmarks 61 and 291) normalized by inter-canthal distance (landmarks 33 and 263), cross-referenced with `mouthSmileLeft` and `mouthSmileRight` blendshapes.
- **AU06 (Cheek Raiser / Orbicularis Oculi)**:
  Distinguishes a genuine **Duchenne smile** from a social or masked smile. Measures the narrowing of the eye aperture and elevation of the infraorbital cheek fold.
- **AU04 (Brow Lowerer / Corrugator Supercilii)**:
  Measures medial brow furrowing, indexing cognitive strain, confusion, frustration, or negative valence. Computed via vertical distance reduction between medial brow points (landmarks 55, 285) and the nasal bridge (landmark 168).
- **AU45 (Blink Rate & EAR)**:
  Computes the **Eye Aspect Ratio (EAR)**:
  $$\text{EAR} = \frac{\|p_2 - p_6\| + \|p_3 - p_5\|}{2 \|p_1 - p_4\|}$$
  Monitors blinks per minute (BPM), prolonged closures ($> 400\text{ms}$ flagging fatigue or distress), and micro-flutters.
- **AU01 (Inner Brow Raiser)** & **AU26 (Jaw Drop)**:
  Indicators of surprise, shock, and vocal engagement.

### 3.3 3D Head Pose Estimation (OpenCV `SolvePnP`)
By registering 6 key 3D anatomical points (nose tip, chin, left eye pupil, right eye pupil, left mouth corner, right mouth corner) against a canonical 3D facial model, the system solves the Perspective-n-Point problem using Levenberg-Marquardt optimization. It derives 3 Euler angles:
- **Pitch**: Head nod up/down ($\pm 45^\circ$). Indicates agreement or downward withdrawal.
- **Yaw**: Head turn left/right ($\pm 60^\circ$). Indicates distraction or looking away.
- **Roll**: Head tilt lateral ($\pm 30^\circ$). Indicates empathy, curiosity, or confusion.

### 3.4 Gaze & Attention Vector Scoring
Calculates horizontal and vertical pupil displacement relative to the internal and external eye canthi, categorizing user gaze into:
- **Attentive / Direct Eye Contact**: Fostering therapeutic alliance.
- **Averted / Downcast**: Associated with shame, sadness, or intense memory recall.
- **Distracted / Sideways**: Tracking attention drift.

### 3.5 FERPlus ONNX Deep Neural Classification
- Frames are cropped to the face bounding box, converted to $64 \times 64$ grayscale, normalized, and evaluated using the **FERPlus ONNX** deep convolutional network.
- Outputs probabilities across 8 discrete emotions: *Joy, Calm, Sadness, Anger, Surprise, Fear, Disgust, Neutral*.
- **Temporal EMA Smoothing**: To avoid erratic label flipping, output probabilities are smoothed across frames:
  $$P_t = \alpha \cdot P_{\text{raw}} + (1 - \alpha) \cdot P_{t-1} \quad (\alpha = 0.35)$$

### 3.6 7-Factor Tracking Quality Calibration
Before telemetry is accepted as valid, the frame is scored against 7 physical criteria:
1. **Luminance**: Detects under-exposure or washed-out lighting.
2. **Contrast**: Validates dynamic range across face pixels.
3. **Sharpness / Laplacian Variance**: Flags motion blur and out-of-focus webcams.
4. **Face Scale**: Ensures face occupies at least $15\%$ of frame area.
5. **Head Angle Limits**: Discards frames where extreme yaw ($> 45^\circ$) obscures key landmarks.
6. **Detection Confidence**: MediaPipe threshold $> 0.65$.
7. **Temporal Landmark Jitter**: Discards erratic sensor blips.

---

## 4. Acoustic, Voice & Full-Duplex Engine

Located in `frontend/src/app/services/` and `backend/app/services/`:

### 4.1 Acoustic Echo Cancellation & Energy Correlation
`audioEngine.ts` implements a Web Audio processing pipeline:
- Holds an active `MediaStream` and routes it through a `MediaStreamAudioSourceNode` into an `AnalyserNode`.
- Runs a 50 Hz analysis loop computing root-mean-square (RMS) energy.
- Enables hardware-accelerated acoustic echo cancellation (`echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: true`).

### 4.2 Resilient Speech-to-Text (`SpeechRecognitionEngine`)
- Manages the browser's `webkitSpeechRecognition` / `SpeechRecognition` interface.
- Employs an intentional desired-state flag (`isListeningDesired`). If the browser closes the recognition stream due to network or silence timeouts, an exponential backoff loop automatically restarts it without user intervention.
- Delivers interim transcripts for real-time visual feedback and final transcripts for turn submission.

### 4.3 Sub-200ms Barge-In & Interruption Handling (`DuplexManager`)
The state machine coordinates 4 operational states:
$$\text{IDLE} \longleftrightarrow \text{LISTENING} \longleftrightarrow \text{PROCESSING} \longleftrightarrow \text{SPEAKING}$$
- When Dr. Aura is in the `SPEAKING` state and user speech energy crosses the VAD threshold, `duplexManager`:
  1. Triggers immediate local cancellation of `StreamingTtsService` audio playback.
  2. Dispatches a WebSocket `{ "type": "interrupt" }` packet to the backend.
  3. The backend halts LLM generation and discards remaining unstreamed tokens.
  4. Transitions state machine immediately to `LISTENING`.

### 4.4 Hardware Lifecycle & Privacy Teardown
To protect user privacy, the platform enforces strict hardware teardown:
- `audioEngine.stopMicrophonePipeline()` disconnects Web Audio nodes, clears analysis intervals, and calls `.stop()` on every `MediaStreamTrack` in `micStream`. The browser's recording indicator turns completely off.
- `FaceToFaceScreen.tsx`'s `stopCamera()` iterates over video tracks and calls `.stop()`, clearing `videoRef.current.srcObject` and halting the 2 FPS frame capture timer.
- Both devices remain completely offline until the user explicitly clicks **"Start Camera"** or the **Microphone** button.

---

## 5. Cognitive Architecture: Memory & Knowledge Graph

Located in `backend/app/memory/` and `backend/app/knowledge/`:

### 5.1 Relational & Semantic Memory Schema (PostgreSQL 16)
Memories are stored in structured database tables:
- **`Memory` Table**:
  - `user_id`: Foreign key to user record.
  - `category`: `goal`, `relationship`, `health`, `work`, `emotional_pattern`, `preference`.
  - `content`: Natural language description of the remembered fact.
  - `importance`: Float $0.0$ to $1.0$.
  - `access_count`: Increments upon each retrieval.
  - `last_accessed_at`: Timestamp tracking memory recency.
  - `created_at`: Creation timestamp.

### 5.2 Entity-Relationship Knowledge Graph
Aura constructs a continuous semantic graph from user interactions:
- **`KnowledgeNode`**: Represents distinct entities (e.g., `"Sarah"`, `"Stanford Medical School"`, `"Anxiety"`, `"Late-Night Coding"`).
- **`KnowledgeEdge`**: Represents directed relationships with confidence weights (e.g., `User` $\xrightarrow{\text{stressed\_by}}$ `Job Interview`, `User` $\xrightarrow{\text{coping\_mechanism}}$ `Box Breathing`).
- **Graph Traversal**: During turn routing, the engine executes multi-hop graph queries to resolve contextual references (e.g., when the user says *"She called me again today"*, the graph identifies *"She"* refers to *"Sarah (ex-partner)"*).

### 5.3 Hybrid Vector & Lexical Retrieval
When a user turn arrives:
1. Dense vector embeddings are generated for the user's message.
2. Cosine similarity matches the message against historical memories.
3. BM25 sparse keyword search queries entity tables for specific named mentions.
4. Top results are combined via Reciprocal Rank Fusion (RRF) and formatted into concise memory prompts injected into the LLM context.

### 5.4 Rolling Session Summarizer (`ConversationSummarizer`)
Every 6–8 turns (or upon session close), an async background worker summarizes the dialogue into a clinical progress note:
- **Identified Issues**: Core themes discussed.
- **Emotional Trajectory**: Progression of affective states from opening to close.
- **Agreed Interventions**: Techniques practiced (e.g., 4-3-5 breathing).
- **Open Threads**: Topics to revisit during the next consultation.
Stored in `Session.summary` for instant restoration across visits.

---

## 6. Clinical Reasoning & Adaptive Phase Engine (APCE)

Located in `backend/app/ai/`:

### 6.1 Clinical Phase Progression
Aura models therapeutic stages:
1. **`check_in`**: Warm, non-demanding opening. Focuses on rapport and present-moment check-in.
2. **`explore`**: Open-ended questions exploring feelings, recent events, and thoughts.
3. **`identify`**: Clarifying specific stressors, cognitive distortions, or somatic tension.
4. **`offer`**: Providing structured, evidence-based tools (CBT reframing, somatic pacing).
5. **`wrap_up`**: Reviewing takeaways, reinforcing positive coping, and closing warmly.

### 6.2 Context Sufficiency Tracker (`context_tracker.py`)
To prevent premature or inappropriate solution delivery, Aura computes a **Sufficiency Score** ($0.0$ to $1.0$) across 6 clinical dimensions:
1. `emotion_state`: Primary emotion verified (via text or FACS).
2. `problem_domain`: Clear stressor domain identified (work, relationship, health, grief, academics).
3. `blockers_known`: Specific causal obstacle articulated (e.g., *"because my manager rejected my proposal"*).
4. `coping_history`: Prior coping efforts or current support system explored.
5. `user_goal`: The user's desired outcome for the interaction established.
6. `severity_level`: Stress and emotional intensity calibrated.

#### Substantial Context Gate (Mandatory Rules for Unsolicited Solutions):
```python
substantial_context_met = (
    turn_count >= 3
    and resolved["problem_domain"]
    and resolved["blockers_known"]
    and score >= 0.65
)
```
- On **Turn 1 or 2**, Aura **never** offers unsolicited solutions, preventing jarring interventions (such as prescribing teamwork advice for general sadness).
- Static database profile goals do not count as active context on Turn 1.
- **Fast-Paths**: The gate is bypassed immediately if:
  - The user explicitly requests advice (*"What should I do?"*, *"Help me calm down"*).
  - Acute somatic panic is detected (*"I'm having a panic attack"*, *"Can't breathe"*).

### 6.3 Structured Solution Schema (SSS - `solution_engine.py`)
When triggered, `SolutionEngine` generates structured JSON solution cards parsed into interactive UI elements:
- **CBT Cognitive Restructuring**:
  Identifies the automatic negative thought (e.g., *"I'm going to fail this interview and ruin my career"*), labels the cognitive distortion (*Catastrophizing*), and provides an actionable rational reframe.
- **4-3-5 Vagus Nerve Regulation**:
  Clinical somatic breathing protocol (4s Inhale, 3s Hold, 5s Exhale) that activates parasympathetic vagal braking.
- **5-4-3-2-1 Sensory Grounding**:
  Multi-sensory engagement protocol (5 things you see, 4 you feel, 3 you hear, 2 you smell, 1 you taste) to interrupt acute dissociative anxiety.
- **Behavioral Activation**:
  Deconstructs overwhelming obligations into a single, low-friction 5-minute action step.

### 6.4 Safety, Self-Harm & Crisis Interceptor
Aura continuously monitors for suicide risk, self-harm, and violence. If detected:
1. Normal LLM generation is immediately aborted.
2. The turn directive triggers an emergency protocol.
3. Empathetic, de-escalating text is output along with verified crisis resources (e.g., *988 Suicide & Crisis Lifeline*, *Crisis Text Line*).
4. The conversation is flagged in the database for clinician review.

### 6.5 Session Closing Detection & Directive Override
Recognizes ending phrases (e.g., *"nothing more for today"*, *"end the conversation"*, *"close session"*, *"goodbye"*):
- Switches session phase to `wrap_up`.
- Enforces `SESSION CLOSING DIRECTIVE (MANDATORY OVERRIDE)`: Dr. Aura is instructed to **never ask follow-up questions**, validate progress, and deliver a clean, supportive farewell.
- Emits a WebSocket `session_closing` event, prompting the frontend to shut down camera and microphone hardware.

---

## 7. Resilient Multi-Provider AI Gateway

Located in `backend/app/providers/`:

```
               Prompt + FACS Telemetry + Memory Context
                                  │
                                  ▼
                 ┌────────────────────────────────┐
                 │    Circuit Breaker Engine      │
                 └──────────────┬─────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼ (State: CLOSED)      ▼ (State: OPEN/TRIP)   ▼ (Fallback 2)
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│    NVIDIA NIM     │  │   Google Gemini   │  │    OpenAI GPT     │
│   (Meta-Llama)    │  │    (1.5-Flash)    │  │      (GPT-4o)     │
└───────────────────┘  └───────────────────┘  └───────────────────┘
```

1. **NVIDIA NIM Microservices**:
   - Primary provider for enterprise streaming performance, utilizing `meta/llama-3.2-11b-vision-instruct` or `nvidia/llama-3.1-nemotron-70b-instruct`.
2. **Autonomous Circuit Breaker**:
   - Evaluates consecutive failures, HTTP 429 rate limits, and latency spikes.
   - If the failure threshold is exceeded, the circuit trips (`OPEN`) and immediately routes requests to **Google Gemini** or **OpenAI**.
   - After a 60-second cooldown, sends a canary request (`HALF-OPEN`) to test primary provider recovery.
3. **SSE & WebSocket Token Streaming**:
   - Chunks are yielded word-by-word with sequence counters over WebSocket, driving real-time typewriter typography and neural text-to-speech audio synthesis.

---

## 8. Frontend Architecture & Tactile 3D Claymorphic Interface

Built using **React 18.3**, **TypeScript 5.0**, **Tailwind CSS 4**, and **Framer Motion**, the frontend implements a custom **3D Tactile Claymorphism** design system.

### 8.1 Claymorphic Visual System
- **Dual Lighting & Specular Profiles**:
  - *Light Theme*: Warm pastel cream base (`#F8F3F0`), diffuse specular glints (`inset 0 1.5px 3px rgba(255,255,255,0.9)`), and soft drop shadows (`0 8px 22px rgba(120,95,140,0.12)`).
  - *Dark Theme*: Deep obsidian midnight palette (`#12101B` / `#171424`), subtle edge luminescence, and high-contrast pastel accent badges.
- **Organic Micro-Interactions**: Spring physics (`stiffness: 400`, `damping: 28`) on buttons, tiles, and modals.

### 8.2 Application Consoles & Screens
1. **Dashboard (`HomeScreen` / `DashboardScreen`)**:
   - **Hero Greeting**: Personalized greeting with interactive 3D robot mascot (`AuraMascot3D`).
   - **Mood Trajectory Card**: 7-day mood score graph with calm streaks.
   - **Today's Insights**: Interactive donut chart visualizing affective distribution.
   - **4 Quick Action Tiles**: **Journal** (Chat), **Breathing** (Voice), **Focus** (Pomodoro), and **Consult** (Face-to-Face).
2. **Face-to-Face Consultation (`FaceToFaceScreen.tsx`)**:
   - **Patient Visual Stream**: 480x360 webcam feed with landmark canvas, live FPS meter, and offline state placeholder.
   - **FACS Debug Panel & Telemetry HUD**: Expandable clinical overlay displaying AU12 smile intensity, AU04 brow furrow, AU45 blink rate/EAR, and 3D head pose Euler angles (Pitch, Yaw, Roll).
   - **Doctor Aura 3D Avatar**: Responsive 3D mascot with animated facial expressions matching conversational tone.
   - **Dynamic Transcription & Chat Stream**: Real-time transcript with inline SSS Solution Cards.
   - **Automatic Privacy Banner**: Appears when the session closes, confirming hardware shutdown.
3. **Voice Mode (`VoiceScreen.tsx`)**:
   - Hands-free speech consultation with reactive audio wave visualizers, language selectors (English, Hindi, Spanish, French, German, Japanese), and edge-to-edge voice streaming.
4. **Chat Mode (`ChatScreen`)**:
   - Empathetic text dialogue featuring memory tags, clinical phase badges, interactive CBT solution cards, and crisis safety alerts.
5. **Memory Console (`MemoryScreen.tsx`)**:
   - Knowledge repository displaying long-term memories, entity connections, category filters, importance meters, and manual memory creation tools.
6. **Analytics Console (`AnalyticsScreen.tsx`)**:
   - Deep affective telemetry: weekly mood charts, calm streaks, emotion distribution bars, and diagnostic reports powered by Recharts.
7. **Debug Telemetry Panel (`DebugScreen.tsx`)**:
   - Diagnostic console for clinicians and developers: real-time Action Unit sliders, raw WebSocket payload inspectors, and provider circuit breaker status indicators.

---

## 9. API & WebSocket Specifications

### 9.1 REST Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | System health check (PostgreSQL, Redis, AI Gateway). |
| `POST` | `/api/v1/sessions` | Initializes a new clinical consultation session. |
| `GET` | `/api/v1/sessions/{id}` | Retrieves session details and rolling summary. |
| `GET` | `/api/v1/memory` | Lists user episodic memories with category and importance filters. |
| `POST` | `/api/v1/memory` | Creates a new explicit user memory. |
| `DELETE` | `/api/v1/memory/{id}` | Deletes a stored memory. |
| `GET` | `/api/v1/analytics/overview` | Retrieves mood index, dominant emotions, and weekly calm streaks. |
| `GET` | `/api/v1/analytics/emotion_history` | Historical timeline of fused multimodal emotion states. |
| `GET` | `/api/v1/users/me` | Current authenticated user profile, goals, and clinical preferences. |
| `PUT` | `/api/v1/users/me` | Updates user goals, name, and notification settings. |
| `POST` | `/api/v1/tts/synthesize` | Fallback REST neural text-to-speech synthesis (WAV/MP3). |

### 9.2 WebSocket Protocols

#### Chat & Duplex WebSocket: `/api/v1/ws/chat`
- **Client $\rightarrow$ Server**:
  ```json
  {
    "type": "message",
    "content": "I'm feeling really stressed about tomorrow's presentation",
    "session_id": 42,
    "client_turn_id": 1,
    "mode": "face_to_face",
    "language": "en-US",
    "emotion_data": {
      "face_emotion": "fear",
      "confidence": 0.84,
      "action_units": { "AU04": 2.4, "AU12": 0.1, "AU45": 28.0 },
      "head_pose": { "pitch": -4.2, "yaw": 2.1, "roll": 0.8 }
    }
  }
  ```
  *(Or `{"type": "interrupt"}` for user barge-in)*
- **Server $\rightarrow$ Client**:
  - `{"type": "chunk", "content": "I hear ", "sequence": 1}`
  - `{"type": "solution_card", "solution": { "category": "cbt_reframe", ... }}`
  - `{"type": "session_closing", "phase": "wrap_up"}`
  - `{"type": "done", "response": "...", "is_closing": true, "phase": "wrap_up"}`

#### Emotion Vision Stream WebSocket: `/api/v1/emotion/ws`
- **Client $\rightarrow$ Server**:
  ```json
  {
    "type": "frame",
    "image": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
    "session_id": 42,
    "timestamp": 1725400000000
  }
  ```
- **Server $\rightarrow$ Client**:
  ```json
  {
    "type": "emotion",
    "face_detected": true,
    "primary_emotion": "calm",
    "confidence": 0.88,
    "tracking_quality": 0.94,
    "action_units": {
      "AU12": 0.2,
      "AU04": 0.0,
      "AU06": 0.1,
      "AU45_blink_rate": 16.5
    },
    "head_pose": { "pitch": 1.2, "yaw": -0.8, "roll": 0.3 },
    "gaze": { "eye_contact": true, "gaze_angle_x": 1.4 }
  }
  ```

---

## 10. Database Schema & Data Models

PostgreSQL 16 relational tables defined via SQLAlchemy Async (`backend/app/models/`):

1. **`User`**: Core patient/user model (`id`, `email`, `name`, `hashed_password`, `goals`, `interests`, `created_at`).
2. **`Session`**: Interaction sessions (`id`, `user_id`, `mode`, `phase`, `summary`, `created_at`, `closed_at`).
3. **`Message`**: Conversational turns (`id`, `session_id`, `user_id`, `role`, `content`, `ai_provider`, `sentiment`, `emotion`, `created_at`).
4. **`Memory`**: Long-term semantic facts (`id`, `user_id`, `category`, `content`, `importance`, `access_count`, `last_accessed_at`).
5. **`KnowledgeNode`**: Graph entities (`id`, `user_id`, `name`, `entity_type`, `properties`, `created_at`).
6. **`KnowledgeEdge`**: Graph relationships (`id`, `user_id`, `source_node_id`, `target_node_id`, `relation_type`, `weight`).
7. **`EmotionLog`**: Time-series biometric logs (`id`, `session_id`, `user_id`, `primary_emotion`, `confidence`, `action_units`, `head_pose`, `tracking_quality`, `timestamp`).

---

## 11. Codebase Directory Map

```
d:\AuraAI_v1\
├── backend/
│   ├── app/
│   │   ├── ai/
│   │   │   ├── context_tracker.py       # Context Sufficiency Tracker (Substantial context gate)
│   │   │   ├── conversation_engine.py   # Multi-turn dialogue coordinator & safety interceptor
│   │   │   ├── solution_engine.py       # Structured Solution Schema (CBT, somatic pacing)
│   │   │   └── turn_directive.py        # Clinical phase routing & classification
│   │   ├── api/v1/
│   │   │   ├── analytics.py             # Telemetry & mood overview endpoints
│   │   │   ├── dashboard.py             # Dashboard aggregations
│   │   │   ├── emotion_ws.py            # Real-time WebSocket vision frame processor
│   │   │   ├── memory.py                # Memory CRUD endpoints
│   │   │   ├── users.py                 # Profile & user management
│   │   │   └── ws_chat.py               # Full-duplex chat WebSocket endpoint
│   │   ├── memory/
│   │   │   ├── memory_service.py        # Semantic memory storage & retrieval
│   │   │   └── summarizer.py            # Rolling session summarizer
│   │   ├── providers/
│   │   │   ├── circuit_breaker.py       # Autonomous multi-provider circuit breaker
│   │   │   ├── nim_provider.py          # NVIDIA NIM microservice client
│   │   │   ├── gemini_provider.py       # Google Gemini client
│   │   │   └── openai_provider.py       # OpenAI client
│   │   ├── services/
│   │   │   ├── conversation_service.py  # WebSocket turn streaming & lifecycle manager
│   │   │   └── face_behavior_service.py # Quality scoring & FACS normalization
│   │   ├── vision/
│   │   │   ├── face_mesh_detector.py    # MediaPipe 478 3D landmark extractor
│   │   │   ├── head_pose_estimator.py   # OpenCV SolvePnP Euler angle calculator
│   │   │   ├── gaze_tracker.py          # Pupil-to-canthi gaze tracker
│   │   │   └── ferplus_classifier.py    # FERPlus ONNX deep emotion model
│   │   └── main.py                      # FastAPI application bootstrap & router registration
│   └── tests/
│       ├── test_context_tracker.py      # Unit tests for SSS context gating & panic paths
│       └── test_solution_engine.py      # Unit tests for CBT & somatic solution generation
│
└── frontend/
    └── src/
        ├── app/
        │   ├── components/
        │   │   ├── FaceToFaceScreen.tsx     # Flagship 3-column clinical consultation station
        │   │   ├── VoiceScreen.tsx          # Full-duplex audio consultation screen
        │   │   ├── screens.tsx              # DashboardScreen, ChatScreen, EmotionScreen
        │   │   ├── MemoryScreen.tsx         # Long-term memory & knowledge cards
        │   │   ├── AnalyticsScreen.tsx      # Mood trajectories & calm streaks
        │   │   ├── DebugScreen.tsx          # FACS Action Unit sliders & system telemetry
        │   │   ├── FaceDebugPanel.tsx       # Live clinical facial HUD overlay
        │   │   ├── SolutionCard.tsx         # Interactive SSS CBT & breathing card renderer
        │   │   ├── quick-actions-fab.tsx    # Floating quick action button tray
        │   │   ├── clay-icons.tsx           # Custom 3D SVG claymorphic icons
        │   │   └── aura-robot.tsx           # 3D robot mascot avatar component
        │   ├── services/
        │   │   ├── audioEngine.ts           # Web Audio AEC, RMS energy, and mic teardown
        │   │   ├── speechRecognitionService.ts # Resilient continuous STT & closing phrases
        │   │   ├── duplexManager.ts         # Barge-in state machine & interruption coordinator
        │   │   ├── streamingTtsService.ts   # Edge-TTS streaming audio player
        │   │   └── wsHelper.ts              # WebSocket URL resolvers
        │   ├── context/
        │   │   ├── ThemeContext.tsx         # Light cream / dark midnight clay theme provider
        │   │   └── UserContext.tsx          # User session & profile provider
        │   ├── App.tsx                      # Root navigation & layout orchestrator
        │   └── main.tsx                     # React application entry point
        └── styles/
            └── globals.css                  # Claymorphic CSS system & lighting models
```

---

## 12. Deployment & Execution Guide

### 12.1 Quick Start (Development Mode)
- **Windows 1-Click Launch**:
  ```powershell
  .\start_dev.bat
  ```
  *(Starts PostgreSQL, Redis, FastAPI Uvicorn server on `:8000`, and Vite development server on `:5173`)*
- **Using Unified CLI Manager**:
  ```powershell
  .\run.bat start
  ```

### 12.2 Verification & Test Execution
- **Run Backend Clinical Test Suite**:
  ```powershell
  backend\.venv\Scripts\python.exe -m pytest backend/tests/test_context_tracker.py backend/tests/test_solution_engine.py -v
  ```
- **Compile Frontend Production Build**:
  ```powershell
  cd frontend
  npm run build
  ```

---

*Document version: 2.0.0 • Last updated: September 2026 • Aura AI Cognitive Architecture Team*
