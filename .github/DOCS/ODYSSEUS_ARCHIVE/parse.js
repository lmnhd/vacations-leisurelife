const fs = require('fs');
const data = JSON.parse(fs.readFileSync('odysseus-intercepted-payloads.json', 'utf8'));
let out = '';
data.forEach((d, i) => {
    let u = d.url;
    out += `\n--- Payload ${i} --- URL: ${u.split('?')[0]}\n`;
    if (d.payload && d.payload.data) {
        out += `Top keys: ${Object.keys(d.payload.data).join(', ')}\n`;
        if (d.payload.data.list && d.payload.data.list.length > 0) {
            out += `list[0] keys: ${Object.keys(d.payload.data.list[0]).join(', ')}\n`;
        } else if (d.payload.data.categories && d.payload.data.categories.length > 0) {
            out += `FOUND CATEGORIES KEY!\n`;
        } else if (d.payload.data.itineraryData) {
            out += `itineraryData keys: ${Object.keys(d.payload.data.itineraryData).join(', ')}\n`;
        }
    }
});
fs.writeFileSync('keys.txt', out, 'utf8');
