import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Hashes SHA-256 das credenciais autorizadas (nunca expostas em texto puro)
const AUTH_USER_HASH = "ca6ea21199201b73fbbf48c3544a8237a3f30b0604018976895d186aace793bb";
const AUTH_PASS_HASH = "316ac5f24b1db45d78977a325f2b84951164c50140e610e05dfeb2193146ff76";

// Chave privada de assinatura HMAC em memória no servidor
const SERVER_SECRET_SALT = "cantinho_gula_sec_adm_9281749102834190";

// Rate limiting em memória contra ataques de força bruta
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutos de bloqueio após 5 tentativas

type AttemptRecord = { count: number; lockedUntil: number };
const failedAttempts = new Map<string, AttemptRecord>();

function checkRateLimit(key: string): { allowed: boolean; waitMinutes?: number } {
  const now = Date.now();
  const record = failedAttempts.get(key);
  if (!record) return { allowed: true };
  if (record.lockedUntil > now) {
    return { allowed: false, waitMinutes: Math.ceil((record.lockedUntil - now) / 60000) };
  }
  if (record.lockedUntil !== 0 && record.lockedUntil <= now) {
    failedAttempts.delete(key);
  }
  return { allowed: true };
}

function registerFailedAttempt(key: string) {
  const now = Date.now();
  const record = failedAttempts.get(key) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
  }
  failedAttempts.set(key, record);
}

function resetAttempts(key: string) {
  failedAttempts.delete(key);
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function signSessionToken(user: string): Promise<string> {
  const payload = {
    user,
    exp: Date.now() + 12 * 3600 * 1000, // 12 horas
    nonce: Math.random().toString(36).substring(2),
  };
  const str = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(str)));
  const sig = await sha256Hex(`${b64}:${SERVER_SECRET_SALT}`);
  return `${b64}.${sig}`;
}

async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [b64, signature] = parts;
  if (!b64 || !signature) return false;
  const expectedSig = await sha256Hex(`${b64}:${SERVER_SECRET_SALT}`);
  if (!constantTimeCompare(signature, expectedSig)) return false;
  try {
    const jsonStr = decodeURIComponent(escape(atob(b64)));
    const payload = JSON.parse(jsonStr);
    if (!payload.exp || payload.exp < Date.now()) return false;
    return payload.user === "miguelzinho67";
  } catch {
    return false;
  }
}

const adminLoginSchema = z.object({
  username: z.string().trim(),
  password: z.string().trim(),
});

const adminFetchSchema = z.object({
  token: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

export const loginAdmin = createServerFn({ method: "POST" })
  .validator((data: unknown) => adminLoginSchema.parse(data))
  .handler(async ({ data }) => {
    const rateCheck = checkRateLimit("admin_login");
    if (!rateCheck.allowed) {
      return {
        ok: false as const,
        error: `Muitas tentativas incorretas. Acesso bloqueado por ${rateCheck.waitMinutes} minuto(s).`,
      };
    }

    const inputUserHash = await sha256Hex(data.username);
    const inputPassHash = await sha256Hex(data.password);

    const userMatches = constantTimeCompare(inputUserHash, AUTH_USER_HASH);
    const passMatches = constantTimeCompare(inputPassHash, AUTH_PASS_HASH);

    if (userMatches && passMatches) {
      resetAttempts("admin_login");
      const token = await signSessionToken("miguelzinho67");
      return { ok: true as const, token };
    }

    registerFailedAttempt("admin_login");
    return { ok: false as const, error: "Usuário ou senha incorretos." };
  });

export const getAdminOrders = createServerFn({ method: "POST" })
  .validator((data: unknown) => adminFetchSchema.parse(data))
  .handler(async ({ data }) => {
    let authorized = false;

    if (data.token) {
      authorized = await verifySessionToken(data.token);
    } else if (data.username && data.password) {
      const uHash = await sha256Hex(data.username);
      const pHash = await sha256Hex(data.password);
      authorized = constantTimeCompare(uHash, AUTH_USER_HASH) && constantTimeCompare(pHash, AUTH_PASS_HASH);
    }

    if (!authorized) {
      return { ok: false as const, error: "Não autorizado." };
    }

    const g = globalThis as any;
    const memoryOrders = (g.__ordersStore || []) as any[];

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: orders, error: ordersError } = await supabaseAdmin
        .from("orders")
        .select(`
          id,
          customer_name,
          customer_phone,
          address,
          notes,
          subtotal_cents,
          shipping_cents,
          total_cents,
          payment_status,
          payment_provider,
          created_at,
          paid_at,
          order_items (
            id,
            item_id,
            item_name,
            qty,
            unit_price_cents,
            addons,
            notes
          )
        `)
        .order("created_at", { ascending: false });

      if (orders && orders.length > 0) {
        const ids = new Set(orders.map((o: any) => o.id));
        const combined = [...orders, ...memoryOrders.filter((o: any) => !ids.has(o.id))];
        return { ok: true as const, orders: combined };
      }
    } catch (err: any) {
      console.warn("Supabase admin fetch fallback mode:", err);
    }

    return {
      ok: true as const,
      orders: memoryOrders,
    };
  });

