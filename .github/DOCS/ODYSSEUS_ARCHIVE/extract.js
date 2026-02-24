const fs = require('fs');
const html = fs.readFileSync('post-book-state.html', 'utf8');
const start = html.indexOf('GuestResidencySection');
const end = html.indexOf('</fieldset>', start);
const text = html.substring(start, end);
const matches = [...text.matchAll(/data-ody-id="([^"]+)"/g)];
console.log(matches.map(m => m[1]).join(', '));
