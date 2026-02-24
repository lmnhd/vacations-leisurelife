const fs = require('fs');
const data = JSON.parse(fs.readFileSync('odysseus-intercepted-payloads.json', 'utf8'));

const posPayload = data.find(d => d.url.includes('ListPOS'));
if (posPayload && posPayload.payload && posPayload.payload.data) {
    const cruiseRes = posPayload.payload.data.cruiseReservation;
    if (cruiseRes) {
        console.log('Keys in cruiseReservation:', Object.keys(cruiseRes).join(', '));
        if (cruiseRes.categories) {
            console.log('Categories length:', cruiseRes.categories.length);
            if (cruiseRes.categories.length > 0) {
                console.log('Category 0 keys:', Object.keys(cruiseRes.categories[0]).join(', '));
                console.log('Category 0 sample:', JSON.stringify(cruiseRes.categories[0], null, 2).substring(0, 500));
            }
        }
        if (cruiseRes.prices) {
            console.log('Got prices directly on cruiseReservation!');
        }
    } else {
        console.log('No cruiseReservation in ListPOS');
    }
} else {
    console.log('No ListPOS payload found');
}
