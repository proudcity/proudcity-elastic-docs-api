'use strict';

const RedisSMQ = require('rsmq')

const name = 'proudElastic';

const rsmq = new RedisSMQ( {host: config.redis, port: config.redisport, ns: name} );

const delay = 5;

let processing = false;

/**
 * Build Redis Queue
 */
function createRedisQ() {
  return new Promise((resolve, reject) => {
    rsmq.listQueues( function (err, queues) {
      if ( err ){
        console.error( err )
        reject('Can\'t reach redis.... we\'re screwed');
      }
      else if (!queues.length) {
        rsmq.createQueue({ qname: name, maxsize: -1 }, function (err, resp) {
          if (resp===1) {
            console.log('Queue created' + + queues.join( ',' ));
            resolve();
          }
        });
      } else {
        console.log('Active queues: ' + queues.join( ',' ) )
        resolve();
      }
    });
  });
}

/**
 * Gets a doc from elastic
 */
function getIndexedDoc(task) {
  const path = `${task.indexedPath}?_source_includes=attachments&_source_excludes=*data,*content`;
  
  return getElastic(path)
    .then((result) => {
      if (!result.found || !result._source) {
        return null;
      }
      return result._source;
    });
}

/**
 * Requests doc, encodes to base64.
 * Buffers in memory instead of a temp file; enforces MAX_ATTACHMENT_BYTES
 * both against Content-Length (when present) and against the bytes
 * actually read, so an oversized body never gets fully buffered.
 * Resolves { encoded, bytes } so callers can track a download budget.
 */
function getEncodedDoc(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  return fetch(url, { signal: controller.signal })
    .then((res) => {
      if (!res.ok) {
        controller.abort();
        throw new Error(`status ${res.status}`);
      }

      const contentLength = res.headers.get('content-length');
      if (contentLength && Number(contentLength) > config.maxAttachmentBytes) {
        controller.abort();
        throw new Error(`content-length ${contentLength} exceeds ${config.maxAttachmentBytes} byte cap`);
      }

      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;

      const read = () => reader.read().then(({ done, value }) => {
        if (done) {
          const buffer = Buffer.concat(chunks);
          // Drop the individual read buffers now that they're copied
          // into the single concatenated buffer.
          chunks.length = 0;
          return buffer;
        }
        received += value.length;
        if (received > config.maxAttachmentBytes) {
          controller.abort();
          throw new Error(`body exceeded ${config.maxAttachmentBytes} byte cap`);
        }
        chunks.push(value);
        return read();
      });

      return read();
    })
    .then((buffer) => {
      // Release the raw bytes as soon as the base64 copy exists.
      const encoded = buffer.toString('base64');
      const bytes = buffer.length;
      return { encoded, bytes };
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Attaches base64 encoding to post attachments
 * Downloads run sequentially (concurrency 1) and share a per-task byte
 * budget of config.maxAttachmentBytes: once that budget is used up, any
 * remaining attachments are dropped without attempting a download.
 * @TODO deal with multple docs?
 */
function attachEncodedDocs(task, indexed) {
  /**
   * Gets the saved attachment data for a given file name
   */
  const getIndexedData = (attachment) => {
    if (!indexed || !indexed.attachments || !indexed.attachments.length) {
      return null;
    }
    return indexed.attachments
      .filter(item => item.file === attachment)
      .reduce((prev, curr) => curr || prev, null);
  };

  return new Promise((resolve, reject) => {
    if (task.post && task.post.attachments && task.post.attachments.length) {
      const attachments = task.post.attachments;
      // Do we even need to post?
      let newAttachment = false;
      let budgetRemaining = config.maxAttachmentBytes;

      // Walk the attachments one at a time instead of firing every
      // download in parallel, so a single task can't pile up several
      // large in-flight buffers at once.
      const runSequential = (index) => {
        if (index >= attachments.length) {
          return Promise.resolve();
        }

        const attachment = attachments[index];

        // Already have this doc?
        const indexedData = getIndexedData(attachment);
        if (indexedData) {
          console.log('Doc already exists in elastic: ' + attachment);
          attachments[index] = indexedData;
          return runSequential(index + 1);
        }

        if (budgetRemaining <= 0) {
          console.log(`Dropping attachment ${attachment}: per-task download budget exhausted`);
          attachments[index] = null;
          return runSequential(index + 1);
        }

        // Get encoded
        console.log('Fetching and encoding: ' + attachment);
        return getEncodedDoc(attachment)
          .then(({ encoded, bytes }) => {
            console.log('Encode success: ' + attachment);
            attachments[index] = { file: attachment, data: encoded };
            // Set flag
            newAttachment = true;
            budgetRemaining -= bytes;
          })
          .catch((error) => {
            console.log(`Dropping attachment ${attachment}: ${error && error.message || error}`);
            attachments[index] = null;
          })
          .then(() => runSequential(index + 1));
      };

      runSequential(0)
        .then(() => {
          // Compact: drop the nulls left by failed/dropped downloads
          // instead of leaving holes that JSON.stringify would turn into
          // null.
          task.post.attachments = task.post.attachments.filter(Boolean);
          if (!newAttachment) {
            // Nothing new
            return reject('Post has no new attachments');
          } else if (!task.post.attachments.length) {
            // Errors occurred
            return reject('After encoding, post no longer has any attachments');
          }
          resolve(task.post);
        })
        .catch((error) => {
          console.log(error);
          reject(error.message);
        });
    } else {
      reject('No attachments');
    }
  });
}

/**
 * Sends to elastic
 */
function getElastic(path) {
  const url = `${config.elasticsearch}:9200/${path}`;

  return fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  }).then((res) => {
    if (res.status === 200) {
      return res.json();
    }
    return res.text().then((body) => {
      console.log(body);
      throw new Error('Failed getting from elastic');
    });
  });
}

/**
 * Sends to elastic
 */
function sendElastic(path, post) {
  const url = `${config.elasticsearch}:9200/${path}`;
  console.log(`Attemping to index post ID: ${post.ID}, to url: ${url}`);

  return fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(post),
    signal: AbortSignal.timeout(120_000),
  }).then((res) => {
    if (res.ok) {
      return;
    }
    return res.text().then((body) => {
      console.log(body);
      throw new Error('Failed sending to elastic');
    });
  });
}

