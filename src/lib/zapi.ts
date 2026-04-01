import { supabase } from "@/integrations/supabase/client";

interface ZApiCredentials {
  instanceId: string;
  instanceToken: string;
  clientToken: string;
}

async function callZApi(
  credentials: ZApiCredentials,
  action: string,
  data?: Record<string, unknown>
) {
  try {
    const { data: result, error } = await supabase.functions.invoke("zapi", {
      body: {
        action,
        instanceId: credentials.instanceId,
        instanceToken: credentials.instanceToken,
        clientToken: credentials.clientToken,
        data,
      },
    });

    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(result.error);
    return result;
  } catch (err) {
    console.warn(`Z-API (${action}):`, (err as Error).message);
    throw err;
  }
}

export async function getZApiQRCode(credentials: ZApiCredentials) {
  return callZApi(credentials, "get_qrcode");
}

export async function getZApiStatus(credentials: ZApiCredentials) {
  return callZApi(credentials, "get_status");
}

export async function disconnectZApi(credentials: ZApiCredentials) {
  return callZApi(credentials, "disconnect");
}

export async function sendZApiMessage(
  credentials: ZApiCredentials,
  phone: string,
  message: string
) {
  return callZApi(credentials, "send_message", { phone, message });
}

export async function sendZApiMedia(
  credentials: ZApiCredentials,
  phone: string,
  mediaUrl: string,
  caption?: string
) {
  return callZApi(credentials, "send_media", { phone, mediaUrl, caption });
}
