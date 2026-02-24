const fs = require('fs');
const html = fs.readFileSync('post-show-prices.html', 'utf8');

const scanFrom = (keyword) => {
    const idx = html.indexOf(keyword);
    if (idx !== -1) {
        const chunk = html.substring(idx, idx + 2000);
        console.log(`--- Near '${keyword}' ---`);
        const btns = chunk.match(/<button[^>]*>[\s\S]*?<\/button>|<a[^>]*>[\s\S]*?<\/a>/gi);
        if (btns) {
            btns.filter(b => b.toLowerCase().includes('select') || b.toLowerCase().includes('book')).forEach(b => {
                const match = b.match(/data-ody-id="([^"]+)"/);
                if (match) console.log('Found button ID:', match[1], 'Text:', b.replace(/<[^>]+>/g, '').trim().substring(0, 50));
            });
        }
    }
};

scanFrom('Balcony');
scanFrom('Suite');
