const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

if (!html.includes('id="btnReturnAdmin"')) {
  html = html.replace('<div id="navUserState"',
    `<button id="btnReturnAdmin" onclick="exitRoom()" class="hidden-view bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg text-xs font-bold mr-3 hover:bg-amber-200 transition-colors shadow-sm">
      ⬅️ ออกจากห้อง
    </button>\n            <div id="navUserState"`
  );
}

if (!html.includes('id="createRoomModal"')) {
  const modalHTML = `
  <!-- CREATE ROOM MODAL -->
  <div id="createRoomModal" class="hidden-view fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
      <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-white shrink-0">
        <h3 class="text-xl font-extrabold text-slate-800">✨ สร้างห้องเรียนใหม่</h3>
        <button type="button" onclick="closeCreateRoomModal()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
          ✕
        </button>
      </div>
      <div class="p-6 overflow-y-auto">
        <form id="formCreateRoom" onsubmit="submitCreateRoom(event)" class="space-y-4">
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">ชื่อห้องเรียน (เช่น ม.5/1)</label>
            <input type="text" id="newRoomName" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm font-medium">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">ชื่อ-นามสกุล ครูประจำห้อง</label>
            <input type="text" id="newTeacherName" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm font-medium">
          </div>
          <div>
            <label class="block text-xs font-bold text-slate-700 mb-1">รหัสผู้ใช้งาน (Username สำหรับล็อกอิน)</label>
            <input type="text" id="newTeacherUser" required class="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all text-sm font-medium">
            <p class="text-[10px] text-amber-600 mt-1">* รหัสผ่านตั้งต้นระบบจะกำหนดเป็น <b>123456</b> เสมอ</p>
          </div>
          <div class="pt-4 flex gap-3">
            <button type="button" onclick="closeCreateRoomModal()" class="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-colors">ยกเลิก</button>
            <button type="submit" class="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-all">บันทึก</button>
          </div>
        </form>
      </div>
    </div>
  </div>\n`;
  html = html.replace('<!-- ==================== MODALS ==================== -->', '<!-- ==================== MODALS ==================== -->' + modalHTML);
}
fs.writeFileSync('index.html', html);
console.log('HTML fixed');

let appJs = fs.readFileSync('js/app.js', 'utf8');
const oldRenderHeader = `    function renderHeaderInfo() {
      if (appData.settings) {
        document.getElementById('lblHeaderClassRoom').textContent = (appData.settings.class_name || 'ม.4/7') + ' เทอม ' + (appData.settings.current_semester || '1') + '/' + (appData.settings.current_academic_year || '2569');
        document.title = 'ClassFund System - ' + (appData.settings.class_name || 'ม.4/7') + ' โรงเรียนบรรหารแจ่มใสวิทยา 3';
      }
    }`;

const newRenderHeader = `    function renderHeaderInfo() {
      const urlParams = new URLSearchParams(window.location.search);
      const isRoom = !!urlParams.get('room');
      
      if (!isRoom) {
        document.getElementById('lblHeaderClassRoom').textContent = 'ClassFund System';
        document.getElementById('lblHeaderSchoolName').textContent = 'แผงควบคุมหลัก (Super Admin)';
        document.title = 'ClassFund System - Super Admin';
        return;
      }

      if (appData.settings) {
        document.getElementById('lblHeaderClassRoom').textContent = (appData.settings.class_name || 'ม.4/7') + ' เทอม ' + (appData.settings.current_semester || '1') + '/' + (appData.settings.current_academic_year || '2569');
        document.getElementById('lblHeaderSchoolName').textContent = 'โรงเรียนบรรหารแจ่มใสวิทยา 3';
        document.title = 'ClassFund System - ' + (appData.settings.class_name || 'ม.4/7') + ' โรงเรียนบรรหารแจ่มใสวิทยา 3';
      }
    }`;
appJs = appJs.replace(oldRenderHeader, newRenderHeader);
fs.writeFileSync('js/app.js', appJs);
console.log('JS fixed');
