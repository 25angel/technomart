const state = {
  meta: null,
  products: [],
  categories: [],
  cart: [],
  filteredProducts: [],
  activeCategory: "all",
  currentPage: "home",
  searchQuery: "",
  favorites: new Set(),
  promoCode: "",
  currentProductId: null,
  qtyByProduct: {},
  lastOrderNumber: "",
  catalogMode: "all",
  chatOpen: false,
  chatSending: false
};

const STORAGE_KEYS = {
  cart: "tm_cart",
  favorites: "tm_favorites",
  promo: "tm_promo"
};

const categoryTitles = {
  all: "All Products",
  smartphones: "Smartphones",
  laptops: "Laptops & PCs",
  headphones: "Audio & Headphones",
  tablets: "Tablets",
  smartwatch: "Smartwatches",
  cameras: "Cameras",
  gaming: "Gaming"
};

function fmt(n) {
  const currency = state.meta?.currency || "USD";
  const locale = currency === "USD" ? "en-US" : "ru-RU";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(Number(n || 0));
}

function stars(rating) {
  return "★".repeat(Math.floor(rating)) + "☆".repeat(5 - Math.floor(rating));
}

function showToast(message) {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toastMsg");
  if (!toast || !toastMsg) return;
  toastMsg.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function appendChatMessage(role, text) {
  const container = document.getElementById("chatMessages");
  if (!container) return;
  const item = document.createElement("div");
  item.className = `chat-message ${role}`;
  item.innerHTML = `<div class="chat-bubble">${String(text || "").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>`;
  container.appendChild(item);
  container.scrollTop = container.scrollHeight;
}

function setChatOpen(isOpen) {
  state.chatOpen = Boolean(isOpen);
  const panel = document.getElementById("chatPanel");
  if (!panel) return;
  panel.hidden = !state.chatOpen;
  if (state.chatOpen) {
    document.getElementById("chatInput")?.focus();
  }
}

async function submitChat(event) {
  event.preventDefault();
  if (state.chatSending) return;
  const input = document.getElementById("chatInput");
  const sendButton = document.getElementById("chatSend");
  const message = String(input?.value || "").trim();
  if (message.length < 2) return;

  appendChatMessage("user", message);
  input.value = "";
  state.chatSending = true;
  sendButton.disabled = true;

  const typing = document.createElement("div");
  typing.className = "chat-typing";
  typing.id = "chatTyping";
  typing.textContent = "Assistant is thinking...";
  document.getElementById("chatMessages")?.appendChild(typing);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error((data.errors && data.errors[0]) || "Chat is unavailable.");
    }
    appendChatMessage("bot", data.reply || "I’m here to help.");
  } catch (error) {
    appendChatMessage("bot", "I’m having trouble right now. Please try again in a moment.");
  } finally {
    document.getElementById("chatTyping")?.remove();
    state.chatSending = false;
    sendButton.disabled = false;
  }
}

function toggleFavorite(productId, showMessage = true) {
  const id = Number(productId);
  if (!id) return;
  if (state.favorites.has(id)) {
    state.favorites.delete(id);
    if (showMessage) showToast("Removed from wishlist.");
  } else {
    state.favorites.add(id);
    if (showMessage) showToast("Added to wishlist.");
  }
  persistState();
  updateHeaderCounts();
  renderHomeShowcase();
  renderFeatured();
  renderWishlistPreview();
  renderCatalog();
  if (state.currentPage === "product") openProduct(state.currentProductId);
}

function persistState() {
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(state.cart));
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...state.favorites]));
  localStorage.setItem(STORAGE_KEYS.promo, state.promoCode || "");
}

function restoreState() {
  try {
    const rawCart = JSON.parse(localStorage.getItem(STORAGE_KEYS.cart) || "[]");
    if (Array.isArray(rawCart)) {
      state.cart = rawCart
        .map((item) => ({ productId: Number(item.productId || item.id), quantity: Number(item.quantity || item.cartQty || 0) }))
        .filter((item) => Number.isInteger(item.productId) && item.quantity > 0);
    }
  } catch (error) {
    state.cart = [];
  }

  try {
    const rawFavorites = JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) || "[]");
    state.favorites = new Set(Array.isArray(rawFavorites) ? rawFavorites.map(Number) : []);
  } catch (error) {
    state.favorites = new Set();
  }

  state.promoCode = localStorage.getItem(STORAGE_KEYS.promo) || "";
}

function getProductById(productId) {
  return state.products.find((product) => product.id === Number(productId));
}

function getCartItem(productId) {
  return state.cart.find((item) => item.productId === Number(productId));
}

function getProductImage(product, index = 0) {
  const images = getProductGallery(product);
  return images[index] || images[0] || "/images/placeholders/product-default.svg";
}

function getProductFallbackImage(product) {
  const category = product?.category;
  if (category === "smartphones") return "/images/placeholders/smartphone.svg";
  if (category === "laptops") return "/images/placeholders/laptop.svg";
  if (category === "headphones") return "/images/placeholders/headphones.svg";
  return "/images/placeholders/product-default.svg";
}

