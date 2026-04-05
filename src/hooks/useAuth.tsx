import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import api from "@/lib/api";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "admin" | "agent" | "supervisor";
  avatar_url?: string | null;
  permissions: Record<string, unknown>;
  two_factor_enabled?: boolean;
}

interface AuthContextType {
  user: UserProfile | null;
  profile: UserProfile | null;
  session: { user: UserProfile } | null; // compat shim
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  session: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async () => {
    try {
      const data = await api.get<UserProfile>('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadUser(); }, []);

  const signOut = async () => {
    try { await api.post('/auth/logout', {}); } catch {}
    setUser(null);
    // Flag tells the login page this is a fresh logout — skip any cached session redirect
    sessionStorage.setItem('signed_out', '1');
    window.location.replace('/login');
  };

  const session = user ? { user } : null;

  return (
    <AuthContext.Provider value={{ user, profile: user, session, loading, signOut, refreshUser: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
