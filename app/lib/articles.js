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

async function getPreviousDigests(userId, today) {
  // today: 2022-02-03
  const previousDigests = await getDocument("DIGESTS", userId); // {id, data} || undefined
  // functions.logger.log("getPreviousDigests today", today);

  if (previousDigests) {
    const { data } = previousDigests; // data: { [2022-02-02]: [id, ...], [2022-02-01]: [id,....]}
    const keys = Object.keys(data);
    // functions.logger.log("keys", keys);

    if (keys.length) {
      let sevenDaysAgo = new Date(today.replace(/-/g, "/"));
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoDatestamp = sevenDaysAgo.toISOString().split("T")[0];

      const filteredDigests = keys.filter((k) =>
        compareDates(k, sevenDaysAgoDatestamp)
      );
      // functions.logger.log("filteredDigests", filteredDigests);
      return filteredDigests
        .map((previousDigestDate) => data[previousDigestDate])
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
  if (previousDigests.length) {
    items = items.filter((i) => !previousDigests.includes(i.item_id));
  }
  // functions.logger.log("after filter items", items);

  if (items?.length) {
    const { duration, articles } = getMaxArticles(items, defaultDuration);
    // functions.logger.log("articles", articles);

    const encryptedArticles = articles.map((s) => ({
      ...s,
      formattedDate: new Date(s.time_added * 1000),
      salt: encrypt(
        `${data.accessToken}${DELIMITER}${s.item_id}${DELIMITER}${s.resolved_url}`
      ),
    }));
    // functions.logger.log("duration", duration);
    return { duration, articles: encryptedArticles };
  }
  return { duration: 0, articles: [] };
}

async function sendUserDigest({ duration, articles }, userEmail, id, date) {
  const msg = {
    from: functions.config().default["digest-from"],
    template_id: functions.config().default["digest-templateid"],
    personalizations: [
      {
        to: { email: userEmail },
        custom_args: {
          digest: encrypt(`${date}${DELIMITER}${id}`),
        },
        dynamic_template_data: {
          duration,
          articles,
          originUrl: options.default.origin,
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
