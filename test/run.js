import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { runScrape } from "../lib/scrape.js";
import { findPrices } from "../lib/parsers.js";
process.env.ALLOW_LOCAL = "1";
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), "pages");
const srv = http.createServer((req, res) => {
  const f = path.join(dir, req.url.split("?")[0]);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, {"Content-Type": f.endsWith(".txt")?"text/plain":"text/html"}); res.end(fs.readFileSync(f)); }
  else { res.writeHead(404); res.end(); }
}).listen(4567);
const B = "http://127.0.0.1:4567";
const show = (t, r) => console.log("\n=== " + t + " ===\n" + JSON.stringify(r, null, 1).slice(0, 2500));
console.log("prix:", findPrices("14€90 1 299,00 € 12.49 € 14,90 €/kg € 5,50 29 EUR"));
show("produit", await runScrape({ type: "produit", url: B + "/produit.html" }));
show("offre", await runScrape({ type: "offre", url: B + "/liste.html" }));
show("promos", await runScrape({ type: "promos", url: B + "/liste.html" }));
show("contenu", await runScrape({ type: "contenu", url: B + "/blog.html" }));
show("avis site", await runScrape({ type: "avis-site", url: B + "/avis.html" }));
try { await runScrape({ type: "produit", url: B + "/prive/x.html" }); } catch (e) { console.log("\nrobots:", e.code, e.message.slice(0, 90)); }
try { await runScrape({ type: "avis-google", query: "Boulangerie Agen" }); } catch (e) { console.log("google sans clé:", e.code); }
try { await runScrape({ type: "produit", url: "pas une url" }); } catch (e) { console.log("url:", e.code); }
const f = await runScrape({ type: "offre", url: B + "/liste.html?filters=marque:x" });
console.log("\nfiltres:", f.tables[0].lignes.length, "produits |", f.notes[0].slice(0, 70));
srv.close();
