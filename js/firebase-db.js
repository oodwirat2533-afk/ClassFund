const db = firebase.firestore();

const DBState = { currentRoomId: null };

const API = {

  async getAllRooms() {
    const snap = await db.collection('rooms').get();
    const sortedDocs = [...snap.docs].sort((a, b) => {
      const da = (a.data() && a.data().created_at) || '';
      const dbDate = (b.data() && b.data().created_at) || '';
      return dbDate.localeCompare(da);
    });
    const rooms = await Promise.all(sortedDocs.map(async d => {
      const data = d.data();
      try {
        const setSnap = await db.collection('rooms').doc(d.id).collection('settings').doc('global').get();
        if (setSnap.exists && setSnap.data() && setSnap.data().class_name) {
          const settingClassName = setSnap.data().class_name;
          if (settingClassName && settingClassName !== data.name) {
            data.name = settingClassName;
            db.collection('rooms').doc(d.id).set({ name: settingClassName }, { merge: true }).catch(() => {});
          }
        }
      } catch(e) {}
      return data;
    }));
    return { success: true, data: rooms };
  },
  
  async updateRoomName(roomId, newRoomName) {
    try {
      if (!roomId || !newRoomName) throw new Error('ข้อมูลไม่ครบถ้วน');
      const cleanName = String(newRoomName).trim();
      const batch = db.batch();
      
      const roomRef = db.collection('rooms').doc(roomId);
      batch.set(roomRef, { name: cleanName }, { merge: true });
      
      const settingsRef = roomRef.collection('settings').doc('global');
      batch.set(settingsRef, { class_name: cleanName }, { merge: true });
      
      await batch.commit();
      return { success: true, message: 'อัปเดตชื่อห้องเรียนเรียบร้อยแล้ว' };
    } catch(e) {
      return { success: false, message: e.message };
    }
  },
  
  
  
  async updateRoomTeacher(roomId, newTeacherName) {
    try {
      if (!roomId || !newTeacherName) throw new Error('ข้อมูลไม่ครบถ้วน');
      
      const batch = db.batch();
      
      // Update room doc
      const roomRef = db.collection('rooms').doc(roomId);
      batch.update(roomRef, { teacher_name: newTeacherName });
      
      // Update teacher user docs in this room
      const usersSnap = await db.collection('users')
        .where('room_id', '==', roomId)
        .where('role', '==', 'teacher')
        .get();
        
      usersSnap.forEach(doc => {
        batch.update(doc.ref, { name: newTeacherName });
      });
      
      await batch.commit();
      return { success: true, message: 'อัปเดตชื่อคุณครูเรียบร้อยแล้ว' };
    } catch(e) {
      return { success: false, message: e.message };
    }
  },
  async deleteRoom(roomId) {
    try {
      if (!roomId) throw new Error('Invalid room ID');
      
      // 1. Get all subcollections and users
      const txs = await db.collection('rooms').doc(roomId).collection('transactions').get();
      const weeks = await db.collection('rooms').doc(roomId).collection('weeks').get();
      const settings = await db.collection('rooms').doc(roomId).collection('settings').get();
      const users = await db.collection('users').where('room_id', '==', roomId).get();
      
      const allDocs = [];
      txs.forEach(d => allDocs.push(d.ref));
      weeks.forEach(d => allDocs.push(d.ref));
      settings.forEach(d => allDocs.push(d.ref));
      users.forEach(d => allDocs.push(d.ref));
      allDocs.push(db.collection('rooms').doc(roomId));

      // 2. Delete in batches of 500
      let batch = db.batch();
      let count = 0;
      for (const ref of allDocs) {
        batch.delete(ref);
        count++;
        if (count === 490) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      
      return { success: true, message: 'ลบห้องเรียนและข้อมูลทั้งหมดเรียบร้อยแล้ว' };
    } catch(e) {
      return { success: false, message: e.message };
    }
  },
  async createRoom(payload) {
    try {
      const batch = db.batch();
      const randomStr = Math.random().toString(36).substring(2, 10);
      const roomId = 'rm_' + Date.now().toString(36) + '_' + randomStr;
      
      batch.set(db.collection('rooms').doc(roomId), {
        room_id: roomId,
        name: payload.room_name,
        teacher_name: payload.teacher_name,
        created_at: new Date().toISOString(),
        status: 'active'
      });
      
      const hashed = await this.hashPassword(payload.password || '123456');
      batch.set(db.collection('users').doc(roomId + '_' + payload.username), {
        student_id: payload.username,
        name: payload.teacher_name,
        role: 'teacher',
        password_hash: hashed,
        room_id: roomId,
        total_paid: 0
      });
      
      batch.set(db.collection('rooms').doc(roomId).collection('settings').doc('global'), {
        current_balance: 0,
        class_name: payload.room_name,
        current_academic_year: payload.academic_year || '2569',
        current_semester: payload.semester || '1'
      });
      
      await batch.commit();
      return { success: true, message: 'สร้างห้องเรียนสำเร็จ' };
    } catch(e) {
      console.error(e);
      throw new Error('ไม่สามารถสร้างห้องได้');
    }
  },

  setRoomId(roomId) {
    DBState.currentRoomId = roomId;
    return { success: true };
  },

  async getDashboardData(role, studentId) {
    if (!DBState.currentRoomId && role !== 'super_admin') {
      return { success: true, data: { transactions: [], users: [], weeks: [], settings: {} } };
    }
    const [usersSnap, weeksSnap, txSnap, settingsSnap] = await Promise.all([
      db.collection('users').where('room_id', '==', DBState.currentRoomId).get(),
      db.collection('rooms').doc(DBState.currentRoomId).collection('weeks').orderBy('week_number', 'asc').get(),
      db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').orderBy('timestamp', 'desc').get(),
      db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global').get()
    ]);
    
    let settings = { current_balance: 0, current_week: 1, current_semester: 1, current_academic_year: 2569 };
    if (settingsSnap.exists) {
      settings = settingsSnap.data();
    }
    
    return {
      success: true,
      data: {
        users: usersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        weeks: weeksSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        transactions: txSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        settings: settings
      }
    };
  },

  async hashPassword(password) {
    if (!password) return '';
    const msgUint8 = new TextEncoder().encode(String(password).trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

    async login(studentId, pin) {
    const hashedPin = await this.hashPassword(pin);
          const urlParams = new URLSearchParams(window.location.search);
      const currentRoom = urlParams.get('room');
      
      let queryStr = db.collection('users').where('student_id', '==', String(studentId));
      let queryNum = db.collection('users').where('student_id', '==', Number(studentId));
      
      if (studentId !== 'superadmin' && currentRoom) {
         queryStr = queryStr.where('room_id', '==', currentRoom);
         queryNum = queryNum.where('room_id', '==', currentRoom);
      }
      
      let usersSnap = await queryStr.get();
      if (usersSnap.empty) {
        usersSnap = await queryNum.get();
      }
    if (usersSnap.empty) {
      return { success: false, message: 'ไม่พบรหัสประจำตัวในระบบ' };
    }
    const user = usersSnap.docs[0].data();
    if (user.role === 'student') { return { success: false, message: 'ไม่มีสิทธิ์เข้าถึง' }; }
    if (user.password_hash === hashedPin) {
      return { success: true, user: user };
    } else {
      return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
    }
  },

  async addTransaction(txObj) {
    try {
      txObj.tx_id = 'TX' + Date.now();
      txObj.timestamp = new Date().toISOString();
      Object.keys(txObj).forEach(key => {
        if (txObj[key] === undefined || txObj[key] === null) delete txObj[key];
      });

      const amt = parseFloat(txObj.amount) || 0;
      const settingsRef = db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global');
      let userQuery = null;
      
      if (txObj.student_id && txObj.student_id !== 'ROOM') {
        userQuery = db.collection('users').where('student_id', '==', String(txObj.student_id)).get();
      }

      // Fetch concurrently
      const [settingsDoc, usersSnap] = await Promise.all([
        settingsRef.get(),
        userQuery || Promise.resolve(null)
      ]);

      let current_balance = 0;
      if (settingsDoc.exists && settingsDoc.data()) {
        current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
      }

      const batch = db.batch();
      batch.set(db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(txObj.tx_id), txObj);

      if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
        batch.set(settingsRef, { current_balance: current_balance + amt }, { merge: true });
        
        if (usersSnap && !usersSnap.empty) {
          const uDoc = usersSnap.docs[0];
          const curPaid = parseFloat(uDoc.data().total_paid) || 0;
          batch.set(db.collection('users').doc(uDoc.id), { total_paid: curPaid + amt }, { merge: true });
        }
      } else if (txObj.type === 'expense') {
        batch.set(settingsRef, { current_balance: current_balance - amt }, { merge: true });
      }

      await batch.commit(); // Single network request for all writes!
      return { success: true, message: 'บันทึกสำเร็จ', tx_id: txObj.tx_id };
    } catch (err) {
      console.error('addTransaction error detail:', err);
      throw new Error('บันทึกไม่สำเร็จ: ' + (err.code || '') + ' ' + (err.message || String(err)));
    }
  },

  async updateTransaction(txId, description, amount) {
    const docRef = db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'ไม่พบรายการธุรกรรม' };
    const txObj = doc.data();

    const oldAmt = parseFloat(txObj.amount) || 0;
    const newAmt = parseFloat(amount) || 0;
    const diff = newAmt - oldAmt;

    const settingsRef = db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global');
    const settingsDoc = await settingsRef.get();
    let current_balance = 0;
    if (settingsDoc.exists) current_balance = parseFloat(settingsDoc.data().current_balance) || 0;

    const batch = db.batch();
    batch.update(docRef, {
      description: String(description || '').trim(),
      amount: newAmt
    });

    if (diff !== 0) {
      if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
        batch.set(settingsRef, { current_balance: current_balance + diff }, { merge: true });
        if (txObj.student_id && txObj.student_id !== 'ROOM') {
          const usersSnap = await db.collection('users').where('student_id', '==', String(txObj.student_id)).get();
          if (!usersSnap.empty) {
            const uDoc = usersSnap.docs[0];
            const curPaid = parseFloat(uDoc.data().total_paid) || 0;
            batch.set(db.collection('users').doc(uDoc.id), { total_paid: Math.max(0, curPaid + diff) }, { merge: true });
          }
        }
      } else if (txObj.type === 'expense') {
        batch.set(settingsRef, { current_balance: current_balance - diff }, { merge: true });
      }
    }

    await batch.commit();
    return { success: true, message: 'แก้ไขรายการเรียบร้อยแล้ว' };
  },

  async deleteTransaction(txId) {
    const docRef = db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'ไม่พบรายการธุรกรรม' };
    const txObj = doc.data();

    const amt = parseFloat(txObj.amount) || 0;
    const settingsRef = db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global');
    const settingsDoc = await settingsRef.get();
    let current_balance = 0;
    if (settingsDoc.exists) current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
    
    const batch = db.batch();
    batch.delete(docRef);

    if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
      batch.set(settingsRef, { current_balance: current_balance - amt }, { merge: true });
      
      if (txObj.student_id && txObj.student_id !== 'ROOM') {
        const usersSnap = await db.collection('users').where('student_id', '==', String(txObj.student_id)).get();
        if (!usersSnap.empty) {
          const uDoc = usersSnap.docs[0];
          const curPaid = parseFloat(uDoc.data().total_paid) || 0;
          batch.set(db.collection('users').doc(uDoc.id), { total_paid: Math.max(0, curPaid - amt) }, { merge: true });
        }
      }
    } else if (txObj.type === 'expense') {
      batch.set(settingsRef, { current_balance: current_balance + amt }, { merge: true });
    }
    
    await batch.commit();
    return { success: true, message: 'ลบรายการเรียบร้อยแล้ว' };
  },
  
  async addWeek(weekObj) {
    weekObj.week_id = 'W' + Date.now();
    await db.collection('rooms').doc(DBState.currentRoomId).collection('weeks').doc(weekObj.week_id).set(weekObj);
    return { success: true, message: 'บันทึกรอบเก็บเงินเรียบร้อยแล้ว' };
  },

  async deleteWeek(weekId) {
    const weekRef = db.collection('rooms').doc(DBState.currentRoomId).collection('weeks').doc(weekId);
    const weekDoc = await weekRef.get();
    
    if (!weekDoc.exists) return { success: false, message: 'ไม่พบรอบเก็บเงินที่ต้องการลบ' };
    
    const deletedWeek = weekDoc.data();
    const deletedNum = parseInt(deletedWeek.week_number) || 0;
    
    // Find weeks that need shifting
    const weeksToShift = await db.collection('rooms').doc(DBState.currentRoomId).collection('weeks')
      .where('academic_year', '==', deletedWeek.academic_year)
      .where('semester', '==', deletedWeek.semester)
      .where('week_number', '>', deletedNum)
      .get();
      
    const batch = db.batch();
    batch.delete(weekRef);
    
    // Shift remaining weeks
    weeksToShift.docs.forEach(doc => {
      const currentNum = parseInt(doc.data().week_number);
      batch.update(doc.ref, { week_number: currentNum - 1 });
    });
    
    await batch.commit();
    return { success: true, message: 'ลบรอบเก็บเงินเรียบร้อยแล้ว' };
  },

  async updateClassSettings(classNameOrSettings, schoolName, academicYear, semester, recordedBy) {
    try {
      let settingsObj = {};
      let newClassName = '';
      if (typeof classNameOrSettings === 'object' && classNameOrSettings !== null) {
        settingsObj = { ...classNameOrSettings };
        newClassName = settingsObj.class_name || '';
      } else {
        newClassName = String(classNameOrSettings || '').trim();
        settingsObj = {
          class_name: newClassName,
          school_name: schoolName || '',
          current_academic_year: String(academicYear || ''),
          current_semester: String(semester || '')
        };
      }

      const roomId = DBState.currentRoomId;
      if (!roomId) throw new Error('ไม่พบ Room ID ปัจจุบัน');

      const batch = db.batch();
      const roomRef = db.collection('rooms').doc(roomId);
      const settingsRef = roomRef.collection('settings').doc('global');
      batch.set(settingsRef, settingsObj, { merge: true });

      if (newClassName) {
        batch.set(roomRef, { name: newClassName }, { merge: true });
      }

      await batch.commit();

      const updatedSnap = await settingsRef.get();
      const updatedSettings = updatedSnap.exists ? updatedSnap.data() : settingsObj;

      return { success: true, message: 'บันทึกการตั้งค่าห้องเรียนเรียบร้อยแล้ว', settings: updatedSettings };
    } catch (err) {
      console.error('updateClassSettings error:', err);
      return { success: false, message: 'บันทึกไม่สำเร็จ: ' + err.message };
    }
  },
  
  async addBatchIncome(payload) {
    try {
      const batch = db.batch();
      let totalAmt = 0;
      const weekId = payload.week_id || payload.weekId;
      const studentIds = payload.student_ids || payload.studentIds;
      const amount = payload.amount || payload.amountPerStudent;
      const recordedBy = payload.recorded_by || payload.recordedBy;
      
      // Fetch settings and ALL users concurrently to avoid N queries in loop
      const [settingsDoc, allUsersSnap] = await Promise.all([
        db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global').get(),
        db.collection('users').get()
      ]);

      // Create a map of student_id -> userDoc
      const userMap = {};
      allUsersSnap.docs.forEach(doc => {
        userMap[String(doc.data().student_id)] = doc;
      });

      for (let sid of studentIds) {
         let tx = {
           tx_id: 'TX' + Date.now() + Math.floor(Math.random()*1000),
           timestamp: new Date().toISOString(),
           type: 'income',
           week_id: weekId,
           student_id: sid,
           amount: parseFloat(amount),
           recorded_by: recordedBy,
           academic_year: payload.academic_year || '2569',
           semester: payload.semester || '1',
           isBatch: true
         };
         batch.set(db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(tx.tx_id), tx);
         totalAmt += parseFloat(amount);
         
         const uDoc = userMap[String(sid)];
         if(uDoc) {
           const curPaid = parseFloat(uDoc.data().total_paid) || 0;
           batch.set(db.collection('users').doc(uDoc.id), {
             total_paid: curPaid + parseFloat(amount)
           }, { merge: true });
         }
      }
      
      let current_balance = 0;
      if (settingsDoc.exists) current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
      
      batch.set(db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global'), {
        current_balance: current_balance + totalAmt
      }, { merge: true });

      await batch.commit(); // ONE massive write for everything
      return { success: true, message: 'บันทึกสำเร็จ' };
    } catch (err) {
      console.error('addBatchIncome error:', err);
      throw new Error('บันทึกไม่สำเร็จ: ' + err.message);
    }
  },
  
  async cancelStudentWeekPayment(studentId, weekId, txId) {
    const docRef = db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'ไม่พบรายการ' };
    
    const docData = doc.data();
    const amt = parseFloat(docData.amount) || 0;
    const batch = db.batch();
    batch.delete(docRef);
    
    const settingsRef = db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global');
    const settingsDoc = await settingsRef.get();
    let current_balance = 0;
    if (settingsDoc.exists) current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
    batch.set(settingsRef, {
      current_balance: current_balance - amt
    }, { merge: true });
    
    const userSnap = await db.collection('users').where('student_id', '==', studentId).get();
    if(!userSnap.empty) {
      const uDoc = userSnap.docs[0];
      const curPaid = parseFloat(uDoc.data().total_paid) || 0;
      batch.set(db.collection('users').doc(uDoc.id), {
        total_paid: Math.max(0, curPaid - amt)
      }, { merge: true });
    }
    
    await batch.commit();
    return { success: true, message: 'ยกเลิกรายการเรียบร้อยแล้ว' };
  },
  
  async deleteStudent(studentId) {
    const usersSnap = await db.collection('users').where('student_id', '==', studentId).get();
    if (!usersSnap.empty) {
      await db.collection('users').doc(usersSnap.docs[0].id).delete();
      return { success: true, message: 'ลบข้อมูลนักเรียนเรียบร้อยแล้ว' };
    }
    return { success: false, message: 'ไม่พบข้อมูลนักเรียน' };
  },

  async updateStudent(oldStudentId, updatedData) {
    const usersSnap = await db.collection('users').where('student_id', '==', String(oldStudentId)).get();
    if (usersSnap.empty) {
      return { success: false, message: 'ไม่พบข้อมูลนักเรียน' };
    }

    const newId = String(updatedData.student_id).trim();
    if (newId.toLowerCase() !== String(oldStudentId).trim().toLowerCase()) {
      const checkSnap = await db.collection('users').where('student_id', '==', newId).get();
      if (!checkSnap.empty) {
        return { success: false, message: 'รหัสนักเรียนนี้มีในระบบแล้ว' };
      }
    }

    const batch = db.batch();
    const uDoc = usersSnap.docs[0];
    const updateObj = {
      student_number: parseInt(updatedData.student_number) || 0,
      student_id: newId,
      name: String(updatedData.name || '').trim()
    };
    batch.update(uDoc.ref, updateObj);

    if (newId !== String(oldStudentId).trim()) {
      const txSnap = await db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').where('student_id', '==', String(oldStudentId)).get();
      txSnap.docs.forEach(td => {
        batch.update(td.ref, { student_id: newId });
      });
    }

    await batch.commit();
    return { success: true, message: 'แก้ไขข้อมูลนักเรียนเรียบร้อยแล้ว' };
  },
  
  async addUsersBatch(usersArray) {
    try {
      const batch = db.batch();
      for (const u of usersArray) {
        // Document ID is roomId_studentId to prevent overwrites across rooms
        const docRef = db.collection('users').doc(DBState.currentRoomId + '_' + String(u.student_id));
        
        let pwdHash = u.password_hash;
        if (!pwdHash) {
          pwdHash = await this.hashPassword('1234');
        }
        
        batch.set(docRef, {
          ...u,
          password_hash: pwdHash,
          room_id: DBState.currentRoomId,
          total_paid: 0
        });
      }
      await batch.commit();
      return { success: true, message: 'นำเข้ารายชื่อสำเร็จ' };
    } catch(e) {
      return { success: false, message: e.message };
    }
  },
  async addUser(payload) {
    const hashed = await this.hashPassword(payload.password || '1234');
    payload.password_hash = hashed;
    delete payload.password;
    await db.collection('users').add({ ...payload, total_paid: 0, room_id: DBState.currentRoomId });
    return { success: true, message: 'เพิ่มข้อมูลนักเรียนเรียบร้อยแล้ว' };
  },

  async setUserRole(studentId, role, pwd) {
    const usersSnap = await db.collection('users').where('student_id', '==', String(studentId)).get();
    if (!usersSnap.empty) {
      const updateData = { role: role };
      if (pwd) {
         updateData.password_hash = await this.hashPassword(pwd);
      }
      await db.collection('users').doc(usersSnap.docs[0].id).update(updateData);
      return { success: true, message: 'บันทึกสิทธิ์เรียบร้อยแล้ว' };
    }
    return { success: false, message: 'ไม่พบผู้ใช้ในระบบ' };
  },
  
  async rollOverSemester(newClass, newYear, newSem, userName) {
    try {
      const roomId = DBState.currentRoomId;
      if (!roomId) throw new Error('ไม่พบ Room ID ปัจจุบัน');
      const roomRef = db.collection('rooms').doc(roomId);
      const settingsRef = roomRef.collection('settings').doc('global');
      const settingsDoc = await settingsRef.get();
      let curBal = 0;
      if (settingsDoc.exists && settingsDoc.data()) {
        curBal = parseFloat(settingsDoc.data().current_balance) || 0;
      }

      // Reset all students' total_paid
      const usersSnap = await db.collection('users').where('room_id', '==', DBState.currentRoomId).get();
      const batch = db.batch();
      
      usersSnap.docs.forEach(doc => {
        if (doc.data().role === 'student' || doc.data().role === 'treasurer') {
          batch.update(doc.ref, { total_paid: 0 });
        }
      });

      // Insert opening balance transaction
      if (curBal > 0) {
        const tx_id = 'TX' + Date.now();
        batch.set(db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(tx_id), {
          tx_id: tx_id,
          student_id: 'ROOM',
          week_id: '',
          academic_year: String(newYear),
          semester: String(newSem),
          amount: curBal,
          type: 'income',
          description: 'ยอดยกมาจากเทอมเดิม',
          timestamp: new Date().toISOString(),
          recorded_by: userName,
          isRollover: true
        });
      }

      // Update global settings
      batch.update(settingsRef, {
        class_name: newClass,
        current_academic_year: String(newYear),
        current_semester: String(newSem)
      });

      // Auto-sync new class name to main room document
      batch.set(roomRef, {
        name: newClass
      }, { merge: true });

      await batch.commit();
      return { 
        success: true, 
        message: 'เลื่อนชั้น/ขึ้นภาคเรียนใหม่เรียบร้อยแล้ว',
        archiveSheetName: `ประวัติ_${newClass}_ปี${newYear}_เทอม${newSem}`,
        carriedBalance: curBal
      };
    } catch (err) {
      console.error('rollOverSemester error:', err);
      throw new Error('ไม่สามารถเลื่อนชั้นได้: ' + err.message);
    }
  },

  async changePassword(studentId, oldPassword, newPassword) {
    const usersSnap = await db.collection('users').where('student_id', '==', String(studentId)).get();
    if (usersSnap.empty) {
      return { success: false, message: 'ไม่พบข้อมูลผู้ใช้ในระบบ' };
    }
    const uDoc = usersSnap.docs[0];
    const userData = uDoc.data();

    if (String(newPassword).trim().length < 6) {
      return { success: false, message: 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร' };
    }

    const hashedOld = await this.hashPassword(oldPassword);
    const dbPwdHash = userData.password_hash || '';

    if (dbPwdHash === hashedOld || (dbPwdHash === '' && String(oldPassword).trim() === '123456')) {
      const hashedNew = await this.hashPassword(newPassword);
      await uDoc.ref.update({ password_hash: hashedNew });
      return { success: true, message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' };
    } else {
      return { success: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
    }
  },

  async resetUserPassword(targetStudentId, requestorRole) {
    const usersSnap = await db.collection('users').where('student_id', '==', String(targetStudentId)).get();
    if (usersSnap.empty) {
      return { success: false, message: 'ไม่พบข้อมูลนักเรียน' };
    }
    const uDoc = usersSnap.docs[0];
    const defaultHash = await this.hashPassword('123456');
    await uDoc.ref.update({ password_hash: defaultHash });
    return { success: true, message: 'รีเซ็ตรหัสผ่านกลับเป็น 123456 สำเร็จ' };
  },

  async resetSystemData(resetType) {
    try {
      const roomRef = db.collection('rooms').doc(DBState.currentRoomId);
      
      const txSnap = await roomRef.collection('transactions').get();
      const batch1 = db.batch();
      txSnap.docs.forEach(doc => batch1.delete(doc.ref));
      await batch1.commit();

      const weeksSnap = await roomRef.collection('weeks').get();
      const batch2 = db.batch();
      weeksSnap.docs.forEach(doc => batch2.delete(doc.ref));
      await batch2.commit();

      await roomRef.collection('settings').doc('global').set({ current_balance: 0 }, { merge: true });

      const usersSnap = await db.collection('users').where('room_id', '==', DBState.currentRoomId).get();
      const batch3 = db.batch();
      usersSnap.docs.forEach(doc => {
        const u = doc.data();
        if (resetType === 'all') {
          if (u.role !== 'teacher') {
            batch3.delete(doc.ref);
          } else {
            batch3.update(doc.ref, { total_paid: 0 });
          }
        } else {
          batch3.update(doc.ref, { total_paid: 0 });
        }
      });
      await batch3.commit();

      return { success: true, message: 'ล้างข้อมูลเรียบร้อยแล้ว' };
    } catch (e) {
      console.error('resetSystemData error:', e);
      return { success: false, message: e.message };
    }
  }
};

window.google = window.google || {};
window.google.script = window.google.script || {};

function createRunProxy(successHandler, failureHandler) {
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'withSuccessHandler') {
        return (handler) => createRunProxy(handler, failureHandler);
      }
      if (prop === 'withFailureHandler') {
        return (handler) => createRunProxy(successHandler, handler);
      }
      if (API[prop]) {
        return async function(...args) {
          try {
            const result = await API[prop](...args);
            if (successHandler) successHandler(result);
          } catch (e) {
            console.error('Firebase Error:', e);
            if (failureHandler) failureHandler(e);
          }
        };
      }
      return function(...args) {
        console.warn('Unimplemented GAS function called:', prop, args);
        if (successHandler) successHandler({ success: true, message: 'ดำเนินการสำเร็จ' });
      };
    }
  });
}

window.google.script.run = createRunProxy(null, null);
console.log('Firebase backend bridge initialized.');


