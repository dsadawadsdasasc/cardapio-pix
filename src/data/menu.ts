import xisImg from "@/assets/cat-xis.jpg";
import pizzaImg from "@/assets/cat-pizza.jpg";
import acaiImg from "@/assets/cat-acai.jpg";
import sushiImg from "@/assets/cat-sushi.jpg";
import burgerImg from "@/assets/cat-burger.jpg";
import boloImg from "@/assets/cat-bolo.jpg";
import comboImg from "@/assets/cat-combo.jpg";

import imgComboCasal from "@/assets/prod/combo-casal.jpg";
import imgComboPizzaDupla from "@/assets/prod/combo-pizza-dupla.jpg";
import imgComboBurgerFesta from "@/assets/prod/combo-burger-festa.jpg";
import imgComboSushi from "@/assets/prod/combo-sushi.jpg";
import imgComboAcaiFamilia from "@/assets/prod/combo-acai-familia.jpg";
import imgComboGalera from "@/assets/prod/combo-galera.jpg";
import imgComboMega from "@/assets/prod/combo-mega.jpg";

import imgXisSalada from "@/assets/prod/xis-salada.jpg";
import imgXisCoracao from "@/assets/prod/xis-coracao.jpg";
import imgXisBacon from "@/assets/prod/xis-bacon.jpg";
import imgXisTudo from "@/assets/prod/xis-tudo.jpg";

import imgPizzaMussarela from "@/assets/prod/pizza-mussarela.jpg";
import imgPizzaCalabresa from "@/assets/prod/pizza-calabresa.jpg";
import imgPizzaPortuguesa from "@/assets/prod/pizza-portuguesa.jpg";
import imgPizzaFrangoCatupiry from "@/assets/prod/pizza-frango-catupiry.jpg";
import imgPizzaQuatroQueijos from "@/assets/prod/pizza-quatro-queijos.jpg";
import imgPizzaPepperoni from "@/assets/prod/pizza-pepperoni.jpg";
import imgPizzaBaconCheddar from "@/assets/prod/pizza-bacon-cheddar.jpg";
import imgPizzaChocolate from "@/assets/prod/pizza-chocolate.jpg";

import imgAcai300 from "@/assets/prod/acai-300.jpg";
import imgAcai500 from "@/assets/prod/acai-500.jpg";
import imgAcai700 from "@/assets/prod/acai-700.jpg";
import imgAcaiFamilia from "@/assets/prod/acai-familia.jpg";

import imgBarca20 from "@/assets/prod/barca-20.jpg";
import imgBarca40 from "@/assets/prod/barca-40.jpg";
import imgBarca60 from "@/assets/prod/barca-60.jpg";
import imgBarcaEspecial from "@/assets/prod/barca-especial.jpg";

import imgBurgerClassico from "@/assets/prod/burger-classico.jpg";
import imgBurgerBacon from "@/assets/prod/burger-bacon.jpg";
import imgBurgerSalada from "@/assets/prod/burger-salada.jpg";
import imgBurgerDuplo from "@/assets/prod/burger-duplo.jpg";
import imgBurgerCheddar from "@/assets/prod/burger-cheddar.jpg";
import imgBurgerFrango from "@/assets/prod/burger-frango.jpg";
import imgBurgerCostela from "@/assets/prod/burger-costela.jpg";
import imgBurgerVeggie from "@/assets/prod/burger-veggie.jpg";

import imgBoloFatiaChocolate from "@/assets/prod/bolo-fatia-chocolate.jpg";
import imgBoloCenoura from "@/assets/prod/bolo-cenoura.jpg";
import imgBoloNinhoMorango from "@/assets/prod/bolo-ninho-morango.jpg";
import imgBoloPrestigio from "@/assets/prod/bolo-prestigio.jpg";

import bebidasImg from "@/assets/cat-bebidas.jpg";
import imgCoca from "@/assets/prod/coca.jpg";
import imgCocaZero from "@/assets/prod/coca-zero.jpg";
import imgGuarana from "@/assets/prod/guarana.jpg";
import imgGuaranaZero from "@/assets/prod/guarana-zero.jpg";
import imgAgua from "@/assets/prod/agua.jpg";

