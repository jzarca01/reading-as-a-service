const functions = require("firebase-functions");

const { getDocument, updateDocument, deleteDocument } = require("./database");
const { getUserDigest, sendUserDigest } = require("./articles");

async function prepareUserDigest(user, allUsers, today) {
  try {
    const hasCorrectInfos =
      user.data.accessToken !== "" && user.data.email !== "";

    if (hasCorrectInfos) {

      const prefs = await getDocument("PREFERENCES", user.id);
      // functions.logger.log("prefs", prefs);

      const dailyDigest = await getUserDigest(user, prefs?.duration, today[0]);
      // functions.logger.log("dailyDigest", dailyDigest);

      if (dailyDigest.articles.length) {
        // functions.logger.log("dailyDigest", dailyDigest);
        return Promise.all([
          await sendUserDigest(
            { ...dailyDigest, name: user.data.name || undefined },
            user.data.email,
            user.id,
            today[0]
          ),
          await updateDocument("EVENTS", user.id, {
            last_digest_sent: today[0],
          }),
          await updateDocument("DIGESTS", user.id, {
            [today[0]]: dailyDigest.articles.map((a) => a.item_id),
          }),
        ]);
      }
    }
  } catch (err) {
    functions.logger.warn(err);
  } finally {
    return null;
  }
}

async function deleteSession(session) {
  const { id } = session;
  await deleteDocument("sessions", id);
  return true;
}

module.exports = {
  prepareUserDigest,
  deleteSession,
};
