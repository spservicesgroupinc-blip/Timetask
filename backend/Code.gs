// ==========================================
// TRUCHOICE ROOFING - BACKEND V7.1 (STABLE)
// ==========================================

class AppError extends Error { constructor(m, c = 500) { super(m); this.code = c; } }
class AuthError extends AppError { constructor(m, c = 401) { super(m, c); } }

const TRUCHOICE_CORE_CONFIG = {
  FOLDER_NAME: "TruChoice Photos",
  REPORT_FOLDER_NAME: "TruChoice Pay Reports",
  USE_CACHE: true,
  CACHE_TTL: 600,
  JWT_SECRET: PropertiesService.getScriptProperties().getProperty('JWT_SECRET') || 'super_secret_key_change_me',
  PASSWORD_SALT: PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT') || 'default_salt_change_me',
  SHEETS: {
    tasks: { name: "Tasks", headers: ["id", "title", "description", "location", "assignedTo", "dueDate", "priority", "status", "createdAt", "image", "jobName", "startedAt", "jobNotes"], roles: ['admin', 'manager', 'employee', 'user'] },
    messages: { name: "Messages", headers: ["id", "sender", "text", "timestamp", "image"], roles: ['admin', 'manager', 'employee', 'user'] },
    users: { name: "Users", headers: ["id", "name", "rate", "role", "pin", "email", "password"], roles: ['admin'] },
    jobs: { name: "Jobs", headers: ["id", "name", "address", "active"], roles: ['admin', 'manager'] },
    subscriptions: { name: "Subscriptions", headers: ["endpoint", "p256dh", "auth", "userId", "userAgent", "updatedAt"], roles: ['admin', 'manager', 'employee', 'user'] },
    time_entries: { name: "TimeEntries", headers: ["id", "userId", "startTime", "endTime", "status", "jobName", "totalPay"], roles: ['admin', 'manager', 'employee', 'user'] }
  }
};

/**
 * ENTRY POINTS
 */
function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const request = parseRequest(e);
    if (!request) throw new AppError("Invalid request format", 400);

    // PUBLIC ENDPOINTS
    if (['login', 'register', 'setup'].includes(request.action)) {
      let result;
      if (request.action === 'login') result = loginUser(request.data);
      else if (request.action === 'register') result = registerUser(request.data);
      else if (request.action === 'setup') result = doSetup();
      return responseJSON({ status: 'success', data: result });
    }

    // AUTHENTICATED ENDPOINTS
    const token = request.token;
    if (!token) throw new AuthError("Unauthorized: Token missing", 401);
    const user = verifyToken(token);
    if (!user) throw new AuthError("Unauthorized: Session expired", 401);
    request.user = user;

    if (!isAuthorized(request)) {
       throw new AppError("Forbidden: Insufficient permissions", 403);
    }

    let result = null;
    if (request.action === 'read') {
      result = getCachedData(request.tableName);
      if (!result) {
        result = readData(request.tableName, user);
        setCachedData(request.tableName, result);
      }
    } else {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(15000)) throw new AppError("Server busy", 429);
      try {
        switch (request.action) {
          case 'create': result = createItem(request.tableName, request.data); clearCache(request.tableName); break;
          case 'update': result = updateItem(request.tableName, request.data); clearCache(request.tableName); break;
          case 'delete': result = deleteItem(request.tableName, request.id); clearCache(request.tableName); break;
          case 'saveSubscription': result = saveSubscription(request.data); break;
          case 'generateReport': result = generateReport(request.data); break;
          default: throw new AppError("Invalid action", 400);
        }
      } finally { lock.releaseLock(); }
    }
    return responseJSON({ status: 'success', data: result });
  } catch (err) {
    console.error("Execution Error:", err);
    return responseJSON({ status: 'error', message: err.message, code: err.code || 500 });
  }
}

function parseRequest(e) {
  if (!e) return null;
  if (e.parameter && (e.parameter.setup === "true" || e.parameter.setup === true)) return { action: 'setup' };
  let token = e.parameter.token || null;
  if (e.postData && e.postData.contents) {
    try {
      const json = JSON.parse(e.postData.contents);
      return {
        action: json.action || 'read',
        tableName: json.table ? String(json.table).toLowerCase().trim() : null,
        data: json.data || {}, 
        id: json.id || (json.data && json.data.id ? json.data.id : null),
        token: json.token || token
      };
    } catch(err) { return null; }
  }
  return { action: 'read', tableName: (e.parameter.table || 'tasks').toLowerCase(), token: token };
}

