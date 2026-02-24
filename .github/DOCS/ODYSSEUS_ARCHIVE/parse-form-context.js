const fs = require('fs');
const html = fs.readFileSync('post-show-prices.html', 'utf8');

let out = '';

// Find GuestAge_0 element and surrounding HTML
const age0Idx = html.indexOf('GuestAge_0');
if (age0Idx !== -1) {
    out += '--- GuestAge_0 context ---\n';
    out += html.substring(Math.max(0, age0Idx - 200), age0Idx + 300) + '\n\n';
}

// Find Phone Number field
const phoneIdx = html.indexOf('Phone Number');
if (phoneIdx !== -1) {
    out += '--- Phone Number context ---\n';
    out += html.substring(Math.max(0, phoneIdx - 200), phoneIdx + 500) + '\n\n';
}

// Find Continue button 
const contIdx = html.indexOf('ContinueButton');
if (contIdx !== -1) {
    out += '--- ContinueButton context ---\n';
    out += html.substring(Math.max(0, contIdx - 200), contIdx + 300) + '\n\n';
}

// Find GuestSelectDropdown
const guestSelIdx = html.indexOf('GuestSelectDropdown');
if (guestSelIdx !== -1) {
    out += '--- GuestSelectDropdown context ---\n';
    out += html.substring(Math.max(0, guestSelIdx - 100), guestSelIdx + 300) + '\n\n';
}

fs.writeFileSync('form-context.txt', out, 'utf8');
console.log('Done');
