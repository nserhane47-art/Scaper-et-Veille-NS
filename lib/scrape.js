// Point central : selon le type de veille choisi, lance la bonne extraction et met en forme les résultats.
import { fetchHtml, ScrapeError } from "./fetcher.js";
import { extractProduct, extractList, extractPromoMessages, extractContent, extractSiteReviews } from "./parsers.js";
import { googleReviews } from "./google.js";

const COLS_PRODUIT = [
  { key: "produit", label: "Produit" },
  { key: "marque", label: "Marque" },
  { key: "prix", label: "Prix (€)", type: "euro" },
  { key: "oldPrice", label: "Prix barré (€)", type: "euro" },
  { key: "discount", label: "Remise (%)", type: "pct" },
  { key: "disponibilite", label: "Disponibilité" },
  { key: "note", label: "Note /5", type: "num" },
  { key: "nbAvis", label: "Nb avis", type: "int" },
  { key: "reference", label: "Référence" },
  { key: "lien", label: "Lien", type: "url" },
];

const fmtEur = (n) => (n === null || n === undefined ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €");
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function priceStats(rows) {
  const prices = rows.map((r) => r.prix).filter((p) => p !== null);
  const promos = rows.filter((r) => r.discount);
  const stats = [{ label: "Produits relevés", value: String(rows.length) }];
  if (prices.length) {
    stats.push(
      { label: "Prix moyen", value: fmtEur(mean(prices)) },
      { label: "Prix médian", value: fmtEur(median(prices)) },
      { label: "Prix mini / maxi", value: `${fmtEur(Math.min(...prices))} / ${fmtEur(Math.max(...prices))}` }
    );
  }
  stats.push({ label: "Produits en promotion", value: `${promos.length} (${rows.length ? Math.round((promos.length / rows.length) * 100) : 0} %)` });
  if (promos.length) stats.push({ label: "Remise moyenne", value: Math.round(mean(promos.map((r) => r.discount))) + " %" });
  return stats;
}

function reviewStats(reviews) {
  const notes = reviews.map((r) => r.note).filter((n) => n !== null);
  const stats = [];
  if (notes.length) {
    stats.push({ label: "Note moyenne de l'échantillon", value: mean(notes).toFixed(1).replace(".", ",") + " / 5" });
    const dist = [5, 4, 3, 2, 1].map((k) => `${k}★ : ${notes.filter((n) => n === k).length}`).join("  ·  ");
    stats.push({ label: "Répartition", value: dist });
    const neg = notes.filter((n) => n <= 2).length;
    stats.push({ label: "Avis négatifs (1-2★)", value: `${neg} (${Math.round((neg / notes.length) * 100)} %)` });
  }
  return stats;
}

export async function runScrape({ type, url = "", query = "" }) {
  const notes = [];
  switch (type) {
    case "produit": {
      const { html, finalUrl } = await fetchHtml(url);
      const { rows, source, description } = extractProduct(html, finalUrl);
      if (!rows[0]?.produit) throw new ScrapeError("Aucune fiche produit reconnue sur cette page. Vérifiez qu'il s'agit bien de la page d'un produit.", "vide");
      if (rows[0].prix === null) notes.push("Prix non trouvé : il est peut-être affiché par un script après le chargement de la page. Relevez-le à la main.");
      notes.push(`Méthode : ${source}.`);
      return {
        titre: "Fiche produit",
        stats: description ? [{ label: "Description commerciale", value: description }] : [],
        tables: [{ titre: "Produit", colonnes: COLS_PRODUIT, lignes: rows }],
        notes,
      };
    }

    case "offre":
    case "promos": {
      const { html, finalUrl } = await fetchHtml(url);
      const prod = extractProduct(html, finalUrl);
      let { rows, source } = extractList(html, finalUrl, prod.$);
      if (!rows.length && prod.rows[0]?.prix !== null && prod.rows[0]?.produit) {
        rows = prod.rows;
        source = prod.source;
      }
      if (type === "offre") {
        if (!rows.length) {
          throw new ScrapeError(
            "Aucun produit avec un prix n'a été trouvé. Le site affiche probablement ses produits par un script (page « dynamique ») : essayez une autre page ou faites un relevé manuel.",
            "vide"
          );
        }
        notes.push(`Méthode : ${source}. Seule la première page de résultats est lue : changez de page ou de filtre sur le site pour compléter.`);
        notes.push("Contrôlez quelques lignes avec le site : l'outil peut confondre un prix au kilo ou une option avec le prix du produit.");
        return { titre: "Analyse de l'offre", stats: priceStats(rows), tables: [{ titre: "Produits relevés", colonnes: COLS_PRODUIT, lignes: rows }], notes };
      }
      const promoRows = rows.filter((r) => r.discount);
      const messages = extractPromoMessages(prod.$);
      if (!promoRows.length && !messages.length) {
        throw new ScrapeError("Aucune promotion détectée sur cette page. Essayez la page « Promotions », « Soldes » ou « Bons plans » du site.", "vide");
      }
      const tables = [];
      if (promoRows.length) tables.push({ titre: "Produits en promotion", colonnes: COLS_PRODUIT, lignes: promoRows.sort((a, b) => (b.discount || 0) - (a.discount || 0)) });
      if (messages.length) tables.push({ titre: "Messages promotionnels affichés", colonnes: [{ key: "message", label: "Message" }], lignes: messages.map((m) => ({ message: m })) });
      const stats = [
        { label: "Produits en promotion", value: `${promoRows.length} sur ${rows.length} relevés` },
      ];
      const disc = promoRows.map((r) => r.discount).filter(Boolean);
      if (disc.length) {
        stats.push({ label: "Remise moyenne", value: Math.round(mean(disc)) + " %" });
        stats.push({ label: "Remise maximale", value: Math.max(...disc) + " %" });
      }
      stats.push({ label: "Messages promotionnels", value: String(messages.length) });
      notes.push("Une remise affichée n'est pas forcément réelle : le prix de référence doit être le prix le plus bas pratiqué dans les 30 jours précédant la promotion (règle européenne).");
      return { titre: "Veille promotionnelle", stats, tables, notes };
    }

    case "avis-site": {
      const { html } = await fetchHtml(url);
      const r = extractSiteReviews(html);
      if (!r.reviews.length && r.note === null) {
        throw new ScrapeError(
          "Aucun avis lisible sur cette page. Beaucoup de sites chargent leurs avis par un script séparé : essayez la fiche d'un autre produit ou d'une autre enseigne, ou faites un relevé manuel.",
          "vide"
        );
      }
      const stats = [
        { label: "Produit ou page", value: r.nom || "—" },
        { label: "Note affichée", value: r.note !== null ? String(r.note).replace(".", ",") + " / 5" : "—" },
        { label: "Nombre total d'avis", value: r.total !== null ? r.total.toLocaleString("fr-FR") : "—" },
        { label: "Avis lisibles sur la page", value: String(r.reviews.length) },
        ...reviewStats(r.reviews),
      ];
      if (!r.reviews.length) notes.push("Seules la note globale et le nombre d'avis sont publiés dans le code de la page : le détail des avis est chargé à part.");
      notes.push("Les avis visibles sur une page ne sont qu'un échantillon (souvent les plus récents ou les plus « utiles »). Les noms des auteurs sont réduits à leurs initiales.");
      return {
        titre: "Avis clients du site",
        stats,
        tables: r.reviews.length ? [{
          titre: "Avis",
          colonnes: [
            { key: "date", label: "Date" },
            { key: "note", label: "Note /5", type: "num" },
            { key: "titre", label: "Titre" },
            { key: "avis", label: "Avis", type: "long" },
            { key: "auteur", label: "Auteur" },
          ],
          lignes: r.reviews,
        }] : [],
        notes,
      };
    }

    case "avis-google": {
      const g = await googleReviews(query || url);
      const stats = [
        { label: "Établissement", value: g.nom },
        { label: "Adresse", value: g.adresse },
        { label: "Note Google", value: g.note !== null ? String(g.note).replace(".", ",") + " / 5" : "—" },
        { label: "Nombre total d'avis", value: g.total !== null ? g.total.toLocaleString("fr-FR") : "—" },
        ...reviewStats(g.reviews),
      ];
      notes.push("Google ne transmet que 5 avis au maximum, choisis par son algorithme comme les « plus pertinents » : ils ne représentent pas l'ensemble des avis. La note globale et le nombre d'avis, eux, sont complets.");
      if (g.autres.length) notes.push("Autres établissements trouvés (précisez la recherche si ce n'est pas le bon) : " + g.autres.join(" ; "));
      return {
        titre: "Avis clients Google",
        stats,
        tables: [{
          titre: "Avis",
          colonnes: [
            { key: "date", label: "Date" },
            { key: "anciennete", label: "Ancienneté" },
            { key: "note", label: "Note /5", type: "int" },
            { key: "avis", label: "Avis", type: "long" },
            { key: "auteur", label: "Auteur" },
          ],
          lignes: g.reviews,
        }],
        lien: g.lien,
        notes,
      };
    }

    case "contenu": {
      const { html, finalUrl } = await fetchHtml(url);
      const c = extractContent(html, finalUrl);
      const tables = [{ titre: "Structure de la page", colonnes: [{ key: "element", label: "Élément" }, { key: "contenu", label: "Contenu", type: "long" }], lignes: c.structure }];
      if (c.articles.length) {
        tables.push({ titre: "Articles et actualités", colonnes: [{ key: "titre", label: "Titre" }, { key: "date", label: "Date" }, { key: "lien", label: "Lien", type: "url" }], lignes: c.articles });
      }
      if (c.rss.length) notes.push("Ce site propose un flux RSS (à ajouter à votre lecteur de veille) : " + c.rss.join(" ; "));
      return {
        titre: "Contenu de la page",
        stats: [{ label: "Titres repérés", value: String(c.structure.length) }, { label: "Articles repérés", value: String(c.articles.length) }],
        tables,
        notes,
      };
    }

    default:
      throw new ScrapeError("Type de veille inconnu.", "saisie");
  }
}