function getProductGallery(product) {
  const localImages = Array.isArray(product?.images) ? product.images.filter(Boolean) : [];
  const usableLocalImages = localImages.filter((image) => !image.includes("/images/placeholders/"));
  if (usableLocalImages.length) return usableLocalImages;

  const remoteImages = Array.isArray(product?.remoteImages) ? product.remoteImages.filter(Boolean) : [];
  if (remoteImages.length) return remoteImages;

  return localImages.length ? localImages : ["/images/placeholders/product-default.svg"];
}

function renderImage(product, className, alt, index = 0) {
  return `<img class="${className}" src="${getProductImage(product, index)}" alt="${alt}" loading="lazy" data-fallback-src="${getProductFallbackImage(product)}">`;
}

function getCartDetails() {
  return state.cart
    .map((item) => {
      const product = getProductById(item.productId);
      if (!product) return null;
      const quantity = Math.min(item.quantity, Math.max(product.qty, 0));
      if (quantity < 1 || product.stock === "out") return null;
      return { ...product, cartQty: quantity, lineTotal: product.price * quantity };
    })
    .filter(Boolean);
}

function getTotals() {
  const items = getCartDetails();
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const freeShippingThreshold = Number(state.meta?.freeShippingThreshold || 300);
  const shipping = subtotal > 0 && subtotal < freeShippingThreshold ? 19 : 0;
  const normalizedPromo = String(state.promoCode || "").trim().toUpperCase();
  const discount = normalizedPromo === "TECHNO10" || normalizedPromo === "SAVE10" ? Math.round(subtotal * 0.1) : 0;
  return { items, subtotal, shipping, discount, total: subtotal + shipping - discount };
}

function setPage(page) {
  document.querySelectorAll(".page").forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
  state.currentPage = page;
  if (page === "catalog") applyFilters();
  if (page === "cart") renderCart();
  if (page === "checkout") {
    if (!getCartDetails().length) {
      showToast("Add products to your cart before checkout.");
      page = "cart";
      document.querySelectorAll(".page").forEach((el) => el.classList.toggle("active", el.id === `page-${page}`));
      state.currentPage = page;
      renderCart();
    } else {
      renderCheckout();
    }
  }
  if (page === "home") renderFeatured();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateHeaderCounts() {
  const cartCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartBadge = document.getElementById("cartCount");
  const wishBadge = document.getElementById("wishlistCount");
  if (cartBadge) {
    cartBadge.textContent = String(cartCount);
    cartBadge.style.display = cartCount > 0 ? "flex" : "none";
  }
  if (wishBadge) {
    wishBadge.textContent = String(state.favorites.size);
    wishBadge.style.display = state.favorites.size > 0 ? "flex" : "none";
  }
  const heroWishlistStat = document.getElementById("heroWishlistStat");
  if (heroWishlistStat) heroWishlistStat.textContent = String(state.favorites.size);
}

function renderCategories() {
  const categoriesGrid = document.getElementById("categoriesGrid");
  const navInner = document.getElementById("navInner");
  if (categoriesGrid) {
    categoriesGrid.innerHTML = state.categories
    .map((category) => `<button class="cat-card" data-category="${category.key}"><span class="cat-icon">${category.icon}</span><span class="cat-name">${category.label}</span><span class="cat-count">${category.count} products</span></button>`)
    .join("");
  }

  if (navInner) {
    navInner.innerHTML = [
      `<button type="button" class="nav-cat ${state.activeCategory === "all" ? "active" : ""}" data-category="all">All Products</button>`,
      ...state.categories.map((category) => `<button type="button" class="nav-cat ${state.activeCategory === category.key ? "active" : ""}" data-category="${category.key}"><span class="nav-cat-icon">${category.icon}</span>${category.label}</button>`)
    ].join("");
  }
}

function buildBrandFilters() {
  const pool = state.activeCategory === "all" ? state.products : state.products.filter((product) => product.category === state.activeCategory);
  const brands = [...new Set(pool.map((product) => product.brand))].sort();
  const selected = new Set([...document.querySelectorAll("#brandFilters input:checked")].map((input) => input.value));
  const brandFilters = document.getElementById("brandFilters");
  if (!brandFilters) return;
  brandFilters.innerHTML = brands
    .map((brand) => `<label class="filter-option"><input type="checkbox" value="${brand}" ${selected.has(brand) ? "checked" : ""}><span>${brand}</span></label>`)
    .join("");
}

function featuredScore(product) {
  if (product.badge === "hot") return 4;
  if (product.badge === "new") return 3;
  if (product.badge === "sale") return 2;
  return 0;
}

function applyFilters() {
  const minP = Number(document.getElementById("priceMin").value || 0);
  const maxP = document.getElementById("priceMax").value === "" ? Infinity : Number(document.getElementById("priceMax").value);
  const checkedBrands = [...document.querySelectorAll("#brandFilters input:checked")].map((input) => input.value);
  const minRating = Number(document.querySelector('input[name="rating"]:checked')?.value || 0);
  const inStockOnly = document.getElementById("inStockOnly").checked;
  const sort = document.getElementById("sortSelect").value;

  let result = state.products.filter((product) => {
    if (state.activeCategory !== "all" && product.category !== state.activeCategory) return false;
    if (state.searchQuery) {
      const haystack = `${product.name} ${product.brand} ${product.category} ${product.sku}`.toLowerCase();
      if (!haystack.includes(state.searchQuery)) return false;
    }
    if (product.price < minP || product.price > maxP) return false;
    if (checkedBrands.length && !checkedBrands.includes(product.brand)) return false;
    if (minRating > 0 && product.rating < minRating) return false;
    if (inStockOnly && product.stock === "out") return false;
    return true;
  });

  if (state.catalogMode === "wishlist") {
    result = result.filter((product) => state.favorites.has(product.id));
  }

  if (sort === "price-asc") result.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") result.sort((a, b) => b.price - a.price);
  else if (sort === "rating") result.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  else if (sort === "newest") result.sort((a, b) => b.id - a.id);
  else result.sort((a, b) => featuredScore(b) - featuredScore(a) || b.rating - a.rating || b.id - a.id);

  state.filteredProducts = result;
  renderCatalogTitle();
  renderCatalog();
  updateCategoryStates();
}

function renderCatalogTitle() {
  const title = document.getElementById("catalogTitle");
  const subtitle = document.getElementById("catalogSubtitle");
  if (!title || !subtitle) return;
  if (state.catalogMode === "wishlist") {
    title.textContent = "Wishlist";
    subtitle.textContent = `${state.filteredProducts.length} saved item${state.filteredProducts.length !== 1 ? "s" : ""}`;
    return;
  }
  if (state.searchQuery) {
    title.textContent = `Search: "${document.getElementById("searchInput").value.trim()}"`;
    subtitle.textContent = `${state.filteredProducts.length} result${state.filteredProducts.length !== 1 ? "s" : ""}`;
    return;
  }
  title.textContent = categoryTitles[state.activeCategory] || "Products";
  subtitle.textContent = state.activeCategory === "all"
    ? "Discover our curated selection of premium electronics"
    : state.categories.find((category) => category.key === state.activeCategory)?.subtitle || "Discover our curated selection of premium electronics";
}

function updateCategoryStates() {
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.classList.toggle("active", button.dataset.category === state.activeCategory);
  });
}

