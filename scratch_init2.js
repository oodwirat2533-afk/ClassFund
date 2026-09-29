const fs = require('fs');
let c = fs.readFileSync('js/app.js', 'utf8');
c = c.replace('window.onload = () => {', 'const initApp = () => {');
fs.writeFileSync('js/app.js', c);
