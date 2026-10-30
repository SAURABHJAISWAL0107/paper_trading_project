import React, { createContext, useContext, useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, getSessionToken, setSessionToken, clearSessionToken } from "@/lib/api";
import type { AuthUser } from "@/types";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  isGuest: boolean;
  authModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  register: (username: string, email?: string, password?: string, name?: string) => Promise<void>;
  resetPassword: (usernameOrEmail: string, resetCode: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    async function initAuth() {
      const existingToken = getSessionToken();
      if (existingToken) {
        try {
          const res = await api.auth.me();
          setUser(res.data.user);
          setIsLoading(false);
          return;
        } catch {
          // Token expired or invalid, fall through to guest
          clearSessionToken();
        }
      }

      // Initialize an instant guest session
      try {
        const guestRes = await api.auth.guest();
        setSessionToken(guestRes.data.token);
        setUser(guestRes.data.user);
      } catch (err) {
        console.error("Failed to initialize guest session:", err);
      } finally {
        setIsLoading(false);
      }
    }

    initAuth();
  }, []);

  async function login(usernameOrEmail: string, password: string) {
    const res = await api.auth.login({ usernameOrEmail, password });
    setSessionToken(res.data.token);
    setUser(res.data.user);
    setAuthModalOpen(false);
    qc.invalidateQueries();
  }

  async function register(username: string, email?: string, password?: string, name?: string) {
    const currentToken = getSessionToken();
    const guestToken = user?.isGuest && currentToken ? currentToken : undefined;

    const res = await api.auth.register({
      username,
      email,
      password: password || "",
      name,
      guestToken,
    });
    setSessionToken(res.data.token);
    setUser(res.data.user);
    setAuthModalOpen(false);
    qc.invalidateQueries();
  }

  async function resetPassword(usernameOrEmail: string, resetCode: string, newPassword: string) {
    const res = await api.auth.resetPassword({ usernameOrEmail, resetCode, newPassword });
    setSessionToken(res.data.token);
    setUser(res.data.user);
    setAuthModalOpen(false);
    qc.invalidateQueries();
  }

  async function logout() {
    try {
      await api.auth.logout();
    } catch {
      // ignore
    }
    clearSessionToken();
    setUser(null);

    // Re-initialize a clean guest session immediately
    try {
      const guestRes = await api.auth.guest();
      setSessionToken(guestRes.data.token);
      setUser(guestRes.data.user);
    } catch {
      // ignore
    }
    qc.invalidateQueries();
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isGuest: Boolean(user?.isGuest),
        authModalOpen,
        openAuthModal: () => setAuthModalOpen(true),
        closeAuthModal: () => setAuthModalOpen(false),
        login,
        register,
        resetPassword,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

