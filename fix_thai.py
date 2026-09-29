import sys

filepath = r'c:\Users\oodwi\OneDrive\Documents\ClassFund_V2\js\app.js'
with open(filepath, 'rb') as f:
    data = f.read()

old_code = b"          title: title || '\\xe0\\xb8\\x81\\xe0\\xb8\\xb3\\xe0\\xb8\\xa5\\xe0\\xb8\\xb1\\xe0\\xb8\\x87\\xe0\\xb9\\x82\\xe0\\xb8\\xab\\xe0\\xb8\\xa5\\xe0\\xb8\\x94...',\n          text: subtitle || '\\xe0\\xb8\\x81\\xe0\\xb8\\xa3\\xe0\\xb8\\xb8\\xe0\\xb8\\x93\\xe0\\xb8\\xb2\\xe0\\xb8\\xa3\\xe0\\xb8\\xad\\xe0\\xb8\\xaa\\xe0\\xb8\\xb1\\xe0\\xb8\\x81\\xe0\\xb8\\x84\\xe0\\xb8\\xa3\\xe0\\xb8\\xb9\\xe0\\xb9\\x88',"

title_thai = 'กำลังโหลด...'.encode('utf-8')
subtitle_thai = 'กรุณารอสักครู่'.encode('utf-8')

new_code = b"          title: title || '" + title_thai + b"',\n          text: subtitle || '" + subtitle_thai + b"',"

if old_code in data:
    data = data.replace(old_code, new_code)
    with open(filepath, 'wb') as f:
        f.write(data)
    print('SUCCESS: Fixed Thai loading text')
else:
    print('ERROR: Could not find old code')
