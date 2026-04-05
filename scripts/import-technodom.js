const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const RAW_DIR = path.join(ROOT, "data", "raw", "technodom");
const TARGET_PATH = path.join(RAW_DIR, "latest.json");
const args = process.argv.slice(2);
const DEFAULT_LIMIT = 24;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseArgs(argv) {
  const options = {
    append: false,
    limit: DEFAULT_LIMIT,
    file: ""
  };
  const urls = [];

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--append") {
      options.append = true;
      continue;
    }
    if (value === "--limit") {
      options.limit = Number(argv[index + 1] || DEFAULT_LIMIT) || DEFAULT_LIMIT;
      index += 1;
      continue;
    }
    if (value === "--file") {
      options.file = argv[index + 1] || "";
      index += 1;
      continue;
    }
    urls.push(value);
  }

  return { options, urls };
}

function toText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToLines(html) {
  return String(html || "")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|li|dt|dd|tr|td|br)>/gi, "\n")
    .replace(/<(p|div|section|article|h1|h2|h3|h4|h5|h6|li|dt|dd|tr|td|br)[^>]*>/gi, "\n")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function isProductUrl(url) {
  return /\/p\//i.test(url);
}

function isCategoryUrl(url) {
  return !isProductUrl(url);
}

function normalizeUrl(url) {
  try {
    return new URL(url).toString();
  } catch (error) {
    return "";
  }
}

function readInputFile(filePath) {
  if (!filePath) return [];
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Input file not found: ${absolutePath}`);
    process.exit(1);
  }

  return fs
    .readFileSync(absolutePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function unique(values) {
  return [...new Set(values)];
}

function filterProductImages(imageUrls, sourceId) {
  if (!sourceId) return [];

  const bestByOrder = new Map();

  function scoreUrl(url) {
    let score = 0;
    if (url.includes("/800/800/")) score += 100;
    else if (url.match(new RegExp(`/images/${sourceId}_`, "i"))) score += 80;

    if (/\.jpg$/i.test(url) || /\.jpeg$/i.test(url)) score += 20;
    else if (/\.webp$/i.test(url)) score += 10;

    return score;
  }

  for (const url of imageUrls) {
    if (!url || /\.gif/i.test(url)) continue;
    if (!new RegExp(`(?:^|/)${sourceId}_(\\d+)\\.(jpg|jpeg|webp)(?:\\?[^\"' )]*)?$`, "i").test(url)) continue;
    if (url.includes("/48/48/") || url.includes("/272/272/")) continue;

    const order = url.match(new RegExp(`${sourceId}_(\\d+)`, "i"))?.[1];
    if (!order) continue;

    const current = bestByOrder.get(order);
    if (!current || scoreUrl(url) > scoreUrl(current)) {
      bestByOrder.set(order, url);
    }
  }

  return [...bestByOrder.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((entry) => entry[1])
    .slice(0, 8);
}

function buildFallbackImageUrls(sourceId) {
  if (!sourceId) return [];
  const variants = [];
  const extensions = ["jpg", "webp", "jpeg"];
  for (let index = 1; index <= 6; index += 1) {
    for (const ext of extensions) {
      variants.push(`https://api.technodom.kz/f3/api/v1/images/800/800/${sourceId}_${index}.${ext}`);
    }
  }
  return variants;
}

function readExistingRecords(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return [];
  }
}

function extractProductLinks(html, sourceUrl) {
  const links = new Set();
  const origin = new URL(sourceUrl).origin;
  const regex = /href="([^"]+)"/gi;

  for (const match of html.matchAll(regex)) {
    const href = match[1];
    if (!href) continue;
    if (!href.includes("/p/")) continue;
    const absoluteUrl = href.startsWith("http") ? href : new URL(href, origin).toString();
    const cleanUrl = absoluteUrl.split("?")[0];
    links.add(cleanUrl);
  }

  return [...links];
}

function findLineIndex(lines, pattern, fromIndex = 0) {
  for (let index = fromIndex; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) return index;
  }
  return -1;
}

function isStopLine(line) {
  return /^(Все характеристики|Скрыть список|Рейтинг и отзывы|Наличие товара|Купить сейчас|В корзину|Смотрят сейчас|Артикул:|Гарантия низкой цены|Нашли товар дешевле)/i.test(line);
}

function isLikelySpecKey(line) {
  return line.length > 2 && line.length < 80 && !/^[\d\s.,₸]+$/.test(line) && !isStopLine(line);
}

function isLikelySpecValue(line) {
  return (
    /[\d]/.test(line) ||
    /^(Да|Нет|OLED|AMOLED|IPS|LCD|IOS|Android|Apple|Samsung|USB|Wi-Fi|Bluetooth|Nano-SIM|eSIM|Type-C)/i.test(line) ||
    line.length <= 60
  );
}

function extractSpecsFromLines(lines) {
  const specs = {};
  const markers = [/^Характеристики:?$/i, /^Характеристики$/i];
  let startIndex = -1;

  for (const marker of markers) {
    startIndex = findLineIndex(lines, marker);
    if (startIndex !== -1) break;
  }

  if (startIndex === -1) return specs;

  for (let index = startIndex + 1; index < lines.length - 1; index += 1) {
    const key = lines[index];
    const value = lines[index + 1];
    if (isStopLine(key)) break;
    if (!isLikelySpecKey(key) || !value || isStopLine(value)) continue;
    if (!isLikelySpecValue(value)) continue;
    if (key === value) continue;
    specs[key] = value;
    index += 1;
  }

  return specs;
}

