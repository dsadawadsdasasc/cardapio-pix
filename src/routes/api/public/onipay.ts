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
        const token = process.env["ONIPAY_TOKEN_API"];
        if (!token) return new Response("not configured", { status: 500 });

        const rawBody = await request.text();
        if (!validSignature(rawBody, request.headers.get("x-onipay-signature"), token)) {
          return new Response("invalid signature", { status: 401 });
        }

        const parsed = eventSchema.safeParse(JSON.parse(rawBody || "{}"));
        if (!parsed.success) return new Response("invalid payload", { status: 422 });
        const event = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { error: dupError } = await supabaseAdmin
          .from("payment_events")
          .insert({
            id: event.id,
            provider: "onipay",
            event_type: event.type,
            payload: parsed.data,
          });
        // Duplicate delivery: already processed.
        if (dupError?.code === "23505") return new Response(null, { status: 204 });

        if (event.type === "deposit.paid" && event.data.status === "PAID") {
          const orderId = event.data.externalId;
          const query = supabaseAdmin
            .from("orders")
            .update({
              payment_status: "paid",
              status: "confirmed",
              paid_at: event.data.paidAt ?? new Date().toISOString(),
            });
          const { error } = orderId
            ? await query.eq("id", orderId)
            : await query.eq("payment_reference", event.data.depositId);
          if (error) {
            console.error("order payment update failed", error);
            return new Response("update failed", { status: 500 });
          }
        }

        return new Response(null, { status: 204 });
      },
    },
  },
});
