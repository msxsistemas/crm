import { useState } from "react";
import { usePlatformName } from "@/hooks/usePlatformName";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Loader2, Mail, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";

const ForgotPassword = () => {
  const { platformName } = usePlatformName();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Informe seu e-mail");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (err: any) {
      // Mesmo em erro, mostrar mensagem genérica para não revelar se e-mail existe
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-primary p-4">
      {/* Logo */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-primary-foreground/30">
          <MessageCircle className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-primary-foreground">
          {platformName}
        </h1>
        <p className="text-primary-foreground/80">Recuperação de senha</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        {sent ? (
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            <CheckCircle className="h-14 w-14 text-green-500" />
            <h2 className="text-xl font-bold text-gray-800">E-mail enviado!</h2>
            <p className="text-gray-500 text-sm">
              Se o e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha em instantes.
            </p>
            <p className="text-gray-400 text-xs mt-1">Verifique também a pasta de spam.</p>
            <Link
              to="/login"
              className="mt-2 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="mb-2">
              <h2 className="text-lg font-bold text-gray-800">Esqueceu sua senha?</h2>
              <p className="text-sm text-gray-500 mt-1">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                E-mail
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-gray-200 bg-gray-50 pl-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                  required
                  autoFocus
                />
              </div>
            </div>

            <Button type="submit" className="w-full text-base font-semibold" size="lg" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar link de recuperação
            </Button>
          </form>
        )}
      </div>

      {/* Footer */}
      {!sent && (
        <p className="mt-6 text-sm text-primary-foreground/80">
          Lembrou a senha?{" "}
          <Link to="/login" className="font-semibold text-primary-foreground hover:underline">
            Fazer login
          </Link>
        </p>
      )}
    </div>
  );
};

export default ForgotPassword;
