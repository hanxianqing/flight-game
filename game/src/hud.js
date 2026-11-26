// Skyline Courier — the HUD and the screens around the game.
// One job: everything the pilot reads — instruments, warnings, menus —
// drawn in the DOM over the 3D view. No flight logic lives here.

import { MISSIONS } from './config.js';

const MS_TO_KT = 1.94384;
const M_TO_FT = 3.28084;

export function buildHud() {
  const root = document.getElementById('hud');

  root.innerHTML = `
  <div class="hud-top">
    <div class="hud-box" id="hud-speed"><span class="label">AIRSPEED</span><span class="value" id="v-ias">0</span><span class="unit">kt</span></div>
    <div class="hud-box" id="hud-alt"><span class="label">ALTITUDE</span><span class="value" id="v-alt">0</span><span class="unit">ft</span></div>
    <div class="hud-box" id="hud-hdg"><span class="label">HEADING</span><span class="value" id="v-hdg">360</span><span class="unit">°</span></div>
    <div class="hud-box" id="hud-vsi"><span class="label">CLIMB</span><span class="value" id="v-vsi">0</span><span class="unit">fpm</span></div>
  </div>
  <div class="hud-compass"><div class="compass-tape" id="compass-tape"></div><div class="compass-needle">▲</div></div>
  <div class="hud-left">
    <canvas id="attitude" width="150" height="150" aria-label="Attitude indicator"></canvas>
    <div class="gauge"><span class="label">THROTTLE</span><div class="bar"><div id="g-thr" class="fill thr"></div></div><span class="gval" id="v-thr">0%</span></div>
    <div class="gauge"><span class="label">FUEL</span><div class="bar"><div id="g-fuel" class="fill fuel"></div></div><span class="gval" id="v-fuel">100</span></div>
    <div class="gauge"><span class="label">AIRFRAME</span><div class="bar"><div id="g-dmg" class="fill dmg"></div></div><span class="gval" id="v-dmg">OK</span></div>
    <div class="switches" id="v-switches">GEAR DOWN · FLAPS UP</div>
  </div>
  <div class="hud-right">
    <div class="hud-box wide"><span class="label">SCORE</span><span class="value" id="v-score">0</span></div>
    <div class="hud-box wide"><span class="label">TIME</span><span class="value" id="v-time">5:00</span></div>
    <div class="objective" id="v-objective"></div>
  </div>
  <div class="warnings" id="v-warnings"></div>
  <div class="toast" id="v-toast"></div>
  <div class="help">W/S pitch · A/D bank · Q/E rudder · Shift/Ctrl throttle · F flaps · G gear · B brake · P pause</div>`;

  // compass tape: repeating degree marks, slid by heading
  const tape = document.getElementById('compass-tape');
  let marks = '';
  for (let d = 0; d < 360; d += 10) {
    const label = d % 90 === 0 ? ['N', 'E', 'S', 'W'][d / 90] : (d % 30 === 0 ? String(d) : '');
    marks += `<span class="tick${d % 30 === 0 ? ' major' : ''}" data-d="${d}">${label || '|'}</span>`;
  }
  tape.innerHTML = marks + marks; // doubled so the tape can slide seamlessly

  const screen = document.getElementById('screen');
  const attitude = document.getElementById('attitude');
  const actx = attitude.getContext('2d');

  let toastTimer = 0;
  function toast(text, ms = 2600) {
    const el = document.getElementById('v-toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  function drawAttitude(pitch, roll) {
    const w = 150, h = 150, cx = 75, cy = 75, r = 68;
    actx.clearRect(0, 0, w, h);
    actx.save();
    actx.beginPath(); actx.arc(cx, cy, r, 0, Math.PI * 2); actx.clip();
    // sky and ground roll with the plane, pitch shifts the horizon
    actx.translate(cx, cy);
    actx.rotate(roll);
    const horizon = Math.max(-r, Math.min(r, pitch * 160));
    actx.fillStyle = '#3f6fb5';
    actx.fillRect(-r, -r, r * 2, r + horizon);
    actx.fillStyle = '#7a5a34';
    actx.fillRect(-r, horizon, r * 2, r - horizon + 1);
    actx.fillStyle = '#f5f2e8';
    actx.fillRect(-r, horizon - 1, r * 2, 2);
    actx.restore();
    // fixed aircraft symbol
    actx.strokeStyle = '#ffd23e'; actx.lineWidth = 3;
    actx.beginPath();
    actx.moveTo(cx - 34, cy); actx.lineTo(cx - 10, cy); actx.moveTo(cx + 10, cy); actx.lineTo(cx + 34, cy);
    actx.moveTo(cx, cy); actx.lineTo(cx, cy + 8);
    actx.stroke();
    actx.strokeStyle = 'rgba(245,242,232,0.9)'; actx.lineWidth = 2;
    actx.beginPath(); actx.arc(cx, cy, r, 0, Math.PI * 2); actx.stroke();
  }

  function fmtTime(s) {
    const t = Math.max(0, Math.ceil(s));
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }

  function update(plane, mission, phase) {
    document.getElementById('v-ias').textContent = Math.round(plane.speed * MS_TO_KT);
    document.getElementById('v-alt').textContent = Math.round(Math.max(0, plane.y - 1) * M_TO_FT);
    const hdg = ((Math.round(-plane.heading * 180 / Math.PI) % 360) + 360) % 360;
    document.getElementById('v-hdg').textContent = String(hdg || 360).padStart(3, '0');
    document.getElementById('v-vsi').textContent = Math.round(plane.verticalSpeed * M_TO_FT * 60);
    document.getElementById('v-score').textContent = mission ? mission.score : 0;
    document.getElementById('v-time').textContent = mission ? fmtTime(mission.timeLeft) : '--:--';
    document.getElementById('v-objective').textContent = mission ? mission.objective : '';
    document.getElementById('g-thr').style.width = `${plane.throttle * 100}%`;
    document.getElementById('v-thr').textContent = `${Math.round(plane.throttle * 100)}%`;
    document.getElementById('g-fuel').style.width = `${plane.fuel}%`;
    document.getElementById('g-fuel').classList.toggle('low', plane.fuel < 25);
    document.getElementById('v-fuel').textContent = `${Math.round(plane.fuel)}`;
    const dmg = Math.round(plane.damage);
    document.getElementById('g-dmg').style.width = `${dmg}%`;
    document.getElementById('v-dmg').textContent = dmg < 1 ? 'OK' : dmg < 40 ? 'DENTED' : dmg < 75 ? 'HURTING' : 'CRITICAL';
    document.getElementById('v-switches').textContent =
      `${plane.gearDown ? 'GEAR DOWN' : 'GEAR UP'} · ${plane.flaps ? 'FLAPS DOWN' : 'FLAPS UP'}${plane.onGround ? ' · ON GROUND' : ''}`;

    // compass tape slides with heading (10 px per degree, tape doubled)
    const tapeEl = document.getElementById('compass-tape');
    const offset = -((hdg * 4) % 1440);
    tapeEl.style.transform = `translateX(${offset + 180}px)`;

    // warnings
    const warns = [];
    if (plane.stalled && !plane.onGround) warns.push('STALL');
    if (plane.fuel < 20 && plane.fuel > 0) warns.push('LOW FUEL');
    if (plane.fuel <= 0) warns.push('FUEL EMPTY');
    if (plane.damage > 60) warns.push('AIRFRAME CRITICAL');
    if (plane.onGround && plane.speed > 45) warns.push('TOO FAST TO LAND');
    const wEl = document.getElementById('v-warnings');
    wEl.innerHTML = warns.map((w) => `<span class="warn">${w}</span>`).join('');

    drawAttitude(plane.pitch, plane.roll);
    root.classList.toggle('hidden', phase === 'menu');
  }

  function showMenu() {
    root.classList.add('hidden');
    screen.innerHTML = `
      <div class="panel menu">
        <h1>SKYLINE COURIER</h1>
        <p class="sub">A bush-plane courier in the Alpine valley. Fly it yourself — no autopilot, no shortcuts.</p>
        <div class="missions">
          ${MISSIONS.map((m, i) => `
            <button class="mission" data-mission="${m.id}">
              <span class="mnum">${i + 1}</span>
              <span class="mname">${m.name}</span>
              <span class="mtag">${m.tag}</span>
              <span class="mbrief">${m.brief}</span>
            </button>`).join('')}
        </div>
        <p class="keys">W/S pitch · A/D bank · Q/E rudder · Shift/Ctrl throttle · F flaps · G gear · B brake · P pause · R restart · M menu</p>
        <p class="foot">Click a mission, or press 1, 2, 3. Mouse drag looks around, wheel zooms the chase camera.</p>
      </div>`;
    screen.classList.remove('hidden');
    screen.querySelectorAll('[data-mission]').forEach((b) => {
      b.addEventListener('click', () => window.dispatchEvent(new CustomEvent('start-mission', { detail: b.dataset.mission })));
    });
  }

  function showPause(mission) {
    screen.innerHTML = `
      <div class="panel">
        <h1>PAUSED</h1>
        <p class="sub">${mission.def.name} — score ${mission.score}, ${fmtTime(mission.timeLeft)} left</p>
        <p class="keys">P to resume · R to restart · M for the menu</p>
      </div>`;
    screen.classList.remove('hidden');
  }

  function showEnd(mission, plane) {
    const won = mission.status === 'won';
    const q = mission.landingQuality;
    screen.innerHTML = `
      <div class="panel">
        <h1 class="${won ? 'win' : 'lose'}">${won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</h1>
        <p class="sub">${mission.def.name}</p>
        <p class="endline">${mission.endReason}</p>
        ${q ? `<p class="endline">Landing: ${q.rating} — ${q.vs.toFixed(1)} m/s, ${q.offset.toFixed(0)} m off centreline</p>` : ''}
        <div class="stats">
          <div><span>SCORE</span><b>${mission.score}</b></div>
          <div><span>TIME LEFT</span><b>${fmtTime(mission.timeLeft)}</b></div>
          <div><span>DISTANCE</span><b>${(plane.distanceFlown / 1000).toFixed(1)} km</b></div>
          <div><span>FUEL LEFT</span><b>${Math.round(plane.fuel)}%</b></div>
        </div>
        <p class="keys">R to fly again · M for the menu · 1/2/3 for another mission</p>
      </div>`;
    screen.classList.remove('hidden');
  }

  function hideScreen() { screen.classList.add('hidden'); }

  return { update, toast, showMenu, showPause, showEnd, hideScreen };
}
