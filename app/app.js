'use strict';

global.__base = __dirname + '/';

const express = require('express'),
      cors = require('cors'),
      http = require('http'),
      https = require('https'),
      bodyParser = require('body-parser'),
      basicAuth = require('basic-auth');


global.config = require(__base + 'config');

const app = express();

global.routeAuth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.status(401).send();
  };

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  if (user.name ===  process.env.API_AUTH_USER && user.pass === process.env.API_AUTH_PASS) {
    return next();
  } else {
    return unauthorized(res);
  };
};

app.use(cors({
    'methods': ['GET', 'POST']
}));

app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(bodyParser.json()); // for parsing application/json

// Test home route
app.get('/', function(req, res) {
    res.send('Hello');
});

// Init http
const httpServer = http.createServer(app);
httpServer.listen(config.port);

// Init https
if(process.env.SSL_KEY && process.env.SSL_CRT) {
  const credentials = {
    key: process.env.SSL_KEY, 
    cert: process.env.SSL_CRT
  };
  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(config.https_port);
}

const indexAttach = require('./indexAttach');

// PCD269: auth-required attachment indexing. The previous unauthenticated
// /send-attachments route was removed in phase E.2 after the soak window
// confirmed every active caller had migrated.
app.post('/send-attachments-auth', routeAuth, indexAttach);

module.exports = app;