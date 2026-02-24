const fs = require('fs');
const html = fs.readFileSync('post-show-prices.html', 'utf8');

// Extract all data-ody-id values
const matches = [...html.matchAll(/data-ody-id="([^"]+)"/g)];
const uniqueIds = [...new Set(matches.map(m => m[1]))];
let out = 'All unique data-ody-id values:\n';
uniqueIds.forEach(id => { out += id + '\n'; });

// Find the Continue button
out += '\n--- Searching for Continue button ---\n';
const contIdx = html.indexOf('Continue');
if (contIdx !== -1) {
    const chunk = html.substring(Math.max(0, contIdx - 500), contIdx + 500);
    // Find any button or a tag near it
    const btnMatch = chunk.match(/<(button|a)[^>]*>[^<]*Continue[^<]*<\/(button|a)>/i);
    if (btnMatch) out += 'Continue button HTML: ' + btnMatch[0] + '\n';
    const odyMatch = chunk.match(/data-ody-id="([^"]+)"[^>]*>[^<]*Continue/i);
    if (odyMatch) out += 'Continue ody-id: ' + odyMatch[1] + '\n';
}

// Find age inputs
out += '\n--- Age fields ---\n';
const ageMatches = [...html.matchAll(/data-ody-id="([^"]*[Aa]ge[^"]*)"/g)];
ageMatches.forEach(m => { out += 'Age field: ' + m[1] + '\n'; });

// Find phone input  
out += '\n--- Phone fields ---\n';
const phoneMatches = [...html.matchAll(/data-ody-id="([^"]*[Pp]hone[^"]*)"/g)];
phoneMatches.forEach(m => { out += 'Phone field: ' + m[1] + '\n'; });

// Find guest fields
out += '\n--- Guest fields ---\n';
const guestMatches = [...html.matchAll(/data-ody-id="([^"]*[Gg]uest[^"]*)"/g)];
guestMatches.forEach(m => { out += 'Guest field: ' + m[1] + '\n'; });

fs.writeFileSync('form-fields.txt', out, 'utf8');
console.log('Done - wrote form-fields.txt');
