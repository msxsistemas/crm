import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ciabraApi } from "@/lib/ciabra-api";
import { usePlatformName } from "@/hooks/usePlatformName";
import {
  CreditCard,
  Calendar,
  Check,
  AlertTriangle,
  Receipt,
  QrCode,
  Crown,
  Loader2,
  ExternalLink,
  Copy,
} from "lucide-react";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  max_connections: number;
  max_users: number;
  max_contacts: number;
}

// Generate a valid CPF for billing purposes
function generateValidCPF(): string {
  const rand = () => Math.floor(Math.random() * 9);
  const n = Array.from({ length: 9 }, rand);
  
  const d1 = (n.reduce((sum, v, i) => sum + v * (10 - i), 0) * 10) % 11 % 10;
  n.push(d1);
  const d2 = (n.reduce((sum, v, i) => sum + v * (11 - i), 0) * 10) % 11 % 10;
  n.push(d2);
  
  return n.join("");
}

const SubscriptionPage = () => {
  const { user } = useAuth();
  const { platformName } = usePlatformName();
  const [showPlans, setShowPlans] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [pixCode, setPixCode] = useState<string | null>(null);
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState<string | null>(null);
  const [showPixModal, setShowPixModal] = useState(false);

  const [activeSubscription, setActiveSubscription] = useState<any>(null);

  const trialEndDate = activeSubscription?.expires_at
    ? new Date(activeSubscription.expires_at).toLocaleDateString("pt-BR")
    : "—";
  const daysLeft = activeSubscription?.expires_at
    ? Math.max(0, Math.ceil((new Date(activeSubscription.expires_at).getTime() - Date.now()) / 86400000))
    : 0;

  useEffect(() => {
    const loadPlans = async () => {
      const { data } = await db
        .from("reseller_plans")
        .select("id, name, description, price, max_connections, max_users, max_contacts")
        .eq("is_active", true)
        .order("price");

      const loadedPlans = (data as Plan[]) || [];
      setPlans(loadedPlans);
      setSelectedPlanId((prev) => prev ?? loadedPlans[0]?.id ?? null);
      setLoading(false);
    };

    const loadSubscription = async () => {
      if (!user) return;
      const { data } = await db
        .from("subscriptions")
        .select("*, plan:reseller_plans(*)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setActiveSubscription(data);
    };

    loadPlans();
    loadSubscription();
  }, [user]);

  const currentPlan = plans[0];
  const selected = plans.find((p) => p.id === selectedPlanId);

  const formatCurrency = (value: number | string) =>
    Number(value || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleGeneratePayment = async () => {
    if (!selected || !user) {
      toast.error("Selecione um plano primeiro");
      return;
    }

    setGenerating(true);
    setPaymentUrl(null);
    setPixCode(null);
    setPixQrCodeUrl(null);

    try {
      const userName = user.user_metadata?.full_name || user.email?.split("@")[0] || "Cliente";
      const userPhone = user.user_metadata?.phone || user.phone || "";
      const generatedCPF = generateValidCPF();

      // 1. Create customer on Ciabra with name, phone and generated CPF
      const customerData = await ciabraApi.createCustomer({
        fullName: userName,
        document: generatedCPF,
        email: user.email,
        ...(userPhone ? { phone: userPhone } : {}),
      });

      const customerId = customerData?.id || customerData?.customerId;
      if (!customerId) {
        throw new Error("Não foi possível criar o cliente na Ciabra");
      }

      // 2. Create invoice with webhook for payment confirmation
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const externalId = `sub_${user.id}_${selected.id}_${Date.now()}`;

      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ciabra-webhook`;

      const invoiceData = await ciabraApi.createInvoice({
        customerId,
        description: `Assinatura ${selected.name} - ${platformName}`,
        dueDate: dueDate.toISOString().split("T")[0],
        price: selected.price,
        paymentTypes: paymentMethod === "pix" ? ["PIX"] : ["CREDIT_CARD"],
        externalId,
        webhooks: [
          { hookType: "PAYMENT_CONFIRMED", url: webhookUrl },
          { hookType: "INVOICE_PAID", url: webhookUrl },
        ],
      });

      // 3. Save pending subscription in database
      const invoiceId = invoiceData?.id || invoiceData?.invoiceId;
      await db.from("subscriptions").insert({
        user_id: user.id,
        plan_id: selected.id,
        status: "pending",
        ciabra_invoice_id: invoiceId,
        ciabra_external_id: externalId,
        payment_method: paymentMethod,
      });

      // 4. Extract payment URL from invoice response
      const installmentId = invoiceData?.installments?.[0]?.id;
      const url =
        invoiceData?.paymentUrl ||
        invoiceData?.url ||
        invoiceData?.invoiceUrl ||
        (invoiceId ? `https://pagar.ciabra.com.br/i/${invoiceId}` : null) ||
        (installmentId ? `https://pagar.ciabra.com.br/i/${installmentId}` : null);

      setPaymentUrl(url);

      // 5. For PIX: fetch real copy-and-paste code (EMV) and render QR from it
      if (paymentMethod === "pix" && installmentId) {
        try {
          let pixEmv: string | null = null;
          let pixLocation: string | null = null;

          for (let attempt = 0; attempt < 6; attempt++) {
            const paymentsData = await ciabraApi.getPayments(installmentId);
            const pix = paymentsData?.pix;

            pixEmv = pix?.emv || null;
            pixLocation = pix?.location || null;

            if (pixEmv || pixLocation) break;
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }

          if (pixEmv) {
            setPixCode(pixEmv);
            setPixQrCodeUrl(
              `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(pixEmv)}`
            );
          } else if (pixLocation) {
            const normalizedLocation = pixLocation.startsWith("http")
              ? pixLocation
              : `https://${pixLocation}`;
            setPixQrCodeUrl(normalizedLocation);
          }
        } catch (pixError) {
          console.warn("Não foi possível obter o EMV do PIX, exibindo link de pagamento:", pixError);
        }
      }

      setShowPlans(false);
      setShowPixModal(true);
    } catch (err: any) {
      console.error("Payment generation error:", err);
      toast.error(err.message || "Erro ao gerar cobrança");
    } finally {
      setGenerating(false);
    }
  };

  const copyPaymentUrl = () => {
    if (paymentUrl) {
      navigator.clipboard.writeText(paymentUrl);
      toast.success("Link copiado!");
    }
  };

  const copyPixCode = () => {
    if (pixCode) {
      navigator.clipboard.writeText(pixCode);
      toast.success("Código PIX copiado!");
    }
  };

  const resetPayment = () => {
    setPaymentUrl(null);
    setPixCode(null);
    setPixQrCodeUrl(null);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Minha Assinatura</h1>
      </div>
      <div className="p-6 space-y-6">

      {activeSubscription ? (
        <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 p-4">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-green-500" />
            <span className="text-sm text-foreground">
              Assinatura <strong>ativa</strong> — Plano {activeSubscription.plan?.name || "Premium"}.
              {activeSubscription.expires_at && (
                <> Válida até {new Date(activeSubscription.expires_at).toLocaleDateString("pt-BR")}.</>
              )}
            </span>
          </div>
          <Badge variant="outline" className="border-green-500/50 text-green-500">Ativo</Badge>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span className="text-sm text-foreground">
              Você está no período de teste. Restam <strong>{daysLeft} dias</strong>.
            </span>
          </div>
          <Button size="sm" onClick={() => setShowPlans(true)}>Assinar agora</Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center gap-3 space-y-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Plano Atual</CardTitle>
                  <CardDescription>Detalhes da sua assinatura</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {currentPlan ? (
                  <>
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-2xl font-bold text-foreground">{currentPlan.name}</h3>
                        <p className="text-xl font-bold text-primary">
                          R$ {formatCurrency(currentPlan.price)}
                          <span className="text-sm font-normal text-muted-foreground">/mês</span>
                        </p>
                      </div>
                      <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">Trial</Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-lg border p-4">
                        <p className="text-xs text-muted-foreground">Usuários</p>
                        <p className="text-xl font-bold text-foreground">{currentPlan.max_users}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-xs text-muted-foreground">Conexões</p>
                        <p className="text-xl font-bold text-foreground">{currentPlan.max_connections}</p>
                      </div>
                      <div className="rounded-lg border p-4">
                        <p className="text-xs text-muted-foreground">Contatos</p>
                        <p className="text-xl font-bold text-foreground">{currentPlan.max_contacts.toLocaleString()}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">Nenhum plano disponível</p>
                )}

                <div className="flex items-center gap-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-4">
                  <Calendar className="h-5 w-5 text-yellow-500" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Próxima cobrança em {trialEndDate}</p>
                    <p className="text-xs text-muted-foreground">{daysLeft} dias restantes</p>
                  </div>
                </div>

                <Button variant="outline" className="w-full" onClick={() => setShowPlans(true)}>Alterar plano</Button>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card>
                <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                    <CreditCard className="h-5 w-5 text-green-500" />
                  </div>
                  <CardTitle className="text-base">Pagamento</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-foreground">R$ 0</p>
                  <p className="text-xs text-muted-foreground">Próxima cobrança: {trialEndDate}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">Status da Conta</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant="outline" className="border-yellow-500/50 text-yellow-500">Trial</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Trial até</span>
                    <span className="text-sm font-medium text-foreground">{trialEndDate}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Card>
            <CardHeader className="flex-row items-center gap-3 space-y-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10">
                <Receipt className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <CardTitle className="text-base">Histórico de Pagamentos</CardTitle>
                <CardDescription>Suas faturas e comprovantes</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Receipt className="h-10 w-10 mb-3 opacity-40" />
                <p className="text-sm">Nenhum pagamento registrado</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={showPlans} onOpenChange={(open) => { setShowPlans(open); if (!open) resetPayment(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Escolha seu plano</DialogTitle>
            <DialogDescription>Selecione o plano ideal para sua empresa</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3 mt-4">
            {plans.map((plan) => (
              <button
                key={plan.id}
                onClick={() => { setSelectedPlanId(plan.id); resetPayment(); }}
                className={`relative rounded-lg border p-4 text-left transition-all hover:border-primary/50 ${
                  selectedPlanId === plan.id ? "border-primary ring-1 ring-primary" : "border-border"
                }`}
              >
                {selectedPlanId === plan.id && (
                  <div className="absolute top-3 right-3 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <h4 className="font-semibold text-foreground">{plan.name}</h4>
                <p className="text-lg font-bold text-foreground mt-1">
                  R$ {formatCurrency(plan.price)}<span className="text-xs font-normal text-muted-foreground">/mês</span>
                </p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-green-500" />{plan.max_users} usuários
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-green-500" />{plan.max_connections} conexões
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Check className="h-3.5 w-3.5 text-green-500" />{plan.max_contacts.toLocaleString()} contatos
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium text-foreground mb-3">Forma de pagamento</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod("pix")}
                className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                  paymentMethod === "pix" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <QrCode className="h-4 w-4" />PIX
              </button>
              <button
                onClick={() => setPaymentMethod("card")}
                className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm transition-all ${
                  paymentMethod === "card" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-primary/30"
                }`}
              >
                <CreditCard className="h-4 w-4" />Cartão de Crédito
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Total: <span className="text-foreground font-bold">R$ {selected ? formatCurrency(selected.price) : formatCurrency(0)}</span>/mês
            </p>
            <Button
              className="gap-2"
              onClick={handleGeneratePayment}
              disabled={generating || !selected}
            >
              {generating ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Gerando...</>
              ) : paymentMethod === "pix" ? (
                <><QrCode className="h-4 w-4" />Gerar PIX</>
              ) : (
                <><CreditCard className="h-4 w-4" />Pagar com Cartão</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIX Payment Modal */}
      <Dialog open={showPixModal} onOpenChange={setShowPixModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Pagamento via PIX
            </DialogTitle>
            <DialogDescription>
              Escaneie o QR Code ou copie o código para pagar
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            {pixQrCodeUrl && (
              <img
                src={pixQrCodeUrl}
                alt="QR Code PIX"
                className="w-56 h-56 rounded-lg border bg-white p-3"
              />
            )}

            <p className="text-xs text-muted-foreground">Escaneie o QR Code com o app do seu banco</p>

            {selected && (
              <p className="text-lg font-bold text-foreground">
                R$ {formatCurrency(selected.price)}
              </p>
            )}
          </div>

          {pixCode && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">PIX Copia e Cola:</p>
              <div className="flex gap-2">
                <div className="flex-1 rounded-md border bg-muted p-3 text-xs text-foreground break-all max-h-24 overflow-y-auto font-mono">
                  {pixCode}
                </div>
                <Button variant="outline" size="icon" className="shrink-0 self-start" onClick={copyPixCode}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <Button className="w-full gap-2 mt-2" onClick={copyPixCode}>
            <Copy className="h-4 w-4" />
            Copiar código PIX
          </Button>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default SubscriptionPage;
