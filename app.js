/* Coldwake — landing interactions
 * Everything here runs client-side today. When the backend goes live,
 * set COLDWAKE.apiBase and the subscribe/checkout hooks below will POST to it.
 * ------------------------------------------------------------------ */

const COLDWAKE = {
  apiBase: '',                       // e.g. 'https://api.coldwake.co'  <- set when backend is live
  endpoints: {
    subscribe: '/subscribe',         // POST { email }
    checkout: '/checkout',           // POST { items, subtotal }
  },
  cartKey: 'cw_cart',
};

/* thin fetch wrapper — no-ops cleanly until apiBase is set */
async function apiPost(path, body) {
  if (!COLDWAKE.apiBase) return { ok: false, offline: true };
  try {
    const res = await fetch(COLDWAKE.apiBase + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, data: await res.json().catch(() => null) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const money = (n) => '$' + n.toFixed(0);

let toastTimer;
function toast(msg) {
  const el = $('#cw-toast');
  el.textContent = msg;
  el.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-show'), 2400);
}

/* ---------- cart ---------- */
function loadCart() {
  try { return JSON.parse(localStorage.getItem(COLDWAKE.cartKey)) || []; }
  catch { return []; }
}
function saveCart(cart) {
  localStorage.setItem(COLDWAKE.cartKey, JSON.stringify(cart));
}

function addToCart(item) {
  const cart = loadCart();
  const existing = cart.find((l) => l.id === item.id && l.size === item.size);
  if (existing) existing.qty += 1;
  else cart.push({ ...item, qty: 1 });
  saveCart(cart);
  renderCart();
}

function setQty(idx, delta) {
  const cart = loadCart();
  if (!cart[idx]) return;
  cart[idx].qty += delta;
  if (cart[idx].qty < 1) cart.splice(idx, 1);
  saveCart(cart);
  renderCart();
}

function removeLine(idx) {
  const cart = loadCart();
  cart.splice(idx, 1);
  saveCart(cart);
  renderCart();
}

function cartCount(cart) {
  return cart.reduce((n, l) => n + l.qty, 0);
}
function cartSubtotal(cart) {
  return cart.reduce((s, l) => s + l.price * l.qty, 0);
}

function renderCart() {
  const cart = loadCart();
  $('#cw-cart-count').textContent = cartCount(cart);
  $('#cw-subtotal').textContent = money(cartSubtotal(cart));

  const wrap = $('#cw-items');
  const checkout = $('#cw-checkout');
  if (!cart.length) {
    wrap.innerHTML = '<div class="cw-empty">Your cart is empty.</div>';
    checkout.disabled = true;
    return;
  }
  checkout.disabled = false;
  wrap.innerHTML = cart.map((l, i) => `
    <div class="cw-line">
      <img src="${l.img}" alt="${l.name}">
      <div class="cw-line__info">
        <p class="cw-line__name">${l.name}</p>
        <p class="cw-line__meta">Size ${l.size}</p>
        <div class="cw-qty">
          <button data-act="dec" data-i="${i}" aria-label="Decrease">−</button>
          <span>${l.qty}</span>
          <button data-act="inc" data-i="${i}" aria-label="Increase">+</button>
        </div>
      </div>
      <div>
        <div class="cw-line__price">${money(l.price * l.qty)}</div>
        <button class="cw-remove" data-act="rm" data-i="${i}">Remove</button>
      </div>
    </div>`).join('');
}

/* ---------- drawer + mobile nav open/close ---------- */
const overlay = $('#cw-overlay');
function openPanel(el) {
  el.classList.add('is-open');
  el.setAttribute('aria-hidden', 'false');
  overlay.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}
function closePanels() {
  $('#cw-drawer').classList.remove('is-open');
  $('#cw-mnav').classList.remove('is-open');
  overlay.classList.remove('is-open');
  document.body.style.overflow = '';
}
const openCart = () => openPanel($('#cw-drawer'));
const openNav = () => openPanel($('#cw-mnav'));

/* ---------- wire everything on load ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderCart();

  // size selection (default M)
  const sizes = document.querySelectorAll('.cw-size');
  let selectedSize = 'M';
  sizes.forEach((pill) => {
    if (pill.dataset.size === 'M') pill.classList.add('is-sel');
    pill.addEventListener('click', () => {
      sizes.forEach((p) => p.classList.remove('is-sel'));
      pill.classList.add('is-sel');
      selectedSize = pill.dataset.size;
    });
  });

  // add to cart
  const addBtn = $('#cw-add');
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      addToCart({
        id: addBtn.dataset.id,
        name: addBtn.dataset.name,
        price: parseFloat(addBtn.dataset.price),
        img: addBtn.dataset.img,
        size: selectedSize,
      });
      toast('Added — size ' + selectedSize);
      openCart();
    });
  }

  // open/close cart
  $('#cw-cart-link').addEventListener('click', (e) => { e.preventDefault(); openCart(); });
  $('#cw-drawer-close').addEventListener('click', closePanels);

  // cart line controls (delegated)
  $('#cw-items').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const i = parseInt(btn.dataset.i, 10);
    if (btn.dataset.act === 'inc') setQty(i, 1);
    else if (btn.dataset.act === 'dec') setQty(i, -1);
    else if (btn.dataset.act === 'rm') removeLine(i);
  });

  // checkout (backend hook)
  $('#cw-checkout').addEventListener('click', async () => {
    const cart = loadCart();
    if (!cart.length) return;
    const res = await apiPost(COLDWAKE.endpoints.checkout, {
      items: cart, subtotal: cartSubtotal(cart),
    });
    if (res.ok) { /* backend will return a checkout URL to redirect to */ }
    else toast('Checkout goes live with the backend');
  });

  // mobile nav
  $('#cw-burger').addEventListener('click', openNav);
  $('#cw-mnav-close').addEventListener('click', closePanels);
  $('#cw-mnav-cart').addEventListener('click', (e) => { e.preventDefault(); closePanels(); openCart(); });
  // nav/section links inside the mobile panel should just close it and scroll
  document.querySelectorAll('#cw-mnav a[href^="#"]').forEach((a) => {
    if (a.id === 'cw-mnav-cart' || a.classList.contains('cw-soon')) return;
    a.addEventListener('click', closePanels);
  });

  // overlay closes any panel
  overlay.addEventListener('click', closePanels);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });

  // "coming soon" links (search / account)
  document.querySelectorAll('.cw-soon').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); toast('Coming soon'); });
  });

  // newsletter (backend hook)
  $('#cw-news').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#cw-email').value.trim();
    if (!email) return;
    const res = await apiPost(COLDWAKE.endpoints.subscribe, { email });
    $('#cw-email').value = '';
    $('#cw-news-status').textContent = 'Thanks — you’re on the list.';
    toast('You’re on the list');
  });
});
