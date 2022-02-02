const functions = require('firebase-functions');

const axios = require('axios');

const { DELIMITER } = require('./utils');
const options = require('../options');
const { encrypt } = require('./crypto');
const { sgMail } = require('./mail');

const CONSUMER_KEY = functions.config().default['consumer-key'];
const DEFAULT_COUNT = 200;

const DEFAULT_DURATION = 15;

function getMaxArticles(articles, duration) {
  const filteredItems = articles
    .filter((t) => t.time_to_read)
    .sort((a, b) => a.time_to_read - b.time_to_read);
  const curatedArticles = [];

  const computedDuration = filteredItems.reduce((acc, item) => {
    if (item.time_to_read + acc < duration) {
      curatedArticles.push(item);
      return acc + item.time_to_read;
    }
    return acc;
  }, 0);
  return {
    duration: computedDuration,
    articles: curatedArticles,
  };
}

async function getUserDigest(accessToken, defaultDuration = DEFAULT_DURATION) {
  const response = await axios.post('https://getpocket.com/v3/get', {
    consumer_key: CONSUMER_KEY,
    access_token: accessToken,
    state: 'unread',
    contentType: 'article',
    sort: 'newest',
    detailType: 'complete',
    // since: new Date('2013-01-01').getTime() / 1000,
    count: DEFAULT_COUNT,
  });
  const items = Object.values(response.data.list);

  if (items?.length) {
    const { duration, articles } = getMaxArticles(items, defaultDuration);
    const encryptedArticles = articles.map((s) => ({
      ...s,
      formattedDate: new Date(s.time_added * 1000),
      salt: encrypt(`${accessToken}${DELIMITER}${s.item_id}${DELIMITER}${s.resolved_url}`),
    }));

    return { duration, articles: encryptedArticles };
  }
  return { duration: 0, articles: [] };
}

async function sendUserDigest({ duration, articles }, userEmail, id, date) {
  const msg = {
    from: functions.config().default['sendgrid-from'],
    template_id: functions.config().default['sendgrid-templateid'],
    personalizations: [
      {
        to: { email: userEmail },
        custom_args: {
          digest: encrypt(`${date}${DELIMITER}${id}`)
        },
        dynamic_template_data: {
          duration,
          articles,
          originUrl: options.default.origin,
        },
      },
    ],
  };
  return await sgMail.send(msg);
}

module.exports = {
  getMaxArticles,
  getUserDigest,
  sendUserDigest,
  DEFAULT_DURATION
};
