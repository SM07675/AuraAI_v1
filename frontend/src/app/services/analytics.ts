/**
 * PostHog Analytics Client for Aura AI 2.0.
 *
 * Configures event telemetry with privacy safeguards and graceful no-op when unconfigured.
 */

import posthog from "posthog-js";

class AnalyticsService {
  private initialized = false;

  init(): void {
    if (this.initialized) return;

    const apiKey = (import.meta as any).env?.VITE_POSTHOG_KEY || "";
    const apiHost = (import.meta as any).env?.VITE_POSTHOG_HOST || "https://app.posthog.com";

    if (apiKey && typeof window !== "undefined") {
      try {
        posthog.init(apiKey, {
          api_host: apiHost,
          autocapture: false,
          capture_pageview: true,
          disable_session_recording: false,
          persistence: "localStorage",
        });
        this.initialized = true;
      } catch (err) {
        console.warn("PostHog initialization warning:", err);
      }
    }
  }

  identify(userId: string | number, traits: Record<string, any> = {}): void {
    if (!this.initialized) return;
    try {
      posthog.identify(String(userId), traits);
    } catch {}
  }

  reset(): void {
    if (!this.initialized) return;
    try {
      posthog.reset();
    } catch {}
  }

  track(eventName: string, properties: Record<string, any> = {}): void {
    if (!this.initialized) return;
    try {
      posthog.capture(eventName, {
        timestamp: new Date().toISOString(),
        ...properties,
      });
    } catch {}
  }

  // Pre-typed product events
  trackLogin(provider: string = "email"): void {
    this.track("user_logged_in", { provider });
  }

  trackRegister(provider: string = "email"): void {
    this.track("user_registered", { provider });
  }

  trackSessionStart(mode: "Chat" | "Voice Mode" | "Face-to-Face"): void {
    this.track("session_started", { mode });
  }

  trackSessionEnd(mode: string, durationSeconds?: number): void {
    this.track("session_ended", { mode, duration_seconds: durationSeconds });
  }

  trackSolutionIntervention(category: string, title?: string): void {
    this.track("solution_card_displayed", { category, title });
  }
}

export const analytics = new AnalyticsService();
