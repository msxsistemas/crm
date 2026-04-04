import { useState, useEffect, useMemo } from "react";
import {
  Star, ThumbsUp, ThumbsDown, Minus, TrendingUp,
  Send, Search, RefreshCw, Users, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
}

interface Review {
  id: string;
  conversation_id: string | null;
  contact_id: string | null;
  rating: number | null;
  nps_score: number | null;
  comment: string | null;
  sent_at: string;
  responded_at: string | null;
  created_at: string;
  contact?: Contact | null;
}

const StarDisplay = ({ rating }: { rating: number | null }) => {
  if (rating === null) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`w-4 h-4 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
};

const NPSBadge = ({ score }: { score: number | null }) => {
  if (score === null) return <span className="text-gray-400 text-sm">—</span>;
  const color =
    score >= 9 ? "bg-green-100 text-green-700 border-green-200" :
    score >= 7 ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
    "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
      {score}
    </span>
  );
};

const Reviews = () => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Send survey dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [sending, setSending] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [reviewsRes, contactsRes] = await Promise.all([
        supabase.from("reviews").select("*").order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, name, phone").order("name"),
      ]);

      const contactMap = new Map<string, Contact>();
      (contactsRes.data ?? []).forEach((c) => contactMap.set(c.id, c));

      const enriched: Review[] = (reviewsRes.data ?? []).map((r) => ({
        ...r,
        contact: r.contact_id ? contactMap.get(r.contact_id) ?? null : null,
      }));

      setReviews(enriched);
      setContacts(contactsRes.data ?? []);
    } catch {
      toast.error("Erro ao carregar avaliações");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Stats
  const stats = useMemo(() => {
    const total = reviews.length;
    const withNPS = reviews.filter((r) => r.nps_score !== null);
    const withRating = reviews.filter((r) => r.rating !== null);

    const avgNPS = withNPS.length
      ? withNPS.reduce((s, r) => s + (r.nps_score ?? 0), 0) / withNPS.length
      : null;

    const avgRating = withRating.length
      ? withRating.reduce((s, r) => s + (r.rating ?? 0), 0) / withRating.length
      : null;

    const promotores = withNPS.filter((r) => (r.nps_score ?? 0) >= 9).length;
    const neutros = withNPS.filter((r) => { const s = r.nps_score ?? 0; return s >= 7 && s <= 8; }).length;
    const detratores = withNPS.filter((r) => (r.nps_score ?? 0) <= 6).length;

    const npsScore =
      withNPS.length > 0
        ? Math.round(((promotores - detratores) / withNPS.length) * 100)
        : null;

    const csatPct = avgRating !== null ? Math.round((avgRating / 5) * 100) : null;

    const ratingDist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: withRating.filter((r) => r.rating === star).length,
    }));

    return { total, avgNPS, avgRating, promotores, neutros, detratores, npsScore, csatPct, ratingDist, withNPS: withNPS.length };
  }, [reviews]);

  const npsColor = (val: number | null) => {
    if (val === null) return "text-gray-500";
    if (val > 30) return "text-green-600";
    if (val >= 0) return "text-yellow-600";
    return "text-red-600";
  };

  const csatColor = (val: number | null) => {
    if (val === null) return "text-gray-500";
    if (val >= 80) return "text-green-600";
    if (val >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const filteredReviews = useMemo(() => {
    if (!search.trim()) return reviews;
    const q = search.toLowerCase();
    return reviews.filter(
      (r) =>
        r.contact?.name?.toLowerCase().includes(q) ||
        r.contact?.phone?.includes(q) ||
        r.comment?.toLowerCase().includes(q)
    );
  }, [reviews, search]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch.trim()) return contacts.slice(0, 20);
    const q = contactSearch.toLowerCase();
    return contacts.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.phone.includes(q)
    ).slice(0, 20);
  }, [contacts, contactSearch]);

  const handleSend = async () => {
    if (!selectedContact) { toast.error("Selecione um contato"); return; }
    setSending(true);
    try {
      const { error } = await supabase.from("reviews").insert({
        contact_id: selectedContact.id,
        sent_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success("Pesquisa enviada com sucesso!");
      setDialogOpen(false);
      setSelectedContact(null);
      setContactSearch("");
      setInstanceName("");
      loadData();
    } catch {
      toast.error("Erro ao enviar pesquisa");
    } finally {
      setSending(false);
    }
  };

  // NPS Gauge
  const gaugeValue = stats.npsScore !== null ? Math.max(-100, Math.min(100, stats.npsScore)) : 0;
  // Map -100..100 to 0..180 degrees
  const gaugeAngle = ((gaugeValue + 100) / 200) * 180;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-600">Avaliações</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setDialogOpen(true)}>
            <Send className="w-4 h-4 mr-2" />
            Enviar Pesquisa
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Users className="w-4 h-4" />
            Total de avaliações
          </div>
          <div className="text-3xl font-bold text-gray-800">{stats.total}</div>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <TrendingUp className="w-4 h-4" />
            NPS médio
          </div>
          <div className={`text-3xl font-bold ${npsColor(stats.npsScore)}`}>
            {stats.npsScore !== null ? stats.npsScore : "—"}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
            <Star className="w-4 h-4" />
            CSAT médio
          </div>
          <div className={`text-3xl font-bold ${csatColor(stats.csatPct)}`}>
            {stats.csatPct !== null ? `${stats.csatPct}%` : "—"}
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <div className="text-gray-500 text-sm mb-2">Distribuição NPS</div>
          <div className="flex gap-3 text-sm">
            <div className="flex items-center gap-1 text-green-600">
              <ThumbsUp className="w-3.5 h-3.5" />
              <span className="font-bold">{stats.promotores}</span>
            </div>
            <div className="flex items-center gap-1 text-yellow-600">
              <Minus className="w-3.5 h-3.5" />
              <span className="font-bold">{stats.neutros}</span>
            </div>
            <div className="flex items-center gap-1 text-red-600">
              <ThumbsDown className="w-3.5 h-3.5" />
              <span className="font-bold">{stats.detratores}</span>
            </div>
          </div>
        </div>
      </div>

      {/* NPS Gauge + Star Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* NPS Gauge */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Gauge NPS</h2>
          <div className="flex flex-col items-center">
            <div className="relative w-48 h-24 overflow-hidden">
              <svg viewBox="0 0 200 100" className="w-full h-full">
                {/* Background arcs */}
                <path d="M10,100 A90,90 0 0,1 67,19" fill="none" stroke="#fca5a5" strokeWidth="16" strokeLinecap="butt" />
                <path d="M67,19 A90,90 0 0,1 133,19" fill="none" stroke="#fde68a" strokeWidth="16" strokeLinecap="butt" />
                <path d="M133,19 A90,90 0 0,1 190,100" fill="none" stroke="#86efac" strokeWidth="16" strokeLinecap="butt" />
                {/* Needle */}
                <line
                  x1="100" y1="100"
                  x2={100 + 70 * Math.cos((Math.PI - (gaugeAngle * Math.PI) / 180))}
                  y2={100 - 70 * Math.sin((gaugeAngle * Math.PI) / 180)}
                  stroke="#1e40af"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <circle cx="100" cy="100" r="5" fill="#1e40af" />
              </svg>
            </div>
            <div className={`text-4xl font-bold mt-2 ${npsColor(stats.npsScore)}`}>
              {stats.npsScore !== null ? stats.npsScore : "—"}
            </div>
            <div className="flex gap-6 mt-3 text-xs">
              <span className="text-red-500 font-medium">Ruim (≤30)</span>
              <span className="text-yellow-500 font-medium">Médio (31-70)</span>
              <span className="text-green-500 font-medium">Ótimo (&gt;70)</span>
            </div>
            {stats.withNPS > 0 && (
              <div className="text-xs text-gray-400 mt-1">
                Baseado em {stats.withNPS} resposta{stats.withNPS !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>

        {/* Star Distribution */}
        <div className="bg-white rounded-xl border p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-600 mb-4">Distribuição por Estrelas</h2>
          <div className="space-y-3">
            {[5, 4, 3, 2, 1].map((star) => {
              const item = stats.ratingDist.find((d) => d.star === star)!;
              const maxCount = Math.max(...stats.ratingDist.map((d) => d.count), 1);
              const pct = Math.round((item.count / maxCount) * 100);
              return (
                <div key={star} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-16 shrink-0">
                    <span className="text-sm text-gray-600">{star}</span>
                    <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-yellow-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-500 w-8 text-right">{item.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder="Buscar por contato, comentário..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Reviews List */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <Star className="w-10 h-10 mb-3 text-gray-300" />
            <p className="text-base font-medium">Nenhuma avaliação encontrada</p>
            <p className="text-sm mt-1">Envie uma pesquisa para começar a coletar avaliações.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Contato</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Estrelas</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">NPS</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Comentário</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Data</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredReviews.map((review) => (
                <tr key={review.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-800">
                      {review.contact?.name || "—"}
                    </div>
                    <div className="text-xs text-gray-400">{review.contact?.phone || ""}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StarDisplay rating={review.rating} />
                  </td>
                  <td className="px-4 py-3">
                    <NPSBadge score={review.nps_score} />
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <span className="text-gray-600 line-clamp-2">{review.comment || <span className="text-gray-300">—</span>}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {format(new Date(review.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </td>
                  <td className="px-4 py-3">
                    {review.responded_at ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">Respondida</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-500 border-gray-200 text-xs">Aguardando</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Send Survey Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">Enviar Pesquisa</h2>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setDialogOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-4 space-y-4">
            {/* Contact search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contato</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  className="pl-9"
                  placeholder="Buscar contato..."
                  value={contactSearch}
                  onChange={(e) => { setContactSearch(e.target.value); setSelectedContact(null); }}
                />
              </div>
              {selectedContact ? (
                <div className="mt-2 flex items-center gap-2 p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-blue-800">{selectedContact.name || selectedContact.phone}</div>
                    <div className="text-xs text-blue-500">{selectedContact.phone}</div>
                  </div>
                  <button onClick={() => { setSelectedContact(null); setContactSearch(""); }}>
                    <X className="w-4 h-4 text-blue-400" />
                  </button>
                </div>
              ) : contactSearch.trim() ? (
                <div className="mt-1 border rounded-lg overflow-hidden shadow-sm max-h-40 overflow-y-auto">
                  {filteredContacts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-400">Nenhum contato encontrado</div>
                  ) : (
                    filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
                        onClick={() => { setSelectedContact(c); setContactSearch(""); }}
                      >
                        <div className="font-medium">{c.name || c.phone}</div>
                        <div className="text-xs text-gray-400">{c.phone}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            {/* Instance name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conexão (instância)</label>
              <Input
                placeholder="Ex: minha-instancia"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
              />
            </div>

            {/* Message preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Pré-visualização da mensagem</label>
              <div className="bg-gray-50 border rounded-lg px-4 py-3 text-sm text-gray-600 leading-relaxed">
                Olá <span className="font-semibold text-blue-600">{selectedContact?.name || "{nome}"}</span>! Como foi seu atendimento? Responda de 0 a 10 (0=Péssimo, 10=Ótimo)
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleSend}
              disabled={sending || !selectedContact}
            >
              {sending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Enviar Pesquisa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Reviews;
