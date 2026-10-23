const crypto = require('crypto');

const body = JSON.stringify({
  object: "instagram",
  entry: [{
    id: "710796685445686",
    time: Math.floor(Date.now() / 1000),
    changes: [{
      field: "comments",
      value: {
        id: "test_comment_bad_sig",
        text: "price please",
        from: { id: "123456789", username: "testuser" },
        media: { id: "media_123" }
      }
    }]
  }]
});

const secret = "wrong_secret";
const sig = "sha256=" + crypto.createHmac('sha256', secret).update(body).digest('hex');

console.log("Signature:", sig);

fetch('http://localhost:3000/api/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hub-signature-256': sig
  },
  body: body
}).then(r => {
  console.log('Status:', r.status);
  return r.text();
}).then(t => console.log('Response:', t));