const $ = id => document.getElementById(id);
const plant = new URLSearchParams(location.search).get('mode') === 'plant';
let room = location.hash.slice(1);
let seen = null;
let revision = -1;
let busy = false;
let touching = false;
let interval;
const messages = {
  dry:'التربة جافة، اشتغلت المضخة الافتراضية',
  wet:'وصلت التربة للرطوبة المطلوبة، توقفت المضخة',
  timeout:'توقفت المضخة بسبب انتهاء مهلة الأمان',
  reset:'أعيد تسليح المضخة'
};
const percent = n => n + '%';
if (plant) {
  $('heading').textContent = 'شاشة النبتة الافتراضية';
  $('lobby').hidden = true;
}
async function api(path, command) {
  const response = await fetch(path, {
    method: command === undefined ? 'GET' : 'POST',
    cache:'no-store',
    ...(command === undefined ? {} : {
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(command)
    })
  });
  if (response.status === 404) throw new Error('الجلسة منتهية أو الرابط غير صحيح.');
  if (!response.ok) throw new Error('تعذر الاتصال بجلسة المحاكاة. جرّب مرة ثانية.');
  return response.json();
}
const endpoint = () => '/api/simulation/'+room;
function render(data) {
  if (data.revision !== undefined && data.revision < revision) return;
  revision = data.revision ?? revision;
  const s = data.state;
  $('lobby').hidden = true;
  $('live').hidden = false;
  $('status').textContent = '● متصل بجلسة المحاكاة';
  $('moisture').textContent = percent(s.moisture);
  $('pump').textContent = s.pump ? 'تعمل' : 'متوقفة';
  $('pump').classList.toggle('on',s.pump);
  $('pump').classList.toggle('off',!s.pump);
  $('safety').textContent = s.locked ? 'قفل الأمان مفعّل' : 'وضع الري التلقائي';
  $('plant').hidden = !plant;
  $('controls').hidden = plant;
  $('config').hidden = plant;
  $('thresholds').textContent = 'تشغيل تحت '+percent(s.low)+'، وإيقاف عند '+percent(s.high)+'.';
  if (seen === null) {
    $('low').value = s.low;
    $('high').value = s.high;
  }
  if (!touching && document.activeElement !== $('slider')) {
    $('slider').value = s.moisture;
    $('slider-value').textContent = percent(s.moisture);
  }
  const url = new URL('/simulation.html?mode=plant',location.origin);
  url.hash = room;
  $('pair').value = url.href;
  $('open-plant').href = url.href;
  const rows = s.events.slice().reverse().map(e => {
    const item = document.createElement('li');
    item.textContent = messages[e.kind]+' ('+percent(e.moisture)+') ';
    const time = document.createElement('time');
    time.textContent = new Date(e.time).toLocaleTimeString('ar-IQ');
    item.append(time);
    return item;
  });
  if (!rows.length) {
    const item = document.createElement('li');
    item.textContent = 'ماكو تنبيهات بعد.';
    rows.push(item);
  }
  $('events').replaceChildren(...rows);
  if (seen !== null) {
    for (const e of s.events.filter(e => e.id > seen)) {
      $('notice').textContent = messages[e.kind]+' عند '+percent(e.moisture);
      if (!plant && window.Notification?.permission === 'granted' && e.kind !== 'reset') {
        try { new Notification('نبتة سمارت', {body:$('notice').textContent,tag:room+'-'+e.id}); } catch {}
      }
    }
  }
  seen = Math.max(seen ?? 0,s.sequence);
}
async function sync(command) {
  if (busy) return;
  busy = true;
  try { render(await api(endpoint(),command)); return true; }
  catch (err) { $('status').textContent = err.message; return false; }
  finally { busy = false; }
}
function follow() {
  if (interval) clearInterval(interval);
  interval = setInterval(() => sync(),1200);
}
$('create').onclick = async () => {
  $('create').disabled = true;
  try {
    const data = await api('/api/simulation',{});
    room = data.id;
    location.hash = room;
    render(data);
    follow();
  } catch (err) { $('notice').textContent = err.message; }
  finally { $('create').disabled = false; }
};
let moistureTimer;
let pendingMoisture;
let sendingMoisture = false;

async function sendMoisture() {
  if (sendingMoisture) return;
  sendingMoisture = true;
  try {
    while (pendingMoisture !== undefined) {
      while (busy) await new Promise(resolve => setTimeout(resolve,40));
      const value = pendingMoisture;
      pendingMoisture = undefined;
      const sent = await sync({type:'moisture',value});
      if (pendingMoisture === undefined) {
        $('reading-status').textContent = sent ? 'وصلت القراءة: '+percent(value) : 'القراءة ما وصلت. حرّك المؤشر أو جرّب إرسالها مرة ثانية.';
      }
    }
  } finally {
    touching = false;
    sendingMoisture = false;
  }
}

function queueMoisture(immediate) {
  touching = true;
  pendingMoisture = Number($('slider').value);
  $('slider-value').textContent = percent(pendingMoisture);
  $('reading-status').textContent = 'جاري إرسال القراءة…';
  clearTimeout(moistureTimer);
  if (immediate) sendMoisture();
  else moistureTimer = setTimeout(sendMoisture,160);
}

$('slider').oninput = () => queueMoisture(false);
$('slider').onchange = () => queueMoisture(true);
$('send-reading').onclick = () => queueMoisture(true);
$('config').onsubmit = async e => {
  e.preventDefault();
  const low = Number($('low').value), high = Number($('high').value);
  if (low >= high) { $('notice').textContent = 'حد الإيقاف لازم يكون أعلى من حد التشغيل.'; return; }
  while (busy) await new Promise(resolve => setTimeout(resolve,40));
  await sync({type:'thresholds',low,high});
};
$('reset').onclick = async () => {
  while (busy) await new Promise(resolve => setTimeout(resolve,40));
  await sync({type:'reset'});
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('pair').value); $('notice').textContent = 'تم نسخ رابط النبتة.'; }
  catch { $('pair').select(); $('notice').textContent = 'انسخ الرابط المحدد.'; }
};
$('enable').onclick = async () => {
  try {
    const permission = await Notification.requestPermission();
    $('notice').textContent = permission === 'granted' ? 'تم تفعيل إشعارات المتصفح.' : 'تنبيهات الصفحة شغالة.';
  } catch { $('notice').textContent = 'تنبيهات الصفحة شغالة.'; }
};
window.addEventListener('hashchange', () => {
  if (location.hash.slice(1) !== room) location.reload();
});

if (/^[a-f0-9]{32}$/.test(room)) { sync(); follow(); }
else if (plant) $('notice').textContent = 'افتح رابط النبتة اللي نسخته من لوحة التحكم.';
