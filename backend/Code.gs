// ==========================================
// TRUCHOICE ROOFING - BACKEND V7.0 (SECURE & OPTIMIZED)
// ==========================================

const CONFIG = {
  FOLDER_NAME: "TruChoice Photos",
  REPORT_FOLDER_NAME: "TruChoice Pay Reports",
  USE_CACHE: true, // High-speed Google CacheService enabled
  CACHE_TTL: 600,   // 10 minutes
  // Fetch these from Script Properties (Extensions > Script Properties) for production
  JWT_SECRET: PropertiesService.getScriptProperties().getProperty('JWT_SECRET') || 'super_secret_key_change_in_script_properties',
  PASSWORD_SALT: PropertiesService.getScriptProperties().getProperty('PASSWORD_SALT') || 'default_salt_change_me',
  SHEETS: {
    tasks: { name: "Tasks", headers: ["id", "title", "description", "location", "assignedTo", "dueDate", "priority", "status", "createdAt", "image", "jobName", "startedAt", "jobNotes"], roles: ['admin', 'manager', 'employee'] },
    messages: { name: "Messages", headers: ["id", "sender", "text", "timestamp", "image"], roles: ['admin', 'manager', 'employee'] },
    users: { name: "Users", headers: ["id", "name", "rate", "role", "pin", "email", "password"], roles: ['admin'] }, // Strict RBAC: Only admins touch user table
    jobs: { name: "Jobs", headers: ["id", "name", "address", "active"], roles: ['admin', 'manager'] },
    subscriptions: { name: "Subscriptions", headers: ["endpoint", "p256dh", "auth", "userId", "userAgent", "updatedAt"], roles: ['admin', 'manager', 'employee'] },
    time_entries: { name: "TimeEntries", headers: ["id", "userId", "startTime", "endTime", "status", "jobName", "totalPay"], roles: ['admin', 'manager', 'employee'] }
  }
};

// ==========================================
// ERROR HANDLING CLASSES
// ==========================================
class AppError extends Error {
  constructor(message, code = 500) {
    super(message);
    this.code = code;
  }
}
class AuthError extends AppError {
  constructor(message, code = 401) {
    super(message, code);
  }
}

// ==========================================
// 1. ENTRY POINTS & ROUTING
// ==========================================
function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const request = parseRequest(e);
    if (!request) throw new AppError("Invalid request format", 400);

    // Public endpoints (No Auth Required)
    if (['login', 'register', 'setup'].includes(request.action)) {
      let result;
      if (request.action === 'login') result = loginUser(request.data);
      else if (request.action === 'register') result = registerUser(request.data);
      else if (request.action === 'setup') result = doSetup();
      
      return responseJSON({ status: 'success', data: result });
    }

    // Auth Check (JWT Validation)
    const token = request.token;
    if (!token) throw new AuthError("Unauthorized: Token missing", 401);
    
    const user = verifyToken(token);
    if (!user) throw new AuthError("Unauthorized: Invalid or expired token", 401);
    
    request.user = user; // Attach user context to request

    // AuthZ Check (Role-Based Access Control)
    if (!isAuthorized(request)) {
       throw new AppError("Forbidden: Insufficient permissions", 403);
    }

    let result = null;
    
    // READ actions bypass script lock for speed
    if (request.action === 'read') {
      result = getCachedData(request.tableName);
      if (!result) {
        result = readData(request.tableName, user);
        setCachedData(request.tableName, result);
      }
    } 
    // WRITE actions use the script lock
    else {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) throw new AppError("Server busy. Please try again.", 429);

      let runNotification = false;
      try {
        switch (request.action) {
          case 'create':
            result = createItem(request.tableName, request.data);
            clearCache(request.tableName); 
            runNotification = true;
            break;
          case 'update':
            result = updateItem(request.tableName, request.data);
            clearCache(request.tableName);
            break;
          case 'delete':
            result = deleteItem(request.tableName, request.id);
            clearCache(request.tableName);
            break;
          case 'saveSubscription':
            result = saveSubscription(request.data);
            clearCache('subscriptions');
            break;
          case 'generateReport':
            result = generateReport(request.data);
            break;
          default:
            throw new AppError("Invalid action: " + request.action, 400);
        }
      } finally {
        lock.releaseLock();
      }

      if (runNotification) triggerNotification(request.tableName, request.data);
    }

    return responseJSON({ status: 'success', data: result });

  } catch (err) {
    console.error("Execution Error", err);
    const code = err.code || 500;
    return responseJSON({ status: 'error', message: err.message, code: code });
  }
}

