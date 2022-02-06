const functions = require("firebase-functions");

const express = require("express");
const axios = require("axios");

const { decrypt } = require("../lib/crypto");
const { DELIMITER } = require("../lib/utils");

// eslint-disable-next-line new-cap
const router = express.Router();

const ALLOWED_ACTIONS = ["add", "archive", "delete", "read", "readd"];
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
    const isAdd = action === "add";

    let response;

    if (isAdd) {
      response = await axios.post("https://getpocket.com/v3/add", {
        consumer_key: CONSUMER_KEY,
        access_token: accessToken,
        url: articleUrl,
      });
    } else {
      response = await axios.post("https://getpocket.com/v3/send", {
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
    }

    if (articleUrl && isRead) {
      return res.redirect(articleUrl);
    }

    return res.status(response.status).send({
      message: `Your article has been successfully ${
        isAdd ? "adde" : action
      }d. You can safely close this page now.`,
    });
  } catch (err) {
    functions.logger.warn("error", err);
    return res.status(500).send(err.message);
  }
});

module.exports = router;
