import http from 'node:http'
// simple web server for rendering html pages
// without any library
function onRequest(_, response) {
  response.writeHead(200, {'Content-Type': 'text/html'});
  // more complex html can be rendered here
  response.write('<h1>Hello World</h1>');
  response.end();
}

// listen http server at port 8888
http.createServer(onRequest).listen(8888);

// add some logging for incoming requests
console.log('Server running at http://localhost:8888/');