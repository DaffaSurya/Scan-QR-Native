const API_URL = "https://script.google.com/macros/s/AKfycbwJ350iSGND8ZIoTRayc88JFHGWkRfu5Hq6L9rTWIOdwcTbDu0SdUdghGhlNGvNTwdQEA/exec";
let html5QrCode = null;
let currentToken = null;

let accelInterval = null;
let sensorBuffer = [];
let lastAccel = { x: 0, y: 0, z: 0 };
let sensorHandler = null;


// smoothing (anti noise)
let filtered = { x: 0, y: 0, z: 0 };
const alpha = 0.8;

function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach(e => e.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(e => e.classList.remove("active"));

  event.target.classList.add("active");
  document.getElementById(tab + "-tab").classList.add("active");

  if (tab === "scan") {
    startScanner();
    startAccelerometer(); // 🔥 start sensor
  } else {
    stopScanner();
    stopAccelerometer(); // 🔥 stop sensor
  }
}

/* ================= SCANNER ================= */
async function stopScanner() {
  if (html5QrCode) {
    await html5QrCode.stop();
    html5QrCode.clear();
    html5QrCode = null;
  }
}

async function startScanner() {
  try {
    html5QrCode = new Html5Qrcode("reader");

    await html5QrCode.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess
    );

  } catch (err) {
    console.error("Camera error:", err);
    alert("Gagal mengakses kamera: " + err.message);
  }
}

async function onScanSuccess(token) {
 
  if (!html5QrCode) return;
 
  currentToken = token; // 🔥 simpan token untuk sensor

  await html5QrCode.pause();
  await processScan(token);

  setTimeout(() => {
    if (html5QrCode) html5QrCode.resume();
  }, 3000);
}


async function processScan(token) {
  try {
    // ✅ Gunakan GET dengan query params, lebih kompatibel dengan GAS
    const params = new URLSearchParams({
      action: "scan",
      token: token,
      user_id: "user123",
      device_id: navigator.userAgent,
      location: "Surabaya"
    });

    const res = await fetch(`${API_URL}?${params.toString()}`);

    const rawText = await res.text(); // baca text dulu
    console.log("RAW scan response:", rawText); // 🔥 debug

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error("Response bukan JSON: " + rawText.substring(0, 200));
    }

    let resultText = data.message || "Tidak ada respon";

    if (data.status === "success") {
      resultText = "✅ " + resultText;
      startAccelerometer();
    } else if (data.status === "expired") {
      resultText = "⚠️ " + resultText;
      if (data.new_token) updateQRCode(data.new_token);
    } else {
      resultText = "❌ " + resultText;
    }

    document.getElementById("scan-result").innerHTML = resultText;

  } catch (err) {
    console.error("Detail error:", err.message);
    document.getElementById("scan-result").innerHTML =
      "❌ Error memproses QR: " + err.message;
  }

  console.log("Token:", token);
}


function updateQRCode(token) {
  if (!token) {
    console.warn("Token undefined, skip update QR");
    return;
  }

  currentToken = token; // 🔥 penting untuk sensor

  const canvas = document.getElementById("qrcode");

  canvas.innerHTML = "";

  QRCode.toCanvas(canvas, token, function (error) {
    if (error) console.error(error);
  });

  document.getElementById("token").innerText = token;
}


async function buatQR() {
  try {
    console.log("Fetching URL:", `${API_URL}?action=createSession`); // cek URL

    const res = await fetch(`${API_URL}?action=createSession`);

    console.log("Status:", res.status);          // cek HTTP status (200, 302, 500?)
    console.log("OK?:", res.ok);

    const rawText = await res.text();            // baca as text dulu, JANGAN langsung .json()
    console.log("Raw response:", rawText);       // 🔥 ini paling penting, lihat isi aslinya

    let data;
    try {
      data = JSON.parse(rawText);               // baru parse manual
    } catch (parseErr) {
      throw new Error("Response bukan JSON: " + rawText.substring(0, 200));
    }

    console.log("Parsed data:", data);

    if (!data?.token) {
      throw new Error("Token tidak ada. Data: " + JSON.stringify(data));
    }

    currentToken = data.token;
    document.getElementById("token").innerText = data.token;

    const canvas = document.getElementById("qrcode");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    await QRCode.toCanvas(canvas, data.token, { width: 256 });
    canvas.style.display = "block";

  } catch (err) {
    console.error("Detail error:", err.message); // 🔥 lihat ini di console
    document.getElementById("token").innerText = "ERROR";
    document.getElementById("scan-result").innerHTML = "❌ " + err.message;
  }
}
async function startAccelerometer() {
  
  if (sensorHandler) return; // cegah double listener

  // iOS permission
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== "granted") {
        console.warn("Sensor ditolak");
        updateSensorState("⚠️ Sensor permission ditolak");
        return;
      }
    } catch (err) {
      console.error(err);
      updateSensorState("⚠️ Error requesting sensor");
      return;
    }
  }

  const container = document.getElementById("accel-container");
  container.classList.add("show");
  container.style.display = "block";

  sensorHandler = (event) => handleMotion(event);
  window.addEventListener("devicemotion", sensorHandler);

  accelInterval = setInterval(sendSensorBatch, 5000);

  updateSensorState("Sensor aktif ✅");
}



