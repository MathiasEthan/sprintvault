import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api';

interface AuthContextType {
  currentUser: User | null;
  token: string | null;
  allUsers: Array<{ user_id: number; name: string; email: string; role: string }>;
  // Non-empty only when the server runs with DEMO_MODE=true
  demoUsers: Array<{ user_id: number; name: string; email: string; role: string }>;
  demoMode: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  switchUser: (email: string) => Promise<void>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sprintvault_token'));
  const [allUsers, setAllUsers] = useState<Array<{ user_id: number; name: string; email: string; role: string }>>([]);
  const [demoUsers, setDemoUsers] = useState<Array<{ user_id: number; name: string; email: string; role: string }>>([]);
  const [demoPassword, setDemoPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  const fetchUsers = async () => {
    try {
      const data = await api.getUsers();
      setAllUsers(data.users);
    } catch (e) {
      console.error('Failed to load users:', e);
    }
  };

  useEffect(() => {
    api.getDemoUsers()
      .then((res) => {
        setDemoUsers(res.enabled ? res.users : []);
        setDemoPassword(res.demoPassword ?? '');
      })
      .catch(() => setDemoUsers([]));
  }, []);

  // The user list needs authentication: load it once logged in
  useEffect(() => {
    if (currentUser) fetchUsers();
    else setAllUsers([]);
  }, [currentUser?.userId]);

  useEffect(() => {
    if (token) {
      api.getMe()
        .then((res) => {
          setCurrentUser(res.user);
        })
        .catch(() => {
          localStorage.removeItem('sprintvault_token');
          setToken(null);
          setCurrentUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    localStorage.setItem('sprintvault_token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
  };

  const switchUser = async (email: string) => {
    if (!demoUsers.length) throw new Error('User switching is only available in demo mode');
    await login(email, demoPassword);
  };

  const logout = () => {
    api.logout().catch(() => {});
    localStorage.removeItem('sprintvault_token');
    setToken(null);
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        token,
        allUsers,
        demoUsers,
        demoMode: demoUsers.length > 0,
        loading,
        login,
        switchUser,
        logout,
        refreshUsers: fetchUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
