const fs = require('fs');
let code = fs.readFileSync('js/firebase-db.js', 'utf8');

const deleteRoomLogic = `
  async deleteRoom(roomId) {
    try {
      if (!roomId) throw new Error('Invalid room ID');
      
      // 1. Get all subcollections and users
      const txs = await db.collection('rooms').doc(roomId).collection('transactions').get();
      const weeks = await db.collection('rooms').doc(roomId).collection('weeks').get();
      const settings = await db.collection('rooms').doc(roomId).collection('settings').get();
      const users = await db.collection('users').where('room_id', '==', roomId).get();
      
      const allDocs = [];
      txs.forEach(d => allDocs.push(d.ref));
      weeks.forEach(d => allDocs.push(d.ref));
      settings.forEach(d => allDocs.push(d.ref));
      users.forEach(d => allDocs.push(d.ref));
      allDocs.push(db.collection('rooms').doc(roomId));

      // 2. Delete in batches of 500
      let batch = db.batch();
      let count = 0;
      for (const ref of allDocs) {
        batch.delete(ref);
        count++;
        if (count === 490) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
      if (count > 0) {
        await batch.commit();
      }
      
      return { success: true, message: 'ลบห้องเรียนและข้อมูลทั้งหมดเรียบร้อยแล้ว' };
    } catch(e) {
      return { success: false, message: e.message };
    }
  },`;

code = code.replace('async createRoom(payload) {', deleteRoomLogic + '\n  async createRoom(payload) {');
fs.writeFileSync('js/firebase-db.js', code);
console.log('deleteRoom added');
