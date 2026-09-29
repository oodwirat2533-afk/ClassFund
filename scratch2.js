const fs = require('fs');
let c = fs.readFileSync('js/firebase-db.js', 'utf8');
const searchStr = `        return async function(...args) {
          try {
            const result = await API[prop](...args);
            // Invalidate cache after any successful write operation
            if (!readOnlyMethods.includes(prop) && result && result.success) {
              _invalidateCache();
            }
            if (successHandler) successHandler(result);
          } catch (e) {`;
const replaceStr = `        return async function(...args) {
          const isWrite = !readOnlyMethods.includes(prop);
          let genericLoaderShown = false;
          
          if (isWrite && window.Swal && !window.Swal.isVisible()) {
             if (window.showCenterLoader) {
                 window.showCenterLoader('loading', 'กำลังประมวลผล...', 'กรุณารอสักครู่');
             } else {
                 window.Swal.fire({ title: 'กำลังประมวลผล...', text: 'กรุณารอสักครู่', allowOutsideClick: false, didOpen: () => window.Swal.showLoading() });
             }
             genericLoaderShown = true;
          }
          
          try {
            const result = await API[prop](...args);
            // Invalidate cache after any successful write operation
            if (isWrite && result && result.success) {
              _invalidateCache();
            }
            if (successHandler) successHandler(result);
          } catch (e) {`;
c = c.replace(searchStr, replaceStr);
fs.writeFileSync('js/firebase-db.js', c);
