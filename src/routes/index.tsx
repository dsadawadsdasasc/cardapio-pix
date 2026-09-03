import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Check, Clock, DollarSign, Loader2, Lock, LogOut, MessageCircle, RefreshCw, Shield, ShoppingBag, Truck } from "lucide-react";
import { getAdminOrders, loginAdmin } from "@/lib/admin.functions";

import heroImg from "@/assets/hero.jpg";
import logoImg from "@/assets/logo.png";
import {
  categories,
  formatBRL,
  getAddons,
  menu,
  type CategoryId,
  type MenuItem,
} from "@/data/menu";
import { cart, useCart } from "@/lib/cart";
import { registerOrder } from "@/lib/checkout.functions";


export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab:
      search["tab"] === "pedido"
        ? ("pedido" as const)
        : search["tab"] === "vendas"
        ? ("vendas" as const)
        : ("cardapio" as const),
  }),
  head: () => ({
    meta: [
      { title: "Cantinho da Gula | Delivery de xis, pizza, sushi e açaí" },
      {
        name: "description",
        content:
          "Delivery em Floripa: combos baratos, xis gaúcho, pizza artesanal, barcas de sushi, bolos e açaí. Entrega grátis para Floripa e região.",
      },
      { property: "og:title", content: "Cantinho da Gula | Delivery em Floripa" },
      {
        property: "og:description",
        content:
          "Xis, pizzas, barcas de sushi, baurus, bolos e açaí feitos na hora, com adicionais e observações no pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const FREE_SHIPPING_FROM = 0;
const DELIVERY_FEE = 0;
// Número da loja no WhatsApp (formato internacional, só dígitos).
const WHATSAPP_NUMBER = "5547920036595";




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

  const setTab = (next: "cardapio" | "pedido" | "vendas") =>
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
  const shipping = 0;

  const [form, setForm] = useState({ name: "", phone: "", address: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminAuth, setAdminAuth] = useState<{ token: string; user: string } | null>(() => {
    if (typeof window !== "undefined") {
      const savedToken = sessionStorage.getItem("adm_token");
      const savedUser = sessionStorage.getItem("adm_user");
      if (savedToken) return { token: savedToken, user: savedUser || "miguelzinho67" };
    }
    return null;
  });
  const [adminLoginForm, setAdminLoginForm] = useState({ username: "", password: "" });
  const [adminLoginSubmitting, setAdminLoginSubmitting] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState<string | null>(null);

  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [loadingAdminOrders, setLoadingAdminOrders] = useState(false);
  const [adminOrdersError, setAdminOrdersError] = useState<string | null>(null);

  const doAdminLogin = useServerFn(loginAdmin);
  const fetchAdminOrders = useServerFn(getAdminOrders);

  const loadSalesOrders = async (auth = adminAuth) => {
    if (!auth?.token) return;
    setLoadingAdminOrders(true);
    setAdminOrdersError(null);
    try {
      const res = await fetchAdminOrders({
        data: { token: auth.token },
      });
      if (res.ok) {
        let combined = [...(res.orders || [])];
        if (typeof window !== "undefined") {
          try {
            const localSaved = JSON.parse(localStorage.getItem("cantinho_orders") || "[]");
            const ids = new Set(combined.map((o: any) => o.id));
            for (const lo of localSaved) {
              if (!ids.has(lo.id)) {
                combined.push(lo);
                ids.add(lo.id);
              }
            }
          } catch {}
        }
        setAdminOrders(combined);
      } else {
        setAdminOrdersError(res.error);
        if (res.error === "Não autorizado.") {
          setAdminAuth(null);
          setAdminOrders([]);
          sessionStorage.removeItem("adm_token");
          sessionStorage.removeItem("adm_user");
        }
      }
    } catch {
      setAdminOrdersError("Falha de conexão ao buscar vendas.");
    } finally {
      setLoadingAdminOrders(false);
    }
  };

  useEffect(() => {
    if (tab === "vendas" && adminAuth) {
      loadSalesOrders(adminAuth);
    }
  }, [tab, adminAuth]);




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
            className="flex items-center gap-2.5 text-left"
          >
            <img
              src={logoImg}
              alt="Logo Cantinho da Gula"
              width={40}
              height={40}
              className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-primary/40"
            />
            <div>
              <span className="block text-lg font-extrabold leading-none tracking-tight">
                Cantinho <span className="text-primary">da Gula</span>
              </span>
              <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent" />
                Horário de atendimento
              </span>
            </div>
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

        <div className="mx-auto flex max-w-6xl gap-1 px-4 overflow-x-auto scrollbar-none">
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
              className={`-mb-px shrink-0 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
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
                    Horário de atendimento · Floripa
                  </span>
                  <h1 className="mt-4 max-w-3xl text-3xl font-extrabold leading-tight tracking-tight md:text-6xl">
                    Xis, pizza, barca de sushi e bolo entregues na sua porta.
                  </h1>
                  <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-lg">
                    Confira nossos horários de funcionamento e faça seu pedido online.
                  </p>
                  <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-accent/50 bg-accent/15 px-4 py-1.5 text-sm font-bold text-accent shadow-[0_0_24px_-6px_hsl(var(--accent)/0.6)] md:text-base">
                    <Truck className="h-4 w-4" />
                    Entrega grátis para Floripa e região
                  </span>

                </div>
              </div>
            </section>

            <section className="mx-auto max-w-6xl px-4 pt-4 md:pt-6">
              <Link
                to="/produto/$id"
                params={{ id: "combo-pizza-dupla" }}
                className="group relative block overflow-hidden rounded-3xl border-2 border-primary/60 bg-card shadow-[0_0_35px_-8px_hsl(var(--primary)/0.4)] transition-all duration-300 hover:border-primary active:scale-[0.99]"
              >
                <div className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-background/90 px-3.5 py-1 text-xs font-black uppercase tracking-wider text-primary shadow-lg backdrop-blur">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
                  </span>
                  🔥 Destaque do Dia
                </div>

                <div className="flex flex-col items-center">
                  {menu.find((m) => m.id === "combo-pizza-dupla")?.image && (
                    <img
                      src={menu.find((m) => m.id === "combo-pizza-dupla")?.image}
                      alt="Combo Pizza Dupla por apenas R$ 99,90"
                      width={800}
                      height={1200}
                      className="w-full max-w-lg rounded-t-3xl object-contain transition-transform duration-500 group-hover:scale-[1.01]"
                    />
                  )}

                  <div className="w-full bg-gradient-to-r from-primary via-primary/95 to-accent p-3.5 text-center text-primary-foreground shadow-inner">
                    <span className="flex items-center justify-center gap-2 text-base font-black tracking-wide sm:text-lg">
                      <span>⚡ PEÇA AGORA POR APENAS {formatBRL(99.9)}</span>
                      <span className="rounded-full bg-background/20 px-2 py-0.5 text-xs">→</span>
                    </span>
                  </div>
                </div>
              </Link>
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
                                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent">
                                  Entrega grátis
                                </span>
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
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-muted/30 text-muted-foreground">
                      <Clock className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Horário de atendimento
                      </p>
                      <h3 className="text-lg font-bold text-foreground">
                        Horário específico
                      </h3>

                      <div className="mt-5 space-y-2.5">
                        {[
                          { day: "Domingo", hours: "13:00 - 04:00" },
                          { day: "Segunda-Feira", hours: "13:00 - 00:00" },
                          { day: "Terça-Feira", hours: "13:00 - 00:00" },
                          { day: "Quarta-Feira", hours: "13:00 - 00:00" },
                          { day: "Quinta-Feira", hours: "13:00 - 00:00" },
                          { day: "Sexta-Feira", hours: "12:00 - 04:00" },
                          { day: "Sábado", hours: "12:00 - 04:00" },
                        ].map((item) => (
                          <div
                            key={item.day}
                            className="flex items-center justify-between text-sm"
                          >
                            <span className="font-medium text-foreground">
                              {item.day}
                            </span>
                            <span className="tabular-nums text-muted-foreground">
                              {item.hours}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="flex-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">Entrega rápida</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Média de 40 minutos em Floripa e região. Entregamos seu pedido quentinho e com agilidade.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 rounded-2xl border border-border bg-card p-6 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                        <Check className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-foreground">Pagamento fácil</h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Pix com confirmação imediata, cartão na entrega ou dinheiro. Sem taxas escondidas.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </>
        ) : tab === "pedido" ? (
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

                <div className="mt-6 border-t border-border pt-6">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#25D366]/20 text-[#25D366]">
                      <MessageCircle className="h-4 w-4 fill-current" />
                    </span>
                    <h3 className="text-base font-bold text-foreground">Finalizar pelo WhatsApp</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Preencha seus dados para enviar o pedido pronto para o nosso atendente:
                  </p>

                  <div className="mt-4 grid gap-3">
                    <label className="block text-sm">
                      <span className="text-muted-foreground font-medium">Seu Nome</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#25D366]"
                        placeholder="Ex: João da Silva"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-muted-foreground font-medium">Endereço de Entrega</span>
                      <input
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#25D366]"
                        placeholder="Rua, número, bairro e complemento"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-muted-foreground font-medium">Observações do pedido (opcional)</span>
                      <input
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                        className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-[#25D366]"
                        placeholder="Ex: Sem cebola, troco para 50, etc."
                      />
                    </label>
                  </div>

                  {/* BOTAO DESTACADO DO WHATSAPP */}
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        try {
                          const localOrder = {
                            id: `wpp_${Date.now()}`,
                            customer_name: form.name.trim() || "Cliente WhatsApp",
                            customer_phone: form.phone.trim() || "-",
                            address: form.address.trim() || "A combinar no WhatsApp",
                            notes: form.notes.trim() || null,
                            subtotal_cents: Math.round(subtotal * 100),
                            shipping_cents: 0,
                            total_cents: Math.round(subtotal * 100),
                            payment_status: "whatsapp",
                            payment_provider: "whatsapp",
                            created_at: new Date().toISOString(),
                            paid_at: null,
                            order_items: detailed.map((d, i) => ({
                              id: `item_${i}_${Date.now()}`,
                              item_id: d.item.id,
                              item_name: d.item.name,
                              qty: d.line.qty,
                              unit_price_cents: Math.round((d.total / d.line.qty) * 100),
                              addons: d.addons,
                              notes: d.line.notes || null,
                            })),
                          };
                          const list = JSON.parse(localStorage.getItem("cantinho_orders") || "[]");
                          localStorage.setItem("cantinho_orders", JSON.stringify([localOrder, ...list].slice(0, 50)));
                        } catch {}
                      }
                    }}
                    className="mt-6 flex w-full items-center justify-center gap-3 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white py-4 px-6 text-base md:text-lg font-black tracking-wide shadow-xl shadow-[#25D366]/30 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <MessageCircle className="h-6 w-6 fill-current shrink-0" />
                    Finalizar Pedido pelo WhatsApp · {formatBRL(subtotal + shipping)}
                  </a>

                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    ⚡ Ao clicar, o WhatsApp abrirá com sua lista de itens e endereço já prontos!
                  </p>
                </div>

              </div>
            )}
          </section>
        ) : (
          <section className="mx-auto max-w-5xl px-4 py-8">
            {!adminAuth ? (
              <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Lock className="h-6 w-6" />
                  <h2 className="text-xl font-bold">Acesso Restrito ADM</h2>
                </div>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  Digite as credenciais de administrador para visualizar o painel de vendas.
                </p>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAdminLoginError(null);
                    setAdminLoginSubmitting(true);
                    try {
                      const res = await doAdminLogin({
                        data: {
                          username: adminLoginForm.username,
                          password: adminLoginForm.password,
                        },
                      });
                      if (res.ok && res.token) {
                        const auth = {
                          token: res.token,
                          user: adminLoginForm.username,
                        };
                        setAdminAuth(auth);
                        sessionStorage.setItem("adm_token", res.token);
                        sessionStorage.setItem("adm_user", adminLoginForm.username);
                        setAdminLoginForm({ username: "", password: "" });
                        loadSalesOrders(auth);
                      } else {
                        setAdminLoginError(res.error || "Acesso negado.");
                      }
                    } catch (err: any) {
                      console.error("Login error:", err);
                      setAdminLoginError(err?.message || "Erro de comunicação com o servidor.");
                    } finally {
                      setAdminLoginSubmitting(false);
                    }
                  }}
                  className="mt-5 space-y-4"
                >
                  <label className="block text-sm">
                    <span className="text-muted-foreground font-medium">Usuário</span>
                    <input
                      required
                      type="text"
                      value={adminLoginForm.username}
                      onChange={(e) =>
                        setAdminLoginForm({ ...adminLoginForm, username: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                      placeholder="Login ADM"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="text-muted-foreground font-medium">Senha</span>
                    <input
                      required
                      type="password"
                      value={adminLoginForm.password}
                      onChange={(e) =>
                        setAdminLoginForm({ ...adminLoginForm, password: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-primary"
                      placeholder="Senha ADM"
                    />
                  </label>

                  {adminLoginError && (
                    <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive text-center">
                      {adminLoginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={adminLoginSubmitting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 shadow-md"
                  >
                    {adminLoginSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                     Entrar no Painel ADM
                  </button>
                </form>
              </div>
            ) : (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-accent/15 p-2 text-accent">
                        <DollarSign className="h-5 w-5" />
                      </span>
                      <h2 className="text-2xl font-bold tracking-tight">Painel de Vendas</h2>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Conectado como <strong className="text-foreground">{adminAuth.user}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => loadSalesOrders()}
                      disabled={loadingAdminOrders}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-semibold hover:bg-secondary transition-colors"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingAdminOrders ? "animate-spin" : ""}`} />
                      Atualizar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAdminAuth(null);
                        setAdminOrders([]);
                        sessionStorage.removeItem("adm_token");
                        sessionStorage.removeItem("adm_user");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sair
                    </button>
                  </div>
                </div>

                {/* Métricas do Painel */}
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-medium text-muted-foreground">Total em Vendas</p>
                    <p className="mt-1.5 text-2xl font-extrabold text-accent">
                      {formatBRL(
                        adminOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0) / 100,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-medium text-muted-foreground">Total de Pedidos</p>
                    <p className="mt-1.5 text-2xl font-extrabold text-foreground">
                      {adminOrders.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-medium text-muted-foreground">Pedidos Pagos (Pix)</p>
                    <p className="mt-1.5 text-2xl font-extrabold text-primary">
                      {adminOrders.filter((o) => o.payment_status === "paid").length}
                    </p>
                  </div>
                </div>

                {/* Lista de Vendas */}
                <div className="mt-8">
                  <h3 className="text-lg font-bold">Histórico de Compras</h3>

                  {loadingAdminOrders ? (
                    <div className="mt-4 flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      Carregando registro de vendas...
                    </div>
                  ) : adminOrdersError ? (
                    <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                      {adminOrdersError}
                    </p>
                  ) : adminOrders.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
                      <ShoppingBag className="mx-auto h-8 w-8 opacity-50" />
                      <p className="mt-2 text-sm">Nenhuma venda registrada até o momento.</p>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {adminOrders.map((order) => {
                        const dateStr = new Date(order.created_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        });
                        const isPaid = order.payment_status === "paid";

                        return (
                          <div
                            key={order.id}
                            className="overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:border-primary/50"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                              <div>
                                <span className="text-xs font-semibold text-muted-foreground">
                                  Pedido nº {order.id.slice(0, 8)}
                                </span>
                                <span className="ml-3 text-xs text-muted-foreground">
                                  🕒 {dateStr}
                                </span>
                              </div>

                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                                  isPaid
                                    ? "bg-accent/15 text-accent border border-accent/30"
                                    : "bg-amber-500/15 text-amber-500 border border-amber-500/30"
                                }`}
                              >
                                {isPaid ? "✓ Pix Pago" : "⏳ Pagamento Pendente"}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-4 sm:grid-cols-2">
                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">
                                  Cliente & Contato
                                </p>
                                <p className="mt-1 font-bold text-foreground">
                                  {order.customer_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  📞 {order.customer_phone}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  📍 {order.address}
                                </p>
                                {order.notes && (
                                  <p className="mt-1 text-xs italic text-muted-foreground">
                                    Obs: “{order.notes}”
                                  </p>
                                )}
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase text-muted-foreground">
                                  Itens / Combos Comprados
                                </p>
                                <ul className="mt-1 space-y-1">
                                  {order.order_items?.map((item: any) => (
                                    <li key={item.id} className="text-sm">
                                      <span className="font-semibold">{item.qty}x</span>{" "}
                                      <span className="font-medium">{item.item_name}</span>
                                      <span className="ml-1 text-xs text-muted-foreground">
                                        ({formatBRL((item.unit_price_cents * item.qty) / 100)})
                                      </span>
                                      {Array.isArray(item.addons) && item.addons.length > 0 && (
                                        <p className="text-xs text-muted-foreground pl-4">
                                          + {item.addons.map((a: any) => a.name).join(", ")}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
                              <span className="text-xs text-muted-foreground">
                                Subtotal: {formatBRL(order.subtotal_cents / 100)} | Entrega:{" "}
                                {order.shipping_cents === 0
                                  ? "Grátis"
                                  : formatBRL(order.shipping_cents / 100)}
                              </span>
                              <span className="text-base font-black text-foreground">
                                Total: {formatBRL(order.total_cents / 100)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-8 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Cantinho da Gula · Floripa / SC</span>
          <button
            type="button"
            onClick={() => setTab("vendas")}
            className="h-1.5 w-1.5 rounded-full bg-accent/40 transition-colors hover:bg-accent"
            aria-label="Acesso administrativo"
          />
        </div>
      </footer>

      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => setTab(tab === "pedido" ? "cardapio" : "pedido")}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between gap-3 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] px-4 py-3.5 text-white shadow-xl shadow-emerald-950/40 sm:mx-auto sm:max-w-md transition-all active:scale-[0.98]"
        >
          <span className="flex items-center gap-2 text-sm font-bold">
            <MessageCircle className="h-5 w-5 fill-current" />
            {itemCount} {itemCount === 1 ? "item" : "itens"} · {formatBRL(subtotal + shipping)}
          </span>
          <span className="text-sm font-black underline underline-offset-4">
            {tab === "pedido" ? "Continuar comprando" : "Finalizar pelo WhatsApp"}
          </span>
        </button>
      )}
    </div>
  );
}
