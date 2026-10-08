// Serveur local (facultatif) : permet d'utiliser l'outil sur son ordinateur avec « npm start ».
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handle } from "./api/scrape.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

http
  .createServer(async (req, res) => {
    if (req.url.startsWith("/api/scrape")) {
      if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ codeRequis: Boolean(process.env.ACCESS_CODE), google: Boolean(process.env.GOOGLE_PLACES_API_KEY) }));
      }
      let raw = "";
      for await (const chunk of req) raw += chunk;
      let body = {};
      try {
        body = JSON.parse(raw || "{}");
      } catch {}
      const out = await handle(body, req.socket.remoteAddress);
      res.writeHead(out.status, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(out.json));
    }
    const html = fs.readFileSync(path.join(dir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  })
  .listen(PORT, () => console.log(`Outil de veille disponible sur http://localhost:${PORT}`));
