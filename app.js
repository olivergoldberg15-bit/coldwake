/* Coldwake — storefront interactions (Fourthwall via same-origin proxy).
 * The browser calls /api/fw (a Vercel serverless function); the storefront
 * token lives only in that function's env, never in this file or the browser.
 * Proxy actions:
 *   GET  /api/fw?action=products
 *   GET  /api/fw?action=cart&id={cartId}
 *   POST /api/fw { action:'create'|'add'|'remove', cartId?, items:[{variantId,quantity}] }
 * Checkout is a plain client-side redirect to the Fourthwall hosted checkout.
 * ------------------------------------------------------------------ */

/* ---------- newsletter backend hook (unchanged, no-ops until apiBase set) ---------- */
const COLDWAKE = {
  apiBase: '',
  endpoints: { subscribe: '/subscribe' },
};
async function apiPost(path, body) {
  if (!COLDWAKE.apiBase) return { ok: false, offline: true };
  try {
    const res = await fetch(COLDWAKE.apiBase + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => null) };
  } catch (err) { return { ok: false, error: err }; }
}

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
function fmtMoney(value, currency = 'USD') {
  const n = Number(value) || 0;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(2);
  return currency === 'USD' ? `$${s}` : `${s} ${currency}`;
}
let toastTimer;
function toast(msg) {
  const el = $('#cw-toast');
  el.textContent = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 2600);
}

/* ---------- Fourthwall data layer (via /api/fw proxy) ---------- */
const FW = window.COLDWAKE_FW || {};
const FW_CART_KEY = 'cw_fw_cart_id';
const fwState = { product: null, variant: null, cart: null };

async function fwCall(method, params, body) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  let res;
  try {
    res = await fetch(`${FW.api}${qs}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    throw new Error('Network error reaching the shop. Check your connection and try again.');
  }
  if (!res.ok) {
    let msg = `Shop error ${res.status}`;
    try { const j = await res.json(); msg = j.error || j.detail || msg; } catch (_) {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function fwGetProducts() {
  const data = await fwCall('GET', { action: 'products' });
  return (data && data.results) || [];
}
function fwNormalize(p) {
  return {
    id: p.id,
    name: p.name,
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      size: (v.attributes && v.attributes.size && v.attributes.size.name) || v.name,
      color: (v.attributes && v.attributes.color && v.attributes.color.name) || '',
      price: v.unitPrice ? v.unitPrice.value : null,
      currency: (v.unitPrice && v.unitPrice.currency) || FW.currency,
      image: (v.images && v.images[0] && v.images[0].url) || (p.images && p.images[0] && p.images[0].url) || '',
      available: !v.stock || v.stock.type !== 'OUT_OF_STOCK',
    })),
  };
}
function minPrice(p) {
  const nums = p.variants.map((v) => v.price).filter((x) => x != null);
  return nums.length ? Math.min(...nums) : null;
}

/* ---------- Fourthwall cart ---------- */
const fwCartId = {
  get() { try { return localStorage.getItem(FW_CART_KEY) || null; } catch { return null; } },
  set(id) { try { localStorage.setItem(FW_CART_KEY, id); } catch {} },
  clear() { try { localStorage.removeItem(FW_CART_KEY); } catch {} },
};
async function fwGetCart() {
  const id = fwCartId.get();
  if (!id) return null;
  try { return await fwCall('GET', { action: 'cart', id }); }
  catch (e) { if (e.status === 404 || e.status === 400) fwCartId.clear(); return null; }
}
async function fwAddVariant(variantId, qty = 1) {
  const id = fwCartId.get();
  const items = [{ variantId, quantity: qty }];
  let cart;
  if (!id) {
    cart = await fwCall('POST', null, { action: 'create', items });
    if (cart && cart.id) fwCartId.set(cart.id);
  } else {
    cart = await fwCall('POST', null, { action: 'add', cartId: id, items });
  }
  return cart;
}
async function fwRemoveVariant(variantId, qty = 1) {
  const id = fwCartId.get();
  if (!id) return null;
  return fwCall('POST', null, { action: 'remove', cartId: id, items: [{ variantId, quantity: qty }] });
}
function checkoutUrlForCart(cartId) {
  return `https://${FW.shopDomain}/cart/checkout?cartId=${encodeURIComponent(cartId)}&currency=${FW.currency}`;
}
function checkoutUrlForVariant(variantId, qty = 1) {
  return `https://${FW.shopDomain}/cart/checkout?products=${encodeURIComponent(variantId)}:${qty}`;
}

/* ---------- featured product: price + inline error ---------- */
function setFeatureError(msg) {
  const el = $('#cw-feature-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}
function updatePriceLabels() {
  const v = fwState.variant;
  const priceEl = $('#cw-price');
  const addBtn = $('#cw-add');
  if (v) {
    const p = fmtMoney(v.price, v.currency);
    if (priceEl) priceEl.textContent = p;
    if (addBtn) addBtn.textContent = `Add to cart — ${p}`;
  } else if (addBtn) {
    addBtn.textContent = 'Add to cart';
  }
}

/* ---------- variant selector (keyboard accessible radiogroup) ---------- */
function renderVariantSelector(product) {
  const box = $('#cw-sizes');
  if (!box) return;
  box.setAttribute('role', 'radiogroup');
  box.setAttribute('aria-label', 'Size');
  box.innerHTML = product.variants.map((v, i) =>
    `<button type="button" class="cw-size" role="radio" aria-checked="false" data-i="${i}"${v.available ? '' : ' disabled aria-disabled="true"'} tabindex="${i === 0 ? 0 : -1}">${v.size}</button>`
  ).join('');

  const btns = $$('.cw-size', box);
  const focusAt = (i) => {
    if (i < 0 || i >= btns.length) return;
    btns.forEach((b) => (b.tabIndex = -1));
    btns[i].tabIndex = 0;
    btns[i].focus();
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => selectVariant(i));
    b.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); selectVariant(i); }
    });
  });
}
function selectVariant(i) {
  const v = fwState.product.variants[i];
  if (!v || v.available === false) return;
  fwState.variant = v;
  $$('.cw-size', $('#cw-sizes')).forEach((b, idx) => {
    const sel = idx === i;
    b.classList.toggle('is-sel', sel);
    b.setAttribute('aria-checked', sel ? 'true' : 'false');
    b.tabIndex = sel ? 0 : -1;
  });
  setFeatureError('');
  updatePriceLabels();
}

