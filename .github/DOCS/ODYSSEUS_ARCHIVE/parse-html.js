const fs = require('fs');
const html = fs.readFileSync('post-show-prices.html', 'utf8');
console.log('File size:', html.length);
['Balcony', 'Ocean View', 'Suite', 'Inside'].forEach(cat => {
    let count = 0;
    let idx = html.indexOf(cat);
    while (idx !== -1) {
        count++;
        idx = html.indexOf(cat, idx + 1);
    }
    console.log(cat, count);
});
