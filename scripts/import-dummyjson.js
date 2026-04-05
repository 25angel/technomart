const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw", "dummyjson");
const TARGET_PATH = path.join(RAW_DIR, "latest.json");
const SOURCE_URL = "https://dummyjson.com/products?limit=0&select=id,title,description,category,price,discountPercentage,rating,stock,tags,brand,sku,weight,dimensions,warrantyInformation,shippingInformation,availabilityStatus,returnPolicy,thumbnail,images";

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function isRelevantProduct(product) {
  const title = String(product?.title || "").toLowerCase();
  const category = String(product?.category || "").toLowerCase();

  if (["smartphones", "laptops", "tablets"].includes(category)) return true;
  if (category.includes("watch")) return true;
  if (category === "mobile-accessories" && /(airpods|earbuds|earphones|headphones|headset|buds|speaker|jbl|sony|beats)/i.test(title)) return true;
  return false;
}

async function main() {
  ensureDir(RAW_DIR);

  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; TechnoMartMVP/1.0)" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch DummyJSON products: ${response.status}`);
  }

  const payload = await response.json();
  const allProducts = Array.isArray(payload?.products) ? payload.products : [];
  const filteredProducts = allProducts.filter(isRelevantProduct);

  fs.writeFileSync(TARGET_PATH, `${JSON.stringify(filteredProducts, null, 2)}\n`, "utf8");
  console.log(`Saved ${filteredProducts.length} DummyJSON product(s) to ${TARGET_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
