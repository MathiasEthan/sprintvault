import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api';

interface AuthContextType {
  currentUser: User | null;
  token: string | null;
  allUsers: Array<{ user_id: number; name: string; email: string; role: string }>;
  loading: boolean;
  login: (email: string, password?: string) => Promise<void>;
  switchUser: (email: string) => Promise<void>;
  logout: () => void;
  refreshUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('sprintvault_token'));
  const [allUsers, setAllUsers] = useState<Array<{ user_id: number; name: string; email: string; role: string }>>([]);
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
    fetchUsers();
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

  const login = async (email: string, password: string = 'password123') => {
    const res = await api.login(email, password);
    localStorage.setItem('sprintvault_token', res.token);
    setToken(res.token);
    setCurrentUser(res.user);
  };

  const switchUser = async (email: string) => {
    await login(email, 'password123');
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
