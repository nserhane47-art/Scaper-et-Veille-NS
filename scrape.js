// Fonction serveur appelée par la page (sur Vercel : /api/scrape).
import { runScrape } from "../lib/scrape.js";
import { ScrapeError } from "../lib/fetcher.js";

const hits = new Map();
function tooMany(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 40; // 40 recherches / 10 min par poste
}

export async function handle(body, ip = "local") {
  const code = process.env.ACCESS_CODE;
  if (code && String(body.code || "").trim().toLowerCase() !== code.trim().toLowerCase()) {
    return { status: 401, json: { erreur: "Code de classe incorrect. Demandez-le à votre formateur." } };
  }
  if (tooMany(ip)) return { status: 429, json: { erreur: "Trop de recherches en peu de temps. Patientez quelques minutes." } };
  try {
    const result = await runScrape(body);
    return { status: 200, json: { ...result, date: new Date().toISOString(), source: body.url || body.query } };
  } catch (e) {
    if (e instanceof ScrapeError) return { status: 422, json: { erreur: e.message, code: e.code } };
    console.error(e);
    return { status: 500, json: { erreur: "Erreur inattendue pendant la lecture de la page." } };
  }
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).json({ codeRequis: Boolean(process.env.ACCESS_CODE), google: Boolean(process.env.GOOGLE_PLACES_API_KEY) });
  if (req.method !== "POST") return res.status(405).json({ erreur: "Méthode non autorisée" });
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0] || "inconnu";
  const out = await handle(body, ip);
  res.status(out.status).json(out.json);
}
