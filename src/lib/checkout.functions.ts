import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getAddons, menu } from "@/data/menu";

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

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: order } = await supabaseAdmin
        .from("orders")
        .insert({
          customer_name: data.customerName,
          customer_phone: data.customerPhone,
          address: data.address,
          notes: data.notes || null,
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
    const g = globalThis as any;
    g.__ordersStore = g.__ordersStore || [];
    const memoryOrder = {
      id: orderId,
      customer_name: data.customerName,
      customer_phone: data.customerPhone,
      address: data.address,
      notes: data.notes || null,
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
