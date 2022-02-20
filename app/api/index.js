const functions = require("firebase-functions");

const express = require("express");

const session = require("express-session");
const FirestoreStore = require("firestore-store")(session);
const grant = require("grant-express");

const {
  updateDocument,
  addDocument,
  getDocument,
  UNDEFINED,
} = require("../lib/database");
const { decrypt } = require("../lib/crypto");

const pocket = require("./pocket");
const preferences = require("./preferences");
const options = require("../options");
const { isExistingUser } = require("../lib/users");
const { TRACKED_EVENTS } = require("../lib/mail");
const { asyncForEach, DELIMITER, compareDates } = require("../lib/utils");
const { firestore } = require("../lib/database");

// eslint-disable-next-line new-cap
const router = express.Router();

router.use(
  session({
    store: new FirestoreStore({
      database: firestore,
    }),
    name: "__session",
    secret: "secret",
    resave: true,
    saveUninitialized: true,
  })
);

router.use(grant(options));
router.use(express.json());

router.post("/signup", async function (req, res) {
  try {
    const data = req.body;

    const exists = await isExistingUser(data.email);

    if (exists) {
      return res.status(500).send({ error: "user already exists" });
    }

    const { email, ...rest } = data;

    await addDocument("USERS", {
      email: data.email,
      isActive: false,
      ...rest,
    });

    return res.status(200).send({ message: "ok" });
  } catch (err) {
    functions.logger.warn("error", err);
    return res.status(500).send(err.message);
  }
});

router.get("/login", function (req, res) {
  const usId = req.query.usId;
  if (!usId) {
    return res.status(500).send({ error: "missing userId" });
  }
  return res.redirect(`/app/api/connect/getpocket/?state=${usId}`);
});

router.get("/callback", async function (req, res) {
  try {
    const {
      query: { raw },
    } = req;

    // functions.logger.log("req.query", req.query);

    if (raw?.state != "" && req.query.access_token) {
      const docId = decrypt(raw.state);
      const doc = await getDocument("USERS", docId);

      const exists = await isExistingUser(doc.data.email);

      if (doc?.id) {
        await updateDocument("USERS", doc.id, {
          accessToken: req.query.access_token,
          name: raw?.username || "",
          ...(doc.data.isError && { isError: UNDEFINED }),
          ...(!exists && { isSendWelcomeEmail: true }),
        });
        return res.redirect("/app/complete");
      }
      return res.status(500).send({ error: "no such document" });
    }
    return res.status(500).send({ error: "invalid state" });
  } catch (err) {
    functions.logger.warn("error", err);
    return res.status(500).send(err.message);
  }
});

router.post("/webhook", async function (req, res) {
  try {
    const filteredEvents = (req.body || []).filter(
      (e) => TRACKED_EVENTS.includes(e.event) && e.hasOwnProperty("digest")
    );

    if (filteredEvents.length) {
      const [digest, docId] = decrypt(filteredEvents[0].digest).split(
        DELIMITER
      );

      const eventsDoc = await getDocument("EVENTS", docId);

      if (!eventsDoc) {
        return res.status(500).send({ error: "no such document" });
      }

      const { data } = eventsDoc;
      await asyncForEach(filteredEvents, async (e) => {
        if (
          data?.[`last_digest_${e.event}`] &&
          (data?.[`last_digest_${e.event}`] === digest ||
            compareDates(data?.[`last_digest_${e.event}`], digest))
        ) {
          return true;
        }
        await updateDocument("EVENTS", docId, {
          [`last_digest_${e.event}`]: digest,
        });
        return true;
      });
      return res.status(200).send({ message: "ok" });
    }
    return res.status(200).send({ message: "ok" });
  } catch (err) {
    functions.logger.warn("error", err);
    return res.status(500).send(err.message);
  }
});

router.post("/tuemilio", async function (req, res) {
  try {
    // functions.logger.log(req.body);
    if (req.body?.event === "grant-access" && req.body?.address) {
      const { address, referrer_id, referral_id } = req.body;

      await addDocument("USERS", {
        email: address,
        isActive: false,
        referrer_id,
        referral_id,
      });
    }
    return res.status(200).send({ message: "ok" });
  } catch (err) {
    functions.logger.warn("error", err);
    return res.status(500).send(err.message);
  }
});

router.use("/pocket", pocket);
router.use("/preferences", preferences);

module.exports = router;
