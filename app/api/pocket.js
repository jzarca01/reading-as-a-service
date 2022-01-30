const functions = require("firebase-functions");

const express = require("express");
const axios = require("axios");

const { getDocument, updateDocument } = require("../lib/database");
const { decrypt } = require("../lib/crypto");
const { getActiveUsers } = require("../lib/users");
const { asyncForEach, DELIMITER } = require("../lib/utils");
const { getUserDigest, sendUserDigest } = require("../lib/articles");

// eslint-disable-next-line new-cap
const router = express.Router();

const ALLOWED_ACTIONS = ["archive", "delete", "read", "readd"];
const CONSUMER_KEY = functions.config().default["consumer-key"];

router.get("/action/:action/:encrypted_text", async function (req, res) {
  try {
    const { action, encrypted_text } = req.params;

    if (!ALLOWED_ACTIONS.includes(action)) {
      return res.status(401).send({ error: "action not authorized" });
    }

    const [accessToken, itemId, articleUrl] =
      decrypt(encrypted_text).split(DELIMITER);

    if (!accessToken || !itemId) {
      return res.status(401).send({ error: "missing parameters" });
    }

    const isRead = action === "read";

    const response = await axios.post("https://getpocket.com/v3/send", {
      consumer_key: CONSUMER_KEY,
      access_token: accessToken,
      actions: [
        {
          action: "tags_add",
          item_id: itemId,
          tags: "reading_as_a_service",
        },
        {
          action: isRead ? "archive" : action,
          item_id: itemId,
        },
      ],
    });

    if (articleUrl && isRead) {
      return res.redirect(articleUrl);
    }

    return res.status(response.status).send({
      message: `Your article has been successfully ${action}d. You can safely close this page now.`,
    });
  } catch (err) {
    console.log("error", err);
    return res.status(500).send(err.message);
  }
});

router.get("/digest", async function (req, res) {
  try {
    const activeUsers = await getActiveUsers();
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    await asyncForEach(activeUsers, async (user) => {
      try {
        const { data, id } = user;
        if (!!(data.accessToken !== "" && data.email)) {
          const prefs = await getDocument("PREFERENCES", id);
          const dailyDigest = await getUserDigest(
            data.accessToken,
            prefs?.duration || undefined
          );

          if (dailyDigest.articles.length) {
            Promise.all([
              await sendUserDigest(
                { ...dailyDigest, name: data.name || undefined },
                data.email,
                id,
                today
              ),
              await updateDocument("EVENTS", id, {
                last_digest_sent: today,
              }),
            ]);
          }
        }
        return true;
      } catch (err) {
        console.log(err);
        return res.status(401).send({ error: "TODO: invalid access token" });
      }
    });
    return res
      .status(200)
      .send({ message: `${activeUsers.length} emails sent.` });
  } catch (err) {
    console.log("error", err);
    return res.status(500).send(err.message);
  }
});

module.exports = router;