function hashPassword(password) {
  const raw = TRUCHOICE_CORE_CONFIG.PASSWORD_SALT + String(password);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
}

function b64Encode(str) { return Utilities.base64Encode(str).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); }

function generateToken(user) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24)
  };
  const b64H = b64Encode(JSON.stringify(header));
  const b64P = b64Encode(JSON.stringify(payload));
  const sigInput = b64H + "." + b64P;
  const sigBytes = Utilities.computeHmacSha256Signature(sigInput, TRUCHOICE_CORE_CONFIG.JWT_SECRET);
  const sig = Utilities.base64Encode(sigBytes).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64H}.${b64P}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const input = h + "." + p;
    const expectedB = Utilities.computeHmacSha256Signature(input, TRUCHOICE_CORE_CONFIG.JWT_SECRET);
    const expectedS = Utilities.base64Encode(expectedB).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    if (expectedS !== s) return null;
    let b64 = p.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const json = Utilities.newBlob(Utilities.base64Decode(b64)).getDataAsString();
    const payload = JSON.parse(json);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) { return null; }
}

function loginUser(data) {
  const { email, password } = data;
  if (!email || !password) throw new AuthError("Missing credentials", 400);
  const sheet = getSheet('users');
  const values = sheet.getDataRange().getValues();
  const headers = getHeaders(sheet);
  const eIdx = headers.indexOf('email'), pIdx = headers.indexOf('password'), rIdx = headers.indexOf('role'), nIdx = headers.indexOf('name'), iIdx = headers.indexOf('id'), rtIdx = headers.indexOf('rate'), pnIdx = headers.indexOf('pin');
  const hashed = hashPassword(password);
  const target = String(email).trim().toLowerCase();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][eIdx]).toLowerCase() === target && String(values[i][pIdx]) === hashed) {
      const user = { 
        id: values[i][iIdx], 
        email: values[i][eIdx], 
        role: values[i][rIdx], 
        name: values[i][nIdx],
        rate: String(values[i][rtIdx] || "0"),
        pin: String(values[i][pnIdx] || "")
      };
      return { token: generateToken(user), user };
    }
  }
  throw new AuthError("Invalid credentials", 401);
}

function registerUser(data) {
  const { name, email, password, role, rate, pin } = data;
  if (!name || !email || !password) throw new AuthError("Missing fields", 400);
  const sheet = getSheet('users');
  const headers = getHeaders(sheet);
  const values = sheet.getDataRange().getValues();
  const eIdx = headers.indexOf('email');
  const target = String(email).trim().toLowerCase();
  for(let i = 1; i < values.length; i++) if(String(values[i][eIdx]).toLowerCase() === target) throw new AuthError("Email exists", 409);
  
  const newUser = { 
    id: Utilities.getUuid(), 
    name, 
    email, 
    password: hashPassword(password), 
    role: role || 'user', 
    rate: String(rate || '0'), 
    pin: String(pin || '') 
  };
  createItem('users', newUser);
  return { token: generateToken(newUser), user: { ...newUser, password: undefined } };
}

function isAuthorized(request) {
  const user = request.user;
  // Deny if not authenticated
  if (!user) return false;
  
  const action = request.action || 'read';
  const table = (request.tableName || '').toLowerCase().trim();
  const userRole = String(user.role || '').toLowerCase().trim();

  // Admin bypass
  if (userRole === 'admin') return true;

  // Non-table actions
  if (!table) {
    return ['saveSubscription', 'generateReport', 'saveUser', 'saveJob', 'saveTask', 'saveTimeEntry', 'create', 'update', 'delete'].includes(action);
  }

  const tableConfig = TRUCHOICE_CORE_CONFIG.SHEETS[table];
  if (!tableConfig) {
     console.log("🚫 BLOCKED ACCESS (TABLE NOT FOUND):", { table, action, userRole });
     return false;
  }

  const allowedRoles = tableConfig.roles.map(r => String(r).toLowerCase().trim());
  
  // Provide access if role matches config or if 'user'
  if (allowedRoles.includes(userRole) || userRole === 'user' || userRole === 'employee') {
    return true; 
  }

  // --- ADD THIS LINE TO SEE THE ERROR IN THE LOGS ---
  console.log("🚫 BLOCKED ACCESS:", { table, action, userRole, allowedRoles });

  return false; 
}

