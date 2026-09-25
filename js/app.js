
    // === Global State ===
    let currentUser = null;
    
    // Catch HTML5 validation failures globally
    document.addEventListener('invalid', (function () {
      return function (e) {
        e.preventDefault();
        Swal.fire({
          icon: 'warning',
          title: 'ข้อมูลไม่ครบถ้วน',
          text: 'กรุณากรอกข้อมูลในช่องที่จำเป็นให้ครบถ้วน'
        });
        e.target.focus();
      };
    })(), true);

    let currentMainView = 'dashboard';
    let appData = {
      settings: { current_balance: 0, current_academic_year: '2569', fine_presets: [] },
      transactions: [],
      users: [],
      weeks: []
    };
    let chartInstance = null;
    let parsedExcelUsers = [];
    let txVisibleLimit = 5;
    let currentModalTxFilter = 'all';
    let currentModalTxSearch = '';

    const isMock = typeof google === 'undefined';

    // === Initialization ===
    window.onload = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const urlRoomId = urlParams.get('room');
      
      const savedUser = sessionStorage.getItem('cf_user');
      if (savedUser) {
        try { currentUser = JSON.parse(savedUser); } catch(e) { currentUser = null; }
      }

      if (urlRoomId) {
        // --- ROOM MODE ---
        google.script.run.withSuccessHandler(() => {
          document.getElementById('viewDashboard').classList.remove('hidden-view');
          const vAdmin = document.getElementById('viewAdminDashboard');
          if (vAdmin) vAdmin.classList.add('hidden-view');
          
          if (currentUser && currentUser.role !== 'super_admin' && currentUser.room_id !== urlRoomId) {
             // Wrong room for teacher
             currentUser = null;
             sessionStorage.removeItem('cf_user');
          }
          updateUserNavUI();
          loadData();
        }).setRoomId(urlRoomId);
      } else {
        // --- SUPER ADMIN PORTAL MODE ---
        document.getElementById('viewDashboard').classList.add('hidden-view');
        
        if (currentUser && currentUser.role === 'super_admin') {
           const vAdmin = document.getElementById('viewAdminDashboard');
           if (vAdmin) vAdmin.classList.remove('hidden-view');
           updateUserNavUI();
           loadAdminData();
        } else {
           currentUser = null;
           sessionStorage.removeItem('cf_user');
           updateUserNavUI();
           // Force login
           const loginModal = document.getElementById('loginModal');
           if (loginModal) loginModal.classList.remove('hidden-view');
        }
      }
    };

    // === View Switcher (Dashboard, Students Management, Collect Checklist) ===
    function switchMainView(view) {
      if (view === 'students' && (!currentUser || currentUser.role !== 'teacher')) {
        Swal.fire({
          icon: 'warning',
          title: 'จำกัดสิทธิ์การเข้าถึง',
          text: 'เฉพาะคุณครูประจำชั้นเท่านั้นที่สามารถเข้าจัดการรายชื่อนักเรียนได้ครับ'
        });
        return;
      }

      if (view === 'collect' && (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'treasurer'))) {
        Swal.fire({
          icon: 'warning',
          title: 'จำกัดสิทธิ์การเข้าถึง',
          text: 'เฉพาะคุณครูประจำชั้นหรือเหรัญญิกเท่านั้นที่สามารถเข้าหน้าเก็บเงินได้ครับ'
        });
        return;
      }

      currentMainView = view;
      const vDash = document.getElementById('viewDashboard');
      const vStud = document.getElementById('viewStudents');
      const vColl = document.getElementById('viewCollect');

      if (vDash) vDash.classList.add('hidden-view');
      if (vStud) vStud.classList.add('hidden-view');
      if (vColl) vColl.classList.add('hidden-view');

      if (view === 'dashboard') {
        if (vDash) vDash.classList.remove('hidden-view');
      } else if (view === 'students') {
        if (vStud) vStud.classList.remove('hidden-view');
        renderManageStudentsTable();
      } else if (view === 'collect') {
        if (vColl) vColl.classList.remove('hidden-view');
        initCollectView();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // === UI State Helpers ===
    let centerSyncTimeout = null;

    function showCenterLoader(type, title, subtitle, autoHideMs) {
      const overlay = document.getElementById('centerSyncOverlay');
      const card = document.getElementById('centerSyncCard');
      const iconBox = document.getElementById('centerSyncIconBox');
      const titleEl = document.getElementById('centerSyncTitle');
      const subEl = document.getElementById('centerSyncSubtitle');
      if (!overlay || !card || !iconBox || !titleEl || !subEl) return;

      if (centerSyncTimeout) {
        clearTimeout(centerSyncTimeout);
        centerSyncTimeout = null;
      }

      if (type === 'hide' || !type) {
        overlay.classList.remove('opacity-100', 'pointer-events-auto');
        overlay.classList.add('opacity-0', 'pointer-events-none');
        card.classList.remove('scale-100');
        card.classList.add('scale-90');
        return;
      }

      titleEl.textContent = title || 'กำลังดำเนินการ...';

      if (type === 'loading') {
        iconBox.className = "w-16 h-16 rounded-2xl flex items-center justify-center mb-3.5 transition-all duration-300 bg-blue-50 text-blue-600 shadow-inner";
        iconBox.innerHTML = `
          <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-85" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
        `;
        subEl.textContent = subtitle || 'กรุณารอสักครู่ ระบบกำลังประมวลผล';
        subEl.classList.remove('hidden-view');
      } else if (type === 'success') {
        iconBox.className = "w-16 h-16 rounded-2xl flex items-center justify-center mb-3.5 transition-all duration-300 bg-emerald-50 text-emerald-600 shadow-inner scale-105";
        iconBox.innerHTML = `
          <svg class="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
          </svg>
        `;
        if (subtitle) {
          subEl.textContent = subtitle;
          subEl.classList.remove('hidden-view');
        } else {
          subEl.textContent = '';
          subEl.classList.add('hidden-view');
        }
        autoHideMs = autoHideMs || 900;
      } else if (type === 'error') {
        iconBox.className = "w-16 h-16 rounded-2xl flex items-center justify-center mb-3.5 transition-all duration-300 bg-rose-50 text-rose-600 shadow-inner";
        iconBox.innerHTML = `
          <svg class="h-8 w-8 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        `;
        subEl.textContent = subtitle || 'กรุณาลองใหม่อีกครั้ง';
        subEl.classList.remove('hidden-view');
        autoHideMs = autoHideMs || 2500;
      }

      overlay.classList.remove('opacity-0', 'pointer-events-none');
      overlay.classList.add('opacity-100', 'pointer-events-auto');
      card.classList.remove('scale-90');
      card.classList.add('scale-100');

      if (autoHideMs) {
        centerSyncTimeout = setTimeout(() => {
          showCenterLoader('hide');
        }, autoHideMs);
      }
    }

    // Alias showSyncToast to showCenterLoader for seamless backward compatibility
    function showSyncToast(type, message, autoHideMs) {
      showCenterLoader(type, message, '', autoHideMs);
    }

    function showLoader(show) {
      const l = document.getElementById('fullLoader');
      if (show) {
        l.classList.remove('hidden-view');
        // Force browser repaint to show loader instantly before GAS execution
        void l.offsetWidth; 
      } else {
        l.classList.add('hidden-view');
      }
    }

    function lockScroll() {
      // Calculate scrollbar width to prevent layout shift
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = scrollbarWidth + 'px';
    }

    function unlockScroll() {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }

    function openModal(id) {
      if (id === 'weekModal') {
        cancelEditWeek();
        renderModalWeeksList();
      }
      document.getElementById(id).classList.remove('hidden-view');
      lockScroll();
    }
    
    function closeModal(id) {
      document.getElementById(id).classList.add('hidden-view');
      unlockScroll();
    }

    function initThaiDateSelectors() {
      const daySelects = ['wkStartDay', 'wkEndDay'];
      const yearSelects = ['wkStartYear', 'wkEndYear'];
      
      // Populate Days 1-31
      daySelects.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.children.length > 0) return;
        for (let d = 1; d <= 31; d++) {
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = String(d).padStart(2, '0');
          el.appendChild(opt);
        }
      });

      // Populate Years (e.g. 2567 - 2575)
      const currentYearAD = new Date().getFullYear();
      const currentYearBE = currentYearAD + 543;
      yearSelects.forEach(id => {
        const el = document.getElementById(id);
        if (!el || el.children.length > 0) return;
        for (let y = currentYearBE - 2; y <= currentYearBE + 5; y++) {
          const opt = document.createElement('option');
          opt.value = y;
          opt.textContent = y;
          if (y === currentYearBE) opt.selected = true;
          el.appendChild(opt);
        }
      });

      // Set default Start/End to today / upcoming Friday
      const now = new Date();
      const sDay = document.getElementById('wkStartDay');
      const sMonth = document.getElementById('wkStartMonth');
      const sYear = document.getElementById('wkStartYear');
      if (sDay) sDay.value = now.getDate();
      if (sMonth) sMonth.value = now.getMonth() + 1;
      if (sYear) sYear.value = currentYearBE;

      const endNow = new Date();
      endNow.setDate(now.getDate() + 4);
      const eDay = document.getElementById('wkEndDay');
      const eMonth = document.getElementById('wkEndMonth');
      const eYear = document.getElementById('wkEndYear');
      if (eDay) eDay.value = endNow.getDate();
      if (eMonth) eMonth.value = endNow.getMonth() + 1;
      if (eYear) eYear.value = endNow.getFullYear() + 543;
    }

    function switchUserTab(tab) {
      const btnExcel = document.getElementById('btnTabExcel');
      const btnManual = document.getElementById('btnTabManual');
      const tabExcel = document.getElementById('tabExcelContent');
      const tabManual = document.getElementById('tabManualContent');

      if (tab === 'excel') {
        btnExcel.className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-emerald-600 text-emerald-600 transition-colors flex items-center justify-center gap-1.5';
        btnManual.className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5';
        tabExcel.classList.remove('hidden-view');
        tabManual.classList.add('hidden-view');
      } else {
        btnManual.className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-slate-800 text-slate-800 transition-colors flex items-center justify-center gap-1.5';
        btnExcel.className = 'flex-1 pb-2.5 text-xs font-bold border-b-2 border-transparent text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center gap-1.5';
        tabManual.classList.remove('hidden-view');
        tabExcel.classList.add('hidden-view');
      }
    }

    function formatCurrency(amount) {
      const num = parseFloat(amount || 0);
      return num.toLocaleString('th-TH', { maximumFractionDigits: 2 }) + ' บาท';
    }

    function formatThaiDateBE(dateStr) {
      if (!dateStr) return '-';
      const clean = String(dateStr).split(' ')[0].split('T')[0];
      const parts = clean.split('-');
      if (parts.length === 3) {
        let y = parseInt(parts[0]);
        if (y < 2400) y += 543;
        const m = parts[1].padStart(2, '0');
        const d = parts[2].padStart(2, '0');
        return `${d}/${m}/${y}`;
      }
      return clean;
    }

    function formatThaiDateTimeBE(timestamp) {
      if (!timestamp) return '-';
      const str = String(timestamp).trim();
      const parts = str.split(' ');
      const datePart = parts[0].split('T')[0];
      const timePart = parts[1] || (parts[0].includes('T') ? parts[0].split('T')[1] : '');
      
      const dParts = datePart.split('-');
      if (dParts.length === 3) {
        let y = parseInt(dParts[0]);
        if (y < 2400) y += 543;
        const m = dParts[1].padStart(2, '0');
        const d = dParts[2].padStart(2, '0');
        const formattedTime = timePart ? ` ${timePart.slice(0, 5)}` : '';
        return `${d}/${m}/${y}${formattedTime}`;
      }
      return str;
    }

    function updateUserNavUI() {
      const navGuest = document.getElementById('navGuestState');
      const navUser = document.getElementById('navUserState');
      const studentBanner = document.getElementById('studentPersonalBanner');
      const btnExportExcel = document.getElementById('btnExportExcel');
      const navMenuAdminGroup = document.getElementById('navMenuAdminGroup');
      const navBtnManageStudents = document.getElementById('navBtnManageStudents');

      if (currentUser) {
        navGuest.classList.add('hidden-view');
        navUser.classList.remove('hidden-view');
        
        document.getElementById('navUserName').textContent = currentUser.name;
        const navDropdownUserName = document.getElementById('navDropdownUserName');
        if (navDropdownUserName) navDropdownUserName.textContent = currentUser.name;
        
        const badge = document.getElementById('navUserRoleBadge');
        const dropBadge = document.getElementById('navDropdownRoleBadge');

        let badgeText = '';
        let badgeClass = '';

        if (currentUser.role === 'teacher') {
          badgeText = 'ครูประจำชั้น';
          badgeClass = 'text-[11px] px-2 py-0.5 rounded-full font-semibold bg-purple-50 text-purple-700 border border-purple-200';
        } else if (currentUser.role === 'treasurer') {
          badgeText = 'เหรัญญิก';
          badgeClass = 'text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
        } else {
          badgeText = `นักเรียน (เลขที่ ${currentUser.student_number || '-'})`;
          badgeClass = 'text-[11px] px-2 py-0.5 rounded-full font-semibold bg-blue-50 text-blue-700 border border-blue-200';
        }

        if (badge) {
          badge.textContent = badgeText;
          badge.className = badgeClass;
        }
        if (dropBadge) {
          dropBadge.textContent = badgeText;
          dropBadge.className = badgeClass;
        }

        if (currentUser.role === 'teacher' || currentUser.role === 'treasurer') {
          if (navMenuAdminGroup) navMenuAdminGroup.classList.remove('hidden-view');
          if (btnExportExcel) btnExportExcel.classList.remove('hidden-view');
        } else {
          if (navMenuAdminGroup) navMenuAdminGroup.classList.add('hidden-view');
          if (btnExportExcel) btnExportExcel.classList.add('hidden-view');
          if (currentMainView === 'collect' || currentMainView === 'students') {
            switchMainView('dashboard');
          }
        }

        const navBtnChangePwd = document.getElementById('navBtnChangePwd');
        const navBtnChangePwdDivider = document.getElementById('navBtnChangePwdDivider');

        if (currentUser.role === 'teacher') {
          if (navBtnManageStudents) navBtnManageStudents.classList.remove('hidden-view');
          const navBtnClassSettings = document.getElementById('navBtnClassSettings');
          if (navBtnClassSettings) navBtnClassSettings.classList.remove('hidden-view');
        } else {
          if (navBtnManageStudents) navBtnManageStudents.classList.add('hidden-view');
          const navBtnClassSettings = document.getElementById('navBtnClassSettings');
          if (navBtnClassSettings) navBtnClassSettings.classList.add('hidden-view');
          if (currentMainView === 'students') {
            switchMainView('dashboard');
          }
        }

        if (currentUser.role === 'teacher' || currentUser.role === 'treasurer') {
          if (navBtnChangePwd) navBtnChangePwd.classList.remove('hidden-view');
          if (navBtnChangePwdDivider) navBtnChangePwdDivider.classList.remove('hidden-view');
        } else {
          if (navBtnChangePwd) navBtnChangePwd.classList.add('hidden-view');
          if (navBtnChangePwdDivider) navBtnChangePwdDivider.classList.add('hidden-view');
        }

        if (currentUser.role === 'student') {
          if (studentBanner) studentBanner.classList.remove('hidden-view');
          const lblWelcome = document.getElementById('lblStudentWelcome');
          if (lblWelcome) lblWelcome.textContent = `ยินดีต้อนรับ, ${currentUser.name} (เลขที่ ${currentUser.student_number || '-'})`;
        } else {
          if (studentBanner) studentBanner.classList.add('hidden-view');
        }

      } else {
        navGuest.classList.remove('hidden-view');
        navUser.classList.add('hidden-view');
        if (studentBanner) studentBanner.classList.add('hidden-view');
        if (btnExportExcel) btnExportExcel.classList.add('hidden-view');
        if (navMenuAdminGroup) navMenuAdminGroup.classList.add('hidden-view');
        if (navBtnManageStudents) navBtnManageStudents.classList.add('hidden-view');
        const navBtnClassSettings = document.getElementById('navBtnClassSettings');
        if (navBtnClassSettings) navBtnClassSettings.classList.add('hidden-view');
        const navBtnChangePwd = document.getElementById('navBtnChangePwd');
        const navBtnChangePwdDivider = document.getElementById('navBtnChangePwdDivider');
        if (navBtnChangePwd) navBtnChangePwd.classList.add('hidden-view');
        if (navBtnChangePwdDivider) navBtnChangePwdDivider.classList.add('hidden-view');
        closeNavDropdown();
        if (currentMainView === 'students' || currentMainView === 'collect') {
          switchMainView('dashboard');
        }
      }
    }

    function toggleNavDropdown(e) {
      if (e) e.stopPropagation();
      const menu = document.getElementById('navDropdownMenu');
      if (menu) {
        menu.classList.toggle('hidden-view');
        if (!menu.classList.contains('hidden-view')) {
          lockScroll();
        } else {
          unlockScroll();
        }
      }
    }

    function closeNavDropdown() {
      const menu = document.getElementById('navDropdownMenu');
      if (menu && !menu.classList.contains('hidden-view')) {
        menu.classList.add('hidden-view');
        unlockScroll();
      }
    }

    function handleMenuAction(action) {
      if (window.isCurrentTerm === false) {
        Swal.fire({ icon: 'warning', title: 'ไม่สามารถทำรายการได้', text: 'คุณกำลังอยู่ในโหมดดูประวัติย้อนหลัง (Read-Only) หากต้องการเพิ่มหรือแก้ไขข้อมูล กรุณาเลือกเทอมปัจจุบันครับ' });
        return;
      }
      closeNavDropdown();
      if (action === 'collect') switchMainView('collect');
      else if (action === 'students') switchMainView('students');
      else if (action === 'expense') openModal('expenseModal');
      else if (action === 'fine') openModal('fineModal');
      else if (action === 'week') openModal('weekModal');
      else if (action === 'settings') openClassSettingsModal();
      else if (action === 'rollover') openRolloverModal();
    }

    document.addEventListener('click', (e) => {
      const menu = document.getElementById('navDropdownMenu');
      const btn = document.getElementById('btnNavMenu');
      if (menu && !menu.classList.contains('hidden-view')) {
        if (btn && !btn.contains(e.target) && !menu.contains(e.target)) {
          closeNavDropdown();
        }
      }
    });


    // === Password Management ===
    function forgotPassword() {
      Swal.fire({
        icon: 'info',
        title: 'ลืมรหัสผ่าน?',
        html: '<div class="text-sm text-left"><p class="mb-2"><strong>สำหรับครู (แอดมิน):</strong></p><p class="mb-4">กรุณาจัดการรหัสผ่านในฐานข้อมูล <b>Firebase Console</b> หรือติดต่อผู้พัฒนาระบบ</p><p class="mb-2"><strong>สำหรับเหรัญญิก:</strong></p><p>กรุณาติดต่อคุณครูเพื่อทำการรีเซ็ตรหัสผ่านให้คุณใหม่</p></div>',
        confirmButtonText: 'เข้าใจแล้ว',
        confirmButtonColor: '#3b82f6'
      });
    }

    function openChangePasswordModal() {
      document.getElementById('oldPasswordInput').value = '';
      document.getElementById('newPasswordInput').value = '';
      document.getElementById('confirmNewPasswordInput').value = '';
      openModal('changePasswordModal');
    }

    function submitChangePassword(e) {
      e.preventDefault();
      const oldPwd = document.getElementById('oldPasswordInput').value;
      const newPwd = document.getElementById('newPasswordInput').value;
      const confirmPwd = document.getElementById('confirmNewPasswordInput').value;

      if (newPwd.length < 6) {
        Swal.fire({ icon: 'warning', title: 'รหัสผ่านสั้นเกินไป', text: 'รหัสผ่านใหม่ต้องมีความยาวขั้นต่ำ 6 ตัวอักษร' });
        return;
      }
      if (newPwd !== confirmPwd) {
        Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ตรงกัน', text: 'กรุณากรอกรหัสผ่านใหม่และยืนยันรหัสผ่านให้ตรงกัน' });
        return;
      }

      closeModal('changePasswordModal');
      showCenterLoader('loading', 'กำลังเปลี่ยนรหัสผ่าน...');

      google.script.run
        .withSuccessHandler((res) => {
          if (res.success) {
            showCenterLoader('success', 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว');
          } else {
            showCenterLoader('error', 'เปลี่ยนรหัสผ่านไม่สำเร็จ', res.message);
          }
        })
        .withFailureHandler((err) => {
          showCenterLoader('error', 'เกิดข้อผิดพลาด', err.message);
        })
        .changePassword(currentUser.student_id, oldPwd, newPwd);
    }
    // === Auth Functions ===
    function handleResetData(type) {
      const msg = type === 'all' 
        ? 'คุณกำลังจะลบข้อมูล "ทั้งหมด"<br>(รวมรายชื่อนักเรียน)<br><span class="text-rose-600 font-bold">ข้อมูลจะไม่สามารถกู้คืนได้!</span> ยืนยันหรือไม่?' 
        : 'คุณกำลังจะลบข้อมูล "การเงินและรอบทั้งหมด"<br>(รายชื่อนักเรียนจะคงอยู่)<br><span class="text-rose-600 font-bold">ข้อมูลจะไม่สามารถกู้คืนได้!</span> ยืนยันหรือไม่?';
      
      Swal.fire({
        title: 'ยืนยันการลบข้อมูล',
        html: msg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          showCenterLoader('loading', 'กำลังลบข้อมูล...');
          
          if (isMock) {
            setTimeout(() => {
              showCenterLoader('hide');
              Swal.fire('สำเร็จ', 'ข้อมูลถูกล้างเรียบร้อย (Mock)', 'success');
              if (type === 'all') appData.users = appData.users.filter(u => u.role === 'teacher');
              appData.transactions = [];
              appData.weeks = [];
              appData.settings.current_balance = 0;
              closeModal('classSettingsModal');
              renderDashboard();
            }, 800);
            return;
          }

          setTimeout(() => {
            google.script.run
              .withSuccessHandler(res => {
                showCenterLoader('hide');
                if (res.success) {
                  Swal.fire('สำเร็จ', res.message, 'success');
                  closeModal('classSettingsModal');
                  loadData(); // Reload everything fresh
                } else {
                  Swal.fire('เกิดข้อผิดพลาด', res.message, 'error');
                }
              })
              .withFailureHandler(err => {
                showCenterLoader('hide');
                Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
              })
              .resetSystemData(type);
          }, 50);
        }
      });
    }

    function handleLogin(e) {
      e.preventDefault();
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value.trim();
      
      showCenterLoader('loading', 'กำลังเข้าสู่ระบบ...', 'กำลังตรวจสอบข้อมูล...');

      if (isMock) {
        setTimeout(() => {
          showCenterLoader('hide');
          if (u !== 'admin' && u !== '54322') {
            Swal.fire({ icon: 'warning', title: 'เข้าสู่ระบบไม่สำเร็จ', text: 'ระบบเปิดให้เข้าสู่ระบบเฉพาะคุณครูและเหรัญญิกเท่านั้น (นักเรียนสามารถดูข้อมูลได้ที่หน้าหลัก)' });
            return;
          }
          currentUser = { 
            student_number: u === 'admin' ? 0 : 2,
            student_id: u, 
            name: u === 'admin' ? 'คุณครูประจำชั้น' : 'นางสาวสมหญิง สดใส (เหรัญญิก)', 
            role: u === 'admin' ? 'teacher' : 'treasurer' 
          };
          sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
          closeModal('loginModal');
          updateUserNavUI();
          renderDashboard();
          renderManageStudentsTable();
          Swal.fire({ icon: 'success', title: 'เข้าสู่ระบบสำเร็จ', timer: 1500, showConfirmButton: false });
        }, 600);
        return;
      }

      setTimeout(() => {
        google.script.run
          .withSuccessHandler(res => {
            if (res.success) {
              showCenterLoader('success', 'เข้าสู่ระบบสำเร็จ!');
              currentUser = res.user;
              sessionStorage.setItem('cf_user', JSON.stringify(currentUser));
              closeModal('loginModal');
              document.getElementById('loginForm').reset();
              updateUserNavUI();
              renderDashboard();
              renderManageStudentsTable();
            } else {
              showCenterLoader('error', 'เข้าสู่ระบบไม่สำเร็จ', res.message);
            }
          })
          .withFailureHandler(err => {
            showCenterLoader('error', 'เกิดข้อผิดพลาด', err.message);
          })
          .login(u, p);
      }, 50);
    }

    function logout() {
      Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        text: 'คุณต้องการออกจากระบบใช่หรือไม่?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          sessionStorage.removeItem('cf_user');
          currentUser = null;
          updateUserNavUI();
          renderDashboard();
          renderManageStudentsTable();
          switchMainView('dashboard');
          Swal.fire({ icon: 'success', title: 'ออกจากระบบเรียบร้อย', timer: 1200, showConfirmButton: false });
        }
      });
    }

    // === Data Fetching & Dashboard Render ===
    function loadData(silent = false) {
      if (!silent) {
        showLoader(true);
      }

      if (isMock) {
        setTimeout(() => {
          if (!silent) showLoader(false);
          appData = {
            settings: { current_balance: 320, current_academic_year: '2569', fine_presets: [{id:1, title:'ไม่ทำเขตพื้นที่', amount:20}, {id:2, title:'เล่นโทรศัพท์ในแถว', amount:5}] },
            transactions: [
              { tx_id: 'TX-1', timestamp: '2026-08-26 08:30', student_id: '54321', type: 'income', amount: 20, description: 'ครั้งที่ 1', recorded_by: 'นายสมชาย' },
              { tx_id: 'TX-2', timestamp: '2026-08-26 09:00', student_id: 'ROOM', type: 'expense', amount: 60, description: 'ซื้อแปลงลบกระดาน', recorded_by: 'คุณครูประจำชั้น' }
            ],
            users: [
              { student_number: 0, student_id: 'admin', name: 'คุณครูประจำชั้น', role: 'teacher', total_paid: 0 },
              { student_number: 1, student_id: '54321', name: 'นายสมชาย สายเปย์', role: 'student', total_paid: 80 },
              { student_number: 2, student_id: '54322', name: 'นางสาวสมหญิง สดใส', role: 'treasurer', total_paid: 20 }
            ],
            weeks: [
              { week_id: 'W1_2569', week_number: 1, start_date: '2026-05-18', end_date: '2026-05-22', amount_target: 20, academic_year: '2569' },
              { week_id: 'W2_2569', week_number: 2, start_date: '2026-05-25', end_date: '2026-05-29', amount_target: 20, academic_year: '2569' }
            ]
          };
          renderDashboard();
          renderManageStudentsTable();
          populateSelects();
        }, 500);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (!silent) showLoader(false);
          if (res.success) {
            window.rawAppData = JSON.parse(JSON.stringify(res.data));
            
            const termsSet = new Set();
            termsSet.add((res.data.settings.current_semester || '1') + '/' + (res.data.settings.current_academic_year || '2569'));
            
            res.data.transactions.forEach(t => {
              if (t.semester && t.academic_year) termsSet.add(t.semester + '/' + t.academic_year);
            });
            res.data.weeks.forEach(w => {
              if (w.semester && w.academic_year) termsSet.add(w.semester + '/' + w.academic_year);
            });
            
            window.availableTerms = Array.from(termsSet).sort((a,b) => {
               const [semA, yearA] = a.split('/');
               const [semB, yearB] = b.split('/');
               if (yearA !== yearB) return parseInt(yearB) - parseInt(yearA);
               return parseInt(semB) - parseInt(semA);
            });
            
            const sel = document.getElementById('selHistoryTerm');
            if (sel) {
              if (window.availableTerms.length > 1) {
                sel.classList.remove('hidden-view');
                sel.innerHTML = window.availableTerms.map(t => '<option value="' + t + '">เทอม ' + t + '</option>').join('');
                if (!window.currentViewTerm) window.currentViewTerm = window.availableTerms[0];
                sel.value = window.currentViewTerm;
              } else {
                sel.classList.add('hidden-view');
                window.currentViewTerm = window.availableTerms[0];
              }
            }
            
            applyHistoryFilter();
            
            renderManageStudentsTable();
            populateSelects();
            initCollectView();
          } else {
            Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: res.message });
          }
        })
        .withFailureHandler(err => {
          if (!silent) showLoader(false);
          Swal.fire({ icon: 'error', title: 'Server Error', text: err.message });
        })
        .getDashboardData(currentUser ? currentUser.role : 'guest', currentUser ? currentUser.student_id : '');
    }

    window.loadHistoryTerm = function() {
      const sel = document.getElementById('selHistoryTerm');
      if (sel) {
        window.currentViewTerm = sel.value;
        applyHistoryFilter();
      }
    };

    function applyHistoryFilter() {
      if (!window.rawAppData) return;
      appData = JSON.parse(JSON.stringify(window.rawAppData));
      
      if (!window.currentViewTerm) return;
      
      const parts = window.currentViewTerm.split('/');
      const vSem = parts[0];
      const vYear = parts[1];
      window.isCurrentTerm = (vSem === String(appData.settings.current_semester) && vYear === String(appData.settings.current_academic_year));
      
      appData.transactions = appData.transactions.filter(t => String(t.semester) === vSem && String(t.academic_year) === vYear);
      appData.weeks = appData.weeks.filter(w => String(w.semester) === vSem && String(w.academic_year) === vYear);
      
      if (!window.isCurrentTerm) {
         let histBal = 0;
         appData.transactions.forEach(t => {
           let amt = parseFloat(t.amount) || 0;
           if (t.type === 'income' || t.type === 'fine' || t.type === 'other') histBal += amt;
           if (t.type === 'expense') histBal -= amt;
         });
         appData.settings.current_balance = histBal;
         
         appData.users.forEach(u => {
           let paid = 0;
           appData.transactions.forEach(t => {
             if (t.type === 'income' && String(t.student_id) === String(u.student_id) && !t.isRollover) {
               paid += parseFloat(t.amount) || 0;
             }
           });
           u.total_paid = paid;
         });
      }
      
      renderDashboard();
    }

    function renderHeaderInfo() {
      const clsName = (appData.settings && appData.settings.class_name) ? appData.settings.class_name : 'ม.4/7';
      const schName = (appData.settings && appData.settings.school_name) ? appData.settings.school_name : 'โรงเรียนบรรหารแจ่มใสวิทยา 3';
      const semStr = (appData.settings && appData.settings.current_semester) ? appData.settings.current_semester : "1";
      const yrStr = (appData.settings && appData.settings.current_academic_year) ? appData.settings.current_academic_year : "2569";
      const fullClassStr = `${clsName} ภาคเรียนที่ ${semStr}/${yrStr}`;

      const lblClass = document.getElementById('lblHeaderClassRoom');
      if (lblClass) lblClass.textContent = fullClassStr;

      const lblSchool = document.getElementById('lblHeaderSchoolName');
      if (lblSchool) lblSchool.textContent = schName;

      const lblManage = document.getElementById('lblClassRoomManage');
      if (lblManage) lblManage.textContent = fullClassStr;

      const lblFooterClass = document.getElementById('lblFooterClassRoom');
      if (lblFooterClass) lblFooterClass.textContent = clsName;

      const lblFooterSchool = document.getElementById('lblFooterSchoolName');
      if (lblFooterSchool) lblFooterSchool.textContent = schName;

      const lblCollectTitle = document.getElementById('lblCollectTitle');
      if (lblCollectTitle) {
        if (appData.settings && appData.settings.current_semester && appData.settings.current_academic_year) {
          lblCollectTitle.textContent = `เช็คชื่อเก็บเงินประจำงวด ภาคเรียนที่ ${appData.settings.current_semester}/${appData.settings.current_academic_year}`;
        } else {
          lblCollectTitle.textContent = 'เช็คชื่อเก็บเงินประจำงวด';
        }
      }

      document.title = `ClassFund System - ${clsName} ${schName}`;
    }

    function openClassSettingsModal() {
      document.getElementById('setClassName').value = (appData.settings && appData.settings.class_name) ? appData.settings.class_name : 'ม.4/7';
      document.getElementById('setSchoolName').value = (appData.settings && appData.settings.school_name) ? appData.settings.school_name : 'โรงเรียนบรรหารแจ่มใสวิทยา 3';
      document.getElementById('setSemester').value = (appData.settings && appData.settings.current_semester) ? appData.settings.current_semester : '1';
      document.getElementById('setAcademicYear').value = (appData.settings && appData.settings.current_academic_year) ? appData.settings.current_academic_year : '2569';
      openModal('classSettingsModal');
    }

    function submitClassSettings(e) {
      e.preventDefault();
      const clsName = document.getElementById('setClassName').value.trim();
      const schName = document.getElementById('setSchoolName').value.trim();
      const semester = document.getElementById('setSemester').value.trim();
      const acadYear = document.getElementById('setAcademicYear').value.trim();

      if (!clsName) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกระดับชั้น/ห้องเรียน' });
        return;
      }

      closeModal('classSettingsModal');
      showSyncToast('loading', 'กำลังบันทึกการตั้งค่าห้องเรียน...');

      if (isMock) {
        setTimeout(() => {
          appData.settings.class_name = clsName;
          appData.settings.school_name = schName;
          appData.settings.current_semester = semester;
          appData.settings.current_academic_year = acadYear;
          renderHeaderInfo();
          renderDashboard();
          showSyncToast('success', 'บันทึกการตั้งค่าห้องเรียนเรียบร้อยแล้ว');
        }, 400);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            appData.settings = res.settings;
            renderHeaderInfo();
            renderDashboard();
            showSyncToast('success', 'บันทึกการตั้งค่าห้องเรียนเรียบร้อยแล้ว');
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการบันทึก');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'Server Error: ' + err.message);
        })
        .updateClassSettings(clsName, schName, acadYear, semester, currentUser ? currentUser.name : '');
    }

    // === Rollover and Auto-Archive System ===
    function openRolloverModal() {
      const settings = appData.settings || {};
      const curClass = settings.class_name || 'ม.4/7';
      const curSem = String(settings.current_semester || '1');
      const curYear = parseInt(settings.current_academic_year) || (new Date().getFullYear() + 543);
      const curBal = parseFloat(settings.current_balance) || 0;

      const roBadge = document.getElementById('roCurrentBadge');
      if (roBadge) roBadge.textContent = `${curClass} ภาคเรียนที่ ${curSem}/${curYear}`;
      
      const roCarry = document.getElementById('roCarryBalance');
      if (roCarry) roCarry.textContent = formatCurrency(curBal);

      // Auto suggest next term
      let nextClass = curClass;
      let nextSem = '1';
      let nextYear = curYear;

      if (curSem === '1') {
        nextSem = '2';
        nextYear = curYear;
        nextClass = curClass;
      } else {
        // If current term is semester 2, suggest semester 1 of next year and advance class e.g. ม.4/7 -> ม.5/7
        nextSem = '1';
        nextYear = curYear + 1;
        const match = curClass.match(/(ม\.?)(\d+)(\/.*)/);
        if (match) {
          const nextGrade = parseInt(match[2]) + 1;
          nextClass = `${match[1]}${nextGrade}${match[3]}`;
        }
      }

      document.getElementById('roNewClassName').value = nextClass;
      document.getElementById('roNewSemester').value = nextSem;
      document.getElementById('roNewAcademicYear').value = nextYear;

      const cleanClass = curClass.replace(/[\/\\?*:[\]]/g, '-');
      const roPreview = document.getElementById('roPreviewSheetName');
      if (roPreview) roPreview.textContent = `ประวัติ_${cleanClass}_ปี${curYear}_เทอม${curSem}`;

      openModal('rolloverModal');
    }

    function submitRollover(e) {
      e.preventDefault();
      const newClass = document.getElementById('roNewClassName').value.trim();
      const newSem = document.getElementById('roNewSemester').value.trim();
      const newYear = document.getElementById('roNewAcademicYear').value.trim();
      const curBal = parseFloat(appData.settings?.current_balance) || 0;

      if (!newClass || !newYear) {
        Swal.fire({ icon: 'warning', title: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
        return;
      }

      Swal.fire({
        title: 'ยืนยันเลื่อนชั้น / ขึ้นภาคเรียนใหม่?',
        html: `
          <div class="text-sm text-slate-600 text-left bg-slate-50 p-4 rounded-2xl space-y-2 border border-slate-200">
            <p>🎯 <strong>ระดับชั้นใหม่:</strong> <span class="text-indigo-600 font-bold">${newClass}</span></p>
            <p>📅 <strong>ภาคเรียนใหม่:</strong> ภาคเรียนที่ ${newSem}/${newYear}</p>
            <p>💰 <strong>ยกยอดเงินคงเหลือไป:</strong> <span class="text-emerald-600 font-bold">${formatCurrency(curBal)}</span> (อัตโนมัติ 100%)</p>
            <div class="pt-2 border-t border-slate-200 text-xs text-slate-500 space-y-1">
              <p>📁 <strong>ประวัติย้อนหลัง:</strong> ข้อมูลเทอมนี้จะถูกเก็บไว้บน Cloud ถาวร (สามารถเลือกดูทีหลังได้)</p>
              <p>👥 <strong>รายชื่อนักเรียน:</strong> จะคงอยู่ครบทุกคน ไม่ต้องกรอกใหม่</p>
            </div>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#4f46e5',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: '🚀 ยืนยันและดำเนินการ',
        cancelButtonText: 'ยกเลิก'
      }).then(result => {
        if (result.isConfirmed) {
          closeModal('rolloverModal');
          showCenterLoader('loading', 'กำลังจัดเก็บข้อมูลและเริ่มภาคเรียนใหม่...', 'กำลังยกยอดเงินและรีเซ็ตตาราง...');

          if (isMock) {
            setTimeout(() => {
              showCenterLoader('hide');
              appData.settings.class_name = newClass;
              appData.settings.current_academic_year = newYear;
              appData.settings.current_semester = newSem;
              appData.transactions = [];
              appData.weeks = [];
              if (curBal > 0) {
                appData.transactions.push({
                  tx_id: 'TX-ROLLOVER-' + Date.now(),
                  student_id: 'ROOM',
                  week_id: '',
                  academic_year: newYear,
                  amount: curBal,
                  type: 'income',
                  description: `ยอดยกมาจากเทอมเดิม`,
                  timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                  recorded_by: currentUser ? currentUser.name : 'คุณครูประจำชั้น'
                });
              }
              appData.users.forEach(u => u.total_paid = 0);
              renderHeaderInfo();
              renderDashboard();
              Swal.fire({
                icon: 'success',
                title: 'เลื่อนชั้น/ขึ้นภาคเรียนใหม่สำเร็จ! (Mock)',
                text: `จัดเก็บข้อมูลลงระบบ Cloud เรียบร้อย และยกยอดเงินคงเหลือ ${formatCurrency(curBal)} ไปเป็นยอดเริ่มต้นให้อัตโนมัติ`
              });
            }, 1000);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              showCenterLoader('hide');
              if (res.success) {
                Swal.fire({
                  icon: 'success',
                  title: 'เลื่อนชั้น/ขึ้นภาคเรียนใหม่สำเร็จ!',
                  html: `
                    <p class="text-sm text-slate-600 mb-3">${res.message}</p>
                    <div class="bg-indigo-50 border border-indigo-200 rounded-2xl p-3.5 text-xs text-indigo-900 text-left space-y-1.5">
                      <p>📁 <strong>ประวัติย้อนหลัง:</strong> ถูกจัดเก็บแยกเป็นหมวดหมู่ <b>${newSem}/${newYear}</b> บน Cloud อย่างปลอดภัย</p>
                      <p>💰 <strong>ยอดยกมาเริ่มต้น:</strong> <span class="text-emerald-700 font-bold">${formatCurrency(res.carriedBalance)}</span> (บันทึกเป็นรายรับให้อัตโนมัติ)</p>
                      <p>👥 <strong>รายชื่อนักเรียน:</strong> คงอยู่ครบทั้งหมด และตั้งต้นยอดสะสมใหม่เรียบร้อย</p>
                    </div>
                  `,
                  confirmButtonColor: '#4f46e5'
                });
                loadData(true);
              } else {
                Swal.fire({
                  icon: 'error',
                  title: 'เกิดข้อผิดพลาด',
                  text: res.message
                });
              }
            })
            .withFailureHandler(err => {
              showCenterLoader('hide');
              Swal.fire({
                icon: 'error',
                title: 'Server Error',
                text: err.message
              });
            })
            .rollOverSemester(newClass, newYear, newSem, currentUser ? currentUser.name : 'คุณครูประจำชั้น');
        }
      });
    }

    function renderDashboard() {
      renderHeaderInfo();
      const lblYear = document.getElementById('lblAcademicYear');
      if (lblYear) lblYear.textContent = appData.settings.current_academic_year || '2569';
      document.getElementById('lblBalance').textContent = formatCurrency(appData.settings.current_balance);
      
      let totalIncome = 0;
      let totalExpense = 0;
      appData.transactions.forEach(t => {
        let amt = parseFloat(t.amount) || 0;
        if (t.type === 'income' || t.type === 'fine') totalIncome += amt;
        if (t.type === 'expense') totalExpense += amt;
      });

      document.getElementById('lblIncome').textContent = formatCurrency(totalIncome);
      document.getElementById('lblExpense').textContent = formatCurrency(totalExpense);

      if (currentUser && currentUser.role === 'student') {
        const myData = appData.users.find(u => String(u.student_id) === String(currentUser.student_id));
        if (myData) {
          document.getElementById('lblMyTotalPaid').textContent = formatCurrency(myData.total_paid);
        }
      }

      renderStudentsTable();
      renderTransactionsTable();
      renderChart();
      renderUnpaidWeeks();
      renderModalWeeksList();
    }
    
    let currentEditWeekId = null;

    function handleEditWeek(weekId) {
      const w = appData.weeks.find(x => x.week_id === weekId);
      if (!w) return;
      currentEditWeekId = weekId;
      
      initThaiDateSelectors();
      
      // Parse start_date
      const sd = new Date(w.start_date);
      if (!isNaN(sd.getTime())) {
        document.getElementById('wkStartDay').value = sd.getDate();
        document.getElementById('wkStartMonth').value = sd.getMonth() + 1;
        document.getElementById('wkStartYear').value = sd.getFullYear() + 543;
      }
      
      // Parse end_date
      const ed = new Date(w.end_date);
      if (!isNaN(ed.getTime())) {
        document.getElementById('wkEndDay').value = ed.getDate();
        document.getElementById('wkEndMonth').value = ed.getMonth() + 1;
        document.getElementById('wkEndYear').value = ed.getFullYear() + 543;
      }
      
      document.getElementById('wkNumber').value = w.week_number;
      
      const wkAmountEl = document.getElementById('wkAmount');
      if (wkAmountEl) {
        wkAmountEl.value = w.amount_target;
        wkAmountEl.readOnly = true;
        wkAmountEl.className = "w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl outline-none text-sm font-bold text-slate-800 cursor-not-allowed";
      }

      const titleEl = document.getElementById('lblWeekModalTitle');
      if (titleEl) titleEl.textContent = `✏️ แก้ไขครั้งที่ ${w.week_number}`;
      const subEl = document.getElementById('lblWeekModalSubtitle');
      if (subEl) subEl.textContent = 'แก้ไขช่วงวันที่ของรอบนี้ (ล็อกยอดเงินเป้าหมาย)';
      const btnSub = document.getElementById('btnSubmitWeek');
      if (btnSub) btnSub.textContent = `บันทึกการแก้ไขครั้งที่ ${w.week_number}`;
      const btnCancel = document.getElementById('btnCancelEditWeek');
      if (btnCancel) btnCancel.classList.remove('hidden-view');
      
      const modal = document.getElementById('weekModal');
      if (modal && modal.classList.contains('hidden-view')) {
        modal.classList.remove('hidden-view');
        lockScroll();
      }
      modal.scrollTop = 0;
    }

    function cancelEditWeek() {
      currentEditWeekId = null;
      initThaiDateSelectors();

      let nextWk = 1;
      let defaultAmount = 20;
      if (typeof appData !== 'undefined' && appData.weeks && appData.weeks.length > 0) {
        const currentAcdYear = appData.settings?.current_academic_year || '2569';
        const currentSem = appData.settings?.current_semester || '1';
        const currentWeeks = appData.weeks.filter(w => String(w.academic_year) === String(currentAcdYear) && String(w.semester || "1") === String(currentSem));
        
        if (currentWeeks.length > 0) {
          const maxNum = Math.max(...currentWeeks.map(w => parseInt(w.week_number) || 0));
          if (maxNum > 0) {
            nextWk = maxNum + 1;
            const latestWkObj = currentWeeks.find(w => parseInt(w.week_number) === maxNum);
            if (latestWkObj && latestWkObj.amount_target) {
              defaultAmount = latestWkObj.amount_target;
            }
          }
        }
      }
      const wkNumEl = document.getElementById('wkNumber');
      if (wkNumEl) wkNumEl.value = nextWk;

      const wkAmountEl = document.getElementById('wkAmount');
      if (wkAmountEl) {
        wkAmountEl.value = defaultAmount;
        wkAmountEl.readOnly = false;
        wkAmountEl.className = "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold text-slate-800";
      }

      const titleEl = document.getElementById('lblWeekModalTitle');
      if (titleEl) titleEl.textContent = 'เพิ่มรอบเก็บเงินใหม่';
      const subEl = document.getElementById('lblWeekModalSubtitle');
      if (subEl) subEl.textContent = 'กำหนดรอบการเก็บเงินห้องเรียน';
      const btnSub = document.getElementById('btnSubmitWeek');
      if (btnSub) btnSub.textContent = 'บันทึกรอบใหม่';
      const btnCancel = document.getElementById('btnCancelEditWeek');
      if (btnCancel) btnCancel.classList.add('hidden-view');
    }

    function renderModalWeeksList() {
      const modalList = document.getElementById('modalWeeksList');
      const countEl = document.getElementById('lblModalWeekCount');
      if (!modalList) return;

      modalList.innerHTML = '';
      const currentAcdYear = appData.settings?.current_academic_year || '2569';
      const currentSem = appData.settings?.current_semester || '1';
      const currentWeeks = (appData.weeks || []).filter(w => String(w.academic_year) === String(currentAcdYear) && String(w.semester || "1") === String(currentSem));

      if (countEl) countEl.textContent = `${currentWeeks.length} รอบ`;

      // Auto update next week number and default amount if in create mode
      if (!currentEditWeekId) {
        let nextWk = 1;
        let defaultAmount = 20; // Default amount fallback
        if (currentWeeks.length > 0) {
          const maxNum = Math.max(...currentWeeks.map(w => parseInt(w.week_number) || 0));
          if (maxNum > 0) {
            nextWk = maxNum + 1;
            const latestWkObj = currentWeeks.find(w => parseInt(w.week_number) === maxNum);
            if (latestWkObj && latestWkObj.amount_target) {
              defaultAmount = latestWkObj.amount_target;
            }
          }
        }
        const wkNumEl = document.getElementById('wkNumber');
        if (wkNumEl) wkNumEl.value = nextWk;
        const wkAmountEl = document.getElementById('wkAmount');
        if (wkAmountEl) wkAmountEl.value = defaultAmount;
      }

      if (currentWeeks.length === 0) {
        modalList.innerHTML = '<p class="text-xs text-slate-400 py-4 text-center">ยังไม่มีข้อมูลรอบเก็บเงินในเทอมนี้</p>';
        return;
      }

      const sortedWeeks = [...currentWeeks].sort((a, b) => (parseInt(b.week_number) || 0) - (parseInt(a.week_number) || 0));

      sortedWeeks.forEach(w => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200/80 hover:bg-slate-100/70 transition-colors gap-2';

        let adminActions = '';
        if (currentUser && currentUser.role === 'teacher') {
          adminActions = `
            <div class="flex items-center gap-1.5 shrink-0">
              <button type="button" onclick="handleEditWeek('${w.week_id}')" class="text-xs text-blue-700 bg-blue-100 hover:bg-blue-200 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer">✏️ แก้ไข</button>
              <button type="button" onclick="handleDeleteWeek('${w.week_id}')" class="text-xs text-rose-700 bg-rose-100 hover:bg-rose-200 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer">🗑️ ลบ</button>
            </div>
          `;
        }

        item.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-slate-800">ครั้งที่ ${w.week_number}</span>
              <span class="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">฿${w.amount_target} / คน</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5 truncate">🗓️ ${formatThaiDateBE(w.start_date)} ถึง ${formatThaiDateBE(w.end_date)}</p>
          </div>
          ${adminActions}
        `;
        modalList.appendChild(item);
      });
    }

    function handleDeleteWeek(weekId) {
      Swal.fire({
        title: 'ยืนยันการลบรอบ?',
        text: "ลบรอบนี้และข้อมูลการเก็บเงินทั้งหมดที่เกี่ยวข้องหรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ลบข้อมูล',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          showSyncToast('loading', 'กำลังลบรอบเก็บเงิน...');
          
          if (isMock) {
            setTimeout(() => {
              appData.weeks = (appData.weeks || []).filter(w => w.week_id !== weekId);
              cancelEditWeek();
              renderModalWeeksList();
              renderDashboard();
              showSyncToast('success', 'ลบรอบเก็บเงินเรียบร้อยแล้ว');
            }, 400);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              if (res.success) {
                appData.weeks = (appData.weeks || []).filter(w => w.week_id !== weekId);
                cancelEditWeek();
                renderModalWeeksList();
                showSyncToast('success', res.message || 'ลบรอบเก็บเงินเรียบร้อยแล้ว');
                loadData(true);
              } else {
                showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการลบรอบ');
              }
            })
            .withFailureHandler(err => {
              showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
            })
            .deleteWeek(weekId);
        }
      });
    }

    function renderStudentsTable(searchQuery = '') {
      const tbody = document.getElementById('studentsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const students = appData.users
        .filter(u => u.role === 'student' || u.role === 'treasurer')
        .sort((a, b) => (parseInt(a.student_number) || 999) - (parseInt(b.student_number) || 999));

      const filtered = students.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return String(s.student_number || '').toLowerCase().includes(q) ||
               String(s.student_id || '').toLowerCase().includes(q) || 
               String(s.name || '').toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-xs text-slate-400">ไม่พบรายชื่อนักเรียน</td></tr>`;
        return;
      }

      filtered.forEach(s => {
        const totalPaid = parseFloat(s.total_paid) || 0;
        let statusBadge = totalPaid > 0 
          ? `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-emerald-50 text-emerald-700 border border-emerald-200">จ่ายแล้ว</span>`
          : `<span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-50 text-rose-700 border border-rose-200">ยังไม่มียอด</span>`;

        const sNumber = s.student_number ? s.student_number : '-';
        
        let roleBadge = '';
        if (s.role === 'treasurer') {
          roleBadge = `<span class="hidden sm:inline-flex text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-medium ml-1.5 items-center gap-0.5">💼 เหรัญญิก</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition-colors';
        tr.innerHTML = `
          <td class="px-6 py-3.5 text-center font-bold text-blue-600 bg-blue-50/30 rounded-xl">${sNumber}</td>
          <td class="px-6 py-3.5 font-mono text-xs font-bold text-slate-700">${s.student_id}</td>
          <td class="px-6 py-3.5 font-medium text-slate-800">${s.name} ${roleBadge}</td>
          <td class="px-6 py-3.5 text-right font-bold text-emerald-600">${formatCurrency(totalPaid)}</td>
          <td class="px-6 py-3.5 text-center">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function filterStudentsTable() {
      const q = document.getElementById('searchStudentInput').value;
      renderStudentsTable(q);
    }

    // === Render Dedicated Student Management View ===
    function renderManageStudentsTable(searchQuery = '') {
      const tbody = document.getElementById('manageStudentsTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const students = appData.users
        .filter(u => u.role === 'student' || u.role === 'treasurer')
        .sort((a, b) => (parseInt(a.student_number) || 999) - (parseInt(b.student_number) || 999));

      const treasurersCount = students.filter(s => s.role === 'treasurer').length;
      document.getElementById('lblTotalStudentsBadge').textContent = `${students.length} คน`;
      document.getElementById('lblTotalTreasurersBadge').textContent = `${treasurersCount} เหรัญญิก`;

      const filtered = students.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return String(s.student_number || '').toLowerCase().includes(q) ||
               String(s.student_id || '').toLowerCase().includes(q) || 
               String(s.name || '').toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-8 text-center text-xs text-slate-400">ไม่พบข้อมูลนักเรียน</td></tr>`;
        return;
      }

      const isTeacher = (currentUser && currentUser.role === 'teacher');

      filtered.forEach(s => {
        const totalPaid = parseFloat(s.total_paid) || 0;
        const sNumber = s.student_number ? s.student_number : '-';
        const isTrs = (s.role === 'treasurer');

        let roleBadge = isTrs 
          ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">💼 เหรัญญิก</span>`
          : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">👤 นักเรียน</span>`;

        let actionButtons = '';
        if (isTeacher) {
          actionButtons = `
            <div class="flex flex-col xl:flex-row items-center justify-center gap-1 sm:gap-1.5">
              <button onclick="openTreasurerModal('${s.student_id}')" title="${isTrs ? 'แก้ไขรหัส/ปรับสิทธิ์' : 'แต่งตั้งเป็นเหรัญญิก'}" class="px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold ${isTrs ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'} transition-all flex items-center gap-1 cursor-pointer w-full sm:w-auto justify-center">
                ${isTrs ? '⚙️' : '👑'}<span class="hidden sm:inline">${isTrs ? ' ปรับสิทธิ์' : ' แต่งตั้ง'}</span>
              </button>
              <div class="flex items-center justify-center gap-1 sm:gap-1.5 w-full sm:w-auto">
                ${isTrs ? `<button onclick="confirmResetPassword('${s.student_id}', '${s.name}')" title="รีเซ็ตรหัสผ่านกลับเป็น 123456" class="p-1 sm:p-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300 transition-all cursor-pointer flex-1 sm:flex-none">🔑</button>` : ''}
                <button onclick="openEditStudentModal('${s.student_id}')" title="แก้ไขข้อมูล" class="p-1 sm:p-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-all cursor-pointer flex-1 sm:flex-none">
                  ✏️
                </button>
                <button onclick="confirmDeleteStudent('${s.student_id}', '${s.name}')" title="ลบรายชื่อ" class="p-1 sm:p-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition-all cursor-pointer flex-1 sm:flex-none">
                  🗑️
                </button>
              </div>
            </div>
          `;
        } else {
          actionButtons = `<span class="text-[10px] sm:text-xs text-slate-400">- ครูประจำชั้นเท่านั้น -</span>`;
        }

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-slate-50/80 transition-colors';
        tr.innerHTML = `
          <td class="px-2 sm:px-6 py-2 sm:py-3 text-center font-bold text-blue-600 bg-blue-50/30 rounded-xl">${sNumber}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-3 font-mono text-xs font-bold text-slate-700 hidden sm:table-cell">${s.student_id}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-3 font-medium text-slate-800 text-xs sm:text-sm">
            ${s.name}
            <div class="mt-0.5 font-mono text-[10px] text-slate-500 sm:hidden">${s.student_id}</div>
            <div class="mt-1 md:hidden">${roleBadge}</div>
          </td>
          <td class="px-2 sm:px-6 py-2 sm:py-3 text-center hidden md:table-cell">${roleBadge}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-3 text-right font-bold text-emerald-600 text-xs sm:text-sm">${formatCurrency(totalPaid)}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-3 text-center">${actionButtons}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    function filterManageStudentsTable() {
      const el = document.getElementById('searchManageStudentInput');
      const q = el ? el.value : '';
      renderManageStudentsTable(q);
    }

    function openTransactionsModal(type = 'all') {
      currentModalTxFilter = type || 'all';
      currentModalTxSearch = '';
      const searchInput = document.getElementById('modalTxSearchInput');
      if (searchInput) searchInput.value = '';
      
      updateModalTxTabsUI();
      updateModalTxHeader(currentModalTxFilter);
      renderTransactionsTable();
      openModal('transactionsModal');
    }

    function setModalTxFilter(type) {
      currentModalTxFilter = type || 'all';
      updateModalTxTabsUI();
      updateModalTxHeader(currentModalTxFilter);
      renderTransactionsTable();
    }

    function handleSearchModalTx(val) {
      currentModalTxSearch = (val || '').trim().toLowerCase();
      renderTransactionsTable();
    }

    function updateModalTxTabsUI() {
      const btnAll = document.getElementById('btnModalTxFilterAll');
      const btnIncome = document.getElementById('btnModalTxFilterIncome');
      const btnExpense = document.getElementById('btnModalTxFilterExpense');
      
      if (!btnAll || !btnIncome || !btnExpense) return;

      const baseInactive = 'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all text-slate-500 hover:text-slate-800 cursor-pointer';
      
      if (currentModalTxFilter === 'income') {
        btnAll.className = baseInactive;
        btnIncome.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-emerald-600 text-white shadow-xs cursor-pointer';
        btnExpense.className = baseInactive;
      } else if (currentModalTxFilter === 'expense') {
        btnAll.className = baseInactive;
        btnIncome.className = baseInactive;
        btnExpense.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-rose-600 text-white shadow-xs cursor-pointer';
      } else {
        btnAll.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-slate-800 shadow-xs border border-slate-200/60 cursor-pointer';
        btnIncome.className = baseInactive;
        btnExpense.className = baseInactive;
      }
    }

    function updateModalTxHeader(filter) {
      const titleEl = document.getElementById('txModalTitle');
      const subtitleEl = document.getElementById('txModalSubtitle');
      const iconEl = document.getElementById('txModalIcon');
      if (!titleEl || !subtitleEl || !iconEl) return;

      if (filter === 'income') {
        titleEl.textContent = 'รายการรายรับทั้งหมด';
        subtitleEl.textContent = 'รายการเงินห้องประจำงวด และรายรับอื่นๆ';
        iconEl.innerHTML = '📈';
        iconEl.className = 'w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-lg shadow-xs';
      } else if (filter === 'expense') {
        titleEl.textContent = 'รายการรายจ่ายทั้งหมด';
        subtitleEl.textContent = 'รายการเบิกจ่าย ค่าอุปกรณ์ และกิจกรรมห้องเรียน';
        iconEl.innerHTML = '📉';
        iconEl.className = 'w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-lg shadow-xs';
      } else {
        titleEl.textContent = 'ประวัติการทำรายการทั้งหมด';
        subtitleEl.textContent = 'รายการรับเงิน จ่ายเงิน และรายรับอื่นๆ ทั้งหมด';
        iconEl.innerHTML = '📋';
        iconEl.className = 'w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg shadow-xs';
      }
    }

    function renderTransactionsTable() {
      const tbody = document.getElementById('txTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const isTeacher = currentUser && currentUser.role === 'teacher' && window.isCurrentTerm !== false;
      const thActions = document.getElementById('thTxActions');
      if (thActions) {
        if (isTeacher) thActions.classList.remove('hidden-view');
        else thActions.classList.add('hidden-view');
      }

      if (!appData.transactions || appData.transactions.length === 0) {
        const colSpan = isTeacher ? 6 : 5;
        tbody.innerHTML = `<tr class="block sm:table-row"><td colspan="${colSpan}" class="block sm:table-cell px-6 py-8 text-center text-xs text-slate-400">ยังไม่มีรายการธุรกรรม</td></tr>`;
        const countEl = document.getElementById('modalTxCountBadge');
        const sumEl = document.getElementById('modalTxSumBadge');
        if (countEl) countEl.innerHTML = `จำนวน <span class="font-bold text-slate-900">0</span> รายการ`;
        if (sumEl) sumEl.innerHTML = `ยอดรวม: <span class="font-bold text-slate-900">0 บาท</span>`;
        return;
      }

      // Group batch incomes recorded in the same session
      const displayTxList = [];
      const batchIncomeMap = {};

      appData.transactions.forEach(t => {
        if (t.type === 'income' && t.student_id !== 'ROOM') {
          const timeMin = String(t.timestamp || '').slice(0, 16);
          const key = `batch_${String(t.week_id || '').trim()}_${timeMin}_${String(t.recorded_by || '').trim()}_${String(t.description || '').trim()}`;
          
          if (!batchIncomeMap[key]) {
            const groupObj = {
              isBatch: true,
              timestamp: t.timestamp,
              week_id: t.week_id,
              type: 'income',
              baseDescription: t.description || (t.week_id ? `เงินห้องประจำ ${t.week_id}` : 'รายรับ'),
              amount: 0,
              count: 0,
              recorded_by: t.recorded_by
            };
            batchIncomeMap[key] = groupObj;
            displayTxList.push(groupObj);
          }
          batchIncomeMap[key].amount += (parseFloat(t.amount) || 0);
          batchIncomeMap[key].count += 1;
        } else {
          displayTxList.push({
            isBatch: false,
            tx_id: t.tx_id,
            timestamp: t.timestamp,
            week_id: t.week_id,
            type: t.type,
            description: t.description || '-',
            amount: parseFloat(t.amount) || 0,
            recorded_by: t.recorded_by || '-'
          });
        }
      });

      // Filter by currentModalTxFilter ('all', 'income', 'expense') and currentModalTxSearch
      const filteredTxList = displayTxList.filter(t => {
        if (currentModalTxFilter === 'income') {
          if (t.type !== 'income' && t.type !== 'fine') return false;
        } else if (currentModalTxFilter === 'expense') {
          if (t.type !== 'expense') return false;
        }

        if (currentModalTxSearch) {
          const descStr = (t.isBatch ? `${t.baseDescription} (${t.count} คน)` : (t.description || '')).toLowerCase();
          const recStr = (t.recorded_by || '').toLowerCase();
          const amtStr = String(t.amount || '');
          const dateStr = formatThaiDateTimeBE(t.timestamp).toLowerCase();
          const match = descStr.includes(currentModalTxSearch) ||
                        recStr.includes(currentModalTxSearch) ||
                        amtStr.includes(currentModalTxSearch) ||
                        dateStr.includes(currentModalTxSearch);
          if (!match) return false;
        }
        return true;
      });

      // Calculate totals for the summary strip
      let totalFilteredIncome = 0;
      let totalFilteredExpense = 0;
      filteredTxList.forEach(t => {
        if (t.type === 'expense') {
          totalFilteredExpense += t.amount;
        } else {
          totalFilteredIncome += t.amount;
        }
      });

      const countEl = document.getElementById('modalTxCountBadge');
      const sumEl = document.getElementById('modalTxSumBadge');
      if (countEl) countEl.innerHTML = `จำนวน <span class="font-bold text-slate-900">${filteredTxList.length}</span> รายการ`;
      if (sumEl) {
        if (currentModalTxFilter === 'income') {
          sumEl.innerHTML = `ยอดรวมรายรับ: <span class="font-extrabold text-emerald-600">${formatCurrency(totalFilteredIncome)}</span>`;
        } else if (currentModalTxFilter === 'expense') {
          sumEl.innerHTML = `ยอดรวมรายจ่าย: <span class="font-extrabold text-rose-600">${formatCurrency(totalFilteredExpense)}</span>`;
        } else {
          const net = totalFilteredIncome - totalFilteredExpense;
          const netClass = net >= 0 ? 'text-emerald-600' : 'text-rose-600';
          sumEl.innerHTML = `คงเหลือสุทธิ: <span class="font-extrabold ${netClass}">${formatCurrency(net)}</span> <span class="text-slate-400 font-normal text-[11px]">(รับ ${formatCurrency(totalFilteredIncome)} | จ่าย ${formatCurrency(totalFilteredExpense)})</span>`;
        }
      }

      if (filteredTxList.length === 0) {
        const colSpan = isTeacher ? 6 : 5;
        tbody.innerHTML = `<tr class="block sm:table-row"><td colspan="${colSpan}" class="block sm:table-cell px-6 py-12 text-center text-xs text-slate-400">
          <div class="flex flex-col items-center justify-center gap-2">
            <span class="text-3xl">🔍</span>
            <span class="font-medium text-slate-500">ไม่พบรายการที่ตรงกับเงื่อนไข</span>
          </div>
        </td></tr>`;
        return;
      }

      filteredTxList.forEach(t => {
        let typeBadge = '';
        let amountClass = '';
        let prefix = '';

        if (t.type === 'income') {
          typeBadge = '<span class="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold whitespace-nowrap">รายรับ</span>';
          amountClass = 'text-emerald-600';
          prefix = '';
        } else if (t.type === 'expense') {
          typeBadge = '<span class="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-full text-xs font-semibold whitespace-nowrap">รายจ่าย</span>';
          amountClass = 'text-rose-600';
          prefix = '';
        } else {
          typeBadge = '<span class="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-semibold whitespace-nowrap">รายรับอื่นๆ</span>';
          amountClass = 'text-amber-600';
          prefix = '';
        }

        let descText = t.description;
        if (t.isBatch) {
          descText = `${t.baseDescription} (${t.count} คน)`;
        }

        let actionCellDesktop = '';
        let actionCellMobile = '';
        if (isTeacher) {
          if (!t.isBatch) {
            actionCellDesktop = `
              <td class="hidden sm:table-cell px-5 py-3 text-center whitespace-nowrap">
                <div class="flex items-center justify-center gap-1.5">
                  <button onclick="handleEditTransaction('${t.tx_id}')" class="text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer">✏️ แก้ไข</button>
                  <button onclick="handleDeleteTransaction('${t.tx_id}')" class="text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer">🗑️ ลบ</button>
                </div>
              </td>
            `;
            actionCellMobile = `
              <div class="flex items-center gap-1.5">
                <button onclick="handleEditTransaction('${t.tx_id}')" class="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer">✏️ แก้ไข</button>
                <button onclick="handleDeleteTransaction('${t.tx_id}')" class="text-[10px] text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/60 px-2 py-1 rounded-lg font-semibold transition-colors cursor-pointer">🗑️ ลบ</button>
              </div>
            `;
          } else {
            actionCellDesktop = `<td class="hidden sm:table-cell px-5 py-3 text-center text-xs text-slate-300">-</td>`;
          }
        }

        const tr = document.createElement('tr');
        tr.className = 'block sm:table-row hover:bg-slate-50/80 transition-colors border-b border-slate-100 sm:border-0 p-3.5 sm:p-0';
        const recNameParts = (t.recorded_by || '-').split(' ').map(p => `<span class="whitespace-nowrap">${p}</span>`).join(' ');
        tr.innerHTML = `
          <!-- Desktop Layout -->
          <td class="hidden sm:table-cell px-5 py-3 text-xs text-slate-500 whitespace-nowrap">${formatThaiDateTimeBE(t.timestamp)}</td>
          <td class="hidden sm:table-cell px-5 py-3 text-sm text-slate-800 font-medium">${descText}</td>
          <td class="hidden sm:table-cell px-5 py-3">${typeBadge}</td>
          <td class="hidden sm:table-cell px-5 py-3 text-right font-bold text-sm whitespace-nowrap ${amountClass}">${prefix}${formatCurrency(t.amount)}</td>
          <td class="hidden sm:table-cell px-5 py-3 text-xs text-slate-400 text-right">${recNameParts}</td>
          ${actionCellDesktop}
          
          <!-- Mobile Card Layout -->
          <td class="block sm:hidden w-full p-0">
            <div class="flex flex-col gap-2">
              <div class="flex justify-between items-start gap-2">
                <div class="flex flex-col gap-1">
                  <div class="flex items-center gap-2">
                    ${typeBadge}
                    <span class="text-[10px] text-slate-500">${formatThaiDateTimeBE(t.timestamp)}</span>
                  </div>
                  <div class="text-sm font-medium text-slate-800 line-clamp-2">${descText}</div>
                </div>
                <div class="text-right font-bold text-sm shrink-0 mt-0.5 ${amountClass}">${prefix}${formatCurrency(t.amount)}</div>
              </div>
              <div class="flex justify-between items-center mt-1 pt-2 border-t border-slate-50/50">
                <div class="text-[10px] text-slate-400">บันทึกโดย: ${recNameParts}</div>
                ${actionCellMobile}
              </div>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    function handleEditTransaction(txId) {
      const tx = (appData.transactions || []).find(t => t.tx_id === txId);
      if (!tx) return;

      document.getElementById('editExpTxId').value = tx.tx_id;
      document.getElementById('editExpDescription').value = tx.description || '';
      document.getElementById('editExpAmount').value = tx.amount || '';

      const isExpense = tx.type === 'expense';
      const typeName = isExpense ? 'รายจ่าย' : (tx.type === 'income' ? 'รายรับ' : 'รายรับอื่นๆ');
      
      const titleEl = document.getElementById('editTxTitle');
      if (titleEl) titleEl.textContent = `แก้ไขรายการ${typeName}`;
      
      const descLabelEl = document.getElementById('editTxDescLabel');
      if (descLabelEl) descLabelEl.innerHTML = `รายละเอียด${typeName} <span class="text-rose-500">*</span>`;
      
      const btnEl = document.getElementById('editTxSubmitBtn');
      if (btnEl) {
        btnEl.className = isExpense 
          ? 'w-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-rose-500/20 cursor-pointer'
          : 'w-full bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md shadow-amber-500/20 cursor-pointer';
        btnEl.textContent = `บันทึกการแก้ไข${typeName}`;
      }

      openModal('editExpenseModal');
    }

    function handleEditExpense(txId) {
      handleEditTransaction(txId);
    }

    function submitEditExpense(e) {
      e.preventDefault();
      const txId = document.getElementById('editExpTxId').value;
      const desc = document.getElementById('editExpDescription').value.trim();
      const amt = parseFloat(document.getElementById('editExpAmount').value) || 0;

      if (!desc || amt <= 0) {
        Swal.fire('กรุณากรอกข้อมูลให้ครบ', 'โปรดระบุรายละเอียดและจำนวนเงินที่ถูกต้อง', 'warning');
        return;
      }

      closeModal('editExpenseModal');
      showSyncToast('loading', 'กำลังบันทึกการแก้ไข...');

      if (isMock) {
        setTimeout(() => {
          const t = (appData.transactions || []).find(x => x.tx_id === txId);
          if (t) {
            t.description = desc;
            t.amount = amt;
          }
          renderDashboard();
          showSyncToast('success', 'แก้ไขรายการเรียบร้อยแล้ว');
        }, 300);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            showSyncToast('success', res.message || 'แก้ไขรายการเรียบร้อยแล้ว');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการแก้ไข');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .updateTransaction(txId, desc, amt);
    }

    function handleDeleteTransaction(txId) {
      const tx = (appData.transactions || []).find(t => t.tx_id === txId);
      const desc = tx ? tx.description : 'รายการนี้';
      const isExpense = tx && tx.type === 'expense';
      const typeName = isExpense ? 'รายจ่าย' : 'รายรับอื่นๆ';

      Swal.fire({
        title: `ยืนยันการลบ${typeName}?`,
        text: `คุณต้องการลบ "${desc}" หรือไม่? ยอดเงินคงเหลือจะถูกคำนวณปรับปรุงให้อัตโนมัติ`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#94a3b8',
        confirmButtonText: 'ลบรายการ',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          showSyncToast('loading', `กำลังลบ${typeName}...`);

          if (isMock) {
            setTimeout(() => {
              appData.transactions = (appData.transactions || []).filter(t => t.tx_id !== txId);
              renderDashboard();
              showSyncToast('success', 'ลบรายการเรียบร้อยแล้ว');
            }, 300);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              if (res.success) {
                appData.transactions = (appData.transactions || []).filter(t => t.tx_id !== txId);
                renderDashboard();
                showSyncToast('success', res.message || 'ลบรายการเรียบร้อยแล้ว');
                loadData(true);
              } else {
                showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการลบรายการ');
              }
            })
            .withFailureHandler(err => {
              showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
            })
            .deleteTransaction(txId);
        }
      });
    }

    function loadMoreTransactions() {
      txVisibleLimit += 5;
      renderTransactionsTable();
    }

    function resetTransactionsLimit() {
      txVisibleLimit = 5;
      renderTransactionsTable();
    }

    function renderChart() {
      const ctx = document.getElementById('financeChart').getContext('2d');
      if (chartInstance) chartInstance.destroy();

      // Total overall incomes across all transactions (income + fine)
      const totalIncomes = (appData.transactions || [])
        .filter(t => t.type === 'income' || t.type === 'fine')
        .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

      // Total overall expenses across all transactions
      const totalExpenses = (appData.transactions || [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

      const isMobile = window.innerWidth < 640;

      chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['ภาพรวม'],
          datasets: [
            {
              label: 'รายรับรวมทั้งหมด',
              data: [totalIncomes],
              backgroundColor: '#10b981',
              hoverBackgroundColor: '#059669',
              borderRadius: 0, // แท่งกราฟแบบสี่เหลี่ยมคมชัด
              borderSkipped: false,
              categoryPercentage: 0.55,
              barPercentage: 0.85
            },
            {
              label: 'รายจ่ายรวมทั้งหมด',
              data: [totalExpenses],
              backgroundColor: '#f43f5e',
              hoverBackgroundColor: '#e11d48',
              borderRadius: 0, // แท่งกราฟแบบสี่เหลี่ยมคมชัด
              borderSkipped: false,
              categoryPercentage: 0.55,
              barPercentage: 0.85
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: {
            padding: { left: 10, right: 15, top: 15, bottom: 5 }
          },
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              align: 'center',
              onClick: null,
              onHover: (e) => {
                if (e && e.native && e.native.target) e.native.target.style.cursor = 'default';
              },
              labels: {
                font: { family: 'Prompt', size: 12, weight: '600' },
                usePointStyle: true,
                pointStyle: 'rect',
                boxWidth: 10,
                padding: 16
              }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` ${context.dataset.label}: ${formatCurrency(context.raw)}`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: '#e2e8f0',
                drawTicks: false
              },
              border: {
                display: true,
                color: '#94a3b8',
                width: 1
              },
              ticks: {
                padding: 6, // ยึดหลักหน่วยให้ชิดเส้นตารางแกนกราฟอย่างเป็นระเบียบ (เว้น 6px พอดีไม่ทับเส้น)
                font: { family: 'sans-serif', size: 11 },
                callback: function(val) {
                  return val.toLocaleString('th-TH');
                }
              }
            },
            x: {
              grid: { display: false },
              border: {
                display: true,
                color: '#94a3b8',
                width: 1
              },
              ticks: { display: false }
            }
          }
        }
      });
    }

    function renderUnpaidWeeks() {
      const container = document.getElementById('unpaidWeeksContainer');
      const lblCount = document.getElementById('lblUnpaidWeeksCount');
      if (!container) return;

      container.innerHTML = '';

      const students = (appData.users || [])
        .filter(u => u.role === 'student' || u.role === 'treasurer')
        .sort((a, b) => (parseInt(a.student_number) || 999) - (parseInt(b.student_number) || 999));

      const currentAcdYear = appData.settings?.current_academic_year || '2569';
      const currentSem = appData.settings?.current_semester || '1';
      const currentWeeks = (appData.weeks || []).filter(w => String(w.academic_year) === String(currentAcdYear) && String(w.semester || "1") === String(currentSem));

      const weeks = [...currentWeeks]
        .sort((a, b) => (parseInt(b.week_number) || 0) - (parseInt(a.week_number) || 0)); // Newest / Latest week on top!

      if (weeks.length === 0 || students.length === 0) {
        container.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">ไม่มีข้อมูลรอบเก็บเงินหรือรายชื่อนักเรียน</p>';
        if (lblCount) lblCount.textContent = 'ไม่มีข้อมูล';
        return;
      }

      let unpaidWeeksCount = 0;
      let totalUnpaidStudentsCount = 0;

      weeks.forEach(w => {
        // Find which students already paid for this week
        const paidStudentIds = new Set();
        (appData.transactions || []).forEach(t => {
          if (t.type === 'income' && String(t.week_id).trim() === String(w.week_id).trim() && t.student_id !== 'ROOM') {
            paidStudentIds.add(String(t.student_id).trim());
          }
        });

        // Filter unpaid students
        const unpaidList = students.filter(s => !paidStudentIds.has(String(s.student_id).trim()));

        // If everyone has paid for this week, do NOT show this week!
        if (unpaidList.length === 0) return;

        unpaidWeeksCount++;
        totalUnpaidStudentsCount += unpaidList.length;

        const targetAmount = parseFloat(w.amount_target) || 20;
        const totalUnpaidAmount = unpaidList.length * targetAmount;
        const dStart = formatThaiDateBE(w.start_date);
        const dEnd = formatThaiDateBE(w.end_date);

        const card = document.createElement('div');
        card.className = 'p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/70 hover:border-rose-200 transition-all';
        
        let chipsHtml = '';
        unpaidList.forEach(s => {
          const sNum = s.student_number ? `เลขที่ ${s.student_number}` : '-';
          const roleTag = s.role === 'treasurer' ? '<span class="hidden sm:inline text-[9px] bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded font-bold ml-1">เหรัญญิก</span>' : '';
          chipsHtml += `
            <div class="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-white border border-rose-100/80 shadow-sm text-xs hover:shadow-md transition-all">
              <span class="inline-flex items-center justify-center font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-lg text-xs whitespace-nowrap min-w-[54px] text-center">
                ${sNum}
              </span>
              <span class="font-medium text-slate-800 truncate whitespace-nowrap" title="${s.name}">
                ${s.name} ${roleTag}
              </span>
            </div>
          `;
        });

        card.innerHTML = `
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-3.5 pb-3 border-b border-slate-200/60">
            <div class="flex items-center gap-2.5 flex-wrap">
              <span class="px-3 py-1 bg-rose-600 text-white text-xs font-extrabold rounded-xl shadow-sm shadow-rose-600/20">
                ครั้งที่ ${w.week_number}
              </span>
              <span class="text-xs text-slate-500 font-semibold">
                📅 ${dStart} ถึง ${dEnd}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold text-rose-600 bg-rose-100/70 border border-rose-200 px-3 py-1 rounded-full">
                ค้างชำระ ${unpaidList.length} คน (ยอด ${formatCurrency(totalUnpaidAmount)})
              </span>
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
            ${chipsHtml}
          </div>
        `;

        container.appendChild(card);
      });

      if (lblCount) {
        if (unpaidWeeksCount > 0) {
          lblCount.className = 'self-start sm:self-auto text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-full';
          lblCount.textContent = `ค้างชำระ ${unpaidWeeksCount} รอบ (${totalUnpaidStudentsCount} คน)`;
        } else {
          lblCount.className = 'self-start sm:self-auto text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full';
          lblCount.textContent = `✓ ชำระครบทุกรอบแล้ว`;
        }
      }

      if (unpaidWeeksCount === 0) {
        container.innerHTML = `
          <div class="py-10 text-center flex flex-col items-center justify-center gap-2">
            <div class="w-14 h-14 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center text-2xl font-bold border border-emerald-200 shadow-sm">
              ✓
            </div>
            <h3 class="text-base font-bold text-emerald-800 mt-2">ยอดเยี่ยมมาก! นักเรียนทุกคนจ่ายเงินครบทุกรอบเก็บเงินแล้ว</h3>
            <p class="text-xs text-slate-400">ไม่มีรายการค้างชำระในระบบ</p>
          </div>
        `;
      }
    }

    function populateSelects() {
      const stdSelects = ['incStudentId'];
      let stdOptions = '<option value="">-- เลือกนักเรียน --</option>';
      
      const sortedStudents = appData.users
        .filter(u => u.role === 'student' || u.role === 'treasurer')
        .sort((a, b) => (parseInt(a.student_number) || 999) - (parseInt(b.student_number) || 999));

      sortedStudents.forEach(u => {
        const numText = u.student_number ? `[เลขที่ ${u.student_number}] ` : '';
        const roleTag = u.role === 'treasurer' ? ' (💼 เหรัญญิก)' : '';
        stdOptions += `<option value="${u.student_id}">${numText}${u.name} (${u.student_id})${roleTag}</option>`;
      });
      
      stdSelects.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = stdOptions;
      });

      const wkSelect = document.getElementById('incWeekId');
      if (wkSelect) {
        let wkOptions = '<option value="">-- เลือกรอบเก็บเงิน --</option>';
        const currentAcdYear = appData.settings?.current_academic_year || '2569';
        const currentSem = appData.settings?.current_semester || '1';
        const currentWeeks = (appData.weeks || []).filter(w => String(w.academic_year) === String(currentAcdYear) && String(w.semester || "1") === String(currentSem));
        const sortedWeeks = [...currentWeeks]
          .sort((a, b) => (parseInt(b.week_number) || 0) - (parseInt(a.week_number) || 0));
        sortedWeeks.forEach(w => {
          wkOptions += `<option value="${w.week_id}" data-amount="${w.amount_target}">ครั้งที่ ${w.week_number} (${w.amount_target} บาท)</option>`;
        });
        wkSelect.innerHTML = wkOptions;
      }

      const fineSelect = document.getElementById('fineReason');
      if (fineSelect) {
        let fOptions = '<option value="">-- เลือกสาเหตุค่าปรับ --</option>';
        if (appData.settings && appData.settings.fine_presets) {
          appData.settings.fine_presets.forEach(f => {
            fOptions += `<option value="${f.id}" data-amount="${f.amount}">${f.title} (${f.amount} บาท)</option>`;
          });
        }
        fineSelect.innerHTML = fOptions;
      }
    }

    function updateIncomeAmountByWeek() {
      const select = document.getElementById('incWeekId');
      const opt = select.options[select.selectedIndex];
      if (opt && opt.dataset.amount) {
        document.getElementById('incAmount').value = opt.dataset.amount;
      }
    }

    function updateFineAmount() {
      const select = document.getElementById('fineReason');
      const opt = select.options[select.selectedIndex];
      if (opt && opt.dataset.amount) {
        document.getElementById('fineAmount').value = opt.dataset.amount;
      }
    }

    // === Excel Import Functions (SheetJS) ===
    function downloadStudentTemplate() {
      const templateData = [
        {
          "student_number": 1,
          "student_id": "54321",
          "name": "นายสมชาย สายเปย์"
        },
        {
          "student_number": 2,
          "student_id": "54322",
          "name": "นางสาวสมหญิง สดใส"
        },
        {
          "student_number": 3,
          "student_id": "54323",
          "name": "นายสมศักดิ์ รักเรียน"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Students");
      XLSX.writeFile(wb, "แบบฟอร์มรายชื่อนักเรียน_ClassFund_ม4_7.xlsx");
    }

    function handleExcelFileUpload(e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(evt) {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet);

          if (!jsonData || jsonData.length === 0) {
            Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูลในไฟล์ Excel' });
            return;
          }

          parsedExcelUsers = jsonData;
          renderExcelPreview(jsonData);
        } catch(err) {
          Swal.fire({ icon: 'error', title: 'ไม่สามารถอ่านไฟล์ได้', text: err.message });
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function renderExcelPreview(dataList) {
      const previewArea = document.getElementById('excelPreviewArea');
      const tbody = document.getElementById('excelPreviewBody');
      tbody.innerHTML = '';

      let count = 0;
      dataList.forEach(u => {
        const sNum = u.student_number || u.studentNumber || u['เลขที่'] || u['ลำดับ'] || '-';
        const sId = u.student_id || u.studentId || u['รหัสนักเรียน'] || u['รหัส'] || '';
        const sName = u.name || u['ชื่อ-นามสกุล'] || u['ชื่อ'] || '';

        if (sId && sName) {
          count++;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="px-3 py-1.5 text-center font-bold text-blue-600">${sNum}</td>
            <td class="px-3 py-1.5 font-mono text-slate-700">${sId}</td>
            <td class="px-3 py-1.5 font-medium">${sName}</td>
          `;
          tbody.appendChild(tr);
        }
      });

      document.getElementById('lblPreviewCount').textContent = count;
      if (count > 0) {
        previewArea.classList.remove('hidden-view');
      } else {
        Swal.fire({ icon: 'warning', title: 'ไม่พบคอลัมน์ student_id และ name', text: 'กรุณาใช้ไฟล์ตามแบบฟอร์มที่ดาวน์โหลด' });
      }
    }

    function clearExcelPreview() {
      parsedExcelUsers = [];
      document.getElementById('excelFileInput').value = '';
      document.getElementById('excelPreviewArea').classList.add('hidden-view');
    }

    function submitBatchExcelUsers() {
      if (!parsedExcelUsers || parsedExcelUsers.length === 0) {
        Swal.fire({ icon: 'warning', title: 'ไม่มีข้อมูลให้นำเข้า' });
        return;
      }

      closeModal('userModal');
      clearExcelPreview();
      showSyncToast('loading', `กำลังนำเข้า ${parsedExcelUsers.length} คน...`);

      if (isMock) {
        setTimeout(() => {
          showSyncToast('success', `นำเข้า ${parsedExcelUsers.length} คน เรียบร้อยแล้ว`);
          loadData(true);
        }, 800);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            showSyncToast('success', res.message || 'นำเข้ารายชื่อสำเร็จ');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการนำเข้า');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .addUsersBatch(parsedExcelUsers);
    }

    // === Edit Student Information ===
    function openEditStudentModal(studentId) {
      const user = appData.users.find(u => String(u.student_id) === String(studentId));
      if (!user) return;

      document.getElementById('editOldStudentId').value = user.student_id;
      document.getElementById('editStudentId').value = user.student_id;
      document.getElementById('editStudentNumber').value = user.student_number || 1;
      document.getElementById('editName').value = user.name;

      openModal('editStudentModal');
    }

    function submitEditStudent(e) {
      e.preventDefault();
      const oldId = document.getElementById('editOldStudentId').value;
      const payload = {
        student_number: document.getElementById('editStudentNumber').value.trim(),
        student_id: document.getElementById('editStudentId').value.trim(),
        name: document.getElementById('editName').value.trim()
      };

      closeModal('editStudentModal');
      showSyncToast('loading', 'กำลังบันทึกข้อมูลนักเรียน...');

      if (isMock) {
        setTimeout(() => {
          const u = appData.users.find(x => String(x.student_id) === String(oldId));
          if (u) {
            u.student_number = payload.student_number;
            u.student_id = payload.student_id;
            u.name = payload.name;
          }
          showSyncToast('success', 'อัปเดตข้อมูลนักเรียนเรียบร้อยแล้ว');
          renderManageStudentsTable();
          renderStudentsTable();
        }, 500);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            showSyncToast('success', res.message || 'อัปเดตข้อมูลสำเร็จ');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาด');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .updateStudent(oldId, payload);
    }


    function confirmResetPassword(studentId, name) {
      Swal.fire({
        title: 'ยืนยันรีเซ็ตรหัสผ่าน?',
        text: `คุณต้องการรีเซ็ตรหัสผ่านของ "${name}" กลับเป็นค่าเริ่มต้น "123456" ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, รีเซ็ตเลย',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          showCenterLoader('loading', 'กำลังรีเซ็ตรหัสผ่าน...');
          
          if (isMock) {
            setTimeout(() => {
              showCenterLoader('success', 'รีเซ็ตรหัสผ่านสำเร็จ', 'รหัสผ่านใหม่คือ 123456');
            }, 500);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              if (res.success) {
                showCenterLoader('success', 'รีเซ็ตรหัสผ่านสำเร็จ', 'รหัสผ่านใหม่คือ 123456');
              } else {
                showCenterLoader('error', 'เกิดข้อผิดพลาด', res.message);
              }
            })
            .withFailureHandler(err => {
              showCenterLoader('error', 'เกิดข้อผิดพลาด', err.message);
            })
            .resetUserPassword(studentId, currentUser.role);
        }
      });
    }
    function confirmDeleteStudent(studentId, name) {
      Swal.fire({
        title: 'ยืนยันการลบนักเรียน?',
        text: `คุณต้องการลบ "${name} (${studentId})" หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
      }).then((result) => {
        if (result.isConfirmed) {
          showSyncToast('loading', 'กำลังลบข้อมูลนักเรียน...');

          if (isMock) {
            setTimeout(() => {
              appData.users = appData.users.filter(u => String(u.student_id) !== String(studentId));
              showSyncToast('success', 'ลบนักเรียนเรียบร้อยแล้ว');
              renderManageStudentsTable();
              renderStudentsTable();
            }, 500);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              if (res.success) {
                showSyncToast('success', res.message || 'ลบเรียบร้อยแล้ว');
                loadData(true);
              } else {
                showSyncToast('error', res.message || 'เกิดข้อผิดพลาด');
              }
            })
            .withFailureHandler(err => {
              showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
            })
            .deleteStudent(studentId);
        }
      });
    }

    // === Treasurer Management (Set Role from Action Button) ===
    function openTreasurerModal(studentId) {
      const user = appData.users.find(u => String(u.student_id) === String(studentId));
      if (!user) return;

      document.getElementById('trsStudentId').value = user.student_id;
      document.getElementById('lblTreasurerTargetName').textContent = `[เลขที่ ${user.student_number || '-'}] ${user.name} (${user.student_id})`;
      document.getElementById('trsRole').value = (user.role === 'treasurer') ? 'treasurer' : 'student';
      handleTreasurerRoleToggle();
      openModal('treasurerModal');
    }

    function handleTreasurerRoleToggle() {
      const role = document.getElementById('trsRole').value;
      const block = document.getElementById('trsPasswordBlock');
      if (role === 'treasurer') {
        block.classList.remove('hidden-view');
      } else {
        block.classList.add('hidden-view');
      }
    }

    function submitTreasurer(e) {
      e.preventDefault();
      const sId = document.getElementById('trsStudentId').value;
      const role = document.getElementById('trsRole').value;
      const pwd = document.getElementById('trsPassword').value;

      if (!sId) {
        Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูลนักเรียน' });
        return;
      }

      closeModal('treasurerModal');
      showSyncToast('loading', 'กำลังบันทึกสิทธิ์...');

      if (isMock) {
        setTimeout(() => {
          const u = appData.users.find(x => String(x.student_id) === String(sId));
          if (u) u.role = role;
          showSyncToast('success', 'บันทึกสิทธิ์เรียบร้อย');
          renderManageStudentsTable();
          renderStudentsTable();
        }, 500);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            showSyncToast('success', res.message || 'บันทึกสิทธิ์เรียบร้อย');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาด');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .setUserRole(sId, role, pwd);
    }

    // === Submissions ===
    function submitTransaction(e, type, modalId) {
      e.preventDefault();
      if (!currentUser) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเข้าสู่ระบบก่อนทำรายการ' });
        return;
      }

      let payload = {
        type: type,
        academic_year: appData.settings.current_academic_year || '2569',
        semester: appData.settings.current_semester || '1',
        recorded_by: currentUser.name
      };

      let typeName = 'รายรับ';
      if (type === 'income') {
        payload.student_id = document.getElementById('incStudentId').value;
        payload.week_id = document.getElementById('incWeekId').value;
        payload.amount = document.getElementById('incAmount').value;
        payload.description = document.getElementById('incDesc').value || 'จ่ายเงินประจำงวด';
        typeName = 'รายรับ';
      } else if (type === 'expense') {
        payload.student_id = 'ROOM';
        payload.week_id = '';
        payload.amount = document.getElementById('expAmount').value;
        payload.description = document.getElementById('expDesc').value;
        typeName = 'รายจ่าย';
      } else if (type === 'fine') {
        payload.student_id = 'ROOM';
        payload.week_id = '';
        payload.amount = document.getElementById('fineAmount').value;
        const descInput = document.getElementById('fineDescInput');
        const descVal = descInput ? descInput.value.trim() : '';
        payload.description = descVal || "รายรับอื่นๆ";
        typeName = 'รายรับอื่นๆ';
      }

      closeModal(modalId);
      e.target.reset();
      showSyncToast('loading', `กำลังบันทึก${typeName}...`);

      if (isMock) {
        setTimeout(() => {
          showCenterLoader('success', 'บันทึกสำเร็จ');
          loadData(true);
        }, 500);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            showCenterLoader('success', 'บันทึกสำเร็จ');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการบันทึก');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .addTransaction(payload);
    }

    function submitWeek(e) {
      e.preventDefault();

      const sDay = String(document.getElementById('wkStartDay').value).padStart(2, '0');
      const sMonth = String(document.getElementById('wkStartMonth').value).padStart(2, '0');
      const sYearBE = parseInt(document.getElementById('wkStartYear').value) || (new Date().getFullYear() + 543);
      const sYearAD = sYearBE - 543;
      const startDateStr = `${sYearAD}-${sMonth}-${sDay}`;

      const eDay = String(document.getElementById('wkEndDay').value).padStart(2, '0');
      const eMonth = String(document.getElementById('wkEndMonth').value).padStart(2, '0');
      const eYearBE = parseInt(document.getElementById('wkEndYear').value) || (new Date().getFullYear() + 543);
      const eYearAD = eYearBE - 543;
      const endDateStr = `${eYearAD}-${eMonth}-${eDay}`;

      const payload = {
        week_id: currentEditWeekId,
        start_date: startDateStr,
        end_date: endDateStr,
        amount_target: document.getElementById('wkAmount').value,
        week_number: document.getElementById('wkNumber').value,
        academic_year: String(appData.settings?.current_academic_year || sYearBE),
        semester: String(appData.settings?.current_semester || "1")
      };

      closeModal('weekModal');
      showSyncToast('loading', 'กำลังบันทึกรอบเก็บเงิน...');

      if (isMock) {
        setTimeout(() => {
          const newWk = {
            week_id: currentEditWeekId || ('WK_' + Date.now()),
            week_number: parseInt(payload.week_number),
            start_date: payload.start_date,
            end_date: payload.end_date,
            amount_target: payload.amount_target,
            academic_year: payload.academic_year,
            semester: payload.semester
          };
          const idx = (appData.weeks || []).findIndex(w => w.week_id === newWk.week_id);
          if (idx !== -1) {
            appData.weeks[idx] = newWk;
          } else {
            appData.weeks.push(newWk);
          }
          cancelEditWeek();
          renderModalWeeksList();
          renderDashboard();
          populateSelects();
          initCollectView();
          switchMainView('collect');
          showSyncToast('success', 'บันทึกรอบเก็บเงินเรียบร้อยแล้ว');
        }, 300);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            if (res.week) {
              const idx = (appData.weeks || []).findIndex(w => w.week_id === res.week.week_id);
              if (idx !== -1) {
                appData.weeks[idx] = res.week;
              } else {
                appData.weeks.push(res.week);
              }
              selectedCollectWeekId = res.week.week_id;
            }
            cancelEditWeek();
            renderModalWeeksList();
            renderDashboard();
            populateSelects();
            initCollectView();
            switchMainView('collect');
            showSyncToast('success', res.message || 'บันทึกรอบเก็บเงินเรียบร้อยแล้ว');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการบันทึกรอบ');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .addWeek(payload);
    }

    function submitUser(e) {
      e.preventDefault();
      const payload = {
        student_number: document.getElementById('usrStudentNumber').value.trim(),
        student_id: document.getElementById('usrStudentId').value.trim(),
        name: document.getElementById('usrName').value.trim(),
        role: 'student',
        password: ''
      };

      closeModal('userModal');
      e.target.reset();
      showSyncToast('loading', 'กำลังเพิ่มนักเรียน...');

      if (isMock) {
        setTimeout(() => {
          showSyncToast('success', 'เพิ่มนักเรียนเรียบร้อยแล้ว');
          loadData(true);
        }, 500);
        return;
      }

      google.script.run
        .withSuccessHandler(res => {
          if (res.success) {
            showSyncToast('success', res.message || 'เพิ่มนักเรียนเรียบร้อยแล้ว');
            loadData(true);
          } else {
            showSyncToast('error', res.message || 'เกิดข้อผิดพลาด');
          }
        })
        .withFailureHandler(err => {
          showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
        })
        .addUser(payload);
    }

    // === Batch Collect Payment Logic (Checklist View) ===
    let selectedCollectWeekId = '';

    function initCollectView() {
      const wkSelect = document.getElementById('colWeekSelect');
      if (!wkSelect) return;

      const currentAcdYear = appData.settings?.current_academic_year || '2569';
      const currentSem = appData.settings?.current_semester || '1';
      const currentWeeks = (appData.weeks || []).filter(w => String(w.academic_year) === String(currentAcdYear) && String(w.semester || "1") === String(currentSem));

      if (currentWeeks.length === 0) {
        wkSelect.innerHTML = '<option value="">-- ยังไม่มีข้อมูลรอบเก็บเงินสำหรับเทอมนี้ --</option>';
        renderCollectTable();
        return;
      }

      let options = '';
      const sortedWeeks = [...currentWeeks]
        .sort((a, b) => (parseInt(b.week_number) || 0) - (parseInt(a.week_number) || 0));

      sortedWeeks.forEach((w) => {
        const dStart = formatThaiDateBE(w.start_date);
        const dEnd = formatThaiDateBE(w.end_date);
        options += `<option value="${w.week_id}" data-amount="${w.amount_target}">ครั้งที่ ${w.week_number} (${dStart} ถึง ${dEnd})</option>`;
      });
      wkSelect.innerHTML = options;

      if (!selectedCollectWeekId || !sortedWeeks.find(w => w.week_id === selectedCollectWeekId)) {
        selectedCollectWeekId = sortedWeeks[0].week_id;
      }
      wkSelect.value = selectedCollectWeekId;

      handleCollectWeekChange();
    }

    function handleCollectWeekChange() {
      const wkSelect = document.getElementById('colWeekSelect');
      if (!wkSelect) return;
      selectedCollectWeekId = wkSelect.value;
      const opt = wkSelect.options[wkSelect.selectedIndex];
      if (opt && opt.dataset.amount) {
        document.getElementById('colAmountInput').value = opt.dataset.amount;
      }
      renderCollectTable();
    }

    function renderCollectTable(searchQuery = '') {
      const tbody = document.getElementById('collectTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const students = appData.users
        .filter(u => u.role === 'student' || u.role === 'treasurer')
        .sort((a, b) => (parseInt(a.student_number) || 999) - (parseInt(b.student_number) || 999));

      const amountPerStudent = parseFloat(document.getElementById('colAmountInput')?.value) || 20;

      // Check which students already paid for this selected week
      const paidTxMap = {};
      appData.transactions.forEach(t => {
        if (t.type === 'income' && String(t.week_id).trim() === String(selectedCollectWeekId).trim() && t.student_id !== 'ROOM') {
          paidTxMap[String(t.student_id).trim()] = t;
        }
      });

      const filtered = students.filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return String(s.student_number || '').toLowerCase().includes(q) ||
               String(s.student_id || '').toLowerCase().includes(q) || 
               String(s.name || '').toLowerCase().includes(q);
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-xs text-slate-400">ไม่พบรายชื่อนักเรียน</td></tr>`;
        updateCollectSummary();
        return;
      }

      const isTeacher = (currentUser && currentUser.role === 'teacher');

      filtered.forEach(s => {
        const sId = String(s.student_id).trim();
        const isPaid = !!paidTxMap[sId];
        const sNum = s.student_number ? s.student_number : '-';

        let statusHtml = isPaid
          ? `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">จ่ายแล้ว</span>`
          : `<span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">ยังไม่จ่าย</span>`;

        let switchHtml = '';
        if (isPaid) {
          if (isTeacher) {
            switchHtml = `
              <div class="flex items-center justify-center">
                <button type="button" 
                        onclick="cancelStudentPayment('${s.student_id}', '${s.name.replace(/'/g, "\\'")}', '${selectedCollectWeekId}', '${paidTxMap[sId].amount}', '${paidTxMap[sId].tx_id}')" 
                        title="สวิตช์เปิดอยู่ (จ่ายแล้ว) - คลิกเพื่อยกเลิก/แก้ไขการจ่ายเงิน" 
                        class="relative inline-flex items-center cursor-pointer group active:scale-95 transition-all">
                  <div class="w-12 h-6 bg-emerald-500 group-hover:bg-rose-500 rounded-full transition-colors relative shadow-inner">
                    <div class="absolute top-[2px] right-[2px] bg-white rounded-full h-5 w-5 shadow transition-all flex items-center justify-center text-[10px] text-emerald-600 group-hover:text-rose-600 font-bold">
                      ✓
                    </div>
                  </div>
                </button>
              </div>
            `;
          } else {
            switchHtml = `
              <div class="flex items-center justify-center opacity-90 cursor-not-allowed">
                <div class="w-12 h-6 bg-emerald-500 rounded-full relative shadow-inner">
                  <div class="absolute top-[2px] right-[2px] bg-white rounded-full h-5 w-5 shadow flex items-center justify-center text-[10px] text-emerald-600 font-bold">
                    ✓
                  </div>
                </div>
              </div>
            `;
          }
        } else {
          switchHtml = `
            <div class="flex items-center justify-center">
              <label class="relative inline-flex items-center ${window.isCurrentTerm !== false ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'} select-none" onclick="event.stopPropagation()">
                <input type="checkbox" 
                       class="sr-only peer collect-student-cb" 
                       data-id="${s.student_id}" 
                       onchange="updateCollectSummary()"
                       ${window.isCurrentTerm !== false ? '' : 'disabled'}>
                <div class="w-12 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow peer-checked:after:translate-x-6 shadow-inner"></div>
              </label>
            </div>
          `;
        }

        let trClass = isPaid ? 'bg-slate-50/50 opacity-90' : 'hover:bg-slate-50/60 transition-colors';

        let roleTag = s.role === 'treasurer' ? '<span class="hidden sm:inline-flex text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-medium ml-1">💼 เหรัญญิก</span>' : '';

        const tr = document.createElement('tr');
        tr.className = trClass;
        tr.innerHTML = `
          <td class="px-2 sm:px-6 py-2 sm:py-4 text-center font-bold text-blue-600 bg-blue-50/20 rounded-xl">${sNum}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-4 font-mono text-xs font-bold text-slate-700 hidden sm:table-cell">${s.student_id}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-4 font-medium text-slate-800 text-xs sm:text-sm">
            ${s.name} ${roleTag}
            <div class="mt-0.5 font-mono text-[10px] text-slate-500 sm:hidden">${s.student_id}</div>
          </td>
          <td class="px-2 sm:px-6 py-2 sm:py-4 text-center whitespace-nowrap">${statusHtml}</td>
          <td class="px-2 sm:px-6 py-2 sm:py-4 text-center">${switchHtml}</td>
        `;

        tbody.appendChild(tr);
      });

      updateCollectSummary();
    }

    function cancelStudentPayment(studentId, studentName, weekId, amount, txId) {
      if (!currentUser || currentUser.role !== 'teacher') {
        Swal.fire({ icon: 'warning', title: 'เฉพาะคุณครูประจำชั้นเท่านั้นที่สามารถแก้ไขข้อมูลได้ครับ' });
        return;
      }

      Swal.fire({
        title: 'แก้ไข / ยกเลิกการจ่ายเงิน',
        html: `
          <div class="text-sm text-slate-600 text-left bg-slate-50 p-4 rounded-2xl space-y-1.5 border border-slate-200/80">
            <p>👤 <strong>นักเรียน:</strong> ${studentName} (${studentId})</p>
            <p>📅 <strong>รอบเก็บเงิน:</strong> ${weekId}</p>
            <p>💰 <strong>ยอดเงินที่บันทึกไว้:</strong> <span class="text-emerald-600 font-bold">${formatCurrency(amount)}</span></p>
          </div>
          <p class="text-xs text-rose-600 mt-3 font-medium">⚠️ หากกดยืนยัน ยอดเงินจะถูกหักออกจากกองกลาง และเปลี่ยนสถานะกลับเป็น "ยังไม่จ่าย" เพื่อให้ติ๊กเก็บเงินใหม่ได้</p>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: '🗑️ ยกเลิกการจ่ายเงิน (คืนสถานะ)',
        cancelButtonText: 'ปิด'
      }).then((result) => {
        if (result.isConfirmed) {
          showSyncToast('loading', 'กำลังยกเลิกรายการ...');

          if (isMock) {
            setTimeout(() => {
              appData.transactions = appData.transactions.filter(t => !(t.type === 'income' && String(t.week_id) === String(weekId) && String(t.student_id) === String(studentId)));
              const u = appData.users.find(x => String(x.student_id) === String(studentId));
              if (u) u.total_paid = Math.max(0, (parseFloat(u.total_paid) || 0) - (parseFloat(amount) || 0));
              appData.settings.current_balance = Math.max(0, appData.settings.current_balance - (parseFloat(amount) || 0));
              showSyncToast('success', 'ยกเลิกรายการเรียบร้อยแล้ว');
              renderCollectTable();
              renderDashboard();
            }, 500);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              if (res.success) {
                showSyncToast('success', res.message || 'ยกเลิกรายการเรียบร้อยแล้ว');
                loadData(true);
              } else {
                showSyncToast('error', res.message || 'เกิดข้อผิดพลาดในการยกเลิก');
              }
            })
            .withFailureHandler(err => {
              showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
            })
            .cancelStudentWeekPayment(studentId, weekId, txId);
        }
      });
    }

    function filterCollectTable() {
      const q = document.getElementById('searchCollectInput')?.value || '';
      renderCollectTable(q);
    }

    function updateCollectSummary() {
      const cbs = document.querySelectorAll('.collect-student-cb:checked');
      const count = cbs.length;
      const amountPerStudent = parseFloat(document.getElementById('colAmountInput')?.value) || 20;
      const total = count * amountPerStudent;
      const formattedTotal = total.toLocaleString('th-TH');

      const btnSubmit = document.getElementById('btnSubmitCollect');
      if (btnSubmit) {
        if (count > 0) {
          btnSubmit.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>บันทึกใหม่ ${count} คน จำนวน ${formattedTotal} บาท</span>
          `;
        } else {
          btnSubmit.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span>บันทึกการเก็บเงิน</span>
          `;
        }
      }
    }

    function submitBatchCollect() {
      const cbs = document.querySelectorAll('.collect-student-cb:checked');
      if (cbs.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'ยังไม่ได้เลือกนักเรียน',
          text: 'กรุณาติ๊กเลือกนักเรียนที่ต้องการบันทึกการเก็บเงินอย่างน้อย 1 คนครับ'
        });
        return;
      }

      if (!selectedCollectWeekId) {
        Swal.fire({ icon: 'warning', title: 'กรุณาเลือกรอบเก็บเงิน' });
        return;
      }

      const studentIds = [];
      cbs.forEach(cb => studentIds.push(cb.dataset.id));

      const amountPerStudent = parseFloat(document.getElementById('colAmountInput').value) || 20;
      const totalAmount = studentIds.length * amountPerStudent;
      const selectedWeekObj = appData.weeks.find(w => w.week_id === selectedCollectWeekId);
      const weekLabel = selectedWeekObj ? `ครั้งที่ ${selectedWeekObj.week_number}` : selectedCollectWeekId;
      const termStr = (appData.settings && appData.settings.current_semester && appData.settings.current_academic_year) ? ` ภาคเรียนที่ ${appData.settings.current_semester}/${appData.settings.current_academic_year}` : '';
      const note = `เงินห้องประจำ${weekLabel}${termStr}`;

      Swal.fire({
        title: 'ยืนยันการบันทึกเก็บเงิน?',
        html: `
          <div class="text-sm text-slate-600 text-left bg-slate-50 p-4 rounded-2xl space-y-1.5 border border-slate-200/60">
            <p>📅 <strong>รอบเก็บเงิน:</strong> ${weekLabel}</p>
            <p>👥 <strong>จำนวนที่เลือก:</strong> <span class="text-blue-600 font-bold">${studentIds.length} คน</span></p>
            <p>💰 <strong>ยอดเงินรวม:</strong> <span class="text-emerald-600 font-bold">${formatCurrency(totalAmount)}</span></p>
          </div>
        `,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยันบันทึก',
        cancelButtonText: 'ยกเลิก'
      }).then(result => {
        if (result.isConfirmed) {
          switchMainView('dashboard');
          showSyncToast('loading', `กำลังบันทึกเก็บเงิน ${studentIds.length} คน...`);

          const payload = {
            week_id: selectedCollectWeekId,
            academic_year: appData.settings.current_academic_year || '2569',
            semester: appData.settings.current_semester || '1',
            amount: amountPerStudent,
            recorded_by: currentUser ? currentUser.name : 'ผู้ดูแลระบบ',
            description: note,
            student_ids: studentIds
          };

          if (isMock) {
            setTimeout(() => {
              studentIds.forEach((sId, idx) => {
                appData.transactions.unshift({
                  tx_id: 'TX-' + (new Date().getTime() + idx),
                  student_id: sId,
                  week_id: selectedCollectWeekId,
                  amount: amountPerStudent,
                  type: 'income',
                  description: note,
                  timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
                  recorded_by: payload.recorded_by
                });
                const u = appData.users.find(x => String(x.student_id) === String(sId));
                if (u) u.total_paid = (parseFloat(u.total_paid) || 0) + amountPerStudent;
              });
              appData.settings.current_balance += totalAmount;
              showCenterLoader('success', 'บันทึกสำเร็จ');
              renderDashboard();
            }, 600);
            return;
          }

          google.script.run
            .withSuccessHandler(res => {
              if (res.success) {
                showCenterLoader('success', 'บันทึกสำเร็จ');
                loadData(true);
              } else {
                showCenterLoader('error', 'เกิดข้อผิดพลาดในการบันทึก', res.message);
              }
            })
            .withFailureHandler(err => {
              showSyncToast('error', 'เกิดข้อผิดพลาด: ' + err.message);
            })
            .addBatchIncome(payload);
        }
      });
    }

    function exportToExcel() {
      if (!currentUser || (currentUser.role !== 'teacher' && currentUser.role !== 'treasurer')) {
        Swal.fire({ icon: 'warning', title: 'เฉพาะคุณครูประจำชั้นหรือเหรัญญิกเท่านั้นที่สามารถส่งออกข้อมูลได้ครับ' });
        return;
      }

      if (!appData.transactions || appData.transactions.length === 0) {
        Swal.fire({ icon: 'warning', title: 'ไม่มีข้อมูลสำหรับส่งออก' });
        return;
      }
      
      const formattedData = appData.transactions.map(t => {
        let typeText = 'รายรับ';
        if (t.type === 'expense') typeText = 'รายจ่าย';
        else if (t.type === 'fine') typeText = 'ค่าปรับ';
        
        let txDate = t.timestamp;
        try {
          const d = new Date(t.timestamp);
          if (!isNaN(d.getTime())) {
            txDate = d.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
          }
        } catch(e) {}

        return {
          'รหัสอ้างอิง': t.tx_id,
          'วันที่-เวลา': txDate,
          'ประเภท': typeText,
          'รายการ': t.description || (t.isBatch ? 'เก็บเงินรายครั้ง' : ''),
          'รหัสผู้จ่าย/ผู้รับ': t.student_id === 'ROOM' ? 'เงินกองกลาง' : t.student_id,
          'จำนวนเงิน (บาท)': parseFloat(t.amount) || 0,
          'ผู้บันทึก': t.recorded_by || '-',
          'เทอม': t.semester || '1',
          'ปีการศึกษา': t.academic_year || '-'
        };
      });

      const ws = XLSX.utils.json_to_sheet(formattedData);
      
      // Auto-size columns slightly
      const wscols = [
        {wch: 15}, {wch: 20}, {wch: 10}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 20}, {wch: 8}, {wch: 12}
      ];
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ประวัติการเงิน");
      const cleanClass = (appData.settings && appData.settings.class_name ? appData.settings.class_name : 'ม4_7').replace(/[^a-zA-Z0-9ก-๙]/g, '_');
      XLSX.writeFile(wb, `ClassFund_${cleanClass}_${new Date().toISOString().split('T')[0]}.xlsx`);
    }

  

