import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  addonsByCategory,
  categories,
  drinks,
  formatBRL,
  FREE_SHIPPING_FROM,
  getAddons,
  menu,
} from "@/data/menu";

import { cart, getLine } from "@/lib/cart";

export const Route = createFileRoute("/produto/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    line: typeof search["line"] === "string" ? (search["line"] as string) : undefined,
  }),
  head: ({ params }) => {
    const item = menu.find((m) => m.id === params.id);
    const title = item ? `${item.name} | Cantinho da Gula` : "Produto | Cantinho da Gula";
    const description = item
      ? `${item.description} Monte com adicionais e observações. Delivery em Florianópolis.`
      : "Produto não encontrado no cardápio do Cantinho da Gula.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: ProdutoPage,
});

function ProdutoPage() {
  const { id } = Route.useParams();
  const { line: lineId } = Route.useSearch();
  const navigate = useNavigate();

  const item = useMemo(() => menu.find((m) => m.id === id), [id]);
  const existing = lineId ? getLine(lineId) : null;

  const [qty, setQty] = useState(existing?.qty ?? 1);
  const [addonIds, setAddonIds] = useState<string[]>(existing?.addonIds ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? "");

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Produto não encontrado</h1>
        <Link to="/" search={{ tab: "cardapio" }} className="mt-4 inline-block text-primary underline">
          Voltar ao cardápio
        </Link>
      </div>
    );
  }

  const addons = addonsByCategory[item.category];
  const unit =
    item.price +
    getAddons(item.category)
      .filter((a) => addonIds.includes(a.id))
      .reduce((s, a) => s + a.price, 0);

  const toggle = (addonId: string) =>
    setAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((x) => x !== addonId) : [...prev, addonId],
    );
  const category = categories.find((c) => c.id === item.category);

  const submit = () => {
    if (existing) cart.update(existing.lineId, { qty, addonIds, notes });
    else cart.add({ itemId: item.id, qty, addonIds, notes });
    navigate({ to: "/", search: { tab: "pedido" } });
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            search={{ tab: "cardapio" }}
            aria-label="Voltar ao cardápio"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border text-lg"
          >
            ←
          </Link>
          <div>
            <p className="font-bold leading-none">{item.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {category?.label} · Florianópolis
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        <img
          src={item.image}
          alt={item.name}
          width={700}
          height={700}
          decoding="async"
          fetchPriority="high"
          className="mt-4 h-56 w-full rounded-2xl object-cover md:h-72"
        />

        <h1 className="mt-5 text-2xl font-extrabold tracking-tight">{item.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
        <p className="mt-3 text-xl font-bold">{formatBRL(item.price)}</p>

        <p className="mt-3 inline-block rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-accent">
          Entrega grátis para Floripa e região
        </p>

        {item.category === "combos" && (
          <div className="mt-4 rounded-xl border border-primary/40 bg-primary/10 p-4">
            <p className="text-sm font-semibold text-primary">Atenção: escolha os sabores</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Escreva no campo de observações abaixo quais produtos você quer dentro do combo.
              Ex.: em um combo com 4 hambúrgueres, informe os 4 (bacon, salada, duplo smash...).
            </p>
          </div>
        )}


        <section className={`mt-8 ${addons.length === 0 ? "hidden" : ""}`}>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">
            Adicionais
          </h2>
          <ul className="mt-3 space-y-2">
            {addons.map((a) => {
              const checked = addonIds.includes(a.id);
              return (
                <li key={a.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${
                      checked ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(a.id)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                        checked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      }`}
                    >
                      {checked && (
                        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-sm">{a.name}</span>
                    <span className="text-sm font-semibold text-accent">+ {formatBRL(a.price)}</span>
                  </label>
                </li>

              );
            })}
          </ul>
        </section>

        <section className={`mt-8 ${item.category === "bebidas" ? "hidden" : ""}`}>
          <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">
            Bebidas
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {drinks.map((d) => {
              const checked = addonIds.includes(d.id);
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggle(d.id)}
                    className={`flex h-full w-full flex-col rounded-xl border px-3 py-3 text-left transition-colors ${
                      checked ? "border-primary bg-primary/10" : "border-border bg-card"
                    }`}
                  >
                    <span className="text-sm font-medium leading-snug">{d.name}</span>
                    <span className="mt-1 text-sm font-semibold text-accent">
                      + {formatBRL(d.price)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-accent">
            Observações
          </h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            maxLength={200}
            placeholder="Ex.: sem cebola, maionese à parte, ponto da carne..."
            className="mt-3 w-full rounded-xl border border-border bg-card p-3 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {notes.length}/200
          </p>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-border px-4 py-2.5">
            <button
              type="button"
              aria-label="Diminuir quantidade"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              className="text-lg leading-none"
            >
              −
            </button>
            <span className="w-5 text-center tabular-nums">{qty}</span>
            <button
              type="button"
              aria-label="Aumentar quantidade"
              onClick={() => setQty((q) => q + 1)}
              className="text-lg leading-none"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={submit}
            className="flex-1 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            {existing ? "Salvar alterações" : "Adicionar"} · {formatBRL(unit * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}
