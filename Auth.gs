// ============================================================
// Auth.gs — OTP 發送/驗證 + Session 管理
// ============================================================

var OTP_MAX_ATTEMPTS = 5;      // OTP 最多錯誤嘗試次數
var OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 重新發送冷卻時間（60 秒）
var SESSION_ID_MAX_LEN = 64;   // Session ID 最大長度（UUID = 36 字元，留餘裕）

/**
 * 驗證 email 格式與網域
 */
function isValidGovEmail(email) {
  if (!email || typeof email !== 'string') return false;
  var trimmed = email.trim().toLowerCase();
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return false;
  if (trimmed.length > 254) return false; // RFC 5321 最大長度
  return trimmed.endsWith('@' + CONFIG.ALLOWED_DOMAIN);
}

/**
 * 產生 6 位數 OTP
 * 注意：GAS 無 crypto.getRandomValues()，使用 Utilities.computeDigest
 * 對時間戳 + UUID 雜湊後取數值，比純 Math.random() 更不可預測
 */
function generateOtp() {
  var seed = Utilities.getUuid() + Date.now().toString();
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed);
  // 取前 4 個 byte 組合成數字，對 900000 取餘後加 100000 → 6 位數
  var num = ((bytes[0] & 0xff) * 16777216 +
             (bytes[1] & 0xff) * 65536 +
             (bytes[2] & 0xff) * 256 +
             (bytes[3] & 0xff));
  return (100000 + Math.abs(num) % 900000).toString();
}

/**
 * 產生 UUID（用於 Session ID）
 */
function generateUuid() {
  return Utilities.getUuid();
}

/**
 * 發送 OTP 驗證碼到指定 email
 * 限制：同一信箱 60 秒內只能發送一次
 * @param {string} email
 * @returns {{ success: boolean, error?: string }}
 */
function sendOtp(email) {
  if (!isValidGovEmail(email)) {
    writeAuditLog('OTP_SENT', email, '', 'failure', 'invalid email domain');
    return { success: false, error: '僅限 @' + CONFIG.ALLOWED_DOMAIN + ' 信箱登入' };
  }

  var normalizedEmail = email.trim().toLowerCase();
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    var props = PropertiesService.getScriptProperties();

    // ── 發送頻率限制（60 秒冷卻） ──────────────────────────
    var cooldownKey = 'otp_cooldown_' + normalizedEmail;
    var lastSent = props.getProperty(cooldownKey);
    if (lastSent) {
      var elapsed = Date.now() - parseInt(lastSent, 10);
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        var remaining = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        writeAuditLog('OTP_SENT', normalizedEmail, '', 'failure', 'rate limited, wait ' + remaining + 's');
        return { success: false, error: '請等候 ' + remaining + ' 秒後再重新發送' };
      }
    }

    var otp = generateOtp();
    var expiry = Date.now() + CONFIG.OTP_EXPIRY_MS;
    var otpData = JSON.stringify({ code: otp, expiry: expiry, used: false, attempts: 0 });

    props.setProperty('otp_' + normalizedEmail, otpData);
    props.setProperty(cooldownKey, Date.now().toString());

    MailApp.sendEmail({
      to: normalizedEmail,
      subject: '【菸害稽查電子表單】登入驗證碼',
      body: [
        '您好，',
        '',
        '您的登入驗證碼為：',
        '',
        '    ' + otp,
        '',
        '驗證碼將於 10 分鐘後失效，請勿將驗證碼提供給他人。',
        '',
        '若您未申請登入，請忽略此信件。',
        '',
        '菸害稽查電子表單',
      ].join('\n'),
    });

    writeAuditLog('OTP_SENT', normalizedEmail, '', 'success', '');
    return { success: true };

  } catch (e) {
    console.error('sendOtp error:', e);
    writeAuditLog('OTP_SENT', normalizedEmail, '', 'failure', e.toString());
    return { success: false, error: '驗證碼發送失敗，請稍後再試' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 驗證 OTP 並判斷是否為新使用者
 * 超過 5 次錯誤嘗試後 OTP 自動失效
 * @param {string} email
 * @param {string} code
 * @returns {{ success: boolean, isNewUser?: boolean, sessionId?: string, profile?: object, error?: string }}
 */
function verifyOtp(email, code) {
  if (!isValidGovEmail(email)) {
    return { success: false, error: '無效的 email' };
  }
  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return { success: false, error: '驗證碼格式錯誤' };
  }

  var normalizedEmail = email.trim().toLowerCase();
  var inputCode = code.trim();
  var props = PropertiesService.getScriptProperties();
  var key = 'otp_' + normalizedEmail;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);

    var raw = props.getProperty(key);

    if (!raw) {
      writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure', 'OTP not found');
      return { success: false, error: '驗證碼不存在或已失效，請重新發送' };
    }

    var otpData;
    try {
      otpData = JSON.parse(raw);
    } catch (e) {
      props.deleteProperty(key);
      writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure', 'OTP parse error');
      return { success: false, error: '驗證碼資料異常，請重新發送' };
    }

    if (otpData.used) {
      props.deleteProperty(key);
      writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure', 'OTP already used');
      return { success: false, error: '驗證碼已使用，請重新發送' };
    }

    if (Date.now() > otpData.expiry) {
      props.deleteProperty(key);
      writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure', 'OTP expired');
      return { success: false, error: '驗證碼已過期，請重新發送' };
    }

    // ── 錯誤嘗試次數限制 ──────────────────────────────────
    if (otpData.code !== inputCode) {
      otpData.attempts = (otpData.attempts || 0) + 1;

      if (otpData.attempts >= OTP_MAX_ATTEMPTS) {
        props.deleteProperty(key);
        writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure',
                      'OTP invalidated after ' + OTP_MAX_ATTEMPTS + ' failed attempts');
        return { success: false, error: '驗證失敗次數過多，驗證碼已失效，請重新發送' };
      }

      // 更新剩餘次數並寫回
      props.setProperty(key, JSON.stringify(otpData));
      var remaining = OTP_MAX_ATTEMPTS - otpData.attempts;
      writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure',
                    'OTP mismatch, attempt ' + otpData.attempts + '/' + OTP_MAX_ATTEMPTS);
      return { success: false, error: '驗證碼錯誤，還有 ' + remaining + ' 次機會' };
    }

    // ── 驗證成功，立即刪除 OTP ─────────────────────────────
    props.deleteProperty(key);
    writeAuditLog('OTP_VERIFIED', normalizedEmail, '', 'success', '');

  } finally {
    lock.releaseLock();
  }

  // 判斷是否為新使用者（在 lock 外執行，避免長時間佔用）
  var profile = null;
  try {
    profile = getUserProfile(normalizedEmail);
  } catch (e) {
    console.error('getUserProfile threw in verifyOtp:', e);
  }

  if (profile) {
    var sessionId = createSession(normalizedEmail);
    updateLastLogin(normalizedEmail);
    writeAuditLog('LOGIN_SUCCESS', normalizedEmail, sessionId, 'success', 'returning user');
    return { success: true, isNewUser: false, sessionId: sessionId, profile: profile };
  } else {
    return { success: true, isNewUser: true, email: normalizedEmail };
  }
}

