/**
 * Cardápio de demonstração. Preços FICTÍCIOS.
 * Imagens: fotos do Wikimedia Commons (créditos em frontend/public/images/products/credits.json)
 * e ilustrações próprias (.svg) identificadas como tal.
 */
const img = (name: string) => `/images/products/${name}-960.jpg`;

export const categories = [
  { slug: 'pamonhas-doces', name: 'Pamonhas doces', description: 'Feitas com milho verde ralado na hora', image: img('pamonha-queijo') },
  { slug: 'pamonhas-salgadas', name: 'Pamonhas salgadas', description: 'Tradição goiana com recheios generosos', image: img('pamonha-salgada') },
  { slug: 'pamonhas-especiais', name: 'Pamonhas especiais', description: 'Receitas da casa', image: img('pamonha-especial') },
  { slug: 'derivados-de-milho', name: 'Derivados de milho', description: 'Curau, canjica, bolo e mais', image: img('milho-cozido-2') },
  { slug: 'porcoes', name: 'Porções e acompanhamentos', description: 'Para dividir com a mesa', image: img('pao-de-queijo') },
  { slug: 'bebidas', name: 'Bebidas', description: 'Sucos naturais, refrigerantes e café', image: img('suco-laranja') },
  { slug: 'sobremesas', name: 'Sobremesas', description: 'O docinho depois da pamonha', image: img('pudim') },
  { slug: 'combos', name: 'Combos e promoções', description: 'Mais sabor por menos', image: img('pamonha-tradicional') },
];

type Addon = { name: string; price: number };
export interface DemoProduct {
  category: string;
  name: string;
  description: string;
  ingredients: string;
  price: number;
  promo?: number;
  image: string;
  featured?: boolean;
  prep?: number;
  addons?: Addon[];
}

const salgadaAddons: Addon[] = [
  { name: 'Queijo extra', price: 3 },
  { name: 'Carne extra', price: 5 },
  { name: 'Manteiga', price: 1.5 },
];
const doceAddons: Addon[] = [
  { name: 'Queijo extra', price: 3 },
  { name: 'Canela', price: 0.5 },
  { name: 'Leite condensado', price: 2 },
];

