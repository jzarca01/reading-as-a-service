const functions = require('firebase-functions');

const express = require('express');
const axios = require('axios');
const btoa = require('btoa');
const moment = require('moment');

const { decrypt } = require('../lib/crypto');
const { DELIMITER } = require('../lib/utils');
const { updateDocument, getDocument } = require('../lib/database');
const { getUsers } = require('../lib/users');
// eslint-disable-next-line new-cap
const router = express.Router();

const ALLOWED_ACTIONS = ['add', 'archive', 'delete', 'read', 'readd'];
const CONSUMER_KEY = functions.config().default['consumer-key'];

const getActions = (action) => {
    switch (action) {
        case 'add':
            return [];
        case 'archive':
            return ['read', 'delete'];
        case 'delete':
            return ['read', 'add'];
    }
};

router.get('/action/:action/:encrypted_text', async function (req, res) {
    try {
        const { action, encrypted_text } = req.params;

        if (!ALLOWED_ACTIONS.includes(action)) {
            return res.status(401).send({ error: 'action not authorized' });
        }

        const [accessToken, itemId, articleUrl, date] =
            decrypt(encrypted_text).split(DELIMITER);

        if (!accessToken || !itemId) {
            return res.status(401).send({ error: 'missing parameters' });
        }

        const digestDate = moment(date)
            .format(moment.HTML5_FMT.DATE)
            .toString();

        const isRead = action === 'read';
        const isAdd = action === 'add';

        const users = await getUsers('accessToken', accessToken);

        let response;

        if (isAdd) {
            response = await axios.post('https://getpocket.com/v3/add', {
                consumer_key: CONSUMER_KEY,
                access_token: accessToken,
                url: articleUrl,
            });
        } else {
            // eslint-disable-next-line no-unused-vars
            response = await axios.post('https://getpocket.com/v3/send', {
                consumer_key: CONSUMER_KEY,
                access_token: accessToken,
                actions: [
                    {
                        action: 'tags_add',
                        item_id: itemId,
                        tags: 'notnow.email',
                    },
                    {
                        action: isRead ? 'archive' : action,
                        item_id: itemId,
                    },
                ],
            });
        }

        try {
            // functions.logger.warn("date", date);
            const { data } = await getDocument('DIGESTS', users[0].id);
            functions.logger.warn('data', data);

            const digestToUpdate = data[digestDate];
            const objIndex = digestToUpdate.findIndex(
                (obj) => obj.id == itemId
            );
            digestToUpdate[objIndex].status = action;
            await updateDocument('DIGESTS', users[0].id, {
                [digestDate]: digestToUpdate,
            });
        } catch (err) {
            functions.logger.warn('Could not update digest status', digestDate);
        }

        if (articleUrl && isRead) {
            return res.redirect(articleUrl);
        }

        const code = {
            salt: encrypted_text,
            more_actions: getActions(action),
            action: `${isAdd ? 'adde' : action}d`,
        };

        return res.redirect(`/app/done?code=${btoa(JSON.stringify(code))}`);
    } catch (err) {
        functions.logger.warn('error', err);
        if (err.response?.status === 403 || err.response?.status === 401) {
            // functions.logger.warn("err.config.data.access_token", JSON.parse(err.config.data).access_token);

            const accessToken = JSON.parse(err.config.data).access_token;
            const users = await getUsers('accessToken', accessToken);

            if (users) {
                // functions.logger.warn("users", users);
                updateDocument('USERS', users[0].id, {
                    isError: true,
                    isActive: false,
                });
            }
        }
        return res.status(500).send(err.message);
    }
});

module.exports = router;
