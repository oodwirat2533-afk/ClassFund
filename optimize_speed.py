import sys

filepath = r'c:\Users\oodwi\OneDrive\Documents\ClassFund_V2\js\firebase-db.js'
with open(filepath, 'rb') as f:
    data = f.read()

# Replace the sequential fetching in deleteWeek with parallel fetching
# We look for the start of the transactions fetch up to the users fetch

start_marker = b"// 1. Find all transactions linked to this week (Fast query)"
end_marker = b"// 6. Batch delete/update everything (Firestore batch max 500, split if needed)"

start_idx = data.find(start_marker)
end_idx = data.find(end_marker)

if start_idx < 0 or end_idx < 0:
    print("Could not find markers")
    sys.exit(1)

old_section = data[start_idx:end_idx]

new_section = b"""// 1-4. Parallelize all necessary Firestore fetches to make deletion blazing fast!
    const settingsRef = db.collection('rooms').doc(DBState.currentRoomId).collection('settings').doc('global');
    
    const [txSnap, allWeeksSnap, settingsDoc] = await Promise.all([
      db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').where('week_id', '==', String(weekId)).get(),
      db.collection('rooms').doc(DBState.currentRoomId).collection('weeks').get(),
      settingsRef.get()
    ]);
    
    const weekTxDocs = txSnap.docs;
    
    let balanceAdjust = 0;
    const studentPaidAdjust = {};
    
    weekTxDocs.forEach(doc => {
      const tx = doc.data();
      const amt = parseFloat(tx.amount) || 0;
      if (tx.type === 'income' || tx.type === 'fine' || tx.type === 'other') {
        balanceAdjust -= amt;
        if (tx.type === 'income' && tx.student_id && tx.student_id !== 'ROOM') {
          const sid = String(tx.student_id);
          studentPaidAdjust[sid] = (studentPaidAdjust[sid] || 0) + amt;
        }
      } else if (tx.type === 'expense') {
        balanceAdjust += amt;
      }
    });
    
    const weeksToShiftDocs = allWeeksSnap.docs.filter(doc => {
      const data = doc.data();
      return data.academic_year === deletedWeek.academic_year
        && data.semester === deletedWeek.semester
        && (parseInt(data.week_number) || 0) > deletedNum;
    });
    
    let currentBalance = 0;
    if (settingsDoc.exists) currentBalance = parseFloat(settingsDoc.data().current_balance) || 0;
    
    // 5. Get user docs for students that need total_paid update
    const affectedStudentIds = Object.keys(studentPaidAdjust);
    let userMap = {};
    if (affectedStudentIds.length > 0) {
      // Split user fetching into chunks of 10 for 'in' queries to be fast, or just get all users
      // Since max users is usually 40, getting all users in the room is fast enough and already indexed locally
      const allUsersSnap = await db.collection('users').where('room_id', '==', DBState.currentRoomId).get();
      allUsersSnap.docs.forEach(doc => {
        userMap[String(doc.data().student_id)] = doc;
      });
    }
    
    """

data = data[:start_idx] + new_section + data[end_idx:]

with open(filepath, 'wb') as f:
    f.write(data)
print("SUCCESS: Optimized deleteWeek for speed")