function extractDescriptionFromLines(lines) {
  const descriptionMarkers = [/^Описание$/i, /^О товаре$/i, /^Описаниe$/i];
  for (const marker of descriptionMarkers) {
    const index = findLineIndex(lines, marker);
    if (index === -1) continue;
    const parts = [];
    for (let i = index + 1; i < Math.min(index + 8, lines.length); i += 1) {
      const line = lines[i];
      if (!line || isStopLine(line) || /^Характеристики$/i.test(line)) break;
      if (line.length > 20) parts.push(line);
    }
    if (parts.length) return parts.join(" ");
  }
  return "";
}

function extractRating(lines) {
  for (let index = 0; index < lines.length - 2; index += 1) {
    if (!/^Рейтинг и отзывы$/i.test(lines[index])) continue;
    const ratingLine = lines[index + 1] || "";
    const reviewsLine = lines[index + 2] || "";
    if (/^\d+(\.\d+)?$/.test(ratingLine) && /\(\d+/.test(reviewsLine)) {
      return {
        ratingText: ratingLine,
        reviewsText: reviewsLine.match(/\d+/)?.[0] || ""
      };
    }
  }

  const reviewIndex = findLineIndex(lines, /^\(\d+\)$/);
  if (reviewIndex > 0 && /^\d+(\.\d+)?$/.test(lines[reviewIndex - 1])) {
    return {
      ratingText: lines[reviewIndex - 1],
      reviewsText: lines[reviewIndex].replace(/[()]/g, "")
    };
  }

  return { ratingText: "", reviewsText: "" };
}

function extractAvailability(lines) {
  const noStockIndex = findLineIndex(lines, /^Нет в наличии$/i);
  if (noStockIndex !== -1) return "Нет в наличии";
  const deliveryIndex = findLineIndex(lines, /^Самовывоз|^Доставка/i);
  if (deliveryIndex !== -1) return "В наличии";
  return "";
}

function parseProductPage(html, sourceUrl) {
  const sourceId = sourceUrl.match(/-(\d+)(?:\/|$)/)?.[1] || "";
  const discoveredImageUrls = [...new Set((html.match(/https:\/\/api\.technodom\.kz\/f3\/api\/v1\/images\/[^"' )]+/gi) || []))];
  const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] || "";
  if (ogImage) discoveredImageUrls.push(ogImage);
  const imageUrls = filterProductImages(
    [...new Set([...discoveredImageUrls, ...buildFallbackImageUrls(sourceId)])],
    sourceId
  );
  const specs = {};
  for (const match of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
    const key = toText(match[1]);
    const value = toText(match[2]);
    if (key && value) specs[key] = value;
  }
  const lines = htmlToLines(html);
  const lineSpecs = extractSpecsFromLines(lines);
  const rating = extractRating(lines);
  const description = extractDescriptionFromLines(lines);
  const availabilityText = extractAvailability(lines);

  return {
    source: "technodom",
    sourceId,
    sourceUrl,
    name: toText(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
    brand: "",
    priceText: toText(html.match(/([\d\s]+₸)/)?.[1] || ""),
    oldPriceText: "",
    ratingText: rating.ratingText,
    reviewsText: rating.reviewsText,
    availabilityText,
    specs: Object.keys(specs).length ? specs : lineSpecs,
    imageUrls,
    description,
    fetchedAt: new Date().toISOString()
  };
}

async function fetchPage(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; TechnoMartMVP/1.0)" }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

async function main() {
  const { options, urls } = parseArgs(args);
  const fileUrls = readInputFile(options.file);
  const inputUrls = unique([...urls, ...fileUrls].map(normalizeUrl).filter(Boolean));

  if (!inputUrls.length) {
    console.error("Usage:");
    console.error('npm run import:technodom -- "https://www.technodom.kz/p/..."');
    console.error('npm run import:technodom -- "https://www.technodom.kz/catalog/..." --limit 30');
    console.error('npm run import:technodom -- --file data/raw/technodom/urls.txt --append');
    process.exit(1);
  }

  ensureDir(RAW_DIR);

  const discoveredProductUrls = [];

  for (const sourceUrl of inputUrls) {
    if (isProductUrl(sourceUrl)) {
      discoveredProductUrls.push(sourceUrl);
      continue;
    }

    try {
      const html = await fetchPage(sourceUrl);
      const links = extractProductLinks(html, sourceUrl).slice(0, options.limit);
      console.log(`Discovered ${links.length} product link(s) from ${sourceUrl}`);
      discoveredProductUrls.push(...links);
    } catch (error) {
      console.error(error.message);
    }
  }

  const finalProductUrls = unique(discoveredProductUrls);
  const existing = options.append ? readExistingRecords(TARGET_PATH) : [];
  const existingIds = new Set(existing.map((record) => String(record.sourceId)));
  const records = [...existing];

  for (const sourceUrl of finalProductUrls) {
    try {
      const html = await fetchPage(sourceUrl);
      const record = parseProductPage(html, sourceUrl);
      if (!record.sourceId || existingIds.has(String(record.sourceId))) continue;
      existingIds.add(String(record.sourceId));
      records.push(record);
      console.log(`Imported ${record.name || record.sourceUrl}`);
    } catch (error) {
      console.error(error.message);
    }
  }

  fs.writeFileSync(TARGET_PATH, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  console.log(`Saved ${records.length} raw Technodom record(s) to ${TARGET_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
