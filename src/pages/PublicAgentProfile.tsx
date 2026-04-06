import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Star, MessageCircle, Loader2, UserCircle2 } from "lucide-react";

interface AgentProfile {
  id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  average_csat: number | null;
  total_conversations_closed: number;
}

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  agent: "Agente",
};

const StarRating = ({ value }: { value: number | null }) => {
  if (!value) return null;
  const stars = Math.round(value);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-5 w-5 ${s <= stars ? "text-yellow-400 fill-yellow-400" : "text-gray-300"}`}
        />
      ))}
      <span className="ml-1 text-sm text-gray-500">{value.toFixed(1)}</span>
    </div>
  );
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

export default function PublicAgentProfile() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${API_URL}/public/agent/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Agente não encontrado");
        return r.json();
      })
      .then((data) => {
        setAgent(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || "Erro ao carregar perfil");
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <UserCircle2 className="h-16 w-16 text-gray-300" />
        <p className="text-gray-500 text-lg">{error || "Perfil não encontrado"}</p>
      </div>
    );
  }

  const initials = (agent.full_name || "?")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden">
        {/* Header / banner */}
        <div className="h-24 bg-gradient-to-r from-blue-500 to-indigo-600" />

        {/* Avatar */}
        <div className="flex flex-col items-center -mt-12 px-6 pb-6">
          <div className="relative">
            {agent.avatar_url ? (
              <img
                src={agent.avatar_url}
                alt={agent.full_name}
                className="h-24 w-24 rounded-full border-4 border-white object-cover shadow-md"
              />
            ) : (
              <div className="h-24 w-24 rounded-full border-4 border-white bg-blue-500 flex items-center justify-center text-white text-2xl font-bold shadow-md">
                {initials}
              </div>
            )}
          </div>

          <h1 className="mt-3 text-xl font-bold text-gray-900 text-center">
            {agent.full_name}
          </h1>

          <span className="mt-1 inline-block px-3 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
            {roleLabel[agent.role] || agent.role}
          </span>

          {agent.bio && (
            <p className="mt-3 text-sm text-gray-600 text-center leading-relaxed">
              {agent.bio}
            </p>
          )}

          {/* Stats */}
          <div className="mt-5 w-full grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">
                {agent.total_conversations_closed}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Atendimentos</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 flex flex-col items-center justify-center">
              {agent.average_csat ? (
                <>
                  <StarRating value={agent.average_csat} />
                  <p className="text-xs text-gray-500 mt-0.5">Avaliação CSAT</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-400">—</p>
                  <p className="text-xs text-gray-500 mt-0.5">Sem avaliações</p>
                </>
              )}
            </div>
          </div>

          {/* WhatsApp button (only shown if we have a phone linked) */}
          <a
            href={`https://wa.me/?text=Olá,%20gostaria%20de%20iniciar%20uma%20conversa%20com%20${encodeURIComponent(agent.full_name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-medium py-2.5 rounded-xl transition-colors text-sm"
          >
            <MessageCircle className="h-4 w-4" />
            Iniciar conversa no WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
