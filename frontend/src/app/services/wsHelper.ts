/**
 * Centralized WebSocket Connection Helper for Aura AI.
 * 
 * Provides robust URL resolution, JWT token query attachment, and
 * direct port-8000 mapping in local development to bypass Vite proxy drops.
 */

export function getWebSocketUrl(endpointPath: string): string {
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = typeof window !== "undefined" ? (localStorage.getItem("token") || localStorage.getItem("aura_token") || "") : "";
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : "";

  const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

  if (typeof window !== "undefined") {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    // In local dev where Vite is on 3000 and FastAPI backend is on 8000, connect directly to 8000
    if (isLocal && (window.location.port === "3000" || window.location.port === "5173")) {
      return `${protocol}//${window.location.hostname}:8000${normalizedPath}${tokenQuery}`;
    }
    return `${protocol}//${window.location.host}${normalizedPath}${tokenQuery}`;
  }

  return `ws://localhost:8000${normalizedPath}${tokenQuery}`;
}
