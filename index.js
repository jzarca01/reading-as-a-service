const functions = require('firebase-functions');

require('./app/lib/database');

const app = require('./app');
const { onUserCreated, onUserUpdated } = require('./app/lib/users');

exports.app = functions.https.onRequest(app);

exports.onUserUpdated = onUserUpdated;
exports.onUserCreated = onUserCreated;