export const products: DemoProduct[] = [
  // Pamonhas doces
  {
    category: 'pamonhas-doces', name: 'Pamonha doce tradicional', price: 12, image: img('pamonha-queijo'), featured: true,
    description: 'Milho verde ralado, açúcar e uma pitada de sal, cozida na própria palha.',
    ingredients: 'Milho verde, açúcar, leite, sal', addons: doceAddons,
  },
  {
    category: 'pamonhas-doces', name: 'Pamonha doce com queijo', price: 14, image: img('pamonha-piracicaba'),
    description: 'A clássica pamonha doce com pedaços de queijo fresco que derretem por dentro.',
    ingredients: 'Milho verde, açúcar, leite, queijo fresco', addons: doceAddons,
  },
  // Pamonhas salgadas
  {
    category: 'pamonhas-salgadas', name: 'Pamonha salgada', price: 15, image: img('pamonha-salgada'), featured: true,
    description: 'Massa de milho temperada, cremosa e leve. Monte do seu jeito com os adicionais.',
    ingredients: 'Milho verde, sal, cheiro-verde, óleo', addons: salgadaAddons,
  },
  {
    category: 'pamonhas-salgadas', name: 'Pamonha com queijo', price: 16, image: img('pamonha-piracicaba-2'), featured: true,
    description: 'Recheada com queijo meia-cura derretido. A mais pedida da casa.',
    ingredients: 'Milho verde, queijo meia-cura, sal', addons: salgadaAddons,
  },
  {
    category: 'pamonhas-salgadas', name: 'Pamonha com carne', price: 18, image: img('pamonha-carne'),
    description: 'Carne de sol desfiada e refogada com cebola, dentro da massa de milho.',
    ingredients: 'Milho verde, carne de sol, cebola, sal', addons: salgadaAddons, prep: 12,
  },
  // Especiais
  {
    category: 'pamonhas-especiais', name: 'Pamonha à moda goiana', price: 20, image: img('pamonha-tradicional'), featured: true,
    description: 'Queijo, linguiça caseira e um toque de pimenta-de-cheiro. Receita de família.',
    ingredients: 'Milho verde, queijo, linguiça caseira, pimenta-de-cheiro', addons: salgadaAddons, prep: 12,
  },
  {
    category: 'pamonhas-especiais', name: 'Pamonha recheada da casa', price: 22, image: img('pamonha-especial'),
    description: 'Carne seca com requeijão cremoso. Generosa e bem recheada.',
    ingredients: 'Milho verde, carne seca, requeijão cremoso', addons: salgadaAddons, prep: 15,
  },
  // Derivados de milho
  {
    category: 'derivados-de-milho', name: 'Curau de milho', price: 10, image: '/images/products/curau.svg', featured: true,
    description: 'Creme de milho verde com leite e açúcar, finalizado com canela.',
    ingredients: 'Milho verde, leite, açúcar, canela', prep: 3,
    addons: [{ name: 'Canela extra', price: 0.5 }, { name: 'Leite condensado', price: 2 }],
  },
  {
    category: 'derivados-de-milho', name: 'Canjica', price: 11, image: img('canjica'),
    description: 'Milho branco cozido lentamente no leite com coco e amendoim.',
    ingredients: 'Milho branco, leite, coco ralado, amendoim, açúcar', prep: 3,
  },
  {
    category: 'derivados-de-milho', name: 'Bolo de milho (fatia)', price: 8, image: img('bolo-milho'),
    description: 'Bolo cremoso de milho verde, feito no dia.',
    ingredients: 'Milho verde, ovos, leite, açúcar, coco', prep: 2,
  },
  {
    category: 'derivados-de-milho', name: 'Milho cozido', price: 7, image: img('milho-cozido'),
    description: 'Espiga inteira cozida na hora, servida quentinha.',
    ingredients: 'Milho verde, sal', prep: 5, addons: [{ name: 'Manteiga', price: 1.5 }],
  },
  {
    category: 'derivados-de-milho', name: 'Cuscuz nordestino', price: 12, image: img('cuscuz'),
    description: 'Cuscuz de flocão de milho no vapor, com manteiga.',
    ingredients: 'Flocão de milho, sal, manteiga', prep: 8,
    addons: [{ name: 'Ovo', price: 2.5 }, { name: 'Queijo coalho', price: 4 }],
  },
  // Porções
  {
    category: 'porcoes', name: 'Pão de queijo (6 un.)', price: 12, image: img('pao-de-queijo'),
    description: 'Porção com seis pães de queijo mineiros, crocantes por fora.',
    ingredients: 'Polvilho, queijo canastra, ovos, leite', prep: 10,
  },
  {
    category: 'porcoes', name: 'Mandioca frita', price: 18, image: img('mandioca-frita'),
    description: 'Mandioca cozida e frita, sequinha, com sal grosso.',
    ingredients: 'Mandioca, sal grosso', prep: 12,
  },
  {
    category: 'porcoes', name: 'Queijo coalho na brasa', price: 16, image: img('queijo-coalho'),
    description: 'Espetinhos de queijo coalho dourados, com melado opcional.',
    ingredients: 'Queijo coalho', prep: 8, addons: [{ name: 'Melado de cana', price: 2 }],
  },
  // Bebidas
  {
    category: 'bebidas', name: 'Suco de laranja (500 ml)', price: 9, image: img('suco-laranja'),
    description: 'Laranja espremida na hora, sem adição de açúcar.',
    ingredients: 'Laranja', prep: 3,
  },
  {
    category: 'bebidas', name: 'Suco de maracujá com melancia (500 ml)', price: 9, image: img('suco-maracuja'),
    description: 'Suco natural de maracujá com melancia, batido com gelo.',
    ingredients: 'Maracujá, melancia, água, açúcar (opcional)', prep: 3,
  },
  {
    category: 'bebidas', name: 'Limonada', price: 8, image: img('limonada'),
    description: 'Limão, hortelã e gelo. Refrescante.',
    ingredients: 'Limão, hortelã, açúcar, água', prep: 3,
  },
  {
    category: 'bebidas', name: 'Refrigerante lata', price: 6, image: '/images/products/refrigerante.svg',
    description: 'Lata 350 ml. Consulte os sabores disponíveis.',
    ingredients: '', prep: 1,
  },
  {
    category: 'bebidas', name: 'Café coado', price: 5, image: img('cafe'),
    description: 'Café fresco passado no coador de pano.',
    ingredients: 'Café', prep: 2, addons: [{ name: 'Leite', price: 1 }],
  },
  // Sobremesas
  {
    category: 'sobremesas', name: 'Pudim de leite', price: 10, image: img('pudim'),
    description: 'Pudim de leite condensado com calda de caramelo.',
    ingredients: 'Leite, leite condensado, ovos, açúcar', prep: 2,
  },
  {
    category: 'sobremesas', name: 'Bolo de fubá', price: 8, image: img('bolo-fuba'),
    description: 'Bolo de fubá fofinho, receita de vó.',
    ingredients: 'Fubá, ovos, leite, açúcar, erva-doce', prep: 2,
  },
  // Combos
  {
    category: 'combos', name: 'Combo café da roça', price: 17, promo: 14.9, image: img('pamonha-tradicional'), featured: true,
    description: '1 pamonha doce tradicional + 1 café coado. Preço promocional.',
    ingredients: 'Pamonha doce tradicional, café coado', prep: 5,
  },
  {
    category: 'combos', name: 'Combo goiano', price: 35, promo: 29.9, image: img('milho-cozido-2'),
    description: '1 pamonha com queijo + 1 milho cozido + 1 suco natural de 500 ml.',
    ingredients: 'Pamonha com queijo, milho cozido, suco natural', prep: 12,
  },
];