function renderCard(product) {
  const inCart = getCartItem(product.id);
  const isFav = state.favorites.has(product.id);
  const stockClass = product.stock === "in" ? "in-stock" : product.stock === "low" ? "low-stock" : "out-stock";
  const stockText = product.stock === "in" ? "In stock" : product.stock === "low" ? `Only ${product.qty} left` : "Out of stock";
  const badgeHtml = product.badge && product.badge !== "oos" ? `<span class="badge badge-${product.badge}">${product.badge === "hot" ? "Hot" : product.badge === "new" ? "New" : "Sale"}</span>` : "";
  const discHtml = product.discount ? `<span class="badge badge-sale">-${product.discount}%</span>` : "";

  return `<article class="prod-card fade-in">
    <div class="prod-img-wrap">
      <button class="prod-fav ${isFav ? "active" : ""}" data-favorite="${product.id}" title="Toggle wishlist">
        <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"></path></svg>
      </button>
      <div class="prod-badge">${discHtml}${badgeHtml}</div>
      <button class="prod-img" data-open-product="${product.id}" aria-label="Open ${product.name}">${renderImage(product, "prod-img-tag", product.name)}</button>
    </div>
    <div class="prod-info">
      <div class="prod-brand">${product.brand}</div>
      <button class="prod-name" data-open-product="${product.id}">${product.name}</button>
      <div class="prod-rating"><span class="stars">${stars(product.rating)}</span><span class="rating-num">${product.rating} (${new Intl.NumberFormat("ru-RU").format(product.reviews)})</span></div>
      <div class="prod-price-row">
        <div class="price-group">
          ${product.oldPrice ? `<span class="price-orig">${fmt(product.oldPrice)}</span>` : ""}
          <span class="price-now">${fmt(product.price)}</span>
        </div>
        <button class="add-btn ${inCart ? "added" : ""}" data-add-to-cart="${product.id}" ${product.stock === "out" ? "disabled" : ""} aria-label="Add to cart">
          <svg viewBox="0 0 24 24"><path d="${inCart ? "M20 6L9 17l-5-5" : "M12 5v14M5 12h14"}"></path></svg>
        </button>
      </div>
      <div class="stock-label ${stockClass}"><span class="stock-dot"></span>${stockText}</div>
    </div>
  </article>`;
}

