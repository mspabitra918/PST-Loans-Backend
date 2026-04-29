const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "default_secret_key_32_characters_!!"; // Must be 32 chars
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY),
    iv,
  );
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(text) {
  if (!text) return null;
  const textParts = text.split(":");
  if (textParts.length < 2) return text;
  const ivHex = textParts.shift();
  if (ivHex.length !== IV_LENGTH * 2) return text;
  try {
    const iv = Buffer.from(ivHex, "hex");
    const encryptedText = Buffer.from(textParts.join(":"), "hex");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(ENCRYPTION_KEY),
      iv,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.warn("decrypt: returning raw value, decryption failed:", err.message);
    return text;
  }
}

function hashSSN(ssn) {
  if (!ssn) return null;
  // Last 4 digits hash
  return crypto.createHash("sha256").update(ssn).digest("hex");
}

module.exports = { encrypt, decrypt, hashSSN };
