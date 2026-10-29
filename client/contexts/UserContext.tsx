import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { apiPost } from '@/utils/api';

export interface User {
  id: number;
  nickname: string;
  invite_code: string;
  device_id: string;
  avatar_text: string;
}

interface UserContextValue {
  user: User | null;
  userId: string | null;
  hasProfile: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  userId: null,
  hasProfile: false,
  loading: true,
  refresh: async () => undefined,
});

const DEVICE_KEY = 'nuan_device_id';

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [loading, setLoading] = useState(true);

  const ensureDevice = async () => {
    let deviceId = await AsyncStorage.getItem(DEVICE_KEY);
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await AsyncStorage.setItem(DEVICE_KEY, deviceId);
    }
    return deviceId;
  };

  const refresh = useCallback(async () => {
    try {
      const deviceId = await ensureDevice();
      const res = await apiPost<any>('/api/v1/users/me/bootstrap', { deviceId });
      setUser(res.user);
      setHasProfile(res.hasProfile);
      setLoading(false);
    } catch (e) {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const value: UserContextValue = {
    user,
    userId: user ? String(user.id) : null,
    hasProfile,
    loading,
    refresh,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}