function renderFeatured() {
  const featuredGrid = document.getElementById("featuredGrid");
  if (!featuredGrid) return;
  const featured = [...state.products]
    .sort((a, b) => (b.discount || 0) - (a.discount || 0) || b.rating - a.rating || b.reviews - a.reviews)
    .slice(0, 6);
  featuredGrid.innerHTML = featured.map(renderCard).join("");
}

function renderHomeShowcase() {
  const spotlightMain = document.getElementById("heroSpotlightMain");
  const spotlightSide = document.getElementById("heroSpotlightSide");
  const homeStrip = document.getElementById("homeStrip");
  if (!spotlightMain || !spotlightSide || !homeStrip) return;

  const bestRated = [...state.products].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)[0];
  const bestDeal = [...state.products].sort((a, b) => (b.discount || 0) - (a.discount || 0) || a.price - b.price)[0];
  const inWishlist = state.products.filter((product) => state.favorites.has(product.id)).length;
  const topBrands = new Set(state.products.map((product) => product.brand)).size;
  const inStock = state.products.filter((product) => product.stock !== "out").length;

  if (bestRated) {
    spotlightMain.innerHTML = `
      <div class="hero-panel-label">Editor Pick</div>
      <div class="hero-panel-media">${renderImage(bestRated, "hero-panel-image", bestRated.name)}</div>
      <div class="hero-panel-title">${bestRated.name}</div>
      <div class="hero-panel-meta"><span>${bestRated.brand}</span><strong>${fmt(bestRated.price)}</strong></div>
    `;
  }

  if (bestDeal) {
    spotlightSide.innerHTML = `
      <div class="hero-panel-label">Best Deal</div>
      <div class="hero-panel-title">${bestDeal.name}</div>
      <div class="hero-panel-meta"><span>${bestDeal.discount ? `${bestDeal.discount}% off` : "Just landed"}</span><strong>${fmt(bestDeal.price)}</strong></div>
    `;
  }

  homeStrip.innerHTML = [
    { label: "In Stock", value: inStock, sub: "ready to ship now" },
    { label: "Top Brands", value: topBrands, sub: "curated names shoppers trust" },
    { label: "Wishlist", value: inWishlist, sub: "items you saved for later" },
    { label: "Highest Rated", value: bestRated ? `${bestRated.rating.toFixed(1)}★` : "N/A", sub: bestRated ? bestRated.brand : "waiting for picks" }
  ].map((item) => `
    <div class="strip-card">
      <div class="strip-label">${item.label}</div>
      <div class="strip-value">${item.value}</div>
      <div class="strip-sub">${item.sub}</div>
    </div>
  `).join("");
}

function renderWishlistPreview() {
  const grid = document.getElementById("wishlistPreviewGrid");
  if (!grid) return;
  const saved = state.products.filter((product) => state.favorites.has(product.id)).slice(0, 3);
  if (!saved.length) {
    grid.innerHTML = `
      <div class="wishlist-empty">
        <div class="wishlist-empty-title">Build your shortlist</div>
        <div class="wishlist-empty-sub">Tap the heart on any product to save it here and keep your favorite finds in one place.</div>
        <button class="hero-cta" data-nav-page="catalog" style="margin:0 auto;display:inline-flex">Browse Products</button>
      </div>
    `;
    return;
  }
  grid.innerHTML = saved.map(renderCard).join("");
}

function renderCatalog() {
  const grid = document.getElementById("catalogGrid");
  const count = document.getElementById("resultsCount");
  if (!grid || !count) return;
  if (!state.filteredProducts.length) {
    if (state.catalogMode === "wishlist") {
      grid.innerHTML = `<div class="wishlist-empty"><div class="wishlist-empty-title">Your wishlist is empty</div><div class="wishlist-empty-sub">Save products with the heart icon and they will show up here for quick comparison later.</div><button class="hero-cta" data-category="all" style="margin:0 auto;display:inline-flex">Browse Products</button></div>`;
    } else {
      grid.innerHTML = `<div class="empty-state"><div class="cart-empty-text">No products found</div><div class="catalog-subtitle">Try adjusting your filters or search query.</div></div>`;
    }
  } else {
    grid.innerHTML = state.filteredProducts.map(renderCard).join("");
  }
  count.innerHTML = `<strong>${state.filteredProducts.length}</strong> product${state.filteredProducts.length !== 1 ? "s" : ""} found`;
}

