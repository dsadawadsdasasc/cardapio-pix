import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(60),
  data: z.object({
    depositId: z.string().min(1).max(100),
    externalId: z.string().max(100).nullable().optional(),
    status: z.string().max(30),
    paidAt: z.string().max(40).optional(),
  }),
});

function validSignature(rawBody: string, signature: string | null, token: string) {
  const expected = `sha256=${createHmac("sha256", token).update(rawBody).digest("hex")}`;
  const received = Buffer.from(signature ?? "", "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  return received.length === expectedBuf.length && timingSafeEqual(received, expectedBuf);
}

export const Route = createFileRoute("/api/public/onipay")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env["ONIPAY_TOKEN_API"] || "36a96084e79738123f70dd7b610cb749";
        const rawBody = await request.text();

        const sig = request.headers.get("x-onipay-signature");
        if (sig && !validSignature(rawBody, sig, token)) {
          console.warn("[OniPay Webhook] Assinatura inválida recebida");
          return new Response("invalid signature", { status: 401 });
        }

        let event: any = {};
        try {
          event = JSON.parse(rawBody || "{}");
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const externalId = event.data?.externalId || event.externalId;
        const depositId = event.data?.depositId || event.data?.id || event.id;
        const status = event.data?.status || event.status;
        const type = event.type;

        // Armazena no Set global para resposta instantânea ao checkout
        const g = globalThis as any;
        g.__paidOrders = g.__paidOrders || new Set();

        if (status === "PAID" || type === "deposit.paid") {
          if (externalId) g.__paidOrders.add(String(externalId));
          if (depositId) g.__paidOrders.add(String(depositId));

          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const query = supabaseAdmin
              .from("orders")
              .update({
                payment_status: "paid",
                status: "confirmed",
                paid_at: event.data?.paidAt ?? new Date().toISOString(),
              });
            if (externalId) {
              await query.eq("id", externalId);
            } else if (depositId) {
              await query.eq("payment_reference", depositId);
            }
          } catch (dbErr) {
            console.warn("[OniPay Webhook] DB update fallback:", dbErr);
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
