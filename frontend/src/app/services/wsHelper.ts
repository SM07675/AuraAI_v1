/**
 * Centralized WebSocket Connection Helper for Aura AI.
 * 
 * Provides robust URL resolution, JWT token query attachment, and
 * direct port-8000 mapping in local development to bypass Vite proxy drops.
 */

export function getWebSocketUrl(endpointPath: string): string {
  const protocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = typeof window !== "undefined"
    ? (localStorage.getItem("token") || localStorage.getItem("aura_token") || localStorage.getItem("aura_access_token") || "")
    : "";

  const normalizedPath = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;

  // Join token parameter cleanly whether endpointPath already has '?' or not
  let pathWithToken = normalizedPath;
  if (token) {
    const separator = normalizedPath.includes("?") ? "&" : "?";
    pathWithToken = `${normalizedPath}${separator}token=${encodeURIComponent(token)}`;
  }

  if (typeof window !== "undefined") {
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    // In local dev where Vite is on 3000 and FastAPI backend is on 8000, connect directly to 8000
    if (isLocal && (window.location.port === "3000" || window.location.port === "5173")) {
      return `${protocol}//${window.location.hostname}:8000${pathWithToken}`;
    }
    return `${protocol}//${window.location.host}${pathWithToken}`;
  }

  return `ws://localhost:8000${pathWithToken}`;
}
