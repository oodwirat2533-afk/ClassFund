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
    txObj.tx_id = 'TX' + Date.now();
    txObj.timestamp = new Date().toISOString();
    await db.collection('transactions').doc(txObj.tx_id).set(txObj);

    if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
      await db.collection('settings').doc('global').set({
        current_balance: firebase.firestore.FieldValue.increment(parseFloat(txObj.amount))
      }, { merge: true });
    } else if (txObj.type === 'expense') {
      await db.collection('settings').doc('global').set({
        current_balance: firebase.firestore.FieldValue.increment(-parseFloat(txObj.amount))
      }, { merge: true });
    }
    return { success: true, message: 'Success', tx_id: txObj.tx_id };
  },

  async deleteTransaction(txId) {
    const docRef = db.collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'Not found' };
    const txObj = doc.data();

    if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
      await db.collection('settings').doc('global').set({
        current_balance: firebase.firestore.FieldValue.increment(-parseFloat(txObj.amount))
      }, { merge: true });
    } else if (txObj.type === 'expense') {
      await db.collection('settings').doc('global').set({
        current_balance: firebase.firestore.FieldValue.increment(parseFloat(txObj.amount))
      }, { merge: true });
    }
    await docRef.delete();
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
    const weekId = payload.weekId;
    const studentIds = payload.studentIds;
    const amount = payload.amountPerStudent;
    const recordedBy = payload.recordedBy;
    
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
         const userRef = db.collection('users').doc(userSnap.docs[0].id);
         batch.set(userRef, {
           total_paid: firebase.firestore.FieldValue.increment(parseFloat(amount))
         }, { merge: true });
       }
    }
    
    const settingsRef = db.collection('settings').doc('global');
    batch.set(settingsRef, {
      current_balance: firebase.firestore.FieldValue.increment(totalAmt)
    }, { merge: true });

    await batch.commit();
    return { success: true, message: 'Success' };
  },
  
  async cancelStudentWeekPayment(studentId, weekId, txId) {
    const docRef = db.collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: 'Not found' };
    
    const docData = doc.data();
    const batch = db.batch();
    batch.delete(docRef);
    
    batch.set(db.collection('settings').doc('global'), {
      current_balance: firebase.firestore.FieldValue.increment(-parseFloat(docData.amount))
    }, { merge: true });
    
    const userSnap = await db.collection('users').where('student_id', '==', studentId).get();
    if(!userSnap.empty) {
      batch.set(db.collection('users').doc(userSnap.docs[0].id), {
        total_paid: firebase.firestore.FieldValue.increment(-parseFloat(docData.amount))
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


