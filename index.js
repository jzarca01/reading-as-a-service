const admin = require("firebase-admin");
const functions = require("firebase-functions");
const moment = require("moment");

admin.initializeApp();

const app = require("./app");
const {
  getActiveUsers,
  onUserCreated,
  onUserUpdated,
  onEventsUpdated,
} = require("./app/lib/users");
const { getCollection } = require("./app/lib/database");
const { asyncPool } = require("./app/lib/utils");
const { prepareUserDigest, deleteSession } = require("./app/lib/scheduled");
const MAX_CONCURRENT = 3;

exports.app = functions.https.onRequest(app);

exports.onUserUpdated = onUserUpdated;
exports.onUserCreated = onUserCreated;
exports.onEventsUpdated = onEventsUpdated;

/**
 * Run once a day at 6am, to send users' digests
 */
exports.sendDigest = functions.pubsub
  .schedule("0 6 * * MON-SAT")
  .timeZone("Europe/Paris")
  .onRun(async (context) => {
    const activeUsers = await getActiveUsers();
    const today = moment().format(moment.HTML5_FMT.DATE).toString();
    await asyncPool(MAX_CONCURRENT, activeUsers, prepareUserDigest, today);
    // functions.logger.log("Digest generation finished");
    return true;
  });

/**
 * Run every sunday at 4am to clean sessions
 */
exports.removeSessions = functions.pubsub
  .schedule("0 4 * * SUN")
  .timeZone("Europe/Paris")
  .onRun(async (context) => {
    const sessions = await getCollection("sessions");
    await asyncPool(MAX_CONCURRENT, sessions, deleteSession);
    // functions.logger.log("Sessions cleanup finished");
    return true;
  });
