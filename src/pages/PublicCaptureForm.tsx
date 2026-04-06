import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_URL || "https://api.msxzap.pro") as string;

interface FormField {
  label: string;
  type: string;
  required: boolean;
}

interface CaptureFormDef {
  id: string;
  name: string;
  slug: string;
  fields: FormField[];
}

export default function PublicCaptureForm() {
  const { slug } = useParams<{ slug: string }>();
  const [formDef, setFormDef] = useState<CaptureFormDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    fetch(`${API_BASE}/public/capture/${slug}`)
      .then((r) => {
        if (r.status === 404) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setFormDef(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  function handleChange(label: string, value: string) {
    setValues((prev) => ({ ...prev, [label]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    // Map standard fields
    const payload: Record<string, string> = {};
    for (const [label, value] of Object.entries(values)) {
      const normalized = label.toLowerCase();
      if (normalized.includes("nome") || normalized.includes("name")) payload.name = value;
      else if (normalized.includes("telefone") || normalized.includes("phone") || normalized.includes("tel")) payload.phone = value;
      else if (normalized.includes("email") || normalized.includes("e-mail")) payload.email = value;
      else payload[label] = value;
    }

    try {
      const res = await fetch(`${API_BASE}/public/capture/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Erro ao enviar formulário");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Carregando formulário...</p>
      </div>
    );
  }

  if (notFound || !formDef) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-2xl font-bold text-gray-700 mb-2">Formulário não encontrado</p>
          <p className="text-gray-500 text-sm">Este link pode estar incorreto ou ter expirado.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Enviado com sucesso!</h2>
          <p className="text-gray-500 text-sm">
            Recebemos suas informações. Em breve entraremos em contato.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{formDef.name}</h1>
        <p className="text-gray-500 text-sm mb-6">Preencha o formulário abaixo</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {formDef.fields.map((field, index) => (
            <div key={index}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === "textarea" ? (
                <textarea
                  required={field.required}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  value={values[field.label] || ""}
                  onChange={(e) => handleChange(field.label, e.target.value)}
                />
              ) : (
                <input
                  type={field.type}
                  required={field.required}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={values[field.label] || ""}
                  onChange={(e) => handleChange(field.label, e.target.value)}
                />
              )}
            </div>
          ))}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-60"
          >
            {submitting ? "Enviando..." : "Enviar"}
          </button>
        </form>
      </div>
    </div>
  );
}