/* ---------- cart drawer render (from live Fourthwall cart) ---------- */
function renderFwCart() {
  const items = (fwState.cart && fwState.cart.items) || [];
  const count = items.reduce((n, i) => n + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + ((i.variant.unitPrice && i.variant.unitPrice.value) || 0) * i.quantity, 0);
  $('#cw-cart-count').textContent = count;
  $('#cw-subtotal').textContent = fmtMoney(subtotal, FW.currency);

  const wrap = $('#cw-items');
  const checkout = $('#cw-checkout');
  if (!items.length) {
    wrap.innerHTML = '<div class="cw-empty">Your cart is empty.</div>';
    checkout.disabled = true;
    return;
  }
  checkout.disabled = false;
  wrap.innerHTML = items.map((i) => {
    const v = i.variant;
    const size = (v.attributes && v.attributes.size && v.attributes.size.name) || v.name;
    const img = (v.images && v.images[0] && v.images[0].url) || '';
    const line = ((v.unitPrice && v.unitPrice.value) || 0) * i.quantity;
    return `
    <div class="cw-line">
      <img src="${img}" alt="${v.name}">
      <div class="cw-line__info">
        <p class="cw-line__name">${(fwState.product && fwState.product.name) || v.name}</p>
        <p class="cw-line__meta">Size ${size}</p>
        <div class="cw-qty">
          <button data-act="dec" data-v="${v.id}" aria-label="Decrease quantity">−</button>
          <span>${i.quantity}</span>
          <button data-act="inc" data-v="${v.id}" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div>
        <div class="cw-line__price">${fmtMoney(line, v.unitPrice && v.unitPrice.currency)}</div>
        <button class="cw-remove" data-act="rm" data-v="${v.id}" data-q="${i.quantity}">Remove</button>
      </div>
    </div>`;
  }).join('');
}

/* ---------- drawer + mobile nav open/close ---------- */
const overlay = () => $('#cw-overlay');
function openPanel(el) {
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  overlay().classList.add('is-open');
  document.body.style.overflow = 'hidden';
}
function closePanels() {
  $('#cw-drawer').classList.remove('is-open');
  $('#cw-mnav').classList.remove('is-open');
  overlay().classList.remove('is-open');
  document.body.style.overflow = '';
}
const openCart = () => openPanel($('#cw-drawer'));
const openNav = () => openPanel($('#cw-mnav'));