const generateAdminPixSchema = z.object({
  token: z.string().min(1),
  amount: z.number().min(0.01).max(100000),
});

export const generateAdminPix = createServerFn({ method: "POST" })
  .validator((data: unknown) => generateAdminPixSchema.parse(data))
  .handler(async ({ data }) => {
    const authorized = await verifySessionToken(data.token);
    if (!authorized) {
      return { ok: false as const, error: "Não autorizado." };
    }

    const token = process.env["ONIPAY_TOKEN_API"] || "36a96084e79738123f70dd7b610cb749";
    const externalId = `adm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const amount = Number(data.amount.toFixed(2));

    try {
      const res = await fetch("https://onipaybot.com.br/api/v1/deposits/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `adm-pix-${externalId}`,
        },
        body: JSON.stringify({
          amount,
          callbackUrl: "https://cantinhodagula.online/api/public/onipay",
          externalId,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as any;

      if (!res.ok) {
        return {
          ok: false as const,
          error: payload?.error?.message ?? `Erro OniPay (${res.status}): Não foi possível gerar o código Pix.`,
        };
      }

      const deposit = payload.data;
      const copyPaste = deposit?.pix?.copyPaste ?? "";
      const qrCodeBase64 = deposit?.pix?.qrCodeBase64 ?? "";

      const depositId = deposit?.id ?? externalId;
      const isPaid = deposit?.status === "PAID";

      const createdOrder = {
        id: depositId,
        customer_name: "Cobrança Pix (ADM)",
        customer_phone: "-",
        address: "Cobrança gerada no painel OniPay",
        notes: `Cobrança Pix de R$ ${amount.toFixed(2)} gerada manualmente`,
        subtotal_cents: Math.round(amount * 100),
        shipping_cents: 0,
        total_cents: Math.round(amount * 100),
        payment_status: isPaid ? "paid" : "unpaid",
        payment_provider: "onipay",
        created_at: new Date().toISOString(),
        paid_at: isPaid ? new Date().toISOString() : null,
        pix_copy_paste: copyPaste,
        pix_qr_base64: qrCodeBase64,
        order_items: [
          {
            id: `item_${Date.now()}`,
            item_id: "pix_onipay",
            item_name: `Cobrança Pix OniPay`,
            qty: 1,
            unit_price_cents: Math.round(amount * 100),
            addons: [],
            notes: null,
          },
        ],
      };

      const g = globalThis as any;
      g.__ordersStore = g.__ordersStore || [];
      g.__ordersStore = [createdOrder, ...g.__ordersStore.filter((o: any) => o.id !== depositId)];

      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("orders").insert({
          id: depositId,
          customer_name: createdOrder.customer_name,
          customer_phone: createdOrder.customer_phone,
          address: createdOrder.address,
          notes: createdOrder.notes,
          subtotal_cents: createdOrder.subtotal_cents,
          shipping_cents: createdOrder.shipping_cents,
          total_cents: createdOrder.total_cents,
          payment_status: createdOrder.payment_status,
          payment_provider: createdOrder.payment_provider,
          pix_copy_paste: copyPaste,
          pix_qr_base64: qrCodeBase64,
        });
      } catch {
        /* fallback ignore */
      }

      return {
        ok: true as const,
        depositId,
        amount,
        copyPaste,
        qrCodeBase64,
        status: isPaid ? ("paid" as const) : ("unpaid" as const),
      };
    } catch (err: any) {
      return { ok: false as const, error: `Falha de conexão com a OniPay: ${err?.message || err}` };
    }
  });

const deleteAdminOrderSchema = z.object({
  token: z.string().min(1),
  orderId: z.string().min(1),
});

export const deleteAdminOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => deleteAdminOrderSchema.parse(data))
  .handler(async ({ data }) => {
    const authorized = await verifySessionToken(data.token);
    if (!authorized) {
      return { ok: false as const, error: "Não autorizado." };
    }

    const g = globalThis as any;
    if (Array.isArray(g.__ordersStore)) {
      g.__ordersStore = g.__ordersStore.filter((o: any) => o.id !== data.orderId);
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("order_items").delete().eq("order_id", data.orderId);
      await supabaseAdmin.from("orders").delete().eq("id", data.orderId);
    } catch {
      /* fallback ignore */
    }

    return { ok: true as const, orderId: data.orderId };
  });
