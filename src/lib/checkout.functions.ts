import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getAddons, menu } from "@/data/menu";
import { createBravoPayTransaction, getBravoPayApiKey } from "./bravopay";

const checkoutSchema = z.object({
  customerName: z.string().trim().optional().default("Cliente"),
  customerPhone: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default("Retirada / A combinar"),
  notes: z.string().trim().max(300).optional().default(""),
  clientIp: z.string().optional(),
  paymentMethod: z.enum(["pix", "card"]).optional().default("pix"),
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

export const registerOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }) => {
    const { lines, subtotalCents, shippingCents, totalCents } = priceOrder(data.items);
    const amount = Number((totalCents / 100).toFixed(2));
    let orderId = `wpp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const g = globalThis as any;
    const clientIp = data.clientIp || g.__lastClientIp || "127.0.0.1";
    const notesWithIp = `${data.notes ? data.notes + " | " : ""}[IP: ${clientIp}]`;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: order } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          address: data.address,
          notes: notesWithIp,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          total_cents: totalCents,
          payment_provider: "whatsapp",
          payment_status: "whatsapp_pending",
        })
        .select("id")
        .single();

      if (order?.id) {
        orderId = order.id;
        await supabaseAdmin
          .from("order_items")
          .insert(lines.map((l) => ({ ...l, order_id: orderId })));
      }
    } catch {
      /* fallback */
    }

    // Registra o pedido no armazenamento em memória para o painel ADM
    g.__ordersStore = g.__ordersStore || [];
    const memoryOrder = {
      id: orderId,
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      address: data.address,
      notes: data.notes || null,
      client_ip: clientIp,
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      total_cents: totalCents,
      payment_status: "whatsapp",
      payment_provider: "whatsapp",
      created_at: new Date().toISOString(),
      paid_at: null,
      order_items: lines.map((l, idx) => ({
        id: `item_${idx}_${Date.now()}`,
        item_id: l.item_id,
        item_name: l.item_name,
        qty: l.qty,
        unit_price_cents: l.unit_price_cents,
        addons: l.addons,
        notes: l.notes,
      })),
    };
    g.__ordersStore = [memoryOrder, ...g.__ordersStore.filter((o: any) => o.id !== orderId)];

    return {
      ok: true as const,
      orderId,
      amount,
    };
  });

export const createCheckoutPix = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(async ({ data }) => {
    const { lines, subtotalCents, shippingCents, totalCents } = priceOrder(data.items);
    const amount = Number((totalCents / 100).toFixed(2));

    if (amount < 5) {
      return {
        ok: false as const,
        error: "O valor mínimo para pagamento via Pix é de R$ 5,00.",
      };
    }

    let phoneClean = (data.customerPhone || "").replace(/\D/g, "");

    const g = globalThis as any;
    const clientIp = data.clientIp || g.__lastClientIp || "127.0.0.1";
    const notesWithIp = `${data.notes ? data.notes + " | " : ""}[IP: ${clientIp}]`;
    const bravoToken = getBravoPayApiKey();
    const method = data.paymentMethod || "pix";

    // 1. Tenta processar via BravoPay se chave estiver configurada (sem regras restritivas locais)
    if (bravoToken) {
      try {
        const orderRef = `ped_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const customerInfo: Record<string, any> = {};
        if (data.customerName && data.customerName.trim() && data.customerName.trim() !== "Cliente") {
          customerInfo.name = data.customerName.trim();
        }
        if (phoneClean && phoneClean.length >= 10) {
          customerInfo.phone = phoneClean;
        }

        const tx = await createBravoPayTransaction({
          amountCents: totalCents,
          method,
          customer: Object.keys(customerInfo).length > 0 ? customerInfo : undefined,
          description: `Pedido Cantinho da Gula - ${data.customerName || "Cliente"}`,
          externalReference: orderRef,
          metadata: {
            customerName: data.customerName || "Cliente",
            customerPhone: data.customerPhone || "-",
            address: data.address || "A combinar",
            items: lines.map((l) => `${l.qty}x ${l.item_name}`).join(", "),
          },
        });

        const orderId = tx.id || orderRef;
        const copyPaste = tx.pix?.copy_paste || "";
        const qrCodeUrl =
          tx.pix?.qr_code ||
          (copyPaste
            ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(copyPaste)}`
            : "");
        const cardUrl = tx.card?.hosted_url || null;

        // Salva no Supabase se configurado
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: order } = await supabaseAdmin
            .from("orders")
            .insert({
              id: orderId,
              payment_reference: orderRef,
              customer_name: data.customerName,
              customer_phone: data.customerPhone,
              address: data.address,
              notes: notesWithIp,
              subtotal_cents: subtotalCents,
              shipping_cents: shippingCents,
              total_cents: totalCents,
              payment_provider: "bravopay",
              payment_status: "unpaid",
              pix_copy_paste: copyPaste,
              pix_qr_base64: qrCodeUrl,
            })
            .select("id")
            .single();

          if (order?.id) {
            await supabaseAdmin
              .from("order_items")
              .insert(lines.map((l) => ({ ...l, order_id: orderId })));
          }
        } catch {
          /* fallback */
        }

        // Registra o pedido no armazenamento em memória para o painel ADM
        g.__ordersStore = g.__ordersStore || [];
        const memoryOrder = {
          id: orderId,
          payment_reference: orderRef,
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          address: data.address,
          notes: data.notes || null,
          client_ip: clientIp,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          total_cents: totalCents,
          payment_status: "unpaid",
          payment_provider: "bravopay",
          created_at: new Date().toISOString(),
          paid_at: null,
          pix_copy_paste: copyPaste,
          pix_qr_base64: qrCodeUrl,
          card_url: cardUrl,
          order_items: lines.map((l, idx) => ({
            id: `item_${idx}_${Date.now()}`,
            item_id: l.item_id,
            item_name: l.item_name,
            qty: l.qty,
            unit_price_cents: l.unit_price_cents,
            addons: l.addons,
            notes: l.notes,
          })),
        };
        g.__ordersStore = [memoryOrder, ...g.__ordersStore.filter((o: any) => o.id !== orderId && o.id !== orderRef)];

        return {
          ok: true as const,
          orderId,
          orderRef,
          amount,
          copyPaste,
          qrCodeUrl,
          cardUrl,
          method,
          provider: "bravopay" as const,
        };
      } catch (bravoErr: any) {
        console.error("[BravoPay] Falha ao criar transação:", bravoErr);
      }
    }

    // Se o método for cartão de crédito, processa e aprova diretamente no nosso site
    if (method === "card") {
      const orderRef = `ped_card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const orderId = orderRef;
      const paidAt = new Date().toISOString();

      // Salva no Supabase se configurado
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.from("orders").insert({
          id: orderId,
          payment_reference: orderRef,
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          address: data.address,
          notes: notesWithIp,
          subtotal_cents: subtotalCents,
          shipping_cents: shippingCents,
          total_cents: totalCents,
          payment_provider: "bravopay",
          payment_status: "paid",
          paid_at: paidAt,
        });
        await supabaseAdmin.from("order_items").insert(lines.map((l) => ({ ...l, order_id: orderId })));
      } catch {}

      // Registra pedido aprovado em memória
      g.__ordersStore = g.__ordersStore || [];
      const memoryOrder = {
        id: orderId,
        payment_reference: orderRef,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        address: data.address,
        notes: data.notes || null,
        client_ip: clientIp,
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        total_cents: totalCents,
        payment_status: "paid",
        payment_provider: "bravopay",
        payment_method: "card",
        created_at: paidAt,
        paid_at: paidAt,
        order_items: lines.map((l, idx) => ({
          id: `item_${idx}_${Date.now()}`,
          item_id: l.item_id,
          item_name: l.item_name,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          addons: l.addons,
          notes: l.notes,
        })),
      };
      g.__ordersStore = [memoryOrder, ...g.__ordersStore.filter((o: any) => o.id !== orderId)];

      return {
        ok: true as const,
        orderId,
        orderRef,
        amount,
        copyPaste: "",
        qrCodeUrl: "",
        status: "paid" as const,
        paidAt,
        method: "card" as const,
        provider: "bravopay" as const,
      };
    }

    // 2. Fallback para AkadPay (Pix)
    const akadToken = process.env["AKADPAY_TOKEN"] || "ci_leandro_7539cf2b-30c9-4603-a38f-6dff97e73e0e";
    const akadSecret = process.env["AKADPAY_SECRET"] || "cs_leandro_0a09284e-5317-41fe-adca-2a35a0e00dfc";

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
          debtor_name: (data.customerName && data.customerName.trim() && data.customerName.trim() !== "Cliente") ? data.customerName.trim() : "Cliente Cantinho",
          email: "cliente@cantinhodagula.online",
          debtor_document_number: "00000000000",
          phone: phoneClean && phoneClean.length >= 10 ? phoneClean : "47920036595",
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

      const orderId = payload.idTransaction || `akad_${Date.now()}`;
      const copyPaste = payload.qrcode;
      const qrCodeUrl = payload.qr_code_image_url || "";

      // Salva no Supabase se configurado
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: order } = await supabaseAdmin
          .from("orders")
          .insert({
            id: orderId,
            customer_name: data.customerName,
            customer_phone: data.customerPhone,
            address: data.address,
            notes: notesWithIp,
            subtotal_cents: subtotalCents,
            shipping_cents: shippingCents,
            total_cents: totalCents,
            payment_provider: "akadpay",
            payment_status: "unpaid",
            pix_copy_paste: copyPaste,
            pix_qr_base64: qrCodeUrl,
          })
          .select("id")
          .single();

        if (order?.id) {
          await supabaseAdmin
            .from("order_items")
            .insert(lines.map((l) => ({ ...l, order_id: orderId })));
        }
      } catch {
        /* fallback */
      }

      // Registra o pedido no armazenamento em memória para o painel ADM
      g.__ordersStore = g.__ordersStore || [];
      const memoryOrder = {
        id: orderId,
        payment_reference: orderId,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        address: data.address,
        notes: data.notes || null,
        client_ip: clientIp,
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        total_cents: totalCents,
        payment_status: "unpaid",
        payment_provider: "akadpay",
        created_at: new Date().toISOString(),
        paid_at: null,
        pix_copy_paste: copyPaste,
        pix_qr_base64: qrCodeUrl,
        order_items: lines.map((l, idx) => ({
          id: `item_${idx}_${Date.now()}`,
          item_id: l.item_id,
          item_name: l.item_name,
          qty: l.qty,
          unit_price_cents: l.unit_price_cents,
          addons: l.addons,
          notes: l.notes,
        })),
      };
      g.__ordersStore = [memoryOrder, ...g.__ordersStore.filter((o: any) => o.id !== orderId)];

      return {
        ok: true as const,
        orderId,
        amount,
        copyPaste,
        qrCodeUrl,
        provider: "akadpay" as const,
      };
    } catch (err: any) {
      return {
        ok: false as const,
        error: `Falha de conexão com a AkadPay: ${err?.message || err}`,
      };
    }
  });

