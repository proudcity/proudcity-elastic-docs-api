'use strict';

// Smoke test for POST /send-attachments-auth.
//
// Usage:
//   DOCSAPI_URL=http://localhost:8085 \
//   DOCSAPI_USER=<API_AUTH_USER> \
//   DOCSAPI_PASS=<API_AUTH_PASS> \
//   node test.js <attachment-url> [index] [id]
//
// index/id default to a throwaway beta doc. Seed it in Elasticsearch first,
// for example:
//   curl -XPUT -H 'content-type: application/json' \
//     localhost:9200/beta/_doc/999999427 -d '{"ID":999999427}'

const docsapiUrl = process.env.DOCSAPI_URL || 'http://localhost:8085';
const docsapiUser = process.env.DOCSAPI_USER;
const docsapiPass = process.env.DOCSAPI_PASS;

const attachmentUrl = process.argv[2];
const index = process.argv[3] || 'beta';
const id = process.argv[4] || '999999427';

if (!attachmentUrl) {
  console.error('Usage: DOCSAPI_URL=... DOCSAPI_USER=... DOCSAPI_PASS=... node test.js <attachment-url> [index] [id]');
  process.exit(1);
}

if (!docsapiUser || !docsapiPass) {
  console.error('DOCSAPI_USER and DOCSAPI_PASS are required');
  process.exit(1);
}

const indexedPath = `${index}/_doc/${id}`;
const path = `${indexedPath}?pipeline=${index}-attachment`;

const payload = {
  indexedPath,
  path,
  post: {
    ID: Number(id),
    attachments: [attachmentUrl],
  },
};

const auth = Buffer.from(`${docsapiUser}:${docsapiPass}`).toString('base64');

fetch(`${docsapiUrl}/send-attachments-auth`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Basic ${auth}`,
  },
  body: JSON.stringify(payload),
})
  .then((res) => {
    console.log(`Status: ${res.status}`);
    return res.text();
  })
  .then((body) => {
    if (body) {
      console.log(body);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
