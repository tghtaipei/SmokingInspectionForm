// ============================================================
// User.gs — 使用者資料管理
// ============================================================

/**
 * 取得使用者 Profile
 * 掃描所有列，自動跳過標題列（第一欄值為 'email' 的列）
 * @param {string} email
 * @returns {{ email, unit, name, phone, createdAt, lastLogin } | null}
 */
function getUserProfile(email) {
  if (!email) return null;

  try {
    var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_USERS);
    if (!sheet || sheet.getLastRow() < 1) {
      writeAuditLog('PROFILE_LOOKUP', email, '', 'failure', 'users sheet not found or empty');
      return null;
    }

    var data = sheet.getDataRange().getValues();
    var target = email.trim().toLowerCase();

    for (var i = 0; i < data.length; i++) {
      var cellVal = data[i][0] ? data[i][0].toString().trim() : '';
      // 跳過標題列
      if (cellVal.toLowerCase() === 'email') continue;
      if (cellVal.toLowerCase() === target) {
        writeAuditLog('PROFILE_LOOKUP', email, '', 'success', 'found at row ' + (i + 1));
        return {
          email:     cellVal,
          unit:      data[i][1] ? data[i][1].toString() : '',
          name:      data[i][2] ? data[i][2].toString() : '',
          phone:     data[i][3] ? data[i][3].toString() : '',
          createdAt: data[i][4] ? data[i][4].toString() : '',
          lastLogin: data[i][5] ? data[i][5].toString() : '',
        };
      }
    }

    writeAuditLog('PROFILE_LOOKUP', email, '', 'failure', 'email not found in ' + data.length + ' rows');
    return null;

  } catch (e) {
    writeAuditLog('PROFILE_LOOKUP', email, '', 'error', e.toString());
    console.error('getUserProfile error:', e);
    return null;
  }
}

/**
 * 儲存新使用者 Profile
 * 若 email 已存在則更新而非重複新增（防止多次執行產生重複列）
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
  var data = sheet.getLastRow() > 0 ? sheet.getDataRange().getValues() : [];
  var target = email.trim().toLowerCase();

  // 檢查是否已有此 email（upsert）
  for (var i = 0; i < data.length; i++) {
    var cellVal = data[i][0] ? data[i][0].toString().trim().toLowerCase() : '';
    if (cellVal === target) {
      // 已存在，更新各欄（保留 created_at，更新 last_login）
      var row = i + 1;
      sheet.getRange(row, 2).setValue(unit);
      sheet.getRange(row, 3).setValue(name);
      sheet.getRange(row, 4).setValue(phone);
      sheet.getRange(row, 6).setValue(now);
      writeAuditLog('REGISTRATION_COMPLETE', email, '', 'success', 'updated existing row ' + row + ', unit:' + unit);
      return;
    }
  }

  // 新增
  sheet.appendRow([email, unit, name, phone, now, now]);
  writeAuditLog('REGISTRATION_COMPLETE', email, '', 'success', 'inserted new row, unit:' + unit);
}

/**
 * 更新最後登入時間
 * @param {string} email
 */
function updateLastLogin(email) {
  try {
    var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_USERS);
    if (!sheet) return;

    var data = sheet.getDataRange().getValues();
    var target = email.trim().toLowerCase();

    for (var i = 0; i < data.length; i++) {
      var cellVal = data[i][0] ? data[i][0].toString().trim().toLowerCase() : '';
      if (cellVal === 'email') continue; // 跳標題
      if (cellVal === target) {
        sheet.getRange(i + 1, 6).setValue(new Date());
        return;
      }
    }
  } catch (e) {
    console.error('updateLastLogin error:', e);
  }
}

/**
 * 取得單位清單（供下拉選單使用）
 * @returns {string[]}
 */
function getUnits() {
  try {
    var sheet = getSpreadsheet().getSheetByName(CONFIG.SHEET_UNITS);
    if (!sheet || sheet.getLastRow() < 1) return [];

    var values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
    return values
      .map(function(row) { return row[0] ? row[0].toString().trim() : ''; })
      .filter(function(v) { return v !== '' && v.toLowerCase() !== 'unit_name'; });
  } catch (e) {
    console.error('getUnits error:', e);
    return [];
  }
}
