import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const $ = (id) => document.getElementById(id);
const setVisible = (id, yes) => $(id).classList.toggle('hidden', !yes);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel = (v) => v ? new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(v)) : '—';
const dateOnly = (v) => v ? new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v)) : '';
const roleName = {admin:'ผู้บริหาร / Admin',receptionist:'พนักงานต้อนรับ',doctor:'แพทย์'};
const statusName = {scheduled:'รอนัดหมาย',completed:'เสร็จสิ้น',cancelled:'ยกเลิก'};
const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(SUPABASE_URL) && !/YOUR_|PLACEHOLDER/i.test(SUPABASE_PUBLISHABLE_KEY) && SUPABASE_PUBLISHABLE_KEY.length > 20;
let db, account, profile, page = 'dashboard', clients = [], appointments = [], doctors = [], staff = [], formMode = null;
const canWrite = () => ['admin','receptionist'].includes(profile?.role);
const isAdmin = () => profile?.role === 'admin';

function alertUser(message, ok = false) { const n=$('alert'); n.textContent=message; n.classList.toggle('ok',ok); n.classList.remove('hidden'); window.scrollTo({top:0,behavior:'smooth'}); }
function clearAlert(){setVisible('alert',false);}
function formError(error) { console.error(error); alertUser(error?.message || 'เกิดข้อผิดพลาด โปรดลองใหม่'); }
function resetViews(){setVisible('setup',false);setVisible('auth',false);setVisible('app',false);}
function showAuth(){resetViews();setVisible('auth',true);account=null;profile=null;}
function todayISO() {return dateOnly(new Date().toISOString());}
function bangkokBounds(date){
  // Asia/Bangkok remains UTC+07; timestamps are stored in UTC.
  return [new Date(date+'T00:00:00+07:00').toISOString(),new Date(new Date(date+'T00:00:00+07:00').getTime()+86400000).toISOString()];
}
async function boot(){
  if(!configured){resetViews();setVisible('setup',true);return;}
  db=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}});
  const {data:{session},error}=await db.auth.getSession();
  if(error){showAuth();return;}
  if(session) await enter(session.user);else showAuth();
  db.auth.onAuthStateChange((event,session)=>{
    if(event==='SIGNED_OUT') showAuth();
    // Do not invoke Supabase queries synchronously inside auth event callback.
  });
}
async function enter(user){
  try {
    const {data,error}=await db.from('staff_profiles').select('user_id,display_name,role,active').eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    if(!data?.active) {await db.auth.signOut();showAuth();alert('บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน กรุณาติดต่อผู้ดูแลระบบ');return;}
    profile=data;account=user;
    resetViews();setVisible('app',true);
    $('side-username').textContent=profile.display_name;
    $('side-role').textContent=roleName[profile.role]||profile.role;
    $('avatar').textContent=(profile.display_name||'M').slice(0,1);
    $('today').textContent=new Intl.DateTimeFormat('th-TH',{dateStyle:'long',timeZone:'Asia/Bangkok'}).format(new Date());
    setVisible('staff-nav',isAdmin());
    setVisible('add-client',canWrite());setVisible('add-appointment',canWrite());
    await navigate('dashboard');
  }catch(e){showAuth();console.error(e);alert('ไม่สามารถโหลดสิทธิ์ผู้ใช้ได้ ตรวจสอบ Supabase และ RLS');}
}
async function navigate(name){
  if(name==='staff'&&!isAdmin())return;
  page=name;clearAlert();
  document.querySelectorAll('.page').forEach(n=>n.classList.toggle('hidden',n.id!=='page-'+name));
  document.querySelectorAll('[data-page]').forEach(n=>n.classList.toggle('active',n.dataset.page===name));
  const titles={dashboard:'ภาพรวมคลินิก',clients:'ข้อมูลลูกค้า',appointments:'การนัดหมาย',staff:'พนักงานและสิทธิ์'};
  $('page-title').textContent=titles[name];
  $('sidebar').classList.remove('open');
  try{
    if(name==='dashboard')await loadDashboard();
    if(name==='clients')await loadClients();
    if(name==='appointments')await loadAppointments();
    if(name==='staff')await loadStaff();
  }catch(e){formError(e);}
}
async function getAll(table,columns='*',sort='created_at',ascending=false){
  // Phase 1 bounded query: avoid accidental unbounded downloads of personal data.
  const {data,error}=await db.from(table).select(columns).order(sort,{ascending}).limit(500);
  if(error)throw error;return data||[];
}
async function loadClients(){clients=await getAll('clients','id,full_name,phone,created_at');renderClients();}
function renderClients(){
  const q=$('search-clients').value.trim().toLocaleLowerCase();
  const shown=clients.filter(c=>c.full_name.toLocaleLowerCase().includes(q)||c.phone.includes(q));
  $('clients-table').innerHTML=shown.map(c=>'<tr><td class="table-name">'+esc(c.full_name)+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc(dateLabel(c.created_at))+'</td><td>'+(canWrite()?'<button class="table-action" data-edit-client="'+esc(c.id)+'">แก้ไข</button>':'')+'</td></tr>').join('');
  setVisible('clients-empty',!shown.length);
}
async function loadDoctors(){
  doctors=(await getAll('staff_profiles','user_id,display_name,role,active','display_name',true)).filter(x=>x.active&&x.role==='doctor');
}
async function loadAppointments(){
  await Promise.all([loadClients(),loadDoctors()]);
  appointments=await getAll('appointments','id,client_id,doctor_user_id,starts_at,service_name,status,created_at','starts_at',true);
  renderAppointments();
}
function renderAppointments(){
  const day=$('date-filter').value, status=$('status-filter').value;
  const shown=appointments.filter(a=>(!day||dateOnly(a.starts_at)===day)&&(!status||a.status===status));
  const names=Object.fromEntries(clients.map(c=>[c.id,c.full_name]));
  const doctorsById=Object.fromEntries(doctors.map(d=>[d.user_id,d.display_name]));
  $('appointments-table').innerHTML=shown.map(a=>'<tr><td>'+esc(dateLabel(a.starts_at))+'</td><td class="table-name">'+esc(names[a.client_id]||'ลูกค้า')+'</td><td>'+esc(a.service_name)+'</td><td>'+esc(doctorsById[a.doctor_user_id]||'ยังไม่ระบุ')+'</td><td><span class="pill '+esc(a.status)+'">'+esc(statusName[a.status]||a.status)+'</span></td><td>'+(canWrite()?'<button class="table-action" data-edit-appointment="'+esc(a.id)+'">แก้ไข</button>':'')+'</td></tr>').join('');
  setVisible('appointments-empty',!shown.length);
}
async function loadDashboard(){
  // Counts are exact within the user's RLS scope and independent of the 500-row UI cap.
  const results=await Promise.all([
    db.from('clients').select('id',{count:'exact',head:true}),
    db.from('appointments').select('id',{count:'exact',head:true}),
    (()=>{const [start,end]=bangkokBounds(todayISO());return db.from('appointments').select('id',{count:'exact',head:true}).gte('starts_at',start).lt('starts_at',end)})(),
    db.from('appointments').select('id',{count:'exact',head:true}).eq('status','scheduled'),
    db.from('appointments').select('id,client_id,starts_at,service_name,status').gte('starts_at',new Date().toISOString()).eq('status','scheduled').order('starts_at',{ascending:true}).limit(8),
    db.from('clients').select('id,full_name').limit(500)
  ]);
  results.forEach(r=>{if(r.error)throw r.error;});
  ['stat-clients','stat-appointments','stat-today','stat-pending'].forEach((id,i)=>$(id).textContent=(results[i].count??0).toLocaleString('th-TH'));
  const names=Object.fromEntries((results[5].data||[]).map(c=>[c.id,c.full_name]));
  const upcoming=results[4].data||[];
  $('upcoming').innerHTML=upcoming.length?'<div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ลูกค้า</th><th>บริการ</th></tr></thead><tbody>'+upcoming.map(a=>'<tr><td>'+esc(dateLabel(a.starts_at))+'</td><td>'+esc(names[a.client_id]||'ลูกค้า')+'</td><td>'+esc(a.service_name)+'</td></tr>').join('')+'</tbody></table></div>':'<div class="inline-empty">ไม่มีนัดหมายที่กำลังจะมาถึง</div>';
}
async function loadStaff(){
  staff=await getAll('staff_profiles','user_id,display_name,role,active','display_name',true);
  $('staff-table').innerHTML=staff.map(s=>'<tr><td>'+esc(s.display_name)+'</td><td>'+esc(roleName[s.role]||s.role)+'</td><td>'+ (s.active?'ใช้งาน':'ปิดใช้งาน') +'</td></tr>').join('');
}
function openEditor(mode,item){
  if(!canWrite())return;
  formMode={mode,id:item?.id||null};
  const isClient=mode==='client';
  $('editor-title').textContent=(item?'แก้ไข':'เพิ่ม')+(isClient?'ลูกค้า':'นัดหมาย');
  const clientOpts=clients.map(c=>'<option value="'+esc(c.id)+'" '+(item?.client_id===c.id?'selected':'')+'>'+esc(c.full_name)+'</option>').join('');
  const doctorOpts=doctors.map(d=>'<option value="'+esc(d.user_id)+'" '+(item?.doctor_user_id===d.user_id?'selected':'')+'>'+esc(d.display_name)+'</option>').join('');
  const localTime=item?.starts_at?new Date(new Date(item.starts_at).getTime()+7*3600000).toISOString().slice(0,16):new Date(Date.now()+8*3600000).toISOString().slice(0,16);
  $('editor-fields').innerHTML=isClient?
    '<label>ชื่อ-นามสกุล<input name="full_name" maxlength="200" minlength="2" required value="'+esc(item?.full_name||'')+'"></label><label>เบอร์โทรศัพท์<input type="tel" maxlength="30" name="phone" value="'+esc(item?.phone||'')+'"></label>':
    '<label>ลูกค้า<select required name="client_id"><option value="">เลือกลูกค้า</option>'+clientOpts+'</select></label><label>วันและเวลา (ประเทศไทย)<input required type="datetime-local" name="starts_at" value="'+esc(localTime)+'"></label><label>ชื่อบริการ<input required minlength="2" maxlength="120" name="service_name" value="'+esc(item?.service_name||'')+'"></label><label>แพทย์<select name="doctor_user_id"><option value="">ยังไม่ระบุ</option>'+doctorOpts+'</select></label><label>สถานะ<select name="status">'+Object.keys(statusName).map(s=>'<option value="'+s+'" '+((item?.status||'scheduled')===s?'selected':'')+'>'+statusName[s]+'</option>').join('')+'</select></label><p class="form-hint">ใช้ข้อมูลนัดหมายทั่วไปเท่านั้น ห้ามกรอกเวชระเบียนหรือข้อมูลสุขภาพอ่อนไหวในช่องชื่อบริการ</p>';
  $('editor').showModal();
}
async function saveEditor(e){
  e.preventDefault();if(!formMode||!canWrite())return;
  const b=$('save-editor');b.disabled=true;
  const f=new FormData($('editor-form'));const isClient=formMode.mode==='client';
  try{
    const row=isClient?{full_name:String(f.get('full_name')||'').trim(),phone:String(f.get('phone')||'').trim()}:
      {client_id:String(f.get('client_id')),doctor_user_id:String(f.get('doctor_user_id')||'')||null,service_name:String(f.get('service_name')||'').trim(),status:String(f.get('status')),starts_at:new Date(String(f.get('starts_at'))+':00+07:00').toISOString()};
    if(isClient&&row.full_name.length<2)throw Error('กรุณาระบุชื่ออย่างน้อย 2 ตัวอักษร');
    if(!isClient&&(!row.client_id||row.service_name.length<2))throw Error('กรุณากรอกข้อมูลนัดหมายให้ครบ');
    const table=isClient?'clients':'appointments';
    const q=formMode.id?db.from(table).update({...row,updated_at:new Date().toISOString()}).eq('id',formMode.id):db.from(table).insert(row);
    const {error}=await q.select('id').single();if(error)throw error;
    $('editor').close();formMode=null;await navigate(isClient?'clients':'appointments');alertUser('บันทึกข้อมูลสำเร็จ',true);
  }catch(error){formError(error);}finally{b.disabled=false;}
}
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();const button=e.target.querySelector('button[type=submit]');button.disabled=true;
  try{const f=new FormData(e.target);const {data,error}=await db.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))});if(error)throw error;await enter(data.user);}
  catch(error){alert('เข้าสู่ระบบไม่สำเร็จ: '+(error?.message||'ตรวจสอบอีเมลและรหัสผ่าน'));}
  finally{button.disabled=false;}
});
$('logout').onclick=async()=>{await db.auth.signOut();showAuth();};
$('menu-toggle').onclick=()=>$('sidebar').classList.toggle('open');
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
document.querySelectorAll('[data-goto]').forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
$('refresh-dashboard').onclick=()=>navigate('dashboard');
$('reload-clients').onclick=()=>navigate('clients');
$('reload-appointments').onclick=()=>navigate('appointments');
$('search-clients').oninput=renderClients;
$('date-filter').onchange=renderAppointments;
$('status-filter').onchange=renderAppointments;
$('clear-filters').onclick=()=>{$('date-filter').value='';$('status-filter').value='';renderAppointments();};
$('add-client').onclick=()=>openEditor('client');
$('add-appointment').onclick=async()=>{try{await Promise.all([loadClients(),loadDoctors()]);if(!clients.length){alertUser('กรุณาเพิ่มลูกค้าก่อนสร้างนัดหมาย');return;}openEditor('appointment');}catch(e){formError(e);}};
$('clients-table').addEventListener('click',e=>{const id=e.target.closest('[data-edit-client]')?.dataset.editClient;if(id)openEditor('client',clients.find(c=>c.id===id));});
$('appointments-table').addEventListener('click',e=>{const id=e.target.closest('[data-edit-appointment]')?.dataset.editAppointment;if(id)openEditor('appointment',appointments.find(a=>a.id===id));});
$('close-editor').onclick=()=>$('editor').close();
$('cancel-editor').onclick=()=>$('editor').close();
$('editor-form').onsubmit=saveEditor;
boot().catch(error=>{console.error(error);resetViews();setVisible('setup',true);});
