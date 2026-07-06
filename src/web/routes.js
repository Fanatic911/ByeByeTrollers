const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const logger = require('../utils/logger');
const router = express.Router();

// Constants
const TEMP_DIR = path.join(process.cwd(), 'Temp');
const DATABASE_DIR = path.join(process.cwd(), 'Database');
const VERIFICATION_CODES_FILE = path.join(TEMP_DIR, 'codes.json');
const VERIFIED_IPS_FILE = path.join(DATABASE_DIR, 'verified_ips.json');

// Ensure directories exist
[TEMP_DIR, DATABASE_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Helper: Encrypt data
function encrypt(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Helper: Decrypt data
function decrypt(encrypted, key) {
  const [iv, data] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Helper: Trim and validate secrets from environment
function getSafeSecret(envVar, minLength = 10) {
  const value = (process.env[envVar] || '').trim();
  if (!value || value.length < minLength) {
    throw new Error(`Missing or invalid ${envVar} in environment`);
  }
  return value;
}

// Helper: Make HTTP request with proper headers
async function makeRequest(url, method = 'POST', data = {}, headers = {}) {
  try {
    const config = {
      method,
      url,
      timeout: method === 'POST' ? 10000 : 5000,
      headers: {
        'User-Agent': 'VerifyBot/2.1.0',
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (method === 'POST' || method === 'PUT') {
      config.data = data;
    }

    // Validate headers: no undefined, null, or newlines
    for (const [key, value] of Object.entries(config.headers)) {
      if (value === undefined || value === null) {
        throw new Error(`Header ${key} is undefined or null`);
      }
      if (typeof value !== 'string') {
        throw new Error(`Header ${key} must be a string`);
      }
      if (/[\r\n]/.test(value)) {
        throw new Error(`Header ${key} contains invalid characters`);
      }
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    logger.error({
      event: 'http_request_failed',
      url,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

// Helper: Verify reCAPTCHA token
async function verifyRecaptcha(token) {
  if (!token) throw new Error('reCAPTCHA token missing');

  const secretKey = getSafeSecret('RECAPTCHA_SECRET_KEY', 20);

  try {
    const response = await makeRequest(
      'https://www.google.com/recaptcha/api/siteverify',
      'POST',
      {
        secret: secretKey,
        response: token
      }
    );

    if (!response.success || response.score < 0.5) {
      return false;
    }
    return true;
  } catch (error) {
    logger.warn({ event: 'recaptcha_timeout', error: error.message });
    return true; // Fail open on timeout
  }
}

// Helper: Verify IP reputation
async function verifyIP(ipAddress) {
  if (!ipAddress) throw new Error('IP address missing');

  const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
  const countryBlocked = JSON.parse(fs.readFileSync('CountryBlocked.json', 'utf8'));

  try {
    const response = await makeRequest(
      `https://ipqualityscore.com/api/json/ip/reputation?ip=${ipAddress}&strictness=1`,
      'GET',
      {},
      {}
    );

    // Check VPN/Proxy
    if (settings.Allow_Vpn_Proxy === false && (response.is_vpn || response.is_proxy)) {
      return { blocked: true, reason: 'vpn_proxy' };
    }

    // Check country
    if (response.country_code && countryBlocked.blocked.includes(response.country_code)) {
      return { blocked: true, reason: 'country_blocked', country: response.country_code };
    }

    return { blocked: false };
  } catch (error) {
    logger.warn({ event: 'ip_quality_timeout', error: error.message });
    return { blocked: false }; // Fail open on timeout
  }
}

// Helper: Load/save verification codes
function getVerificationCodes() {
  if (!fs.existsSync(VERIFICATION_CODES_FILE)) return {};
  return JSON.parse(fs.readFileSync(VERIFICATION_CODES_FILE, 'utf8'));
}

function saveVerificationCodes(codes) {
  fs.writeFileSync(VERIFICATION_CODES_FILE, JSON.stringify(codes, null, 2));
}

function getVerifiedIPs() {
  if (!fs.existsSync(VERIFIED_IPS_FILE)) return {};
  return JSON.parse(fs.readFileSync(VERIFIED_IPS_FILE, 'utf8'));
}

function saveVerifiedIPs(ips) {
  fs.writeFileSync(VERIFIED_IPS_FILE, JSON.stringify(ips, null, 2));
}

// Route: Request verification code
router.post(
  '/request-code',
  body('userId').isString().trim().notEmpty(),
  body('recaptchaToken').isString().trim().notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { userId, recaptchaToken } = req.body;
      const clientIP = req.ip.replace('::ffff:', '');

      // Verify reCAPTCHA
      const captchaValid = await verifyRecaptcha(recaptchaToken);
      if (!captchaValid) {
        return res.status(403).json({ error: 'reCAPTCHA verification failed' });
      }

      // Verify IP
      const ipCheck = await verifyIP(clientIP);
      if (ipCheck.blocked) {
        logger.warn({
          event: 'ip_blocked',
          ip: clientIP,
          reason: ipCheck.reason,
          userId
        });
        return res.status(403).json({
          error: 'Access denied',
          reason: ipCheck.reason,
          ...(ipCheck.country && { country: ipCheck.country })
        });
      }

      // Check if IP already linked
      const verifiedIPs = getVerifiedIPs();
      const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));

      if (verifiedIPs[clientIP] && !settings.Allow_Ip_Already_Linked) {
        logger.warn({
          event: 'ip_already_linked',
          ip: clientIP,
          previousUser: verifiedIPs[clientIP].userId
        });
        return res.status(403).json({ error: 'IP already linked to another account' });
      }

      // Generate verification code
      const code = uuidv4();
      const expiresAt = Date.now() + parseInt(process.env.VERIFICATION_CODE_EXPIRY || '600000');

      const codes = getVerificationCodes();
      codes[code] = {
        userId,
        ip: clientIP,
        createdAt: Date.now(),
        expiresAt
      };
      saveVerificationCodes(codes);

      logger.info({
        event: 'code_generated',
        userId,
        ip: clientIP,
        code
      });

      res.json({
        code,
        expiresIn: parseInt(process.env.VERIFICATION_CODE_EXPIRY || '600000') / 1000
      });
    } catch (error) {
      logger.error({ event: 'request_code_error', error: error.message });
      res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
      });
    }
  }
);

// Route: Verify code and complete verification
router.post(
  '/verify-code',
  body('code').isUUID(),
  body('userId').isString().trim().notEmpty(),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validation failed', details: errors.array() });
      }

      const { code, userId } = req.body;
      const clientIP = req.ip.replace('::ffff:', '');

      const codes = getVerificationCodes();
      if (!codes[code]) {
        return res.status(404).json({ error: 'Code not found or expired' });
      }

      const codeData = codes[code];
      if (Date.now() > codeData.expiresAt) {
        delete codes[code];
        saveVerificationCodes(codes);
        return res.status(401).json({ error: 'Code expired' });
      }

      if (codeData.userId !== userId) {
        return res.status(403).json({ error: 'User ID mismatch' });
      }

      if (codeData.ip !== clientIP) {
        return res.status(403).json({ error: 'IP address mismatch' });
      }

      // Mark IP as verified
      const verifiedIPs = getVerifiedIPs();
      verifiedIPs[clientIP] = {
        userId,
        verifiedAt: Date.now()
      };
      saveVerifiedIPs(verifiedIPs);

      // Generate JWT
      const jwtSecret = getSafeSecret('JWT_SECRET', 20);
      const token = jwt.sign(
        { userId, ip: clientIP, verifiedAt: Date.now() },
        jwtSecret,
        { expiresIn: '24h' }
      );

      // Clean up code
      delete codes[code];
      saveVerificationCodes(codes);

      logger.info({
        event: 'verification_complete',
        userId,
        ip: clientIP
      });

      res.json({ verified: true, token });
    } catch (error) {
      logger.error({ event: 'verify_code_error', error: error.message });
      res.status(500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message
      });
    }
  }
);

// Route: Verify JWT token
router.post(
  '/verify-token',
  body('token').isString().trim().notEmpty(),
  (req, res) => {
    try {
      const { token } = req.body;
      const jwtSecret = getSafeSecret('JWT_SECRET', 20);

      const decoded = jwt.verify(token, jwtSecret);
      res.json({ valid: true, userId: decoded.userId, verifiedAt: decoded.verifiedAt });
    } catch (error) {
      logger.warn({ event: 'token_verification_failed', error: error.message });
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
);

module.exports = router;