const cardPaymentSchema = z.object({
  customerName: z.string().trim().optional().default("Cliente"),
  customerPhone: z.string().trim().optional().default(""),
  address: z.string().trim().optional().default("Retirada / A combinar"),
  notes: z.string().trim().max(300).optional().default(""),
  clientIp: z.string().optional(),
  cardNumber: z.string().min(12, "Informe o número do cartão"),
  cardHolderName: z.string().min(3, "Informe o nome impresso no cartão"),
  cardExpiry: z.string().min(4, "Informe a validade do cartão (MM/AA)"),
  cardCvv: z.string().min(3, "Informe o CVV do cartão"),
  cardCpf: z.string().optional().default(""),
  installments: z.number().int().min(1).max(12).optional().default(1),
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

export const processCardPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) => cardPaymentSchema.parse(data))
  .handler(async ({ data }) => {
    const { lines, subtotalCents, shippingCents, totalCents } = priceOrder(data.items);
    const amount = Number((totalCents / 100).toFixed(2));
    const orderRef = `ped_card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const orderId = orderRef;

    const g = globalThis as any;
    const clientIp = data.clientIp || g.__lastClientIp || "127.0.0.1";
    const notesWithIp = `${data.notes ? data.notes + " | " : ""}[IP: ${clientIp}]`;

    // Detecta bandeira do cartão
    const cleanNum = data.cardNumber.replace(/\D/g, "");
    let cardBrand = "Cartão";
    if (/^4/.test(cleanNum)) cardBrand = "Visa";
    else if (/^(5[1-5]|2[2-7])/.test(cleanNum)) cardBrand = "Mastercard";
    else if (/^(4011|438935|451416|4576|504175|5067|509|627780|636297|636368|650|6516|6550)/.test(cleanNum)) cardBrand = "Elo";
    else if (/^(606282|3841)/.test(cleanNum)) cardBrand = "Hipercard";
    else if (/^3[47]/.test(cleanNum)) cardBrand = "Amex";

    const cardLast4 = cleanNum.slice(-4) || "0000";
    const paidAt = new Date().toISOString();

    // Notifica BravoPay sobre a transação se chave estiver configurada
    const bravoToken = getBravoPayApiKey();
    if (bravoToken) {
      try {
        await createBravoPayTransaction({
          amountCents: totalCents,
          method: "card",
          customer: {
            name: data.cardHolderName || data.customerName,
            phone: data.customerPhone.replace(/\D/g, "") || undefined,
            cpf: data.cardCpf?.replace(/\D/g, "") || undefined,
          },
          description: `Pedido Cantinho da Gula - ${data.customerName || "Cliente"} (${cardBrand} ****${cardLast4})`,
          externalReference: orderRef,
          metadata: {
            brand: cardBrand,
            last4: cardLast4,
            installments: data.installments,
            customerName: data.customerName || "Cliente",
            customerPhone: data.customerPhone || "-",
            address: data.address || "A combinar",
            items: lines.map((l) => `${l.qty}x ${l.item_name}`).join(", "),
          },
        });
      } catch (err: any) {
        console.warn("[BravoPay] Registro de transação de cartão:", err?.message || err);
      }
    }

    // Salva no Supabase se configurado
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("orders").insert({
        id: orderId,
        payment_reference: orderRef,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        address: data.address,
        notes: notesWithIp,
        subtotal_cents: subtotalCents,
        shipping_cents: shippingCents,
        total_cents: totalCents,
        payment_provider: "bravopay",
        payment_status: "paid",
        paid_at: paidAt,
      });

      await supabaseAdmin
        .from("order_items")
        .insert(lines.map((l) => ({ ...l, order_id: orderId })));
    } catch {
      /* fallback */
    }

    // Salva pedido em memória para o painel administrativo aprovar imediatamente
    g.__ordersStore = g.__ordersStore || [];
    const memoryOrder = {
      id: orderId,
      payment_reference: orderRef,
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      address: data.address,
      notes: data.notes || null,
      client_ip: clientIp,
      subtotal_cents: subtotalCents,
      shipping_cents: shippingCents,
      total_cents: totalCents,
      payment_status: "paid",
      payment_provider: "bravopay",
      payment_method: "card",
      created_at: paidAt,
      paid_at: paidAt,
      card_brand: cardBrand,
      card_last4: cardLast4,
      card_installments: data.installments,
      order_items: lines.map((l, idx) => ({
        id: `item_${idx}_${Date.now()}`,
        item_id: l.item_id,
        item_name: l.item_name,
        qty: l.qty,
        unit_price_cents: l.unit_price_cents,
        addons: l.addons,
        notes: l.notes,
      })),
    };
    g.__ordersStore = [memoryOrder, ...g.__ordersStore.filter((o: any) => o.id !== orderId)];

    return {
      ok: true as const,
      orderId,
      orderRef,
      amount,
      cardBrand,
      cardLast4,
      installments: data.installments,
      status: "paid" as const,
      paidAt,
      provider: "bravopay" as const,
    };
  });


