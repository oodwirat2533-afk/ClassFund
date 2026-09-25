const fs = require('fs');
let content = fs.readFileSync('js/firebase-db.js', 'utf8');

const newLogin = "  async login(studentId, pin) {\n" +
"    const hashedPin = await this.hashPassword(pin);\n" +
"    let usersSnap = await db.collection('users').where('student_id', '==', String(studentId)).get();\n" +
"    if (usersSnap.empty) {\n" +
"      usersSnap = await db.collection('users').where('student_id', '==', Number(studentId)).get();\n" +
"    }\n" +
"    if (usersSnap.empty) {\n" +
"      return { success: false, message: 'ไม่พบรหัสประจำตัวนี้ในระบบ' };\n" +
"    }\n" +
"    const user = usersSnap.docs[0].data();\n" +
"    if (user.role === 'student') {\n" +
"      return { success: false, message: 'นักเรียนทั่วไปไม่ต้องล็อกอินครับ สามารถดูข้อมูลที่หน้าหลักได้เลย!' };\n" +
"    }\n" +
"    if (user.password_hash === hashedPin) {\n" +
"      return { success: true, user: user };\n" +
"    } else {\n" +
"      return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };\n" +
"    }\n" +
"  },";

content = content.replace(/async login\(studentId, pin\) \{[\s\S]*?\},/, newLogin);
fs.writeFileSync('js/firebase-db.js', content, 'utf8');
