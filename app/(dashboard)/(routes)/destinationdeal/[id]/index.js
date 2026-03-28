import { load } from "cheerio";
import { getStoredCbDeals } from "@/lib/cb/cb-deals-store";

const CB_PICKS_REVALIDATE_SECONDS = 60 * 60 * 24 * 30;
const CB_PICKS_REVALIDATE_MS = CB_PICKS_REVALIDATE_SECONDS * 1000;

let cbPicksMemoryCache = {
  data: [],
  expiresAt: 0,
};

function shouldUseStoredCbDeals(source = "auto") {
  if (source === "live") {
    return false;
  }

  return true;
}

async function getStoredCbPicks() {
  const storedDeals = await getStoredCbDeals();
  if (!storedDeals || !Array.isArray(storedDeals.picks)) {
    return [];
  }

  return storedDeals.picks;
}

function absoluteCbUrl(path, baseURL) {
  if (!path) {
    return "";
  }

  try {
    return new URL(path, baseURL).toString();
  } catch {
    return path;
  }
}

function normalizeNightLabel(nights) {
  const trimmed = String(nights || "").trim();
  if (!trimmed) {
    return "Cruise";
  }

  const normalized = trimmed.replace(/\s+Nights?/i, "-nights");
  return normalized;
}

function parseCurrentBrothersPicks($, baseURL) {
  const parsedPicks = [];

  $(".carousel-cell").each((index, element) => {
    const card = $(element);
    const href = card.find("a[href*='/cb/brothers_pick/']").attr("href") || "";
    const imgSrc = card.find("img").attr("src") || "";
    const headline = card
      .find(".bp_icon_text_container_headline p")
      .first()
      .text()
      .trim();
    const cardFields = card
      .find(".bp_icon_text_container .bp_text_container_2 p")
      .map((fieldIndex, fieldElement) => $(fieldElement).text().trim())
      .get();
    const ship = cardFields[0] || "Cruise package";
    const destination = cardFields[1] || "Cruise destination";
    const nights = cardFields[2] || "Check availability";
    const priceValue = card.find(".ctp_line_2").first().text().trim();

    if (!href || !destination || !priceValue) {
      return;
    }

    const obj = {
      img: absoluteCbUrl(imgSrc, baseURL),
      destination: `Destination: ${destination}`,
      what: `What: ${normalizeNightLabel(nights)} ${ship}`,
      when: `When: ${nights}`,
      price: `Prices: ${priceValue}`,
      elsepay: "What else you will have to pay: Taxes, fees, and optional air vary by sailing.",
      go: `Where you go: ${destination}`,
      why: `Why this is a deal: ${headline || "Featured Brothers' Pick savings."}`,
      other: `Other details: ${headline || "View details for more information."}`,
      destination_url: absoluteCbUrl(href, baseURL),
    };

    obj.id = pickID(obj);
    parsedPicks.push(obj);
  });

  return parsedPicks;
}

export async function cbPicks(options = {}) {
  const source = options?.source ?? "auto";
  const urls = ["https://www.cruisebrothers.com/cb/brothers_picks/"];
  const baseURL = "https://www.cruisebrothers.com";

  if (shouldUseStoredCbDeals(source)) {
    const storedPicks = await getStoredCbPicks();
    if (storedPicks.length > 0) {
      return storedPicks;
    }

    if (source === "store" || process.env.NODE_ENV === "production") {
      console.warn("CB deals store is empty; production read path will return no deals until background refresh runs.");
      return [];
    }
  }

  if (cbPicksMemoryCache.data.length > 0 && cbPicksMemoryCache.expiresAt > Date.now()) {
    console.log("Using cached CB picks from memory");
    return cbPicksMemoryCache.data;
  }
  
  try {
    let arr = [];

    for (const url of urls) {
      const data = await fetch(url, {
        next: { revalidate: CB_PICKS_REVALIDATE_SECONDS },
      });
      const resultData = await data.text();
      const $ = load(resultData);
      const parsedPicks = parseCurrentBrothersPicks($, baseURL);

      if (parsedPicks.length > 0) {
        arr = parsedPicks;
        console.log(`Using CB picks parsed from ${url}: ${arr.length}`);
        break;
      }
    }

    cbPicksMemoryCache = {
      data: arr,
      expiresAt: Date.now() + CB_PICKS_REVALIDATE_MS,
    };
    return arr;
  } catch (error) {
    console.error('Error scraping CB Picks:', error.message);
    return [];
  }
}

export async function cbPick(pickID, options = {}) {
  console.log('cbPick', pickID);
  
  return new Promise(async (resolve, reject) => {
    try {
      const picks = await cbPicks(options);
      console.log('loaded picks =>', picks.length, 'items');
      let result = picks.find((pick) => {
        return pick.id == pickID;
      });
      resolve(result || null);
    } catch (error) {
      console.error('Error in cbPick:', error);
      reject(error);
    }
  });
}

export function pickID(pick) {
  return String(`${pick.what}-${pick.when}`).replaceAll(" ", "").replaceAll('.', '');
}