function openProduct(productId) {
  const product = getProductById(productId);
  if (!product) return;
  state.currentProductId = product.id;
  const qty = state.qtyByProduct[product.id] || 1;
  const save = product.oldPrice ? product.oldPrice - product.price : 0;
  const specsRows = Object.entries(product.specs || {}).map(([key, value]) => `<tr><td>${key}</td><td>${value}</td></tr>`).join("");
  const stockClass = product.stock === "in" ? "in-stock" : product.stock === "low" ? "low-stock" : "out-stock";
  const stockText = product.stock === "in" ? "In stock" : product.stock === "low" ? `Only ${product.qty} left` : "Out of stock";
  const gallery = getProductGallery(product);
  const isFav = state.favorites.has(product.id);

  document.getElementById("productPageContent").innerHTML = `
    <div class="breadcrumb">
      <button data-nav-page="home">Home</button><span class="breadcrumb-sep">›</span>
      <button data-go-category="${product.category}">${categoryTitles[product.category] || product.category}</button>
      <span class="breadcrumb-sep">›</span><span>${product.name}</span>
    </div>
    <div class="prod-page-grid">
      <div class="gallery">
        <div class="gallery-main">${renderImage(product, "gallery-main-img", product.name)}</div>
        <div class="gallery-thumbs">
          ${gallery.map((image, index) => `<button class="thumb ${index === 0 ? "active" : ""}" data-gallery-image="${image}" data-gallery-fallback="${getProductFallbackImage(product)}"><img src="${image}" alt="${product.name} view ${index + 1}" data-fallback-src="${getProductFallbackImage(product)}"></button>`).join("")}
        </div>
      </div>
      <div class="prod-detail-info">
        <div class="detail-brand">${product.brand}</div>
        <h2 class="detail-title">${product.name}</h2>
        <div class="detail-rating">
          <div class="rating-big"><span class="stars">${stars(product.rating)}</span></div>
          <span class="rating-val">${product.rating}</span>
          <span class="review-cnt">${new Intl.NumberFormat("ru-RU").format(product.reviews)} reviews</span>
          <span class="detail-sku">SKU: ${product.sku}</span>
        </div>
        <div class="detail-price-box">
          ${product.oldPrice ? `<div class="detail-old-price">${fmt(product.oldPrice)}</div>` : ""}
          <div class="detail-price">${fmt(product.price)}</div>
          ${save > 0 ? `<div class="detail-save">You save ${fmt(save)}</div>` : ""}
          <div class="stock-status-big ${stockClass}"><span class="stock-dot"></span>${stockText}</div>
        </div>
        <div class="detail-qty">
          <span class="qty-label">Qty:</span>
          <button class="qty-btn" data-qty-change="-1">−</button>
          <div class="qty-val" id="qtyVal">${qty}</div>
          <button class="qty-btn" data-qty-change="1">+</button>
        </div>
        <div class="pdp-actions">
          <button class="add-cart-btn" data-add-pdp="${product.id}" ${product.stock === "out" ? "disabled" : ""}>Add to Cart</button>
          <button class="wishlist-outline-btn ${isFav ? "active" : ""}" data-favorite="${product.id}" aria-label="Save to wishlist">
            <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"></path></svg>
          </button>
        </div>
        <button class="buy-now-btn" data-buy-now="${product.id}" ${product.stock === "out" ? "disabled" : ""}>Buy Now</button>
        <div class="detail-features">
          <div class="feat-row"><div class="feat-icon"><svg viewBox="0 0 24 24"><path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8z"></path><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle></svg></div><span class="feat-text"><strong>Free delivery</strong> for orders over ${fmt(state.meta?.freeShippingThreshold || 300)}</span></div>
          <div class="feat-row"><div class="feat-icon"><svg viewBox="0 0 24 24"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg></div><span class="feat-text"><strong>Returns</strong> within 14 days</span></div>
          <div class="feat-row"><div class="feat-icon"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div><span class="feat-text"><strong>Official warranty</strong> 12 months</span></div>
        </div>
      </div>
    </div>
    <div class="specs-section">
      <div class="specs-title">Specifications</div>
      <table class="specs-table"><tbody>${specsRows}</tbody></table>
    </div>
    <div class="product-about">
      <div class="section-title" style="margin-bottom:6px">About this product</div>
      <p class="catalog-subtitle" style="margin-bottom:0">${product.desc || "Description will be added after normalization."}</p>
    </div>
  `;

  setPage("product");
}

function adjustPdpQty(delta) {
  const product = getProductById(state.currentProductId);
  if (!product) return;
  const current = state.qtyByProduct[product.id] || 1;
  const next = Math.max(1, Math.min(10, Math.min(product.qty || 10, current + delta)));
  state.qtyByProduct[product.id] = next;
  document.getElementById("qtyVal").textContent = String(next);
}

function addToCart(productId, quantity = 1, showSuccess = true) {
  const product = getProductById(productId);
  if (!product || product.stock === "out") return;
  const cartItem = getCartItem(product.id);
  const nextQty = Math.min((cartItem?.quantity || 0) + quantity, Math.max(product.qty, 1));
  if (cartItem) cartItem.quantity = nextQty;
  else state.cart.push({ productId: product.id, quantity: Math.min(quantity, product.qty) });
  persistState();
  updateHeaderCounts();
  renderCatalog();
  if (state.currentPage === "cart") renderCart();
  if (state.currentPage === "checkout") renderCheckout();
  if (showSuccess) showToast(`${product.name.split(" ").slice(0, 3).join(" ")} added to cart`);
}

