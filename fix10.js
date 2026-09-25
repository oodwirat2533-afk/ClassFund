const fs = require('fs');
let code = fs.readFileSync('js/firebase-db.js', 'utf8');

const createOld = /batch\.set\(db\.collection\('users'\)\.doc\(payload\.username\), \{/g;
const createNew = `batch.set(db.collection('users').doc(roomId + '_' + payload.username), {`;
code = code.replace(createOld, createNew);

const loginOld = /let usersSnap = await db\.collection\('users'\)\.where\('student_id', '==', String\(studentId\)\)\.get\(\);\s*if \(usersSnap\.empty\) \{\s*usersSnap = await db\.collection\('users'\)\.where\('student_id', '==', Number\(studentId\)\)\.get\(\);\s*\}/g;

const loginNew = `      const urlParams = new URLSearchParams(window.location.search);
      const currentRoom = urlParams.get('room');
      
      let queryStr = db.collection('users').where('student_id', '==', String(studentId));
      let queryNum = db.collection('users').where('student_id', '==', Number(studentId));
      
      if (studentId !== 'superadmin' && currentRoom) {
         queryStr = queryStr.where('room_id', '==', currentRoom);
         queryNum = queryNum.where('room_id', '==', currentRoom);
      }
      
      let usersSnap = await queryStr.get();
      if (usersSnap.empty) {
        usersSnap = await queryNum.get();
      }`;

code = code.replace(loginOld, loginNew);
fs.writeFileSync('js/firebase-db.js', code);
console.log('Done');
