import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { FREE_SHIPPING_FROM, getAddons, menu } from "@/data/menu";

const DELIVERY_FEE = 0;
const PROJECT_ID = "f66dd207-fb73-4981-a30d-0072f3e43864";

const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().min(8).max(30),
  address: z.string().trim().min(6).max(200),
  notes: z.string().trim().max(300).optional().default(""),
  items: z
    .array(
      z.object({
        itemId: z.string().min(1).max(60),
        qty: z.number().int().min(1).max(30),
        addonIds: z.array(z.string().min(1).max(60)).max(20).default([]),
        notes: z.string().trim().max(200).default(""),
      }),
    )
    .min(1)
    .max(40),
});

type CheckoutInput = z.infer<typeof checkoutSchema>;

const toCents = (v: number) => Math.round(v * 100);

function crc16(str: string): string {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function generatePixPayload(key: string, name: string, city: string, amount: number, txId: string = "***"): string {
  const cleanKey = key.trim();
  const cleanName = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 25);
  const cleanCity = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").slice(0, 15);
  const amountStr = amount.toFixed(2);

  const merchantAccount = `0014br.gov.bcb.pix01${cleanKey.length.toString().padStart(2, "0")}${cleanKey}`;
  const merchantAccountField = `26${merchantAccount.length.toString().padStart(2, "0")}${merchantAccount}`;

  const mcc = "52040000";
  const currency = "5303986";
  const amountField = `54${amountStr.length.toString().padStart(2, "0")}${amountStr}`;
  const country = "5802BR";
  const nameField = `59${cleanName.length.toString().padStart(2, "0")}${cleanName}`;
  const cityField = `60${cleanCity.length.toString().padStart(2, "0")}${cleanCity}`;
  
  const additionalData = `05${txId.length.toString().padStart(2, "0")}${txId}`;
  const additionalDataField = `62${additionalData.length.toString().padStart(2, "0")}${additionalData}`;

  const rawPayload = `000201${merchantAccountField}${mcc}${currency}${amountField}${country}${nameField}${cityField}${additionalDataField}6304`;
  
  const checksum = crc16(rawPayload);
  return `${rawPayload}${checksum}`;
}

function priceOrder(items: CheckoutInput["items"]) {
  const lines = items.map((line) => {
    const item = menu.find((m) => m.id === line.itemId);
    if (!item) throw new Error("Item indisponível no cardápio.");
    const addons = getAddons(item.category).filter((a) => line.addonIds.includes(a.id));
    const unit = item.price + addons.reduce((s, a) => s + a.price, 0);
    return {
      item_id: item.id,
      item_name: item.name,
      qty: line.qty,
      unit_price_cents: toCents(unit),
      addons: addons.map((a) => ({ id: a.id, name: a.name, price: a.price })),
      notes: line.notes || null,
    };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.unit_price_cents * l.qty, 0);
  const shippingCents = 0;
  return { lines, subtotalCents, shippingCents, totalCents: subtotalCents };
}

function callbackUrl() {
  const fallback = "https://google.com/callback";
  try {
    const url = new URL(getRequest().url);
    if (url.protocol === "https:" && !url.hostname.includes("localhost")) {
      return `${url.origin}/api/public/onipay`;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

export const createPixOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }) => {
    const token = process.env["ONIPAY_TOKEN_API"] || "36a96084e79738123f70dd7b610cb749";
    const { lines, subtotalCents, shippingCents, totalCents } = priceOrder(data.items);
    const amount = Number((totalCents / 100).toFixed(2));

    if (amount < 10 || amount > 1000) {
      return {
        ok: false as const,
        error:
          "A OniPay aceita pedidos Pix a partir de R$ 10,00 até R$ 1.000,00. Adicione mais itens para continuar!",
      };
    }

    let orderId = `ord_${Math.random().toString(36).substring(2, 10)}`;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: order, error: orderError } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          address: data.address,
          notes: data.notes || null,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          total_cents: totalCents,
          payment_provider: token ? "onipay" : "pix_direct",
        })
        .select("id")
        .single();

      if (order?.id) {
        orderId = order.id;
        const { error: itemsError } = await supabaseAdmin
          .from("order_items")
          .insert(lines.map((l) => ({ ...l, order_id: orderId })));
        if (itemsError) console.error("order items insert failed", itemsError);
      }
    } catch (dbErr) {
      console.warn("DB insert fallback mode:", dbErr);
    }

    // Se a chave de API do OniPay não estiver configurada, gera o código Pix direto com CRC16 válido
    if (!token) {
      console.warn("[OniPay] Token de API não configurado. Gerando chave Pix de pagamento direto.");
      const pixKey = process.env["PIX_KEY"] || "cantinhodagula@pix.com.br";
      const fallbackCopyPaste = generatePixPayload(pixKey, "Cantinho da Gula", "BALNEARIO", amount, orderId.slice(0, 20));

      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("orders")
          .update({
            pix_copy_paste: fallbackCopyPaste,
            payment_status: "unpaid",
          })
          .eq("id", orderId);
      } catch {
        /* ignore fallback update error */
      }

      return {
        ok: true as const,
        orderId: orderId,
        amount,
        copyPaste: fallbackCopyPaste,
        qrCodeBase64: "",
        paid: false,
      };
    }

    let payload: {
      data?: {
        id?: string;
        pix?: { copyPaste?: string; qrCodeBase64?: string };
        status?: string;
      };
      error?: { message?: string };
    } = {};

    try {
      const res = await fetch("https://onipaybot.com.br/api/v1/deposits/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `pedido-${orderId}`,
        },
        body: JSON.stringify({
          amount,
          callbackUrl: callbackUrl(),
          externalId: orderId,
        }),
      });
      payload = (await res.json().catch(() => ({}))) as typeof payload;
      if (!res.ok) {
        console.error("onipay error", res.status, payload?.error?.message);
        return {
          ok: false as const,
          error:
            payload?.error?.message ??
            "A OniPay não conseguiu gerar o Pix agora. Tente novamente.",
        };
      }
    } catch (err) {
      console.error("onipay request failed", err);
      return { ok: false as const, error: "Falha ao falar com o provedor de pagamento." };
    }

    const deposit = payload.data;
    const copyPaste = deposit?.pix?.copyPaste ?? "";
    if (!copyPaste) {
      return { ok: false as const, error: "A OniPay não retornou o código Pix." };
    }

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("orders")
        .update({
          payment_reference: deposit?.id ?? null,
          pix_copy_paste: copyPaste,
          pix_qr_base64: deposit?.pix?.qrCodeBase64 ?? null,
          payment_status: deposit?.status === "PAID" ? "paid" : "unpaid",
        })
        .eq("id", orderId);
    } catch {
      /* ignore db update error */
    }

    return {
      ok: true as const,
      orderId: orderId,
      amount,
      copyPaste,
      qrCodeBase64: deposit?.pix?.qrCodeBase64 ?? "",
      paid: deposit?.status === "PAID",
    };
  });

export const getOrderPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order } = await supabaseAdmin
      .from("orders")
      .select("payment_status, total_cents")
      .eq("id", data.orderId)
      .maybeSingle();
    return {
      paid: order?.payment_status === "paid",
      totalCents: order?.total_cents ?? 0,
    };
  });
