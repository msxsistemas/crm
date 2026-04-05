import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CreditCard, QrCode, Shield, Settings2, Loader2, Copy } from "lucide-react";
import { db } from "@/lib/db";

interface GatewayField {
  key: string;
  label: string;
  placeholder: string;
  type?: string;
  readOnly?: boolean;
}

interface GatewayConfig {
  name: string;
  icon: typeof CreditCard;
  description: string;
  fields: GatewayField[];
}

const WEBHOOK_URL = "https://vjpkrulpokzjihlmevht.db.co/functions/v1/ciabra-webhook";

const gatewayConfigs: GatewayConfig[] = [
  {
    name: "stripe",
    icon: CreditCard,
    description: "Aceite pagamentos com cartão de crédito via Stripe",
    fields: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", type: "password" },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "whsec_...", type: "password" },
    ],
  },
  {
    name: "asaas",
    icon: Shield,
    description: "Aceite pagamentos via Asaas (PIX, cartão, boleto)",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "$aact_...", type: "password" },
      { key: "wallet_id", label: "Wallet ID", placeholder: "Seu wallet ID" },
    ],
  },
  {
    name: "ciabra",
    icon: CreditCard,
    description: "Aceite pagamentos via Ciabra Invoice (PIX, cartão, boleto)",
    fields: [
      { key: "public_key", label: "Chave Pública", placeholder: "Sua chave pública Ciabra", type: "password" },
      { key: "private_key", label: "Chave Privada", placeholder: "Sua chave privada Ciabra", type: "password" },
      { key: "webhook_url", label: "Webhook URL (copie e cole no painel Ciabra)", placeholder: "Gerado automaticamente", readOnly: true },
    ],
  },
  {
    name: "v3pay",
    icon: CreditCard,
    description: "Aceite pagamentos via V3Pay (PIX, cartão, boleto)",
    fields: [
      { key: "api_key", label: "API Key", placeholder: "Sua API Key V3Pay", type: "password" },
      { key: "secret_key", label: "Secret Key", placeholder: "Sua Secret Key V3Pay", type: "password" },
      { key: "merchant_id", label: "Merchant ID", placeholder: "Seu Merchant ID" },
    ],
  },
];

const DISPLAY_NAMES: Record<string, string> = {
  stripe: "Stripe",
  asaas: "Asaas",
  ciabra: "Ciabra",
  v3pay: "V3Pay",
};

type GatewayState = Record<string, { enabled: boolean; values: Record<string, string> }>;

function buildDefaultState(): GatewayState {
  const state: GatewayState = {};
  for (const gw of gatewayConfigs) {
    const values: Record<string, string> = {};
    for (const f of gw.fields) {
      values[f.key] = f.key === "webhook_url" ? WEBHOOK_URL : "";
    }
    state[gw.name] = { enabled: false, values };
  }
  return state;
}

const AdminGateway = () => {
  const [gateways, setGateways] = useState<GatewayState>(buildDefaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Load from DB
  useEffect(() => {
    const load = async () => {
      const { data, error } = await db
        .from("gateway_configs" as any)
        .select("*");

      if (error) {
        console.error("Error loading gateway configs:", error);
        setLoading(false);
        return;
      }

      if (data && data.length > 0) {
        setGateways((prev) => {
          const next = { ...prev };
          for (const row of data as any[]) {
            const name = row.gateway_name;
            if (next[name]) {
              const config = row.config as Record<string, string>;
              next[name] = {
                enabled: row.enabled,
                values: { ...next[name].values, ...config },
              };
              // Always keep webhook_url for ciabra
              if (name === "ciabra") {
                next[name].values.webhook_url = WEBHOOK_URL;
              }
            }
          }
          return next;
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const toggleGateway = (name: string) => {
    setGateways((prev) => ({
      ...prev,
      [name]: { ...prev[name], enabled: !prev[name].enabled },
    }));
  };

  const updateField = (gateway: string, field: string, value: string) => {
    setGateways((prev) => ({
      ...prev,
      [gateway]: {
        ...prev[gateway],
        values: { ...prev[gateway].values, [field]: value },
      },
    }));
  };

  const saveGateway = async (name: string) => {
    setSaving(name);
    const gw = gateways[name];
    // Remove webhook_url from stored config (it's auto-generated)
    const config = { ...gw.values };
    delete config.webhook_url;

    const payload = {
      gateway_name: name,
      enabled: gw.enabled,
      config,
      updated_at: new Date().toISOString(),
    };

    const { error } = await (db as any)
      .from("gateway_configs")
      .upsert(payload, { onConflict: "gateway_name" });

    setSaving(null);

    if (error) {
      console.error("Error saving gateway config:", error);
      toast.error(`Erro ao salvar ${DISPLAY_NAMES[name]}: ${error.message}`);
      return;
    }

    toast.success(`Configurações de ${DISPLAY_NAMES[name]} salvas com sucesso!`);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("URL copiada!");
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
        <h1 className="text-2xl font-bold text-foreground">Gateway de Pagamento</h1>
        <p className="text-muted-foreground">Configure os meios de pagamento da plataforma</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {gatewayConfigs.map((gw) => {
          const state = gateways[gw.name];
          return (
            <Card key={gw.name} className={state.enabled ? "border-primary/30" : ""}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${state.enabled ? "bg-primary/10" : "bg-muted"}`}>
                      <gw.icon className={`h-5 w-5 ${state.enabled ? "text-primary" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {DISPLAY_NAMES[gw.name]}
                        {state.enabled ? (
                          <Badge className="bg-green-500/10 text-green-500 border-green-500/30">Ativo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inativo</Badge>
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">{gw.description}</CardDescription>
                    </div>
                  </div>
                  <Switch checked={state.enabled} onCheckedChange={() => toggleGateway(gw.name)} />
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {state.enabled ? (
                  gw.fields.map((field) => (
                    <div key={field.key}>
                      <Label className="text-xs">{field.label}</Label>
                      <div className="flex gap-2">
                        <Input
                          type={field.type || "text"}
                          placeholder={field.placeholder}
                          value={state.values[field.key] || ""}
                          readOnly={field.readOnly}
                          onChange={(e) => updateField(gw.name, field.key, e.target.value)}
                          className={field.readOnly ? "bg-muted" : ""}
                        />
                        {field.readOnly && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => copyToClipboard(state.values[field.key])}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Gateway desativado. Clique em salvar para persistir o status no banco.
                  </p>
                )}

                <Button
                  className="w-full"
                  onClick={() => saveGateway(gw.name)}
                  disabled={saving === gw.name}
                >
                  {saving === gw.name ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Settings2 className="h-4 w-4 mr-2" />
                  )}
                  Salvar Configurações
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminGateway;
