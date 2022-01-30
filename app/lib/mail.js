const functions = require("firebase-functions");

const sgMail = require("@sendgrid/mail");

const TRACKED_EVENTS = ["delivered", "open", "click", "unsubscribe"];

sgMail.setApiKey(functions.config().default["sendgrid-apikey"]);

module.exports = { sgMail, TRACKED_EVENTS };
