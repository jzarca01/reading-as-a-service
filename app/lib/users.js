const functions = require("firebase-functions");

const { getCollection, updateDocument, firestore } = require("./database");
const { sgMail } = require("./mail");
const { encrypt } = require("../lib/crypto");
const { DEFAULT_DURATION } = require("../lib/articles");
const options = require("../options");
const { DELIMITER } = require("./utils");

async function getUsers(field, value) {
  const users = await getCollection("USERS", [
    {
      field,
      operation: "==",
      value,
    },
  ]);

  return users;
}

async function isExistingUser(email) {
  const users = await getUsers("email", email);
  return !!users.length;
}

async function getActiveUsers() {
  return await getUsers("isActive", true);
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
      const docId = context.params.userId;

      if (document.isError) {
        const msg = {
          from: functions.config().default["account-from"],
          template_id: "d-4eb691b1fe1b4c30b3cf2bda7f5b4c45",
          personalizations: [
            {
              to: { email: document.email },
              dynamic_template_data: {
                usId: encrypt(docId),
                originUrl: options.default.origin,
              },
            },
          ],
        };
        
        await sgMail.send(msg);
      }

      return true;
    } catch (err) {
      functions.logger.warn(err);
      return false;
    }
  });

const onEventsUpdated = functions.firestore
  .document("EVENTS/{userId}")
  .onUpdate(async (change, context) => {
    try {
      const document = change.after.data();
      const docId = context.params.userId;

      if (!document.first_activation) {
        const msg = {
          from: functions.config().default["account-from"],
          template_id: functions.config().default["account-thankyou"],
          personalizations: [
            {
              to: { email: document.email },
              dynamic_template_data: {
                id: encrypt(docId),
                originUrl: options.default.origin,
                currentArticleUrl:
                  functions.config().default["current-articleurl"],
                currentArticleTitle:
                  functions.config().default["current-articletitle"],
                currentArticleDuration:
                  functions.config().default["current-articleduration"],
                currentArticleDescription:
                  functions.config().default["current-articledescription"],
                salt: encrypt(
                  `${document.accessToken}${DELIMITER}welcome${DELIMITER}${
                    functions.config().default["current-articleurl"]
                  }`
                ),
              },
            },
          ],
        };

        await Promise.all([
          sgMail.send(msg),
          updateDocument("USERS", context.params.userId, {
            isActive: true,
          }),
          updateDocument("EVENTS", context.params.userId, {
            first_activation: new Date(),
          }),
        ]);
      }
      await updateDocument("USERS", context.params.userId, {
        isActive: true,
      });

      return true;
    } catch (err) {
      functions.logger.warn(err);
      return false;
    }
  });

module.exports = {
  getActiveUsers,
  getUsers,
  isExistingUser,
  onUserCreated,
  onUserUpdated,
  onEventsUpdated,
};
