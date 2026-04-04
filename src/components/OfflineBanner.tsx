import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useMessageQueue } from "@/hooks/useMessageQueue";

export default function OfflineBanner() {
  const { isOnline, wasOffline } = useOnlineStatus();
  const { queue } = useMessageQueue();

  if (isOnline && !wasOffline) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        transform: isOnline || wasOffline ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.3s ease-in-out",
      }}
    >
      {!isOnline ? (
        <div
          style={{
            backgroundColor: "#dc2626",
            color: "#fff",
            padding: "8px 16px",
            textAlign: "center",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
          }}
        >
          <span>📡 Sem conexão — as mensagens serão enviadas quando a conexão for restaurada</span>
          {queue.length > 0 && (
            <span
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                borderRadius: "12px",
                padding: "2px 10px",
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              +{queue.length} {queue.length === 1 ? "mensagem na fila" : "mensagens na fila"}
            </span>
          )}
        </div>
      ) : wasOffline ? (
        <div
          style={{
            backgroundColor: "#16a34a",
            color: "#fff",
            padding: "8px 16px",
            textAlign: "center",
            fontSize: "14px",
          }}
        >
          ✅ Conexão restaurada — enviando mensagens na fila...
        </div>
      ) : null}
    </div>
  );
}
