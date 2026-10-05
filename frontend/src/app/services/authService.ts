/**
 * Production Authentication Service for Aura AI 2.0.
 *
 * Integrates with FastAPI JWT endpoints:
 *   POST /api/v1/auth/login
 *   POST /api/v1/auth/register
 *   POST /api/v1/auth/refresh
 *   POST /api/v1/auth/logout
 *   GET  /api/v1/users/me
 *   GET  /api/v1/auth/google
 */

export interface AuthUser {
  id: number | string;
  name: string;
  email: string;
  is_admin?: boolean;
  avatar_url?: string | null;
  auth_provider?: string;
  isNewUser?: boolean;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
}

const ACCESS_TOKEN_KEY = "aura_access_token";
const REFRESH_TOKEN_KEY = "aura_refresh_token";
const USER_KEY = "aura_user";

class AuthService {
  private refreshPromise: Promise<string | null> | null = null;

  getAccessToken(): string | null {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  setSession(user: AuthUser, tokens: AuthTokens): void {
    sessionStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    sessionStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
    // Keep user in localStorage for persistence across browser reloads
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
  }

  clearSession(): void {
    const token = this.getAccessToken();
    if (token) {
      // Fire-and-forget server logout blacklist
      fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: token }),
      }).catch(() => {});
    }

    sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("aura_onboarded");
  }

  async login(email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.error?.message || data?.detail || "Invalid email or password.";
      throw new Error(errMsg);
    }

    const user: AuthUser = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      is_admin: Boolean(data.user.is_admin),
      avatar_url: data.user.avatar_url,
      auth_provider: data.user.auth_provider || "email",
      isNewUser: false,
    };

    const tokens: AuthTokens = {
      access_token: data.tokens.access_token,
      refresh_token: data.tokens.refresh_token,
      expires_in: data.tokens.expires_in,
    };

    this.setSession(user, tokens);
    return { user, tokens };
  }

  async register(name: string, email: string, password: string): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password }),
    });

    const data = await res.json();
    if (!res.ok) {
      const errMsg = data?.error?.message || data?.detail || "Registration failed. Email may already be registered.";
      throw new Error(errMsg);
    }

    const user: AuthUser = {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      is_admin: Boolean(data.user.is_admin),
      avatar_url: data.user.avatar_url,
      auth_provider: data.user.auth_provider || "email",
      isNewUser: true,
    };

    const tokens: AuthTokens = {
      access_token: data.tokens.access_token,
      refresh_token: data.tokens.refresh_token,
      expires_in: data.tokens.expires_in,
    };

    this.setSession(user, tokens);
    return { user, tokens };
  }

  async refresh(): Promise<string | null> {
    if (this.refreshPromise) return this.refreshPromise;

    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clearSession();
      return null;
    }

    this.refreshPromise = (async () => {
      try {
        const res = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });

        if (!res.ok) {
          this.clearSession();
          return null;
        }

        const data = await res.json();
        sessionStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
        if (data.refresh_token) {
          sessionStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
          localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        }
        return data.access_token as string;
      } catch {
        this.clearSession();
        return null;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Resilient HTTP fetch wrapper attaching Bearer token and auto-refreshing on 401.
   */
  async authFetch(url: string, options: RequestInit = {}): Promise<Response> {
    let token = this.getAccessToken();
    const headers = new Headers(options.headers || {});

    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    let response = await fetch(url, { ...options, headers });

    if (response.status === 401 && this.getRefreshToken()) {
      // Attempt silent refresh
      const newToken = await this.refresh();
      if (newToken) {
        headers.set("Authorization", `Bearer ${newToken}`);
        response = await fetch(url, { ...options, headers });
      }
    }

    return response;
  }

  initiateGoogleLogin(): void {
    window.location.href = "/api/v1/auth/google";
  }

  /**
   * Reads and consumes tokens passed back via URL search parameters after OAuth redirect.
   */
  checkOAuthRedirect(): AuthUser | null {
    if (typeof window === "undefined") return null;

    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get("access_token");
    const refreshToken = urlParams.get("refresh_token");

    if (accessToken && refreshToken) {
      const user: AuthUser = {
        id: urlParams.get("user_id") || "google_user",
        name: urlParams.get("name") || "Google User",
        email: urlParams.get("email") || "user@google.com",
        is_admin: urlParams.get("is_admin") === "true",
        avatar_url: urlParams.get("avatar_url") || null,
        auth_provider: "google",
        isNewUser: urlParams.get("is_new_user") === "true",
      };

      this.setSession(user, {
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      // Clean the query string without reloading
      window.history.replaceState({}, document.title, window.location.pathname);
      return user;
    }

    return null;
  }
}

export const authService = new AuthService();
