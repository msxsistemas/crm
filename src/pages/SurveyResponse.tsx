import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Star, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface SurveyQuestion {
  id: string;
  text: string;
  type: "rating" | "text" | "yesno";
  required?: boolean;
}

interface Survey {
  id: string;
  name: string;
  questions: SurveyQuestion[];
}

const API_URL = import.meta.env.VITE_API_URL || "https://api.msxzap.pro";

export default function SurveyResponse() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get("c");
  const contactId = searchParams.get("ct");

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!surveyId) return;
    fetch(`${API_URL}/custom-surveys/${surveyId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Pesquisa não encontrada");
        return r.json();
      })
      .then((data) => {
        setSurvey(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [surveyId]);

  const handleAnswer = (questionId: string, value: string | number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = async () => {
    if (!survey || !surveyId) return;

    // Validate required fields
    const unanswered = survey.questions.filter(
      (q) => q.required && (answers[q.id] === undefined || answers[q.id] === "")
    );
    if (unanswered.length > 0) {
      alert(`Por favor, responda as perguntas obrigatórias: ${unanswered.map((q) => q.text).join(", ")}`);
      return;
    }

    setSubmitting(true);
    try {
      const answersArray = survey.questions.map((q) => ({
        question_id: q.id,
        question_text: q.text,
        answer: answers[q.id] ?? null,
      }));

      const res = await fetch(`${API_URL}/survey/${surveyId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId || null,
          contact_id: contactId || null,
          answers: answersArray,
        }),
      });

      if (!res.ok) throw new Error("Erro ao enviar respostas");
      setSubmitted(true);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao enviar respostas");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-gray-700">Pesquisa não encontrada</p>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-blue-50">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full mx-4 text-center space-y-4">
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Obrigado!</h2>
          <p className="text-gray-600">Sua resposta foi enviada com sucesso. Sua opinião é muito importante para nós!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6 text-center">
          <div className="text-4xl mb-3">📋</div>
          <h1 className="text-2xl font-bold text-gray-800">{survey.name}</h1>
          <p className="text-gray-500 text-sm mt-1">Responda as perguntas abaixo</p>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {survey.questions.map((question, idx) => (
            <div key={question.id} className="bg-white rounded-xl shadow-sm p-5">
              <p className="font-medium text-gray-800 mb-3">
                {idx + 1}. {question.text}
                {question.required && <span className="text-red-500 ml-1">*</span>}
              </p>

              {question.type === "rating" && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleAnswer(question.id, star)}
                      className="focus:outline-none transition-transform hover:scale-110"
                    >
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          answers[question.id] !== undefined && star <= (answers[question.id] as number)
                            ? "text-yellow-400 fill-yellow-400"
                            : "text-gray-300 hover:text-yellow-300"
                        }`}
                      />
                    </button>
                  ))}
                  {answers[question.id] && (
                    <span className="ml-2 text-sm text-gray-500 self-center">
                      {answers[question.id]} de 5
                    </span>
                  )}
                </div>
              )}

              {question.type === "text" && (
                <Textarea
                  placeholder="Escreva sua resposta aqui..."
                  value={(answers[question.id] as string) || ""}
                  onChange={(e) => handleAnswer(question.id, e.target.value)}
                  className="resize-none"
                  rows={3}
                />
              )}

              {question.type === "yesno" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleAnswer(question.id, "sim")}
                    className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium transition-all ${
                      answers[question.id] === "sim"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-gray-200 hover:border-green-300 text-gray-600"
                    }`}
                  >
                    ✅ Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnswer(question.id, "nao")}
                    className={`flex-1 py-2.5 px-4 rounded-lg border-2 font-medium transition-all ${
                      answers[question.id] === "nao"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-gray-200 hover:border-red-300 text-gray-600"
                    }`}
                  >
                    ❌ Não
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Submit Button */}
        <div className="mt-6">
          <Button
            className="w-full py-3 text-base font-semibold"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              "Enviar Respostas"
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          Suas respostas são confidenciais e serão usadas para melhorar nosso atendimento.
        </p>
      </div>
    </div>
  );
}
