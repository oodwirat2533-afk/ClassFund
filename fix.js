const fs = require('fs');
let lines = fs.readFileSync('js/app.js', 'utf8').split(/\r?\n/);
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('const fullClassStr = ${clsName} ภาคเรียนที่ /;')) {
    lines[i] = '      const fullClassStr = `${clsName} ภาคเรียนที่ ${semStr}/${yrStr}`;';
  }
}
fs.writeFileSync('js/app.js', lines.join('\n'));
console.log('Fixed fullClassStr');
