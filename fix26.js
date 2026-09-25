const fs = require('fs');
let code = fs.readFileSync('js/app.js', 'utf8');

const regex = /if \(result\.isConfirmed\) \{[\s\S]*?Swal\.fire\(\{ icon: 'success'[\s\S]*?\};\s*\}\s*\);\s*\}/m;

const replacement = `if (result.isConfirmed) {
          sessionStorage.removeItem('cf_user');
          window.location.reload();
        }
      });
    }`;

if (regex.test(code)) {
    code = code.replace(regex, replacement);
    fs.writeFileSync('js/app.js', code);
    console.log('Fixed logout successfully');
} else {
    console.log('Regex did NOT match!');
}
