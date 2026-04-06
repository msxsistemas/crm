import { useSessionTimeout } from '@/hooks/useSessionTimeout';

export function SessionTimeoutWarning() {
  const { showWarning, reset } = useSessionTimeout(30); // 30 min
  if (!showWarning) return null;
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
        <h3 className="font-semibold text-lg mb-2">Sessão prestes a expirar</h3>
        <p className="text-sm text-gray-600 mb-4">Você ficou inativo. Sua sessão será encerrada em 2 minutos.</p>
        <button
          onClick={reset}
          className="w-full bg-green-600 text-white rounded-lg py-2 hover:bg-green-700"
        >
          Continuar conectado
        </button>
      </div>
    </div>
  );
}