function readData(tableName, user) {
  const sheet = getSheet(tableName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = getHeaders(sheet);
  const rows = values.slice(1);
  let result = rows.map(row => {
    const item = {};
    headers.forEach((h, i) => {
      let val = row[i];
      if (val instanceof Date) {
        const lh = h.toLowerCase();
        item[h] = ['createdat', 'timestamp', 'starttime', 'endtime', 'updatedat', 'startedat'].includes(lh) ? val.getTime() : val.toISOString().split('T')[0];
      }
      else item[h] = val;
    });
    return item;
  });
  if (tableName === 'users') result = result.map(({password, pin, ...u}) => u);
  
  return result;
}

function createItem(tableName, data) {
  const sheet = getSheet(tableName);
  const headers = getHeaders(sheet);
  if (headers.includes("id") && !data.id) data.id = Utilities.getUuid();
  if (tableName === 'users' && data.password && String(data.password).length !== 64) data.password = hashPassword(data.password);
  if (data.image && String(data.image).startsWith('data:image')) data.image = processImageUpload(data.image, data.id);
  const row = headers.map(h => data[h] ?? "");
  sheet.appendRow(row);
  return data;
}

function updateItem(tableName, data) {
  const sheet = getSheet(tableName);
  const values = sheet.getDataRange().getValues();
  const headers = getHeaders(sheet);
  const iIdx = headers.indexOf('id');
  const target = String(data.id).trim();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][iIdx]).trim() === target) {
      if (tableName === 'users' && data.password && String(data.password).length !== 64) data.password = hashPassword(data.password);
      if (data.image && String(data.image).startsWith('data:image')) data.image = processImageUpload(data.image, data.id);
      const row = headers.map((h, j) => data[h] !== undefined ? data[h] : values[i][j]);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return data;
    }
  }
  throw new Error("Not found");
}

function deleteItem(tableName, id) {
  const sheet = getSheet(tableName);
  const values = sheet.getDataRange().getValues();
  const iIdx = getHeaders(sheet).indexOf('id');
  const target = String(id).trim();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][iIdx]).trim() === target) {
      sheet.deleteRow(i + 1);
      return { id, deleted: true };
    }
  }
  throw new Error("Not found");
}

function getCachedData(k) {
  if (!TRUCHOICE_CORE_CONFIG.USE_CACHE) return null;
  try {
    const c = CacheService.getScriptCache();
    let r = "", i = 0;
    while (true) { let ch = c.get(`${k}_${i++}`); if (!ch) break; r += ch; }
    return r ? JSON.parse(r) : null;
  } catch (e) { return null; }
}

function setCachedData(k, d) {
  if (!TRUCHOICE_CORE_CONFIG.USE_CACHE) return;
  try {
    const c = CacheService.getScriptCache();
    const r = JSON.stringify(d);
    clearCache(k);
    const sz = 90000;
    for (let i = 0; i * sz < r.length; i++) c.put(`${k}_${i}`, r.substring(i * sz, (i + 1) * sz), TRUCHOICE_CORE_CONFIG.CACHE_TTL);
  } catch (e) {}
}

function clearCache(k) {
  if (!TRUCHOICE_CORE_CONFIG.USE_CACHE) return;
  const c = CacheService.getScriptCache();
  let i = 0; while (true) { if (!c.get(`${k}_${i}`)) break; c.remove(`${k}_${i++}`); }
}

function saveSubscription(sub) {
  const sheet = getSheet('subscriptions');
  const values = sheet.getDataRange().getValues();
  const target = String(sub.endpoint);
  for (let i = 1; i < values.length; i++) if (String(values[i][0]) === target) return { status: 'exists' };
  const headers = TRUCHOICE_CORE_CONFIG.SHEETS.subscriptions.headers;
  const data = { endpoint: sub.endpoint, p256dh: sub.keys?.p256dh || '', auth: sub.keys?.auth || '', userId: sub.userId || 'Anon', updatedAt: Date.now() };
  sheet.appendRow(headers.map(h => data[h] ?? ""));
  return { status: 'created' };
}

function getFolderId(n, p) {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(p);
  if (id) try { DriveApp.getFolderById(id).getName(); return DriveApp.getFolderById(id); } catch(e) {}
  const fs = DriveApp.getFoldersByName(n);
  const f = fs.hasNext() ? fs.next() : DriveApp.createFolder(n);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  props.setProperty(p, f.getId());
  return f;
}

