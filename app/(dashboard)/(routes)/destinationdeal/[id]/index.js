import { load } from "cheerio";

export async function cbPicks() {
  const url = "https://www.cruisebrothers.com/cb/brothers_picks/";
  const baseURL = "https://www.cruisebrothers.com";
  
  try {
    const data = await fetch(url, { cache: 'no-store' });
    const resultData = await data.text();
    const $ = load(resultData);
    
    const arr = [];
    
    // Debug: Log what we find
    console.log('=== CB Picks Scraper Debug ===');
    
    // Try multiple selectors to find pick containers
    const pickLinks = $('a[href*="/cb/brothers_pick/"]');
    console.log('Found pick links:', pickLinks.length);
    
    if (pickLinks.length === 0) {
      console.log('No direct links found, trying alternative selectors');
      
      // Try to find any elements with "View Details" or similar
      const viewDetailsLinks = $('a:contains("View Details")');
      console.log('View Details links found:', viewDetailsLinks.length);
    }
    
    pickLinks.each((index, element) => {
      const $link = $(element);
      const href = $link.attr('href');
      
      if (!href || !href.includes('/cb/brothers_pick/')) return;
      
      const pickID = href.split('/').filter(Boolean).pop();
      
      // Navigate up to find the container with all info
      let $container = $link;
      for (let i = 0; i < 5; i++) {
        $container = $container.parent();
        if (!$container.length) break;
      }
      
      // Get all text content from container
      const fullText = $container.text();
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);
      
      // Extract cruise information with all required fields
      const obj = {
        id: pickID,
        img: '',
        destination: '',
        what: '',
        when: '',
        price: '',
        elsepay: '',
        go: '',
        why: '',
        other: 'View details for more information',
        destination_url: `${baseURL}${href}`
      };
      
      // Find image - look for img tags within or near the link
      let $img = $link.find('img');
      if (!$img.length) {
        $img = $container.find('img').first();
      }
      
      if ($img.length) {
        let src = $img.attr('src');
        if (src) {
          if (!src.startsWith('http')) {
            obj.img = `${baseURL}${src}`;
          } else {
            obj.img = src;
          }
        }
      }
      
      // Parse text content - look for patterns
      let shipName = '';
      let destination = '';
      let nights = '';
      let price = '';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Look for price pattern ($ followed by digits)
        if (line.includes('$') && /\$[\d,]+/.test(line)) {
          price = line.replace(/^[^$]*/, '').split(' ')[0];
        }
        
        // Look for night pattern
        if (line.match(/\d+\s+Nights?/)) {
          nights = line.trim();
        }
        
        // Ship name often comes before a known destination pattern
        if (line.match(/Princess|Navigator|Carnival|Viking|Celebrity|Queen|Utopia|Ruby|Venezia|Beyond|Mary/i)) {
          shipName = line;
        }
        
        // Destination often follows after ship name or is a known region
        if (line.match(/Alaska|Caribbean|Mexico|Europe|Bahamas|TransAtlantic|Alaska|Thailand|Mediterranean|Bermuda/i)) {
          destination = line;
        }
      }
      
      // Build the fields with proper formatting
      obj.what = shipName ? `${nights || '7-nights'} ${shipName}` : 'Cruise package';
      obj.destination = destination ? `Destination: ${destination}` : 'Destination: Caribbean';
      obj.when = nights ? `When: ${nights} available` : 'When: Check availability';
      obj.price = price ? `Prices: from ${price} per person` : 'Prices: Contact for quote';
      obj.why = 'Why this is a deal: Great cruise value with excellent amenities!';
      obj.elsepay = 'Rate includes port charges. Taxes and air additional.';
      obj.go = 'Visit amazing cruise destinations on this exciting voyage.';
      obj.other = 'onboard credit package available on select sailing dates';
      
      // Only add if we have an ID and some meaningful data
      if (obj.id && (shipName || destination || price)) {
        arr.push(obj);
        console.log(`Pick ${index + 1}: ID=${obj.id}, Ship=${shipName}, Dest=${destination}, Price=${price}`);
      }
    });
    
    console.log('=== Total picks found:', arr.length, '===');
    return arr;
  } catch (error) {
    console.error('Error scraping CB Picks:', error.message);
    return [];
  }
}

export async function cbPick(pickID) {
  console.log('cbPick', pickID);
  
  return new Promise(async (resolve, reject) => {
    try {
      const picks = await cbPicks();
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
