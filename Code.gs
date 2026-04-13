// ============================================================
// Code.gs — doGet 路由 + client-callable 函式包裝
// ============================================================

function doGet(e) {
  var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'login';
  var template;

  if (page === 'dashboard') {
    template = HtmlService.createTemplateFromFile('dashboard');
  } else {
    template = HtmlService.createTemplateFromFile('login');
  }

  return template
    .evaluate()
    .setTitle('臺北市稽查系統')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/** 引入共用 HTML 片段（CSS/JS） */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ── 供 google.script.run 呼叫的包裝函式 ──────────────────────

function clientSendOtp(email) {
  return sendOtp(email);
}

function clientVerifyOtp(email, code) {
  return verifyOtp(email, code);
}

/**
 * 完成註冊並建立 Session
 * @param {string} email
 * @param {string} unit
 * @param {string} name
 * @param {string} phone
 * @returns {{ success: boolean, sessionId?: string, error?: string }}
 */
function clientRegister(email, unit, name, phone) {
  if (!isValidGovEmail(email)) {
    return { success: false, error: '無效的 email' };
  }
  if (!unit || !name || !phone) {
    return { success: false, error: '所有欄位均為必填' };
  }

  try {
    var normalizedEmail = email.trim().toLowerCase();
    saveUserProfile(normalizedEmail, unit.trim(), name.trim(), phone.trim());
    var sessionId = createSession(normalizedEmail);
    writeAuditLog('LOGIN_SUCCESS', normalizedEmail, sessionId, 'success', 'after registration');
    return { success: true, sessionId: sessionId };
  } catch (e) {
    console.error('clientRegister error:', e);
    return { success: false, error: '註冊失敗，請稍後再試' };
  }
}

function clientValidateSession(sessionId) {
  return validateSession(sessionId);
}

function clientGetProfile(email) {
  if (!email) return null;
  return getUserProfile(email.trim().toLowerCase());
}

function clientGetUnits() {
  return getUnits();
}

function clientLogout(sessionId) {
  logout(sessionId);
}
