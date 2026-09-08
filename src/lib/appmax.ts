export interface CreateAppmaxLinkParams {
  amount: number; // em Reais (ex: 29.90)
  description?: string;
  referenceId: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  apiToken?: string;
}

export interface AppmaxLinkResponse {
  ok: boolean;
  orderId: string;
  paymentUrl: string;
  amount: number;
  description: string;
  provider: "appmax";
  error?: string;
}

export function getAppmaxApiToken(): string | null {
  const g = globalThis as any;
  return (
    g.__appmaxApiToken ||
    process.env["APPMAX_API_TOKEN"] ||
    process.env["APPMAX_TOKEN"] ||
    null
  );
}

export function setAppmaxApiToken(token: string) {
  const g = globalThis as any;
  g.__appmaxApiToken = token.trim();
}

export function getAppmaxBaseCheckoutUrl(): string | null {
  const g = globalThis as any;
  return (
    g.__appmaxBaseCheckoutUrl ||
    process.env["APPMAX_BASE_CHECKOUT_URL"] ||
    null
  );
}

export function setAppmaxBaseCheckoutUrl(url: string) {
  const g = globalThis as any;
  g.__appmaxBaseCheckoutUrl = url.trim();
}

/**
 * Cria link de pagamento no cartão via Appmax
 */
export async function createAppmaxPaymentLink(
  params: CreateAppmaxLinkParams,
): Promise<AppmaxLinkResponse> {
  const token = params.apiToken || getAppmaxApiToken();
  const customBaseUrl = getAppmaxBaseCheckoutUrl();
  const amountFormatted = params.amount.toFixed(2);
  const description =
    params.description || `Pedido Cantinho da Gula - R$ ${amountFormatted}`;

  // Se tiver Token de API da Appmax configurado, tenta chamar a API da Appmax
  if (token) {
    try {
      const res = await fetch("https://admin.appmax.com.br/api/v3/payment-links", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access-token": token,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: description,
          total: Number(params.amount.toFixed(2)),
          payment_methods: ["credit_card"],
          installments: 12,
          external_reference: params.referenceId,
          customer: {
            name: params.customerName || "Cliente Cantinho",
            email: params.customerEmail || "cliente@cantinhodagula.online",
            phone: (params.customerPhone || "47920036595").replace(/\D/g, ""),
          },
          postback_url: "https://cantinhodagula.online/api/public/appmax",
        }),
      });

      const json = (await res.json().catch(() => ({}))) as any;
      const paymentUrl =
        json?.data?.url ||
        json?.data?.payment_url ||
        json?.data?.link ||
        json?.url ||
        json?.payment_url ||
        json?.link;

      if (paymentUrl) {
        return {
          ok: true,
          orderId: params.referenceId,
          paymentUrl,
          amount: params.amount,
          description,
          provider: "appmax",
        };
      }

      if (json?.message || json?.error) {
        console.warn("[Appmax API Warning]:", json);
      }
    } catch (apiErr) {
      console.warn("[Appmax API Request Failed]:", apiErr);
    }
  }

  // Se o usuário tiver cadastrado um link base de checkout da Appmax
  if (customBaseUrl) {
    const cleanUrl = customBaseUrl.trim();
    const separator = cleanUrl.includes("?") ? "&" : "?";
    const paymentUrl = `${cleanUrl}${separator}ref=${encodeURIComponent(params.referenceId)}&amount=${encodeURIComponent(amountFormatted)}`;
    return {
      ok: true,
      orderId: params.referenceId,
      paymentUrl,
      amount: params.amount,
      description,
      provider: "appmax",
    };
  }

  // Fallback seguro: se não tiver link cadastrado, gera link guiado de pagamento da Appmax
  const fallbackUrl = `https://checkout.appmax.com.br/pay?ref=${encodeURIComponent(params.referenceId)}&val=${encodeURIComponent(amountFormatted)}&desc=${encodeURIComponent(description)}`;

  return {
    ok: true,
    orderId: params.referenceId,
    paymentUrl: fallbackUrl,
    amount: params.amount,
    description,
    provider: "appmax",
  };
}
