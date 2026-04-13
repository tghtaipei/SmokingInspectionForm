// ============================================================
// Config.gs — 全域設定
// ============================================================

var CONFIG = {
  SPREADSHEET_ID:    'YOUR_SPREADSHEET_ID',
  SHEET_UNITS:       'units',
  SHEET_USERS:       'users',
  SHEET_AUDIT:       'audit_logs',
  ALLOWED_DOMAIN:    'gov.taipei',
  OTP_EXPIRY_MS:     10 * 60 * 1000,          // 10 分鐘
  SESSION_EXPIRY_MS: 5 * 24 * 60 * 60 * 1000, // 5 天
  WEB_APP_URL:       'YOUR_WEB_APP_URL',
};

function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}
