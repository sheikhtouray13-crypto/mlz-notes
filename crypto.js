/* =========================================================
   ملاحظاتي — طبقة التشفير المحلية
   PBKDF2-SHA256 (310,000 iterations) + AES-256-GCM
   ========================================================= */
(function () {
  "use strict";

  var ITERATIONS = 310000;
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();

  function toBase64(bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var chunk = 0x8000;
    var out = "";
    for (var i = 0; i < arr.length; i += chunk) {
      out += String.fromCharCode.apply(null, arr.subarray(i, i + chunk));
    }
    return btoa(out);
  }

  function fromBase64(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function concat(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function randomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  }

  async function deriveBits(password, saltBase64, purpose) {
    var salt = concat(fromBase64(saltBase64), encoder.encode("|mnotes|" + purpose));
    var material = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveBits"]
    );
    var bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" },
      material,
      256
    );
    return new Uint8Array(bits);
  }

  async function createSalt() {
    return toBase64(randomBytes(16));
  }

  async function createVerifier(password, saltBase64) {
    return toBase64(await deriveBits(password, saltBase64, "auth"));
  }

  async function wrappingKey(password, saltBase64) {
    var raw = await deriveBits(password, saltBase64, "vault");
    try {
      return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    } finally {
      raw.fill(0);
    }
  }

  function vaultAesKey(vaultKeyBase64) {
    return crypto.subtle.importKey(
      "raw",
      fromBase64(vaultKeyBase64),
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function createVaultKey() {
    return toBase64(randomBytes(32));
  }

  async function wrapVaultKey(vaultKeyBase64, password, saltBase64) {
    var key = await wrappingKey(password, saltBase64);
    var iv = randomBytes(12);
    var ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv, tagLength: 128 },
      key,
      fromBase64(vaultKeyBase64)
    );
    return { iv: toBase64(iv), ct: toBase64(ciphertext) };
  }

  async function unwrapVaultKey(wrapped, password, saltBase64) {
    var key = await wrappingKey(password, saltBase64);
    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(wrapped.iv), tagLength: 128 },
      key,
      fromBase64(wrapped.ct)
    );
    return toBase64(new Uint8Array(plain));
  }

  async function encryptJSON(data, vaultKeyBase64) {
    var key = await vaultAesKey(vaultKeyBase64);
    var iv = randomBytes(12);
    var plaintext = encoder.encode(JSON.stringify(data));
    var ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv, tagLength: 128 },
      key,
      plaintext
    );
    plaintext.fill(0);
    return { v: 1, iv: toBase64(iv), ct: toBase64(ciphertext) };
  }

  async function decryptJSON(payload, vaultKeyBase64) {
    var key = await vaultAesKey(vaultKeyBase64);
    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv), tagLength: 128 },
      key,
      fromBase64(payload.ct)
    );
    return JSON.parse(decoder.decode(new Uint8Array(plain)));
  }

  function constantTimeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    var mismatch = 0;
    for (var i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return mismatch === 0;
  }

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    var bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" + hex.slice(16, 20) + "-" + hex.slice(20);
  }

  window.MNotesCrypto = {
    iterations: ITERATIONS,
    createSalt: createSalt,
    createVerifier: createVerifier,
    createVaultKey: createVaultKey,
    wrapVaultKey: wrapVaultKey,
    unwrapVaultKey: unwrapVaultKey,
    encryptJSON: encryptJSON,
    decryptJSON: decryptJSON,
    constantTimeEqual: constantTimeEqual,
    randomId: randomId
  };
})();
