const db = firebase.firestore();

const API = {
  async getDashboardData(role, studentId) {
    const [usersSnap, weeksSnap, txSnap, settingsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('weeks').orderBy('week_number', 'asc').get(),
      db.collection('transactions').orderBy('timestamp', 'desc').get(),
      db.collection('settings').doc('global').get()
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
    let usersSnap = await db.collection('users').where('student_id', '==', String(studentId)).get();
    if (usersSnap.empty) {
      usersSnap = await db.collection('users').where('student_id', '==', Number(studentId)).get();
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
      
      // Clean up undefined values
      Object.keys(txObj).forEach(key => {
        if (txObj[key] === undefined || txObj[key] === null) delete txObj[key];
      });

      const amt = parseFloat(txObj.amount) || 0;

      // Step 1: Save the transaction
      await db.collection('transactions').doc(txObj.tx_id).set(txObj);

      // Step 2: Read current balance
      const settingsRef = db.collection('settings').doc('global');
      const settingsDoc = await settingsRef.get();
      let current_balance = 0;
      if (settingsDoc.exists && settingsDoc.data()) {
        current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
      }

      // Step 3: Update balance
      if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
        await settingsRef.set({ current_balance: current_balance + amt }, { merge: true });
        
        // Step 4: Update student total_paid
        if (txObj.student_id && txObj.student_id !== 'ROOM') {
          const usersSnap = await db.collection('users').where('student_id', '==', String(txObj.student_id)).get();
          if (!usersSnap.empty) {
            const uDoc = usersSnap.docs[0];
            const uData = uDoc.data();
            const curPaid = parseFloat(uData.total_paid) || 0;
            await db.collection('users').doc(uDoc.id).set({ total_paid: curPaid + amt }, { merge: true });
          }
        }
      } else if (txObj.type === 'expense') {
        await settingsRef.set({ current_balance: current_balance - amt }, { merge: true });
      }

      return { success: true, message: 'Success', tx_id: txObj.tx_id };
    } catch (err) {
      console.error('addTransaction error detail:', err);
      throw new Error('บันทึกไม่สำเร็จ: ' + (err.code || '') + ' ' + (err.message || String(err)));
    }
  },

  async deleteTransaction(txId) {
    const docRef = db.collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'Not found' };
    const txObj = doc.data();

    const amt = parseFloat(txObj.amount) || 0;
    const settingsRef = db.collection('settings').doc('global');
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
    await db.collection('weeks').doc(weekObj.week_id).set(weekObj);
    return { success: true, message: 'Success' };
  },

  async deleteWeek(weekId) {
    await db.collection('weeks').doc(weekId).delete();
    return { success: true, message: 'Deleted' };
  },

  async updateClassSettings(settings) {
    await db.collection('settings').doc('global').set(settings, { merge: true });
    return { success: true, message: 'Success', settings: settings };
  },
  
  async addBatchIncome(payload) {
    const batch = db.batch();
    let totalAmt = 0;
    const weekId = payload.week_id || payload.weekId;
    const studentIds = payload.student_ids || payload.studentIds;
    const amount = payload.amount || payload.amountPerStudent;
    const recordedBy = payload.recorded_by || payload.recordedBy;
    
    for (let sid of studentIds) {
       let tx = {
         tx_id: 'TX' + Date.now() + Math.floor(Math.random()*1000),
         timestamp: new Date().toISOString(),
         type: 'income',
         week_id: weekId,
         student_id: sid,
         amount: parseFloat(amount),
         recorded_by: recordedBy,
         isBatch: true
       };
       const docRef = db.collection('transactions').doc(tx.tx_id);
       batch.set(docRef, tx);
       totalAmt += parseFloat(amount);
       
       const userSnap = await db.collection('users').where('student_id', '==', sid).get();
       if(!userSnap.empty) {
         const uDoc = userSnap.docs[0];
         const curPaid = parseFloat(uDoc.data().total_paid) || 0;
         batch.set(db.collection('users').doc(uDoc.id), {
           total_paid: curPaid + parseFloat(amount)
         }, { merge: true });
       }
    }
    
    const settingsRef = db.collection('settings').doc('global');
    const settingsDoc = await settingsRef.get();
    let current_balance = 0;
    if (settingsDoc.exists) current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
    batch.set(settingsRef, {
      current_balance: current_balance + totalAmt
    }, { merge: true });

    await batch.commit();
    return { success: true, message: 'Success' };
  },
  
  async cancelStudentWeekPayment(studentId, weekId, txId) {
    const docRef = db.collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'Not found' };
    
    const docData = doc.data();
    const amt = parseFloat(docData.amount) || 0;
    const batch = db.batch();
    batch.delete(docRef);
    
    const settingsRef = db.collection('settings').doc('global');
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
  
  async addUser(payload) {
    const hashed = await this.hashPassword(payload.password || '1234');
    payload.password_hash = hashed;
    delete payload.password;
    await db.collection('users').add({ ...payload, total_paid: 0 });
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


