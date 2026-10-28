// Version Netlify de la fonction serveur (adresse : /api/scrape).
import { handle } from "../../api/scrape.js";

export default async (req) => {
  const json = (status, data) =>
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
  if (req.method === "GET") {
    return json(200, { codeRequis: Boolean(process.env.ACCESS_CODE), google: Boolean(process.env.GOOGLE_PLACES_API_KEY) });
  }
  if (req.method !== "POST") return json(405, { erreur: "Méthode non autorisée" });
  let body = {};
  try {
    body = await req.json();
  } catch {}
  const ip = req.headers.get("x-nf-client-connection-ip") || "inconnu";
  const out = await handle(body, ip);
  return json(out.status, out.json);
};

export const config = { path: "/api/scrape" };
