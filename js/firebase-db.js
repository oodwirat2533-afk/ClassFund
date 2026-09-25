const db = firebase.firestore();

const API = {
  async getDashboardData(role, studentId) {
    const usersSnap = await db.collection('users').get();
    const weeksSnap = await db.collection('weeks').orderBy('week_number', 'asc').get();
    const txSnap = await db.collection('transactions').orderBy('timestamp', 'desc').get();
    const settingsSnap = await db.collection('settings').doc('global').get();
    
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

  async hashPassword(password) { if (!password) return ''; const msgUint8 = new TextEncoder().encode(String(password).trim()); const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8); const hashArray = Array.from(new Uint8Array(hashBuffer)); return hashArray.map(b => b.toString(16).padStart(2, '0')).join(''); },

  async login(studentId, pin) {
    const usersSnap = await db.collection('users').where('student_id', '==', studentId).where('password', '==', String(pin)).get();
    if (usersSnap.empty) {
      // Try string vs number pin
      const usersSnapNum = await db.collection('users').where('student_id', '==', studentId).where('password', '==', Number(pin)).get();
      if(usersSnapNum.empty) {
         return { success: false, message: '���ʻ�Шӵ���������ʼ�ҹ���١��ͧ' };
      }
      return { success: true, user: usersSnapNum.docs[0].data() };
    }
    return { success: true, user: usersSnap.docs[0].data() };
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

    return { success: true, message: '�ѹ�֡��¡�������', tx_id: txObj.tx_id };
  },

  async deleteTransaction(txId) {
    const docRef = db.collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: '��辺��¡�ù��' };
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
    return { success: true, message: 'ź��¡�������' };
  },
  
  async addWeek(weekObj) {
    weekObj.week_id = 'W' + Date.now();
    await db.collection('weeks').doc(weekObj.week_id).set(weekObj);
    return { success: true, message: '�����ѻ�������������' };
  },

  async deleteWeek(weekId) {
    await db.collection('weeks').doc(weekId).delete();
    return { success: true, message: 'ź�ѻ���������' };
  },

  async updateClassSettings(settings) {
    await db.collection('settings').doc('global').set(settings, { merge: true });
    return { success: true, message: '�ѹ�֡��õ�駤����ͧ���¹�����', settings: settings };
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
       
       // Update student total_paid
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
    return { success: true, message: '�ѹ�֡���������Թ�����' };
  },
  
  async cancelStudentWeekPayment(studentId, weekId, txId) {
    const docRef = db.collection('transactions').doc(txId);
    const doc = await docRef.get();
    if (!doc.exists) return { success: false, message: '��辺��¡�÷���ͧ���¡��ԡ' };
    
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
    return { success: true, message: '¡��ԡ��¡�������' };
  },
  
  async deleteStudent(studentId) {
    const usersSnap = await db.collection('users').where('student_id', '==', studentId).get();
    if (!usersSnap.empty) {
      await db.collection('users').doc(usersSnap.docs[0].id).delete();
      return { success: true, message: 'ź�����Źѡ���¹�����' };
    }
    return { success: false, message: '��辺�ѡ���¹' };
  },
  
  async addUser(payload) {
    await db.collection('users').add({ ...payload, total_paid: 0 });
    return { success: true, message: '�����ѡ���¹�����' };
  },

  async setUserRole(studentId, role, pwd) {
    const usersSnap = await db.collection('users').where('student_id', '==', studentId).get();
    if (!usersSnap.empty) {
      await db.collection('users').doc(usersSnap.docs[0].id).update({ role: role, password: pwd });
      return { success: true, message: '�ѻവ�Է��������' };
    }
    return { success: false, message: '��辺�����' };
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


