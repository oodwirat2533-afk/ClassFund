const fs = require('fs');
let c = fs.readFileSync('js/firebase-db.js', 'utf8');
const idx = c.indexOf('async getAllRooms() {');
const endIdx = c.indexOf('  async updateRoomInfo');
const p1 = c.substring(0, idx);
const p2 = c.substring(endIdx);
const newFn = `async getAllRooms() {
    const snap = await db.collection('rooms').get();
    const sortedDocs = [...snap.docs].sort((a, b) => {
      const da = (a.data() && a.data().created_at) || '';
      const dbDate = (b.data() && b.data().created_at) || '';
      return dbDate.localeCompare(da);
    });
    const rooms = sortedDocs.map(d => { const data = d.data(); data.room_id = d.id; return data; });
    return { success: true, data: rooms };
  },\n\n`;
fs.writeFileSync('js/firebase-db.js', p1 + newFn + p2);
