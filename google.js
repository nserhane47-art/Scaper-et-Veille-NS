// Avis Google : passe par l'API officielle Google Places (la collecte directe sur Google Maps est interdite par Google).
import { ScrapeError } from "./fetcher.js";
import { clean, pseudonym } from "./parsers.js";

export async function googleReviews(query) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new ScrapeError(
      "Les avis Google ne sont pas encore activés sur cet outil : le formateur doit ajouter une clé Google Places (voir le guide d'installation).",
      "config"
    );
  }
  if (!query || query.trim().length < 3) {
    throw new ScrapeError("Indiquez le nom de l'établissement et sa ville, par exemple « Boulangerie Ange Agen ».", "saisie");
  }
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.reviews,places.googleMapsUri,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({ textQuery: query.trim(), languageCode: "fr", regionCode: "FR", pageSize: 3 }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new ScrapeError(`Google a refusé la demande (code ${res.status}). Vérifiez la clé API. Détail : ${clean(txt, 200)}`, "google");
  }
  const data = await res.json();
  const places = data.places || [];
  if (!places.length) throw new ScrapeError("Aucun établissement trouvé. Précisez le nom et la ville.", "vide");
  const p = places[0];
  const reviews = (p.reviews || []).map((r) => ({
    date: String(r.publishTime || "").slice(0, 10),
    anciennete: r.relativePublishTimeDescription || "",
    note: r.rating ?? null,
    avis: clean(r.text?.text || r.originalText?.text || "", 1500),
    auteur: pseudonym(r.authorAttribution?.displayName),
  }));
  return {
    nom: p.displayName?.text || "",
    adresse: p.formattedAddress || "",
    categorie: p.primaryTypeDisplayName?.text || "",
    note: p.rating ?? null,
    total: p.userRatingCount ?? null,
    lien: p.googleMapsUri || "",
    reviews,
    autres: places.slice(1).map((x) => `${x.displayName?.text || ""} (${x.formattedAddress || ""})`),
  };
}