export type CategoryId =
  | "combos"
  | "xis"
  | "pizzas"
  | "acai"
  | "sushi"
  | "hamburgueres"
  | "bolos"
  | "bebidas";


export type Addon = { id: string; name: string; price: number };

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: CategoryId;
  image: string;
};

/** Pedidos a partir deste valor ganham frete grátis. */
export const FREE_SHIPPING_FROM = 119.9;

export const categories: {
  id: CategoryId;
  label: string;
  image: string;
  blurb: string;
}[] = [
  { id: "combos", label: "Combos", image: comboImg, blurb: "Muita comida por pouco dinheiro." },
  { id: "xis", label: "Xis", image: xisImg, blurb: "Na chapa, pão fresco e muito queijo." },
  { id: "pizzas", label: "Pizzas", image: pizzaImg, blurb: "Massa artesanal fermentada 48h." },
  { id: "acai", label: "Açaí", image: acaiImg, blurb: "Cremoso, batido na hora." },
  { id: "sushi", label: "Barcas de sushi", image: sushiImg, blurb: "Peças frescas montadas na hora." },
  { id: "hamburgueres", label: "Hambúrgueres", image: burgerImg, blurb: "Blend 180g na chapa, pão brioche." },
  { id: "bolos", label: "Bolos", image: boloImg, blurb: "Fatia ou inteiro, feitos na casa." },
  { id: "bebidas", label: "Bebidas", image: bebidasImg, blurb: "Geladas, 600ml ou 2L." },
];

