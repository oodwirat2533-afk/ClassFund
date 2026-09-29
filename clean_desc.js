const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch } = require('firebase/firestore');

const app = initializeApp({ projectId: "classfund-1528e" });
const db = getFirestore(app);

async function cleanDescriptions() {
  const roomId = 'rm_muh2y5wk_ky3m6b18';
  const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
  const batch = writeBatch(db);
  let updatedCount = 0;

  txSnap.docs.forEach(d => {
    const tx = d.data();
    if (tx.description && tx.description.includes('เงินห้องประจำ')) {
      batch.update(d.ref, { description: '' });
      updatedCount++;
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`Successfully cleared description for ${updatedCount} week income transactions.`);
  } else {
    console.log('No transactions needed updating.');
  }
}

cleanDescriptions().catch(console.error);
