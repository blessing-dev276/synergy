const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

if (getApps().length === 0) {
  initializeApp();
}

const db = getFirestore();
const auth = getAuth();

module.exports = { db, auth, FieldValue };