/** Preços praticados em delivery (iFood/Rappi) na região de Balneário Camboriú. */
export const menu: MenuItem[] = [
  // Combos
  {
    id: "combo-casal",
    name: "Combo Casal",
    description:
      "2 Xis à sua escolha + 2 porções de fritas + 2 refrigerantes 600ml. Serve 2 pessoas.",
    price: 89.9,
    category: "combos",
    image: imgComboCasal,
  },
  {
    id: "combo-pizza-dupla",
    name: "Combo Pizza Dupla",
    description:
      "2 pizzas grandes à sua escolha + 1 porção de fritas + Coca-Cola 2L. Serve 4 pessoas.",
    price: 109.9,
    category: "combos",
    image: imgComboPizzaDupla,
  },
  {
    id: "combo-acai-familia",
    name: "Combo Açaí Família",
    description:
      "1 açaí de 1L + 2 açaís de 500ml + 2 fatias de bolo de chocolate. Serve 4 pessoas.",
    price: 99.9,
    category: "combos",
    image: imgComboAcaiFamilia,
  },
  {
    id: "combo-burger-festa",
    name: "Combo Burger Festa",
    description:
      "4 hambúrgueres à sua escolha + 4 porções de fritas + onion rings + 2 refrigerantes 2L. Serve 4 pessoas.",
    price: 139.9,
    category: "combos",
    image: imgComboBurgerFesta,
  },
  {
    id: "combo-galera",
    name: "Combo da Galera",
    description:
      "4 Xis à sua escolha + 4 porções de fritas + 2 refrigerantes 2L + 1 açaí de 1L. Serve até 6 pessoas.",
    price: 119.9,
    category: "combos",
    image: imgComboGalera,
  },
  {
    id: "combo-sushi",
    name: "Combo Barca Completa",
    description:
      "Barca de 40 peças + 8 hot rolls extras + 2 refrigerantes 600ml. Serve 3 pessoas.",
    price: 149.9,
    category: "combos",
    image: imgComboSushi,
  },
  {
    id: "combo-mega",
    name: "Combo Mega Família",
    description:
      "2 pizzas grandes + 4 Xis + 2 refrigerantes 2L + 1 bolo inteiro. Serve até 8 pessoas.",
    price: 149.9,
    category: "combos",
    image: imgComboMega,
  },

  // Xis
  { id: "xis-salada", name: "Xis Salada", description: "Hambúrguer 180g, queijo, alface, tomate e maionese da casa.", price: 29.9, category: "xis", image: imgXisSalada },
  { id: "xis-coracao", name: "Xis Coração", description: "Coração de frango na chapa, queijo e salada completa.", price: 39.9, category: "xis", image: imgXisCoracao },
  { id: "xis-bacon", name: "Xis Bacon", description: "Hambúrguer, bacon crocante, ovo e cheddar.", price: 36.9, category: "xis", image: imgXisBacon },
  { id: "xis-tudo", name: "Xis Tudo", description: "Carne, frango, bacon, ovo, queijo, presunto e salada.", price: 45.9, category: "xis", image: imgXisTudo },

  // Pizzas
  { id: "pizza-mussarela", name: "Pizza Mussarela G", description: "Molho de tomate, mussarela e orégano. 8 fatias.", price: 44.9, category: "pizzas", image: imgPizzaMussarela },
  { id: "pizza-calabresa", name: "Pizza Calabresa G", description: "Calabresa fatiada, cebola e azeitona. 8 fatias.", price: 49.9, category: "pizzas", image: imgPizzaCalabresa },
  { id: "pizza-portuguesa", name: "Pizza Portuguesa G", description: "Presunto, ovo, cebola, ervilha e mussarela.", price: 54.9, category: "pizzas", image: imgPizzaPortuguesa },
  { id: "pizza-frango-catupiry", name: "Pizza Frango c/ Catupiry G", description: "Frango desfiado e catupiry cremoso.", price: 56.9, category: "pizzas", image: imgPizzaFrangoCatupiry },
  { id: "pizza-quatro-queijos", name: "Pizza Quatro Queijos G", description: "Mussarela, provolone, gorgonzola e parmesão.", price: 58.9, category: "pizzas", image: imgPizzaQuatroQueijos },
  { id: "pizza-pepperoni", name: "Pizza Pepperoni G", description: "Mussarela e fatias generosas de pepperoni.", price: 59.9, category: "pizzas", image: imgPizzaPepperoni },
  { id: "pizza-bacon-cheddar", name: "Pizza Bacon c/ Cheddar G", description: "Cheddar cremoso, bacon crocante e cebola roxa.", price: 59.9, category: "pizzas", image: imgPizzaBaconCheddar },
  { id: "pizza-chocolate", name: "Pizza de Chocolate G", description: "Chocolate ao leite com morango. 8 fatias doces.", price: 49.9, category: "pizzas", image: imgPizzaChocolate },

  // Açaí
  { id: "acai-300", name: "Açaí 300ml", description: "Açaí cremoso com dois acompanhamentos.", price: 16.9, category: "acai", image: imgAcai300 },
  { id: "acai-500", name: "Açaí 500ml", description: "Açaí cremoso com três acompanhamentos.", price: 22.9, category: "acai", image: imgAcai500 },
  { id: "acai-700", name: "Açaí 700ml", description: "Açaí cremoso com quatro acompanhamentos.", price: 28.9, category: "acai", image: imgAcai700 },
  { id: "acai-familia", name: "Açaí Família 1L", description: "Para dividir, com granola, banana e leite condensado.", price: 42.9, category: "acai", image: imgAcaiFamilia },

  // Barcas de sushi
  { id: "barca-20", name: "Barca 20 peças", description: "Sashimi, uramaki e hossomaki de salmão.", price: 79.9, category: "sushi", image: imgBarca20 },
  { id: "barca-40", name: "Barca 40 peças", description: "Mix de frios e quentes, ideal para dois.", price: 139.9, category: "sushi", image: imgBarca40 },
  { id: "barca-60", name: "Barca 60 peças", description: "Salmão, atum, camarão empanado e hot rolls.", price: 199.9, category: "sushi", image: imgBarca60 },
  { id: "barca-especial", name: "Barca Especial 80 peças", description: "Seleção do sushiman com joy e niguiri maçaricado.", price: 259.9, category: "sushi", image: imgBarcaEspecial },

  // Hambúrgueres
  { id: "burger-classico", name: "Cheeseburger Clássico", description: "Blend 180g, cheddar, picles e molho da casa no pão brioche.", price: 28.9, category: "hamburgueres", image: imgBurgerClassico },
  { id: "burger-bacon", name: "Bacon Burger", description: "Blend 180g, cheddar duplo e bacon crocante.", price: 34.9, category: "hamburgueres", image: imgBurgerBacon },
  { id: "burger-salada", name: "Burger Salada", description: "Blend 180g, queijo prato, alface, tomate e maionese verde.", price: 30.9, category: "hamburgueres", image: imgBurgerSalada },
  { id: "burger-duplo", name: "Duplo Smash", description: "Dois blends 120g smash, cheddar duplo e cebola caramelizada.", price: 39.9, category: "hamburgueres", image: imgBurgerDuplo },
  { id: "burger-cheddar", name: "Cheddar Melt", description: "Blend 180g afogado no cheddar cremoso com cebola crispy.", price: 36.9, category: "hamburgueres", image: imgBurgerCheddar },
  { id: "burger-frango", name: "Chicken Crispy", description: "Filé de frango empanado, alface americana e molho ranch.", price: 32.9, category: "hamburgueres", image: imgBurgerFrango },
  { id: "burger-costela", name: "Costela BBQ", description: "Costela desfiada, cheddar e molho barbecue defumado.", price: 42.9, category: "hamburgueres", image: imgBurgerCostela },
  { id: "burger-veggie", name: "Veggie Burger", description: "Hambúrguer de grão-de-bico, queijo, rúcula e maionese de ervas.", price: 31.9, category: "hamburgueres", image: imgBurgerVeggie },

  // Bolos
  { id: "bolo-fatia-chocolate", name: "Fatia de Bolo de Chocolate", description: "Massa fofinha com recheio de brigadeiro.", price: 12.9, category: "bolos", image: imgBoloFatiaChocolate },
  { id: "bolo-cenoura", name: "Bolo de Cenoura com Chocolate", description: "Inteiro 1,2kg, cobertura generosa de chocolate.", price: 59.9, category: "bolos", image: imgBoloCenoura },
  { id: "bolo-ninho-morango", name: "Bolo Ninho com Morango", description: "Inteiro 1,5kg, creme de leite ninho e morangos.", price: 84.9, category: "bolos", image: imgBoloNinhoMorango },
  { id: "bolo-prestigio", name: "Bolo Prestígio", description: "Inteiro 1,2kg, chocolate com recheio de coco.", price: 74.9, category: "bolos", image: imgBoloPrestigio },

  // Bebidas
  { id: "beb-coca-600", name: "Coca-Cola 600ml", description: "Refrigerante de cola gelado, garrafa 600ml.", price: 8.9, category: "bebidas", image: imgCoca },
  { id: "beb-coca-zero-600", name: "Coca-Cola Zero 600ml", description: "Cola zero açúcar gelada, garrafa 600ml.", price: 8.9, category: "bebidas", image: imgCocaZero },
  { id: "beb-coca-2l", name: "Coca-Cola 2L", description: "Refrigerante de cola gelado, garrafa 2 litros.", price: 14.9, category: "bebidas", image: imgCoca },
  { id: "beb-coca-zero-2l", name: "Coca-Cola Zero 2L", description: "Cola zero açúcar gelada, garrafa 2 litros.", price: 14.9, category: "bebidas", image: imgCocaZero },
  { id: "beb-guarana-600", name: "Guaraná Antarctica 600ml", description: "Guaraná gelado, garrafa 600ml.", price: 7.9, category: "bebidas", image: imgGuarana },
  { id: "beb-guarana-zero-600", name: "Guaraná Antarctica Zero 600ml", description: "Guaraná zero açúcar gelado, garrafa 600ml.", price: 7.9, category: "bebidas", image: imgGuaranaZero },
  { id: "beb-guarana-2l", name: "Guaraná Antarctica 2L", description: "Guaraná gelado, garrafa 2 litros.", price: 12.9, category: "bebidas", image: imgGuarana },
  { id: "beb-guarana-zero-2l", name: "Guaraná Antarctica Zero 2L", description: "Guaraná zero açúcar gelado, garrafa 2 litros.", price: 12.9, category: "bebidas", image: imgGuaranaZero },
  { id: "beb-agua-600", name: "Água Mineral 600ml", description: "Água mineral sem gás gelada, 600ml.", price: 4.9, category: "bebidas", image: imgAgua },
  { id: "beb-agua-2l", name: "Água Mineral 2L", description: "Água mineral sem gás, garrafa 2 litros.", price: 8.9, category: "bebidas", image: imgAgua },
];


