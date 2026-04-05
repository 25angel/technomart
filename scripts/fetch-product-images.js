const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PRODUCTS_PATH = path.join(ROOT, "data", "processed", "products.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const FORCE = process.argv.includes("--force");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function extensionFromUrl(url) {
  const clean = url.split("?")[0];
  return path.extname(clean) || ".jpg";
}

async function download(url, targetPath) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; TechnoMartMVP/1.0)" }
  });
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
}

async function main() {
  const products = readJson(PRODUCTS_PATH, []);
  let changed = false;
  for (const product of products) {
    if (!Array.isArray(product.remoteImages) || !product.remoteImages.length) continue;
    const localImages = [];
    for (let index = 0; index < product.remoteImages.length; index += 1) {
      const url = product.remoteImages[index];
      const relativePath = `/images/products/${product.slug}-${index + 1}${extensionFromUrl(url)}`;
      const absolutePath = path.join(PUBLIC_DIR, relativePath);
      try {
        if (FORCE || !fs.existsSync(absolutePath)) {
          console.log(`Downloading ${product.slug} image ${index + 1}/${product.remoteImages.length}`);
          await download(url, absolutePath);
        }
      } catch (error) {
        console.warn(`Image skipped for ${product.slug}: ${error.message}`);
      }
      if (fs.existsSync(absolutePath)) {
        localImages.push(relativePath);
      }
    }
    if (localImages.length) {
      product.images = localImages;
      changed = true;
    }
  }
  if (changed) fs.writeFileSync(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  console.log(`Processed ${products.length} product(s) for local images.${FORCE ? " Forced refresh enabled." : ""}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
