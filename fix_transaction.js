const fs = require('fs');
let content = fs.readFileSync('js/firebase-db.js', 'utf8');

const newAddTx = \  async addTransaction(txObj) {
    txObj.tx_id = 'TX' + Date.now();
    txObj.timestamp = new Date().toISOString();
    
    // Clean up undefined
    Object.keys(txObj).forEach(key => {
      if (txObj[key] === undefined) delete txObj[key];
    });

    const batch = db.batch();
    batch.set(db.collection('transactions').doc(txObj.tx_id), txObj);

    const amt = parseFloat(txObj.amount) || 0;
    
    // Update global balance
    const settingsRef = db.collection('settings').doc('global');
    const settingsDoc = await settingsRef.get();
    let current_balance = 0;
    if (settingsDoc.exists) current_balance = parseFloat(settingsDoc.data().current_balance) || 0;
    
    if (txObj.type === 'income' || txObj.type === 'fine' || txObj.type === 'other') {
      batch.set(settingsRef, { current_balance: current_balance + amt }, { merge: true });
      
      // Update student total_paid
      if (txObj.student_id && txObj.student_id !== 'ROOM') {
        const usersSnap = await db.collection('users').where('student_id', '==', String(txObj.student_id)).get();
        if (!usersSnap.empty) {
          const uDoc = usersSnap.docs[0];
          const uData = uDoc.data();
          const curPaid = parseFloat(uData.total_paid) || 0;
          batch.set(db.collection('users').doc(uDoc.id), { total_paid: curPaid + amt }, { merge: true });
        }
      }
    } else if (txObj.type === 'expense') {
      batch.set(settingsRef, { current_balance: current_balance - amt }, { merge: true });
    }
    
    await batch.commit();
    return { success: true, message: 'Success', tx_id: txObj.tx_id };
  },\;

content = content.replace(/async addTransaction\(txObj\) \{[\s\S]*?\},/, newAddTx);

const newDelTx = \  async deleteTransaction(txId) {
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
  },\;

content = content.replace(/async deleteTransaction\(txId\) \{[\s\S]*?\},/, newDelTx);

fs.writeFileSync('js/firebase-db.js', content, 'utf8');