function updateCartQty(productId, delta) {
  const item = getCartItem(productId);
  const product = getProductById(productId);
  if (!item || !product) return;
  item.quantity = Math.max(1, Math.min(product.qty, item.quantity + delta));
  persistState();
  updateHeaderCounts();
  renderCart();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.productId !== Number(productId));
  persistState();
  updateHeaderCounts();
  renderCart();
  showToast("Item removed");
}

function renderSummary(prefix, totals) {
  const subtotalNode = document.getElementById(`${prefix}Subtotal`);
  const shippingNode = document.getElementById(`${prefix}Shipping`);
  const totalNode = document.getElementById(`${prefix}Total`);
  if (subtotalNode) subtotalNode.textContent = fmt(totals.subtotal);
  if (shippingNode) shippingNode.textContent = totals.shipping === 0 ? "Free" : fmt(totals.shipping);
  if (totalNode) totalNode.textContent = fmt(totals.total);
  const discountNode = document.getElementById(`${prefix}Discount`);
  if (discountNode) discountNode.textContent = totals.discount > 0 ? `-${fmt(totals.discount)}` : `-${fmt(0)}`;
}

function renderCart() {
  const container = document.getElementById("cartItemsContainer");
  const totals = getTotals();
  if (!totals.items.length) {
    container.innerHTML = `<div class="cart-header">Cart (0 items)</div><div class="cart-empty"><div class="cart-empty-text">Your cart is empty</div><button class="hero-cta" data-nav-page="catalog" style="margin:0 auto;display:flex">Browse Products</button></div>`;
  } else {
    const itemCount = totals.items.reduce((sum, item) => sum + item.cartQty, 0);
    container.innerHTML = `<div class="cart-header">Cart (${itemCount} item${itemCount !== 1 ? "s" : ""})</div>` + totals.items
      .map((item) => `<div class="cart-item"><div class="cart-item-img">${renderImage(item, "cart-item-img-tag", item.name)}</div><div class="cart-item-info"><div class="cart-item-brand">${item.brand}</div><div class="cart-item-name">${item.name}</div><div class="cart-item-qty"><button class="cqty-btn" data-cart-qty="${item.id}" data-cart-delta="-1">−</button><div class="cqty-val">${item.cartQty}</div><button class="cqty-btn" data-cart-qty="${item.id}" data-cart-delta="1">+</button></div></div><div class="cart-item-price">${fmt(item.lineTotal)}</div><button class="remove-btn" data-remove-cart="${item.id}" aria-label="Remove item"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"></path></svg></button></div>`)
      .join("");
  }
  document.getElementById("promoCode").value = state.promoCode;
  renderSummary("summary", totals);
}

function renderCheckout() {
  const totals = getTotals();
  document.getElementById("checkoutItems").innerHTML = totals.items
    .map((item) => `<div class="checkout-item"><span class="checkout-item-icon">${renderImage(item, "checkout-item-image", item.name)}</span><div style="flex:1;min-width:0"><div class="checkout-item-name">${item.name}</div><div class="checkout-item-meta">×${item.cartQty}</div></div><div class="summary-val">${fmt(item.lineTotal)}</div></div>`)
    .join("");
  renderSummary("co", totals);
}

function resetFilters() {
  document.getElementById("priceMin").value = "";
  document.getElementById("priceMax").value = "";
  document.querySelectorAll('#brandFilters input').forEach((input) => { input.checked = false; });
  document.querySelectorAll('input[name="rating"]').forEach((input) => { input.checked = false; });
  document.getElementById("inStockOnly").checked = false;
  document.getElementById("sortSelect").value = "featured";
  document.getElementById("searchInput").value = "";
  state.searchQuery = "";
  state.catalogMode = "all";
  applyFilters();
}

function handleSearchInput(value) {
  const normalized = String(value || "").trim().toLowerCase();
  state.searchQuery = normalized.length > 1 ? normalized : "";
  state.catalogMode = "all";
  if (state.currentPage === "catalog" || state.searchQuery) setPage("catalog");
}

function goToCategory(category) {
  state.activeCategory = category || "all";
  state.catalogMode = "all";
  buildBrandFilters();
  applyFilters();
  setPage("catalog");
}

function renderLoadingState() {
  const featuredGrid = document.getElementById("featuredGrid");
  const catalogGrid = document.getElementById("catalogGrid");
  if (featuredGrid) featuredGrid.innerHTML = '<div class="loading">Loading featured products...</div>';
  if (catalogGrid) catalogGrid.innerHTML = '<div class="loading">Loading catalog...</div>';
  const wishlistPreviewGrid = document.getElementById("wishlistPreviewGrid");
  const homeStrip = document.getElementById("homeStrip");
  if (wishlistPreviewGrid) wishlistPreviewGrid.innerHTML = '<div class="loading">Loading wishlist preview...</div>';
  if (homeStrip) homeStrip.innerHTML = '<div class="loading">Loading highlights...</div>';
}

