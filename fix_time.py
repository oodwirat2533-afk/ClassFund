import sys

filepath = r'c:\Users\oodwi\OneDrive\Documents\ClassFund_V2\js\app.js'
with open(filepath, 'rb') as f:
    data = f.read()

old_func = b"""function formatThaiDateTimeBE(timestamp) {
      if (!timestamp) return '-';
      const str = String(timestamp).trim();
      const parts = str.split(' ');
      const datePart = parts[0].split('T')[0];
      const timePart = parts[1] || (parts[0].includes('T') ? parts[0].split('T')[1] : '');
      
      const dParts = datePart.split('-');
      if (dParts.length === 3) {
        let y = parseInt(dParts[0]);
        if (y < 2400) y += 543;
        const m = dParts[1].padStart(2, '0');
        const d = dParts[2].padStart(2, '0');
        const formattedTime = timePart ? ` ${timePart.slice(0, 5)}` : '';
        return `${d}/${m}/${y}${formattedTime}`;
      }
      return str;
    }"""

new_func = b"""function formatThaiDateTimeBE(timestamp) {
      if (!timestamp) return '-';
      const str = String(timestamp).trim();
      
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        let y = d.getFullYear();
        if (y < 2400) y += 543;
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        
        // Only append time if the original string had time info
        if (str.includes('T') || str.includes(' ')) {
          const hrs = String(d.getHours()).padStart(2, '0');
          const mins = String(d.getMinutes()).padStart(2, '0');
          return `${day}/${m}/${y} ${hrs}:${mins}`;
        }
        return `${day}/${m}/${y}`;
      }
      
      // Fallback
      return str;
    }"""

if old_func in data:
    data = data.replace(old_func, new_func)
    with open(filepath, 'wb') as f:
        f.write(data)
    print("SUCCESS")
else:
    print("NOT FOUND")
