// Extraction des informations utiles à partir du code HTML d'une page.
import * as cheerio from "cheerio";

const clean = (s, max = 400) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};
const num = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

// ---------- Prix ----------
// Repère les prix en euros dans un texte : « 1 299,99 € », « 29€99 », « 29.99 € », « € 29,99 ».
// Ignore les prix unitaires (« 12,50 €/kg »).
export function findPrices(text) {
  let s = String(text || "").replace(/[  ]/g, " ");
  const out = [];
  s = s.replace(/(?<![\d,.])(\d+)\s?€(\d{2})(?![\d.,])/g, (m, a, b) => {
    out.push(parseFloat(`${a}.${b}`));
    return " ";
  });
  s = s.replace(/(\d{1,3}(?:[ .]\d{3})+|\d+)(?:[,.](\d{1,2}))?\s?(?:€|EUR)(?!\s?\/)/g, (m, ent, dec) => {
    out.push(parseFloat(ent.replace(/[ .]/g, "") + (dec ? "." + dec.padEnd(2, "0") : "")));
    return " ";
  });
  s.replace(/€\s?(\d+(?:[.,]\d{1,2})?)(?!\s?\/)/g, (m, v) => {
    out.push(parseFloat(v.replace(",", ".")));
    return " ";
  });
  return out.filter((n) => n > 0 && n < 1000000);
}

const OLD_PRICE_SEL =
  'del, s, strike, [class*="old" i], [class*="strike" i], [class*="barre" i], [class*="before" i], [class*="was" i], [class*="crossed" i], [class*="regular" i], [class*="initial" i], [class*="original" i]';

function discountBadge(text) {
  const m = String(text).match(/-\s?(\d{1,2})\s?%/);
  return m ? parseInt(m[1], 10) : null;
}

function promoFields(price, oldPrice, badge) {
  if (price !== null && oldPrice !== null && oldPrice > price) {
    return { oldPrice: round2(oldPrice), discount: Math.round((1 - price / oldPrice) * 100) };
  }
  return { oldPrice: null, discount: badge ?? null };
}

// ---------- Données structurées (JSON-LD schema.org) ----------
export function readJsonLd($) {
  const items = [];
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(walk);
    items.push(o);
    if (o["@graph"]) walk(o["@graph"]);
    if (o.hasVariant) walk(o.hasVariant);
    if (o.itemListElement) walk(o.itemListElement);
    if (o.item && typeof o.item === "object") walk(o.item);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).contents().text().trim()));
    } catch {
      /* JSON mal formé : on ignore */
    }
  });
  return items;
}
const hasType = (o, t) => [].concat(o["@type"] || []).some((x) => String(x).toLowerCase() === t);

function availabilityFr(v) {
  const s = String(v || "").toLowerCase();
  if (!s) return "";
  if (s.includes("instock")) return "En stock";
  if (s.includes("outofstock") || s.includes("soldout")) return "Rupture";
  if (s.includes("preorder")) return "Précommande";
  if (s.includes("limited")) return "Stock limité";
  if (s.includes("backorder")) return "Sur commande";
  return clean(s.split("/").pop(), 40);
}

function productFromLd(p, pageUrl) {
  const offers = [].concat(p.offers || []);
  const offer = offers[0] || {};
  let price = num(offer.price ?? offer.lowPrice ?? offer.priceSpecification?.price);
  const specs = [].concat(offer.priceSpecification || []);
  let oldPrice = null;
  for (const sp of specs) {
    const v = num(sp.price);
    if (v !== null && String(sp.priceType || "").match(/ListPrice|StrikethroughPrice/i)) oldPrice = v;
  }
  const rating = p.aggregateRating || {};
  const brand = typeof p.brand === "string" ? p.brand : p.brand?.name;
  return {
    produit: clean(p.name, 160),
    marque: clean(brand, 60),
    prix: round2(price),
    ...promoFields(price, oldPrice, null),
    disponibilite: availabilityFr(offer.availability),
    note: round2(num(rating.ratingValue)),
    nbAvis: num(rating.reviewCount ?? rating.ratingCount),
    reference: clean(p.sku || p.gtin13 || p.gtin || p.mpn || "", 40),
    lien: p.url ? absUrl(p.url, pageUrl) : pageUrl,
  };
}