/** Adicionais por categoria, com preço praticado em delivery. */
export const addonsByCategory: Record<CategoryId, Addon[]> = {
  combos: [
    { id: "cb-fritas", name: "Porção de fritas extra", price: 12.9 },
    { id: "cb-bacon", name: "Bacon extra", price: 6.5 },
    { id: "cb-sobremesa", name: "Fatia de bolo de chocolate", price: 9.9 },
  ],
  xis: [
    { id: "x-bacon", name: "Bacon extra", price: 6.5 },
    { id: "x-cheddar", name: "Cheddar cremoso", price: 5 },
    { id: "x-ovo", name: "Ovo frito", price: 3 },
    { id: "x-catupiry", name: "Catupiry", price: 5.5 },
    { id: "x-hamburguer", name: "Hambúrguer extra 180g", price: 12 },
    { id: "x-fritas", name: "Porção de fritas", price: 14.9 },
  ],
  pizzas: [
    { id: "p-borda-catupiry", name: "Borda recheada catupiry", price: 9.9 },
    { id: "p-borda-cheddar", name: "Borda recheada cheddar", price: 9.9 },
    { id: "p-bacon", name: "Bacon extra", price: 7 },
    { id: "p-mussarela", name: "Dobro de mussarela", price: 8.5 },
  ],
  acai: [
    { id: "a-granola", name: "Granola", price: 3 },
    { id: "a-leite-ninho", name: "Leite Ninho", price: 4.5 },
    { id: "a-nutella", name: "Nutella", price: 7.9 },
    { id: "a-morango", name: "Morango", price: 5 },
    { id: "a-condensado", name: "Leite condensado", price: 3.5 },
    { id: "a-pacoca", name: "Paçoca", price: 2.5 },
  ],
  sushi: [
    { id: "s-hot", name: "8 hot rolls extras", price: 24.9 },
    { id: "s-salmao", name: "5 sashimis de salmão", price: 22.9 },
    { id: "s-shoyu", name: "Shoyu extra", price: 2.5 },
    { id: "s-cream", name: "Cream cheese extra", price: 6 },
    { id: "s-hashi", name: "Hashi adicional", price: 1.5 },
  ],
  hamburgueres: [
    { id: "h-bacon", name: "Bacon extra", price: 6.5 },
    { id: "h-cheddar", name: "Cheddar cremoso", price: 5 },
    { id: "h-blend", name: "Blend extra 180g", price: 13 },
    { id: "h-fritas", name: "Porção de fritas", price: 14.9 },
    { id: "h-onion", name: "Onion rings", price: 12.9 },
  ],
  bolos: [
    { id: "c-morango", name: "Cobertura de morango", price: 8.9 },
    { id: "c-brigadeiro", name: "Brigadeiros de confeitaria", price: 9.9 },
    { id: "c-vela", name: "Kit vela + faca", price: 4.9 },
    { id: "c-mensagem", name: "Mensagem na placa", price: 5.9 },
  ],
  bebidas: [],
};

