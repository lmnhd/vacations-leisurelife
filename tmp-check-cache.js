const fs = require('fs');
const cache = JSON.parse(fs.readFileSync('.github/data/cb-deals-cache.json', 'utf8'));
console.log('Price Advantages (first 30):');
cache.priceAdvantages.slice(0, 30).forEach((p, i) => {
  console.log(`${i + 1}. ${p.shipName} (${p.vendor}) - ${p.sailDate}`);
});
console.log('\nTotal price advantages:', cache.priceAdvantages.length);
