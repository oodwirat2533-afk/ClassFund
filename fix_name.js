const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');

content = content.replace(/let actionCellDesktop = '';/, 
  "let recHtml = (t.recorded_by || '-').split(' ').map(p => \<span class=\\\"whitespace-nowrap\\\">\</span>\).join(' ');\n        let actionCellDesktop = '';");

content = content.replace(/\\\$\\{t\.recorded_by \\|\\| '-'\\}/g, '\');

fs.writeFileSync('js/app.js', content, 'utf8');
