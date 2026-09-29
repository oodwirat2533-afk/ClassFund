const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, writeBatch } = require('firebase/firestore');

const app = initializeApp({ projectId: "classfund-1528e" });
const db = getFirestore(app);

async function fixDescriptions() {
  const roomId = 'rm_muh2y5wk_ky3m6b18';
  const txSnap = await getDocs(collection(db, `rooms/${roomId}/transactions`));
  const batch = writeBatch(db);
  let updatedCount = 0;

  txSnap.docs.forEach(d => {
    const tx = d.data();
    if (tx.description && typeof tx.description === 'string') {
      let newDesc = tx.description;
      // "เงินห้องประจำสัปดาห์ที่ 22 ภาคเรียนที่ 1/2569" -> "เงินห้องประจำครั้งที่ 22"
      
      if (newDesc.includes('เงินห้องประจำสัปดาห์ที่')) {
        // Extract the number
        const match = newDesc.match(/สัปดาห์ที่ (\d+)/);
        if (match) {
          newDesc = `เงินห้องประจำครั้งที่ ${match[1]}`;
          console.log(`Update: ${tx.description} -> ${newDesc}`);
          batch.update(d.ref, { description: newDesc });
          updatedCount++;
        }
      }
    }
  });

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`Successfully updated ${updatedCount} transactions.`);
  } else {
    console.log('No transactions needed updating.');
  }
}

fixDescriptions().catch(console.error);
