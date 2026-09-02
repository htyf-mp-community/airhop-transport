// Base64 conversion without Node globals, so the same code runs under Hermes.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeToBase64(bytes: Uint8Array): string {
  let output = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const a = bytes[offset] ?? 0;
    const b = bytes[offset + 1] ?? 0;
    const c = bytes[offset + 2] ?? 0;
    const value = (a << 16) | (b << 8) | c;
    output += ALPHABET[(value >>> 18) & 63] + ALPHABET[(value >>> 12) & 63];
    output += offset + 1 < bytes.length ? ALPHABET[(value >>> 6) & 63] : "=";
    output += offset + 2 < bytes.length ? ALPHABET[value & 63] : "=";
  }
  return output;
}

export function decodeFromBase64(input: string): Uint8Array {
  const source = input.replace(/\s/g, "");
  if (source.length === 0) return new Uint8Array();
  if (source.length % 4 !== 0) throw new Error("Invalid base64 length");
  const padding = source.endsWith("==") ? 2 : source.endsWith("=") ? 1 : 0;
  const output = new Uint8Array((source.length / 4) * 3 - padding);
  let cursor = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    const values = [0, 1, 2, 3].map((index) => {
      const character = source[offset + index];
      if (character === "=") return 0;
      const value = ALPHABET.indexOf(character);
      if (value < 0) throw new Error("Invalid base64 character");
      return value;
    });
    const value = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    if (cursor < output.length) output[cursor++] = (value >>> 16) & 255;
    if (cursor < output.length) output[cursor++] = (value >>> 8) & 255;
    if (cursor < output.length) output[cursor++] = value & 255;
  }
  return output;
}
