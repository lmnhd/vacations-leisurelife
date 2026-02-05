import { load } from "cheerio";

export async function cbPicks() {
  const url = "https://www.cruisebrothers.com/cb/brothers_picks/";
  const baseURL = "https://www.cruisebrothers.com";
  
  try {
    const data = await fetch(url, { cache: 'no-store' });
    const resultData = await data.text();
    const $ = load(resultData);
    
    const arr = [];
    
    // The new page structure uses divs with card-like layouts
    // Looking for elements containing the cruise information
    $('a[href*="/cb/brothers_pick/"]').each((index, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      const pickID = href.split('/').filter(Boolean).pop(); // Extract ID from URL
      
      // Find the closest container that holds all the info
      const $container = $link.closest('div[class*="card"], article, [class*="pick"]') || $link.parent().parent();
      
      if (!$container.length) return;
      
      const obj = {
        id: pickID,
        destination: '',
        what: '',
        when: '',
        price: '',
        img: '',
        destination_url: `${baseURL}${href}`
      };
      
      // Extract title/destination from text before or near the link
      const textContent = $container.text();
      const lines = textContent.split('\n').filter(line => line.trim());
      
      // Get image
      const $img = $container.find('img[alt*="brothers pick"], img[src*="brothers_pics_images"]').first();
      if ($img.length) {
        const src = $img.attr('src');
        if (!src.startsWith('http')) {
          obj.img = `${baseURL}${src}`;
        } else {
          obj.img = src;
        }
      }
      
      // Extract destination info from text
      const titleMatch = textContent.match(/([A-Za-z\s]+)\n([A-Za-z\s]+)\n(\d+\s+Nights?)/);
      if (titleMatch) {
        obj.what = titleMatch[1]?.trim() || '';
        obj.destination = titleMatch[2]?.trim() || '';
        obj.when = titleMatch[3]?.trim() || '';
      }
      
      // Extract price
      const priceMatch = textContent.match(/\$[\d,]+(?:\s+(?:per person|person))?/);
      if (priceMatch) {
        obj.price = priceMatch[0];
      }
      
      // Only add if we have meaningful data
      if (obj.id && (obj.what || obj.destination)) {
        arr.push(obj);
      }
    });
    
    console.log('CB Picks scraped:', arr.length, 'items');
    return arr;
  } catch (error) {
    console.error('Error scraping CB Picks:', error);
    return [];
  }
}

export async function cbPick(pickID) {
  console.log('cbPick', pickID);
  
  return new Promise(async (resolve, reject) => {
    try {
      const picks = await cbPicks();
      console.log('loaded picks => ', picks.length, 'items');
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
