import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiClient } from "../services/apiClient";

export interface UserProfile {
  id: number;
  name: string;
  email: string;
  preferred_language?: string;
  timezone?: string;
  communication_style?: string;
  interests?: string[];
  goals?: string[];
}

interface UserContextType {
  user: UserProfile | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, userData: Partial<UserProfile>) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateUserLocally: (patch: Partial<UserProfile>) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return (
      localStorage.getItem("token") ||
      localStorage.getItem("aura_token") ||
      localStorage.getItem("aura_access_token") ||
      null
    );
  });

  const [user, setUser] = useState<UserProfile | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const saved = localStorage.getItem("aura_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("aura_token");
      localStorage.removeItem("aura_access_token");
      localStorage.removeItem("aura_user");
      localStorage.removeItem("aura_onboarded");
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const profile = await apiClient.get<UserProfile>("/api/v1/users/me");
      if (profile && profile.name) {
        setUser((prev) => {
          const updated = { ...(prev || {}), ...profile };
          localStorage.setItem("aura_user", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.warn("Failed to fetch fresh user profile:", err);
    }
  }, []);

  const login = useCallback((newToken: string, userData: Partial<UserProfile>) => {
    setToken(newToken);
    localStorage.setItem("token", newToken);
    localStorage.setItem("aura_token", newToken);
    localStorage.setItem("aura_access_token", newToken);

    const fullUser: UserProfile = {
      id: userData.id || 1,
      name: userData.name || "User",
      email: userData.email || "user@aura.ai",
      preferred_language: userData.preferred_language || "en",
      timezone: userData.timezone || "UTC",
      communication_style: userData.communication_style || "balanced",
      interests: userData.interests || [],
      goals: userData.goals || [],
    };

    setUser(fullUser);
    localStorage.setItem("aura_user", JSON.stringify(fullUser));

    // Also fetch the full profile from the backend
    refreshUser();
  }, [refreshUser]);

  const updateUserLocally = useCallback((patch: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, ...patch };
      localStorage.setItem("aura_user", JSON.stringify(updated));
      return updated;
    });
  }, []);

  useEffect(() => {
    const handleUnauthorized = () => {
      logout();
    };

    window.addEventListener("aura:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("aura:unauthorized", handleUnauthorized);
    };
  }, [logout]);

  useEffect(() => {
    let isMounted = true;
    const initAuth = async () => {
      setIsLoading(true);
      const storedToken =
        localStorage.getItem("token") ||
        localStorage.getItem("aura_token") ||
        localStorage.getItem("aura_access_token");

      if (storedToken) {
        try {
          const profile = await apiClient.get<UserProfile>("/api/v1/users/me");
          if (isMounted && profile && profile.name) {
            setUser(profile);
            localStorage.setItem("aura_user", JSON.stringify(profile));
          }
        } catch (err) {
          console.warn("Initial user fetch failed, keeping cached profile if any", err);
        }
      }
      if (isMounted) {
        setIsLoading(false);
      }
    };

    initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  const isAuthenticated = Boolean(user && (token || user.email));

  return (
    <UserContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshUser,
        updateUserLocally,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextType {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
