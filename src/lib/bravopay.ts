import crypto from "node:crypto";

export interface CreateBravoPayTransactionParams {
  amountCents: number;
  method?: "pix" | "card";
  productId?: string;
  customer?: {
    email?: string;
    name?: string;
    cpf?: string;
    phone?: string;
  };
  description?: string;
  externalReference?: string;
  metadata?: Record<string, any>;
  utm?: Record<string, any>;
  apiKey?: string;
}

export interface BravoPayTransactionResponse {
  id: string;
  object?: string;
  status: string;
  method: string;
  amount_cents: number;
  fee_cents?: number;
  net_cents?: number;
  currency?: string;
  pix?: {
    copy_paste: string;
    expires_at?: string;
    qr_code?: string;
  };
  card?: {
    hosted_url: string;
    message?: string;
  };
  created_at?: string;
}

export function getBravoPayApiKey(): string | null {
  const g = globalThis as any;
  return (
    g.__bravoPayApiKey ||
    process.env["BRAVOPAY_API_KEY"] ||
    process.env["BRAVOPAY_TOKEN"] ||
    null
  );
}

export function setBravoPayApiKey(key: string) {
  const g = globalThis as any;
  g.__bravoPayApiKey = key.trim();
}

export function getBravoPayWebhookSecret(): string | null {
  const g = globalThis as any;
  return (
    g.__bravoPayWebhookSecret ||
    process.env["BRAVOPAY_WEBHOOK_SECRET"] ||
    null
  );
}

export function setBravoPayWebhookSecret(secret: string) {
  const g = globalThis as any;
  g.__bravoPayWebhookSecret = secret.trim();
}

export async function createBravoPayTransaction(
  params: CreateBravoPayTransactionParams,
): Promise<BravoPayTransactionResponse> {
  const token = params.apiKey || getBravoPayApiKey();
  if (!token) {
    throw new Error(
      "Chave de API BravoPay não configurada. Configure BRAVOPAY_API_KEY no painel de administração ou variáveis de ambiente.",
    );
  }

  const customerData: Record<string, any> = {};
  if (params.customer?.name && params.customer.name.trim()) {
    customerData.name = params.customer.name.trim();
  }
  if (params.customer?.email && params.customer.email.trim()) {
    customerData.email = params.customer.email.trim();
  }
  if (params.customer?.phone && params.customer.phone.trim()) {
    const p = params.customer.phone.replace(/\D/g, "");
    if (p.length >= 10) customerData.phone = p;
  }
  if (params.customer?.cpf && params.customer.cpf.trim()) {
    const cleanCpf = params.customer.cpf.replace(/\D/g, "");
    if (cleanCpf && cleanCpf.length >= 11 && cleanCpf !== "00000000000") {
      customerData.cpf = cleanCpf;
    }
  }

  const payload: Record<string, any> = {
    amount_cents: Math.round(params.amountCents),
    method: params.method || "pix",
    description: params.description?.slice(0, 300) || "Pedido Cantinho da Gula",
    // Desativa anti_desvio agressivo para permitir aprovação 100% direta pela gateway
    anti_desvio: false,
  };

  if (Object.keys(customerData).length > 0) {
    payload.customer = customerData;
  }

  if (params.productId) {
    payload.product_id = params.productId;
  }
  if (params.externalReference) {
    payload.external_reference = params.externalReference.slice(0, 120);
  }
  if (params.metadata && Object.keys(params.metadata).length > 0) {
    payload.metadata = params.metadata;
  }
  if (params.utm && Object.keys(params.utm).length > 0) {
    payload.utm = params.utm;
  }

  const res = await fetch("https://bravopay.club/api/v1/transactions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as any;

  if (!res.ok || json?.error) {
    const errMsg =
      json?.error?.message ||
      json?.message ||
      `Erro BravoPay (${res.status}): Não foi possível processar a cobrança.`;
    throw new Error(errMsg);
  }

  return json as BravoPayTransactionResponse;
}

export async function getBravoPayAccount(apiKey?: string) {
  const token = apiKey || getBravoPayApiKey();
  if (!token) {
    throw new Error("Chave de API BravoPay não fornecida.");
  }

  const res = await fetch("https://bravopay.club/api/v1/me", {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
    },
  });

  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || "Falha ao obter dados da conta BravoPay.");
  }

  return json;
}

export function verifyBravoPayWebhook(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret?: string | null,
  toleranceSec = 300,
): boolean {
  const effectiveSecret = secret || getBravoPayWebhookSecret();
  // Se nenhum secret estiver configurado, aceita a requisição
  if (!effectiveSecret) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  try {
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((kv) => {
        const idx = kv.indexOf("=");
        return idx !== -1 ? [kv.slice(0, idx).trim(), kv.slice(idx + 1).trim()] : ["", ""];
      }),
    );

    const t = Number(parts.t);
    if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) {
      return false; // Replay attack protection
    }

    const expected = crypto
      .createHmac("sha256", effectiveSecret)
      .update(`${t}.${rawBody}`)
      .digest("hex");

    if (!parts.v1 || expected.length !== parts.v1.length) {
      return false;
    }

    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}