function parseRequest(e) {
  if (!e) return null;
  if (e.parameter && e.parameter.setup) return { action: 'setup' };
  
  let token = e.parameter.token || null;
  
  if (e.postData && e.postData.contents) {
    try {
      const json = JSON.parse(e.postData.contents);
      return {
        action: json.action || 'read',
        tableName: json.table ? json.table.toLowerCase() : null,
        data: json.data || {}, 
        id: json.id || (json.data && !Array.isArray(json.data) ? json.data.id : null),
        token: json.token || token
      };
    } catch(err) {
      return null;
    }
  }
  
  return {
    action: 'read',
    tableName: (e.parameter.table || 'tasks').toLowerCase(),
    token: token
  };
}

// ==========================================
// 2. AUTHENTICATION & AUTHORIZATION
// ==========================================
function hashPassword(password) {
  const raw = CONFIG.PASSWORD_SALT + password;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return digest.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
}

function b64Encode(str) {
  return Utilities.base64Encode(str).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function generateToken(user) {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours expiration
  };
  
  const b64Header = b64Encode(JSON.stringify(header));
  const b64Payload = b64Encode(JSON.stringify(payload));
  
  const signatureInput = b64Header + "." + b64Payload;
  const signatureBytes = Utilities.computeHmacSha256Signature(signatureInput, CONFIG.JWT_SECRET);
  const signature = Utilities.base64Encode(signatureBytes).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  return `${b64Header}.${b64Payload}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [b64Header, b64Payload, b64Signature] = parts;
    const signatureInput = b64Header + "." + b64Payload;
    
    const expectedBytes = Utilities.computeHmacSha256Signature(signatureInput, CONFIG.JWT_SECRET);
    const expectedSignature = Utilities.base64Encode(expectedBytes).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    
    if (expectedSignature !== b64Signature) return null; // Invalid signature
    
    let b64 = b64Payload.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '='; // Fix padding
    const payloadBytes = Utilities.base64Decode(b64);
    const payloadStr = Utilities.newBlob(payloadBytes).getDataAsString();
    const payload = JSON.parse(payloadStr);
    
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Token expired
    }
    
    return payload;
  } catch (e) {
    console.error("Token verification failed:", e);
    return null;
  }
}

function loginUser(data) {
  if (!data) data = {};
  const { email, password } = data;
  if (!email || !password) throw new AuthError("Email and password are required", 400);

  const sheet = getSheet('users');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new AuthError("No users found", 401);

  const values = sheet.getDataRange().getValues();
  const headers = getHeaders(sheet);
  const emailIdx = headers.indexOf('email');
  const passIdx = headers.indexOf('password');
  const roleIdx = headers.indexOf('role');
  const nameIdx = headers.indexOf('name');
  const idIdx = headers.indexOf('id');

  const hashedPassword = hashPassword(password);
  const targetEmail = String(email || '').trim().toLowerCase();

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][emailIdx] || '').trim().toLowerCase();
    const rowName = String(values[i][nameIdx] || '').trim().toLowerCase();
    const rowPass = String(values[i][passIdx] || '');
    if ((rowEmail === targetEmail || rowName === targetEmail) && rowPass === hashedPassword) {
      const user = {
        id: values[i][idIdx],
        email: values[i][emailIdx],
        role: values[i][roleIdx],
        name: values[i][nameIdx]
      };
      const token = generateToken(user);
      return { token, user };
    }
  }
  throw new AuthError("Invalid credentials", 401);
}

function registerUser(data) {
  if (!data) data = {};
  const { name, email, password, role } = data;
  if (!name || !email || !password) throw new AuthError("Missing fields", 400);

  const sheet = getSheet('users');
  const headers = getHeaders(sheet);
  const values = sheet.getDataRange().getValues();
  const emailIdx = headers.indexOf('email');
  const targetEmail = String(email || '').trim().toLowerCase();
  
  for(let i = 1; i < values.length; i++) {
    if(String(values[i][emailIdx] || '').trim().toLowerCase() === targetEmail) throw new AuthError("Email already exists", 409);
  }

  const newUser = {
    id: Utilities.getUuid(),
    name,
    email,
    password: hashPassword(password),
    role: role || 'employee',
    rate: '',
    pin: ''
  };

  createItem('users', newUser);
  const token = generateToken(newUser);
  return { token, user: { ...newUser, password: undefined } };
}

function isAuthorized(request) {
  const user = request.user;
  
  if (!request.tableName) {
    if (['saveSubscription', 'generateReport'].includes(request.action)) return true;
    return false;
  }

  const tableConfig = CONFIG.SHEETS[request.tableName];
  if (!tableConfig) return false;
  
  if (request.action === 'read') return true;
  
  if (!tableConfig.roles) return true;
  
  return tableConfig.roles.includes(user.role);
}

// ==========================================
// 3. DATA OPERATIONS (OPTIMIZED)
// ==========================================
function readData(tableName, user) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return [];

  const values = sheet.getDataRange().getValues(); 
  const headers = values[0];
  const rows = values.slice(1);

  let result = rows.map(row => {
    const item = {};
    headers.forEach((header, i) => {
      let val = row[i];
      if (val instanceof Date) {
        item[header] = ['createdAt', 'timestamp', 'startTime', 'endTime', 'updatedAt', 'startedAt'].includes(header) ? val.getTime() : formatLocalDate(val);
      } else {
        item[header] = val;
      }
    });
    return item;
  });

  if (tableName === 'users') {
    result = result.map(u => {
      const { password, pin, ...safeUser } = u;
      return safeUser;
    });
  }

  // Row-Level Security: Filter data for standard employees
  if (user && user.role === 'employee') {
     if (tableName === 'time_entries') {
        result = result.filter(item => String(item.userId || '').toLowerCase().trim() === String(user.userId || '').toLowerCase().trim() || String(item.userId || '').toLowerCase().trim() === String(user.name || '').toLowerCase().trim());
     } else if (tableName === 'tasks') {
        result = result.filter(item => {
           const assigned = String(item.assignedTo || '').toLowerCase().trim();
           return assigned === String(user.userId || '').toLowerCase().trim() || assigned === String(user.name || '').toLowerCase().trim();
        });
     }
  }

  return result;
}

function createItem(tableName, data) {
  const sheet = getSheet(tableName);
  const headers = getHeaders(sheet);
  
  if (headers.includes("id") && !data.id) {
    data.id = Utilities.getUuid();
  }

  if (data.image && typeof data.image === 'string' && data.image.startsWith('data:image')) {
    data.image = processImageUpload(data.image, data.id);
  }

  const row = headers.map(h => (data[h] === undefined || data[h] === null) ? "" : data[h]);
  sheet.appendRow(row);
  return data;
}

function updateItem(tableName, data) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No entries inside table " + tableName + " to update.");

  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf('id');
  if (idIndex === -1) throw new Error("No 'id' column found in table " + tableName);
  
  const ids = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues().flat().map(String).map(s => s.trim());
  const targetId = String(data.id).trim();
  const index = ids.indexOf(targetId); 
  
  if (index === -1) throw new Error("Item ID not found: " + targetId + " (table: " + tableName + ")");
  const rowIndex = index + 2;

  if (data.image && typeof data.image === 'string' && data.image.startsWith('data:image')) {
    data.image = processImageUpload(data.image, data.id);
  }

  const existingRow = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const rowData = headers.map((h, i) => (data[h] !== undefined) ? data[h] : existingRow[i]); 
  
  sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  return data;
}

function deleteItem(tableName, id) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No entries to delete in " + tableName);
  
  const headers = getHeaders(sheet);
  const idIndex = headers.indexOf('id');
  if (idIndex === -1) throw new Error("No 'id' column found in table " + tableName);
  
  const ids = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues().flat().map(String).map(s => s.trim());
  const targetId = String(id).trim();
  const index = ids.indexOf(targetId);
  
  if (index === -1) throw new Error("Item ID not found for deletion: " + targetId + " (table: " + tableName + ")");
  
  sheet.deleteRow(index + 2);
  return { id: id, deleted: true };
}

// ==========================================
// 4. CACHING SYSTEM
// ==========================================
function getCachedData(key) {
  if (!CONFIG.USE_CACHE) return null;
  try {
    const cache = CacheService.getScriptCache();
    let raw = "";
    let chunkIndex = 0;
    while (true) {
      let chunk = cache.get(`${key}_chunk_${chunkIndex}`);
      if (chunk === null) break;
      raw += chunk;
      chunkIndex++;
    }
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Cache read warning:", e);
    return null;
  }
}

function setCachedData(key, data) {
  if (!CONFIG.USE_CACHE) return;
  try {
    const cache = CacheService.getScriptCache();
    const raw = JSON.stringify(data);
    clearCache(key);

    const chunkSize = 90 * 1024; 
    let chunkIndex = 0;
    for (let i = 0; i < raw.length; i += chunkSize) {
      const chunk = raw.substring(i, i + chunkSize);
      cache.put(`${key}_chunk_${chunkIndex}`, chunk, CONFIG.CACHE_TTL);
      chunkIndex++;
    }
  } catch (e) {
    console.error("Cache write warning:", e);
  }
}

function clearCache(key) {
  if (!CONFIG.USE_CACHE) return;
  try {
    const cache = CacheService.getScriptCache();
    let chunkIndex = 0;
    while (true) {
      let chunkKey = `${key}_chunk_${chunkIndex}`;
      if (cache.get(chunkKey) === null) break;
      cache.remove(chunkKey);
      chunkIndex++;
    }
  } catch (e) {
    console.error("Cache clear warning:", e);
  }
}

// ==========================================
// 5. PUSH NOTIFICATIONS & SUBSCRIPTIONS
// ==========================================
function saveSubscription(subData) {
  const sheet = getSheet('subscriptions');
  const lastRow = sheet.getLastRow();
  const headers = CONFIG.SHEETS.subscriptions.headers;
  
  let rowIndex = -1;
  if (lastRow > 1) {
    const endpoints = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat().map(String);
    const index = endpoints.indexOf(String(subData.endpoint));
    if (index > -1) rowIndex = index + 2;
  }

  const payload = {
    endpoint: subData.endpoint,
    p256dh: (subData.keys && subData.keys.p256dh) ? subData.keys.p256dh : '',
    auth: (subData.keys && subData.keys.auth) ? subData.keys.auth : '',
    userId: subData.userId || 'Anonymous',
    userAgent: subData.userAgent || '',
    updatedAt: Date.now()
  };

  const row = headers.map(h => payload[h] !== undefined ? payload[h] : "");

  if (rowIndex > -1) {
    sheet.getRange(rowIndex, 1, 1, row.length).setValues([row]);
    return { status: 'updated' };
  } else {
    sheet.appendRow(row);
    return { status: 'created' };
  }
}

function triggerNotification(tableName, data) {
  // Placeholder for Web Push API execution
}

// ==========================================
// 6. FILE OPERATIONS
// ==========================================
function getFolderId(folderName, propKey) {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(propKey);
  
  if (id) {
    try {
      const folder = DriveApp.getFolderById(id);
      folder.getName(); 
      return folder;
    } catch(e) {}
  }

  const folders = DriveApp.getFoldersByName(folderName);
  let folder;
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(folderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  props.setProperty(propKey, folder.getId());
  return folder;
}

function processImageUpload(base64String, id) {
  try {
    const folder = getFolderId(CONFIG.FOLDER_NAME, 'FOLDER_ID_PHOTOS');
    
    let contentType = 'image/jpeg';
    let rawData = base64String;
    if (base64String.includes(',')) {
      const parts = base64String.split(',');
      const match = parts[0].match(/:(.*?);/);
      contentType = (match && match[1]) ? match[1] : contentType;
      rawData = parts[1];
    }
    
    const decoded = Utilities.base64Decode(rawData);
    const fileExtension = contentType.split('/')[1] || 'jpg';
    const fileName = `img_${id}_${Date.now()}.${fileExtension}`;
    const blob = Utilities.newBlob(decoded, contentType, fileName);
    
    const file = folder.createFile(blob);
    return "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
  } catch (e) {
    console.error("Image upload warning:", e);
    return "";
  }
}

// ==========================================
// 7. HELPER FUNCTIONS
// ==========================================
function getSheet(key) {
  const config = CONFIG.SHEETS[key];
  if (!config) throw new Error("Unknown table: " + key);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(config.name);
  
  if (!sheet) {
    sheet = ss.insertSheet(config.name);
    sheet.appendRow(config.headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, config.headers.length).setFontWeight("bold");
  } else {
    const currentHeaders = sheet.getRange(1, 1, 1, config.headers.length).getValues()[0];
    const isDifferent = currentHeaders.some((h, i) => h !== config.headers[i]);
    if (isDifferent) {
      sheet.getRange(1, 1, 1, config.headers.length).setValues([config.headers]);
      sheet.getRange(1, 1, 1, config.headers.length).setFontWeight("bold");
    }
  }
  return sheet;
}

function getHeaders(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < 1) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String).map(h => h.trim().toLowerCase());
}

function formatLocalDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  const adjusted = new Date(date.getTime() - (offset * 60 * 1000));
  return adjusted.toISOString().split('T')[0];
}

function doSetup() {
  const results = [];
  try {
    const f1 = getFolderId(CONFIG.FOLDER_NAME, 'FOLDER_ID_PHOTOS');
    results.push(`Photos Folder ID: ${f1.getId()}`);
    const f2 = getFolderId(CONFIG.REPORT_FOLDER_NAME, 'FOLDER_ID_REPORTS');
    results.push(`Reports Folder ID: ${f2.getId()}`);
  } catch(e) { 
    results.push("Folder setup error: " + e.message); 
  }

  Object.keys(CONFIG.SHEETS).forEach(key => {
    try {
      getSheet(key);
      results.push(`Sheet verified: ${CONFIG.SHEETS[key].name}`);
    } catch(e) {
      results.push(`Sheet setup error for ${key}: ${e.message}`);
    }
  });

  // Automatically create default Admin if no users exist
  const usersSheet = getSheet('users');
  if (usersSheet.getLastRow() < 2) {
    try {
      const adminUser = {
        id: Utilities.getUuid(),
        name: "Admin",
        email: "admin@truchoice.com",
        password: hashPassword("admin123"), // Default Password
        role: "admin",
        rate: "",
        pin: ""
      };
      createItem('users', adminUser);
      results.push("Default admin user created (admin@truchoice.com / admin123)");
    } catch(e) {
      results.push("Admin creation error: " + e.message);
    }
  }

  return results;
}

function generateReport(data) {
  const { userId, startDate, endDate } = data;
  if (!userId || !startDate || !endDate) {
    throw new AppError("userId, startDate, and endDate are required", 400);
  }

  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  // Read time entries
  const sheet = getSheet('time_entries');
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new AppError("No time entries found to report", 404);

  const headers = values[0];
  const rows = values.slice(1);
  const uIdx = headers.indexOf('userId');
  const sIdx = headers.indexOf('startTime');
  const eIdx = headers.indexOf('endTime');
  const jobIdx = headers.indexOf('jobName');
  const payIdx = headers.indexOf('totalPay');

  // Filter entries
  const userEntries = [];
  let totalMinutes = 0;
  let totalEarnings = 0;

  rows.forEach(row => {
    if (String(row[uIdx]) === String(userId)) {
      const sTime = Number(row[sIdx]);
      if (sTime >= startMs && sTime <= endMs) {
        const eTime = Number(row[eIdx]) || Date.now();
        const durationMin = Math.round((eTime - sTime) / (1000 * 60));
        const pay = Number(row[payIdx]) || 0;
        
        userEntries.push({
          date: formatLocalDate(new Date(sTime)),
          job: row[jobIdx] || 'General',
          startTime: new Date(sTime).toLocaleTimeString(),
          endTime: row[eIdx] ? new Date(eTime).toLocaleTimeString() : 'ActiveNow',
          durationHrs: (durationMin / 60).toFixed(2),
          pay: pay.toFixed(2)
        });

        totalMinutes += durationMin;
        totalEarnings += pay;
      }
    }
  });

  if (userEntries.length === 0) {
    throw new AppError("No records found for specified user and period", 404);
  }

  // Create document in reports folder
  const folder = getFolderId(CONFIG.REPORT_FOLDER_NAME, 'FOLDER_ID_REPORTS');
  const fileName = `TruChoice_PayReport_${userId}_${Date.now()}.txt`;
  
  // Style report text
  let reportText = `========================================\nTRUCHOICE PRODUCTION - PAY REPORT\n========================================\n\n`;
  reportText += `User ID: ${userId}\n`;
  reportText += `Period: ${startDate.split('T')[0]} to ${endDate.split('T')[0]}\n`;
  reportText += `Generated At: ${new Date().toLocaleString()}\n\n`;
  reportText += `SUMMARY:\n`;
  reportText += `----------------------------------------\n`;
  reportText += `Total Hours: ${(totalMinutes / 60).toFixed(2)} hrs\n`;
  reportText += `Total Earnings: $${totalEarnings.toFixed(2)}\n\n`;
  reportText += `DETAILED LOGS:\n`;
  reportText += `----------------------------------------\n`;
  reportText += `Date        | Job Name             | Start-End           | Hours   | Paid \n`;
  reportText += `----------------------------------------\n`;
  
  userEntries.forEach(e => {
    const dStr = e.date.padEnd(11);
    const jStr = String(e.job).slice(0, 20).padEnd(20);
    const timeStr = `${e.startTime}-${e.endTime}`.padEnd(21);
    const hStr = e.durationHrs.padEnd(7);
    const pStr = `$${e.pay}`;
    reportText += `${dStr} | ${jStr} | ${timeStr} | ${hStr} | ${pStr}\n`;
  });
  
  reportText += `\n========================================\nEnd of Report\n========================================`;

  const blob = Utilities.newBlob(reportText, 'text/plain', fileName);
  const file = folder.createFile(blob);
  
  // Return file viewer URL
  return { url: file.getUrl() };
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}