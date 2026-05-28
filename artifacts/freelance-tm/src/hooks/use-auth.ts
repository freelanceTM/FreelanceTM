import { useCallback, useEffect, useState } from "react";
import { useGetMe, getGetMeQueryKey, User } from "@workspace/api-client-react";

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function getStoredTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem("ftm_tokens");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredTokens(tokens: Tokens | null) {
  if (tokens) localStorage.setItem("ftm_tokens", JSON.stringify(tokens));
  else localStorage.removeItem("ftm_tokens");
}

function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem("ftm_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setStoredUser(user: User | null) {
  if (user) localStorage.setItem("ftm_user", JSON.stringify(user));
  else localStorage.removeItem("ftm_user");
}

export function useAuth() {
  const [tokens, setTokens] = useState<Tokens | null>(getStoredTokens());
  const [localUser, setLocalUser] = useState<User | null>(getStoredUser());

  const {
    data: userFromApi,
    isLoading: apiLoading,
    error,
    refetch,
  } = useGetMe({
    query: {
      retry: false,
      queryKey: getGetMeQueryKey(),
      enabled: !!tokens?.accessToken,
    },
  });

  const user = userFromApi ?? localUser;
  const isLoading = apiLoading && !localUser;
  const isAuthenticated = !!user;

  // Auto-refresh when token is about to expire
  useEffect(() => {
    if (!tokens?.refreshToken) return;
    const refreshMs = (tokens.expiresIn - 60) * 1000; // refresh 1 min before expiry
    if (refreshMs <= 0) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: tokens.refreshToken }),
        });
        if (!res.ok) {
          // Refresh failed — logout
          logout();
          return;
        }
        const data = await res.json();
        if (data.tokens) {
          const newTokens: Tokens = data.tokens;
          setStoredTokens(newTokens);
          setTokens(newTokens);
          refetch();
        }
      } catch {
        logout();
      }
    }, refreshMs);

    return () => clearTimeout(timer);
  }, [tokens?.accessToken, tokens?.expiresIn]);

  const login = useCallback(
    (userData: User, newTokens?: Tokens) => {
      setLocalUser(userData);
      setStoredUser(userData);
      if (newTokens) {
        setStoredTokens(newTokens);
        setTokens(newTokens);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    const tok = getStoredTokens();
    if (tok?.refreshToken) {
      // Notify backend (best effort)
      fetch(`${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tok.refreshToken }),
      }).catch(() => {});
    }
    setStoredTokens(null);
    setStoredUser(null);
    setTokens(null);
    setLocalUser(null);
    window.location.href = "/login";
  }, []);

  const refreshUser = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    user,
    tokens,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshUser,
  };
}

/**
 * Helper for Telegram Mini App login.
 * Returns initData string or null if not in Telegram WebApp.
 */
export function getTelegramInitData(): string | null {
  if (window.Telegram?.WebApp) {
    return window.Telegram.WebApp.initData || null;
  }
  return null;
}
