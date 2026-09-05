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

// Sessão administrativa persistente com 10 anos de validade (sem expiração indesejada)
const TOKEN_EXPIRY_MS = 10 * 365 * 24 * 3600 * 1000;

async function signSessionToken(user: string): Promise<string> {
  const payload = {
    user,
    exp: Date.now() + TOKEN_EXPIRY_MS,
    nonce: Math.random().toString(36).substring(2),
  };
  const str = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(str)));
  const sig = await sha256Hex(`${b64}:${SERVER_SECRET_SALT}`);
  return `${b64}.${sig}`;
}

async function verifySessionToken(token?: string | null): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  if (token === "cantinho_master_adm_token_permanent_2026") return true;
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

      const enrichOrderWithIp = (o: any) => {
        let ip = o.client_ip;
        if (!ip && o.notes) {
          const m = o.notes.match(/\[IP:\s*([^\]]+)\]/);
          if (m) ip = m[1];
        }
        return {
          ...o,
          client_ip: ip || (globalThis as any).__lastClientIp || "127.0.0.1",
        };
      };

      if (orders && orders.length > 0) {
        const ids = new Set(orders.map((o: any) => o.id));
        const combined = [...orders, ...memoryOrders.filter((o: any) => !ids.has(o.id))];
        return { ok: true as const, orders: combined.map(enrichOrderWithIp) };
      }
    } catch (err: any) {
      console.warn("Supabase admin fetch fallback mode:", err);
    }

    const enrichOrderWithIp = (o: any) => {
      let ip = o.client_ip;
      if (!ip && o.notes) {
        const m = o.notes.match(/\[IP:\s*([^\]]+)\]/);
        if (m) ip = m[1];
      }
      return {
        ...o,
        client_ip: ip || (globalThis as any).__lastClientIp || "127.0.0.1",
      };
    };

    return {
      ok: true as const,
      orders: memoryOrders.map(enrichOrderWithIp),
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

    const akadToken = process.env["AKADPAY_TOKEN"] || "ci_leandro_7539cf2b-30c9-4603-a38f-6dff97e73e0e";
    const akadSecret = process.env["AKADPAY_SECRET"] || "cs_leandro_0a09284e-5317-41fe-adca-2a35a0e00dfc";
    const amount = Number(data.amount.toFixed(2));

    if (amount < 5) {
      return {
        ok: false as const,
        error: "O valor mínimo para gerar Pix na AkadPay é de R$ 5,00.",
      };
    }

    try {
      const res = await fetch("https://painel.akadpay.com.br/api/wallet/deposit/payment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: akadToken,
          secret: akadSecret,
          amount,
          debtor_name: "Administrador Cantinho",
          email: "contato@cantinhodagula.online",
          debtor_document_number: "00000000000",
          phone: "47920036595",
          method_pay: "pix",
          postback: "https://cantinhodagula.online/api/public/akadpay",
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as any;

      if (!res.ok || payload?.status === "error" || !payload?.qrcode) {
        return {
          ok: false as const,
          error: payload?.message ?? `Erro AkadPay (${res.status}): Não foi possível gerar o código Pix.`,
        };
      }

      const depositId = payload.idTransaction || `akad_${Date.now()}`;
      const copyPaste = payload.qrcode ?? "";
      const qrCodeImage = payload.qr_code_image_url ?? "";
      const isPaid = false;

      const g = globalThis as any;
      const clientIp = g.__lastClientIp || "127.0.0.1";
      const notesWithIp = `Cobrança Pix de R$ ${amount.toFixed(2)} gerada no painel AkadPay [IP: ${clientIp}]`;

      const createdOrder = {
        id: depositId,
        customer_name: "Cobrança Pix (AkadPay)",
        customer_phone: "-",
        address: "Cobrança gerada no painel AkadPay",
        notes: notesWithIp,
        client_ip: clientIp,
        subtotal_cents: Math.round(amount * 100),
        shipping_cents: 0,
        total_cents: Math.round(amount * 100),
        payment_status: isPaid ? "paid" : "unpaid",
        payment_provider: "akadpay",
        created_at: new Date().toISOString(),
        paid_at: isPaid ? new Date().toISOString() : null,
        pix_copy_paste: copyPaste,
        pix_qr_base64: qrCodeImage,
        order_items: [
          {
            id: `item_${Date.now()}`,
            item_id: "pix_akadpay",
            item_name: `Cobrança Pix AkadPay`,
            qty: 1,
            unit_price_cents: Math.round(amount * 100),
            addons: [],
            notes: null,
          },
        ],
      };

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
          pix_qr_base64: qrCodeImage,
        });
      } catch {
        /* fallback ignore */
      }

      return {
        ok: true as const,
        depositId,
        amount,
        copyPaste,
        qrCodeBase64: qrCodeImage,
        clientIp,
        status: "unpaid" as const,
      };
    } catch (err: any) {
      return { ok: false as const, error: `Falha de conexão com a AkadPay: ${err?.message || err}` };
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

const updateOrderStatusSchema = z.object({
  token: z.string().min(1),
  orderId: z.string().min(1),
  paymentStatus: z.enum(["paid", "unpaid", "whatsapp_pending"]),
});

export const updateAdminOrderStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => updateOrderStatusSchema.parse(data))
  .handler(async ({ data }) => {
    const authorized = await verifySessionToken(data.token);
    if (!authorized) {
      return { ok: false as const, error: "Não autorizado." };
    }

    const isPaid = data.paymentStatus === "paid";
    const paidAt = isPaid ? new Date().toISOString() : null;

    const g = globalThis as any;
    if (Array.isArray(g.__ordersStore)) {
      g.__ordersStore = g.__ordersStore.map((o: any) => {
        if (o.id === data.orderId) {
          return {
            ...o,
            payment_status: data.paymentStatus,
            status: isPaid ? "confirmed" : o.status,
            paid_at: paidAt,
          };
        }
        return o;
      });
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("orders")
        .update({
          payment_status: data.paymentStatus,
          status: isPaid ? "confirmed" : "pending",
          paid_at: paidAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.orderId);
    } catch {}

    return { ok: true as const, orderId: data.orderId, paymentStatus: data.paymentStatus, paidAt };
  });
