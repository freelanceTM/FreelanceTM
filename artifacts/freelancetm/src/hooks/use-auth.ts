import { useState, useEffect, useCallback } from "react";
import type { UserProfile } from "@workspace/api-client-react";

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  
  useEffect(() => {
    const stored = localStorage.getItem("ftm_user");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored user", e);
      }
    }
  }, []);

  const login = useCallback((userData: UserProfile) => {
    localStorage.setItem("ftm_user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ftm_user");
    setUser(null);
  }, []);

  return { user, login, logout, isAuthenticated: !!user };
}
