import { api } from "@/lib/api";

export async function createInstance(instanceName: string) {
  return api.post('/evolution/instance/create', { instanceName });
}

export async function getQRCode(instanceName: string) {
  return api.get(`/evolution/instance/qr/${instanceName}`);
}

export async function getInstanceStatus(instanceName: string) {
  return api.get(`/evolution/instance/status/${instanceName}`);
}

export async function sendMessage(instanceName: string, phone: string, message: string) {
  return api.post('/evolution-proxy', {
    action: 'send_message',
    instanceName,
    data: { number: phone, text: message },
  });
}

export async function sendMedia(
  instanceName: string,
  phone: string,
  mediaUrl: string,
  mediaType: string,
  caption?: string
) {
  return api.post('/evolution/send-media', { instanceName, phone, fileUrl: mediaUrl, mediaType, caption });
}

export async function listInstances() {
  return api.get('/evolution/instance/list');
}

export async function setupWebhook(instanceName: string) {
  return api.post(`/evolution/instance/webhook/${instanceName}`, {});
}

export async function deleteInstance(instanceName: string) {
  return api.delete(`/evolution/instance/${instanceName}`);
}
