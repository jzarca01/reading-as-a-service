const functions = require('firebase-functions');

module.exports = {
    default: {
        origin: 'https://us-central1-reading-as-a-service.cloudfunctions.net/app/api',
        transport: 'session',
        state: true,
    },
    server: {
        protocol: 'https',
        host: 'us-central1-reading-as-a-service.cloudfunctions.net/app/api',
    },
    getpocket: {
        key: functions.config().default['consumer-key'],
        callback: '/app/api/callback',
        dynamic: true,
    },
};
