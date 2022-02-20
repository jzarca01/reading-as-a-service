const functions = require("firebase-functions");

const { getDocument, updateDocument, deleteDocument } = require("./database");
const { getUserDigest, sendUserDigest } = require("./articles");

async function prepareUserDigest(user, allUsers, today) {
  try {
    const hasCorrectInfos =
      user.data.accessToken !== "" && user.data.email !== "";

    if (hasCorrectInfos) {
      const {
        id,
        data: { name, email, referral_id },
      } = user;

      const prefs = await getDocument("PREFERENCES", id);
      // functions.logger.log("prefs", prefs);

      const dailyDigest = await getUserDigest(user, prefs?.duration, today[0]);
      // functions.logger.log("dailyDigest", dailyDigest);

      if (dailyDigest.articles.length) {
        functions.logger.log("dailyDigest", dailyDigest);
        functions.logger.log("user", user);

        return Promise.all([
          await sendUserDigest({
            ...dailyDigest,
            name,
            email,
            id,
            date: today[0],
            referral_id,
          }),
          await updateDocument("EVENTS", id, {
            last_digest_sent: today[0],
          }),
          await updateDocument("DIGESTS", id, {
            [today[0]]: dailyDigest.articles.map((a) => a.item_id),
          }),
        ]);
      }
    }
  } catch (err) {
    functions.logger.warn(err);
    if (err.response.status === 403 || err.response.status === 401) {
      updateDocument("USERS", user.id, {
        isError: true,
        isActive: false,
      });
    }
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
