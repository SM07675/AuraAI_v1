"""
YouTube Music API endpoints powered by ytmusicapi.

Provides endpoints to search tracks, fetch ambient/relaxation music playlists,
and get stream metadata for background playback in Aura AI.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel
import structlog

logger = structlog.get_logger("music_api")

router = APIRouter(prefix="/music", tags=["music"])


class MusicTrack(BaseModel):
    videoId: str
    title: str
    artist: str
    album: Optional[str] = None
    duration: Optional[str] = None
    thumbnail: Optional[str] = None
    stream_url: Optional[str] = None


class MusicSearchResponse(BaseModel):
    query: str
    results: List[MusicTrack]


# Global lazy-initialized YTMusic instance
_ytmusic = None


def get_ytmusic():
    global _ytmusic
    if _ytmusic is None:
        try:
            from ytmusicapi import YTMusic
            _ytmusic = YTMusic()
        except Exception as exc:
            logger.warning("Could not initialize YTMusic", error=str(exc))
            _ytmusic = None
    return _ytmusic


@router.get("/search", response_model=MusicSearchResponse)
async def search_music(
    query: str = Query(..., min_length=1, description="Search query for songs, artists or playlists")
) -> MusicSearchResponse:
    """Search YouTube Music for tracks using ytmusicapi."""
    yt = get_ytmusic()
    results: List[MusicTrack] = []

    if yt:
        try:
            raw_results = yt.search(query, filter="songs", limit=10)
            for item in raw_results:
                if item.get("videoId"):
                    artists = ", ".join([a["name"] for a in item.get("artists", [])]) if item.get("artists") else "Unknown Artist"
                    thumbnails = item.get("thumbnails", [])
                    thumb_url = thumbnails[-1]["url"] if thumbnails else None
                    album_name = item.get("album", {}).get("name") if item.get("album") else None

                    results.append(
                        MusicTrack(
                            videoId=item["videoId"],
                            title=item.get("title", "Unknown Title"),
                            artist=artists,
                            album=album_name,
                            duration=item.get("duration"),
                            thumbnail=thumb_url,
                            stream_url=f"https://www.youtube-nocookie.com/embed/{item['videoId']}?autoplay=1&enablejsapi=1",
                        )
                    )
        except Exception as exc:
            logger.error("Error searching YouTube Music", error=str(exc))

    return MusicSearchResponse(query=query, results=results)


@router.get("/ambient", response_model=List[MusicTrack])
async def get_ambient_tracks() -> List[MusicTrack]:
    """Fetch curated ambient and relaxation background tracks from YouTube Music."""
    yt = get_ytmusic()
    tracks: List[MusicTrack] = []

    if yt:
        try:
            raw_results = yt.search("lofi ambient calm relaxation study music", filter="songs", limit=8)
            for item in raw_results:
                if item.get("videoId"):
                    artists = ", ".join([a["name"] for a in item.get("artists", [])]) if item.get("artists") else "Aura Ambient"
                    thumbnails = item.get("thumbnails", [])
                    thumb_url = thumbnails[-1]["url"] if thumbnails else None

                    tracks.append(
                        MusicTrack(
                            videoId=item["videoId"],
                            title=item.get("title", "Ambient Relaxation"),
                            artist=artists,
                            duration=item.get("duration"),
                            thumbnail=thumb_url,
                            stream_url=f"https://www.youtube-nocookie.com/embed/{item['videoId']}?autoplay=1&enablejsapi=1",
                        )
                    )
        except Exception as exc:
            logger.error("Error fetching ambient tracks from YouTube Music", error=str(exc))

    # Fallback curated ambient tracks if search is empty or rate limited
    if not tracks:
        tracks = [
            MusicTrack(
                videoId="jfKfPfyJRdk",
                title="Lofi Hip Hop Radio - Beats to Relax/Study to",
                artist="Lofi Girl · Ambient",
                duration="LIVE",
                thumbnail="https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
                stream_url="https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=lofi-study-112191.mp3",
            ),
            MusicTrack(
                videoId="5qap5aO4i9A",
                title="Lofi Chill & Meditation Waves",
                artist="Aura Ambient · Zen",
                duration="3:45",
                thumbnail="https://i.ytimg.com/vi/5qap5aO4i9A/hqdefault.jpg",
                stream_url="https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-amp-strings-10711.mp3",
            ),
            MusicTrack(
                videoId="DWcJFNfaw9c",
                title="Peaceful Mind & Deep Focus",
                artist="Aura · Mindset Flow",
                duration="4:12",
                thumbnail="https://i.ytimg.com/vi/DWcJFNfaw9c/hqdefault.jpg",
                stream_url="https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a70514.mp3?filename=relaxing-light-background-116686.mp3",
            ),
        ]

    return tracks