/* ---------- store bootstrap ---------- */
async function initStore() {
  const box = $('#cw-sizes');
  if (!box) return;
  box.innerHTML = '<span style="font-size:12px;color:#6a6d72">Loading sizes…</span>';
  try {
    const products = await fwGetProducts();
    if (!products.length) throw new Error('No products are available yet.');
    fwState.product = fwNormalize(products[0]);
    renderVariantSelector(fwState.product);
    const p = minPrice(fwState.product);
    if (p != null && $('#cw-price')) $('#cw-price').textContent = fmtMoney(p, FW.currency);
  } catch (err) {
    box.innerHTML = `<span style="font-size:12px;color:#b23b3b">${err.message}</span>`;
  }
  try { fwState.cart = await fwGetCart(); } catch (_) { fwState.cart = null; }
  renderFwCart();
}

/* ---------- wire up ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderFwCart();
  initStore();

  // add to cart
  const addBtn = $('#cw-add');
  if (addBtn) addBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!fwState.variant) { setFeatureError('Select a size first.'); return; }
    const label = addBtn.textContent;
    addBtn.disabled = true; addBtn.textContent = 'Adding…';
    try {
      fwState.cart = await fwAddVariant(fwState.variant.id, 1);
      renderFwCart();
      toast('Added — size ' + fwState.variant.size);
      openCart();
    } catch (err) {
      setFeatureError(err.message);
      toast('Could not add to cart');
    } finally {
      addBtn.disabled = false; addBtn.textContent = label;
    }
  });

  // buy now
  const buyBtn = $('#cw-buy');
  if (buyBtn) buyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!fwState.variant) { setFeatureError('Select a size first.'); return; }
    window.location.href = checkoutUrlForVariant(fwState.variant.id, 1);
  });

  // open/close cart
  $('#cw-cart-link').addEventListener('click', (e) => { e.preventDefault(); openCart(); });
  $('#cw-drawer-close').addEventListener('click', closePanels);

  // cart line controls (delegated) -> hit the live cart via proxy
  $('#cw-items').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const vId = btn.dataset.v;
    $$('#cw-items button').forEach((b) => (b.disabled = true));
    try {
      if (btn.dataset.act === 'inc') fwState.cart = await fwAddVariant(vId, 1);
      else if (btn.dataset.act === 'dec') fwState.cart = await fwRemoveVariant(vId, 1);
      else if (btn.dataset.act === 'rm') fwState.cart = await fwRemoveVariant(vId, parseInt(btn.dataset.q, 10) || 1);
      renderFwCart();
    } catch (err) {
      toast(err.message || 'Cart error');
      $$('#cw-items button').forEach((b) => (b.disabled = false));
    }
  });

  // checkout -> Fourthwall hosted checkout with the persisted cart
  $('#cw-checkout').addEventListener('click', () => {
    const id = fwCartId.get();
    if (!id || !(fwState.cart && fwState.cart.items && fwState.cart.items.length)) { toast('Your cart is empty'); return; }
    window.location.href = checkoutUrlForCart(id);
  });

  // mobile nav
  $('#cw-burger').addEventListener('click', openNav);
  $('#cw-mnav-close').addEventListener('click', closePanels);
  $('#cw-mnav-cart').addEventListener('click', (e) => { e.preventDefault(); closePanels(); openCart(); });
  $$('#cw-mnav a[href^="#"]').forEach((a) => {
    if (a.id === 'cw-mnav-cart' || a.classList.contains('cw-soon')) return;
    a.addEventListener('click', closePanels);
  });

  // about dropdown (frosted panel under the nav — not the dark cw-overlay,
  // it has its own scrim so hero content behind it can't bleed through)
  const aboutToggle = $('#cw-about-toggle');
  const aboutDd = $('#cw-about-dd');
  const aboutScrim = $('#cw-about-scrim');
  if (aboutToggle && aboutDd && aboutScrim) {
    const closeAboutDd = () => {
      aboutDd.classList.remove('is-open');
      aboutDd.setAttribute('aria-hidden', 'true');
      aboutScrim.classList.remove('is-open');
    };
    const openAboutDd = () => {
      aboutDd.classList.add('is-open');
      aboutDd.setAttribute('aria-hidden', 'false');
      aboutScrim.classList.add('is-open');
    };
    aboutToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      if (aboutDd.classList.contains('is-open')) closeAboutDd();
      else openAboutDd();
    });
    $('#cw-about-dd-close').addEventListener('click', closeAboutDd);
    aboutScrim.addEventListener('click', closeAboutDd);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAboutDd(); });
  }

  // overlay + escape
  overlay().addEventListener('click', closePanels);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });

  // "coming soon" links (search / account)
  $$('.cw-soon').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); toast('Coming soon'); }));

  // newsletter (unchanged backend hook)
  $('#cw-news').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#cw-email').value.trim();
    if (!email) return;
    await apiPost(COLDWAKE.endpoints.subscribe, { email });
    $('#cw-email').value = '';
    $('#cw-news-status').textContent = 'Thanks — you’re on the list.';
    toast('You’re on the list');
  });
});

/* ---------- unlock-discount popup ----------
 * Deliberately kept independent of the Fourthwall bootstrap above: this
 * has nothing to do with live product data, and must still work even if
 * that fetch fails. Config (pct + code) lives in config.js as
 * window.COLDWAKE_POPUP — see the comment there for how to wire a real
 * Fourthwall discount code to it. Also submits the email through the same
 * (currently no-op until apiBase is set) newsletter hook used by the
 * footer signup form. */
