const admin = require('firebase-admin');

admin.initializeApp();

const firestore = admin.firestore();

async function addDocument(collection, data) {
  const db = await firestore;

  const docRef = db.collection(collection).doc();
  await docRef.set(data);
  return docRef.get();
}

async function updateDocument(collection, document, data) {
  const db = await firestore;

  const docRef = db.collection(collection).doc(document);
  return docRef.set(data, { merge: true });
}

async function deleteDocument(collection, document) {
  const db = await firestore;

  const docRef = db.collection(collection).doc(document);
  return docRef.delete();
}

async function getDocument(collection, document) {
  const db = await firestore;

  const docRef = db.collection(collection).doc(document);
  const doc = await docRef.get();
  if (doc.exists) {
    return { id: doc.id, data: doc.data() }
  }
  console.log('No such document!');
  return undefined;
}

async function getCollection(collection, filters) {
  const db = await firestore;

  const documents = [];

  const collectionRef = db.collection(collection);
  let snapshot = collectionRef;

  if (filters) {
    filters.map(
      (filter) =>
        (snapshot = snapshot.where(
          filter.field,
          filter.operation,
          filter.value
        ))
    );
  }

  snapshot = await snapshot.get();

  snapshot.forEach((doc) => {
    documents.push({ id: doc.id, data: doc.data() });
  });

  return documents;
}

module.exports = {
  getCollection,
  getDocument,
  updateDocument,
  addDocument,
  deleteDocument,
  firestore,
};
