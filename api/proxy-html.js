// api/proxy-html.js
import axios from "axios";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export default async function handler(req, res) {
  const target = (req.query.url || "").trim();
  if (!target) return res.status(400).send("Missing ?url=");

  try {
    const u = new URL(target);
    if (!/skripsilagi\.com$/i.test(u.hostname)) {
      return res.status(400).send("Only skripsilagi.com allowed.");
    }
  } catch {
    return res.status(400).send("Invalid URL");
  }

  try {
    const r = await axios.get(target, {
      responseType: "text",
      headers: { "user-agent": UA, accept: "text/html,*/*" },
      timeout: 12000
    });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).send(r.data);
  } catch (e) {
    return res.status(502).send("Fetch failed");
  }
}
