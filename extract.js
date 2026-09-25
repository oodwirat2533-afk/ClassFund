const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const styleStart = html.indexOf('<style>');
const styleEnd = html.indexOf('</style>') + 8;
let styleContent = '';
if(styleStart > -1) {
    styleContent = html.slice(styleStart + 7, styleEnd - 8);
}

const scriptStart = html.lastIndexOf('<script>');
const scriptEnd = html.lastIndexOf('</script>') + 9;
let scriptContent = '';
if(scriptStart > -1) {
    scriptContent = html.slice(scriptStart + 8, scriptEnd - 9);
}

let newHtml = html;
if(styleStart > -1 && scriptStart > -1) {
    newHtml = html.slice(0, styleStart) + 
      '<link rel="stylesheet" href="css/style.css">\n' + 
      html.slice(styleEnd, scriptStart) + 
      '<script type="module" src="js/firebase-db.js"></script>\n<script src="js/app.js"></script>\n' + 
      html.slice(scriptEnd);
}

fs.mkdirSync('css', { recursive: true });
fs.mkdirSync('js', { recursive: true });

fs.writeFileSync('css/style.css', styleContent);
fs.writeFileSync('js/app.js', scriptContent);
fs.writeFileSync('index.html', newHtml);

console.log('Extraction complete.');
