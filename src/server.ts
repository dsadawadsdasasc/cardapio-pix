import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (env && typeof env === "object") {
        Object.assign(process.env, env);
      }
      const url = new URL(request.url);
      const clientIp =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-real-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "127.0.0.1";
      (globalThis as any).__lastClientIp = clientIp;

      // Endpoint direto para consulta de IP pelo cliente
      if (url.pathname === "/api/my-ip") {
        return new Response(JSON.stringify({ ip: clientIp }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "cache-control": "no-store",
          },
        });
      }

      // Endpoint para checagem em tempo real do status de um pedido
      if (url.pathname === "/api/check-order-status") {
        const orderId = url.searchParams.get("id");
        const g = globalThis as any;
        let isPaid = false;
        if (orderId && Array.isArray(g.__ordersStore)) {
          const found = g.__ordersStore.find(
            (o: any) => o.id === orderId || o.payment_reference === orderId,
          );
          if (
            found &&
            (found.payment_status === "paid" ||
              found.status === "confirmed" ||
              found.status === "paid" ||
              found.paid_at)
          ) {
            isPaid = true;
          }
        }
        if (!isPaid && orderId) {
          try {
            const { supabaseAdmin } = await import("./integrations/supabase/client.server");
            const { data } = await supabaseAdmin
              .from("orders")
              .select("payment_status, status, paid_at")
              .or(`id.eq.${orderId},payment_reference.eq.${orderId}`)
              .maybeSingle();
            if (
              data &&
              (data.payment_status === "paid" ||
                data.status === "confirmed" ||
                data.status === "paid" ||
                data.paid_at)
            ) {
              isPaid = true;
            }
          } catch {}
        }
        return new Response(JSON.stringify({ paid: isPaid, orderId }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "access-control-allow-origin": "*",
            "cache-control": "no-store",
          },
        });
      }

      // Webhook automático da AkadPay
      if (
        request.method === "POST" &&
        (url.pathname === "/api/public/akadpay" || url.pathname === "/api/webhook/akadpay")
      ) {
        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const depositId =
            body?.idTransaction ||
            body?.data?.idTransaction ||
            body?.id ||
            body?.data?.id ||
            body?.externalId;
          const rawStatus = (body?.status || body?.data?.status || "").toLowerCase();
          const isPaidStatus =
            rawStatus === "paid" ||
            rawStatus === "approved" ||
            rawStatus === "pago" ||
            rawStatus === "completed" ||
            rawStatus === "success";

          if (isPaidStatus && depositId) {
            const g = globalThis as any;
            if (Array.isArray(g.__ordersStore)) {
              g.__ordersStore = g.__ordersStore.map((o: any) => {
                if (o.id === depositId || o.payment_reference === depositId) {
                  return {
                    ...o,
                    payment_status: "paid",
                    status: "confirmed",
                    paid_at: new Date().toISOString(),
                  };
                }
                return o;
              });
            }
            try {
              const { supabaseAdmin } = await import("./integrations/supabase/client.server");
              await supabaseAdmin
                .from("orders")
                .update({
                  payment_status: "paid",
                  status: "confirmed",
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .or(`id.eq.${depositId},payment_reference.eq.${depositId}`);
            } catch {}
          }
          return new Response(JSON.stringify({ ok: true, status: "success" }), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ ok: false }), { status: 400 });
        }
      }

      // Webhook automático da OniPay
      if (request.method === "POST" && (url.pathname === "/api/public/onipay" || url.pathname === "/api/webhook/onipay")) {
        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const depositId = body?.data?.depositId || body?.data?.id || body?.id || body?.data?.externalId;
          const status = body?.data?.status || body?.status;
          if (status === "PAID" || status === "paid" || body?.type === "deposit.paid") {
            const g = globalThis as any;
            if (Array.isArray(g.__ordersStore)) {
              g.__ordersStore = g.__ordersStore.map((o: any) => {
                if (o.id === depositId || o.payment_reference === depositId) {
                  return { ...o, payment_status: "paid", status: "confirmed", paid_at: new Date().toISOString() };
                }
                return o;
              });
            }
            try {
              const { supabaseAdmin } = await import("./integrations/supabase/client.server");
              await supabaseAdmin
                .from("orders")
                .update({
                  payment_status: "paid",
                  status: "confirmed",
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .or(`id.eq.${depositId},payment_reference.eq.${depositId}`);
            } catch {}
          }
          return new Response(JSON.stringify({ ok: true }), {
            headers: { "content-type": "application/json" },
          });
        } catch {
          return new Response(JSON.stringify({ ok: false }), { status: 400 });
        }
      }

      // Webhook automático da BravoPay (PIX e Cartão)
      if (
        request.method === "POST" &&
        (url.pathname === "/api/public/bravopay" || url.pathname === "/api/webhook/bravopay")
      ) {
        try {
          const rawBody = await request.text();
          const sigHeader =
            request.headers.get("bravopay-signature") ||
            request.headers.get("x-bravopay-signature");

          const { verifyBravoPayWebhook } = await import("./lib/bravopay");
          const isValid = verifyBravoPayWebhook(rawBody, sigHeader);
          if (!isValid) {
            console.warn("[BravoPay Webhook] Assinatura inválida rejeitada.");
            return new Response(JSON.stringify({ error: "Assinatura inválida" }), {
              status: 401,
              headers: { "content-type": "application/json" },
            });
          }

          let body: any = {};
          try {
            body = JSON.parse(rawBody);
          } catch {
            return new Response(JSON.stringify({ error: "JSON inválido" }), { status: 400 });
          }

          const eventType = body?.type || "";
          const txData = body?.data || body;
          const txId = txData?.id;
          const externalRef = txData?.external_reference;
          const rawStatus = (txData?.status || body?.status || "").toUpperCase();

          const isPaid =
            eventType === "transaction.paid" ||
            rawStatus === "PAID" ||
            rawStatus === "CONFIRMED" ||
            rawStatus === "COMPLETED";

          if (isPaid && (txId || externalRef)) {
            const g = globalThis as any;
            if (Array.isArray(g.__ordersStore)) {
              g.__ordersStore = g.__ordersStore.map((o: any) => {
                const matchTx = txId && (o.id === txId || o.payment_reference === txId);
                const matchRef = externalRef && (o.id === externalRef || o.payment_reference === externalRef);
                if (matchTx || matchRef) {
                  return {
                    ...o,
                    payment_status: "paid",
                    status: "confirmed",
                    paid_at: new Date().toISOString(),
                  };
                }
                return o;
              });
            }

            try {
              const { supabaseAdmin } = await import("./integrations/supabase/client.server");
              const filterParts = [];
              if (txId) {
                filterParts.push(`id.eq.${txId}`, `payment_reference.eq.${txId}`);
              }
              if (externalRef) {
                filterParts.push(`id.eq.${externalRef}`, `payment_reference.eq.${externalRef}`);
              }
              await supabaseAdmin
                .from("orders")
                .update({
                  payment_status: "paid",
                  status: "confirmed",
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .or(filterParts.join(","));
            } catch (err) {
              console.warn("[BravoPay Webhook] Supabase update warning:", err);
            }
          }

          return new Response(JSON.stringify({ ok: true, received: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          console.error("[BravoPay Webhook] Erro:", err);
          return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 400 });
        }
      }

      // Webhook automático da Appmax (Cartão de Crédito)
      if (
        request.method === "POST" &&
        (url.pathname === "/api/public/appmax" || url.pathname === "/api/webhook/appmax")
      ) {
        try {
          const body = (await request.json().catch(() => ({}))) as any;
          const eventType = (body?.event || body?.type || "").toLowerCase();
          const dataObj = body?.data || body;
          const status = (dataObj?.status || body?.status || "").toLowerCase();
          const orderRef =
            dataObj?.external_reference ||
            dataObj?.reference ||
            dataObj?.order_id ||
            dataObj?.id ||
            body?.external_reference ||
            body?.order_id ||
            body?.id;

          const isPaid =
            eventType.includes("paid") ||
            eventType.includes("approved") ||
            status === "paid" ||
            status === "approved" ||
            status === "authorized";

          if (isPaid && orderRef) {
            const g = globalThis as any;
            if (Array.isArray(g.__ordersStore)) {
              g.__ordersStore = g.__ordersStore.map((o: any) => {
                if (o.id === orderRef || o.payment_reference === orderRef) {
                  return {
                    ...o,
                    payment_status: "paid",
                    status: "confirmed",
                    paid_at: new Date().toISOString(),
                  };
                }
                return o;
              });
            }

            try {
              const { supabaseAdmin } = await import("./integrations/supabase/client.server");
              await supabaseAdmin
                .from("orders")
                .update({
                  payment_status: "paid",
                  status: "confirmed",
                  paid_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                })
                .or(`id.eq.${orderRef},payment_reference.eq.${orderRef}`);
            } catch (err) {
              console.warn("[Appmax Webhook] Supabase update warning:", err);
            }
          }

          return new Response(JSON.stringify({ ok: true, status: "success" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        } catch (err: any) {
          console.error("[Appmax Webhook] Erro:", err);
          return new Response(JSON.stringify({ ok: false, error: err?.message }), { status: 400 });
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
