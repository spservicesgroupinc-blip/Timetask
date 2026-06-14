// ==========================================
// TRUCHOICE ROOFING - BACKEND V6.1 (NO-FIREBASE)
// ==========================================

const CONFIG = {
  FOLDER_NAME: "TruChoice Photos",
  REPORT_FOLDER_NAME: "TruChoice Pay Reports",
  USE_CACHE: false, // Set to true to enable high-speed Google CacheService
  CACHE_TTL: 600,   // Keep cached data in memory for 10 minutes (600 seconds)
  SHEETS: {
    tasks: { name: "Tasks", headers: ["id", "title", "description", "location", "assignedTo", "dueDate", "priority", "status", "createdAt", "image", "jobName", "startedAt", "jobNotes"] },
    messages: { name: "Messages", headers: ["id", "sender", "text", "timestamp", "image"] },
    users: { name: "Users", headers: ["id", "name", "rate", "role", "pin", "email", "password"] },
    jobs: { name: "Jobs", headers: ["id", "name", "address", "active"] },
    subscriptions: { name: "Subscriptions", headers: ["endpoint", "p256dh", "auth", "userId", "userAgent", "updatedAt"] },
    time_entries: { name: "TimeEntries", headers: ["id", "userId", "startTime", "endTime", "status", "jobName", "totalPay"] }
  }
};

// ==========================================
// 1. ENTRY POINTS
// ==========================================

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const request = parseRequest(e);
    let result = null;
    
    if (!request) {
      return responseJSON({ status: 'error', message: 'Invalid request' });
    }

    // READ actions bypass script lock for speed and high concurrent access
    if (request.action === 'read') {
      result = getCachedData(request.tableName);
      if (!result) {
        result = readData(request.tableName);
        setCachedData(request.tableName, result);
      }
    } 
    // WRITE actions use the script lock to prevent spreadsheet data corruption
    else {
      const lock = LockService.getScriptLock();
      if (!lock.tryLock(10000)) {
        return responseJSON({ status: 'error', message: 'Server busy. Please try again.' });
      }

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
          case 'setup':
            result = doSetup();
            break;
          default:
            throw new Error("Invalid action: " + request.action);
        }
      } finally {
        lock.releaseLock();
      }

      // Execute non-blocking actions after releasing the database lock
      if (runNotification) {
        triggerNotification(request.tableName, request.data);
      }
    }

    return responseJSON({ status: 'success', data: result });

  } catch (err) {
    console.error("Execution Error", err);
    return responseJSON({ status: 'error', message: err.toString() });
  }
}

function parseRequest(e) {
  if (!e) return null;
  if (e.parameter && e.parameter.setup) return { action: 'setup' };
  
  if (e.postData && e.postData.contents) {
    try {
      const json = JSON.parse(e.postData.contents);
      return {
        action: json.action || 'read',
        tableName: (json.table || 'tasks').toLowerCase(),
        data: json.data || {}, 
        id: json.id || (json.data && !Array.isArray(json.data) ? json.data.id : null)
      };
    } catch(err) {
      return null;
    }
  }
  
  return {
    action: 'read',
    tableName: (e.parameter.table || 'tasks').toLowerCase()
  };
}

// ==========================================
// 2. DATA OPERATIONS (OPTIMIZED)
// ==========================================

function readData(tableName) {
  const sheet = getSheet(tableName);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return [];

  const values = sheet.getDataRange().getValues(); 
  const headers = values[0];
  const rows = values.slice(1);

  let hasUpdates = false;
  const idIndex = headers.indexOf('id');

  const result = rows.map((row, rIndex) => {
    const item = {};
    
    // Auto-generate missing IDs for manually added rows
    if (idIndex > -1 && (!row[idIndex] || String(row[idIndex]).trim() === '')) {
       row[idIndex] = Utilities.getUuid();
       values[rIndex + 1][idIndex] = row[idIndex];
       hasUpdates = true;
    }

    headers.forEach((header, i) => {
      let val = row[i];
      if (val instanceof Date) {
        if (['createdAt', 'timestamp', 'startTime', 'endTime', 'updatedAt', 'startedAt'].includes(header)) {
          item[header] = val.getTime();
        } else {
          item[header] = formatLocalDate(val);
        }
      } else {
        item[header] = val;
      }
    });
    return item;
  });

  if (hasUpdates) {
     sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
  }

  return result;
}

function createItem(tableName, data) {
  const sheet = getSheet(tableName);
  const headers = getHeaders(sheet);
  
  // Ensure we assign a unique ID if none is supplied by the frontend
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
  
  // High-performance index lookup using a flat column search on the correct 'id' column
  const ids = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues().flat().map(String).map(s => s.trim());
  const targetId = String(data.id).trim();
  const index = ids.indexOf(targetId); 
  
  if (index === -1) throw new Error("Item ID not found: " + targetId + " (table: " + tableName + ")");
  const rowIndex = index + 2;

  if (data.image && typeof data.image === 'string' && data.image.startsWith('data:image')) {
    data.image = processImageUpload(data.image, data.id);
  }

  // Prevent data loss: Fetch existing row values so that omitted properties are not overwritten
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
  
  // High-performance index lookup using a flat column search on the correct 'id' column
  const ids = sheet.getRange(2, idIndex + 1, lastRow - 1, 1).getValues().flat().map(String).map(s => s.trim());
  const targetId = String(id).trim();
  const index = ids.indexOf(targetId);
  
  if (index === -1) throw new Error("Item ID not found for deletion: " + targetId + " (table: " + tableName + ")");
  
  sheet.deleteRow(index + 2);
  return { id: id, deleted: true };
}

// ==========================================
// 3. CACHING SYSTEM (OPTIONAL LAYER)
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

    const chunkSize = 90 * 1024; // Chunking bypasses Google's 100KB cache key limit
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
// 4. PUSH NOTIFICATIONS PLACEHOLDER
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
  // Since Firebase is disabled, we keep this as a lightweight, non-blocking placeholder.
  // Storing subscriptions remains supported above, but sending push notifications is turned off
  // to avoid network timeouts and eliminate external script dependencies.
}

// ==========================================
// 5. FILE OPERATIONS
// ==========================================

function getFolderId(folderName, propKey) {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(propKey);
  
  if (id) {
    try {
      const folder = DriveApp.getFolderById(id);
      folder.getName(); // Fast verification to ensure folder access is valid
      return folder;
    } catch(e) {
      // Clear reference if folder was deleted or is inaccessible
    }
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
    
    // Performance optimization: Manual setSharing() calls are avoided here.
    // Files inside the parent folder automatically inherit the public view permissions.
    
    return "https://drive.google.com/thumbnail?sz=w1000&id=" + file.getId();
  } catch (e) {
    console.error("Image upload warning:", e);
    return "";
  }
}

// ==========================================
// 6. HELPER FUNCTIONS
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
    // Optimization: Compare current headers and write only if a physical schema change occurred
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
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

function formatLocalDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return "";
  // High-speed V8 conversion - bypasses slow native API bridge calls to Utilities.formatDate()
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

  return results;
}

function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}