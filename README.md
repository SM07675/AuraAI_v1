# 🌸 Aura AI 2.0 — Emotion-Aware AI Companion & Wellbeing Platform

<div align="center">

![Aura AI Banner](frontend/public/aura-mascot-3d.png)

**A production-grade, multimodal conversational AI platform with real-time facial emotion recognition, voice analysis, long-term memory, and a tactile 3D claymorphic interface.**

[![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0+-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

[Key Features](#-key-features) • [Architecture](#-system-architecture) • [Getting Started](#-getting-started) • [API & WebSockets](#-api--websocket-endpoints) • [Tech Stack](#-technology-stack) • [Configuration](#-environment-variables)

</div>

---

## ✨ Key Features

### 🧠 1. Multimodal Emotion Intelligence
- **Real-Time Facial Emotion Inference**: Client-side video streaming to ONNX FERPlus models detecting micro-expressions (Joy, Calm, Sadness, Anger, Surprise, Fear, Disgust, Neutral).
- **Vision Telemetry**: Real-time FPS monitoring, face detection bounding box overlays, eye-contact detection, and ambient lighting quality assessment.
- **Multimodal Emotion Fusion**: Synthesizes visual cues, voice acoustics/VAD, and textual sentiment into cohesive real-time emotional state scores.

### 🎭 2. Interactive Experience Modes
- **🏠 Dashboard**: Bento-style tactile overview with 7-day emotion trend curves, lilac mascot check-in, wellbeing donut insights, and quick-action cards (Journal, Breathing, Focus, Music).
- **💬 Chat Mode**: Empathy-tuned conversational AI backed by long-term memory, customizable communication styles, and streaming message generation.
- **🎙️ Voice Mode**: Low-latency voice interaction featuring animated soundwave visualizers, continuous hands-free Speech-to-Text (STT), and neural Edge-TTS audio responses.
- **📹 Face-to-Face Consultation**: 3-column Bento console combining live camera preview, real-time emotion telemetry, central AI counselor consultation, and active memory context tracking.

### 💾 3. Cognitive Long-Term Memory & Personalization
- **Contextual Memory Engine**: Stores and categorizes user goals, preferences, key interests, and historical milestones with importance ranking.
- **Dynamic Onboarding**: Interactive interest selection and custom communication persona tuning (Supportive, Direct, Analytical, Creative).
- **Context Injection**: Automatically injects relevant memories and user goals into prompt templates for deeply personalized sessions.

### 📊 4. Analytics & Wellbeing Insights
- **KPI Metrics**: Mood Index, Calm Streaks, Dominant Emotions, and Total Consultations.
- **Interactive Visualizations**: Weekly wellbeing trend bar charts, focus rhythm area charts, and emotion breakdown pie charts powered by Recharts.
- **Actionable AI Recommendations**: Personalized wellness tips generated from consultation trends.

### 🎨 5. 3D Claymorphic UI & Dual Theme System
- **Claymorphic Design Pattern**: Soft 3D extruded surfaces, specular upper highlights, tactile physics, and custom 3D clay icons.
- **Instant Theme Toggle**: Seamless transition between **Pastel Cream Light Mode** and **Obsidian Midnight Violet Dark Mode** (`#12101B` / `#171424`) with `localStorage` persistence.
- **Floating Music Player**: Embedded ambient soundscapes and Lo-Fi player with expandable controls.

---

## 🏛 System Architecture

```mermaid
flowchart TB
    subgraph Frontend ["Frontend (React 18 + TypeScript + Vite)"]
        UI[Claymorphic Dashboard / Modes]
        Webcam[Webcam & Audio Stream]
        Theme[Theme Context Engine]
        UI --> Webcam
    end

    subgraph Gateway ["FastAPI Application Gateway (Port 8000)"]
        HTTP[REST Endpoints /api/v1]
        WS_Chat[WebSocket /api/v1/ws/chat]
        WS_Emotion[WebSocket /api/v1/emotion/ws]
        Auth[JWT & Session Security]
    end

    subgraph AI_Engine ["AI & Emotion Processing Core"]
        PromptBuilder[Context & Memory Builder]
        AIGateway[Multi-Provider Gateway: NVIDIA NIM / Gemini / OpenAI]
        FERPlus[ONNX FERPlus Emotion Engine]
        TTS[Edge-TTS Neural Audio]
    end

    subgraph Storage ["Persistence Layer"]
        PG[(PostgreSQL 16 - Users, Memory, Analytics)]
        Redis[(Redis 7 - Sessions & Cache)]
    end

    Frontend <-->|REST API| HTTP
    Frontend <-->|Bidirectional Stream| WS_Chat
    Webcam <-->|Video Frames| WS_Emotion

    HTTP --> Auth
    Auth --> PG
    HTTP --> Redis

    WS_Chat --> PromptBuilder
    PromptBuilder --> PG
    PromptBuilder --> AIGateway
    AIGateway --> TTS
    WS_Emotion --> FERPlus
```

---

## 💻 Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18, TypeScript, Vite 6, Tailwind CSS 4, Motion (Framer Motion), Recharts, Radix UI, Lucide Icons |
| **Backend** | Python 3.12+, FastAPI, Uvicorn, Pydantic v2, Structlog, Edge-TTS, WebSockets |
| **AI / ML** | NVIDIA NIM (Nemotron 120B / Llama 3), Google Gemini, OpenAI, ONNX Runtime (FERPlus) |
| **Database & Cache** | PostgreSQL 16 (SQLAlchemy 2.0 Async, asyncpg, Alembic), Redis 7 (hiredis) |
| **DevOps & Tooling** | Docker, Docker Compose, Ruff, Pytest, Pytest-Asyncio |

---

## 🚀 Getting Started

### Prerequisites
- **Python 3.12+**
- **Node.js 20+** and **npm** / **pnpm**
- **PostgreSQL 16** & **Redis 7** (or **Docker Desktop**)

---

### Option A: 1-Click Docker Compose (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/SM07675/AuraAI_v1.git
   cd AuraAI_v1
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.example .env
   # Edit .env and supply your AI API keys (NVIDIA NIM, Gemini, or OpenAI)
   ```

3. **Launch the entire stack**:
   ```bash
   docker compose up --build
   ```

4. **Access the application**:
   - **Frontend UI**: [http://localhost:3000](http://localhost:3000)
   - **Backend Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   - **Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

---

### Option B: Local Development Setup

#### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create and activate a virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start FastAPI development server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup

```bash
# Open a new terminal and navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

*The frontend will be accessible at `http://localhost:3000` (or `http://localhost:5173`).*

---

## 📡 API & WebSocket Endpoints

### Core REST APIs (`/api/v1`)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Register a new user account |
| `POST` | `/api/v1/auth/login` | Authenticate and obtain JWT access token |
| `GET` | `/api/v1/users/me` | Retrieve authenticated user profile & style preferences |
| `PUT` | `/api/v1/users/me/interests` | Update onboarding interests & goals |
| `GET` | `/api/v1/memory` | Fetch categorized long-term memories |
| `POST` | `/api/v1/memory` | Create or update a cognitive memory entry |
| `DELETE` | `/api/v1/memory/{id}` | Delete a specific memory item |
| `GET` | `/api/v1/analytics/overview` | Fetch emotional trends & session analytics |
| `GET` | `/api/v1/music/ambient` | Stream ambient soundscapes & music tracks |
| `GET` | `/api/v1/health` | Comprehensive database, Redis, and AI provider health check |

### Real-Time WebSockets

| Protocol | Endpoint | Purpose |
|---|---|---|
| `WS` | `/api/v1/ws/chat` | Real-time bidirectional conversational streaming with context injection |
| `WS` | `/api/v1/emotion/ws` | Webcam frame ingestion & FERPlus emotion inference stream |
| `WS` | `/api/v1/voice/ws` | Real-time acoustic voice processing & STT/TTS pipeline |

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

```ini
# --- Application ---
ENVIRONMENT=development
DEBUG=true
SECRET_KEY=generate_a_secure_jwt_secret_key_here
BACKEND_PORT=8000

# --- Database & Cache ---
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=aura
POSTGRES_PASSWORD=aura_dev_password
POSTGRES_DB=aura_ai
DATABASE_URL=postgresql+asyncpg://aura:aura_dev_password@localhost:5432/aura_ai

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_URL=redis://localhost:6379/0

# --- AI Model Providers ---
# Configure at least one provider
NVIDIA_NIM_API_KEY=your_nvidia_nim_api_key_here
NVIDIA_NIM_MODEL=nvidia/llama-3.1-nemotron-70b-instruct

GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# --- Speech & Vision ---
TTS_PROVIDER=edge_tts
FERPLUS_MODEL_PATH=backend/app/emotion/models/ferplus.onnx
```

---

## 📂 Project Structure

```
AuraAI_v1/
├── backend/
│   ├── alembic/                # Database migration scripts
│   ├── app/
│   │   ├── ai/                 # AI Engine, context builders, and model providers
│   │   ├── api/v1/             # REST routes (auth, memory, analytics, users, music)
│   │   ├── communication/      # AI Gateway and LLM routing
│   │   ├── core/               # App configuration, security, and dependencies
│   │   ├── db/                 # Async database session & engine
│   │   ├── emotion/            # ONNX FERPlus facial emotion inference
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── prompts/            # Empathy and counseling prompt templates
│   │   ├── schemas/            # Pydantic data schemas
│   │   └── services/           # Business logic (conversations, memories, goals)
│   ├── Dockerfile
│   ├── pyproject.toml
│   └── requirements.txt
│
├── frontend/
│   ├── public/                 # Static 3D mascot & branding assets
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/     # UI screens (Home, Chat, Voice, FaceToFace, Memory, Analytics)
│   │   │   ├── context/        # ThemeContext (Dark/Light switching)
│   │   │   └── App.tsx         # Main application orchestrator
│   │   └── styles/             # Claymorphic CSS tokens, typography, and theme classes
│   ├── package.json
│   └── vite.config.ts
│
├── docker-compose.yml          # Containerized orchestration
├── run.bat                     # Windows quickstart launcher
└── README.md
```

---

## 🧪 Testing & Code Quality

```bash
# Run backend test suite
cd backend
pytest -v

# Check linting and formatting
ruff check .
ruff format --check .
```

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m "feat: add amazing feature"`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

<div align="center">
  <sub>Built with ❤️ for emotional intelligence, mental wellbeing, and human-AI companionship.</sub>
</div>
