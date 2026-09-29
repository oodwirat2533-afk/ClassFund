const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs } = require('firebase/firestore');

const app = initializeApp({ projectId: "classfund-1528e" });
const db = getFirestore(app);

async function check() {
  const roomId = 'rm_muh2y5wk_ky3m6b18';
  const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
  
  txSnap.docs.forEach(d => {
    const tx = d.data();
    if (tx.timestamp && tx.timestamp.includes('29')) {
      console.log(d.id, tx.timestamp, tx.type, tx.amount);
    }
  });
}
check().catch(console.error);
