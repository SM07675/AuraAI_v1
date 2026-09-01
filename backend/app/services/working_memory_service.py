"""
Real-Time Working Memory, Session Snapshots, Context Cache & Semantic Response Cache.

Layer 1 of the 7-Layer Memory Hierarchy:
- Real-time Working Memory (Redis Hashes / TTL / In-Memory Fallback)
- Fast Session Snapshots for instant reconnection restoration
- Context Cache keyed by user_id and context_version
- Gated Semantic Response Cache (strictly non-sensitive, non-personal queries)
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.core.deps import get_redis
from app.core.logging_config import get_logger
from app.utils.sanitizer import sanitize_sensitive_data

logger = get_logger(__name__)

# TTL Configuration (in seconds)
_WORKING_MEMORY_TTL = 7200       # 2 hours
_CONTEXT_CACHE_TTL = 3600        # 1 hour
_SEMANTIC_CACHE_TTL = 3600       # 1 hour
_SNAPSHOT_TTL = 86400            # 24 hours for session recovery

# In-memory fallback dictionary if Redis is temporarily unreachable
_in_memory_state: dict[str, dict[str, Any]] = {}
_in_memory_cache: dict[str, Any] = {}


@dataclass
class WorkingMemoryState:
    """Active working state of a live session."""
    session_id: int
    user_id: int
    current_state: str = "active"
    current_topic: str = "general"
    current_goal: str = ""
    current_emotion: str = "neutral"
    last_user_message: str = ""
    last_assistant_message: str = ""
    active_entities: list[str] = field(default_factory=list)
    active_memory_ids: list[int] = field(default_factory=list)
    recent_turns: list[dict[str, str]] = field(default_factory=list)
    pending_question: str = ""
    interruption_state: bool = False
    voice_state: str = "idle"
    context_version: int = 1
    provider: str = "nvidia_nim"
    latency_metadata: dict[str, float] = field(default_factory=dict)
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_redis_dict(self) -> dict[str, str]:
        """Serialize fields for fast Redis HSET."""
        return {
            "session_id": str(self.session_id),
            "user_id": str(self.user_id),
            "current_state": self.current_state,
            "current_topic": self.current_topic,
            "current_goal": self.current_goal,
            "current_emotion": self.current_emotion,
            "last_user_message": self.last_user_message,
            "last_assistant_message": self.last_assistant_message,
            "active_entities": json.dumps(self.active_entities),
            "active_memory_ids": json.dumps(self.active_memory_ids),
            "recent_turns": json.dumps(self.recent_turns[-12:]),  # Strict cap: 12 turns max
            "pending_question": self.pending_question,
            "interruption_state": "1" if self.interruption_state else "0",
            "voice_state": self.voice_state,
            "context_version": str(self.context_version),
            "provider": self.provider,
            "latency_metadata": json.dumps(self.latency_metadata),
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_redis_dict(cls, data: dict[str, str]) -> "WorkingMemoryState":
        """Deserialize from Redis HGETALL."""
        if not data:
            return cls(session_id=0, user_id=0)

        def _safe_json(val: Optional[str], default: Any) -> Any:
            if not val:
                return default
            try:
                return json.loads(val)
            except Exception:
                return default

        return cls(
            session_id=int(data.get("session_id", 0)),
            user_id=int(data.get("user_id", 0)),
            current_state=data.get("current_state", "active"),
            current_topic=data.get("current_topic", "general"),
            current_goal=data.get("current_goal", ""),
            current_emotion=data.get("current_emotion", "neutral"),
            last_user_message=data.get("last_user_message", ""),
            last_assistant_message=data.get("last_assistant_message", ""),
            active_entities=_safe_json(data.get("active_entities"), []),
            active_memory_ids=_safe_json(data.get("active_memory_ids"), []),
            recent_turns=_safe_json(data.get("recent_turns"), []),
            pending_question=data.get("pending_question", ""),
            interruption_state=data.get("interruption_state") == "1",
            voice_state=data.get("voice_state", "idle"),
            context_version=int(data.get("context_version", 1)),
            provider=data.get("provider", "nvidia_nim"),
            latency_metadata=_safe_json(data.get("latency_metadata"), {}),
            updated_at=data.get("updated_at", datetime.now(timezone.utc).isoformat()),
        )

    def to_snapshot(self, summary: str = "") -> dict[str, Any]:
        """Return clean session snapshot dict."""
        return {
            "session_id": self.session_id,
            "user_id": self.user_id,
            "current_topic": self.current_topic,
            "current_goal": self.current_goal,
            "current_emotion": self.current_emotion,
            "active_entities": self.active_entities,
            "recent_turns": self.recent_turns,
            "summary": summary,
            "pending_question": self.pending_question,
            "context_version": self.context_version,
            "updated_at": self.updated_at,
        }


_REDIS_UNSET = object()


class WorkingMemoryService:
    """Handles Layer 1 Working Memory, Session Snapshots, and Tiered Caching."""

    def __init__(self, redis_client: Any = _REDIS_UNSET) -> None:
        if redis_client is _REDIS_UNSET:
            self._redis = None
            self._allow_auto_connect = True
        else:
            self._redis = redis_client
            self._allow_auto_connect = False

    async def _get_client(self) -> aioredis.Redis | None:
        if not self._allow_auto_connect:
            return self._redis
        if self._redis is not None:
            return self._redis
        try:
            self._redis = await get_redis()
            return self._redis
        except Exception as exc:
            logger.debug("Redis connection unavailable, using in-memory store", error=str(exc))
            return None

    # ── 1. Working Memory (Session Working State) ───────────────────

    def _state_key(self, session_id: int) -> str:
        return f"aura:session:{session_id}:working_state"

    def _snapshot_key(self, session_id: int) -> str:
        return f"aura:session:{session_id}:snapshot"

    async def get_state(self, session_id: int, user_id: int = 0) -> WorkingMemoryState:
        """Retrieve active working state for a session with sub-millisecond latency."""
        client = await self._get_client()
        key = self._state_key(session_id)

        if client is not None:
            try:
                data = await client.hgetall(key)
                if data:
                    return WorkingMemoryState.from_redis_dict(data)
            except Exception as exc:
                logger.debug("Redis get_state error, falling back", session_id=session_id, error=str(exc))

        # In-memory fallback
        if key in _in_memory_state:
            return WorkingMemoryState.from_redis_dict(_in_memory_state[key])

        # Default initial state
        new_state = WorkingMemoryState(session_id=session_id, user_id=user_id)
        return new_state

    async def save_state(self, state: WorkingMemoryState) -> None:
        """Atomically persist active working state with TTL."""
        client = await self._get_client()
        key = self._state_key(state.session_id)
        state.updated_at = datetime.now(timezone.utc).isoformat()
        redis_dict = state.to_redis_dict()

        # Always update in-memory store
        _in_memory_state[key] = redis_dict

        if client is not None:
            try:
                pipe = client.pipeline()
                pipe.hset(key, mapping=redis_dict)
                pipe.expire(key, _WORKING_MEMORY_TTL)
                await pipe.execute()
            except Exception as exc:
                logger.debug("Redis save_state error", session_id=state.session_id, error=str(exc))

    async def update_turn(
        self,
        session_id: int,
        user_id: int,
        user_message: str,
        assistant_message: str,
        emotion: str = "neutral",
        topic: str = "general",
        goal: str = "",
        active_entities: list[str] | None = None,
        pending_question: str = "",
        latency_metadata: dict[str, float] | None = None,
    ) -> WorkingMemoryState:
        """Update working memory after a conversation turn with privacy sanitization."""
        clean_user = sanitize_sensitive_data(user_message)
        clean_assistant = sanitize_sensitive_data(assistant_message)
        state = await self.get_state(session_id, user_id)
        state.user_id = user_id or state.user_id
        state.last_user_message = clean_user
        state.last_assistant_message = clean_assistant
        state.current_emotion = emotion or state.current_emotion
        if topic and topic != "general":
            state.current_topic = topic
        if goal:
            state.current_goal = goal
        if active_entities:
            merged = list(dict.fromkeys(state.active_entities + active_entities))
            state.active_entities = merged[-15:]  # Keep top 15 recent entities
        if pending_question is not None:
            state.pending_question = pending_question

        # Append turn to recent turns (sliding window of max 12)
        if clean_user:
            state.recent_turns.append({"role": "user", "content": clean_user})
        if clean_assistant:
            state.recent_turns.append({"role": "assistant", "content": clean_assistant})
        state.recent_turns = state.recent_turns[-12:]

        if latency_metadata:
            state.latency_metadata = latency_metadata

        await self.save_state(state)
        return state

    async def set_interrupted(self, session_id: int, interrupted: bool = True) -> None:
        """Mark the active turn as interrupted or reset."""
        state = await self.get_state(session_id)
        state.interruption_state = interrupted
        if interrupted:
            state.voice_state = "listening"
        await self.save_state(state)

    # ── 2. Session Snapshot & Resumption ────────────────────────────

    async def save_session_snapshot(self, session_id: int, snapshot: dict[str, Any]) -> None:
        """Save a fast JSON session snapshot for resilient reconnects."""
        client = await self._get_client()
        key = self._snapshot_key(session_id)
        payload = json.dumps(snapshot)
        _in_memory_cache[key] = payload

        if client is not None:
            try:
                await client.set(key, payload, ex=_SNAPSHOT_TTL)
            except Exception as exc:
                logger.debug("Redis snapshot error", session_id=session_id, error=str(exc))

    async def restore_session_snapshot(self, session_id: int) -> Optional[dict[str, Any]]:
        """Restore session snapshot after a reconnect."""
        client = await self._get_client()
        key = self._snapshot_key(session_id)

        if client is not None:
            try:
                val = await client.get(key)
                if val:
                    return json.loads(val)
            except Exception as exc:
                logger.debug("Redis restore snapshot error", session_id=session_id, error=str(exc))

        if key in _in_memory_cache:
            try:
                return json.loads(_in_memory_cache[key])
            except Exception:
                return None
        return None

    # ── 3. Context Cache ───────────────────────────────────────────

    def _ctx_cache_key(self, user_id: int, context_version: int) -> str:
        return f"aura:user:{user_id}:ctx_cache:v{context_version}"

    async def get_cached_context(self, user_id: int, context_version: int) -> Optional[dict[str, Any]]:
        """Retrieve pre-built stable context if context_version matches."""
        client = await self._get_client()
        key = self._ctx_cache_key(user_id, context_version)

        if client is not None:
            try:
                val = await client.get(key)
                if val:
                    return json.loads(val)
            except Exception:
                pass

        if key in _in_memory_cache:
            return _in_memory_cache[key]
        return None

    async def set_cached_context(self, user_id: int, context_version: int, context_data: dict[str, Any]) -> None:
        """Cache pre-built stable context."""
        client = await self._get_client()
        key = self._ctx_cache_key(user_id, context_version)
        _in_memory_cache[key] = context_data

        if client is not None:
            try:
                await client.set(key, json.dumps(context_data), ex=_CONTEXT_CACHE_TTL)
            except Exception:
                pass

    # ── 4. Safe Semantic Response Cache ────────────────────────────

    _SENSITIVE_KEYWORDS = frozenset({
        "suicide", "depress", "anxious", "panic", "kill", "harm", "trauma",
        "abuse", "overwhelm", "crying", "therapy", "medication", "doctor",
        "diagnosis", "bipolar", "schizo", "adhd", "ptsd", "alone", "hopeless"
    })

    def is_cache_safe(self, text: str, user_id: int, emotion: str = "neutral") -> bool:
        """Strict safety gating: never cache or reuse sensitive/clinical mental wellness replies."""
        if not text or len(text.strip()) < 3:
            return False
        clean = text.lower()
        if emotion in {"sad", "fear", "disgust", "angry"}:
            return False
        if any(kw in clean for kw in self._SENSITIVE_KEYWORDS):
            return False
        # Do not cache personal identity statements
        if any(w in clean for w in ["my name", "i am", "i live", "my goal", "my project"]):
            return False
        return True

    def build_cache_key(
        self,
        query: str,
        intent: str,
        locale: str,
        model: str,
        prompt_version: str = "2.0",
        context_version: int = 1,
    ) -> str:
        """Create deterministic SHA256 cache key including all safety & context variables."""
        raw_str = f"{query.strip().lower()}|{intent}|{locale}|{model}|{prompt_version}|{context_version}"
        hashed = hashlib.sha256(raw_str.encode("utf-8")).hexdigest()
        return f"aura:semantic_cache:{hashed}"

    async def get_semantic_response(
        self,
        query: str,
        intent: str,
        locale: str,
        model: str,
        user_id: int,
        emotion: str = "neutral",
        context_version: int = 1,
    ) -> Optional[str]:
        """Lookup cached non-personal response."""
        if not self.is_cache_safe(query, user_id, emotion):
            return None

        client = await self._get_client()
        key = self.build_cache_key(query, intent, locale, model, context_version=context_version)

        if client is not None:
            try:
                res = await client.get(key)
                if res:
                    logger.debug("Semantic cache hit", query=query[:30])
                    return str(res)
            except Exception:
                pass

        if key in _in_memory_cache:
            return _in_memory_cache[key]
        return None

    async def set_semantic_response(
        self,
        query: str,
        response: str,
        intent: str,
        locale: str,
        model: str,
        user_id: int,
        emotion: str = "neutral",
        context_version: int = 1,
    ) -> None:
        """Store safe, reusable response in cache."""
        if not self.is_cache_safe(query, user_id, emotion) or not response:
            return

        client = await self._get_client()
        key = self.build_cache_key(query, intent, locale, model, context_version=context_version)
        _in_memory_cache[key] = response

        if client is not None:
            try:
                await client.set(key, response, ex=_SEMANTIC_CACHE_TTL)
            except Exception:
                pass
