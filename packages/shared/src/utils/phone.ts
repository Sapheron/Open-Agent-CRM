/**
 * Normalize a phone number to E.164 format: +[country code][number]
 * Strips spaces, dashes, parentheses, etc.
 * Defaults to India (+91) if no country code is detected.
 */
export function normalizePhone(raw: string, defaultCountryCode = '91'): string {
  // Remove all non-digit characters except leading +
  let digits = raw.replace(/[^\d+]/g, '');

  // Already E.164
  if (digits.startsWith('+')) {
    return digits;
  }

  // Remove leading zeros
  digits = digits.replace(/^0+/, '');

  // If starts with country code (e.g. 91XXXXXXXXXX for India)
  if (digits.startsWith(defaultCountryCode) && digits.length > 10) {
    return `+${digits}`;
  }

  return `+${defaultCountryCode}${digits}`;
}

/** Extract the JID (phone@s.whatsapp.net) from a Baileys JID. */
export function jidToPhone(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

/** Convert a phone number to a Baileys JID. */
export function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}
