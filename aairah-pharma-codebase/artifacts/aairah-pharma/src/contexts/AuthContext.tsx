import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { apiClient, API_ENDPOINTS } from '../lib/api';

export interface User {
  id: string;
  email: string;
  fullname: string;
  role: 'user' | 'owner';
  picture?: string;
  gstin?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, isOwner?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// One-time cleanup of obsolete ecommerce cart/shipping keys
function cleanupObsoleteStorage() {
  const obsoleteKeys = [
    'aayerah_local_cart',
    'aairah_local_cart',
    'aayerah_shipping',
    'aairah_shipping',
    'aayerah_last_order',
    'aairah_last_order',
  ];
  for (const k of obsoleteKeys) {
    try {
      localStorage.removeItem(k);
    } catch {}
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('aayerah_token') || localStorage.getItem('aairah_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cleanupObsoleteStorage();
    async function checkAuth() {
      const savedToken = localStorage.getItem('aayerah_token') || localStorage.getItem('aairah_token');
      if (!savedToken) {
        setLoading(false);
        return;
      }
      try {
        const responseData = await apiClient.get<any>(API_ENDPOINTS.USER_ME, true);
        const actualUser: User | null = responseData?.owner || responseData?.user || (responseData?.id ? responseData : null);
        setUser(actualUser);
      } catch {
        // Token expired or invalid
        localStorage.removeItem('aayerah_token');
        localStorage.removeItem('aairah_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, []);

  const login = async (email: string, password: string, isOwner = true) => {
    const endpoint = isOwner ? API_ENDPOINTS.OWNER_LOGIN : API_ENDPOINTS.OWNER_LOGIN;
    const res = await apiClient.post<any>(endpoint, { email, password });
    const userObj: User = res.owner || res.user || res;
    if (res.token) {
      localStorage.setItem('aayerah_token', res.token);
      setToken(res.token);
    }
    if (userObj) {
      setUser(userObj);
    }
  };

  const logout = async () => {
    try {
      await apiClient.post(API_ENDPOINTS.OWNER_LOGOUT, {}, true);
    } catch {
      // Ignore logout network errors
    } finally {
      localStorage.removeItem('aayerah_token');
      localStorage.removeItem('aairah_token');
      setToken(null);
      setUser(null);
    }
  };

  const isAdmin = user?.role === 'owner';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
