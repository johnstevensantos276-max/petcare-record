// Vercel runs this for every /api/ request (see vercel.json).
module.exports = require('../server/api').handle;
