const fs = require('fs');
const data = JSON.parse(fs.readFileSync('odysseus-intercepted-payloads.json', 'utf8'));

const cruisePayload = data.find(d => d.url.includes('/nitroapi/v2/cruise?') && !d.url.includes('facets'));
let out = '';
if (cruisePayload && cruisePayload.payload && cruisePayload.payload.data && cruisePayload.payload.data.list) {
    const list0 = cruisePayload.payload.data.list[0];
    if (list0) {
        out += `Category Types Length: ${list0.categoryTypes ? list0.categoryTypes.length : 0}\n`;
        if (list0.categoryTypes && list0.categoryTypes.length > 0) {
            out += JSON.stringify(list0.categoryTypes, null, 2) + '\n';
        }
        out += `\nPrices Length: ${list0.prices ? list0.prices.length : 0}\n`;
        if (list0.prices && list0.prices.length > 0) {
            out += JSON.stringify(list0.prices, null, 2) + '\n';
        }
    }
}
fs.writeFileSync('cat-output-utf8.txt', out, 'utf8');
