const DEFAULT_MAX_ATTACHMENT_BYTES = 104857600;

function parseMaxAttachmentBytes(raw) {
  if (raw === undefined) {
    return DEFAULT_MAX_ATTACHMENT_BYTES;
  }
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Invalid MAX_ATTACHMENT_BYTES "${raw}", falling back to ${DEFAULT_MAX_ATTACHMENT_BYTES}`);
    return DEFAULT_MAX_ATTACHMENT_BYTES;
  }
  return parsed;
}

module.exports = {
  'port': process.env.PORT !== undefined ? parseInt(process.env.PORT) : 8084,
  'elasticsearch': process.env.ELASTIC !== undefined ? `http://${process.env.ELASTIC}` : 'http://localhost',
  'redis': process.env.REDIS !== undefined ? process.env.REDIS : 'localhost',
  'redisport': process.env.REDISPORT !== undefined ? parseInt(process.env.REDISPORT) : 6379,
  'maxAttachmentBytes': parseMaxAttachmentBytes(process.env.MAX_ATTACHMENT_BYTES),
}