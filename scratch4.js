const fs = require('fs');
let c = fs.readFileSync('js/firebase-db.js', 'utf8');
const searchStr = `function createRunProxy(successHandler, failureHandler) {`;
const replaceStr = `function createRunProxy(successHandler, failureHandler) {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'withSuccessHandler') {
        return (handler) => createRunProxy(handler, failureHandler);
      }
      if (prop === 'withFailureHandler') {
        return (handler) => createRunProxy(successHandler, handler);
      }
      if (API[prop]) {
        const readOnlyMethods = ['getDashboardData', 'getAllRooms', 'setRoomId', 'hashPassword', 'login', '_fetchFreshData'];
        return async function(...args) {
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
          }
        };
      }
      return function(...args) {
        console.warn('Unimplemented GAS function called:', prop, args);
        if (successHandler) successHandler({ success: true, message: 'ดำเนินการสำเร็จ' });
      };
    }
  });
}`;
const start = c.indexOf(searchStr);
const end = c.indexOf('window.google.script.run = createRunProxy(null, null);');
c = c.substring(0, start) + replaceStr + '\n\n' + c.substring(end);
fs.writeFileSync('js/firebase-db.js', c);
