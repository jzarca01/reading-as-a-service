const functions = require("firebase-functions");

const { getCollection, updateDocument } = require("./database");
const { sgMail } = require("./mail");
const { encrypt } = require("../lib/crypto");
const { DEFAULT_DURATION } = require("../lib/articles");
const options = require("../options");
const { DELIMITER } = require("./utils");

async function isExistingUser(email) {
  const users = await getCollection("USERS", [
    {
      field: "email",
      operation: "==",
      value: email,
    },
  ]);

  return users.length > 0;
}

async function getActiveUsers() {
  const activeUsers = await getCollection("USERS", [
    {
      field: "isActive",
      operation: "==",
      value: true,
    },
  ]);

  return activeUsers;
}

const onUserCreated = functions.firestore
  .document("USERS/{userId}")
  .onCreate(async (snap, context) => {
    try {
      const data = snap.data();
      const docId = context.params.userId;

      const msg = {
        from: functions.config().default["account-from"],
        template_id: functions.config().default["account-welcome"],
        personalizations: [
          {
            to: { email: data.email },
            dynamic_template_data: {
              usId: encrypt(docId),
              originUrl: options.default.origin,
            },
          },
        ],
      };

      await Promise.all([
        updateDocument("EVENTS", context.params.userId, {
          account_creation: new Date(),
        }),
        updateDocument("PREFERENCES", context.params.userId, {
          duration: DEFAULT_DURATION,
        }),
        updateDocument("DIGESTS", context.params.userId, {}),
        sgMail.send(msg),
      ]);

      return true;
    } catch (err) {
      functions.logger.warn(err);
      return false;
    }
  });

const onUserUpdated = functions.firestore
  .document("USERS/{userId}")
  .onUpdate(async (change, context) => {
    try {
      const document = change.after.data();

      if (document.isActive) {
        return null;
      }

      const msg = {
        from: functions.config().default["account-from"],
        template_id: functions.config().default["account-thankyou"],
        personalizations: [
          {
            to: { email: document.email },
            dynamic_template_data: {
              id: Math.random(),
              currentArticleUrl:
                functions.config().default["current-articleurl"],
              currentArticleTitle:
                functions.config().default["current-articletitle"],
              currentArticleDuration:
                functions.config().default["current-articleduration"],
              currentArticleDescription:
                functions.config().default["current-articledescription"],
              salt: encrypt(
                `${data.accessToken}${DELIMITER}welcome${DELIMITER}${
                  functions.config().default["current-articleurl"]
                }`
              ),
            },
          },
        ],
      };

      await Promise.all([
        sgMail.send(msg),
        updateDocument("EVENTS", context.params.userId, {
          first_activation: new Date(),
          isActive: true,
        }),
      ]);

      return true;
    } catch (err) {
      functions.logger.warn(err);
      return false;
    }
  });

module.exports = {
  getActiveUsers,
  isExistingUser,
  onUserCreated,
  onUserUpdated,
};
