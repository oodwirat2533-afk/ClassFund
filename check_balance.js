const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDtcvBWebmk-6tUFRvEQ2feE47GI7gMcyw",
  projectId: "classfund-1528e",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  const roomsSnap = await getDocs(collection(db, 'rooms'));
  for (const roomDoc of roomsSnap.docs) {
    const roomId = roomDoc.id;
    console.log(`\n--- Room: ${roomDoc.data().name} (${roomId}) ---`);
    
    // Get all transactions
    let totalIncome = 0;
    let totalExpense = 0;
    
    const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
    txSnap.docs.forEach(doc => {
      const tx = doc.data();
      const amt = parseFloat(tx.amount) || 0;
      if (tx.type === 'income' || tx.type === 'fine' || tx.type === 'other') {
        totalIncome += amt;
      } else if (tx.type === 'expense') {
        totalExpense += amt;
      }
    });
    
    const computedBal = totalIncome - totalExpense;
    console.log(`Total Income: ${totalIncome}`);
    console.log(`Total Expense: ${totalExpense}`);
    console.log(`Computed Balance: ${computedBal}`);
    
    const settingsSnap = await getDocs(collection(db, `rooms/${roomId}/settings`));
    settingsSnap.docs.forEach(doc => {
       console.log(`Setting [${doc.id}] current_balance: ${doc.data().current_balance}`);
    });
    
    const weeksSnap = await getDocs(collection(db, `rooms/${roomId}/weeks`));
    console.log(`Total Weeks: ${weeksSnap.docs.length}`);
  }
  process.exit(0);
}

check().catch(console.error);