function safeRender(label, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`Render step failed: ${label}`, error);
  }
}

function syncMeta() {
  if (!state.meta) return;
  const heroProducts = document.getElementById("heroProducts");
  const heroCategories = document.getElementById("heroCategories");
  const supportPhoneLink = document.getElementById("supportPhoneLink");
  const supportEmailLink = document.getElementById("supportEmailLink");
  const footerYear = document.getElementById("footerYear");
  if (heroProducts) heroProducts.textContent = String(state.products.length);
  if (heroCategories) heroCategories.textContent = String(state.categories.length);
  if (supportPhoneLink) {
    supportPhoneLink.textContent = state.meta.supportPhone;
    supportPhoneLink.href = `tel:${state.meta.supportPhone.replace(/[^\d+]/g, "")}`;
  }
  if (supportEmailLink) {
    supportEmailLink.textContent = state.meta.supportEmail;
    supportEmailLink.href = `mailto:${state.meta.supportEmail}`;
  }
  if (footerYear) footerYear.textContent = `© ${new Date().getFullYear()} TechnoMart. All rights reserved.`;
}

async function loadStore() {
  renderLoadingState();
  const response = await fetch("/api/store");
  if (!response.ok) throw new Error("Failed to load store data.");
  const payload = await response.json();
  state.meta = payload.meta;
  state.categories = payload.categories;
  state.products = payload.products;
  state.filteredProducts = [...payload.products];
  safeRender("renderCategories", renderCategories);
  safeRender("buildBrandFilters", buildBrandFilters);
  safeRender("renderHomeShowcase", renderHomeShowcase);
  safeRender("renderFeatured", renderFeatured);
  safeRender("renderWishlistPreview", renderWishlistPreview);
  safeRender("applyFilters", applyFilters);
  safeRender("syncMeta", syncMeta);
  safeRender("sanitizeStoredCart", sanitizeStoredCart);
}

function sanitizeStoredCart() {
  const validIds = new Set(state.products.map((product) => product.id));
  state.cart = state.cart
    .filter((item) => validIds.has(item.productId))
    .map((item) => {
      const product = getProductById(item.productId);
      return { productId: item.productId, quantity: Math.min(Math.max(1, item.quantity), Math.max(product.qty, 1)) };
    });
  persistState();
  updateHeaderCounts();
}

function renderPaymentSelection() {
  document.querySelectorAll(".pay-opt").forEach((option) => {
    option.classList.toggle("selected", option.querySelector("input").checked);
  });
}

async function submitOrder(event) {
  event.preventDefault();
  const totals = getTotals();
  const errorsNode = document.getElementById("checkoutErrors");
  const formData = new FormData(document.getElementById("checkoutForm"));
  const payload = {
    customer: {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      email: formData.get("email")
    },
    delivery: {
      city: formData.get("city"),
      address: formData.get("address"),
      apartment: formData.get("apartment"),
      postalCode: formData.get("postalCode")
    },
    paymentMethod: formData.get("payment"),
    promoCode: state.promoCode,
    items: totals.items.map((item) => ({ productId: item.id, quantity: item.cartQty }))
  };

  errorsNode.hidden = true;
  errorsNode.textContent = "";

  if (!payload.items.length) {
    showToast("Your cart is empty.");
    setPage("cart");
    return;
  }

  const button = document.getElementById("placeOrderBtn");
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.textContent = "Creating order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      errorsNode.innerHTML = (data.errors || ["Failed to place order."]).join("<br>");
      errorsNode.hidden = false;
      return;
    }

    state.lastOrderNumber = data.orderNumber;
    document.getElementById("orderNum").textContent = `Order #${data.orderNumber}`;
    state.cart = [];
    state.promoCode = "";
    persistState();
    updateHeaderCounts();
    renderCart();
    document.getElementById("checkoutForm").reset();
    renderPaymentSelection();
    showToast("Order created successfully");
    setPage("success");
  } catch (error) {
    errorsNode.textContent = "Network error. Please try again.";
    errorsNode.hidden = false;
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}

