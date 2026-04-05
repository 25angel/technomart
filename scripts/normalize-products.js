const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW_PATH = path.join(ROOT, "data", "raw", "dummyjson", "latest.json");
const OUTPUT_PATH = path.join(ROOT, "data", "processed", "products.json");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function mapCategory(product) {
  const category = String(product?.category || "").toLowerCase();
  const title = String(product?.title || "").toLowerCase();

  if (category === "smartphones") return "smartphones";
  if (category === "laptops") return "laptops";
  if (category === "tablets") return "tablets";
  if (category.includes("watch")) return "smartwatch";
  if (category === "mobile-accessories" && /(airpods|earbuds|earphones|headphones|headset|buds|speaker|jbl|sony|beats)/i.test(title)) {
    return "headphones";
  }
  if (/(camera|drone|mirrorless|dslr)/i.test(title)) return "cameras";
  if (/(gaming|controller|playstation|xbox|nintendo|console)/i.test(title)) return "gaming";
  return "smartphones";
}

function stockState(product) {
  const stock = Number(product?.stock || 0);
  if (stock <= 0) return { stock: "out", qty: 0 };
  if (stock <= 5) return { stock: "low", qty: stock };
  return { stock: "in", qty: stock };
}

function buildSpecs(product) {
  const specs = {};
  if (product.brand) specs.Brand = product.brand;
  if (product.category) specs.Category = product.category;
  if (product.sku) specs.SKU = product.sku;
  if (product.weight) specs.Weight = `${product.weight} g`;
  if (product.dimensions?.width) specs.Width = `${product.dimensions.width} cm`;
  if (product.dimensions?.height) specs.Height = `${product.dimensions.height} cm`;
  if (product.dimensions?.depth) specs.Depth = `${product.dimensions.depth} cm`;
  if (product.warrantyInformation) specs.Warranty = product.warrantyInformation;
  if (product.shippingInformation) specs.Shipping = product.shippingInformation;
  if (product.returnPolicy) specs.Returns = product.returnPolicy;
  if (Array.isArray(product.tags) && product.tags.length) specs.Tags = product.tags.join(", ");
  return specs;
}

function buildDescription(product) {
  const base = String(product?.description || "").trim();
  if (base) return base;
  const brand = String(product?.brand || "").trim();
  const title = String(product?.title || "").trim();
  return `${brand} ${title}`.trim() || "Product description coming soon.";
}

function normalizeProduct(product) {
  const category = mapCategory(product);
  const stockInfo = stockState(product);
  const price = Number(product?.price || 0);
  const discount = Number(product?.discountPercentage || 0);
  const oldPrice = discount > 0 ? Number((price / (1 - discount / 100)).toFixed(2)) : null;
  const images = Array.isArray(product?.images) && product.images.length
    ? product.images.filter(Boolean)
    : product?.thumbnail
      ? [product.thumbnail]
      : ["/images/placeholders/product-default.svg"];
  const reviews = Array.isArray(product?.reviews) ? product.reviews.length : Math.max(0, Math.round(Number(product?.rating || 0) * 18));

  return {
    id: Number(product.id),
    source: "dummyjson",
    sourceId: String(product.id),
    sourceUrl: product?.thumbnail || "",
    sourceUpdatedAt: new Date().toISOString(),
    slug: slugify(product.title),
    name: String(product.title || "").trim(),
    brand: String(product.brand || "Generic").trim(),
    category,
    price,
    oldPrice,
    discount: discount > 0 ? Math.round(discount) : 0,
    rating: Math.min(Math.max(Number(product?.rating || 0), 0), 5),
    reviews,
    stock: stockInfo.stock,
    qty: stockInfo.qty,
    sku: String(product.sku || product.id),
    badge: discount > 0 ? "sale" : "new",
    images,
    remoteImages: [],
    specs: buildSpecs(product),
    desc: buildDescription(product),
    isPublished: true
  };
}

function main() {
  const raw = readJson(RAW_PATH, []);
  const normalized = raw.map(normalizeProduct);
  ensureDir(OUTPUT_PATH);
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  console.log(`Normalized ${normalized.length} product(s) to ${OUTPUT_PATH}`);
}

main();