function absUrl(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

// ---------- Fiche produit ----------
export function extractProduct(html, pageUrl) {
  const $ = cheerio.load(html);
  const ld = readJsonLd($).filter((o) => hasType(o, "product"));
  let rows = ld.map((p) => productFromLd(p, pageUrl)).filter((r) => r.produit);
  const source = rows.length ? "données structurées" : "lecture de la page";

  if (!rows.length) {
    const meta = (n) => $(`meta[property="${n}"], meta[name="${n}"]`).attr("content");
    const name = meta("og:title") || $("h1").first().text() || $("title").text();
    let price = num(meta("product:price:amount") || meta("og:price:amount") || $('[itemprop="price"]').attr("content") || $('[itemprop="price"]').first().text());
    if (price === null) {
      const zone = $('[class*="price" i], [id*="price" i], [class*="prix" i]').first().text();
      price = findPrices(zone)[0] ?? null;
    }
    rows = [{
      produit: clean(name, 160),
      marque: clean($('[itemprop="brand"]').first().text() || meta("product:brand"), 60),
      prix: round2(price),
      oldPrice: null,
      discount: null,
      disponibilite: availabilityFr($('[itemprop="availability"]').attr("href") || $('[itemprop="availability"]').attr("content")),
      note: round2(num($('[itemprop="ratingValue"]').attr("content") || $('[itemprop="ratingValue"]').text())),
      nbAvis: num($('[itemprop="reviewCount"]').attr("content") || $('[itemprop="reviewCount"]').text()),
      reference: clean($('[itemprop="sku"]').attr("content") || $('[itemprop="sku"]').text(), 40),
      lien: pageUrl,
    }];
  }

  // Prix barré visible sur la page (souvent absent des données structurées)
  const main = rows[0];
  if (main && main.prix !== null && main.oldPrice === null) {
    let old = null;
    $(OLD_PRICE_SEL).each((_, el) => {
      const t = $(el).text();
      if (t.length > 40) return;
      const p = findPrices(t)[0];
      if (p && p > main.prix && p < main.prix * 5 && old === null) old = p;
    });
    const badge = discountBadge($('[class*="discount" i], [class*="promo" i], [class*="remise" i], [class*="badge" i]').text());
    Object.assign(main, promoFields(main.prix, old, badge));
  }

  const description = clean(
    $('meta[name="description"]').attr("content") || $('[itemprop="description"]').first().text(),
    300
  );
  return { rows, source, description, $ };
}

// Insère des espaces entre les blocs pour que les textes voisins ne se collent pas
// (« 14,90 €14,90 €/kg » deviendrait illisible).
const BLOCKS = "div,li,p,h1,h2,h3,h4,h5,h6,td,th,tr,section,article,header,footer,br,ul,ol,dd,dt";
export function spaceOut($) {
  if ($.__spaced) return $;
  $("body *").each((_, el) => {
    const $el = $(el);
    if ($el.is("script,style,noscript")) return;
    if ($el.is(BLOCKS) || /€|EUR|%/.test($el.text())) $el.append(" ");
  });
  $.__spaced = true;
  return $;
}

// Montants qui ne sont pas le prix de vente : économie réalisée, mensualités, frais de livraison,
// éco-participation, seuils (« dès 35 € d'achat »), prix au kilo...
const NOT_PRICE_RE =
  /(économis|economis|économie|economie|vous gagnez|soit\s|remise de|réduction de|de remise|de réduction|d'économie|échéance|echeance|mensualit|fois sans frais|x\s?\d|\/\s?mois|par mois|livraison|frais de port|éco-?part|eco-?part|dont\s|dès\s|des\s\d|à partir de\s\d+[.,]?\d*\s?€\s?d|d'achat|offerts? dès|\/\s?(kg|l|m|m2|m²|unité|pièce)|le kg|le litre|au kg|au litre)/i;

export function pickPrices($, $c) {
  // 1) on retire les petits blocs de texte qui contiennent un montant « parasite »
  const $copy = $c.clone();
  $copy.find("*").each((_, el) => {
    const $el = $(el);
    const t = $el.text();
    if (t.length < 120 && NOT_PRICE_RE.test(t) && findPrices(t).length) $el.remove();
  });
  let old = null;
  $copy.find(OLD_PRICE_SEL).each((_, el) => {
    const t = $(el).text();
    if (t.length > 40) return;
    const p = findPrices(t)[0];
    if (p && old === null) old = p;
  });
  const all = findPrices($copy.text());
  let current = [...new Set(all.filter((p) => p !== old))];
  // 2) un montant égal à « prix barré - un autre prix » est l'économie, pas le prix
  if (old !== null && current.length > 1) {
    current = current.filter((p) => !current.some((q) => q !== p && Math.abs(q + p - old) < 0.02) || current.every((q) => q <= p));
  }
  // 3) le prix de vente est le plus élevé des montants restants inférieurs au prix barré
  const below = old !== null ? current.filter((p) => p < old) : current;
  let price = below.length ? Math.max(...below) : current.length ? Math.min(...current) : old;
  if (old === null && current.length >= 2) {
    // pas de prix barré repéré par sa mise en forme : deux montants dont l'un ≈ somme des autres
    const mx = Math.max(...current);
    const rest = current.filter((p) => p !== mx);
    // dans la paire « prix + économie = prix barré », l'économie est le plus petit des deux montants
    const pair = rest.filter((s) => rest.some((p) => p !== s && Math.abs(p + s - mx) < 0.02));
    const savings = pair.length ? Math.min(...pair) : undefined;
    const cand = rest.filter((p) => p !== savings);
    if (cand.length && mx < Math.max(...cand) * 5) {
      old = mx;
      price = Math.max(...cand);
    } else if (cand.length === 0 && rest.length) {
      price = Math.max(...rest);
      old = mx;
    }
  }
  return { price, old };
}

// ---------- Page catalogue / liste de produits ----------
export function extractList(html, pageUrl, $pre) {
  const $ = spaceOut($pre || cheerio.load(html));

  // 1) Données structurées : liste de produits
  const ld = readJsonLd($).filter((o) => hasType(o, "product"));
  if (ld.length >= 2) {
    return { rows: ld.map((p) => productFromLd(p, pageUrl)).filter((r) => r.produit), source: "données structurées" };
  }

  // 2) Lecture des « cartes produit » : un bloc qui contient un prix, un lien et une image ou un titre
  const priceHolders = [];
  $("body *").each((_, el) => {
    const $el = $(el);
    if ($el.is("script, style, noscript, svg")) return;
    const t = $el.text();
    if (t.length > 60 || !findPrices(t).length) return;
    const childHasPrice = $el.children().toArray().some((c) => findPrices($(c).text()).length);
    if (!childHasPrice) priceHolders.push(el);
  });

  const cards = new Set();
  for (const el of priceHolders) {
    let node = $(el);
    for (let i = 0; i < 8; i++) {
      node = node.parent();
      if (!node.length || node.is("body")) break;
      const len = node.text().replace(/\s+/g, " ").length;
      if (len > 700) break;
      if (node.find("a[href]").length && (node.find("img").length || node.find("h2,h3,h4,[class*=title i],[class*=name i]").length)) {
        cards.add(node.get(0));
        break;
      }
    }
  }
  // On garde les blocs les plus fins (un bloc qui en contient un autre est un conteneur)
  const list = [...cards].filter((c) => ![...cards].some((o) => o !== c && $(c).find(o).length));

  const rows = [];
  const seen = new Set();
  for (const c of list.slice(0, 150)) {
    const $c = $(c);
    let title =
      $c.find("h2,h3,h4,[class*=title i],[class*=name i]").first().text() ||
      $c.find("img[alt]").first().attr("alt") ||
      $c.find("a[title]").first().attr("title") ||
      $c.find("a").first().text();
    title = clean(title, 160);
    if (!title || title.length < 3) continue;

    const { price, old } = pickPrices($, $c);
    const href = absUrl($c.find("a[href]").first().attr("href"), pageUrl);
    const key = title + "|" + price;
    if (seen.has(key)) continue;
    seen.add(key);
    const ratingMatch = $c.text().match(/(\d[.,]\d)\s?\/\s?5/);
    rows.push({
      produit: title,
      marque: "",
      prix: round2(price),
      ...promoFields(price, old, discountBadge($c.text())),
      disponibilite: /rupture|indisponible|épuisé/i.test($c.text()) ? "Rupture" : "",
      note: ratingMatch ? num(ratingMatch[1]) : null,
      nbAvis: null,
      reference: "",
      lien: href,
    });
  }
  return { rows, source: "lecture de la page" };
}

// ---------- Messages promotionnels (bandeaux, codes promo, soldes) ----------
export function extractPromoMessages($) {
  spaceOut($);
  const re = /(-\s?\d{1,2}\s?%|soldes?|promo|remise|réduction|offert|gratuit|black friday|french days|destockage|déstockage|code\s+[A-Z0-9]{3,}|2\s?\+\s?1|1\s?acheté|livraison offerte|ventes? flash|bon plan)/i;
  const out = new Set();
  $("body *").each((_, el) => {
    const $el = $(el);
    if ($el.is("script, style, noscript, option")) return;
    if ($el.children().length > 3) return;
    const t = clean($el.text(), 200);
    if (t.length < 6 || t.length > 160 || !re.test(t)) return;
    out.add(t);
  });
  // supprime les messages contenus dans un autre plus long
  const arr = [...out];
  return arr.filter((m) => !arr.some((o) => o !== m && o.includes(m) && o.length < 160)).slice(0, 40);
}

// ---------- Contenu éditorial / actualités ----------
export function extractContent(html, pageUrl) {
  const $ = cheerio.load(html);
  const structure = [];
  const push = (el, txt) => txt && structure.push({ element: el, contenu: clean(txt, 300) });
  push("Titre de la page", $("title").first().text());
  push("Description (meta)", $('meta[name="description"]').attr("content"));
  $("h1").slice(0, 3).each((_, e) => push("Titre principal (H1)", $(e).text()));
  $("h2").slice(0, 25).each((_, e) => push("Sous-titre (H2)", $(e).text()));

  const articles = [];
  const seen = new Set();
  const addArt = (title, href, date) => {
    title = clean(title, 200);
    const link = absUrl(href, pageUrl);
    if (!title || title.length < 15 || !link || seen.has(link)) return;
    seen.add(link);
    articles.push({ titre: title, date: clean(date, 40), lien: link });
  };
  $("article").each((_, a) => {
    const $a = $(a);
    const h = $a.find("h1,h2,h3,h4").first();
    const link = h.find("a").attr("href") || h.closest("a").attr("href") || $a.find("a[href]").first().attr("href");
    const time = $a.find("time").first();
    addArt(h.text() || $a.find("a").first().text(), link, time.attr("datetime") || time.text());
  });
  if (articles.length < 3) {
    $("h2 a[href], h3 a[href], a[href] h2, a[href] h3").each((_, e) => {
      const $e = $(e);
      const a = $e.is("a") ? $e : $e.closest("a");
      addArt($e.text(), a.attr("href"), "");
    });
  }
  const rss = [];
  $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each((_, l) => rss.push(absUrl($(l).attr("href"), pageUrl)));
  return { structure, articles: articles.slice(0, 80), rss };
}

// ---------- Avis Trustpilot ----------
export function pseudonym(name) {
  const parts = clean(name, 80).split(/[\s.\-_]+/).filter(Boolean);
  if (!parts.length) return "Anonyme";
  return parts.slice(0, 2).map((p) => p[0].toUpperCase() + ".").join(" ");
}

// Avis publiés sur la page (données structurées schema.org Review)
export function extractSiteReviews(html) {
  const $ = cheerio.load(html);
  const ld = readJsonLd($);
  const target = ld.find((o) => o.review || o.reviews) || ld.find((o) => o.aggregateRating) || {};
  const agg = target.aggregateRating || ld.find((o) => hasType(o, "aggregaterating")) || {};
  const list = [].concat(target.review || target.reviews || [], ld.filter((o) => hasType(o, "review") && !target.review?.includes?.(o)));
  const reviews = list.map((r) => ({
    date: String(r.datePublished || "").slice(0, 10),
    note: num(r.reviewRating?.ratingValue ?? r.reviewRating),
    titre: clean(r.name || r.headline || "", 200),
    avis: clean(r.reviewBody || r.description || "", 1500),
    auteur: pseudonym(typeof r.author === "string" ? r.author : r.author?.name),
  }));
  if (!reviews.length) {
    $('[itemprop="review"]').each((_, el) => {
      const $r = $(el);
      const g = (k) => $r.find(`[itemprop="${k}"]`).first();
      reviews.push({
        date: String(g("datePublished").attr("content") || g("datePublished").text()).slice(0, 10),
        note: num(g("ratingValue").attr("content") || g("ratingValue").text()),
        titre: clean(g("name").text(), 200),
        avis: clean(g("reviewBody").text() || g("description").text(), 1500),
        auteur: pseudonym(g("author").text()),
      });
    });
  }
  return {
    nom: clean(target.name || $("h1").first().text() || $("title").text(), 160),
    note: num(agg.ratingValue ?? $('[itemprop="ratingValue"]').first().attr("content")),
    total: num(agg.reviewCount ?? agg.ratingCount ?? $('[itemprop="reviewCount"]').first().attr("content")),
    reviews: reviews.filter((r) => r.avis || r.note !== null),
  };
}

export { clean, num, round2 };
