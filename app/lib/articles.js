const functions = require("firebase-functions");

const axios = require("axios");

const { DELIMITER, compareDates } = require("./utils");
const options = require("../options");
const { encrypt } = require("./crypto");
const { sgMail } = require("./mail");
const { getDocument } = require("./database");

const CONSUMER_KEY = functions.config().default["consumer-key"];
const DEFAULT_COUNT = 200;

const DEFAULT_DURATION = 15;

function getMaxArticles(articles, duration) {
  const filteredItems = articles
    .filter((t) => t.time_to_read)
    .sort((a, b) => a.time_to_read - b.time_to_read);

  const articlesToRead = [];
  const getCuratedArticles = (articles, duration) => {
    const computedDuration = articles.reduce((acc, item) => {
      if (item.time_to_read + acc < duration) {
        articlesToRead.push(item);
        return acc + item.time_to_read;
      }
      return acc;
    }, 0);

    if (articles.length && computedDuration === 0 && duration < 60) {
      return getCuratedArticles(articles, duration + 5);
    }

    return {
      duration: computedDuration,
      articles: articlesToRead,
    };
  };

  const curatedArticles = getCuratedArticles(
    filteredItems,
    duration
  );

  return {
    duration: curatedArticles.computedDuration,
    articles: curatedArticles.articles,
    isDurationModified: curatedArticles.computedDuration !== duration,
  };
}

async function getPreviousDigests(userId, today) {
  // today: 2022-02-03
  const previousDigests = await getDocument("DIGESTS", userId); // {id, data} || undefined
  // functions.logger.log("getPreviousDigests today", today);

  if (previousDigests) {
    const { data } = previousDigests; // data: { [2022-02-02]: [{ id, url }, ...], ... }

    if (!data) {
      return [];
    }
    const keys = Object.keys(data);

    //functions.logger.log("keys", keys);

    if (keys.length) {
      const filteredDigests = keys.filter((k) =>
        compareDates(moment(k), moment(today).subtract(7, 'days'))
      );

      //functions.logger.log("filteredDigests", filteredDigests);

      return filteredDigests
        .map((f) => data[f])
        .map((v) => v.map((v) => v.id))
        .reduce((acc, v) => [...acc, ...v], []);
    }
  }
  return [];
}

async function getUserDigest(
  { data, id },
  defaultDuration = DEFAULT_DURATION,
  today
) {
  const response = await axios.post("https://getpocket.com/v3/get", {
    consumer_key: CONSUMER_KEY,
    access_token: data.accessToken,
    state: "unread",
    contentType: "article",
    sort: "newest",
    detailType: "complete",
    // since: new Date('2013-01-01').getTime() / 1000,
    count: DEFAULT_COUNT,
  });
  let items = Object.values(response.data.list);
  // functions.logger.log("items", items);
  const previousDigests = await getPreviousDigests(id, today);
  // functions.logger.log("getPreviousDigests", previousDigests);
  const toRemove = new Set(previousDigests);

  items = items.filter((i) => !toRemove.has(i.item_id));
  //functions.logger.log("after filter items", items);

  if (items?.length) {
    const { duration, articles, isDurationModified } = getMaxArticles(
      items,
      defaultDuration
    );
    // functions.logger.log("articles", articles);

    const encryptedArticles = articles.map((s) => ({
      ...s,
      formattedDate: moment().valueOf(),
      salt: encrypt(
        `${data.accessToken}${DELIMITER}${s.item_id}${DELIMITER}${s.resolved_url}${DELIMITER}${today}`
      ),
    }));
    // functions.logger.log("duration", duration);
    return {
      duration,
      articles: encryptedArticles,
      isDurationModified,
      canRefer: previousDigests.length >= 3,
    };
  }
  return { duration: 0, articles: [] };
}

async function sendUserDigest({
  duration,
  name,
  articles,
  email,
  id,
  date,
  isDurationModified,
  canRefer,
  referral_id,
}) {
  const msg = {
    from: functions.config().default["digest-from"],
    template_id: functions.config().default["digest-templateid"],
    personalizations: [
      {
        to: { email },
        custom_args: {
          digest: encrypt(`${date}${DELIMITER}${id}`),
        },
        dynamic_template_data: {
          isDurationModified,
          duration,
          name: name || undefined,
          nbArticles: articles.length,
          articles,
          originUrl: options.default.origin,
          canRefer,
          referral_id,
        },
      },
    ],
  };
  // functions.logger.log("msg", msg);
  return await sgMail.send(msg);
}

module.exports = {
  getMaxArticles,
  getUserDigest,
  sendUserDigest,
  DEFAULT_DURATION,
};
