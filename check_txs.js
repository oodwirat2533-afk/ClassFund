const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, query, where } = require('firebase/firestore');

const app = initializeApp({ projectId: "classfund-1528e" });
const db = getFirestore(app);

async function check() {
  const roomId = 'rm_muh2y5wk_ky3m6b18';
  
  const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
  const txs = txSnap.docs.map(d => d.data());
  
  // Group by week_id
  const byWeek = {};
  txs.forEach(tx => {
    const w = tx.week_id || 'NO_WEEK';
    if (!byWeek[w]) byWeek[w] = 0;
    const amt = parseFloat(tx.amount) || 0;
    if (tx.type === 'income' || tx.type === 'fine' || tx.type === 'other') byWeek[w] += amt;
    else if (tx.type === 'expense') byWeek[w] -= amt;
  });
  
  console.log('--- Transactions grouped by week_id ---');
  for (const w in byWeek) {
    console.log(`Week ${w}: ${byWeek[w]} baht`);
  }
  
  console.log('--- Remaining Weeks in DB ---');
  const wkSnap = await getDocs(collection(db, `rooms/${roomId}/weeks`));
  wkSnap.docs.forEach(d => {
    console.log(`${d.id} -> Week ${d.data().week_number}`);
  });
}
check().catch(console.error);
