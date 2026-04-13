// ============================================================
// User.gs — 使用者資料管理
// ============================================================

/**
 * 取得使用者 Profile
 * @param {string} email
 * @returns {{ email, unit, name, phone, createdAt, lastLogin } | null}
 */
function getUserProfile(email) {
  if (!email) return null;

  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return null;

  var data = sheet.getDataRange().getValues();
  // 第一列為標題列（email, unit, name, phone, created_at, last_login）
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === email.toLowerCase()) {
      return {
        email:     data[i][0],
        unit:      data[i][1],
        name:      data[i][2],
        phone:     data[i][3],
        createdAt: data[i][4] ? data[i][4].toString() : '',
        lastLogin: data[i][5] ? data[i][5].toString() : '',
      };
    }
  }
  return null;
}

/**
 * 儲存新使用者 Profile（第一次登入時呼叫）
 * @param {string} email
 * @param {string} unit
 * @param {string} name
 * @param {string} phone
 */
function saveUserProfile(email, unit, name, phone) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_USERS);
    sheet.appendRow(['email', 'unit', 'name', 'phone', 'created_at', 'last_login']);
  }

  var now = new Date();
  sheet.appendRow([email, unit, name, phone, now, now]);
  writeAuditLog('REGISTRATION_COMPLETE', email, '', 'success', 'unit:' + unit);
}

/**
 * 更新最後登入時間
 * @param {string} email
 */
function updateLastLogin(email) {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_USERS);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] && data[i][0].toString().toLowerCase() === email.toLowerCase()) {
      // F 欄（索引 5）= last_login，試算表列號 = i + 1
      sheet.getRange(i + 1, 6).setValue(new Date());
      return;
    }
  }
}

/**
 * 取得單位清單（供下拉選單使用）
 * @returns {string[]}
 */
function getUnits() {
  var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_UNITS);
  if (!sheet) return [];

  var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  return values
    .map(function(row) { return row[0] ? row[0].toString().trim() : ''; })
    .filter(function(v) { return v !== ''; });
}
