const API_URL = "https://script.google.com/macros/s/AKfycbwdQzFsvUnCsUe82ajxfYRhL5IDRMOTk5HNKt8fkJhxfk7fA4in59IeQdjTfh99kYeyfw/exec";

let html5QrCode = null;

function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach(e => e.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(e => e.classList.remove("active"));

  event.target.classList.add("active");
  document.getElementById(tab + "-tab").classList.add("active");

  if (tab === "scan") startScanner();
  else stopScanner();
}

// function switchTab(tab, event) {
//   document.querySelectorAll(".tab-content").forEach(e => e.classList.remove("active"));
//   document.querySelectorAll(".tab-btn").forEach(e => e.classList.remove("active"));

//   event.target.classList.add("active");
//   document.getElementById(tab + "-tab").classList.add("active");

//   if (tab === "scan") startScanner();
//   else stopScanner();
// }

// function stopScanner() {
//   if (html5QrCode) html5QrCode.stop();
// }

async function stopScanner() {
  if (html5QrCode) {
    await html5QrCode.stop();
    html5QrCode.clear();
    html5QrCode = null;
  }
}

// async function startScanner() {
//   html5QrCode = new Html5Qrcode("reader");

//   html5QrCode.start(
//     { facingMode: "environment" },
//     { fps: 10, qrbox: 250 },
//     onScanSuccess
//   );
// }

async function startScanner() {
  try {
    html5QrCode = new Html5Qrcode("reader");

    const cameras = await Html5Qrcode.getCameras();

    if (!cameras.length) {
      alert("Tidak ada kamera ditemukan");
      return;
    }

    await html5QrCode.start(
      cameras[0].id,   // pilih kamera pertama
      {
        fps: 10,
        qrbox: { width: 250, height: 250 }
      },
      onScanSuccess
    );

  } catch (err) {
    console.error("Camera error:", err);
    alert("Gagal mengakses kamera: " + err.message);
  }
}

async function onScanSuccess(token) {
  await html5QrCode.pause();
  processScan(token);

  setTimeout(() => html5QrCode.resume(), 3000);
}

async function processScan(token) {
  const res = await fetch(API_URL + "?action=scan&token=" + token);
  const data = await res.json();

  document.getElementById("scan-result").innerHTML = data.message;
}

async function buatQR() {
  const res = await fetch(API_URL + "?action=createSession");
  const data = await res.json();

  document.getElementById("token").innerHTML = data.token;

  QRCode.toCanvas(document.getElementById("qrcode"), data.token);
  document.getElementById("qrcode").style.display = "block";
}

function generateManualQR() {
  const token = document.getElementById("manualToken").value;
  QRCode.toCanvas(document.getElementById("qrcode"), token);
}

function showFileUpload() {
  document.getElementById("qr-file").click();
}

async function scanQRFromFile(input) {
  const qr = new Html5Qrcode("reader");
  const decoded = await qr.scanFile(input.files[0]);
  processScan(decoded);
}

function manualScan() {
  const token = document.getElementById("manualScanToken").value;
  processScan(token);
}