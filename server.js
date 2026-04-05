const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const PRODUCTS_PATH = path.join(DATA_DIR, "processed", "products.json");
const ORDERS_PATH = path.join(DATA_DIR, "orders.json");
const ENV_PATH = path.join(__dirname, ".env");

loadEnvFile(ENV_PATH);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const CATEGORY_META = {
  all: { label: "All Products", subtitle: "Discover our curated selection of premium electronics", icon: "ALL" },
  smartphones: { label: "Smartphones", subtitle: "Flagship phones with pro-grade cameras and all-day battery life", icon: "SP" },
  laptops: { label: "Laptops & PCs", subtitle: "Portable powerhouses for work, gaming and creative workflows", icon: "LP" },
  headphones: { label: "Audio & Headphones", subtitle: "Immersive sound, ANC and premium wireless listening", icon: "AU" },
  tablets: { label: "Tablets", subtitle: "Versatile tablets for reading, sketching and productivity", icon: "TB" },
  smartwatch: { label: "Smartwatches", subtitle: "Wearables for health tracking, notifications and training", icon: "SW" },
  cameras: { label: "Cameras", subtitle: "Hybrid cameras for creators, travel and content production", icon: "CM" },
  gaming: { label: "Gaming", subtitle: "Consoles and accessories to level up your setup", icon: "GM" }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getProducts() {
  return readJson(PRODUCTS_PATH, []);
}

function getOrders() {
  return readJson(ORDERS_PATH, []);
}

function createCategorySummary(products) {
  const counts = products.reduce((acc, product) => {
    acc[product.category] = (acc[product.category] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(CATEGORY_META)
    .filter(([key]) => key !== "all")
    .filter(([key]) => (counts[key] || 0) > 0)
    .map(([key, meta]) => ({
      key,
      label: meta.label,
      subtitle: meta.subtitle,
      icon: meta.icon,
      count: counts[key] || 0
    }));
}

function normalizePhone(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function calculateTotals(productsById, cartItems, promoCode) {
  const normalizedItems = [];

  for (const rawItem of cartItems) {
    const productId = Number(rawItem.productId);
    const quantity = Number(rawItem.quantity);
    const product = productsById.get(productId);

    if (!product || !Number.isInteger(quantity) || quantity < 1) {
      continue;
    }

    const allowedQty = Math.min(quantity, Math.max(product.qty, 0));
    if (allowedQty < 1 || product.stock === "out") {
      continue;
    }

    normalizedItems.push({
      productId,
      quantity: allowedQty,
      unitPrice: product.price,
      lineTotal: product.price * allowedQty,
      name: product.name,
      brand: product.brand,
      sku: product.sku
    });
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = subtotal > 0 && subtotal < 300 ? 19 : 0;
  const normalizedPromo = String(promoCode || "").trim().toUpperCase();
  const isPromoApplied = normalizedPromo === "TECHNO10" || normalizedPromo === "SAVE10";
  const discount = isPromoApplied ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + shipping - discount;

  return {
    items: normalizedItems,
    promoCode: isPromoApplied ? normalizedPromo : null,
    subtotal,
    shipping,
    discount,
    total
  };
}

function validateOrderPayload(payload, products) {
  const errors = [];
  const customer = payload && typeof payload.customer === "object" ? payload.customer : {};
  const delivery = payload && typeof payload.delivery === "object" ? payload.delivery : {};
  const payment = String(payload?.paymentMethod || "").trim();
  const cartItems = Array.isArray(payload?.items) ? payload.items : [];
  const productsById = new Map(products.map((product) => [product.id, product]));
  const totals = calculateTotals(productsById, cartItems, payload?.promoCode);

  const firstName = String(customer.firstName || "").trim();
  const lastName = String(customer.lastName || "").trim();
  const email = String(customer.email || "").trim();
  const phone = normalizePhone(customer.phone);
  const city = String(delivery.city || "").trim();
  const address = String(delivery.address || "").trim();
  const apartment = String(delivery.apartment || "").trim();
  const postalCode = String(delivery.postalCode || "").trim();

  if (firstName.length < 2) errors.push("First name must contain at least 2 characters.");
  if (lastName.length < 2) errors.push("Last name must contain at least 2 characters.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("A valid email address is required.");
  if (!/^\+?\d{10,15}$/.test(phone)) errors.push("A valid phone number is required.");
  if (city.length < 2) errors.push("City is required.");
  if (address.length < 5) errors.push("Street address must contain at least 5 characters.");
  if (postalCode.length < 4) errors.push("Postal code is required.");
  if (!["card", "paypal", "cash"].includes(payment)) errors.push("Payment method is invalid.");
  if (!totals.items.length) errors.push("Cart is empty or contains unavailable items.");

  return {
    errors,
    sanitized: {
      customer: { firstName, lastName, email, phone },
      delivery: { city, address, apartment, postalCode },
      paymentMethod: payment,
      totals
    }
  };
}

function generateOrderNumber(orderCount) {
  const now = new Date();
  const year = now.getFullYear();
  return `TM-${year}-${String(orderCount + 1).padStart(5, "0")}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || "application/octet-stream";
  const stream = fs.createReadStream(filePath);

  stream.on("open", () => {
    res.writeHead(200, {
      "Content-Type": contentType
    });
  });

  stream.on("error", () => {
    sendJson(res, 404, { error: "File not found" });
  });

  stream.pipe(res);
}

async function requestGeminiAssistant(message, products) {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key is missing.");
  }

  const queryTokens = String(message || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];

  const shortlist = [...products]
    .map((product) => {
      const haystack = `${product.name} ${product.brand} ${product.category} ${product.desc || ""}`.toLowerCase();
      let score = 0;
      for (const token of queryTokens) {
        if (token.length < 2) continue;
        if (haystack.includes(token)) score += 4;
        if (String(product.brand || "").toLowerCase().includes(token)) score += 3;
        if (String(product.category || "").toLowerCase().includes(token)) score += 2;
      }
      score += Number(product.rating || 0);
      if (product.stock !== "out") score += 1;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating || b.product.reviews - a.product.reviews)
    .slice(0, 16)
    .map(({ product }) => ({
    name: product.name,
    brand: product.brand,
    category: product.category,
    price: product.price,
    rating: product.rating,
    stock: product.stock
    }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: "You are TechnoMart's shopping assistant. Be concise, helpful, and sales-aware. Answer in English unless the user writes in another language. Prefer product recommendations, comparisons, checkout help, shipping help, and wishlist guidance. Only reference products from the provided catalog snapshot."
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: [
                `Catalog snapshot: ${JSON.stringify(shortlist)}`,
                `User message: ${message}`
              ].join("\n\n")
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part) => part?.text || "").join("\n\n").trim()
    : "";

  if (text) return text;
  throw new Error("Gemini returned no text.");
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/health") {
    sendJson(res, 200, { ok: true, now: new Date().toISOString() });
    return true;
  }

  if (req.method === "GET" && pathname === "/api/store") {
    const products = getProducts();
    sendJson(res, 200, {
      meta: {
        storeName: "TechnoMart",
        currency: "USD",
        supportEmail: "hello@technomart.store",
        supportPhone: "+1 408 000 0000",
        freeShippingThreshold: 300
      },
      categories: createCategorySummary(products),
      products
    });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    try {
      const products = getProducts();
      const payload = await collectBody(req);
      const validation = validateOrderPayload(payload, products);

      if (validation.errors.length) {
        sendJson(res, 400, { errors: validation.errors });
        return true;
      }

      const orders = getOrders();
      const order = {
        id: crypto.randomUUID(),
        orderNumber: generateOrderNumber(orders.length),
        createdAt: new Date().toISOString(),
        status: "new",
        customer: validation.sanitized.customer,
        delivery: validation.sanitized.delivery,
        paymentMethod: validation.sanitized.paymentMethod,
        promoCode: validation.sanitized.totals.promoCode,
        items: validation.sanitized.totals.items,
        totals: {
          subtotal: validation.sanitized.totals.subtotal,
          shipping: validation.sanitized.totals.shipping,
          discount: validation.sanitized.totals.discount,
          total: validation.sanitized.totals.total
        }
      };

      orders.push(order);
      writeJson(ORDERS_PATH, orders);
      sendJson(res, 201, { orderNumber: order.orderNumber, status: order.status, totals: order.totals });
      return true;
    } catch (error) {
      sendJson(res, error.message === "Invalid JSON" ? 400 : 500, {
        errors: [error.message === "Invalid JSON" ? "Request body must be valid JSON." : "Failed to create order."]
      });
      return true;
    }
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    try {
      const payload = await collectBody(req);
      const message = String(payload?.message || "").trim();
      if (message.length < 2) {
        sendJson(res, 400, { errors: ["Message must contain at least 2 characters."] });
        return true;
      }

      const products = getProducts();
      const reply = await requestGeminiAssistant(message, products);
      sendJson(res, 200, { reply });
      return true;
    } catch (error) {
      console.error("Chat request failed:", error.message);
      sendJson(res, 500, { errors: ["Chat is temporarily unavailable."] });
      return true;
    }
  }

  return false;
}

async function requestHandler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (await handleApi(req, res, pathname)) {
    return;
  }

  let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, "index.html");
  }

  sendFile(res, filePath);
}

module.exports = requestHandler;

if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, HOST, () => {
    console.log(`TechnoMart server is running at http://localhost:${PORT}`);
  });
}
