module.exports = {
  'port': process.env.PORT !== undefined ? parseInt(process.env.PORT) : 8084,
  'elasticsearch': process.env.ELASTIC !== undefined ? `http://${process.env.ELASTIC}` : 'http://localhost',
  'redis': process.env.REDIS !== undefined ? process.env.REDIS : 'localhost',
  'redisport': process.env.REDISPORT !== undefined ? parseInt(process.env.REDISPORT) : 6379,
  'maxAttachmentBytes': process.env.MAX_ATTACHMENT_BYTES !== undefined ? parseInt(process.env.MAX_ATTACHMENT_BYTES) : 104857600,
}