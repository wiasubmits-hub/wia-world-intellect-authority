// TIA Enterprise Portal & Mechatronics Lab
// Lead: M. Bhargav Rayudu (B.Tech Mechatronics • CAD Diploma)

console.log('[TIA Engine] Initializing Mechatronics & AI telemetry...');

let servoAngle = 92.4;
let motorRPM = 2450;
let isCalibrating = false;

const servoEl = document.getElementById('servoX');
const rpmEl = document.getElementById('motorRPM');
const btnActuate = document.getElementById('btnActuate');

// Live Telemetry Stream
setInterval(() => {
  if (isCalibrating) return;
  servoAngle = +(90 + (Math.sin(Date.now() / 1000) * 8)).toFixed(1);
  motorRPM = Math.floor(2400 + Math.random() * 120);

  if (servoEl) servoEl.textContent = `${servoAngle}°`;
  if (rpmEl) rpmEl.textContent = `${motorRPM.toLocaleString()} RPM`;
}, 1000);

if (btnActuate) {
  btnActuate.addEventListener('click', () => {
    isCalibrating = true;
    btnActuate.textContent = 'Calibrating Actuators...';
    btnActuate.style.background = '#eab308';

    setTimeout(() => {
      servoAngle = 90.0;
      motorRPM = 2500;
      if (servoEl) servoEl.textContent = '90.0° (Zero Offset)';
      if (rpmEl) rpmEl.textContent = '2,500 RPM (Locked)';
      btnActuate.textContent = 'Calibration Complete ✓';
      btnActuate.style.background = '#10b981';

      setTimeout(() => {
        isCalibrating = false;
        btnActuate.textContent = 'Calibrate Actuator';
        btnActuate.style.background = '';
      }, 2500);
    }, 1500);
  });
}
