/**
 * Centralized Typed API Client for Aura AI.
 *
 * Automatically injects the JWT Authorization Bearer header,
 * handles JSON encoding/decoding, and dispatches an 'aura:unauthorized'
 * event on 401 status so UserContext can handle logout gracefully.
 */

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  status: number;
}

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("aura_token") ||
    localStorage.getItem("aura_access_token") ||
    null
  );
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aura:unauthorized"));
    }
    throw new Error("Unauthorized (401)");
  }

  if (!res.ok) {
    let errorMsg = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.detail) {
        errorMsg = typeof errJson.detail === "string" ? errJson.detail : JSON.stringify(errJson.detail);
      } else if (errJson.message) {
        errorMsg = errJson.message;
      }
    } catch {
      // Ignore JSON parse error on non-json error responses
    }
    throw new Error(errorMsg);
  }

  // If 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return (await res.json()) as T;
}

export const apiClient = {
  get: <T>(url: string, options?: RequestInit) =>
    request<T>(url, { method: "GET", ...options }),

  post: <T>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),

  put: <T>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),

  patch: <T>(url: string, body?: any, options?: RequestInit) =>
    request<T>(url, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...options,
    }),

  delete: <T>(url: string, options?: RequestInit) =>
    request<T>(url, { method: "DELETE", ...options }),
};
