import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sendMedia } from "@/lib/evolution-api";
import { toast } from "sonner";

const SUPABASE_URL = "https://vjpkrulpokzjihlmevht.supabase.co";

function getMediaType(file: File): string {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("video/")) return "video";
  return "document";
}

export function useMediaUpload() {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const uploadAndSend = async ({
    file,
    instanceName,
    phone,
    conversationId,
    onOptimistic,
    onSuccess,
    onError,
  }: {
    file: File;
    instanceName: string;
    phone: string;
    conversationId: string;
    onOptimistic?: (msg: { id: string; body: string; mediaUrl: string; mediaType: string }) => void;
    onSuccess?: () => void;
    onError?: (err: Error) => void;
  }) => {
    if (!file || !instanceName || !conversationId) return;

    const maxSize = 16 * 1024 * 1024; // 16MB
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo: 16MB");
      return;
    }

    setUploading(true);
    const mediaType = getMediaType(file);
    const ext = file.name.split(".").pop() || "bin";
    const filePath = `${conversationId}/${Date.now()}.${ext}`;

    // Optimistic message
    const tempId = `temp-media-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    onOptimistic?.({ id: tempId, body: file.name, mediaUrl: localUrl, mediaType });

    try {
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(filePath, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/chat-media/${filePath}`;

      // Send via WhatsApp
      await sendMedia(instanceName, phone, publicUrl, mediaType, file.name);

      // Persist in DB
      const { error: dbError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        body: file.name,
        from_me: true,
        status: "sent",
        media_url: publicUrl,
        media_type: mediaType,
      });

      if (dbError) throw dbError;

      await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", conversationId);

      onSuccess?.();
    } catch (err: any) {
      console.error("Media upload error:", err);
      toast.error("Erro ao enviar mídia: " + (err?.message || "Tente novamente"));
      onError?.(err);
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  };

  return { uploading, fileInputRef, openFilePicker, uploadAndSend, getMediaType };
}
