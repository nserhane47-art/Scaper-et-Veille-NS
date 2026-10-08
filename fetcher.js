// Récupération des pages web : contrôles de sécurité, robots.txt, téléchargement.
import dns from "node:dns/promises";
import net from "node:net";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export class ScrapeError extends Error {
  constructor(message, code = "erreur") {
    super(message);
    this.code = code;
  }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v = ip.toLowerCase();
  return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.");
}

export async function checkUrl(raw) {
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new ScrapeError("Adresse invalide : copiez l'adresse complète depuis la barre du navigateur (elle commence par https://).", "url");
  }
  if (!["http:", "https:"].includes(u.protocol)) throw new ScrapeError("Seules les adresses http(s) sont acceptées.", "url");
  if (process.env.ALLOW_LOCAL !== "1") {
    if (u.hostname === "localhost") throw new ScrapeError("Adresse non autorisée.", "url");
    try {
      const { address } = await dns.lookup(u.hostname);
      if (isPrivateIp(address)) throw new ScrapeError("Adresse non autorisée.", "url");
    } catch (e) {
      if (e instanceof ScrapeError) throw e;
      throw new ScrapeError(`Le site « ${u.hostname} » est introuvable. Vérifiez l'adresse.`, "url");
    }
  }
  return u;
}

async function rawFetch(url, timeoutMs = 6500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.6",
      },
    });
  } catch (e) {
    if (e.name === "AbortError") throw new ScrapeError("Le site met trop de temps à répondre. Réessayez plus tard.", "timeout");
    throw new ScrapeError("Impossible de joindre le site.", "reseau");
  } finally {
    clearTimeout(t);
  }
}

// ---- robots.txt : on respecte les interdictions déclarées par le site ----
function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const clean = line.replace(/#.*/, "").trim();
    const m = clean.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) {
        cur = { agents: [], rules: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (cur && (key === "allow" || key === "disallow")) cur.rules.push({ allow: key === "allow", path: val });
    }
  }
  return groups;
}

function ruleMatches(rulePath, path) {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith("$");
  const body = anchored ? rulePath.slice(0, -1) : rulePath;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path);
}

export async function robotsAllows(u) {
  try {
    const res = await rawFetch(`${u.origin}/robots.txt`, 2500);
    if (!res.ok) return { allowed: true, note: "pas de robots.txt" };
    const groups = parseRobots(await res.text());
    const group = groups.find((g) => g.agents.includes("*"));
    if (!group) return { allowed: true, note: "aucune règle générale" };
    const path = u.pathname + u.search;
    let best = null;
    for (const r of group.rules) {
      if (ruleMatches(r.path, path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
    }
    return best && !best.allow
      ? { allowed: false, note: `robots.txt interdit « ${best.path} »` }
      : { allowed: true, note: "autorisé par robots.txt" };
  } catch {
    return { allowed: true, note: "robots.txt illisible" };
  }
}

export async function fetchHtml(rawUrl, { skipRobots = false } = {}) {
  const u = await checkUrl(rawUrl);
  let robots = { allowed: true, note: "non vérifié" };
  if (!skipRobots) {
    robots = await robotsAllows(u);
    if (!robots.allowed) {
      throw new ScrapeError(
        `Ce site interdit la collecte automatique sur cette page (${robots.note}). L'outil respecte cette règle : relevez les informations à la main ou choisissez une autre source.`,
        "robots"
      );
    }
  }
  const res = await rawFetch(u.href);
  if (res.status === 403 || res.status === 429 || res.status === 503) {
    throw new ScrapeError(
      `Le site a bloqué la lecture automatique (code ${res.status}). Les grands sites marchands se protègent souvent contre les robots : essayez une autre enseigne ou faites un relevé manuel.`,
      "bloque"
    );
  }
  if (res.status === 404) throw new ScrapeError("Page introuvable (erreur 404). Vérifiez l'adresse.", "404");
  if (!res.ok) throw new ScrapeError(`Le site a répondu avec une erreur (code ${res.status}).`, "http");
  const type = res.headers.get("content-type") || "";
  if (!type.includes("html") && !type.includes("xml")) throw new ScrapeError("Cette adresse ne mène pas à une page web (fichier, image...).", "type");
  const html = await res.text();
  return { html, finalUrl: res.url || u.href, robots };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
