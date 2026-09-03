import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ADMIN_USER = "miguelzinho67";
const ADMIN_PASS = "chupapika22";

const adminAuthSchema = z.object({
  username: z.string().trim(),
  password: z.string().trim(),
});

export const loginAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminAuthSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.username === ADMIN_USER && data.password === ADMIN_PASS) {
      return { ok: true as const, token: Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString("base64") };
    }
    return { ok: false as const, error: "Usuário ou senha incorretos." };
  });

export const getAdminOrders = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => adminAuthSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.username !== ADMIN_USER || data.password !== ADMIN_PASS) {
      return { ok: false as const, error: "Não autorizado." };
    }

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

    if (ordersError) {
      console.error("Fetch admin orders error:", ordersError);
      return { ok: false as const, error: "Falha ao carregar pedidos." };
    }

    return {
      ok: true as const,
      orders: orders || [],
    };
  });
