// server/src/middleware/sanitize.js
const validator = require('validator');

const sanitizeBody = (fields = []) => (req, res, next) => {
  for (const f of fields) {
    if (req.body && req.body[f] !== undefined) {
      req.body[f] = validator.escape(String(req.body[f]).trim());
      if (req.body[f].length > 200) {
        req.body[f] = req.body[f].slice(0, 200);
      }
    }
  }
  next();
};

module.exports = { sanitizeBody };
