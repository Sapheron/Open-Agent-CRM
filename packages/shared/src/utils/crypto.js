"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encrypt = encrypt;
exports.decrypt = decrypt;
exports.isEncrypted = isEncrypted;
const crypto_1 = require("crypto");
function getKey() {
    const key = process.env.ENCRYPTION_KEY;
    if (!key)
        throw new Error('ENCRYPTION_KEY env var is not set');
    if (key.length !== 64)
        throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
    return Buffer.from(key, 'hex');
}
/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:ciphertext (all hex-encoded).
 */
function encrypt(plaintext) {
    const key = getKey();
    const iv = (0, crypto_1.randomBytes)(12); // 96-bit IV for GCM
    const cipher = (0, crypto_1.createCipheriv)('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}
/**
 * Decrypt a value produced by encrypt().
 */
function decrypt(ciphertext) {
    const key = getKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3)
        throw new Error('Invalid ciphertext format');
    const [ivHex, tagHex, encHex] = parts;
    const decipher = (0, crypto_1.createDecipheriv)('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(encHex, 'hex')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}
/** Returns true if the string looks like an encrypted value (iv:tag:ciphertext). */
function isEncrypted(value) {
    const parts = value.split(':');
    return parts.length === 3 && parts.every((p) => /^[0-9a-f]+$/i.test(p));
}
//# sourceMappingURL=crypto.js.map