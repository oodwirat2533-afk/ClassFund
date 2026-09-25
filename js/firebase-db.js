const db = firebase.firestore();

const DBState = { currentRoomId: null };

const API = {

  async getAllRooms() {
    const snap = await db.collection('rooms').orderBy('created_at', 'desc').get();
    return { success: true, data: snap.docs.map(d => d.data()) };
  },
  
  async createRoom(payload) {
    try {
      const batch = db.batch();
      const roomId = 'room_' + Date.now();
      
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
      return { success: false, message: '��辺���ʻ�Шӵ�ǹ����к�' };
    }
    const user = usersSnap.docs[0].data();
    if (user.role === 'student') { return { success: false, message: 'ไม่มีสิทธิ์เข้าถึง' }; }
    if (user.password_hash === hashedPin) {
      return { success: true, user: user };
    } else {
      return { success: false, message: '���ʼ�ҹ���١��ͧ' };
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
      return { success: true, message: 'Success', tx_id: txObj.tx_id };
    } catch (err) {
      console.error('addTransaction error detail:', err);
      throw new Error('บันทึกไม่สำเร็จ: ' + (err.code || '') + ' ' + (err.message || String(err)));
    }
  },

  async deleteTransaction(txId) {
    const docRef = db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'Not found' };
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
    return { success: true, message: 'Deleted' };
  },
  
  async addWeek(weekObj) {
    weekObj.week_id = 'W' + Date.now();
    await db.collection('rooms').doc(DBState.currentRoomId).collection('weeks').doc(weekObj.week_id).set(weekObj);
    return { success: true, message: 'Success' };
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
    return { success: true, message: 'Deleted' };
  },

  async updateClassSettings(settings) {
    await db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global').set(settings, { merge: true });
    return { success: true, message: 'Success', settings: settings };
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
      return { success: true, message: 'Success' };
    } catch (err) {
      console.error('addBatchIncome error:', err);
      throw new Error('บันทึกไม่สำเร็จ: ' + err.message);
    }
  },
  
  async cancelStudentWeekPayment(studentId, weekId, txId) {
    const docRef = db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'Not found' };
    
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
    return { success: true, message: 'Cancelled' };
  },
  
  async deleteStudent(studentId) {
    const usersSnap = await db.collection('users').where('student_id', '==', studentId).get();
    if (!usersSnap.empty) {
      await db.collection('users').doc(usersSnap.docs[0].id).delete();
      return { success: true, message: 'Deleted' };
    }
    return { success: false, message: 'Not found' };
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
    return { success: true, message: 'Success' };
  },

  async setUserRole(studentId, role, pwd) {
    const usersSnap = await db.collection('users').where('student_id', '==', String(studentId)).get();
    if (!usersSnap.empty) {
      const updateData = { role: role };
      if (pwd) {
         updateData.password_hash = await this.hashPassword(pwd);
      }
      await db.collection('users').doc(usersSnap.docs[0].id).update(updateData);
      return { success: true, message: 'Success' };
    }
    return { success: false, message: 'Not found' };
  },
  
  async rollOverSemester(newClass, newYear, newSem, userName) {
    try {
      const settingsRef = db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global');
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
        if (successHandler) successHandler({ success: true, message: 'Mocked ' + prop });
      };
    }
  });
}

window.google.script.run = createRunProxy(null, null);
console.log('Firebase backend bridge initialized.');


