import re
import sys

filepath = r'c:\Users\oodwi\OneDrive\Documents\ClassFund_V2\js\firebase-db.js'

with open(filepath, 'rb') as f:
    data = f.read()

# We want to replace the slow fetch in deleteWeek:
# const allTxSnap = await db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').get();
# const weekTxDocs = allTxSnap.docs.filter(doc => String(doc.data().week_id) === String(weekId));

old_tx_fetch = b"""    // 1. Find all transactions linked to this week
    const allTxSnap = await db.collection('rooms').doc(DBState.currentRoomId).collection('transactions').get();
    const weekTxDocs = allTxSnap.docs.filter(doc => String(doc.data().week_id) === String(weekId));"""

new_tx_fetch = b"""    // 1. Find all transactions linked to this week (Fast query)
    const txSnap = await db.collection('rooms').doc(DBState.currentRoomId).collection('transactions')
      .where('week_id', '==', String(weekId)).get();
    const weekTxDocs = txSnap.docs;"""

if old_tx_fetch in data:
    data = data.replace(old_tx_fetch, new_tx_fetch)
    print("SUCCESS: Optimized transaction fetch in deleteWeek")
else:
    print("ERROR: Could not find old_tx_fetch")
    sys.exit(1)

with open(filepath, 'wb') as f:
    f.write(data)