function processImageUpload(b64, id) {
  try {
    const f = getFolderId(TRUCHOICE_CORE_CONFIG.FOLDER_NAME, 'F_ID_P');
    const data = b64.split(',')[1] || b64;
    const blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', `img_${id}_${Date.now()}.jpg`);
    return "https://drive.google.com/thumbnail?sz=w1000&id=" + f.createFile(blob).getId();
  } catch (e) { return ""; }
}

function getSheet(key) {
  const conf = TRUCHOICE_CORE_CONFIG.SHEETS[key];
  if (!conf) throw new Error("Unknown table: " + key);
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) try { ss = SpreadsheetApp.openById(id); } catch(e) { throw new Error("ID fail: " + e.message); }
  }
  if (!ss) throw new Error("SPREADSHEET_ID missing in Script Properties.");
  let s = ss.getSheetByName(conf.name);
  if (!s) {
    s = ss.insertSheet(conf.name);
    s.appendRow(conf.headers);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, conf.headers.length).setFontWeight("bold");
  } else {
    const curr = s.getRange(1, 1, 1, conf.headers.length).getValues()[0];
    if (curr.some((h, i) => h !== conf.headers[i])) s.getRange(1, 1, 1, conf.headers.length).setValues([conf.headers]).setFontWeight("bold");
  }
  return s;
}

function getHeaders(s) {
  const lc = s.getLastColumn();
  return lc < 1 ? [] : s.getRange(1, 1, 1, lc).getValues()[0].map(h => String(h).trim());
}

function doSetup() {
  const log = [];
  try {
    log.push("Starting setup...");
    getFolderId(TRUCHOICE_CORE_CONFIG.FOLDER_NAME, 'F_ID_P');
    getFolderId(TRUCHOICE_CORE_CONFIG.REPORT_FOLDER_NAME, 'F_ID_R');
    log.push("Folders OK");
    Object.keys(TRUCHOICE_CORE_CONFIG.SHEETS).forEach(k => { getSheet(k); log.push(`Sheet ${k} OK`); });
    const us = getSheet('users');
    if (us.getLastRow() < 2) {
      createItem('users', { id: Utilities.getUuid(), name: "Admin", email: "admin@truchoice.com", password: "admin123", role: "admin", rate: "0", pin: "" });
      log.push("Admin created (admin@truchoice.com / admin123)");
    }
    log.push("Setup Complete");
  } catch (e) { log.push("Setup Error: " + e.message); }
  return log;
}

function generateReport(d) {
  const { userId, startDate, endDate } = d;
  const s = getSheet('time_entries'), v = s.getDataRange().getValues(), h = getHeaders(s);
  const uIdx = h.indexOf('userid'), sIdx = h.indexOf('starttime'), eIdx = h.indexOf('endtime'), jIdx = h.indexOf('jobname'), pIdx = h.indexOf('totalpay');
  const startM = new Date(startDate).getTime(), endM = new Date(endDate).getTime();
  let txt = `REPORT: ${userId} (${startDate} to ${endDate})\n\n`, totalH = 0, totalP = 0;
  v.slice(1).forEach(row => {
    if (String(row[uIdx]) === String(userId)) {
      const st = Number(row[sIdx]);
      if (st >= startM && st <= endM) {
        const et = Number(row[eIdx]) || Date.now(), dur = (et - st) / 36e5, pay = Number(row[pIdx]) || 0;
        txt += `${new Date(st).toLocaleDateString()} | ${row[jIdx]} | ${dur.toFixed(2)}h | $${pay.toFixed(2)}\n`;
        totalH += dur; totalP += pay;
      }
    }
  });
  txt += `\nTOTAL: ${totalH.toFixed(2)}h | $${totalP.toFixed(2)}`;
  const f = getFolderId(TRUCHOICE_CORE_CONFIG.REPORT_FOLDER_NAME, 'F_ID_R');
  const file = f.createFile(Utilities.newBlob(txt, 'text/plain', `Report_${userId}_${Date.now()}.txt`));
  return { url: file.getUrl() };
}

function responseJSON(d) { return ContentService.createTextOutput(JSON.stringify(d)).setMimeType(ContentService.MimeType.JSON); }
