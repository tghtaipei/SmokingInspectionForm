// ============================================================
// Auth.gs — OTP 發送/驗證 + Session 管理
// ============================================================

/**
 * 驗證 email 格式與網域
 */
function isValidGovEmail(email) {
  if (!email || typeof email !== 'string') return false;
  var trimmed = email.trim().toLowerCase();
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) return false;
  return trimmed.endsWith('@' + CONFIG.ALLOWED_DOMAIN);
}

/**
 * 產生 6 位數 OTP
 */
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * 產生 UUID（用於 Session ID）
 */
function generateUuid() {
  return Utilities.getUuid();
}

/**
 * 發送 OTP 驗證碼到指定 email
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

    var otp = generateOtp();
    var expiry = Date.now() + CONFIG.OTP_EXPIRY_MS;
    var otpData = JSON.stringify({ code: otp, expiry: expiry, used: false });

    PropertiesService.getScriptProperties().setProperty('otp_' + normalizedEmail, otpData);

    MailApp.sendEmail({
      to: normalizedEmail,
      subject: '【臺北市稽查系統】登入驗證碼',
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
        '臺北市稽查系統',
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

  if (otpData.code !== inputCode) {
    writeAuditLog('LOGIN_FAILED', normalizedEmail, '', 'failure', 'OTP mismatch');
    return { success: false, error: '驗證碼錯誤，請重新輸入' };
  }

  // 驗證成功，刪除 OTP
  props.deleteProperty(key);
  writeAuditLog('OTP_VERIFIED', normalizedEmail, '', 'success', '');

  // 判斷是否為新使用者
  var profile = null;
  try {
    profile = getUserProfile(normalizedEmail);
  } catch (e) {
    // getUserProfile 本身會 try-catch，這裡是防禦性保護
    console.error('getUserProfile threw in verifyOtp:', e);
  }

  if (profile) {
    // 舊使用者：建立 session
    var sessionId = createSession(normalizedEmail);
    updateLastLogin(normalizedEmail);
    writeAuditLog('LOGIN_SUCCESS', normalizedEmail, sessionId, 'success', 'returning user');
    return { success: true, isNewUser: false, sessionId: sessionId, profile: profile };
  } else {
    // 新使用者（或查詢失敗）：需要完成註冊
    return { success: true, isNewUser: true, email: normalizedEmail };
  }
}

/**
 * 建立 Session
 * @param {string} email
 * @returns {string} sessionId
 */
function createSession(email) {
  var sessionId = generateUuid();
  var expiry = Date.now() + CONFIG.SESSION_EXPIRY_MS;
  var sessionData = JSON.stringify({ email: email, expiry: expiry });
  PropertiesService.getScriptProperties().setProperty('session_' + sessionId, sessionData);
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
  if (!sessionId) return;

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
