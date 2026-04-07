import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function GoogleCalendarCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const code = searchParams.get("code");
    const error = searchParams.get("error");

    if (error) {
      setStatus("error");
      setMessage("Autorização negada: " + error);
      setTimeout(() => navigate("/configuracoes"), 3000);
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("Código de autorização não encontrado.");
      setTimeout(() => navigate("/configuracoes"), 3000);
      return;
    }

    const state = searchParams.get("state");
    api.get<{ email?: string }>(`/google-calendar/callback?code=${encodeURIComponent(code)}&state=${state || ""}`)
      .then(res => {
        const email = (res as any)?.email;
        setStatus("success");
        setMessage(`Google Calendar conectado com sucesso${email ? ` (${email})` : ""}!`);
        toast.success("Google Calendar conectado!");
        setTimeout(() => navigate("/compromissos"), 2000);
      })
      .catch(e => {
        setStatus("error");
        setMessage(e?.data?.error || e?.message || "Erro ao trocar o código de autorização.");
        setTimeout(() => navigate("/configuracoes"), 3000);
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      {status === "loading" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Conectando ao Google Calendar...</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle className="h-12 w-12 text-emerald-500" />
          <p className="text-lg font-semibold">{message}</p>
          <p className="text-sm text-muted-foreground">Redirecionando para compromissos...</p>
        </>
      )}
      {status === "error" && (
        <>
          <XCircle className="h-12 w-12 text-red-500" />
          <p className="text-lg font-semibold text-red-600">{message}</p>
          <p className="text-sm text-muted-foreground">Redirecionando para configurações...</p>
        </>
      )}
    </div>
  );
}
