import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';

const DISMISSED_KEY = 'push_banner_dismissed';

export default function PushNotificationSetup() {
  const { isSupported, isSubscribed, permission, loading, requestPermission } = usePushNotifications();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isSupported) return;
    if (isSubscribed) return;
    if (permission === 'denied') return;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;
    // Mostrar após 3 segundos para não interromper o carregamento
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, permission]);

  const handleActivate = async () => {
    const ok = await requestPermission();
    if (ok) setVisible(false);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm mx-auto px-4">
      <div className="flex items-center gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-4 py-3">
        <div className="flex-shrink-0 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
          <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Ativar notificações
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            Receba alertas de novas mensagens
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            onClick={handleActivate}
            disabled={loading}
            className="h-7 px-3 text-xs"
          >
            {loading ? 'Ativando...' : 'Ativar'}
          </Button>
          <button
            onClick={handleDismiss}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded"
            aria-label="Fechar banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
