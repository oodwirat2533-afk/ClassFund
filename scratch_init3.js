const fs = require('fs');
let c = fs.readFileSync('js/app.js', 'utf8');
c += `\n
if (document.readyState === "complete" || document.readyState === "interactive") {
  setTimeout(initApp, 1);
} else {
  window.addEventListener("DOMContentLoaded", initApp);
}
`;
fs.writeFileSync('js/app.js', c);
