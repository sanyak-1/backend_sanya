const crypto = require('crypto');

const calculateFileHash = (buffer) => {
  return crypto
    .createHash('md5')
    .update(buffer)
    .digest('hex');
};

module.exports = { calculateFileHash };