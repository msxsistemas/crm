import { useEffect, useState } from 'react';
import api from '@/lib/api';

export function usePushNotifications() {
  const [enabled, setEnabled] = useState(false);

  const subscribe = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const { data } = await api.get('/push/vapid-public-key');
      if (!data.key) {
        console.warn('VAPID public key não configurada no servidor');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: data.key
      });
      await api.post('/push/subscribe', { subscription: sub });
      setEnabled(true);
      localStorage.setItem('push_enabled', '1');
    } catch (e) {
      console.error('Push subscribe error:', e);
    }
  };

  const unsubscribe = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await api.delete('/push/unsubscribe');
      setEnabled(false);
      localStorage.removeItem('push_enabled');
    } catch (e) {
      // silent
    }
  };

  useEffect(() => {
    setEnabled(localStorage.getItem('push_enabled') === '1');
  }, []);

  return { enabled, subscribe, unsubscribe };
}
