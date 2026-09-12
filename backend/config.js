require('dotenv').config();

function envValue(key, defaultValue = '') {
  const value = process.env[key];
  return value === undefined || value === null || value === '' ? defaultValue : String(value).trim();
}

const allowedOrigins = envValue('CORS_ALLOWED_ORIGINS', '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

module.exports = {
  mongodb: {
    uri: envValue('MONGODB_URI', ''),
    db: envValue('MONGODB_DB', 'oil_management_system'),
  },
  jwtSecret: envValue('JWT_SECRET', 'CHANGE_THIS_SECRET_FOR_PRODUCTION_2026'),
  jwtExpireSeconds: Number(envValue('JWT_EXPIRE_SECONDS', String(60 * 60 * 24 * 7))),
  uploadMaxMb: Number(envValue('UPLOAD_MAX_MB', '200')),
  uploadDbMaxMb: Number(envValue('UPLOAD_DB_MAX_MB', '10')),
  port: Number(envValue('PORT', '3000')),
  corsAllowAll: envValue('CORS_ALLOW_ALL', 'true') === 'true',
  corsAllowedOrigins: allowedOrigins,
};
