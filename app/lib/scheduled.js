const functions = require('firebase-functions');

const { getDocument, updateDocument, deleteDocument } = require('./database');
const { getUserDigest, sendUserDigest } = require('./articles');

async function prepareUserDigest(user, _allUsers, args) {
    try {
        const hasCorrectInfos =
            user.data.accessToken !== '' && user.data.email !== '';

        if (hasCorrectInfos) {
            const {
                id,
                data: { name, email, referral_id },
            } = user;

            const prefs = await getDocument('PREFERENCES', id);
            // functions.logger.log("prefs", prefs);

            const [today] = args;

            const dailyDigest = await getUserDigest(
                user,
                prefs?.duration,
                today
            );

            const getAuthors = (article) => {
                // functions.logger.log("getAuthors", article);
                if (!article?.authors) {
                    return [];
                }
                return Object.values(article.authors).map((a) => ({
                    name: a?.name,
                    url: a?.url,
                }));
            };
            // functions.logger.log("dailyDigest", dailyDigest);

            if (dailyDigest.articles.length) {
                functions.logger.log('today', today);

                return Promise.all([
                    sendUserDigest({
                        ...dailyDigest,
                        name,
                        email,
                        id,
                        date: today,
                        referral_id,
                    }),
                    updateDocument('EVENTS', id, {
                        last_digest_sent: today,
                    }),
                    updateDocument('DIGESTS', id, {
                        [today]: (dailyDigest?.articles || []).map((a) => ({
                            id: a.item_id,
                            status: 'unread',
                            metadata: {
                                ...a?.domain_metadata,
                                url: a.resolved_url || a.given_url,
                                authors: getAuthors(a),
                                lang: a.lang,
                                word_count: a.word_count,
                            },
                        })),
                    }),
                ]);
            }
        }
    } catch (err) {
        functions.logger.warn(err);
        if (err.response.status === 403 || err.response.status === 401) {
            updateDocument('USERS', user.id, {
                isError: true,
                isActive: false,
            });
        }
    } finally {
        // eslint-disable-next-line no-unsafe-finally
        return null;
    }
}

async function deleteSession(session) {
    const { id } = session;
    await deleteDocument('sessions', id);
    return true;
}

module.exports = {
    prepareUserDigest,
    deleteSession,
};
