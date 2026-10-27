'use strict';

// Strip anything that looks like embedded basic-auth credentials
// (scheme://user:pass@host) out of an error's message/stack before it
// hits the log, since app.js has no visibility into what a rejected
// promise or thrown error is carrying.
function sanitizeErrorForLog(err) {
  const raw = (err && err.stack) ? err.stack : String(err);
  return raw.replace(/:\/\/[^/@\s]+:[^/@\s]+@/g, '://[redacted]@');
}

// A crash now means a k8s restart with backoff, so both of these need to
// log before anything else happens.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection: ' + sanitizeErrorForLog(reason));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception: ' + sanitizeErrorForLog(err));
  // Don't keep running with unknown state; exit so k8s restarts cleanly.
  process.exit(1);
});

global.__base = __dirname + '/';

const express = require('express'),
      cors = require('cors'),
      http = require('http'),
      https = require('https'),
      crypto = require('crypto'),
      bodyParser = require('body-parser'),
      basicAuth = require('basic-auth');


global.config = require(__base + 'config');

const app = express();

// Compares two fixed-length sha256 digests instead of the raw strings, so
// crypto.timingSafeEqual never throws on a length mismatch and a wrong-length
// guess can't be distinguished by timing from a wrong-value one.
function safeCompare(a, b) {
  const digestA = crypto.createHash('sha256').update(String(a)).digest();
  const digestB = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

global.routeAuth = function (req, res, next) {
  function unauthorized(res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.status(401).send();
  };

  var user = basicAuth(req);

  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  };

  const userMatches = safeCompare(user.name, process.env.API_AUTH_USER || '');
  const passMatches = safeCompare(user.pass, process.env.API_AUTH_PASS || '');

  if (userMatches && passMatches) {
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