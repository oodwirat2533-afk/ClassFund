const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const searchRegex = /<script>\s*const firebaseConfig = \{[\s\S]*?\}\);\s*<\/script>\s*/;
const match = html.match(searchRegex);

if (match) {
  const inlineScriptContent = match[0].replace(/<script>\s*/, '').replace(/\s*<\/script>\s*/, '');
  
  // Remove from index.html
  html = html.replace(searchRegex, '');
  fs.writeFileSync('index.html', html);
  
  // Prepend to firebase-db.js
  let dbJs = fs.readFileSync('js/firebase-db.js', 'utf8');
  dbJs = inlineScriptContent + '\n\n' + dbJs;
  fs.writeFileSync('js/firebase-db.js', dbJs);
  console.log("Success");
} else {
  console.log("Match not found");
}
