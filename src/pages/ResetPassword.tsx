import { useState } from "react";
import { usePlatformName } from "@/hooks/usePlatformName";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useSearchParams, Link } from "react-router-dom";

const ResetPassword = () => {
  const { platformName } = usePlatformName();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-primary p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
          <p className="text-red-600 font-semibold">Link de recuperação inválido ou expirado.</p>
          <Link to="/forgot-password" className="mt-4 inline-block text-primary hover:underline">
            Solicitar novo link
          </Link>
        </div>
      </div>
    );
  }

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Senha redefinida com sucesso!");
      navigate("/login");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Erro ao redefinir senha. O link pode ter expirado.");
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
        <p className="text-primary-foreground/80">Redefina sua senha</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <form onSubmit={handleReset} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
              Nova senha
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 pr-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm" className="text-sm font-semibold text-gray-700">
              Confirmar nova senha
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-gray-200 bg-gray-50 pl-10 pr-10 text-gray-900 placeholder:text-gray-400 focus:border-primary focus:ring-primary"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full text-base font-semibold" size="lg" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Redefinir senha
          </Button>
        </form>
      </div>

      {/* Footer */}
      <p className="mt-6 text-sm text-primary-foreground/80">
        Lembrou a senha?{" "}
        <Link to="/login" className="font-semibold text-primary-foreground hover:underline">
          Fazer login
        </Link>
      </p>
    </div>
  );
};

export default ResetPassword;
