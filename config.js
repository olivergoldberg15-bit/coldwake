/* Coldwake — storefront config (client-side, NO secrets).
 *
 * The Fourthwall storefront token is NOT here. It lives server-side as a Vercel
 * environment variable (FOURTHWALL_STOREFRONT_TOKEN) and is used only by the
 * /api/fw serverless proxy. The browser never sees it.
 *
 * TO ROTATE THE TOKEN (no code change, no redeploy needed for the value):
 *   Vercel → project "coldwake" → Settings → Environment Variables →
 *   edit FOURTHWALL_STOREFRONT_TOKEN → Redeploy.
 */
window.COLDWAKE_FW = {
  api: '/api/fw',                                // same-origin serverless proxy
  shopDomain: 'coldwake-shop.fourthwall.com',    // hosted checkout domain
  currency: 'USD',
  // Pin the featured product. This is the Fourthwall product UUID from the
  // dashboard URL (…/products/all/<id>/). Without it the site would just take
  // whatever product happens to come back first from the collection.
  productId: '979dacf7-9f77-4061-9c09-2f092a8a1bae',
};

/* Unlock-discount popup — first-visit email capture, shown once per browser.
 *
 * IMPORTANT — "code" does nothing on its own. Create a matching percentage-off
 * discount code in the Fourthwall dashboard (Fourthwall → Discounts → New
 * discount) using the EXACT same code string as below. The popup just shows
 * the customer this code after they enter their email; Fourthwall's checkout
 * is what actually applies it. To turn the popup off entirely, set
 * enabled: false. */
window.COLDWAKE_POPUP = {
  enabled: true,
  pct: 10,
  code: 'COLDWAKE10',
};
