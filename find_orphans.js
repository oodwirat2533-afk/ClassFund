const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch } = require('firebase/firestore');

const app = initializeApp({ projectId: "classfund-1528e" });
const db = getFirestore(app);

async function findOrphans() {
  const roomId = 'rm_muh2y5wk_ky3m6b18';
  const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
  
  const wkSnap = await getDocs(collection(db, `rooms/${roomId}/weeks`));
  const validWeekIds = new Set();
  wkSnap.docs.forEach(d => validWeekIds.add(d.id));

  let count = 0;
  txSnap.docs.forEach(d => {
    const tx = d.data();
    if (tx.description && (tx.description.includes('ครั้งที่ 22') || tx.description.includes('สัปดาห์ที่ 22'))) {
      console.log(`Found transaction ${d.id}: week_id = ${tx.week_id}`);
      count++;
    }
  });
  console.log('Total found:', count);
}
findOrphans().catch(console.error);
