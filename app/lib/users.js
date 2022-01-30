const functions = require("firebase-functions");

const { getCollection, updateDocument } = require("./database");
const { sgMail } = require("./mail");
const { encrypt } = require("../lib/crypto");
const { DEFAULT_DURATION } = require("../lib/articles");
const options = require("../options");

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
        from: functions.config().default["sendgrid-from"],
        template_id: "d-734bf729c0c44ca893b7088b4e51a961",
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
        sgMail.send(msg),
      ]);

      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  });

const onUserUpdated = functions.firestore
  .document("USERS/{userId}")
  .onUpdate(async (change, context) => {
    try {
      const document = change.after.data();

      if (document.first_activation) {
        return null;
      }

      const msg = {
        from: functions.config().default["sendgrid-from"],
        template_id: "d-2b5c2fdc6f6d4cf08cb1d4c2995aaa52",
        personalizations: [
          {
            to: { email: document.email },
            dynamic_template_data: {
              id: Math.random(),
            },
          },
        ],
      };

      await Promise.all([
        sgMail.send(msg),
        updateDocument("EVENTS", context.params.userId, {
          first_activation: new Date(),
        }),
      ]);

      return true;
    } catch (err) {
      console.log(err);
      return false;
    }
  });

module.exports = {
  getActiveUsers,
  isExistingUser,
  onUserCreated,
  onUserUpdated,
};
