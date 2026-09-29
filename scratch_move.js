const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const scriptStart = html.indexOf('<script>\n    const firebaseConfig = {');
const scriptEnd = html.indexOf('</script>\n</head>');
if (scriptStart !== -1 && scriptEnd !== -1) {
  const inlineScript = html.substring(scriptStart + 8, scriptEnd);
  
  // Remove from index.html
  html = html.substring(0, scriptStart) + html.substring(scriptEnd + 9);
  fs.writeFileSync('index.html', html);
  
  // Prepend to firebase-db.js
  let dbJs = fs.readFileSync('js/firebase-db.js', 'utf8');
  dbJs = inlineScript + '\n' + dbJs;
  fs.writeFileSync('js/firebase-db.js', dbJs);
} else {
  console.log("Could not find inline script bounds");
}
