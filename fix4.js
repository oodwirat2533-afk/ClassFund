const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');

const oldSuccess = `              if (res.success) {
                showCenterLoader('success', 'เข้าสู่ระบบสำเร็จ!');
                currentUser = res.user;
                sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
                closeModal('loginModal');
                document.getElementById('loginForm').reset();
                updateUserNavUI();
                renderDashboard();
                renderManageStudentsTable();
              } else {`;

const newSuccess = `              if (res.success) {
                showCenterLoader('success', 'เข้าสู่ระบบสำเร็จ!');
                currentUser = res.user;
                sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
                closeModal('loginModal');
                document.getElementById('loginForm').reset();
                updateUserNavUI();
                
                if (currentUser.role === 'super_admin') {
                   const urlParams = new URLSearchParams(window.location.search);
                   if (urlParams.get('room')) {
                      loadData();
                   } else {
                     document.getElementById('viewDashboard').classList.add('hidden-view');
                     const vAdmin = document.getElementById('viewAdminDashboard');
                     if (vAdmin) vAdmin.classList.remove('hidden-view');
                     loadAdminData();
                   }
                } else if (currentUser.room_id) {
                   const urlParams = new URLSearchParams(window.location.search);
                   if (urlParams.get('room') && urlParams.get('room') !== currentUser.room_id) {
                     Swal.fire('ข้อผิดพลาด', 'คุณไม่มีสิทธิ์เข้าถึงห้องนี้', 'error');
                     logout();
                     return;
                   }
                   if (!urlParams.get('room')) {
                     window.location.href = '?room=' + currentUser.room_id;
                     return;
                   }
                   
                   const vAdmin = document.getElementById('viewAdminDashboard');
                   if (vAdmin) vAdmin.classList.add('hidden-view');
                   document.getElementById('viewDashboard').classList.remove('hidden-view');
                   google.script.run.withSuccessHandler(() => {
                      loadData();
                   }).setRoomId(currentUser.room_id);
                } else {
                   loadData();
                }
              } else {`;

content = content.replace(oldSuccess, newSuccess);
fs.writeFileSync('js/app.js', content);
console.log(content.includes("if (currentUser.role === 'super_admin')") ? 'Success' : 'Failed');
