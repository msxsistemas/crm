import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'push_subscription_active';

export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  // Legacy compat
  const enabled = isSubscribed;

  useEffect(() => {
    const supported =
      'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    setIsSupported(supported);
    if (supported) {
      setPermission(Notification.permission);
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'true' && Notification.permission === 'granted') {
        setIsSubscribed(true);
      }
    }
  }, []);

  const getVapidKey = async (): Promise<string | null> => {
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/push-subscriptions/vapid-key', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.publicKey || null;
    } catch {
      return null;
    }
  };

  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') return false;

      const vapidKey = await getVapidKey();
      if (!vapidKey) {
        console.warn('VAPID public key não configurada no servidor');
        return false;
      }

      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();

      const subscription = await sw.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();
      const token = localStorage.getItem('token') || '';
      const res = await fetch('/push-subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });

      if (res.ok) {
        setIsSubscribed(true);
        localStorage.setItem(STORAGE_KEY, 'true');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Push subscription error:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  // Legacy compat alias
  const subscribe = requestPermission;

  const unsubscribe = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      if ('serviceWorker' in navigator) {
        const sw = await navigator.serviceWorker.ready;
        const subscription = await sw.pushManager.getSubscription();
        if (subscription) {
          const token = localStorage.getItem('token') || '';
          await fetch('/push-subscriptions', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          await subscription.unsubscribe();
        }
      }
      setIsSubscribed(false);
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Unsubscribe error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    isSupported,
    isSubscribed,
    permission,
    loading,
    requestPermission,
    subscribe,
    unsubscribe,
    enabled,
  };
}
