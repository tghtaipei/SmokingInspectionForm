// ============================================================
// AuditLog.gs — 稽核日誌
// ============================================================

/**
 * 寫入稽核日誌到 audit_logs Sheet
 * @param {string} action      - 動作類型 (OTP_SENT, OTP_VERIFIED, LOGIN_SUCCESS, LOGIN_FAILED,
 *                                REGISTRATION_COMPLETE, LOGOUT, SESSION_EXPIRED)
 * @param {string} email       - 使用者 email
 * @param {string} sessionId   - Session ID（可空）
 * @param {string} status      - 'success' | 'failure'
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
      action    || '',
      email     || '',
      sessionId || '',
      status    || '',
      details   || '',
    ]);
  } catch (e) {
    console.error('AuditLog error:', e);
  }
}