/**
 * 建立 Session（加 LockService 防止 race condition）
 * @param {string} email
 * @returns {string} sessionId
 */
function createSession(email) {
  var sessionId = generateUuid();
  var expiry = Date.now() + CONFIG.SESSION_EXPIRY_MS;
  var sessionData = JSON.stringify({ email: email, expiry: expiry });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    PropertiesService.getScriptProperties().setProperty('session_' + sessionId, sessionData);
  } finally {
    lock.releaseLock();
  }
  return sessionId;
}

/**
 * 驗證 Session 是否有效
 * @param {string} sessionId
 * @returns {{ valid: boolean, email?: string }}
 */
function validateSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return { valid: false };
  }
  // 長度保護：UUID 為 36 字元，寬鬆允許至 64
  if (sessionId.length > SESSION_ID_MAX_LEN) {
    return { valid: false };
  }

  var props = PropertiesService.getScriptProperties();
  var key = 'session_' + sessionId;
  var raw = props.getProperty(key);

  if (!raw) return { valid: false };

  var sessionData;
  try {
    sessionData = JSON.parse(raw);
  } catch (e) {
    props.deleteProperty(key);
    return { valid: false };
  }

  if (Date.now() > sessionData.expiry) {
    props.deleteProperty(key);
    writeAuditLog('SESSION_EXPIRED', sessionData.email || '', sessionId, 'failure', '');
    return { valid: false };
  }

  return { valid: true, email: sessionData.email };
}

/**
 * 登出，刪除 Session
 * @param {string} sessionId
 */
function logout(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return;
  if (sessionId.length > SESSION_ID_MAX_LEN) return;

  var props = PropertiesService.getScriptProperties();
  var key = 'session_' + sessionId;
  var raw = props.getProperty(key);
  var email = '';

  if (raw) {
    try {
      email = JSON.parse(raw).email || '';
    } catch (e) {}
    props.deleteProperty(key);
  }

  writeAuditLog('LOGOUT', email, sessionId, 'success', '');
}
