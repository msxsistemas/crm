import { useState, useEffect, useCallback } from "react";
import { Link2, Copy, ExternalLink, MousePointerClick, Clock, ChevronRight, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import api from "@/lib/api";
import { toast } from "sonner";

interface TrackedLink {
  id: string;
  original_url: string;
  short_code: string;
  short_url: string;
  click_count: number;
  campaign_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

interface LinkClick {
  id: string;
  clicked_at: string;
  user_agent: string | null;
  ip: string | null;
}

export default function LinkTracker() {
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLink, setSelectedLink] = useState<TrackedLink | null>(null);
  const [clicks, setClicks] = useState<LinkClick[]>([]);
  const [clicksLoading, setClicksLoading] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [shortening, setShortening] = useState(false);

  const loadLinks = useCallback(async () => {
    try {
      const { data } = await api.get("/track-links");
      setLinks(data);
    } catch {
      toast.error("Erro ao carregar links");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  const handleShorten = async () => {
    if (!newUrl.trim()) return;
    setShortening(true);
    try {
      const { data } = await api.post("/track-links/shorten", { original_url: newUrl.trim() });
      setLinks((prev) => [data, ...prev]);
      setNewUrl("");
      toast.success("Link encurtado com sucesso!");
    } catch {
      toast.error("Erro ao encurtar link");
    } finally {
      setShortening(false);
    }
  };

  const handleViewClicks = async (link: TrackedLink) => {
    setSelectedLink(link);
    setClicksLoading(true);
    setClicks([]);
    try {
      const { data } = await api.get(`/track-links/${link.id}/clicks`);
      setClicks(data.data || []);
    } catch {
      toast.error("Erro ao carregar cliques");
    } finally {
      setClicksLoading(false);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-blue-100 rounded-lg dark:bg-blue-900/30">
          <Link2 className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rastreamento de Links</h1>
          <p className="text-sm text-muted-foreground">Encurte e rastreie cliques em links</p>
        </div>
      </div>

      {/* Shorten form */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
          <Plus className="h-4 w-4" /> Encurtar novo link
        </h2>
        <div className="flex gap-2">
          <Input
            placeholder="Cole a URL original aqui..."
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleShorten()}
            className="flex-1"
          />
          <Button onClick={handleShorten} disabled={shortening || !newUrl.trim()}>
            {shortening ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encurtar"}
          </Button>
        </div>
      </div>

      {/* Links table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : links.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Link2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum link rastreado ainda</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {links.map((link) => (
              <div key={link.id} className="p-4 hover:bg-muted/30 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={link.short_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-medium text-sm hover:underline"
                      >
                        {link.short_url}
                      </a>
                      <button
                        type="button"
                        onClick={() => copyLink(link.short_url)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        title="Copiar link curto"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-md flex items-center gap-1">
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {link.original_url}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(link.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <MousePointerClick className="h-3 w-3" />
                      {link.click_count} clique{link.click_count !== 1 ? "s" : ""}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewClicks(link)}
                      className="text-xs gap-1"
                    >
                      Detalhar
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Clicks modal */}
      {selectedLink && (
        <Dialog open={!!selectedLink} onOpenChange={(v) => { if (!v) setSelectedLink(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-blue-500" />
                Cliques — {selectedLink.short_url}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {clicksLoading ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : clicks.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum clique registrado ainda</p>
              ) : (
                clicks.map((click) => (
                  <div key={click.id} className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{formatDate(click.clicked_at)}</p>
                      {click.ip && <p className="text-xs text-muted-foreground">IP: {click.ip}</p>}
                      {click.user_agent && (
                        <p className="text-[11px] text-muted-foreground truncate">{click.user_agent}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
