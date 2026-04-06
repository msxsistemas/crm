import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function useSessionTimeout(timeoutMinutes = 30) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const logout = useCallback(async () => {
    localStorage.removeItem('auth_token');
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    navigate('/login');
  }, [navigate]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    setShowWarning(false);

    const warnMs = (timeoutMinutes - 2) * 60 * 1000;
    const logoutMs = timeoutMinutes * 60 * 1000;

    warningRef.current = setTimeout(() => setShowWarning(true), warnMs);
    timerRef.current = setTimeout(logout, logoutMs);
  }, [timeoutMinutes, logout]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, reset));
    reset();
    return () => {
      events.forEach(e => window.removeEventListener(e, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [reset]);

  return { showWarning, reset };
}
