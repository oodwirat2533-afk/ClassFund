const fs = require('fs');
let c = fs.readFileSync('js/firebase-db.js', 'utf8');
const searchStr = `          try {
            const result = await API[prop](...args);
            // Invalidate cache after any successful write operation
            if (isWrite && result && result.success) {
              _invalidateCache();
            }
            if (successHandler) successHandler(result);
          } catch (e) {
            console.error('Firebase Error:', e);
            if (failureHandler) failureHandler(e);
          }`;
const replaceStr = `          try {
            const result = await API[prop](...args);
            // Invalidate cache after any successful write operation
            if (isWrite && result && result.success) {
              _invalidateCache();
            }
            if (successHandler) successHandler(result);
            
            // Auto close the generic loader if the successHandler didn't show a new message
            if (genericLoaderShown && window.Swal && window.Swal.isVisible()) {
               const titleEl = window.Swal.getTitle();
               if (titleEl && titleEl.textContent === 'กำลังประมวลผล...') {
                   window.Swal.close();
               }
            }
          } catch (e) {
            console.error('Firebase Error:', e);
            if (failureHandler) failureHandler(e);
            else if (genericLoaderShown && window.Swal) {
                window.Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: e.message || 'การเชื่อมต่อขัดข้อง' });
            }
          }`;
c = c.replace(searchStr, replaceStr);
fs.writeFileSync('js/firebase-db.js', c);
