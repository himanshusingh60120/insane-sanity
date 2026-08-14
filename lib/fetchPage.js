const UA =
  'Mozilla/5.0 (compatible; KRSanityChecker/1.0; +https://www.kingsresearch.com)';

export async function fetchWithTimeout(url, opts = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, {
      redirect: 'follow',
      ...opts,
      headers: { 'user-agent': UA, ...(opts.headers || {}) },
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches the page and every same-origin stylesheet it links to. The stylesheets
 * matter: a heading can look ALL CAPS on screen because of
 * `text-transform: uppercase` while the HTML source is correctly cased, and the
 * two cases need different fixes (one is a CMS content fix, one is a CSS fix).
 */
export async function fetchPage(url, { userAgent } = {}) {
  const started = Date.now();
  const res = await fetchWithTimeout(url, userAgent ? { headers: { 'user-agent': userAgent } } : {});
  const html = await res.text();
  const ttfbMs = Date.now() - started;

  const origin = new URL(url).origin;
  const hrefs = Array.from(
    html.matchAll(/<link[^>]+rel=["']?stylesheet["']?[^>]*>/gi)
  )
    .map((m) => (m[0].match(/href=["']([^"']+)["']/i) || [])[1])
    .filter(Boolean)
    .map((h) => {
      try {
        return new URL(h, url).href;
      } catch {
        return null;
      }
    })
    .filter((h) => h && h.startsWith(origin))
    .slice(0, 4);

  const sheets = await Promise.all(
    hrefs.map(async (href) => {
      try {
        const r = await fetchWithTimeout(href, {}, 6000);
        if (!r.ok) return '';
        return await r.text();
      } catch {
        return '';
      }
    })
  );

  // Cap the CSS handed to the rules. Next.js ships very large stylesheets and
  // the selector matching below is linear in their size.
  const css = sheets.join('\n').slice(0, 600_000);

  return {
    url: res.url || url,
    status: res.status,
    ok: res.ok,
    html,
    css,
    ttfbMs,
    contentType: res.headers.get('content-type') || '',
  };
}

/**
 * HEAD first, falling back to a ranged GET only for servers that explicitly
 * reject HEAD. The fallback used to run after any HEAD failure including a
 * timeout, which doubled the worst case per link to twenty seconds — with
 * eighty links that is over four minutes and a guaranteed 504.
 */
export async function probe(url, timeoutMs = 5000) {
  try {
    const head = await fetchWithTimeout(url, { method: 'HEAD' }, timeoutMs);
    if (head.status !== 405 && head.status !== 501) {
      return { url, status: head.status, ok: head.ok, type: head.headers.get('content-type') || '' };
    }
  } catch (err) {
    // A timeout on HEAD means a slow host, not a host that dislikes HEAD.
    // Retrying with GET just spends the same time again.
    return {
      url,
      status: 0,
      ok: false,
      type: '',
      error: err.name === 'AbortError' ? 'timeout' : String(err.message || err),
    };
  }
  try {
    const get = await fetchWithTimeout(url, { headers: { range: 'bytes=0-2048' } }, timeoutMs);
    return { url, status: get.status, ok: get.ok, type: get.headers.get('content-type') || '' };
  } catch (err) {
    return { url, status: 0, ok: false, type: '', error: err.name === 'AbortError' ? 'timeout' : String(err.message || err) };
  }
}

export async function fetchSitemapUrls(sitemapUrl) {
  try {
    const res = await fetchWithTimeout(sitemapUrl, {}, 20000);
    if (!res.ok) return [];
    const xml = await res.text();
    return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)).map((m) => m[1]);
  } catch {
    return [];
  }
}
