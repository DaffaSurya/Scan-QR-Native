const API_URL = "https://script.google.com/macros/s/AKfycbwJ350iSGND8ZIoTRayc88JFHGWkRfu5Hq6L9rTWIOdwcTbDu0SdUdghGhlNGvNTwdQEA/exec";
let html5QrCode = null;
let currentToken = null;

let accelInterval = null;
let sensorBuffer = [];
let lastAccel = { x: 0, y: 0, z: 0 };
let sensorHandler = null;
let gpsInterval = null;
let gpsWatchId = null;
let currentLat = null;
let currentLng = null;
let currentAccuracy = null;
let map = null;
let marker = null;
let polyline = null;
let polylineCoords = [];

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



// ===== START GPS =====
async function startGPS() {
  if (!navigator.geolocation) {
    alert("Browser tidak mendukung GPS");
    return;
  }

  updateGPSState("📡 Meminta izin GPS...");

  gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      currentLat = position.coords.latitude;
      currentLng = position.coords.longitude;
      currentAccuracy = position.coords.accuracy;

      updateGPSUI(currentLat, currentLng, currentAccuracy);
    },
    (err) => {
      console.error("GPS error:", err.message);
      updateGPSState("❌ GPS error: " + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );

  // kirim GPS ke GAS tiap 10 detik
  gpsInterval = setInterval(sendGPS, 10000);

  updateGPSState("✅ GPS aktif");
}

// ===== STOP GPS =====
function stopGPS() {
  if (gpsWatchId !== null) {
    navigator.geolocation.clearWatch(gpsWatchId);
    gpsWatchId = null;
  }
  if (gpsInterval) {
    clearInterval(gpsInterval);
    gpsInterval = null;
  }
  updateGPSState("⛔ GPS berhenti");
}

// ===== KIRIM GPS KE GAS =====
async function sendGPS() {
  if (currentLat === null || currentLng === null) return;

  try {
    const params = new URLSearchParams({
      action: "saveGPS",
      lat: currentLat,
      lng: currentLng,
      accuracy: currentAccuracy || 0,
      user_id: "user123",
      device_id: navigator.userAgent,
      token: currentToken || ""
    });

    const res = await fetch(`${API_URL}?${params.toString()}`);
    const data = await res.json();
    console.log("GPS terkirim:", data);

  } catch (err) {
    console.error("Gagal kirim GPS:", err);
  }
}

// ===== TAMPILKAN PETA =====
async function showMap() {

  const mapContainer = document.getElementById("map");
  const placeholder = document.getElementById("map-placeholder");

  mapContainer.style.display = "block"; // ✅ tampilkan map
  placeholder.style.display = "none";  // ✅ sembunyikan placeholder

  if (!mapContainer) return;

  // init Leaflet map jika belum ada
  if (!map) {
    map = L.map("map").setView([-7.257472, 112.752088], 15); // default Surabaya

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap"
    }).addTo(map);
  }

  // ambil posisi terbaru
  try {
    const resLatest = await fetch(`${API_URL}?action=getLatestGPS&device_id=${encodeURIComponent(navigator.userAgent)}`);
    const latest = await resLatest.json();

    if (latest.data) {
      const { lat, lng, accuracy } = latest.data;

      // update/buat marker
      if (marker) {
        marker.setLatLng([lat, lng]);
      } else {
        marker = L.marker([lat, lng])
          .addTo(map)
          .bindPopup(`📍 Posisi terbaru<br>Akurasi: ${accuracy}m`)
          .openPopup();
      }

      map.setView([lat, lng], 16);
    }

    // ambil history untuk polyline
    const resHistory = await fetch(`${API_URL}?action=getGPSHistory&device_id=${encodeURIComponent(navigator.userAgent)}&limit=50`);
    const history = await resHistory.json();

    if (history.data && history.data.length > 1) {
      const coords = history.data.map(p => [p.lat, p.lng]);

      if (polyline) {
        polyline.setLatLngs(coords);
      } else {
        polyline = L.polyline(coords, { color: "blue", weight: 3 }).addTo(map);
      }

      map.fitBounds(polyline.getBounds());
    }

  } catch (err) {
    console.error("Gagal load peta:", err);
  }
}

// ===== UPDATE UI GPS =====
function updateGPSUI(lat, lng, accuracy) {
  const el = document.getElementById("gps-coords");
  if (el) el.innerText = `Lat: ${lat.toFixed(6)} | Lng: ${lng.toFixed(6)} | Akurasi: ${accuracy.toFixed(0)}m`;
}

function updateGPSState(text, status = "") {
  // const el = document.getElementById("gps-state");
  // if (el) el.innerText = text;
  const el = document.getElementById("gps-state");
  if (!el) return;
  el.innerText = text;
  el.className = status;
}