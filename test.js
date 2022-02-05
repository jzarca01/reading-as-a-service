const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { PubSub } = require("@google-cloud/pubsub");

admin.initializeApp();

const pubsub = new PubSub({
  projectId: "reading-as-a-service",
  apiEndpoint: "localhost:8085", // Change it to your PubSub emulator address and port
});

async function init() {
  const SCHEDULED_FUNCTION_TOPIC = "firebase-schedule-sendDigest";
  console.log(
    `Trigger sheduled function via PubSub topic: ${SCHEDULED_FUNCTION_TOPIC}`
  );
  await pubsub.topic(SCHEDULED_FUNCTION_TOPIC).publish(
    Buffer.from(JSON.stringify({foo: 'bar'}))
  );
}

init();
