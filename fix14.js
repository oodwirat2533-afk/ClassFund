const fs = require('fs');
let code = fs.readFileSync('js/app.js', 'utf8');

// I will find exact strings and replace them.

code = code.replace(/currentUser\.role === 'teacher' \|\| currentUser\.role === 'treasurer'/g, "(currentUser.role === 'teacher' || currentUser.role === 'super_admin' || currentUser.role === 'treasurer')");

code = code.replace(/currentUser && currentUser\.role === 'teacher'/g, "currentUser && (currentUser.role === 'teacher' || currentUser.role === 'super_admin')");

// Also check if there are standalone `currentUser.role === 'teacher'`
// Let's replace the `isTeacher` assignments
code = code.replace(/const isTeacher = \(currentUser && currentUser\.role === 'teacher'\);/g, "const isTeacher = (currentUser && (currentUser.role === 'teacher' || currentUser.role === 'super_admin'));");
code = code.replace(/const isTeacher = currentUser && currentUser\.role === 'teacher' && window\.isCurrentTerm !== false;/g, "const isTeacher = currentUser && (currentUser.role === 'teacher' || currentUser.role === 'super_admin') && window.isCurrentTerm !== false;");

fs.writeFileSync('js/app.js', code);
console.log('Done');
