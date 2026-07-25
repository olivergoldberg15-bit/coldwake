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
};
