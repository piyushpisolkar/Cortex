const http = require('http');
http.get('http://localhost:3000/', function(res) {
  var d = '';
  res.on('data', function(c) { d += c; });
  res.on('end', function() {
    console.log('STATUS:', res.statusCode);
    console.log('app-shell:', d.includes('app-shell'));
    console.log('workspace:', d.includes('workspace'));
    console.log('size:', d.length);
    console.log('first 100 chars after body:', d.substring(d.indexOf('<body>'), d.indexOf('<body>') + 100));
  });
}).on('error', function(e) { console.log('Error:', e.message); });
