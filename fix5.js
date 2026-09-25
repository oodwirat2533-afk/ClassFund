const fs = require('fs');

const superAdminLogic = `
    // ==========================================
    // SUPER ADMIN LOGIC
    // ==========================================
    window.loadAdminData = function() {
      showLoader(true);
      google.script.run
        .withSuccessHandler(res => {
          showLoader(false);
          if(res.success) {
            renderAdminRooms(res.data);
          } else {
            Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลห้องได้', 'error');
          }
        })
        .getAllRooms();
    };

    window.renderAdminRooms = function(rooms) {
      const tbody = document.getElementById('adminRoomsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';
      if (rooms.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-slate-500">ยังไม่มีห้องเรียนในระบบ</td></tr>';
        return;
      }
      rooms.forEach(room => {
        tbody.innerHTML += \`
          <tr class="hover:bg-slate-50 border-b border-slate-100">
            <td class="px-4 py-3 font-semibold text-slate-800">\${room.name}</td>
            <td class="px-4 py-3 text-sm text-slate-600">\${room.teacher_name}</td>
            <td class="px-4 py-3 text-sm text-slate-500">\${new Date(room.created_at).toLocaleDateString('th-TH')}</td>
            <td class="px-4 py-3 text-right">
              <button onclick="copyRoomLink('\${room.room_id}')" class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 mr-1">
                📋 ก๊อปลิงก์
              </button>
              <button onclick="enterRoom('\${room.room_id}', '\${room.name}')" class="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-200">
                เข้าห้อง ➡
              </button>
            </td>
          </tr>
        \`;
      });
    };

    window.openCreateRoomModal = function() {
      document.getElementById('createRoomModal').classList.remove('hidden-view');
    };

    window.closeCreateRoomModal = function() {
      document.getElementById('createRoomModal').classList.add('hidden-view');
      document.getElementById('formCreateRoom').reset();
    };

    window.submitCreateRoom = function(e) {
      e.preventDefault();
      const payload = {
        room_name: document.getElementById('newRoomName').value,
        teacher_name: document.getElementById('newTeacherName').value,
        username: document.getElementById('newTeacherUser').value,
        academic_year: '2569',
        semester: '1'
      };
      showLoader(true);
      google.script.run
        .withSuccessHandler(res => {
          showLoader(false);
          if (res.success) {
            closeCreateRoomModal();
            Swal.fire('สำเร็จ', res.message, 'success');
            loadAdminData();
          } else {
            Swal.fire('Error', res.message, 'error');
          }
        })
        .createRoom(payload);
    };

    window.copyRoomLink = function(roomId) {
      const url = window.location.origin + window.location.pathname + '?room=' + roomId;
      navigator.clipboard.writeText(url).then(() => {
        Swal.fire({
          icon: 'success',
          title: 'คัดลอกลิงก์สำเร็จ!',
          text: 'นำลิงก์นี้ไปส่งให้คุณครูหรือนักเรียนในห้องได้เลยครับ',
          timer: 2000,
          showConfirmButton: false
        });
      });
    };
    
    window.enterRoom = function(roomId, roomName) {
      window.location.href = '?room=' + roomId;
    };

    window.exitRoom = function() {
      window.location.href = window.location.pathname;
    };
`;

fs.appendFileSync('js/app.js', superAdminLogic);
