const functions = require('firebase-functions');
const admin = require('firebase-admin');

const express = require('express');
const moment = require('moment');

const session = require('express-session');
const FirestoreStore = require('firestore-store')(session);
const grant = require('grant-express');

const { updateDocument, getDocument, UNDEFINED } = require('../lib/database');
const { decrypt } = require('../lib/crypto');

const pocket = require('./pocket');
const preferences = require('./preferences');
const options = require('../options');
const { isExistingUser } = require('../lib/users');
const { TRACKED_EVENTS } = require('../lib/mail');
const { asyncForEach, DELIMITER } = require('../lib/utils');
const { firestore } = require('../lib/database');

// eslint-disable-next-line new-cap
const router = express.Router();

router.use(
    session({
        store: new FirestoreStore({
            database: firestore,
        }),
        name: '__session',
        secret: 'secret',
        resave: true,
        saveUninitialized: true,
    })
);

router.use(grant(options));
router.use(express.json());

router.post('/signup', async function (req, res) {
    try {
        const data = req.body;

        const exists = await isExistingUser(data.email);

        if (exists) {
            return res.status(500).send({ error: 'user already exists' });
        }

        // eslint-disable-next-line no-unused-vars
        const { email, uid, ...rest } = data;

        const userRecord = await admin.auth().createUser({
            email,
            ...rest,
        });
        await updateDocument('USERS', userRecord.uid, {
            isActive: false,
            email,
            ...rest,
        });

        return res.status(200).send({ message: 'ok' });
    } catch (err) {
        functions.logger.warn('error', err);
        return res.status(500).send(err.message);
    }
});

router.get('/login', function (req, res) {
    const usId = req.query.usId;
    if (!usId) {
        return res.status(500).send({ error: 'missing userId' });
    }
    return res.redirect(`/app/api/connect/getpocket/?state=${usId}`);
});

router.get('/callback', async function (req, res) {
    try {
        const {
            query: { raw },
        } = req;

        // functions.logger.log("req.query", req.query);

        if (raw?.state != '' && req.query.access_token) {
            const docId = decrypt(raw.state);
            const doc = await getDocument('USERS', docId);
            const { data: eventData } = await getDocument('EVENTS', docId);

            if (doc?.id) {
                await updateDocument('USERS', doc.id, {
                    accessToken: req.query.access_token,
                    name: raw?.username || '',
                    isActive: true,
                    ...(doc.data.isError && { isError: UNDEFINED }),
                });
                if (!eventData.first_activation) {
                    await updateDocument('EVENTS', doc.id, {
                        first_activation: false,
                    });
                }
                return res.redirect('/app/complete');
            }
            return res.status(500).send({ error: 'no such document' });
        }
        return res.status(500).send({ error: 'invalid state' });
    } catch (err) {
        functions.logger.warn('error', err);
        return res.status(500).send(err.message);
    }
});

router.post('/webhook', async function (req, res) {
    try {
        const filteredEvents = (req.body || []).filter(
            (e) =>
                // eslint-disable-next-line no-prototype-builtins
                TRACKED_EVENTS.includes(e.event) && e.hasOwnProperty('digest')
        );

        if (filteredEvents.length) {
            // eslint-disable-next-line no-unused-vars
            const [digest, docId] = decrypt(filteredEvents[0].digest).split(
                DELIMITER
            );

            const eventsDoc = await getDocument('EVENTS', docId);

            if (!eventsDoc) {
                return res.status(500).send({ error: 'no such document' });
            }

            await asyncForEach(filteredEvents, async (e) => {
                return await updateDocument('EVENTS', docId, {
                    [`last_digest_${e.event}`]: moment().toDate(),
                });
            });
            return res.status(200).send({ message: 'ok' });
        }
        return res.status(200).send({ message: 'ok' });
    } catch (err) {
        functions.logger.warn('error', err);
        return res.status(500).send(err.message);
    }
});

router.use('/pocket', pocket);
router.use('/preferences', preferences);

module.exports = router;
