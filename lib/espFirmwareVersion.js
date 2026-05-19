/**
 * ESP32 esp_app_desc_t helpers — read / write version field in application .bin
 */

const MAGIC = 0xabcd5432;
const VERSION_OFFSET = 0x10;
const VERSION_LEN = 32;

function normalizeVersion(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  return trimmed.startsWith('v') ? trimmed : `v${trimmed}`;
}

function isGenericVersion(version) {
  const bare = String(version || '').replace(/^v/i, '');
  return bare === '1.0' || bare === '1.0.0';
}

/**
 * @param {string} filename
 * @returns {string|null}
 */
function extractVersionFromFilename(filename) {
  if (!filename) return null;
  const match = String(filename).match(/v?(\d+\.\d+\.\d+)/i);
  if (!match) return null;
  return normalizeVersion(match[1]);
}

/**
 * @param {Buffer} buffer
 * @returns {string|null}
 */
function extractEsp32FirmwareVersion(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 0x40) {
    return null;
  }

  for (let offset = 0; offset <= buffer.length - 0x100; offset += 4) {
    if (buffer.readUInt32LE(offset) !== MAGIC) {
      continue;
    }

    const raw = buffer
      .toString('utf8', offset + VERSION_OFFSET, offset + VERSION_OFFSET + VERSION_LEN)
      .replace(/\0/g, '')
      .trim();

    if (!raw || raw.length > 31 || !/^[\w.\-+]+$/.test(raw)) {
      continue;
    }

    const version = normalizeVersion(raw);
    if (version && !isGenericVersion(version)) {
      return version;
    }
  }

  return null;
}

/**
 * Écrit la version catalogue dans esp_app_desc (toutes les occurrences trouvées).
 * @param {Buffer} buffer
 * @param {string} version
 * @returns {{ buffer: Buffer, patched: boolean, slots: number }}
 */
function patchEsp32FirmwareVersion(buffer, version) {
  const normalized = normalizeVersion(version);
  if (!normalized) {
    return { buffer, patched: false, slots: 0 };
  }

  const patched = Buffer.from(buffer);
  const versionText = normalized.slice(0, VERSION_LEN - 1);
  let slots = 0;

  for (let offset = 0; offset <= patched.length - 0x100; offset += 4) {
    if (patched.readUInt32LE(offset) !== MAGIC) {
      continue;
    }

    patched.fill(0, offset + VERSION_OFFSET, offset + VERSION_OFFSET + VERSION_LEN);
    patched.write(versionText, offset + VERSION_OFFSET, 'utf8');
    slots += 1;
  }

  return {
    buffer: patched,
    patched: slots > 0,
    slots,
  };
}

module.exports = {
  extractEsp32FirmwareVersion,
  extractVersionFromFilename,
  normalizeVersion,
  patchEsp32FirmwareVersion,
  isGenericVersion,
};
