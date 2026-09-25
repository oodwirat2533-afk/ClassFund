const fs = require('fs');
let code = fs.readFileSync('js/firebase-db.js', 'utf8');

const logic = `
  async updateRoomTeacher(roomId, newTeacherName) {
    try {
      if (!roomId || !newTeacherName) throw new Error('ข้อมูลไม่ครบถ้วน');
      
      const batch = db.batch();
      
      // Update room doc
      const roomRef = db.collection('rooms').doc(roomId);
      batch.update(roomRef, { teacher_name: newTeacherName });
      
      // Update teacher user docs in this room
      const usersSnap = await db.collection('users')
        .where('room_id', '==', roomId)
        .where('role', '==', 'teacher')
        .get();
        
      usersSnap.forEach(doc => {
        batch.update(doc.ref, { name: newTeacherName });
      });
      
      await batch.commit();
      return { success: true, message: 'อัปเดตชื่อคุณครูเรียบร้อยแล้ว' };
    } catch(e) {
      return { success: false, message: e.message };
    }
  },`;

code = code.replace('async deleteRoom(roomId) {', logic + '\n  async deleteRoom(roomId) {');
fs.writeFileSync('js/firebase-db.js', code);
console.log('Added updateRoomTeacher');
