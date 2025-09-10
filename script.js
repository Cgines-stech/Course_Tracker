/* script.js */
// Weekday helpers
const WD = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; // 0..6

// "Backend" configuration. Admin: edit this block in the repo.
window.APP_CONFIG = {
  timezone: "America/Denver",
  globalHolidays: [
    "2025-10-20" // example school closure
  ],
  programs: [
    {
      name: "Automotive Tech",
      courses: [
        { name: "Basic Theory I", totalHours: 135, allowedDays: [1,4] }, // Mon, Thu
        { name: "Shop Practicum", totalHours: 90, allowedDays: [1,2,3,4,5] }
      ]
    },
    {
      name: "Welding",
      courses: [
        { name: "Intro Welding", totalHours: 120, allowedDays: [2,3,5] },
        { name: "Adv Welding", totalHours: 160, allowedDays: [1,3,4] }
      ]
    }
  ]
};

// DOM helpers
const $ = (sel) => document.querySelector(sel);
const fmtISO = (d) => d.toISOString().slice(0,10);
const parseISO = (s) => { const [y,m,dd] = s.split('-').map(Number); return new Date(y, m-1, dd); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const pad2 = (n) => String(n).padStart(2,'0');

function toIcsDateTime(date, timeHHMM) {
  const [hh, mm] = timeHHMM.split(':').map(Number);
  const y = date.getFullYear();
  const m = pad2(date.getMonth()+1);
  const d = pad2(date.getDate());
  const H = pad2(hh);
  const M = pad2(mm);
  return `${y}${m}${d}T${H}${M}00`;
}

function minutesFromHours(h) { return Math.round(Number(h) * 60); }
function icsDurationFromMinutes(mins) { const h = Math.floor(mins/60); const m = mins % 60; return `PT${h>0?h+"H":""}${m>0?m+"M":""}` || 'PT0H'; }

let personalBlackouts = new Set();

function renderDayGrid(allowedDays) {
  const grid = $('#daysGrid');
  grid.innerHTML = '';
  for (let wd = 1; wd <= 7; wd++) {
    const label = WD[wd%7];
    const allowed = allowedDays.includes(wd);

    const row = document.createElement('div');
    row.className = 'flex items-center gap-2';

    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.id = `cb-${wd}`; cb.disabled = !allowed; cb.className = 'rounded border-slate-300';

    const span = document.createElement('span');
    span.textContent = label; span.className = allowed ? 'w-10' : 'w-10 text-slate-400';

    const hrs = document.createElement('input');
    hrs.type = 'number'; hrs.step = '0.25'; hrs.min = '0'; hrs.placeholder = 'hrs';
    hrs.id = `hrs-${wd}`; hrs.className = 'flex-1 rounded-xl border-slate-300 px-3 py-2';
    hrs.disabled = true;

    cb.addEventListener('change', () => { hrs.disabled = !cb.checked; if (!cb.checked) hrs.value=''; });

    row.append(cb, span, hrs); grid.appendChild(row);

    if (allowed && (wd === 1 || wd === 4)) { cb.checked = true; hrs.disabled = false; hrs.value = 3; }
  }
}

function setInfo(program, course) {
  $('#infoProgram').textContent = program?.name || '—';
  $('#infoCourse').textContent = course?.name || '—';
  $('#infoHours').textContent = course?.totalHours ?? '—';
  const allowed = (course?.allowedDays || []).map(d => WD[d%7]).join(', ');
  $('#infoDays').textContent = allowed || '—';
  $('#configPreview').value = JSON.stringify(window.APP_CONFIG, null, 2);
}

function populateSelects() {
  const programSel = $('#program');
  const courseSel = $('#course');
  const cfg = window.APP_CONFIG;

  programSel.innerHTML = cfg.programs.map((p,i)=>`<option value="${i}">${p.name}</option>`).join('');

  function syncCourses() {
    const p = cfg.programs[Number(programSel.value)];
    courseSel.innerHTML = p.courses.map((c,i)=>`<option value="${i}">${c.name}</option>`).join('');
    const course = p.courses[Number(courseSel.value)];
    renderDayGrid(course.allowedDays);
    setInfo(p, course);
  }

  programSel.addEventListener('change', syncCourses);
  courseSel.addEventListener('change', syncCourses);
  syncCourses();
}

function getSelectedPlan(allowedDays) {
  const plan = new Map();
  for (let wd = 1; wd <= 7; wd++) {
    const cb = document.querySelector(`#cb-${wd}`);
    const hrs = document.querySelector(`#hrs-${wd}`);
    if (cb && cb.checked) {
      const h = Number(hrs.value || 0);
      if (h > 0 && allowedDays.includes(wd)) plan.set(wd, h);
    }
  }
  return plan;
}

function buildSchedule({startDate, totalHours, allowedDays, weeklyPlan, holidays}) {
  let sessions = []; let cum = 0; let d = new Date(startDate);
  const holidaySet = new Set(holidays);
  const MAX_DAYS = 3 * 365;
  for (let i=0; i<MAX_DAYS && cum < totalHours; i++) {
    const jsDay = d.getDay(); // 0..6 Sun..Sat
    const wd = ((jsDay+6)%7)+1; // 1..7 Mon..Sun
    const iso = fmtISO(d);
    if (allowedDays.includes(wd) && weeklyPlan.has(wd) && !holidaySet.has(iso)) {
      let h = weeklyPlan.get(wd);
      if (cum + h > totalHours) h = totalHours - cum;
      cum += h; sessions.push({date: new Date(d), weekday: wd, hours: h});
    }
    d = addDays(d, 1);
  }
  return { sessions, totalHours, cumulative: cum };
}

function renderTable(sessions) {
  const tbody = $('#tableBody'); tbody.innerHTML = '';
  let cum = 0;
  sessions.forEach((s, idx) => {
    cum += s.hours;
    const tr = document.createElement('tr');
    tr.className = idx % 2 ? 'bg-white' : 'bg-slate-50/60';
    tr.innerHTML = `
      <td class="p-2">${idx+1}</td>
      <td class="p-2">${s.date.toLocaleDateString()}</td>
      <td class="p-2">${WD[s.date.getDay()]}</td>
      <td class="p-2 text-right">${s.hours.toFixed(2)}</td>
      <td class="p-2 text-right">${cum.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
  $('#projFinish').textContent = sessions.length ? sessions[sessions.length-1].date.toLocaleDateString() : '—';
  $('#sessCount').textContent = String(sessions.length);
  $('#dlCsv').disabled = sessions.length === 0;
  $('#dlIcs').disabled = sessions.length === 0;
}

function toCSV(rows) {
  const header = ['#','Date','Weekday','Hours','Cumulative'];
  let cum = 0;
  const body = rows.map((r,i)=>{ cum += r.hours; return [i+1, fmtISO(r.date), WD[r.date.getDay()], r.hours.toFixed(2), cum.toFixed(2)]; });
  const csv = [header, ...body].map(a=>a.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('');
  return csv;
}

function toICS({sessions, title, location, startTime}) {
  const uidSuffix = Math.random().toString(36).slice(2);
  const now = new Date();
  const dtstamp = toIcsDateTime(now, `${pad2(now.getHours())}:${pad2(now.getMinutes())}`);
  const lines = [ 'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//OpenEntry Schedule//EN' ];
  sessions.forEach((s, i) => {
    const dtStart = toIcsDateTime(s.date, startTime);
    const dur = icsDurationFromMinutes(minutesFromHours(s.hours));
    lines.push('BEGIN:VEVENT', `UID:${i}-${uidSuffix}@openentry`, `DTSTAMP:${dtstamp}`, `DTSTART:${dtStart}`, `DURATION:${dur}`, `SUMMARY:${title}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return lines.join('');
}

function initBlackouts() {
  $('#blkAdd').addEventListener('click', (e) => {
    e.preventDefault(); const v = $('#blkInput').value; if (!v) return;
    personalBlackouts.add(v); renderBlackouts(); $('#blkInput').value = '';
  });
}

function renderBlackouts() {
  const ul = $('#blkList'); ul.innerHTML = '';
  Array.from(personalBlackouts).sort().forEach(d => {
    const li = document.createElement('li');
    const btn = document.createElement('button'); btn.textContent = '✕'; btn.className = 'ml-2 text-xs text-red-600';
    btn.addEventListener('click', ()=>{ personalBlackouts.delete(d); renderBlackouts(); });
    li.textContent = d; li.appendChild(btn); ul.appendChild(li);
  });
}

function computePace({sessions, totalHours, completedHours}) {
  const today = new Date();
  const scheduledToDate = sessions.filter(s => s.date <= today).reduce((a,b)=>a+b.hours, 0);
  const pctActual = totalHours > 0 ? (completedHours/totalHours)*100 : 0;
  const pctExpected = totalHours > 0 ? (scheduledToDate/totalHours)*100 : 0;
  const onTrack = completedHours + 1e-6 >= scheduledToDate; // tiny epsilon for float
  return { scheduledToDate, pctActual, pctExpected, onTrack };
}

function main() {
  populateSelects(); initBlackouts();
  $('#startDate').valueAsDate = new Date();

  $('#generate').addEventListener('click', () => {
    const cfg = window.APP_CONFIG;
    const program = cfg.programs[Number($('#program').value)];
    const course = program.courses[Number($('#course').value)];

    const start = $('#startDate').value; if (!start) { alert('Please choose a start date.'); return; }
    const startDate = parseISO(start);
    const startTime = $('#startTime').value || '09:00';

    const weeklyPlan = getSelectedPlan(course.allowedDays);
    if (weeklyPlan.size === 0) { alert('Select at least one allowed day and set hours.'); return; }

    const completedHours = Math.max(0, Number($('#completedHours').value || 0));

    const holidays = new Set([ ...cfg.globalHolidays, ...personalBlackouts ]);

    const { sessions } = buildSchedule({
      startDate,
      totalHours: course.totalHours,
      allowedDays: course.allowedDays,
      weeklyPlan,
      holidays
    });

    renderTable(sessions);

    // Pace metrics (NEW)
    const { scheduledToDate, pctActual, pctExpected, onTrack } = computePace({
      sessions, totalHours: course.totalHours, completedHours
    });

    $('#schedToDate').textContent = scheduledToDate.toFixed(2);
    $('#completedOut').textContent = completedHours.toFixed(2);
    $('#pctActual').textContent = `${pctActual.toFixed(1)}%`;
    $('#pctExpected').textContent = `${pctExpected.toFixed(1)}%`;

    const badge = $('#onTrack');
    badge.textContent = onTrack ? 'Yes – on/above pace' : 'No – behind pace';
    badge.className = `inline-block px-2 py-1 rounded-lg ${onTrack ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;

    // Downloads
    $('#dlCsv').onclick = () => {
      const csv = toCSV(sessions);
      download(`${course.name.replaceAll(' ','_')}_schedule.csv`, csv, 'text/csv');
    };
    $('#dlIcs').onclick = () => {
      const ics = toICS({ sessions, title: `${program.name} – ${course.name}`, location: '', startTime });
      download(`${course.name.replaceAll(' ','_')}.ics`, ics, 'text/calendar');
    };
  });
}

document.addEventListener('DOMContentLoaded', main);