function bindEvents() {
  document.getElementById("logoBtn").addEventListener("click", () => setPage("home"));
  document.getElementById("catalogBtn").addEventListener("click", () => setPage("catalog"));
  document.getElementById("cartBtn").addEventListener("click", () => setPage("cart"));
  document.getElementById("wishlistBtn").addEventListener("click", () => {
    state.catalogMode = "wishlist";
    state.activeCategory = "all";
    buildBrandFilters();
    applyFilters();
    setPage("catalog");
  });
  const wishlistSeeAllBtn = document.getElementById("wishlistSeeAllBtn");
  if (wishlistSeeAllBtn) {
    wishlistSeeAllBtn.addEventListener("click", () => {
      state.catalogMode = "wishlist";
      state.activeCategory = "all";
      buildBrandFilters();
      applyFilters();
      setPage("catalog");
    });
  }
  document.getElementById("searchInput").addEventListener("input", (event) => handleSearchInput(event.target.value));
  document.getElementById("searchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchInput(event.currentTarget.value);
    }
  });
  document.getElementById("searchBtn").addEventListener("click", () => handleSearchInput(document.getElementById("searchInput").value));
  document.getElementById("priceMin").addEventListener("change", applyFilters);
  document.getElementById("priceMax").addEventListener("change", applyFilters);
  document.getElementById("brandFilters").addEventListener("change", applyFilters);
  document.querySelectorAll('input[name="rating"]').forEach((input) => input.addEventListener("change", applyFilters));
  document.getElementById("inStockOnly").addEventListener("change", applyFilters);
  document.getElementById("sortSelect").addEventListener("change", applyFilters);
  document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);
  document.getElementById("applyPromoBtn").addEventListener("click", () => {
    const value = document.getElementById("promoCode").value.trim().toUpperCase();
    if (!value) return showToast("Enter a promo code first.");
    if (value === "TECHNO10" || value === "SAVE10") {
      state.promoCode = value;
      persistState();
      renderCart();
      if (state.currentPage === "checkout") renderCheckout();
      showToast("Promo applied. 10% off.");
    } else {
      showToast("Invalid promo code.");
    }
  });
  document.getElementById("checkoutBtn").addEventListener("click", () => setPage("checkout"));
  document.getElementById("backToCartBtn").addEventListener("click", () => setPage("cart"));
  document.getElementById("chatLauncher").addEventListener("click", () => setChatOpen(!state.chatOpen));
  document.getElementById("chatClose").addEventListener("click", () => setChatOpen(false));
  document.getElementById("chatForm").addEventListener("submit", submitChat);
  document.getElementById("checkoutForm").addEventListener("submit", submitOrder);
  document.querySelectorAll(".pay-opt input").forEach((input) => input.addEventListener("change", renderPaymentSelection));

  document.body.addEventListener("click", (event) => {
    const target = event.target.closest("[data-category],[data-category-link],[data-go-category],[data-open-product],[data-add-to-cart],[data-add-pdp],[data-buy-now],[data-cart-qty],[data-remove-cart],[data-favorite],[data-nav-page],[data-qty-change],[data-gallery-image]");
    if (!target) return;
    if (target.dataset.category) return goToCategory(target.dataset.category);
    if (target.dataset.categoryLink) return goToCategory(target.dataset.categoryLink);
    if (target.dataset.goCategory) return goToCategory(target.dataset.goCategory);
    if (target.dataset.openProduct) return openProduct(Number(target.dataset.openProduct));
    if (target.dataset.addToCart) return addToCart(Number(target.dataset.addToCart));
    if (target.dataset.addPdp) return addToCart(Number(target.dataset.addPdp), state.qtyByProduct[Number(target.dataset.addPdp)] || 1);
    if (target.dataset.buyNow) {
      addToCart(Number(target.dataset.buyNow), state.qtyByProduct[Number(target.dataset.buyNow)] || 1, false);
      return setPage("checkout");
    }
    if (target.dataset.cartQty) return updateCartQty(Number(target.dataset.cartQty), Number(target.dataset.cartDelta));
    if (target.dataset.removeCart) return removeFromCart(Number(target.dataset.removeCart));
    if (target.dataset.favorite) {
      return toggleFavorite(Number(target.dataset.favorite));
    }
    if (target.dataset.navPage) return setPage(target.dataset.navPage);
    if (target.dataset.qtyChange) return adjustPdpQty(Number(target.dataset.qtyChange));
    if (target.dataset.galleryImage) {
      document.querySelector(".gallery-main").innerHTML = `<img class="gallery-main-img" src="${target.dataset.galleryImage}" alt="Product image" data-fallback-src="${target.dataset.galleryFallback || "/images/placeholders/product-default.svg"}">`;
      document.querySelectorAll(".thumb").forEach((thumb) => thumb.classList.toggle("active", thumb === target));
    }
  });

  document.addEventListener("error", (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const fallbackSrc = img.dataset.fallbackSrc;
    if (!fallbackSrc || img.src.endsWith(fallbackSrc)) return;
    img.src = fallbackSrc;
  }, true);
}

async function init() {
  restoreState();
  bindEvents();
  updateHeaderCounts();
  renderPaymentSelection();
  try {
    await loadStore();
  } catch (error) {
    document.getElementById("featuredGrid").innerHTML = `<div class="error-state">${error.message}</div>`;
    document.getElementById("catalogGrid").innerHTML = `<div class="error-state">${error.message}</div>`;
    const wishlistPreviewGrid = document.getElementById("wishlistPreviewGrid");
    if (wishlistPreviewGrid) wishlistPreviewGrid.innerHTML = `<div class="error-state">${error.message}</div>`;
    showToast("Failed to load store data.");
  }
  renderCart();
}

window.addEventListener("DOMContentLoaded", init);
