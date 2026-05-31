import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { setAuthTokenGetter, type UserProfile } from "@workspace/api-client-react";

const TOKEN_KEY = "ftm_token";
const USER_KEY = "ftm_user";

interface AuthState {
  user: UserProfile | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStorage(): AuthState {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const raw = localStorage.getItem(USER_KEY);
    if (token && raw) {
      return { token, user: JSON.parse(raw) as UserProfile };
    }
  } catch {
    /* storage unavailable or corrupt — start fresh */
  }
  return { token: null, user: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(readStorage);

  // Keep the fetcher's token getter in sync with auth state
  useEffect(() => {
    if (state.token) {
      setAuthTokenGetter(() => state.token);
    } else {
      setAuthTokenGetter(null);
    }
  }, [state.token]);

  // Auto-logout on 401 from any API call
  useEffect(() => {
    function handleUnauthorized() {
      setState({ token: null, user: null });
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setAuthTokenGetter(null);
    }
    window.addEventListener("ftm:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("ftm:unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback((token: string, user: UserProfile) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      /* ignore storage errors */
    }
    setAuthTokenGetter(() => token);
    setState({ token, user });
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    setAuthTokenGetter(null);
    setState({ token: null, user: null });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        isAuthenticated: !!state.token && !!state.user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