/** Bebidas disponíveis como adicional em todos os produtos. */
export const drinks: Addon[] = [
  { id: "d-coca-600", name: "Coca-Cola 600ml", price: 8.9 },
  { id: "d-coca-zero-600", name: "Coca-Cola Zero 600ml", price: 8.9 },
  { id: "d-coca-2l", name: "Coca-Cola 2L", price: 14.9 },
  { id: "d-coca-zero-2l", name: "Coca-Cola Zero 2L", price: 14.9 },
  { id: "d-guarana-600", name: "Guaraná Antarctica 600ml", price: 7.9 },
  { id: "d-guarana-zero-600", name: "Guaraná Zero 600ml", price: 7.9 },
  { id: "d-guarana-2l", name: "Guaraná Antarctica 2L", price: 12.9 },
  { id: "d-guarana-zero-2l", name: "Guaraná Zero 2L", price: 12.9 },
  { id: "d-agua-600", name: "Água Mineral 600ml", price: 4.9 },
  { id: "d-agua-2l", name: "Água Mineral 2L", price: 8.9 },
];

/** Adicionais da categoria + bebidas (não repete bebidas na própria aba). */
export const getAddons = (category: CategoryId): Addon[] =>
  category === "bebidas"
    ? []
    : [...addonsByCategory[category], ...drinks];


export const formatBRL = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
