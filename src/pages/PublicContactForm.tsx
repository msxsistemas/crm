import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";

interface ContactFormConfig {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  fields: string[];
  welcome_message: string | null;
  success_message: string | null;
  assign_tag: string | null;
  redirect_whatsapp: boolean;
  whatsapp_message: string | null;
  is_active: boolean;
}

interface FormValues {
  name: string;
  phone: string;
  email: string;
  company: string;
  message: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nome",
  phone: "Telefone",
  email: "E-mail",
  company: "Empresa",
  message: "Mensagem",
};

const FIELD_TYPES: Record<string, string> = {
  name: "text",
  phone: "tel",
  email: "email",
  company: "text",
  message: "textarea",
};

const PublicContactForm = () => {
  const { slug } = useParams<{ slug: string }>();
  const [formConfig, setFormConfig] = useState<ContactFormConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<FormValues>({
    name: "",
    phone: "",
    email: "",
    company: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<FormValues>>({});

  useEffect(() => {
    if (!slug) { setNotFound(true); setLoadingConfig(false); return; }
    (supabase as any)
      .from("contact_forms")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle()
      .then(({ data }: { data: ContactFormConfig | null }) => {
        if (!data) setNotFound(true);
        else setFormConfig(data);
        setLoadingConfig(false);
      });
  }, [slug]);

  const validate = (): boolean => {
    const newErrors: Partial<FormValues> = {};
    const fields = formConfig?.fields || [];
    if (fields.includes("name") && !values.name.trim()) newErrors.name = "Nome é obrigatório";
    if (fields.includes("phone") && !values.phone.trim()) newErrors.phone = "Telefone é obrigatório";
    if (fields.includes("email") && values.email && !/\S+@\S+\.\S+/.test(values.email))
      newErrors.email = "E-mail inválido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formConfig || !validate()) return;
    setSubmitting(true);

    const phone = values.phone.trim();
    const name = values.name.trim();
    const email = values.email.trim() || null;

    try {
      if (phone) {
        const { data: existing } = await supabase
          .from("contacts")
          .select("id")
          .eq("phone", phone)
          .maybeSingle();

        if (!existing) {
          const insertPayload: Record<string, unknown> = {
            name: name || null,
            phone,
            email,
          };
          if (formConfig.assign_tag) {
            (insertPayload as any).tags = [formConfig.assign_tag];
          }
          await supabase.from("contacts").insert(insertPayload as any);

          // Update submission count
          await (supabase as any)
            .from("contact_forms")
            .update({ submission_count: (formConfig as any).submission_count + 1 })
            .eq("id", formConfig.id);
        }
      }

      setSubmitted(true);

      if (formConfig.redirect_whatsapp) {
        const msg = formConfig.whatsapp_message
          ? encodeURIComponent(formConfig.whatsapp_message)
          : "";
        setTimeout(() => {
          window.open(`https://wa.me/?text=${msg}`, "_blank");
        }, 1000);
      }
    } catch (_) {
      // Still show success to user
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const updateValue = (field: keyof FormValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  // Loading state
  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  // Not found / inactive
  if (notFound || !formConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
        <div className="text-center max-w-sm">
          <div className="text-6xl mb-4">🔗</div>
          <h1 className="text-2xl font-bold text-gray-700 mb-2">Formulário não encontrado</h1>
          <p className="text-gray-500">Este link pode estar inativo ou ter sido removido.</p>
        </div>
      </div>
    );
  }

  // Success screen
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 p-4">
        <div className="text-center max-w-sm">
          <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Pronto!</h1>
          <p className="text-gray-600 text-lg">
            {formConfig.success_message || "Obrigado! Seus dados foram recebidos."}
          </p>
          {formConfig.redirect_whatsapp && (
            <p className="text-sm text-gray-400 mt-4">Abrindo WhatsApp...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-8 text-white text-center">
          <div className="text-3xl mb-2">📋</div>
          <h1 className="text-2xl font-bold mb-1">{formConfig.name}</h1>
          {formConfig.description && (
            <p className="text-blue-100 text-sm">{formConfig.description}</p>
          )}
        </div>

        {/* Welcome message */}
        {formConfig.welcome_message && (
          <div className="px-8 pt-6 pb-2">
            <p className="text-gray-600 text-center text-sm leading-relaxed">
              {formConfig.welcome_message}
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          {(formConfig.fields || ["name", "phone", "email"]).map((field) => {
            const label = FIELD_LABELS[field] || field;
            const type = FIELD_TYPES[field] || "text";
            const isRequired = field === "name" || field === "phone";

            if (type === "textarea") {
              return (
                <div key={field}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <Textarea
                    value={values[field as keyof FormValues]}
                    onChange={(e) => updateValue(field as keyof FormValues, e.target.value)}
                    placeholder={label}
                    rows={3}
                    className={errors[field as keyof FormValues] ? "border-red-400" : ""}
                  />
                  {errors[field as keyof FormValues] && (
                    <p className="text-red-500 text-xs mt-1">{errors[field as keyof FormValues]}</p>
                  )}
                </div>
              );
            }

            return (
              <div key={field}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {label}
                  {isRequired && <span className="text-red-500 ml-1">*</span>}
                </label>
                <Input
                  type={type}
                  value={values[field as keyof FormValues]}
                  onChange={(e) => updateValue(field as keyof FormValues, e.target.value)}
                  placeholder={label}
                  className={errors[field as keyof FormValues] ? "border-red-400" : ""}
                />
                {errors[field as keyof FormValues] && (
                  <p className="text-red-500 text-xs mt-1">{errors[field as keyof FormValues]}</p>
                )}
              </div>
            );
          })}

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-medium"
            disabled={submitting}
          >
            {submitting ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando...
              </span>
            ) : (
              "Enviar"
            )}
          </Button>
        </form>

        <div className="px-8 pb-6 text-center">
          <p className="text-xs text-gray-300">Powered by MSX CRM</p>
        </div>
      </div>
    </div>
  );
};

export default PublicContactForm;
