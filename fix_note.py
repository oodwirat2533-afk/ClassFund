import sys

filepath = r'c:\Users\oodwi\OneDrive\Documents\ClassFund_V2\js\app.js'
with open(filepath, 'rb') as f:
    data = f.read()

thai_part = ' ภาคเรียนที่ '.encode('utf-8')
old_code_actual = b"      const termStr = (appData.settings && appData.settings.current_semester && appData.settings.current_academic_year) ? `" + thai_part + b"${appData.settings.current_semester}/${appData.settings.current_academic_year}` : '';\n      const note = `" + 'เงินห้องประจำ'.encode('utf-8') + b"${weekLabel}${termStr}`;"

new_code = b"      const termStr = '';\n      const note = `" + 'เงินห้องประจำ'.encode('utf-8') + b"${weekLabel}`;"

if old_code_actual in data:
    data = data.replace(old_code_actual, new_code)
    with open(filepath, 'wb') as f:
        f.write(data)
    print('SUCCESS: Removed termStr from batch income note')
else:
    print('ERROR: Could not find code in app.js')
