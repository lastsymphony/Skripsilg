// api/scrape.js
import axios from "axios";
import * as cheerio from "cheerio";

const DEFAULT_URL = "https://skripsilagi.com/bikinjudul";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function ok(data) {
  return { ok: true, ...data };
}
function err(message, extra = {}) {
  return { ok: false, error: message, ...extra };
}
function absolute(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

export default async function handler(req, res) {
  const target = (req.query.url || DEFAULT_URL).trim();

  // Basic allowlist
  try {
    const u = new URL(target);
    if (!/skripsilagi\.com$/i.test(u.hostname)) {
      return res
        .status(400)
        .json(err("URL harus domain skripsilagi.com", { target }));
    }
  } catch {
    return res.status(400).json(err("URL tidak valid", { target }));
  }

  // Build init/data URL (terlihat di hasil inspect)
  const initUrl =
    "https://skripsilagi.com/api/1.1/init/data?location=" +
    encodeURIComponent(target);

  // Helper: fetch dengan timeout + UA
  const http = axios.create({
    timeout: 12000,
    headers: { "user-agent": UA, accept: "*/*" }
  });

  let initData = null;
  let html = null;

  // 1) Coba init/data dulu
  try {
    const r = await http.get(initUrl, { responseType: "json" });
    if (r.status === 200 && Array.isArray(r.data)) {
      initData = r.data;
    }
  } catch (e) {
    // silent; lanjut ke fallback
  }

  // 2) Fetch HTML untuk meta/OG + fallback parsing
  try {
    const r = await http.get(target, { responseType: "text" });
    html = r.data;
  } catch (e) {
    if (!initData) {
      return res
        .status(502)
        .json(err("Gagal fetch halaman & init data", { target }));
    }
  }

  // Parse HTML meta
  let meta = {};
  let assets = {};
  if (html) {
    const $ = cheerio.load(html);

    const title =
      $('meta[property="og:title"]').attr("content") ||
      $('meta[name="twitter:title"]').attr("content") ||
      $("title").first().text() ||
      null;

    const description =
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="twitter:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      null;

    const image =
      $('meta[property="og:image"]').attr("content") ||
      $('link[rel="image_src"]').attr("href") ||
      $('meta[name="twitter:image:src"]').attr("content") ||
      null;

    const canonical = $('link[rel="canonical"]').attr("href") || null;
    const favicon =
      $('link[rel="icon"]').attr("href") ||
      $('link[rel="shortcut icon"]').attr("href") ||
      null;

    // Bubble CDN src normalisasi
    meta = {
      url: target,
      title: title || null,
      description: description || null,
      image: image ? absolute(image, target) : null,
      canonical: canonical ? absolute(canonical, target) : null,
      favicon: favicon ? absolute(favicon, target) : null
    };

    // Kumpulkan asset css/js yang mungkin penting (opsional)
    const css = [];
    $('link[rel="stylesheet"]').each((_, el) => {
      const href = $(el).attr("href");
      if (href) css.push(absolute(href, target));
    });
    const js = [];
    $("script[src]").each((_, el) => {
      const src = $(el).attr("src");
      if (src) js.push(absolute(src, target));
    });
    assets = { css, js };
  }

  // Cache tipis 5 menit di edge/CDN
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");

  return res.status(200).json(
    ok({
      target,
      fetchedAt: new Date().toISOString(),
      source: {
        initDataUrl: initUrl,
        hasInitData: Boolean(initData),
        hasHtml: Boolean(html)
      },
      meta,
      assets,
      initData // array bubble init data jika tersedia
    })
  );
}
