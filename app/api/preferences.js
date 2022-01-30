const express = require('express');

// import { decrypt } from '../lib/crypto';

// eslint-disable-next-line new-cap
const router = express.Router();

router.get('/preferences/:docId', async function (req, res) {
  res.status(418);
});

/* router.post('/preferences', async function (req, res) {
  try {
    const docRef = decrypt(encrypted_text);
  } catch (err) {
    console.log('error', err);
    return res.status(500).send(err.message);
  }
});*/

module.exports = router;
