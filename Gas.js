// @ts-nocheck
const SPREADSHEET_ID = '16xtaiAv8Q6kSTE6nSoe5a9gnCOJJKm8LAzcVWZdnwxU';

/* ================= RESPONSE HELPER ================= */
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================= ENTRY ================= */
function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

/* ================= MAIN HANDLER ================= */
function handleRequest(e) {
  try {
    // Logging untuk debugging
    console.log("===== REQUEST RECEIVED =====");
    console.log("Method:", e ? e.method : "unknown");
    console.log("Query String:", e ? e.queryString : "none");
    console.log("Parameters:", e ? JSON.stringify(e.parameters) : "none");
    console.log("Post Data:", e && e.postData ? e.postData.contents : "none");
    
    var params = {};
    
    // ===== CARA 1: Dari query string (GET) =====
    if (e && e.parameters) {
      Object.keys(e.parameters).forEach(function(key) {
        if (e.parameters[key] && e.parameters[key].length > 0) {
          params[key] = e.parameters[key][0];
        }
      });
    }
    
    // ===== CARA 2: Dari parameter langsung (GET) =====
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(function(key) {
        params[key] = e.parameter[key];
      });
    }
    
    // ===== CARA 3: Dari POST body JSON =====
    if (e && e.postData && e.postData.contents) {
      try {
        var body = JSON.parse(e.postData.contents);
        Object.keys(body).forEach(function(key) {
          params[key] = body[key];
        });
      } catch (jsonError) {
        console.log("Not JSON, trying form data");
      }
    }
    
    // ===== CARA 4: Dari POST form-data =====
    if (e && e.postData && e.postData.type === 'application/x-www-form-urlencoded' && e.postData.contents) {
      var pairs = e.postData.contents.split('&');
      for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split('=');
        if (pair.length === 2) {
          var key = decodeURIComponent(pair[0]);
          var value = decodeURIComponent(pair[1]);
          params[key] = value;
        }
      }
    }
    
    // ===== CEK ACTION =====
    var action = params.action;
    
    console.log("Final params:", JSON.stringify(params));
    console.log("Action found:", action);
    
    // Jika action tidak ada, coba cari di parameter lain
    if (!action) {
      // Cek berbagai kemungkinan nama parameter
      var possibleActions = ['act', 'method', 'type', 'operation', 'cmd', 'command'];
      for (var i = 0; i < possibleActions.length; i++) {
        if (params[possibleActions[i]]) {
          action = params[possibleActions[i]];
          break;
        }
      }
    }
    
    // Jika masih tidak ada, return error dengan informasi
    if (!action) {
      var paramKeys = Object.keys(params);
      var response = {
        status: "error",
        message: "Action parameter missing. Received parameters: " + (paramKeys.length > 0 ? paramKeys.join(', ') : "none"),
        tips: "Kirim parameter dengan format: action=nama_action",
        contoh: "?action=test atau POST dengan form-data/json"
      };
      return jsonResponse(response);
    }
    
    // Proses action
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var response;
    
    /* ================= TEST ================= */
    if (action === "test") {
      response = {
        status: "success",
        message: "GAS connected successfully!",
        timestamp: new Date().toISOString(),
        received_params: params,
        server_time: new Date().toString()
      };
    }
    
    /* ================= CREATE SESSION ================= */
    else if (action === "createSession") {
      
      var sheet = ss.getSheetByName("sessions");
      if (!sheet) {
        sheet = ss.insertSheet("sessions");
        sheet.appendRow(["course_id", "Session_id", "QR_token", "expiry", "active", "Durasi_Menit"]);
      }
      
      var duration = parseInt(params.duration || 1);
      var courseId = params.courseId || params.course_id || "CS101";
      var token = generateToken();
      var now = new Date();
      var expiresAt = new Date(now.getTime() + duration * 60000);
      var sessionId = "S" + now.getTime();
      var expiryFormatted = Utilities.formatDate(expiresAt, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
      
      // sheet.appendRow([courseId, sessionId, token, expiryFormatted, "☑️", duration]);
      sheet.appendRow([courseId, sessionId, token, expiresAt, "☑️", duration]);
      
      response = {
        status: "success",
        token: token,
        sessionId: sessionId,
        expiresAt: expiresAt.toISOString(),
        message: "Session created successfully"
      };
    }
    
 else if (action === "scan") {

  var token = params.token || params.Token || params.qr_token;
  var userId = params.userId || params.user_id || "User";
  var deviceId = params.deviceId || params.device_id || "Device";
  var location = params.location || params.Lokasi || "Surabaya";

  if (!token) {
    return jsonResponse({ status: "error", message: "Token required" });
  }

  var sessionSheet = ss.getSheetByName("sessions");
  if (!sessionSheet) {
    return jsonResponse({ status: "error", message: "No sessions found" });
  }

  var attendanceSheet = ss.getSheetByName("attendance");
  if (!attendanceSheet) {
    attendanceSheet = ss.insertSheet("attendance");
    attendanceSheet.appendRow(["course_id", "Session_id", "User_id", "device_id", "ts", "Status", "Lokasi"]);
  }

  var sessionData = sessionSheet.getDataRange().getValues();
  var existingAttendance = attendanceSheet.getDataRange().getValues();

  var found = false;
  var sessionId = null;
  var courseId = null;

  for (var i = 1; i < sessionData.length; i++) {
    var sheetToken = String(sessionData[i][2]).trim().toLowerCase();
    var inputToken = String(token).trim().toLowerCase();

    console.log("Comparing:", sheetToken, "vs", inputToken); // 🔥 debug

    if (sheetToken === inputToken) {
      found = true;
      sessionId = sessionData[i][1];
      courseId = sessionData[i][0];
      var expiry = sessionData[i][3];
      var duration = sessionData[i][5] || 1;

      var now = new Date();
      var expiryDate = new Date(expiry);

      console.log("Token found! Expiry:", expiryDate, "Now:", now); // 🔥 debug

      // ===== CEK EXPIRED =====
      if (now > expiryDate) {
        var newToken = generateToken(8);
        var newExpiry = new Date(now.getTime() + duration * 60000);

        sessionSheet.getRange(i + 1, 3).setValue(newToken);
        sessionSheet.getRange(i + 1, 4).setValue(newExpiry);

        return jsonResponse({
          status: "expired",
          message: "QR expired, token diperbarui",
          new_token: newToken
        });
      }

      // ===== CEK DUPLIKAT ABSENSI =====
      for (var j = 1; j < existingAttendance.length; j++) {
        if (
          String(existingAttendance[j][1]) === String(sessionId) &&
          String(existingAttendance[j][2]) === String(userId)
        ) {
          return jsonResponse({
            status: "error",
            message: "Kamu sudah absen di sesi ini"
          });
        }
      }

      // ===== SIMPAN ABSENSI =====
      attendanceSheet.appendRow([
        courseId,
        sessionId,
        userId,
        deviceId,
        new Date(),
        "Hadir",
        location
      ]);

      console.log("Attendance saved!"); // 🔥 debug

      return jsonResponse({
        status: "success",
        message: "Absensi berhasil dicatat!",
        sessionId: sessionId,
        courseId: courseId
      });
    }
  }

   if (!found) {
    return jsonResponse({
      status: "error",
      message: "Token tidak valid atau tidak ditemukan"
    });
  }
    
      // ===== CEK DOUBLE ATTENDANCE =====
      var isExist = false;

      for (var j = 1; j < existingAttendance.length; j++) {

      var existingSessionId = existingAttendance[j][1];
      var existingUserId = existingAttendance[j][2];

      if (existingSessionId === sessionId && existingUserId === userId) {
        isExist = true;
        break;
      }
    }

  // ===== JIKA SUDAH ADA =====
if (isExist) {
  return jsonResponse({
    status: "error",
    message: "User sudah melakukan presensi pada session ini"
  });
}

// ===== INSERT (HANYA SEKALI) =====
attendanceSheet.appendRow([
  courseId,
  sessionId,
  userId,
  deviceId,
  new Date(),
  "Hadir",
  location //  FIX DI SINI
]);

return jsonResponse({
  status: "success",
  message: "Presensi berhasil"
});
      }


/* ================= SENSOR ENDPOINT ============== */

  else if (action === "sensor") {

  var token = params.token;
  var userId = params.user_id || "Unknown";
  var deviceId = params.device_id || "Unknown";

  if (!token) {
    return jsonResponse({
      status: "error",
      message: "Token wajib untuk sensor"
    });
  }

  // ===== VALIDASI TOKEN KE SESSIONS =====
  var sessionSheet = ss.getSheetByName("sessions");
  var sessionData = sessionSheet ? sessionSheet.getDataRange().getValues() : [];
  var validToken = false;

  for (var i = 1; i < sessionData.length; i++) {
    if (sessionData[i][2] === token) {
      validToken = true;
      break;
    }
  }

  if (!validToken) {
    return jsonResponse({
      status: "error",
      message: "Token tidak valid (sensor ditolak)"
    });
  }

  // ===== INIT SHEET =====
  var sensorSheet = ss.getSheetByName("accelerometer");
  if (!sensorSheet) {
    sensorSheet = ss.insertSheet("accelerometer");
    sensorSheet.appendRow(["timestamp", "token", "user_id", "device_id", "x", "y", "z"]);
  }

  var payload = params.data || null;
  var rows = [];

  // ===== SUPPORT BATCH =====
  if (payload && Array.isArray(payload)) {
    payload.forEach(function(item) {
      rows.push([
        new Date(),
        item.token || token,
        item.user_id || userId,
        item.device_id || deviceId,
        item.x || 0,
        item.y || 0,
        item.z || 0
      ]);
    });
  } else {
    // single
    rows.push([
      new Date(),
      token,
      userId,
      deviceId,
      params.x || 0,
      params.y || 0,
      params.z || 0
    ]);
  }

  // ===== BULK INSERT =====
  var startRow = sensorSheet.getLastRow() + 1;
  sensorSheet
    .getRange(startRow, 1, rows.length, rows[0].length)
    .setValues(rows);

  response = {
    status: "success",
    inserted: rows.length,
    message: "Sensor data tersimpan"
  };
}

/* ================= GET DATA TERBARU ============= */
else if (action === "getLatestSensor") {

  var sheet = ss.getSheetByName("accelerometer");

  if (!sheet || sheet.getLastRow() < 2) {
    return jsonResponse({
      status: "success",
      data: null
    });
  }

  var lastRow = sheet.getLastRow();
  var data = sheet.getRange(lastRow, 1, 1, 7).getValues()[0];

  response = {
    status: "success",
    data: {
      timestamp: data[0],
      token: data[1],
      user_id: data[2],
      device_id: data[3],
      x: data[4],
      y: data[5],
      z: data[6]
    }
  };
}

else if (action === "saveGPS") {
  var lat = parseFloat(params.lat || params.latitude || 0);
  var lng = parseFloat(params.lng || params.longitude || 0);
  var accuracy = parseFloat(params.accuracy || 0);
  var deviceId = params.device_id || params.deviceId || "Unknown";
  var userId = params.user_id || params.userId || "Unknown";
  var token = params.token || currentToken || null;

  var gpsSheet = ss.getSheetByName("GPS");
  if (!gpsSheet) {
    gpsSheet = ss.insertSheet("GPS");
    gpsSheet.appendRow(["timestamp", "user_id", "device_id", "token", "lat", "lng", "accuracy"]);
  }

  gpsSheet.appendRow([
    new Date(),
    userId,
    deviceId,
    token,
    lat,
    lng,
    accuracy
  ]);

  response = {
    status: "success",
    message: "GPS tersimpan",
    lat: lat,
    lng: lng
  };
}

/* ================= GET LATEST GPS ================= */
else if (action === "getLatestGPS") {
  var deviceId = params.device_id || params.deviceId || null;

  var gpsSheet = ss.getSheetByName("gps_logs");
  if (!gpsSheet || gpsSheet.getLastRow() < 2) {
    return jsonResponse({ status: "success", data: null });
  }

  var allData = gpsSheet.getDataRange().getValues();
  var latest = null;

  // cari dari bawah agar dapat yang terbaru
  for (var i = allData.length - 1; i >= 1; i--) {
    if (!deviceId || String(allData[i][2]) === String(deviceId)) {
      latest = {
        timestamp: allData[i][0],
        user_id: allData[i][1],
        device_id: allData[i][2],
        token: allData[i][3],
        lat: allData[i][4],
        lng: allData[i][5],
        accuracy: allData[i][6]
      };
      break;
    }
  }

  response = { status: "success", data: latest };
}

/* ================= GET GPS HISTORY ================= */
else if (action === "getGPSHistory") {
  var deviceId = params.device_id || params.deviceId || null;
  var limit = parseInt(params.limit || 50);

  var gpsSheet = ss.getSheetByName("gps_logs");
  if (!gpsSheet || gpsSheet.getLastRow() < 2) {
    return jsonResponse({ status: "success", data: [] });
  }

  var allData = gpsSheet.getDataRange().getValues();
  var history = [];

  for (var i = 1; i < allData.length; i++) {
    if (!deviceId || String(allData[i][2]) === String(deviceId)) {
      history.push({
        timestamp: allData[i][0],
        user_id: allData[i][1],
        device_id: allData[i][2],
        token: allData[i][3],
        lat: allData[i][4],
        lng: allData[i][5],
        accuracy: allData[i][6]
      });
    }
  }

  // ambil N data terbaru
  var result = history.slice(-limit);

  response = {
    status: "success",
    count: result.length,
    data: result
  };
}
/* ================= GET SESSIONS ================= */
    else if (action === "getSessions") {
      var sheet = ss.getSheetByName("sessions");
      if (!sheet) {
        response = {
          status: "success",
          data: []
        };
      } else {
        var data = sheet.getDataRange().getValues();
        var sessions = [];
        for (var i = 1; i < data.length; i++) {
          sessions.push({
            course_id: data[i][0],
            session_id: data[i][1],
            token: data[i][2],
            expiry: data[i][3],
            active: data[i][4],
            duration: data[i][5]
          });
        }
        response = {
          status: "success",
          data: sessions
        };
      }
    }
    
    else {
      response = {
        status: "error",
        message: "Unknown action: '" + action + "'. Available actions: test, createSession, scan, getSessions",
        received_params: params
      };
    }
    
    console.log("Response:", JSON.stringify(response));
    return jsonResponse(response);
    
  } catch (err) {
    console.error("Error:", err.toString());
    var errorResponse = {
      status: "error",
      message: err.toString(),
      timestamp: new Date().toISOString()
    };
    return jsonResponse(errorResponse);
  }
}


function generateToken(length = 6) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var result = "";
  for (var i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}