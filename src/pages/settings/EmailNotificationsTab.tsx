import { useState, useEffect } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Mail, Bell, MessageSquare, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface NotifSettings {
  on_new_conversation: boolean;
  on_sla_expiring: boolean;
  on_mention: boolean;
  email_override: string | null;
}

const EmailNotificationsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<NotifSettings>({
    on_new_conversation: true,
    on_sla_expiring: true,
    on_mention: true,
    email_override: null,
  });
  const [emailOverride, setEmailOverride] = useState("");

  useEffect(() => {
    api.get<NotifSettings>("/email-notification-settings")
      .then((data) => {
        setSettings(data);
        setEmailOverride(data.email_override || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/email-notification-settings", {
        on_new_conversation: settings.on_new_conversation,
        on_sla_expiring: settings.on_sla_expiring,
        on_mention: settings.on_mention,
        email_override: emailOverride.trim() || null,
      });
      toast.success("Configurações de notificação salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notificações por E-mail
          </CardTitle>
          <CardDescription>
            Configure quais eventos geram notificações por e-mail para você.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Nova conversa */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Nova conversa atribuída</p>
                <p className="text-xs text-muted-foreground">
                  Receba um e-mail quando uma conversa for atribuída a você.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.on_new_conversation}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, on_new_conversation: v }))}
            />
          </div>

          {/* SLA expirando */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">SLA expirando</p>
                <p className="text-xs text-muted-foreground">
                  Receba um e-mail quando o SLA de uma conversa sua estiver vencendo.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.on_sla_expiring}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, on_sla_expiring: v }))}
            />
          </div>

          {/* Menção */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-sm font-medium">Menção no chat interno</p>
                <p className="text-xs text-muted-foreground">
                  Receba um e-mail quando alguém mencionar você com @seu_nome no chat interno.
                </p>
              </div>
            </div>
            <Switch
              checked={settings.on_mention}
              onCheckedChange={(v) => setSettings((s) => ({ ...s, on_mention: v }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">E-mail alternativo (opcional)</CardTitle>
          <CardDescription>
            Se preenchido, as notificações serão enviadas para este e-mail em vez do e-mail da sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="email_override">E-mail para notificações</Label>
            <Input
              id="email_override"
              type="email"
              placeholder="outro@email.com"
              value={emailOverride}
              onChange={(e) => setEmailOverride(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
        Salvar configurações
      </Button>
    </div>
  );
};

export default EmailNotificationsTab;
