// ============================================================
// AuditLog.gs — 稽核日誌
// ============================================================

/**
 * 防止 Spreadsheet 公式注入：以 '=' 開頭的字串加前綴單引號
 * Google Sheets 會將 ' 開頭的文字儲存為文字模式
 */
function sanitizeCell(val) {
  if (val === null || val === undefined) return '';
  var s = val.toString();
  // 以可觸發公式的字元開頭時加前綴，強制視為純文字
  if (s.length > 0 && (s[0] === '=' || s[0] === '+' || s[0] === '-' || s[0] === '@')) {
    return "'" + s;
  }
  return s;
}

/**
 * 寫入稽核日誌到 audit_logs Sheet
 * @param {string} action      - OTP_SENT | OTP_VERIFIED | LOGIN_SUCCESS | LOGIN_FAILED |
 *                               REGISTRATION_COMPLETE | LOGOUT | SESSION_EXPIRED | PROFILE_LOOKUP
 * @param {string} email       - 使用者 email
 * @param {string} sessionId   - Session ID（可空）
 * @param {string} status      - 'success' | 'failure' | 'error'
 * @param {string} details     - 詳細說明（可空）
 */
function writeAuditLog(action, email, sessionId, status, details) {
  try {
    var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_AUDIT);
    if (!sheet) {
      sheet = getSpreadsheet().insertSheet(CONFIG.SHEET_AUDIT);
      sheet.appendRow(['timestamp', 'action', 'email', 'sessionId', 'status', 'details']);
    }
    sheet.appendRow([
      new Date(),
      sanitizeCell(action),
      sanitizeCell(email),
      sanitizeCell(sessionId),
      sanitizeCell(status),
      sanitizeCell(details),
    ]);
  } catch (e) {
    console.error('AuditLog error:', e);
  }
}
