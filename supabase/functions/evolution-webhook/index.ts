import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function uploadBase64ToStorage(
  supabase: ReturnType<typeof createClient>,
  base64Data: string,
  mimeType: string,
) {
  const cleanBase64 = base64Data.includes(",") ? base64Data.split(",").pop()! : base64Data;
  const ext = mimeType.split("/")[1]?.split(";")[0] || "bin";
  const fileName = `webhook/${Date.now()}_${crypto.randomUUID()}.${ext}`;

  const binaryString = atob(cleanBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const { error: uploadErr } = await supabase.storage
    .from("chat-media")
    .upload(fileName, bytes, { contentType: mimeType });

  if (uploadErr) throw uploadErr;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/storage/v1/object/public/chat-media/${fileName}`;
}

async function resolveIncomingMediaUrl(
  supabase: ReturnType<typeof createClient>,
  instanceName: string,
  messageData: any,
  messageContent: any,
  rawMediaUrl: string | null,
) {
  const mimeType = messageContent?.imageMessage?.mimetype ||
    messageContent?.videoMessage?.mimetype ||
    messageContent?.audioMessage?.mimetype ||
    messageContent?.documentMessage?.mimetype ||
    messageContent?.stickerMessage?.mimetype ||
    "application/octet-stream";

  if (messageData?.base64) {
    try {
      return await uploadBase64ToStorage(supabase, messageData.base64, mimeType);
    } catch (e) {
      console.warn("Base64 media processing error:", e);
    }
  }

  if (rawMediaUrl?.includes("mmg.whatsapp.net")) {
    try {
      const evoUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
      const evoKey = Deno.env.get("EVOLUTION_API_KEY");
      if (evoUrl && evoKey) {
        const base64Res = await fetch(`${evoUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: evoKey,
          },
          body: JSON.stringify({
            message: {
              key: messageData?.key,
            },
            convertToMp4: false,
          }),
        });

        if (base64Res.ok) {
          const base64Payload = await base64Res.json();
          const fetchedBase64 = base64Payload?.base64 || base64Payload?.data?.base64 || base64Payload?.message?.base64;
          if (fetchedBase64) {
            return await uploadBase64ToStorage(supabase, fetchedBase64, mimeType);
          }
        } else {
          console.warn("Failed to fetch media base64:", await base64Res.text());
        }
      }
    } catch (e) {
      console.warn("Remote media fetch error:", e);
    }
  }

  return rawMediaUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload).substring(0, 500));

    const event = payload.event;
    const instanceName = payload.instance;

    if (event === "messages.upsert") {
      const messageData = payload.data;
      if (!messageData) return new Response("OK", { headers: corsHeaders });

      const key = messageData.key;
      const fromMe = key?.fromMe || false;
      const rawRemoteJid = key?.remoteJid || key?.remoteJidAlt || "";
      const phone = String(rawRemoteJid).split("@")[0].split(":")[0].replace(/\D/g, "");

      const unwrapMessage = (message: any) => {
        let current = message;
        for (let i = 0; i < 5; i += 1) {
          if (!current) break;
          if (current.ephemeralMessage?.message) {
            current = current.ephemeralMessage.message;
            continue;
          }
          if (current.viewOnceMessage?.message) {
            current = current.viewOnceMessage.message;
            continue;
          }
          if (current.viewOnceMessageV2?.message) {
            current = current.viewOnceMessageV2.message;
            continue;
          }
          if (current.viewOnceMessageV2Extension?.message) {
            current = current.viewOnceMessageV2Extension.message;
            continue;
          }
          break;
        }
        return current;
      };

      const messageContent = unwrapMessage(messageData.message) || {};
      const interactiveResponse = messageContent?.interactiveResponseMessage;
      const nativeFlowResponse = interactiveResponse?.nativeFlowResponseMessage;

      const safeParseJson = (value: unknown) => {
        if (typeof value !== "string" || !value.trim()) return null;
        try {
          return JSON.parse(value);
        } catch (e) {
          console.warn("Native flow params parse error:", e);
          return null;
        }
      };

      const nativeFlowParams = safeParseJson(nativeFlowResponse?.paramsJson);
      const buttonReply = messageContent?.buttonReplyMessage;

      const selectedButtonId =
        messageContent?.buttonsResponseMessage?.selectedButtonId ||
        buttonReply?.selectedButtonId ||
        buttonReply?.selectedId ||
        messageContent?.templateButtonReplyMessage?.selectedId ||
        nativeFlowParams?.id ||
        nativeFlowParams?.buttonId ||
        nativeFlowParams?.button_id ||
        nativeFlowParams?.selectedId ||
        nativeFlowParams?.rowId ||
        nativeFlowParams?.row_id ||
        nativeFlowParams?.selectedRowId ||
        nativeFlowResponse?.name ||
        "";

      const selectedButtonText =
        messageContent?.buttonsResponseMessage?.selectedDisplayText ||
        buttonReply?.selectedDisplayText ||
        buttonReply?.displayText ||
        messageContent?.templateButtonReplyMessage?.selectedDisplayText ||
        interactiveResponse?.body?.text ||
        interactiveResponse?.body?.title ||
        nativeFlowParams?.display_text ||
        nativeFlowParams?.displayText ||
        nativeFlowParams?.title ||
        nativeFlowParams?.text ||
        "";

      const selectedListValue =
        messageContent?.listResponseMessage?.singleSelectReply?.selectedRowId ||
        messageContent?.listResponseMessage?.singleSelectReply?.title ||
        messageContent?.listResponseMessage?.title ||
        nativeFlowParams?.rowId ||
        nativeFlowParams?.selectedRowId ||
        "";

      // --- Extract media info ---
      let mediaType: string | null = null;
      let mediaUrl: string | null = null;

      if (messageContent?.imageMessage) {
        mediaType = "image";
        mediaUrl = messageContent.imageMessage.url || messageContent.imageMessage.directPath || null;
      } else if (messageContent?.videoMessage) {
        mediaType = "video";
        mediaUrl = messageContent.videoMessage.url || messageContent.videoMessage.directPath || null;
      } else if (messageContent?.audioMessage) {
        mediaType = "audio";
        mediaUrl = messageContent.audioMessage.url || messageContent.audioMessage.directPath || null;
      } else if (messageContent?.documentMessage) {
        mediaType = "document";
        mediaUrl = messageContent.documentMessage.url || messageContent.documentMessage.directPath || null;
      } else if (messageContent?.stickerMessage) {
        mediaType = "image";
        mediaUrl = messageContent.stickerMessage.url || messageContent.stickerMessage.directPath || null;
      }

      // Try to get media URL from messageData.media if not found in messageContent
      if (!mediaUrl && messageData.media) {
        mediaUrl = messageData.media.url || messageData.media || null;
      }

      mediaUrl = await resolveIncomingMediaUrl(
        supabase,
        instanceName,
        messageData,
        messageContent,
        mediaUrl,
      );

      const messageBodyCandidates = [
        messageContent?.conversation,
        messageContent?.extendedTextMessage?.text,
        messageContent?.imageMessage?.caption,
        messageContent?.videoMessage?.caption,
        messageContent?.documentMessage?.caption,
        messageContent?.documentMessage?.fileName,
        selectedButtonId,
        selectedListValue,
        selectedButtonText,
      ];

      const messageBody = String(
        messageBodyCandidates.find((value) => typeof value === "string" && value.trim().length > 0) || ""
      ).trim();

      // Allow messages with media even if body is empty
      if (!phone || (!messageBody && !mediaType)) {
        console.log("Skipping message without parsable phone/body/media", {
          phone,
          hasMessage: Boolean(messageData?.message),
          messageKeys: Object.keys(messageContent || {}),
        });
        return new Response("OK", { headers: corsHeaders });
      }

      // Upsert contact - only use pushName for incoming messages (the lead's name)
      const contactName = !fromMe ? (messageData.pushName || phone) : null;
      
      // Check if contact exists first
      const { data: existingContact } = await supabase
        .from("contacts")
        .select("id, name, avatar_url")
        .eq("phone", phone)
        .single();

      let contact;
      if (existingContact) {
        const updates: Record<string, any> = {};
        if (contactName && (!existingContact.name || existingContact.name === phone)) {
          updates.name = contactName;
        }
        // Fetch avatar if missing
        if (!existingContact.avatar_url) {
          try {
            const evoUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
            const evoKey = Deno.env.get("EVOLUTION_API_KEY");
            if (evoUrl && evoKey) {
              const picRes = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: evoKey },
                body: JSON.stringify({ number: phone }),
              });
              if (picRes.ok) {
                const picData = await picRes.json();
                const avatarUrl = picData?.profilePictureUrl || picData?.picture || null;
                if (avatarUrl) updates.avatar_url = avatarUrl;
              }
            }
          } catch (e) { console.warn("Profile pic fetch:", e); }
        }
        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString();
          await supabase.from("contacts").update(updates).eq("id", existingContact.id);
        }
        contact = existingContact;
      } else {
        // Fetch profile picture from Evolution API
        let avatarUrl: string | null = null;
        try {
          const evoUrl = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
          const evoKey = Deno.env.get("EVOLUTION_API_KEY");
          if (evoUrl && evoKey) {
            const picRes = await fetch(`${evoUrl}/chat/fetchProfilePictureUrl/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoKey },
              body: JSON.stringify({ number: phone }),
            });
            if (picRes.ok) {
              const picData = await picRes.json();
              avatarUrl = picData?.profilePictureUrl || picData?.picture || null;
            }
          }
        } catch (e) { console.warn("Profile pic fetch:", e); }

        const { data: newContact } = await supabase
          .from("contacts")
          .insert({ phone, name: contactName || phone, avatar_url: avatarUrl, updated_at: new Date().toISOString() })
          .select("id")
          .single();
        contact = newContact;
      }

      if (!contact) {
        console.error("Failed to upsert contact");
        return new Response("Error", { status: 500, headers: corsHeaders });
      }

      // Get or create conversation - find any non-closed conversation first
      let { data: conversation } = await supabase
        .from("conversations")
        .select("id, status, unread_count")
        .eq("contact_id", contact.id)
        .eq("instance_name", instanceName)
        .neq("status", "closed")
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // If no active conversation, check for a closed one to reopen
      if (!conversation) {
        const { data: closedConvo } = await supabase
          .from("conversations")
          .select("id, status")
          .eq("contact_id", contact.id)
          .eq("instance_name", instanceName)
          .eq("status", "closed")
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (closedConvo && !fromMe) {
          // Reopen the closed conversation to "open" (Aguardando)
          await supabase
            .from("conversations")
            .update({
              status: "open",
              unread_count: 1,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", closedConvo.id);
          conversation = closedConvo;
          console.log("Reopened closed conversation:", closedConvo.id);
        } else if (closedConvo && fromMe) {
          // Just update the closed conversation for outgoing messages
          await supabase
            .from("conversations")
            .update({
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", closedConvo.id);
          conversation = closedConvo;
        }
      }

      if (!conversation) {
        const { data: newConvo } = await supabase
          .from("conversations")
          .insert({
            contact_id: contact.id,
            instance_name: instanceName,
            status: "open",
            unread_count: fromMe ? 0 : 1,
            last_message_at: new Date().toISOString(),
          })
          .select("id")
          .single();
        conversation = newConvo;

        // Auto-create kanban card in default "Novo Lead" column
        if (!fromMe && contact) {
          try {
            // Find any default column (is_default = true)
            const { data: defaultCol } = await supabase
              .from("kanban_columns")
              .select("id")
              .eq("is_default", true)
              .limit(1)
              .single();

            if (defaultCol) {
              // Check if card already exists for this contact
              const { data: existingCard } = await supabase
                .from("kanban_cards")
                .select("id")
                .eq("contact_id", contact.id)
                .limit(1)
                .single();

              if (!existingCard) {
                await supabase.from("kanban_cards").insert({
                  column_id: defaultCol.id,
                  contact_id: contact.id,
                  name: messageData.pushName || phone,
                  phone,
                  position: 0,
                });
                console.log("Kanban card created for contact:", contact.id);
              }
            }
          } catch (e) {
            console.warn("Kanban card creation skipped:", e);
          }
        }
      } else {
        // Update existing active conversation without turning it back into a new waiting chat
        const now = new Date().toISOString();
        const currentUnread = Number(conversation.unread_count || 0);

        const updates: Record<string, unknown> = {
          last_message_at: now,
          updated_at: now,
        };

        if (fromMe) {
          updates.unread_count = 0;
        } else {
          updates.unread_count = currentUnread + 1;
        }

        await supabase
          .from("conversations")
          .update(updates)
          .eq("id", conversation.id);
      }

      if (!conversation) {
        console.error("Failed to get/create conversation");
        return new Response("Error", { status: 500, headers: corsHeaders });
      }

      // Insert message (with media info if present)
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        from_me: fromMe,
        body: messageBody || (mediaType === "audio" ? "🎤 Áudio" : mediaType === "image" ? "📷 Imagem" : mediaType === "video" ? "🎥 Vídeo" : mediaType === "document" ? "📄 Documento" : ""),
        whatsapp_message_id: key?.id || null,
        status: fromMe ? "sent" : "delivered",
        media_url: mediaUrl,
        media_type: mediaType,
      });

      // If not from me, trigger chatbot
      if (!fromMe) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const chatbotRes = await fetch(`${supabaseUrl}/functions/v1/chatbot`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({
              conversationId: conversation.id,
              contactId: contact.id,
              instanceName,
              phone,
              message: messageBody,
            }),
          });

          const chatbotBody = await chatbotRes.text();
          if (!chatbotRes.ok) {
            console.error("Chatbot invoke failed:", chatbotRes.status, chatbotBody);
          } else {
            console.log("Chatbot invoke ok:", chatbotRes.status, chatbotBody.substring(0, 300));
          }
        } catch (e) {
          console.error("Chatbot invoke error:", e);
        }
      }
    }

    return new Response("OK", { headers: corsHeaders });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
