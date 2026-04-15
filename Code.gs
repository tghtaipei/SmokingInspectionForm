// ============================================================
// Code.gs — doGet 路由 + client-callable 函式包裝
// ============================================================

var INPUT_MAX = {
  UNIT:  100,
  NAME:  50,
  PHONE: 30,
};

function doGet(e) {
  return HtmlService.createTemplateFromFile('login')
    .evaluate()
    .setTitle('菸害稽查電子表單')
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
 * @returns {{ success: boolean, sessionId?: string, profile?: object, error?: string }}
 */
function clientRegister(email, unit, name, phone) {
  if (!isValidGovEmail(email)) {
    return { success: false, error: '無效的 email' };
  }
  if (!unit || !name || !phone) {
    return { success: false, error: '所有欄位均為必填' };
  }

  // 輸入長度上限
  if (unit.trim().length  > INPUT_MAX.UNIT)  return { success: false, error: '單位名稱過長' };
  if (name.trim().length  > INPUT_MAX.NAME)  return { success: false, error: '姓名過長' };
  if (phone.trim().length > INPUT_MAX.PHONE) return { success: false, error: '電話號碼過長' };

  try {
    var normalizedEmail = email.trim().toLowerCase();
    saveUserProfile(normalizedEmail, unit.trim(), name.trim(), phone.trim());
    var sessionId = createSession(normalizedEmail);
    writeAuditLog('LOGIN_SUCCESS', normalizedEmail, sessionId, 'success', 'after registration');
    return {
      success:  true,
      sessionId: sessionId,
      profile:  { email: normalizedEmail, unit: unit.trim(), name: name.trim(), phone: phone.trim() },
    };
  } catch (e) {
    console.error('clientRegister error:', e);
    return { success: false, error: '註冊失敗，請稍後再試' };
  }
}

function clientValidateSession(sessionId) {
  return validateSession(sessionId);
}

/**
 * 驗證 Session 並同時回傳 Profile（取代舊的 clientGetProfile）
 * 確保只有 Session 擁有者能取得自己的資料
 * @param {string} sessionId
 * @returns {{ valid: boolean, email?: string, profile?: object }}
 */
function clientGetSessionProfile(sessionId) {
  var sessionResult = validateSession(sessionId);
  if (!sessionResult.valid) {
    return { valid: false };
  }
  var profile = null;
  try {
    profile = getUserProfile(sessionResult.email);
  } catch (e) {
    console.error('clientGetSessionProfile profile lookup error:', e);
  }
  return { valid: true, email: sessionResult.email, profile: profile };
}

function clientGetUnits() {
  return getUnits();
}

function clientLogout(sessionId) {
  logout(sessionId);
}
