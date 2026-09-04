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