const POPUP_STORAGE_KEY = 'cw_popup_v1';
const POPUP_SHOW_DELAY_MS = 1800;

function initPopup() {
  const cfg = window.COLDWAKE_POPUP;
  if (!cfg || cfg.enabled === false || !cfg.code) return;

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(POPUP_STORAGE_KEY) || 'null'); } catch (e) { saved = null; }
  if (saved && saved.seen) return; // already shown this browser — don't nag repeat visitors

  const ov = $('#cw-pop-ov');
  const form = $('#cw-pop-form');
  const emailInput = $('#cw-pop-email');
  const goBtn = $('#cw-pop-go');
  const skipBtn = $('#cw-pop-skip');
  const closeBtn = $('#cw-pop-close');
  const shopBtn = $('#cw-pop-shop');
  const copyBtn = $('#cw-pop-copy');
  const pctEl = $('#cw-pop-pct');
  const result = $('#cw-pop-result');
  const codeEl = $('#cw-pop-code-text');
  if (!ov || !form) return;

  if (pctEl) pctEl.innerHTML = `Unlock ${cfg.pct}% off<br>your first order`;

  function open() {
    ov.classList.add('is-open');
    ov.setAttribute('aria-hidden', 'false');
  }
  function close() {
    ov.classList.remove('is-open');
    ov.setAttribute('aria-hidden', 'true');
  }
  function markSeen(extra) {
    try { localStorage.setItem(POPUP_STORAGE_KEY, JSON.stringify({ seen: true, ...extra })); } catch (e) { /* private mode etc — non-fatal */ }
  }

  let unlocked = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (unlocked) return;
    const email = emailInput.value.trim();
    if (!email) return;
    goBtn.disabled = true;
    await apiPost(COLDWAKE.endpoints.subscribe, { email }).catch(() => {});
    unlocked = true;
    codeEl.textContent = cfg.code;
    form.classList.add('is-hidden');
    result.classList.add('is-active');
    markSeen({ code: cfg.code, email });
  });

  copyBtn.addEventListener('click', () => {
    const code = codeEl.textContent.trim();
    if (navigator.clipboard && code && code !== '—') {
      navigator.clipboard.writeText(code).then(() => toast('Code copied')).catch(() => toast(code));
    } else {
      toast(code);
    }
  });

  shopBtn.addEventListener('click', () => {
    const code = codeEl.textContent.trim();
    if (navigator.clipboard && code && code !== '—') navigator.clipboard.writeText(code).catch(() => {});
    close();
    document.getElementById('feature')?.scrollIntoView({ behavior: 'smooth' });
  });

  // note: once unlocked, the submit handler has already persisted {seen, code, email} —
  // these just need to close the modal without clobbering that.
  skipBtn.addEventListener('click', () => { markSeen({}); close(); });
  closeBtn.addEventListener('click', () => { if (!unlocked) markSeen({}); close(); });
  ov.addEventListener('click', (e) => { if (e.target === ov) { if (!unlocked) markSeen({}); close(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.classList.contains('is-open')) { if (!unlocked) markSeen({}); close(); } });

  setTimeout(open, POPUP_SHOW_DELAY_MS);
}
document.addEventListener('DOMContentLoaded', initPopup);
