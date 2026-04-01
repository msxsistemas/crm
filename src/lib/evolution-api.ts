import { supabase } from "@/integrations/supabase/client";


const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;

async function callEvolutionApi(action: string, instanceName?: string, data?: Record<string, unknown>) {
  try {
    const { data: result, error } = await supabase.functions.invoke("evolution-api", {
      body: { action, instanceName, data },
    });

    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(result.error);
    return result;
  } catch (err) {
    console.warn(`Evolution API (${action}):`, (err as Error).message);
    throw err;
  }
}

export async function createInstance(instanceName: string) {
  return callEvolutionApi("create_instance", undefined, { instanceName });
}

export async function getQRCode(instanceName: string) {
  return callEvolutionApi("get_qrcode", instanceName);
}

export async function getInstanceStatus(instanceName: string) {
  return callEvolutionApi("instance_status", instanceName);
}

export async function sendMessage(instanceName: string, phone: string, message: string) {
  return callEvolutionApi("send_message", instanceName, { phone, message });
}

export async function sendMedia(
  instanceName: string,
  phone: string,
  mediaUrl: string,
  mediaType: string,
  caption?: string
) {
  return callEvolutionApi("send_media", instanceName, { phone, mediaUrl, mediaType, caption });
}

export async function listInstances() {
  return callEvolutionApi("list_instances");
}

export async function setupWebhook(instanceName: string) {
  const webhookUrl = `https://${PROJECT_ID}.supabase.co/functions/v1/evolution-webhook`;
  return callEvolutionApi("set_webhook", instanceName, { webhookUrl });
}
