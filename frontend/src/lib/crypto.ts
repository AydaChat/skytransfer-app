/**
 * WebCrypto AES-256-GCM Implementation for SkyTransfer
 */

// Derives an AES-GCM 256 key from a passphrase (e.g., 6-digit PIN + shared secret)
export async function deriveKey(pin: string, saltString: string = 'SkyTransferSecureSalt'): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const salt = enc.encode(saltString);

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypts an ArrayBuffer chunk. Prepend 12-byte IV to ciphertext.
export async function encryptChunk(key: CryptoKey, chunk: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    chunk
  );

  const payload = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  payload.set(iv, 0);
  payload.set(new Uint8Array(ciphertext), iv.byteLength);

  return payload.buffer;
}

// Decrypts a chunk. Extracts 12-byte IV from the start.
export async function decryptChunk(key: CryptoKey, encryptedChunk: ArrayBuffer): Promise<ArrayBuffer> {
  const encryptedBytes = new Uint8Array(encryptedChunk);
  const iv = encryptedBytes.slice(0, 12);
  const ciphertext = encryptedBytes.slice(12);

  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
}
