const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch, doc, getDoc } = require('firebase/firestore');

const app = initializeApp({ projectId: "classfund-1528e" });
const db = getFirestore(app);

async function cleanup() {
  const roomId = 'rm_muh2y5wk_ky3m6b18';
  
  // 1. Get all valid week IDs
  const wkSnap = await getDocs(collection(db, `rooms/${roomId}/weeks`));
  const validWeekIds = new Set();
  wkSnap.docs.forEach(d => validWeekIds.add(d.id));
  
  // 2. Get all transactions
  const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
  const batch = writeBatch(db);
  let deletedCount = 0;
  
  const studentPaidAdjust = {};
  
  txSnap.docs.forEach(d => {
    const tx = d.data();
    const w = tx.week_id;
    // If it has a week_id that starts with W or WK_, but that week doesn't exist, it's orphaned
    if (w && (w.startsWith('W') || w.startsWith('WK_')) && !validWeekIds.has(w)) {
      console.log(`Deleting orphaned transaction ${d.id} (amount: ${tx.amount}) from missing week ${w}`);
      batch.delete(d.ref);
      deletedCount++;
      
      if (tx.type === 'income' && tx.student_id && tx.student_id !== 'ROOM') {
        const sid = String(tx.student_id);
        studentPaidAdjust[sid] = (studentPaidAdjust[sid] || 0) + (parseFloat(tx.amount) || 0);
      }
    }
  });
  
  if (deletedCount > 0) {
    // We also need to fix students' total_paid for the orphaned income we just deleted
    for (const sid in studentPaidAdjust) {
      // Find the user
      const usersSnap = await getDocs(collection(db, `users`));
      const uDoc = usersSnap.docs.find(u => u.data().room_id === roomId && String(u.data().student_id) === sid);
      if (uDoc) {
        const curPaid = parseFloat(uDoc.data().total_paid) || 0;
        const newPaid = Math.max(0, curPaid - studentPaidAdjust[sid]);
        console.log(`Fixing total_paid for student ${sid}: ${curPaid} -> ${newPaid}`);
        batch.set(uDoc.ref, { total_paid: newPaid }, { merge: true });
      }
    }
    
    await batch.commit();
    console.log(`Successfully deleted ${deletedCount} orphaned transactions.`);
  } else {
    console.log('No orphaned transactions found.');
  }
}

cleanup().catch(console.error);