function stopAccelerometer() {
  if (sensorHandler) {
    window.removeEventListener("devicemotion", sensorHandler);
    sensorHandler = null;
  }

  if (accelInterval) {
    clearInterval(accelInterval);
    accelInterval = null;
  }

  sensorBuffer = [];

  const container = document.getElementById("accel-container");
  container.classList.remove("show");
  container.style.display = "none";

  updateSensorState("Sensor berhenti ⛔");
}

/* ======== HANDLE SENSOR DATA ===========  */

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  // ===== LOW PASS FILTER =====
  filtered.x = alpha * filtered.x + (1 - alpha) * (acc.x || 0);
  filtered.y = alpha * filtered.y + (1 - alpha) * (acc.y || 0);
  filtered.z = alpha * filtered.z + (1 - alpha) * (acc.z || 0);

  lastAccel = {
    x: parseFloat(filtered.x).toFixed(2),
    y: parseFloat(filtered.y).toFixed(2),
    z: parseFloat(filtered.z).toFixed(2)
  };

  updateAccelerometerUI(filtered.x, filtered.y, filtered.z);

  // buffer ke GAS
  if (currentToken) {
    sensorBuffer.push({
      token: currentToken,
      user_id: "user123", // TODO: ambil dari login
      device_id: navigator.userAgent,
      x: lastAccel.x,
      y: lastAccel.y,
      z: lastAccel.z,
      ts: new Date().toISOString()
    });
  }
}

/* ========= update accelorometer ============== */

function updateAccelerometerUI(x, y, z) {

  // angka
  const valuesEl = document.getElementById("accel-values");
  if (valuesEl) {
    valuesEl.innerText =
      `X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)}`;
  }

  // magnitude
  const magnitude = Math.sqrt(x*x + y*y + z*z);
  const magEl = document.getElementById("accel-magnitude");

  if (magEl) {
    magEl.innerText = `Magnitude: ${magnitude.toFixed(2)}`;
  }

  // bar visual
  const normalize = (val) =>
    Math.min(Math.abs(val) / 15 * 100, 100);

  setBar("bar-x", normalize(x));
  setBar("bar-y", normalize(y));
  setBar("bar-z", normalize(z));

  // status gerakan
  if (magnitude > 11) {
    updateSensorState("📱 Bergerak");
  } else {
    updateSensorState("📍 Diam");
  }
}

function setBar(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.width = value + "%";
}

function updateSensorState(text) {
  const el = document.getElementById("sensor-state");
  if (el) el.innerText = text;
}

/* ======== MENGIRIM DATA SENSOR KE GAS  ===========  */

async function sendSensorBatch() {
  if (sensorBuffer.length === 0) return;

  try {
    await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "sensor",
        data: sensorBuffer
      })
    });

    console.log("Sensor terkirim:", sensorBuffer.length);

    sensorBuffer = [];

  } catch (err) {
    console.error("Gagal kirim sensor:", err);
  }
}


/* ================= AUTO RUN SAAT HALAMAN LOAD ================= */

function startSensor() {
  startAccelerometer();
}

function stopSensor() {
  stopAccelerometer();
}

function showFileUpload() {
  document.getElementById("qr-file").click();
}

function scanQRFromFile(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        html5QrCode.scanFile(file, true)
          .then(qr_code => {
            onScanSuccess(qr_code);
          })
          .catch(err => {
            document.getElementById("scan-result").innerHTML = "❌ Error scanning file: " + err.message;
          });
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function generateManualQR() {
  const token = document.getElementById("manualToken").value.trim();
  if (!token) {
    alert("Please enter a token");
    return;
  }
  updateQRCode(token);
}

function manualScan() {
  const token = document.getElementById("manualScanToken").value.trim();
  if (!token) {
    alert("Please enter a token");
    return;
  }
  currentToken = token;
  processScan(token);
}

document.addEventListener("DOMContentLoaded", function () {
  buatQR(); // langsung generate saat halaman dibuka

  // 🔥 jika ingin auto refresh tiap 30 detik aktifkan ini
  setInterval(() => {
    buatQR();
  }, 30000);
});