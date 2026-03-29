const API_URL = "https://script.google.com/macros/s/AKfycbw0G8fU4znFJey-mFGXRRD9XN-Arqt7rOCtcxS_Lo4IGkzyfovow0vIpQdcTUhAl0oloA/exec";
let html5QrCode = null;
let currentToken = null;

let accelInterval = null;
let sensorBuffer = [];
let lastAccel = { x: 0, y: 0, z: 0 };
let sensorHandler = null;


// smoothing (anti noise)
let filtered = { x: 0, y: 0, z: 0 };
const alpha = 0.8;

function switchTab(tab, btn) {
  document.querySelectorAll(".tab-content").forEach(e => e.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(e => e.classList.remove("active"));

  if (btn) btn.classList.add("active");
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

/* ================= PROCESS SCAN ================= */
async function processScan(token) {
 
   try {
    const res = await fetch(`${API_URL}?action=scan&token=${token}`);
    const data = await res.json();

    let resultText = data.message || "Tidak ada respon";

    if (data.status === "success") {
      resultText = "✅ " + resultText;
      startAccelerometer();
    } else {
      resultText = "❌ " + resultText;
    }

    document.getElementById("scan-result").innerHTML = resultText;

  } catch (err) {
    console.error(err);
    document.getElementById("scan-result").innerHTML =
      "❌ Error memproses QR";
  }
}

/* ================= AUTO GENERATE QR ================= */
async function buatQR() {
  try {
    const res = await fetch(`${API_URL}?action=createSession`);
    const data = await res.json();

    document.getElementById("token").innerHTML = data.token;

    const canvas = document.getElementById("qrcode");
    canvas.innerHTML = ""; // bersihkan sebelum generate ulang

    await QRCode.toCanvas(canvas, data.token);
    canvas.style.display = "block";

  } catch (err) {
    console.error("Gagal generate QR:", err);
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
        return;
      }
    } catch (err) {
      console.error(err);
      return;
    }
  }

  document.getElementById("accel-container").style.display = "block";

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

document.addEventListener("DOMContentLoaded", function () {
  buatQR(); // langsung generate saat halaman dibuka

  // 🔥 jika ingin auto refresh tiap 30 detik aktifkan ini
  setInterval(() => {
    buatQR();
  }, 30000);
});





