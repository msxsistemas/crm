import { supabase } from "@/lib/db";

export interface CiabraCustomer {
  fullName: string;
  document: string;
  email?: string;
  phone?: string;
  business?: string;
  address?: {
    address?: string;
    city?: string;
    neighborhood?: string;
    number?: string;
    zipcode?: string;
    complement?: string;
    state?: string;
  };
}

export interface CiabraInvoice {
  customerId: string;
  description?: string;
  dueDate?: string;
  price: number;
  paymentTypes?: string[];
  installmentCount?: number;
  invoiceType?: "SINGLE" | "INSTALLMENT";
  externalId?: string;
  redirectTo?: string;
  items?: unknown[];
  notifications?: unknown[];
  webhooks?: { hookType: string; url: string }[];
}

async function callCiabra(action: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("ciabra", {
    body: { action, ...params },
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.success) {
    throw new Error(data?.error || "Unknown Ciabra error");
  }

  return data.data;
}

export const ciabraApi = {
  check: () => callCiabra("check"),

  createCustomer: (customer: CiabraCustomer) =>
    callCiabra("create_customer", customer as unknown as Record<string, unknown>),

  getCustomer: (customerId: string) =>
    callCiabra("get_customer", { customerId }),

  createInvoice: (invoice: CiabraInvoice) =>
    callCiabra("create_invoice", invoice as unknown as Record<string, unknown>),

  getInvoice: (invoiceId: string) =>
    callCiabra("get_invoice", { invoiceId }),

  getPayments: (installmentId: string) =>
    callCiabra("get_payments", { installmentId }),

  getPix: (installmentId: string) =>
    callCiabra("get_pix", { installmentId }),
};
