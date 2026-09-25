const fs = require('fs');
let content = fs.readFileSync('js/app.js', 'utf8');

const oldOnLoad = `    window.onload = () => {
      const savedUser = sessionStorage.getItem('cf_user');
      if (savedUser) {
        try {
          currentUser = JSON.parse(savedUser);
          if (currentUser && currentUser.name && (currentUser.name.includes('ครูโอ๊ด') || currentUser.name.includes('ผู้ดูแลระบบ'))) {
            currentUser.name = 'คุณครูประจำชั้น';
            sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
          }
          updateUserNavUI();
        } catch(e) {
          currentUser = null;
        }
      } else {
        updateUserNavUI();
      }

      loadData();
    };`;

const newOnLoad = `    window.onload = () => {
      const savedUser = sessionStorage.getItem('cf_user');
      if (savedUser) {
        try {
          currentUser = JSON.parse(savedUser);
          updateUserNavUI();
          
          if (currentUser.role === 'super_admin') {
             document.getElementById('viewDashboard').classList.add('hidden-view');
             const vAdmin = document.getElementById('viewAdminDashboard');
             if (vAdmin) vAdmin.classList.remove('hidden-view');
             loadAdminData();
          } else if (currentUser.room_id) {
             const vAdmin = document.getElementById('viewAdminDashboard');
             if (vAdmin) vAdmin.classList.add('hidden-view');
             document.getElementById('viewDashboard').classList.remove('hidden-view');
             google.script.run.withSuccessHandler(() => {
                loadData();
             }).setRoomId(currentUser.room_id);
          } else {
             loadData();
          }
        } catch(e) {
          currentUser = null;
          updateUserNavUI();
          loadData();
        }
      } else {
        updateUserNavUI();
        loadData();
      }
    };`;

content = content.replace(oldOnLoad, newOnLoad);

const oldLogin = `          if (res.success) {
            currentUser = res.user;
            sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
            updateUserNavUI();
            closeModal('loginModal');`;

const newLogin = `          if (res.success) {
            currentUser = res.user;
            sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
            updateUserNavUI();
            closeModal('loginModal');
            
            if (currentUser.role === 'super_admin') {
               document.getElementById('viewDashboard').classList.add('hidden-view');
               const vAdmin = document.getElementById('viewAdminDashboard');
               if (vAdmin) vAdmin.classList.remove('hidden-view');
               loadAdminData();
            } else if (currentUser.room_id) {
               const vAdmin = document.getElementById('viewAdminDashboard');
               if (vAdmin) vAdmin.classList.add('hidden-view');
               document.getElementById('viewDashboard').classList.remove('hidden-view');
               google.script.run.withSuccessHandler(() => {
                  loadData();
               }).setRoomId(currentUser.room_id);
            }`;

content = content.replace(oldLogin, newLogin);
fs.writeFileSync('js/app.js', content);
console.log('Done');
