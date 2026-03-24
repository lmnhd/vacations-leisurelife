const fs = require('fs');
const content = fs.readFileSync('tmp/campaign-log.txt', 'utf8');
const lines = content.split('\n');
console.log(lines.slice(-30).join('\n'));