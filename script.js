const API_URL = "https://script.google.com/macros/s/AKfycbx8UiNdMJiqWxp0LzV4cvvKj8Hj1MoYYep3k5QRs3lgRamdA1r7aFL-3EnY5kpYIOB1wA/exec";
let html5QrCode = null;
let currentToken = null;

/* ================= TAB SWITCH ================= */
// function switchTab(tab, btn) {
//   document.querySelectorAll(".tab-content").forEach(e => e.classList.remove("active"));   ============ >> INI CODE LAMA HAPUS JIKA CODE TERBARU TIDAK BERFUNGSI
//   document.querySelectorAll(".tab-btn").forEach(e => e.classList.remove("active"));

//   if (btn) btn.classList.add("active");
//   document.getElementById(tab + "-tab").classList.add("active");

//   if (tab === "scan") {
//     startScanner();
//   } else {
//     stopScanner();
//   }
// }

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
  // if (!html5QrCode) return;

  // await html5QrCode.pause();
  // await processScan(token);

  // setTimeout(() => {
  //   if (html5QrCode) html5QrCode.resume();
  // }, 3000);
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
  // try {
  //   const res = await fetch(`${API_URL}?action=scan&token=${token}`);
  //   const data = await res.json();

  //   let resultText = data.message || "Tidak ada respon";              ====== >> INI CODE LAMA HAPUS JIKA CODE TERBARU TIDAK BERFUNGSI

  //   if (data.expiry) {
  //     const expiryDate = new Date(data.expiry);
  //     if (!isNaN(expiryDate)) {
  //       resultText += "<br>Expired: " + expiryDate.toLocaleString();
  //     }
  //   }

  //   document.getElementById("scan-result").innerHTML = resultText;

  // } catch (err) {
  //   console.error(err);
  //   document.getElementById("scan-result").innerHTML =
  //     "❌ Error memproses QR";
  // }
   try {
    const res = await fetch(`${API_URL}?action=scan&token=${token}`);
    const data = await res.json();

    let resultText = data.message || "Tidak ada respon";

    if (data.status === "success") {
      resultText = "✅ " + resultText;
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


/*  ======== START ACCELOROMETER =============   */

async function startAccelerometer() {
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

  window.addEventListener("devicemotion", handleMotion);

  // kirim tiap 5 detik (batch)
  accelInterval = setInterval(sendSensorBatch, 5000);
}

function stopAccelerometer() {
  window.removeEventListener("devicemotion", handleMotion);
  clearInterval(accelInterval);
  sensorBuffer = [];
}

/* ======== HANDLE SENSOR DATA ===========  */

function handleMotion(event) {
  const acc = event.accelerationIncludingGravity;
  if (!acc) return;

  lastAccel = {
    x: parseFloat(acc.x || 0).toFixed(2),
    y: parseFloat(acc.y || 0).toFixed(2),
    z: parseFloat(acc.z || 0).toFixed(2)
  };

  // tampilkan ke UI (optional)
  const el = document.getElementById("accel-data");
  if (el) {
    el.innerHTML = `
      X: ${lastAccel.x} | 
      Y: ${lastAccel.y} | 
      Z: ${lastAccel.z}
    `;
  }

  // masukkan ke buffer
  if (currentToken) {
    sensorBuffer.push({
      token: currentToken,
      user_id: "user123", // 🔥 ganti dinamis
      device_id: navigator.userAgent,
      x: lastAccel.x,
      y: lastAccel.y,
      z: lastAccel.z
    });
  }
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