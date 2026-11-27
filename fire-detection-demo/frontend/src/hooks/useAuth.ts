import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { UserProfile } from '../types';

const MOCK_AUTH_STORAGE_KEY = 'fire_studio_mock_auth_user';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Khởi tạo trạng thái đăng nhập
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      setIsLoading(true);
      if (isSupabaseConfigured && supabase) {
        // Xóa phiên Mock Auth cũ nếu trước đó chạy chưa cấu hình Supabase
        localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
        try {
          const { data } = await supabase.auth.getSession();
          if (data?.session?.user && isMounted) {
            setUser({
              id: data.session.user.id,
              email: data.session.user.email || '',
            });
            setAccessToken(data.session.access_token);
          }
        } catch (err: any) {
          console.warn('Lỗi đọc phiên Supabase:', err);
        }

        // Lắng nghe thay đổi trạng thái Auth từ Supabase
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (!isMounted) return;
          if (session?.user) {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
            });
            setAccessToken(session.access_token);
          } else {
            setUser(null);
            setAccessToken(null);
          }
        });

        if (isMounted) setIsLoading(false);
        return () => subscription.unsubscribe();
      } else {
        // Chế độ Mock Auth (lưu trong localStorage để giữ phiên khi F5)
        try {
          const savedMock = localStorage.getItem(MOCK_AUTH_STORAGE_KEY);
          if (savedMock && isMounted) {
            const parsed = JSON.parse(savedMock);
            setUser(parsed);
            setAccessToken(`mock-token-${parsed.id}`);
          }
        } catch (e) {
          console.warn('Lỗi đọc mock auth:', e);
        }
        if (isMounted) setIsLoading(false);
      }
    }

    void initAuth();
    return () => {
      isMounted = false;
    };
  }, []);

  // 1. Gửi mã OTP đăng nhập qua Email
  const signInWithOtp = useCallback(async (email: string): Promise<{ success: boolean; error?: string }> => {
    setAuthError(null);
    if (!email || !email.includes('@')) {
      const err = 'Địa chỉ email không hợp lệ.';
      setAuthError(err);
      return { success: false, error: err };
    }

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            shouldCreateUser: true,
          },
        });
        if (error) {
          setAuthError(error.message);
          return { success: false, error: error.message };
        }
        return { success: true };
      } catch (err: any) {
        const msg = err.message || 'Lỗi gửi mã OTP qua Supabase Auth';
        setAuthError(msg);
        return { success: false, error: msg };
      }
    } else {
      // Mock Auth Mode: Tự động giả lập gửi thành công
      console.log(`[Mock Auth] Giả lập gửi mã OTP 6 số tới: ${email} (Mã mặc định: 123456)`);
      return { success: true };
    }
  }, []);

  // 2. Xác minh mã OTP 6 số
  const verifyOtp = useCallback(
    async (email: string, token: string): Promise<{ success: boolean; error?: string }> => {
      setAuthError(null);
      const cleanToken = token.trim();
      if (!cleanToken || cleanToken.length < 6) {
        const err = 'Mã OTP phải gồm đủ 6 chữ số.';
        setAuthError(err);
        return { success: false, error: err };
      }

      if (isSupabaseConfigured && supabase) {
        // Xóa phiên Mock Auth cũ nếu trước đó chạy chưa cấu hình Supabase
        localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
        try {
          const { data, error } = await supabase.auth.verifyOtp({
            email: email.trim(),
            token: cleanToken,
            type: 'email',
          });
          if (error) {
            setAuthError(error.message);
            return { success: false, error: error.message };
          }
          if (data?.session?.user) {
            const profile: UserProfile = {
              id: data.session.user.id,
              email: data.session.user.email || email,
            };
            setUser(profile);
            setAccessToken(data.session.access_token);
            return { success: true };
          }
          return { success: false, error: 'Không thể thiết lập phiên đăng nhập' };
        } catch (err: any) {
          const msg = err.message || 'Lỗi xác minh mã OTP';
          setAuthError(msg);
          return { success: false, error: msg };
        }
      } else {
        // Mock Auth Mode: chấp nhận mã 123456 hoặc bất kỳ 6 số hợp lệ
        if (cleanToken === '123456' || /^\d{6}$/.test(cleanToken)) {
          const cleanEmail = email.trim().toLowerCase();
          const username = cleanEmail.split('@')[0] || 'user';
          const mockUser: UserProfile = {
            id: `usr_${username}`,
            email: cleanEmail,
          };
          localStorage.setItem(MOCK_AUTH_STORAGE_KEY, JSON.stringify(mockUser));
          setUser(mockUser);
          setAccessToken(`mock-token-${mockUser.id}`);
          return { success: true };
        } else {
          const err = 'Mã OTP không chính xác. Trong chế độ kiểm thử, hãy nhập 123456.';
          setAuthError(err);
          return { success: false, error: err };
        }
      }
    },
    []
  );

  // 3. Đăng xuất
  const signOut = useCallback(async () => {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Lỗi đăng xuất Supabase:', err);
      }
    }
    localStorage.removeItem(MOCK_AUTH_STORAGE_KEY);
    setUser(null);
    setAccessToken(null);
    setAuthError(null);
  }, []);

  return {
    user,
    accessToken,
    isAuthenticated: !!user,
    isLoading,
    authError,
    signInWithOtp,
    verifyOtp,
    signOut,
    isMockAuth: !isSupabaseConfigured,
  };
}
