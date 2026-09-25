const fs = require('fs');

// 1. Fix index.html
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace(
  '<p class="text-slate-500 text-xs \nmt-1">สำหรับคุณครูและเหรัญญิกประจำห้อง</p>',
  '<p id="loginModalSubtitle" class="text-slate-500 text-xs mt-1">สำหรับคุณครูและเหรัญญิกประจำห้อง</p>'
);
html = html.replace(
  '<p class="text-slate-500 text-xs mt-1">สำหรับคุณครูและเหรัญญิกประจำห้อง</p>',
  '<p id="loginModalSubtitle" class="text-slate-500 text-xs mt-1">สำหรับคุณครูและเหรัญญิกประจำห้อง</p>'
);
html = html.replace(
  /placeholder="เช่น admin หรือ รหัสเหรัญญิก"/g,
  'id="username" placeholder="เช่น admin หรือ รหัสเหรัญญิก"'
);
html = html.replace(
  /<div class="bg-blue-50\/50 border border-blue-100 rounded-xl p-3 text-\[10px\] sm:text-xs text-slate-500 flex items-start gap-2.5">[\s\S]*?<\/div>/,
  `<div id="loginModalInfo" class="bg-blue-50/50 border border-blue-100 rounded-xl p-3 text-[10px] sm:text-xs text-slate-500 flex items-start gap-2.5">
            ℹ️ สำหรับคุณครูและเหรัญญิกเท่านั้น (นักเรียนทั่วไปไม่สามารถดูยอดเงินและประวัติการชำระได้ที่หน้าหลัก)
          </div>`
);
fs.writeFileSync('index.html', html);

// 2. Fix handleLogin in app.js
let js = fs.readFileSync('js/app.js', 'utf8');
const handleLoginOld = `              if (res.success) {
                showCenterLoader('success', 'เข้าสู่ระบบสำเร็จ!');
                currentUser = res.user;`;
const handleLoginNew = `              if (res.success) {
                const u = res.user;
                const urlParams = new URLSearchParams(window.location.search);
                const isRoom = !!urlParams.get('room');
                if (!isRoom && u.role !== 'super_admin') {
                  showCenterLoader('error', 'ถูกปฏิเสธ', 'หน้านี้สงวนไว้สำหรับ Super Admin เท่านั้น! กรุณาเข้าสู่ระบบผ่านลิงก์ห้องเรียนของท่าน');
                  setTimeout(() => closeModal('loginModal'), 2500);
                  return;
                }
                showCenterLoader('success', 'เข้าสู่ระบบสำเร็จ!');
                currentUser = u;`;
if (js.includes(handleLoginOld)) {
    js = js.replace(handleLoginOld, handleLoginNew);
} else {
    console.log('Failed to patch handleLogin');
}

// 3. Fix window.onload in app.js
const onloadOld = `           const loginModal = document.getElementById('loginModal');
           if (loginModal) loginModal.classList.remove('hidden-view');`;
           
const onloadNew = `           const loginModal = document.getElementById('loginModal');
           if (loginModal) loginModal.classList.remove('hidden-view');
           
           const sub = document.getElementById('loginModalSubtitle');
           if (sub) sub.textContent = 'สำหรับผู้ดูแลระบบ (Super Admin) เท่านั้น';
           
           const info = document.getElementById('loginModalInfo');
           if (info) info.innerHTML = 'ℹ️ หน้านี้สำหรับ <b>Super Admin</b> เท่านั้น (คุณครูและเหรัญญิกกรุณาเข้าสู่ระบบผ่านลิงก์ห้องเรียนของท่าน)';
           
           const uInput = document.getElementById('username');
           if (uInput) uInput.placeholder = 'กรอก Username (เช่น superadmin)';`;
           
if (js.includes(onloadOld)) {
    js = js.replace(onloadOld, onloadNew);
} else {
    console.log('Failed to patch onload');
}

fs.writeFileSync('js/app.js', js);
console.log('Fixed everything');
