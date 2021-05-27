
const fs = require('fs');
const path = require('path');
const url = require('url');
var httpServer = require('http');

const ioServer = require('socket.io');
const RTCServer = require('./Signaling.js');

var PORT = 9660;
var isUseHTTPs = true;

var config = {
    "socketURL": "/",
    "homePage": "/index.html",
};

var options = {
    key: fs.readFileSync('ssl/key.pem'),
    cert: fs.readFileSync('ssl/cert.pem')
};

function serverHandler(request, response) {
	if (request.url === '/adapter-latest.js') {
		response.writeHead(200, { 'Content-Type': 'application/javascript' });
		response.end(fs.readFileSync('adapter-latest.js'));
	} else if (request.url === '/RTCPeerConnectionEx.js') {
		response.writeHead(200, { 'Content-Type': 'application/javascript'  });
		response.end(fs.readFileSync('RTCPeerConnectionEx.js'));
	} else if (request.url === '/socketio.js') {
		response.writeHead(200, { 'Content-Type': 'application/javascript'  });
		response.end(fs.readFileSync('socketio.js'));
	} else if (request.url === '/getHTMLMediaElement.js') {
		response.writeHead(200, { 'Content-Type': 'application/javascript'  });
		response.end(fs.readFileSync('getHTMLMediaElement.js'));
	} else if (request.url === '/getHTMLMediaElement.css') {
		response.writeHead(200, { 'Content-Type': 'text/css'  });
		response.end(fs.readFileSync('getHTMLMediaElement.css'));
	} else {
		
		response.writeHead(200, {
			'Content-Type': 'text/html'
		});
	   
		response.end(fs.readFileSync('index.html'));
	}
}

var httpApp;
if (isUseHTTPs) {
    httpServer = require('https');
    httpApp = httpServer.createServer(options, serverHandler);
} else {
    httpApp = httpServer.createServer(serverHandler);
}

httpApp = httpApp.listen(process.env.PORT || PORT, process.env.IP || "0.0.0.0", function() {
    
});

(httpServer,{
	"serveClient": false ,
	"transports":['websocket', 'polling']
  });

ioServer(httpApp,{
   "serveClient": false ,
   "transports":['websocket', 'polling']
 }).on('connection', function(socket) {
    RTCServer(socket, config);
});

console.log('Please open SSL URL: https://localhost.com:' + (process.env.PORT || PORT)+'/');
