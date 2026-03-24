const fs = require('fs');
const content = fs.readFileSync('tmp/test1.txt', 'utf8');
console.log("LAST 2000 CHARACTERS:");
console.log(content.slice(-2000));