/**
 * Send to the server
 */
function postToElastic(message) {

  console.log('Post to elastic beginning');

  const erroring = (reason) => {
    console.log('Post failed: ' + reason);
    processing = false;
    nextInQueue();
  }

  let task;
  try {
    task = JSON.parse(message.message);
  } catch(e) {
    console.log(e);
    return erroring('Initial parse failed');
  }

  // Run
  getIndexedDoc(task).then((indexed) => {
    attachEncodedDocs(task, indexed).then((post) => {
      sendElastic(task.path, post).then(() => {
        console.log(`Success post ID: ${post.ID}, to path: ${task.path}`);
        processing = false;
        nextInQueue();
      }).catch(erroring);
    }).catch(erroring);
  }).catch((error) => erroring(error && error.message || error));
}

/**
 * Run down the queue
 */
function nextInQueue() {
  if (!processing) {
    processing = true;
    rsmq.popMessage({ qname: name }, function (err, message) {
      if ( err ){
        console.log(err);
        processing = false;
        return
      }
      // Queue finished
      if (!message.id) {
        processing = false;
        return
      }
      // List how many remaining
      rsmq.getQueueAttributes({ qname: name }, function (err, resp) {
        if ( err ) {
          return;
        }

        console.log('Queue msgs remaining: ' + resp.msgs);
      });
      // Post it
      postToElastic(message);
    });
  }
}

// Don't index all at once
let postingTimeout = null;


/**
 * Actually send
 */
function processSending(json) {
  return new Promise((resolve, reject) => {
    rsmq.sendMessage({qname: name, message: JSON.stringify(json), delay: (delay - 1) }, function (err, resp) {
        if ( err ) {
          console.error( err )
          return reject(err);
          // Encountered error, try creating index
        } 

        if (resp) {
          clearTimeout(postingTimeout);
          console.log('Message sent. ID:', resp);
          postingTimeout = setTimeout(() => {
            nextInQueue();
          }, (delay * 1000));
        }

        return resolve();
    });
  });
}

/**
 * Try to send, maybe create queue
 */
function sendMessage(json) {
  return new Promise((resolve, reject) => {
    return processSending(json).then(() => {
      resolve();
    }).catch(() => {
      // Nope maybe we don't have queue yet
      return createRedisQ().then(() => {
        // Try again
        return processSending(json).then(() => {
          resolve();
        });
      });
    })
  });
}

// Legitimate shapes, derived from wp-proud-search-elastic:
//   payload.path        = "<index>/_doc/<id>?pipeline=<index>-attachment"
//   payload.indexedPath = "<index>/_doc/<id>"
// Index names are lowercase slugs like "san-rafael-ca".
const PATH_REGEX = /^[a-z0-9][a-z0-9_-]{0,62}\/_doc\/\d+\?pipeline=[a-z0-9][a-z0-9_-]{0,62}-attachment$/;
const INDEXED_PATH_REGEX = /^[a-z0-9][a-z0-9_-]{0,62}\/_doc\/\d+$/;

// Truncate + strip control chars so a rejected value can't poison the log line.
function sanitizeForLog(value) {
  if (typeof value !== 'string') {
    return '[non-string]';
  }
  return value.replace(/[\x00-\x1f\x7f]/g, '?').slice(0, 120);
}

/**
 * Express response
 */
const handleRequest = (req, res) => {
  let payload = req.body;
  if (!payload || !payload.path || !payload.post || !payload.post.attachments || !payload.post.attachments.length) {
    console.log('Insufficient data to index: ' + sanitizeForLog(payload && payload.path));
    return res.status(400).send();
  }

  if (!PATH_REGEX.test(payload.path)) {
    console.log('Rejected payload.path shape: ' + sanitizeForLog(payload.path));
    return res.status(400).send();
  }

  if (!payload.indexedPath || !INDEXED_PATH_REGEX.test(payload.indexedPath)) {
    console.log('Rejected payload.indexedPath shape: ' + sanitizeForLog(payload.indexedPath));
    return res.status(400).send();
  }

  // Send message
  sendMessage(payload).then(() => {
    res.send();
  }).catch(() => {
    console.log('Failed to index: ' + sanitizeForLog(payload.path));
    res.send();
  });
}

module.exports = handleRequest