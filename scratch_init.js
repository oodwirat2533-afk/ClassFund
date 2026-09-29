const fs = require('fs');
let c = fs.readFileSync('js/app.js', 'utf8');
const searchStr = `      }
    };

    // === View Switcher (Dashboard, Students Management, Collect Checklist) ===`;
const replaceStr = `      }
    };

    if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(initApp, 1);
    } else {
      window.addEventListener("DOMContentLoaded", initApp);
    }

    // === View Switcher (Dashboard, Students Management, Collect Checklist) ===`;
c = c.replace(searchStr, replaceStr);
fs.writeFileSync('js/app.js', c);
