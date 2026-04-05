import { useEffect, useState } from "react";
import { formatPhoneBR } from "@/lib/phone-mask";
import { usePlatformName } from "@/hooks/usePlatformName";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Settings, Globe, Bell, Shield, Save, Loader2 } from "lucide-react";

type ValidationErrors = Partial<Record<keyof SettingsState, string>>;

type SettingsState = {
  platform_name: string;
  support_email: string;
  support_phone: string;
  max_file_size_mb: number;
  webhook_url: string;
  maintenance_mode: boolean;
  allow_registration: boolean;
  require_email_verification: boolean;
  welcome_email: boolean;
  plan_expiry_alert: boolean;
  connection_limit_alert: boolean;
};

const DEFAULTS: SettingsState = {
  platform_name: "ZapCRM",
  support_email: "",
  support_phone: "",
  max_file_size_mb: 10,
  webhook_url: "",
  maintenance_mode: false,
  allow_registration: true,
  require_email_verification: true,
  welcome_email: true,
  plan_expiry_alert: true,
  connection_limit_alert: true,
};

const AdminSettings = () => {
  const { refreshPlatformName } = usePlatformName();
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const validate = (): ValidationErrors => {
    const errs: ValidationErrors = {};
    if (settings.support_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.support_email)) {
      errs.support_email = "E-mail inválido";
    }
    if (settings.support_phone && !/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(settings.support_phone.replace(/\s/g, ""))) {
      errs.support_phone = "Telefone inválido. Ex: (11) 99999-9999";
    }
    if (settings.webhook_url && !/^https?:\/\/.+/.test(settings.webhook_url)) {
      errs.webhook_url = "URL inválida. Deve começar com http:// ou https://";
    }
    if (settings.max_file_size_mb < 1 || settings.max_file_size_mb > 100) {
      errs.max_file_size_mb = "Deve ser entre 1 e 100 MB";
    }
    if (!settings.platform_name.trim()) {
      errs.platform_name = "Nome da plataforma é obrigatório";
    }
    return errs;
  };

  const formatPhone = formatPhoneBR;


  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [settingsRes, logsRes] = await Promise.all([
      db.from("system_settings" as any).select("key, value"),
      db.from("user_activity_logs").select("*").order("created_at", { ascending: false }).limit(50),
    ]);

    if (settingsRes.data) {
      const parsed: Partial<SettingsState> = {};
      for (const row of settingsRes.data as any[]) {
        const key = row.key as keyof SettingsState;
        if (key in DEFAULTS) {
          let val = row.value;
          // Unwrap double-JSON-stringified values (e.g. "\"Atende Zap\"" → "Atende Zap")
          if (typeof val === "string") {
            try { val = JSON.parse(val); } catch { /* keep as-is */ }
          }
          (parsed as any)[key] = val;
        }
      }
      setSettings((prev) => ({ ...prev, ...parsed }));
    }

    setLogs((logsRes.data as any[]) || []);
    setLoading(false);
  };

  const handleSave = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast.error("Corrija os erros antes de salvar");
      return;
    }
    setSaving(true);
    const timestamp = new Date().toISOString();
    const entries = Object.entries(settings).map(([key, value]) => ({
      key,
      value: value as any,
      updated_at: timestamp,
    }));

    // Upsert each setting
    let hasError = false;
    for (const entry of entries) {
      const { error } = await (db as any)
        .from("system_settings")
        .upsert(entry, { onConflict: "key" });
      if (error) {
        console.error("Error saving setting:", entry.key, error);
        hasError = true;
      }
    }

    setSaving(false);
    if (hasError) {
      toast.error("Erro ao salvar algumas configurações");
    } else {
      toast.success("Configurações salvas com sucesso!");
      refreshPlatformName();
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações do Sistema</h1>
        <p className="text-muted-foreground">Configurações globais da plataforma</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="logs">Logs de Atividade</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5" />Configurações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <div>
                <Label>Nome da Plataforma</Label>
                <Input value={settings.platform_name} onChange={e => { setSettings(s => ({ ...s, platform_name: e.target.value })); setErrors(e2 => ({ ...e2, platform_name: undefined })); }} className={errors.platform_name ? "border-destructive" : ""} />
                {errors.platform_name && <p className="text-xs text-destructive mt-1">{errors.platform_name}</p>}
              </div>
              <div>
                <Label>E-mail de Suporte</Label>
                <Input type="email" value={settings.support_email} onChange={e => { setSettings(s => ({ ...s, support_email: e.target.value })); setErrors(e2 => ({ ...e2, support_email: undefined })); }} placeholder="suporte@suaempresa.com" className={errors.support_email ? "border-destructive" : ""} />
                {errors.support_email && <p className="text-xs text-destructive mt-1">{errors.support_email}</p>}
              </div>
              <div>
                <Label>Telefone de Suporte</Label>
                <Input value={settings.support_phone} onChange={e => { const formatted = formatPhone(e.target.value); setSettings(s => ({ ...s, support_phone: formatted })); setErrors(e2 => ({ ...e2, support_phone: undefined })); }} placeholder="(11) 99999-9999" className={errors.support_phone ? "border-destructive" : ""} maxLength={15} />
                {errors.support_phone && <p className="text-xs text-destructive mt-1">{errors.support_phone}</p>}
              </div>
              <div>
                <Label>Tamanho máximo de arquivo (MB)</Label>
                <Input type="number" value={settings.max_file_size_mb} onChange={e => { setSettings(s => ({ ...s, max_file_size_mb: Number(e.target.value) })); setErrors(e2 => ({ ...e2, max_file_size_mb: undefined })); }} className={errors.max_file_size_mb ? "border-destructive" : ""} />
                {errors.max_file_size_mb && <p className="text-xs text-destructive mt-1">{errors.max_file_size_mb}</p>}
              </div>
              <div>
                <Label>URL do Webhook Global</Label>
                <Input value={settings.webhook_url} onChange={e => { setSettings(s => ({ ...s, webhook_url: e.target.value })); setErrors(e2 => ({ ...e2, webhook_url: undefined })); }} placeholder="https://..." className={errors.webhook_url ? "border-destructive" : ""} />
                {errors.webhook_url && <p className="text-xs text-destructive mt-1">{errors.webhook_url}</p>}
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">Modo Manutenção</p>
                  <p className="text-sm text-muted-foreground">Bloqueia acesso de usuários ao sistema</p>
                </div>
                <Switch checked={settings.maintenance_mode} onCheckedChange={v => setSettings(s => ({ ...s, maintenance_mode: v }))} />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Segurança</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">Permitir Cadastro</p>
                  <p className="text-sm text-muted-foreground">Novos usuários podem se registrar</p>
                </div>
                <Switch checked={settings.allow_registration} onCheckedChange={v => setSettings(s => ({ ...s, allow_registration: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">Verificação de E-mail</p>
                  <p className="text-sm text-muted-foreground">Exigir confirmação de e-mail no cadastro</p>
                </div>
                <Switch checked={settings.require_email_verification} onCheckedChange={v => setSettings(s => ({ ...s, require_email_verification: v }))} />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar Segurança
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5" />Notificações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-lg">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">E-mail de Boas-Vindas</p>
                  <p className="text-sm text-muted-foreground">Enviar e-mail automático ao registrar</p>
                </div>
                <Switch checked={settings.welcome_email} onCheckedChange={v => setSettings(s => ({ ...s, welcome_email: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">Alerta de Expiração de Plano</p>
                  <p className="text-sm text-muted-foreground">Notificar revendedores 7 dias antes</p>
                </div>
                <Switch checked={settings.plan_expiry_alert} onCheckedChange={v => setSettings(s => ({ ...s, plan_expiry_alert: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium text-foreground">Alerta de Limite de Conexões</p>
                  <p className="text-sm text-muted-foreground">Notificar ao atingir 80% do limite</p>
                </div>
                <Switch checked={settings.connection_limit_alert} onCheckedChange={v => setSettings(s => ({ ...s, connection_limit_alert: v }))} />
              </div>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Salvar Notificações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Logs de Atividade</CardTitle>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">Nenhum log de atividade registrado</p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {logs.map(log => (
                    <div key={log.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{log.user_name || "Usuário"}</p>
                        <p className="text-xs text-muted-foreground">{log.action}</p>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0 ml-4">
                        {new Date(log.created_at).toLocaleDateString("pt-BR")} {new Date(log.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSettings;
