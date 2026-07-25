// Coldwake — Fourthwall storefront proxy (Vercel serverless function).
//
// Keeps the storefront token server-side. The token is read from the Vercel
// env var FOURTHWALL_STOREFRONT_TOKEN and never reaches the browser. The site
// calls this same-origin endpoint; this forwards to Fourthwall with the token.
//
// Verified live endpoints:
//   GET  /collections/{slug}/products  ->  { results: [ { ..., variants:[...] } ] }
//   GET  /carts/{id}
//   POST /carts?currency=USD           (body { items:[{variantId,quantity}] }) -> { id, items }
//   POST /carts/{id}/add
//   POST /carts/{id}/remove

const BASE = 'https://storefront-api.fourthwall.com/v1';

function upstreamUrl(path, token) {
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${sep}storefront_token=${encodeURIComponent(token)}`;
}
function post(obj) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}
function safeJson(s) { try { return JSON.parse(s || '{}'); } catch (_) { return {}; } }

module.exports = async (req, res) => {
  const token = process.env.FOURTHWALL_STOREFRONT_TOKEN;
  const collection = process.env.FOURTHWALL_COLLECTION || 'all';
  const currency = process.env.FOURTHWALL_CURRENCY || 'USD';

  if (!token) {
    res.status(500).json({ error: 'Store not configured (FOURTHWALL_STOREFRONT_TOKEN is not set).' });
    return;
  }

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const action = (req.query && req.query.action) || body.action;

  try {
    let upstream;
    if (req.method === 'GET' && action === 'products') {
      upstream = await fetch(upstreamUrl(`/collections/${collection}/products`, token));
    } else if (req.method === 'GET' && action === 'cart') {
      if (!req.query.id) return res.status(400).json({ error: 'Missing cart id' });
      upstream = await fetch(upstreamUrl(`/carts/${encodeURIComponent(req.query.id)}`, token));
    } else if (req.method === 'POST' && action === 'create') {
      upstream = await fetch(upstreamUrl(`/carts?currency=${currency}`, token), post({ items: body.items || [] }));
    } else if (req.method === 'POST' && action === 'add') {
      if (!body.cartId) return res.status(400).json({ error: 'Missing cartId' });
      upstream = await fetch(upstreamUrl(`/carts/${encodeURIComponent(body.cartId)}/add`, token), post({ items: body.items || [] }));
    } else if (req.method === 'POST' && action === 'remove') {
      if (!body.cartId) return res.status(400).json({ error: 'Missing cartId' });
      upstream = await fetch(upstreamUrl(`/carts/${encodeURIComponent(body.cartId)}/remove`, token), post({ items: body.items || [] }));
    } else {
      return res.status(400).json({ error: 'Unknown or unsupported action.' });
    }

    const text = await upstream.text();
    res.setHeader('Content-Type', 'application/json');
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'Upstream error: ' + (e && e.message ? e.message : 'unknown') });
  }
};
