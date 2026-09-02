import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Truck } from "lucide-react";


import heroImg from "@/assets/hero.jpg";
import {
  categories,
  formatBRL,
  getAddons,
  menu,
  type CategoryId,
  type MenuItem,
} from "@/data/menu";
import { cart, useCart } from "@/lib/cart";
import { createPixOrder, getOrderPaymentStatus } from "@/lib/checkout.functions";


export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search["tab"] === "pedido" ? ("pedido" as const) : ("cardapio" as const),
  }),
  head: () => ({
    meta: [
      { title: "Cantinho da Gula | Delivery 24h de xis, pizza, sushi e açaí" },
      {
        name: "description",
        content:
          "Delivery aberto 24 horas, 7 dias por semana em Balneário Camboriú: combos baratos, xis gaúcho, pizza artesanal, barcas de sushi, bolos e açaí. Frete grátis acima de R$ 119,90.",
      },
      { property: "og:title", content: "Cantinho da Gula | Delivery 24h em Balneário Camboriú" },
      {
        property: "og:description",
        content:
          "Aberto 24/7. Xis, pizzas, barcas de sushi, baurus, bolos e açaí feitos na hora, com adicionais e observações no pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FREE_SHIPPING_FROM = 119.9;
const DELIVERY_FEE = 40;
// Número da loja no WhatsApp (formato internacional, só dígitos).
const WHATSAPP_NUMBER = "5547920036595";

type PixState = {
  orderId: string;
  copyPaste: string;
  qrCodeBase64: string;
  paid: boolean;
};


const filters: { id: CategoryId | "todos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  ...categories.map((c) => ({ id: c.id, label: c.label })),
];

const lineUnitPrice = (item: MenuItem, addonIds: string[]) =>
  item.price +
  getAddons(item.category)
    .filter((a) => addonIds.includes(a.id))
    .reduce((s, a) => s + a.price, 0);

function Index() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const [active, setActive] = useState<CategoryId | "todos">("todos");
  const lines = useCart();

  const setTab = (next: "cardapio" | "pedido") =>
    navigate({ to: "/", search: { tab: next } });

  const groups = useMemo(
    () =>
      categories
        .filter((c) => active === "todos" || c.id === active)
        .map((c) => ({
          id: c.id,
          label: c.label,
          image: c.image,
          items: menu.filter((i) => i.category === c.id),
        }))
        .filter((g) => g.items.length > 0),
    [active],
  );

  const detailed = useMemo(
    () =>
      lines
        .map((l) => {
          const item = menu.find((m) => m.id === l.itemId);
          if (!item) return null;
          const addons = getAddons(item.category).filter((a) =>
            l.addonIds.includes(a.id),
          );
          return { line: l, item, addons, total: lineUnitPrice(item, l.addonIds) * l.qty };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
    [lines],
  );

  const itemCount = detailed.reduce((n, d) => n + d.line.qty, 0);
  const subtotal = detailed.reduce((s, d) => s + d.total, 0);
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : DELIVERY_FEE;

  const createPix = useServerFn(createPixOrder);
  const checkStatus = useServerFn(getOrderPaymentStatus);
  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<PixState | null>(null);
  const [paid, setPaid] = useState(false);
  const [copied, setCopied] = useState(false);
  const PAYMENT_ERROR_RATE = 0.2;
  const [showPaymentError, setShowPaymentError] = useState(false);

  useEffect(() => {
    if (!pix || paid) return;
    const id = window.setInterval(async () => {
      try {
        const res = await checkStatus({ data: { orderId: pix.orderId } });
        if (res.paid) {
          setShowPaymentError(Math.random() < PAYMENT_ERROR_RATE);
          setPaid(true);
        }
      } catch {
        /* tenta de novo no próximo intervalo */
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [pix, paid, checkStatus]);


  const whatsappHref = useMemo(() => {
    if (detailed.length === 0) {
      return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
        "Olá! Gostaria de fazer um pedido. Pode me ajudar?",
      )}`;
    }

    const body = detailed
      .map(
        (d) =>
          `• ${d.line.qty}x ${d.item.name}${
            d.addons.length ? ` (+ ${d.addons.map((a) => a.name).join(", ")})` : ""
          } — ${formatBRL(d.total)}${d.line.notes ? `\n   Obs.: ${d.line.notes}` : ""}`,
      )
      .join("\n");

    const lines = [
      "Olá! Meu pedido é:",
      body,
      "",
      `Subtotal: ${formatBRL(subtotal)}`,
      `Entrega: ${shipping === 0 ? "grátis" : formatBRL(shipping)}`,
      `Total: ${formatBRL(subtotal + shipping)}`,
    ];

    if (form.name.trim()) lines.push("", `Nome: ${form.name.trim()}`);
    if (form.address.trim()) lines.push(`Endereço: ${form.address.trim()}`);
    if (form.notes.trim()) lines.push(`Observações: ${form.notes.trim()}`);

    lines.push("", "Como posso pagar?");

    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
  }, [detailed, subtotal, shipping, form.name, form.address, form.notes]);




  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              setTab("cardapio");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            aria-label="Cantinho da Gula, voltar ao topo do cardápio"
            className="text-left"
          >
            <span className="block text-lg font-extrabold leading-none tracking-tight">
              Cantinho <span className="text-primary">da Gula</span>
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
              Aberto agora · 24 horas, todos os dias
            </span>
          </button>
          <button
            type="button"
            onClick={() => setTab("pedido")}
            aria-label={`Meu pedido, ${itemCount} ${itemCount === 1 ? "item" : "itens"}`}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 sm:h-auto sm:w-auto sm:gap-2 sm:px-4 sm:py-2 sm:text-sm sm:font-semibold"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span className="hidden sm:inline">Pedido</span>
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground sm:static sm:h-auto sm:min-w-0 sm:bg-transparent sm:px-0 sm:text-primary-foreground">
                {itemCount}
              </span>
            )}
          </button>
        </div>

        <div className="mx-auto flex max-w-6xl gap-1 px-4">
          {(
            [
              { id: "cardapio", label: "Cardápio" },
              { id: "pedido", label: `Meu pedido${itemCount ? ` (${itemCount})` : ""}` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main>
        {tab === "cardapio" ? (
          <>
            <section className="relative">
              <img
                src={heroImg}
                alt="Xis gaúcho, pizza artesanal e açaí sobre mesa de madeira escura"
                width={1600}
                height={900}
                fetchPriority="high"
                className="h-[52vh] min-h-[320px] w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-background/20" />
              <div className="absolute inset-0 flex items-end">
                <div className="mx-auto w-full max-w-6xl px-4 pb-4 md:pb-6">
                  <span className="inline-block rounded-full border border-border bg-card/70 px-3 py-1 text-xs font-medium uppercase tracking-widest text-accent">
                    Aberto 24/7 · Balneário Camboriú
                  </span>
                  <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight md:text-6xl">
                    Xis, pizza, barca de sushi e bolo na sua porta, a qualquer hora.
                  </h1>
                  <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-lg">
                    Cozinha aberta 24 horas por dia, 7 dias por semana.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/15 px-4 py-1.5 text-sm font-bold text-accent shadow-[0_0_24px_-6px_hsl(var(--accent)/0.6)] md:text-base">
                    <Truck className="h-4 w-4" />
                    Frete grátis acima de {formatBRL(FREE_SHIPPING_FROM)}
                  </span>

                </div>
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-4 pb-8 pt-4 md:pt-6">
              <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Cardápio</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Toque em um produto para abrir a página dele e escolher adicionais e
                observações.
              </p>

              <ul className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
                {categories.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActive(c.id)}
                      aria-pressed={active === c.id}
                      className="flex w-full flex-col items-center gap-1.5"
                    >
                      <img
                        src={c.image}
                        alt={c.label}
                        width={320}
                        height={320}
                        loading="lazy"
                        decoding="async"
                        className={`h-16 w-16 rounded-full object-cover ring-2 transition-all ${
                          active === c.id ? "ring-primary" : "ring-transparent"
                        }`}
                      />
                      <span className="w-full truncate text-center text-xs font-medium text-muted-foreground">
                        {c.label}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="mt-4 grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                {filters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActive(f.id)}
                    aria-pressed={active === f.id}
                    className={`truncate rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors sm:rounded-full sm:px-4 ${
                      active === f.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="mt-6 space-y-8">
                {groups.map((group) => (
                  <div key={group.id}>
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-accent">
                      {group.label}
                    </h3>
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <Link
                            to="/produto/$id"
                            params={{ id: item.id }}
                            search={{ line: undefined }}
                            className="flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{item.name}</span>
                              <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                                {item.description}
                              </span>
                              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <span className="text-base font-bold text-accent">
                                  {formatBRL(item.price)}
                                </span>
                                {group.id === "combos" && (
                                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                                    Promo
                                  </span>
                                )}
                                {item.price >= FREE_SHIPPING_FROM && (
                                  <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                                    Frete grátis
                                  </span>
                                )}
                              </span>
                            </span>
                            <span className="relative shrink-0">
                              <img
                                src={item.image}
                                alt={item.name}
                                width={700}
                                height={700}
                                loading="lazy"
                                decoding="async"
                                className="h-20 w-20 rounded-xl object-cover"
                              />

                              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-base font-bold leading-none text-primary-foreground shadow-md">
                                +
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-4 pb-16">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  { t: "Aberto 24/7", d: "Atendimento 24 horas por dia, todos os dias do ano." },
                  { t: "Entrega rápida", d: "Média de 40 minutos em Balneário Camboriú e região." },
                  { t: "Pagamento fácil", d: "Pix, cartão na entrega ou dinheiro. Sem taxa escondida." },
                ].map((c) => (
                  <div key={c.t} className="rounded-2xl border border-border bg-card p-6">
                    <h3 className="font-semibold">{c.t}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{c.d}</p>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="mx-auto max-w-3xl px-4 py-8">
            <h2 className="text-2xl font-bold tracking-tight">Seu pedido</h2>
            {detailed.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-border bg-card p-6">
                <p className="text-sm text-muted-foreground">
                  Seu carrinho está vazio. Escolha um xis, uma barca de sushi ou um bolo.
                </p>
                <button
                  type="button"
                  onClick={() => setTab("cardapio")}
                  className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  Ver cardápio
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-border bg-card p-5">
                <ul className="divide-y divide-border">
                  {detailed.map(({ line, item, addons, total }) => (
                    <li key={line.lineId} className="py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{item.name}</p>
                          {addons.length > 0 && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              + {addons.map((a) => a.name).join(", ")}
                            </p>
                          )}
                          {line.notes && (
                            <p className="mt-1 text-sm italic text-muted-foreground">
                              “{line.notes}”
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-semibold">{formatBRL(total)}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <button
                          type="button"
                          aria-label={`Diminuir ${item.name}`}
                          onClick={() => cart.changeQty(line.lineId, -1)}
                          className="h-8 w-8 rounded-full border border-border hover:bg-secondary"
                        >
                          −
                        </button>
                        <span className="w-6 text-center tabular-nums">{line.qty}</span>
                        <button
                          type="button"
                          aria-label={`Aumentar ${item.name}`}
                          onClick={() => cart.changeQty(line.lineId, 1)}
                          className="h-8 w-8 rounded-full border border-border hover:bg-secondary"
                        >
                          +
                        </button>
                        <Link
                          to="/produto/$id"
                          params={{ id: item.id }}
                          search={{ line: line.lineId }}
                          className="ml-auto text-sm font-semibold text-primary"
                        >
                          Editar
                        </Link>
                        <button
                          type="button"
                          onClick={() => cart.remove(line.lineId)}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Remover
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>

                <dl className="mt-4 space-y-1 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd>{formatBRL(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Entrega</dt>
                    <dd>{shipping === 0 ? "Grátis" : formatBRL(shipping)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                    <dt>Total</dt>
                    <dd>{formatBRL(subtotal + shipping)}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  onClick={() => setTab("cardapio")}
                  className="mt-5 w-full rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                >
                  + Adicionar mais itens
                </button>

                {pix ? (
                  <div className="mt-5 rounded-2xl border border-accent/50 bg-accent/5 p-5 text-center">
                    {paid && showPaymentError ? (
                      <>
                        <h3 className="text-lg font-bold text-destructive">
                          Houve um erro no pagamento
                        </h3>
                        <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">
                          Não conseguimos concluir o pedido nº {pix.orderId.slice(0, 8)}.
                        </p>
                        <p className="mx-auto mt-3 max-w-sm rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm font-medium leading-snug text-destructive">
                          Seu pagamento será extornado em até 24 horas.
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            lines.forEach((l) => cart.remove(l.lineId));
                            setPix(null);
                            setPaid(false);
                            setShowPaymentError(false);
                            setTab("cardapio");
                          }}
                          className="mt-4 rounded-full border border-border px-5 py-2.5 text-sm font-semibold"
                        >
                          Voltar ao cardápio
                        </button>
                      </>
                    ) : paid ? (
                      <>
                        <Check className="mx-auto h-10 w-10 text-accent" />
                        <h3 className="mt-2 text-lg font-bold">Pagamento confirmado!</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Já estamos preparando seu pedido. Pedido nº{" "}
                          {pix.orderId.slice(0, 8)}.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            lines.forEach((l) => cart.remove(l.lineId));
                            setPix(null);
                            setPaid(false);
                            setShowPaymentError(false);
                            setTab("cardapio");
                          }}
                          className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                        >
                          Fazer novo pedido
                        </button>
                      </>
                    ) : (
                      <>
                        <h3 className="text-lg font-bold">Pague com Pix</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Escaneie o QR Code ou use o copia e cola. A confirmação é
                          automática.
                        </p>
                        {pix.qrCodeBase64 && (
                          <img
                            src={`data:image/png;base64,${pix.qrCodeBase64}`}
                            alt="QR Code do Pix para pagamento do pedido"
                            width={220}
                            height={220}
                            className="mx-auto mt-4 h-[220px] w-[220px] rounded-xl bg-white p-2"
                          />
                        )}
                        <p className="mt-4 break-all rounded-xl border border-border bg-card px-3 py-2 text-left text-xs text-muted-foreground">
                          {pix.copyPaste}
                        </p>
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(pix.copyPaste);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
                        >
                          {copied ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                          {copied ? "Código copiado" : "Copiar código Pix"}
                        </button>
                        <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Aguardando confirmação do pagamento…
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setError(null);
                      setSubmitting(true);
                      try {
                        const res = await createPix({
                          data: {
                            customerName: form.name,
                            customerPhone: form.phone,
                            address: form.address,
                            notes: form.notes,
                            items: lines.map((l) => ({
                              itemId: l.itemId,
                              qty: l.qty,
                              addonIds: l.addonIds,
                              notes: l.notes,
                            })),
                          },
                        });
                        if (res.ok) {
                          setPix(res);
                          setPaid(res.paid);
                          setShowPaymentError(
                            res.paid && Math.random() < PAYMENT_ERROR_RATE,
                          );
                        } else {
                          setError(res.error);
                        }
                      } catch {
                        setError("Não foi possível gerar o Pix. Tente novamente.");
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                    className="mt-5 border-t border-border pt-5"
                  >
                    <h3 className="text-base font-bold">Finalizar pedido pelo site</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pague com Pix agora e a confirmação é automática.
                    </p>
                    <div className="mt-4 grid gap-3">
                      <label className="block text-sm">
                        <span className="text-muted-foreground">Nome</span>
                        <input
                          required
                          minLength={2}
                          value={form.name}
                          onChange={(e) => setForm({ ...form, name: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                          placeholder="Seu nome completo"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-muted-foreground">WhatsApp / telefone</span>
                        <input
                          required
                          minLength={8}
                          inputMode="tel"
                          value={form.phone}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                          placeholder="(47) 90000-0000"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-muted-foreground">Endereço de entrega</span>
                        <input
                          required
                          minLength={6}
                          value={form.address}
                          onChange={(e) => setForm({ ...form, address: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                          placeholder="Rua, número, bairro e complemento"
                        />
                      </label>
                      <label className="block text-sm">
                        <span className="text-muted-foreground">
                          Observações (opcional)
                        </span>
                        <input
                          value={form.notes}
                          onChange={(e) => setForm({ ...form, notes: e.target.value })}
                          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                          placeholder="Ponto de referência, troco, etc."
                        />
                      </label>
                    </div>

                    {error && (
                      <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                    >
                      {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                      {submitting
                        ? "Gerando Pix…"
                        : `Pagar com Pix · ${formatBRL(subtotal + shipping)}`}
                    </button>

                    <a
                      href={whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 block text-center text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      ou finalizar pelo WhatsApp
                    </a>
                  </form>
                )}

              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Cantinho da Gula · Balneário Camboriú / SC · Aberto 24 horas
        </div>
      </footer>

      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => setTab(tab === "pedido" ? "cardapio" : "pedido")}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg sm:mx-auto sm:max-w-md"
        >
          <span className="text-sm font-semibold">
            {itemCount} {itemCount === 1 ? "item" : "itens"} ·{" "}
            {formatBRL(subtotal + shipping)}
          </span>
          <span className="text-sm font-bold underline underline-offset-4">
            {tab === "pedido" ? "Continuar comprando" : "Ver pedido"}
          </span>
        </button>
      )}
    </div>
  );
}
