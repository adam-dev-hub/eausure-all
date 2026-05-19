const {
  extractEsp32FirmwareVersion,
  normalizeVersion,
  patchEsp32FirmwareVersion,
  extractVersionFromFilename,
} = require('./espFirmwareVersion');

/**
 * Prochain numéro de release (patch +1) pour une plateforme.
 * @param {import('mongoose').Model} FirmwareRelease
 * @param {'gateway'|'node'} platform
 * @param {string} channel
 */
async function bumpNextReleaseVersion(FirmwareRelease, platform, channel = 'stable') {
  const latest = await FirmwareRelease.findOne({
    platform,
    channel,
    status: { $in: ['active', 'draft'] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!latest?.version) {
    return 'v0.0.1';
  }

  const match = String(latest.version).replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return `v${latest.version}-1`;
  }

  const patch = Number(match[3]) + 1;
  return `v${match[1]}.${match[2]}.${patch}`;
}

/**
 * Choisit la version catalogue + patch le .bin pour esp_app_desc.version.
 * @returns {Promise<{ version: string, buffer: Buffer, source: string, patched: boolean }>}
 */
async function prepareFirmwareBinaryForRelease({
  buffer,
  platform,
  channel,
  filename,
  submittedVersion,
  FirmwareRelease,
}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Invalid firmware buffer');
  }

  const fromBin = extractEsp32FirmwareVersion(buffer);
  const fromName = extractVersionFromFilename(filename);
  const manual = submittedVersion ? normalizeVersion(submittedVersion) : null;

  let version = manual || fromBin || fromName;
  let source = manual
    ? 'manual'
    : fromBin
      ? 'binary'
      : fromName
        ? 'filename'
        : 'auto-bump';

  if (!version) {
    version = await bumpNextReleaseVersion(FirmwareRelease, platform, channel);
    source = 'auto-bump';
  } else {
    version = normalizeVersion(version);
  }

  const patchResult = patchEsp32FirmwareVersion(buffer, version);
  return {
    version,
    buffer: patchResult.buffer,
    source,
    patched: patchResult.patched,
  };
}

module.exports = {
  bumpNextReleaseVersion,
  prepareFirmwareBinaryForRelease,
};
