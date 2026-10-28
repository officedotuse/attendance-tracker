/* Attendance Tracker — readable Supabase frontend. No local employee data is published. */
'use strict';
const $ = id => document.getElementById(id);
const CODES = ['P','A','WO','H','M','NS','L','EL','HD','CO','RH'];
const LABELS = {P:'Present',A:'Absent',WO:'Weekly Off',H:'Holiday',M:'Sickness',NS:'No Show',L:'Leave',EL:'Earned Leave',HD:'Half Day',CO:'Comp Off',RH:'Restricted Holiday'};
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateISO = (y,m,d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
const monthLabel = (m,style='long') => new Date(2026,m,1).toLocaleString('en',{month:style});
let db, session=null, isAdmin=false, employees=[], attendance=[], exclusions=[];
let year=2026, month=9, saving=false;
const statusByDate = new Map();
function notify(message='',error=false){$('notice').textContent=message;$('notice').className=error?'error':'ok';if(error)console.error(message);}
function authError(message=''){$('autherr').textContent=message;if(message)console.warn('Sign-in:',message);}
function employeeFor(name){return employees.find(e=>e.name===name);}
// An empty last_working_date means the employee is still employed.
// Existing employees may have an unknown joining date until an admin enters it.
function employedOn(name,date){
 const employee=employeeFor(name);
 return Boolean(employee && (!employee.joining_date || date>=employee.joining_date) &&
   (!employee.last_working_date || date<=employee.last_working_date));
}
function employmentOverlaps(name,start,end){
 const employee=employeeFor(name);
 return Boolean(employee && (!employee.joining_date || employee.joining_date<=end) &&
   (!employee.last_working_date || employee.last_working_date>=start));
}
function excluded(name,date){return exclusions.some(e=>e.employee===name&&e.start_date<=date&&(!e.end_date||date<=e.end_date));}
function getStatus(name,date){return statusByDate.get(`${name}\u0000${date}`)||'';}
function setStatus(name,date,status){const key=`${name}\u0000${date}`;if(status)statusByDate.set(key,status);else statusByDate.delete(key);}
function signedOut(){session=null;isAdmin=false;employees=[];attendance=[];exclusions=[];statusByDate.clear();$('appcontent').hidden=true;$('loginrequired').hidden=false;$('login').hidden=false;$('logout').hidden=true;$('useremail').textContent='';$('changePassword').hidden=true;$('adminPasswords').hidden=true;}
function signedIn(){ $('appcontent').hidden=false;$('loginrequired').hidden=true;$('login').hidden=true;$('logout').hidden=false;$('useremail').textContent=session.user.email||'';$('changePassword').hidden=false;$('adminPasswords').hidden=!isAdmin; $('add').hidden=!isAdmin;$('manage').hidden=!isAdmin;$('employment').hidden=!isAdmin;$('mode').textContent=isAdmin?'Admin · Editing enabled':'Read-only view'; }
function setup(){
 for(let m=0;m<12;m++)$('month').add(new Option(monthLabel(m),m));$('month').value=month;
 for(let y=2024;y<=2035;y++)$('year').add(new Option(String(y),y));$('year').value=year;
 for(const id of ['month','year','view','search'])$(id).addEventListener(id==='search'?'input':'change',render);
 $('login').onclick=$('openlogin').onclick=()=>{authError();$('auth').showModal();};
 $('cancelLogin').onclick=()=>$('auth').close();
 $('loginform').onsubmit=signIn;
 $('logout').onclick=signOut;
 $('csv').onclick=()=>download(false);$('xlsx').onclick=()=>download(true);
 $('add').onclick=addEmployee;
 $('manage').onclick=openExclusions;
 $('employment').onclick=openEmployment;
 $('closeEmployment').onclick=()=>$('employmentDialog').close();
 $('employmentForm').onsubmit=saveEmployment;
 $('empEmployee').onchange=fillEmployment;
 $('showExcluded').onchange=render;
 $('closeExclusions').onclick=()=>$('exclusionDialog').close();
 $('exclusionForm').onsubmit=saveExclusion;
 setupPasswordControls();
 $('exType').onchange=()=>{ $('exDate').value=$('exType').value==='year'?`${year}-01-01`:dateISO(year,month,1);};
}
async function signIn(event){
 event.preventDefault();authError();
 if(!db){authError('Supabase connection not initialized. Check config.js and browser Console.');return;}
 const email=$('email').value.trim(),password=$('password').value;
 if(!email||!password){authError('Enter your email and password.');return;}
 const button=$('signin');button.disabled=true;button.textContent='Signing in…';
 try{
  const {data,error}=await db.auth.signInWithPassword({email,password});
  if(error)throw error;if(!data.session)throw Error('Supabase did not return a session.');
  $('password').value='';$('auth').close();await loadRemote();
 }catch(error){authError(error.message||'Sign-in failed.');}
 finally{button.disabled=false;button.textContent='Sign in';}
}
async function signOut(){try{const {error}=await db.auth.signOut();if(error)throw error;signedOut();notify();}catch(e){notify('Sign-out failed: '+e.message,true);}}
async function loadRemote(){
 notify();
 try{
  const {data,error}=await db.auth.getSession();if(error)throw error;
  session=data.session;if(!session){signedOut();return;}
  $('appcontent').hidden=true;
  const [er,ar,xr,rr]=await Promise.all([
   db.from('employees').select('name,active,joining_date,last_working_date').order('name'),
   db.from('attendance').select('employee,date,status'),
   db.from('employee_exclusions').select('id,employee,start_date,end_date,reason').order('start_date',{ascending:false}),
   db.rpc('is_admin')
  ]);
  for(const r of [er,ar,xr,rr])if(r.error)throw r.error;
  employees=er.data||[];attendance=ar.data||[];exclusions=xr.data||[];isAdmin=rr.data===true;
  statusByDate.clear();for(const entry of attendance)setStatus(entry.employee,entry.date,entry.status);
  signedIn();render();
 }catch(e){$('appcontent').hidden=true;notify('Database loading failed: '+e.message+'. Check schema.sql, RLS policies and browser Console.',true);$('loginrequired').hidden=false;$('loginnotice').textContent='Signed in, but the database could not load. '+e.message;}
}
// Hide a row only when the employee is excluded for EVERY day of the selected period.
// A partial exclusion keeps the employee visible so earlier attendance remains accessible.
function fullyExcludedForPeriod(name, monthly) {
 const start = monthly ? dateISO(year, month, 1) : `${year}-01-01`;
 const end = monthly
  ? dateISO(year, month, new Date(year, month + 1, 0).getDate())
  : `${year}-12-31`;
 const ranges = exclusions
  .filter(e => e.employee === name && e.start_date <= end && (!e.end_date || e.end_date >= start))
  .map(e => ({start: e.start_date > start ? e.start_date : start,
              end: e.end_date && e.end_date < end ? e.end_date : end}))
  .sort((a,b) => a.start.localeCompare(b.start));
 if (!ranges.length) return false;
 let coveredUntil = null;
 for (const range of ranges) {
  const nextDay = coveredUntil ? nextISO(coveredUntil) : start;
  if (range.start > nextDay) return false;
  if (!coveredUntil || range.end > coveredUntil) coveredUntil = range.end;
  if (coveredUntil >= end) return true;
 }
 return false;
}
function nextISO(date) {
 const d = new Date(`${date}T12:00:00Z`);
 d.setUTCDate(d.getUTCDate() + 1);
 return d.toISOString().slice(0,10);
}
function visibleNames(monthly) {
 const search = $('search').value.trim().toLowerCase();
 const first = monthly ? dateISO(year,month,1) : `${year}-01-01`;
 const last = monthly ? dateISO(year,month,new Date(year,month+1,0).getDate()) : `${year}-12-31`;
 const showExcluded = $('showExcluded').checked;
 return employees.filter(e =>
  e.name.toLowerCase().includes(search) &&
  (e.active || attendance.some(a => a.employee === e.name && a.date >= first && a.date <= last)) &&
  employmentOverlaps(e.name,first,last) &&
  (showExcluded || !fullyExcludedForPeriod(e.name, monthly))
 ).map(e => e.name);
}
function view(){year=Number($('year').value);month=Number($('month').value);const monthly=$('view').value==='month';
 const dates=monthly?Array.from({length:new Date(year,month+1,0).getDate()},(_,i)=>dateISO(year,month,i+1)):
 Array.from({length:12},(_,i)=>i);
 return {monthly,dates,names:visibleNames(monthly)};
}
function within(name,date){return employedOn(name,date)&&!excluded(name,date);}
function statsFor(names,monthly){
 const start=monthly?`${year}-${String(month+1).padStart(2,'0')}-01`:`${year}-01-01`;
 const end=monthly?dateISO(year,month,new Date(year,month+1,0).getDate()):`${year}-12-31`;
 const records=attendance.filter(a=>names.includes(a.employee)&&a.date>=start&&a.date<=end&&within(a.employee,a.date));
 const count=c=>records.filter(a=>a.status===c).length;
 return [['Employees',names.length],['Present days',count('P')],['Leave days',count('L')+count('EL')],['Absent / no-show',count('A')+count('NS')]];
}
function render(){
 if(!session||$('appcontent').hidden)return;
 const {monthly,dates,names}=view();$('month').hidden=!monthly;
 $('stats').innerHTML=statsFor(names,monthly).map(([label,n])=>`<div class="stat"><span>${label}</span><b>${n}</b></div>`).join('');
 const heads=dates.map(d=>`<th>${monthly?Number(d.slice(-2)):monthLabel(d,'short')}</th>`).join('');
 let html=`<thead><tr><th>Employee</th>${heads}<th>P</th><th>Leave</th>${isAdmin?'<th>Manage</th>':''}</tr></thead><tbody>`;
 for(const name of names){
  let present=0,leave=0;
  const cells=dates.map(d=>{
   if(monthly){
    if(!employedOn(name,d))return '<td class="excluded" title="Outside employment period">—</td>';
    if(excluded(name,d))return '<td class="excluded" title="Employee excluded for this date">—</td>';
    const status=getStatus(name,d);if(status==='P')present++;if(['L','EL'].includes(status))leave++;
    if(isAdmin){const options=CODES.map(c=>`<option value="${c}" ${c===status?'selected':''}>${c}</option>`).join('');
     return `<td><select class="status-${escapeHTML(status)}" data-name="${escapeHTML(name)}" data-date="${d}" data-original="${escapeHTML(status)}"><option value="">—</option>${options}</select></td>`;}
    return `<td>${status?`<span class="pill ${escapeHTML(status)}" title="${escapeHTML(LABELS[status]||status)}">${escapeHTML(status)}</span>`:'·'}</td>`;
   }
   const prefix=`${year}-${String(d+1).padStart(2,'0')}-`;
   const items=attendance.filter(a=>a.employee===name&&a.date.startsWith(prefix)&&within(name,a.date));
   const p=items.filter(a=>a.status==='P').length,l=items.filter(a=>['L','EL'].includes(a.status)).length;
   present+=p;leave+=l;return `<td><b>${p}</b><small class="muted"> / ${l} L</small></td>`;
  }).join('');
  const employee=employees.find(e=>e.name===name);
  html+=`<tr><td><b>${escapeHTML(name)}</b></td>${cells}<td>${present}</td><td>${leave}</td>`;
  if(isAdmin)html+=`<td><button data-employment="${escapeHTML(name)}">Dates</button> <button data-toggle="${escapeHTML(name)}">${employee.active?'Archive':'Restore'}</button> <button data-exclude="${escapeHTML(name)}">Exclude</button></td>`;
  html+='</tr>';
 }
 $('table').innerHTML=html+'</tbody>';
 $('legend').innerHTML=CODES.map(c=>`<span><b class="pill ${c}">${c}</b> ${LABELS[c]}</span>`).join('')+'<span><b class="pill X">—</b> Excluded / Not employed</span>';
 document.querySelectorAll('[data-name]').forEach(el=>el.onchange=()=>updateAttendance(el));
 document.querySelectorAll('[data-employment]').forEach(el=>el.onclick=()=>openEmployment(el.dataset.employment));
 document.querySelectorAll('[data-toggle]').forEach(el=>el.onclick=()=>toggleEmployee(el.dataset.toggle));
 document.querySelectorAll('[data-exclude]').forEach(el=>el.onclick=()=>openExclusions(el.dataset.exclude));
}
async function updateAttendance(select){
 if(!isAdmin||saving)return;
 const {name,date}=select.dataset,status=select.value,old=select.dataset.original;
 if(!within(name,date)){notify('Date is outside employment period or excluded.',true);select.value=old;return;}
 saving=true;select.disabled=true;notify(`Saving ${name} on ${date}…`);
 try{
  const result=status?await db.from('attendance').upsert({employee:name,date,status},{onConflict:'employee,date'}):
   await db.from('attendance').delete().eq('employee',name).eq('date',date);
  if(result.error)throw result.error;
  setStatus(name,date,status);
  attendance=attendance.filter(a=>!(a.employee===name&&a.date===date));
  if(status)attendance.push({employee:name,date,status});
  render();notify(`Saved successfully: ${name} · ${date} · ${status||'Blank'}`);
 }catch(e){select.value=old;notify('NOT SAVED: '+e.message+'. Check administrator RLS policies in schema.sql.',true);alert('Attendance was not saved: '+e.message);}
 finally{saving=false;select.disabled=false;}
}
async function addEmployee(){
 if(!isAdmin)return;const name=prompt('New employee full name:')?.trim();if(!name)return;
 const joining_date=prompt('Joining date (YYYY-MM-DD), required for new employees:')?.trim();
 if(!joining_date||!validISO(joining_date)){notify('Enter a valid joining date in YYYY-MM-DD format.',true);return;}
 const {error}=await db.from('employees').insert({name,active:true,joining_date,last_working_date:null});
 if(error)notify('Employee not added: '+error.message,true);else{await loadRemote();notify('Employee added: '+name);}
}
async function toggleEmployee(name){
 if(!isAdmin)return;const e=employees.find(x=>x.name===name);if(!e)return;
 if(!confirm(`${e.active?'Archive':'Restore'} ${name}? Attendance history is retained.`))return;
 const {error}=await db.from('employees').update({active:!e.active}).eq('name',name);
 if(error)notify('Employee update failed: '+error.message,true);else{await loadRemote();notify(`${name} ${e.active?'archived':'restored'}.`);}
}
function validISO(value){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
function openEmployment(name){
 if(!isAdmin)return;
 $('empEmployee').innerHTML=employees.map(e=>`<option value="${escapeHTML(e.name)}">${escapeHTML(e.name)}</option>`).join('');
 if(typeof name==='string')$('empEmployee').value=name;
 $('empError').textContent='';fillEmployment();$('employmentDialog').showModal();
}
function fillEmployment(){
 const e=employeeFor($('empEmployee').value);
 $('empJoin').value=e?.joining_date||'';
 $('empLeave').value=e?.last_working_date||'';
 $('empError').textContent='';
}
async function saveEmployment(event){
 event.preventDefault();if(!isAdmin)return;
 const name=$('empEmployee').value,joining_date=$('empJoin').value||null;
 const last_working_date=$('empLeave').value||null;
 if(joining_date&&!validISO(joining_date)){ $('empError').textContent='Invalid joining date.';return;}
 if(last_working_date&&!validISO(last_working_date)){ $('empError').textContent='Invalid last working date.';return;}
 if(joining_date&&last_working_date&&last_working_date<joining_date){
  $('empError').textContent='Last working date cannot precede joining date.';return;
 }
 const button=$('saveEmployment');button.disabled=true;$('empError').textContent='Saving…';
 try{
  const {data,error}=await db.from('employees')
   .update({joining_date,last_working_date}).eq('name',name)
   .select('name,joining_date,last_working_date').single();
  if(error)throw error;
  const e=employeeFor(name);Object.assign(e,data);
  render();$('empError').textContent='Saved successfully.';
  notify(`Employment dates saved for ${name}. Last working date: ${last_working_date||'Not specified (currently employed)'}.`);
 }catch(error){$('empError').textContent='NOT SAVED: '+error.message;notify('Employment dates not saved: '+error.message,true);}
 finally{button.disabled=false;}
}
function openExclusions(name){
 if(!isAdmin)return;
 $('exEmployee').innerHTML=employees.map(e=>`<option value="${escapeHTML(e.name)}">${escapeHTML(e.name)}</option>`).join('');
 if(typeof name==='string')$('exEmployee').value=name;
 $('exDate').value=dateISO(year,month,1);$('exType').value='from';$('exReason').value='';$('exError').textContent='';
 showExclusionList();$('exclusionDialog').showModal();
}
function showExclusionList(){
 const name=$('exEmployee').value;
 const rows=exclusions.filter(e=>e.employee===name);
 $('exList').innerHTML=rows.length?rows.map(e=>`<div class="exrow"><span>${escapeHTML(e.start_date)} → ${escapeHTML(e.end_date||'Onward')}<br><span class="muted">${escapeHTML(e.reason||'No reason')}</span></span><button type="button" data-remove-ex="${e.id}">Remove</button></div>`).join(''):'<p class="muted">No exclusions for this employee.</p>';
 document.querySelectorAll('[data-remove-ex]').forEach(b=>b.onclick=()=>removeExclusion(Number(b.dataset.removeEx)));
}
async function saveExclusion(event){
 event.preventDefault();if(!isAdmin)return;
 const employee=$('exEmployee').value,kind=$('exType').value,input=$('exDate').value;
 if(!employee||!input)return;
 let start=input,end=null;
 if(kind==='month'){start=input.slice(0,7)+'-01';const [y,m]=start.split('-').map(Number);end=dateISO(y,m-1,new Date(y,m,0).getDate());}
 if(kind==='year'){start=input.slice(0,4)+'-01-01';end=input.slice(0,4)+'-12-31';}
 if(kind==='day')end=input;
 const button=$('saveExclusion');button.disabled=true;$('exError').textContent='Saving…';
 try{
  const {error}=await db.from('employee_exclusions').insert({employee,start_date:start,end_date:end,reason:$('exReason').value.trim()});
  if(error)throw error;
  const {data, error:readError}=await db.from('employee_exclusions').select('id,employee,start_date,end_date,reason').order('start_date',{ascending:false});
  if(readError)throw readError;
  exclusions=data||[];render();showExclusionList();$('exError').textContent='';notify(`Exclusion saved for ${employee}: ${start} → ${end||'onward'}.`);
 }catch(e){$('exError').textContent='NOT SAVED: '+e.message;notify('Exclusion save failed: '+e.message,true);}
 finally{button.disabled=false;}
}
async function removeExclusion(id){
 if(!isAdmin||!confirm('Remove this exclusion? Existing attendance records will become visible again.'))return;
 const {error}=await db.from('employee_exclusions').delete().eq('id',id);
 if(error){$('exError').textContent='Removal failed: '+error.message;return;}
 exclusions=exclusions.filter(e=>e.id!==id);render();showExclusionList();notify('Exclusion removed.');
}
function exportRows(){
 const {monthly,dates,names}=view(),rows=[];
 if(monthly){rows.push(['Employee',...dates.map(d=>d.slice(-2)),'Present','Leave']);
  for(const name of names){const statuses=dates.map(d=>!employedOn(name,d)?'NE':excluded(name,d)?'EX':getStatus(name,d));rows.push([name,...statuses,statuses.filter(x=>x==='P').length,statuses.filter(x=>['L','EL'].includes(x)).length]);}
 }else{rows.push(['Employee',...dates.map(m=>monthLabel(m,'short')+' P'),'Total Present','Total Leave']);
  for(const name of names){let p=0,l=0;const months=dates.map(m=>{const prefix=`${year}-${String(m+1).padStart(2,'0')}-`;const entries=attendance.filter(a=>a.employee===name&&a.date.startsWith(prefix)&&within(name,a.date));const count=entries.filter(a=>a.status==='P').length;p+=count;l+=entries.filter(a=>['L','EL'].includes(a.status)).length;return count;});rows.push([name,...months,p,l]);}
 }return rows;
}
function download(excel){
 if(!session)return;const rows=exportRows(),file=`attendance-${year}-${$('view').value==='month'?String(month+1).padStart(2,'0'):'year'}`;
 if(excel){if(typeof XLSX==='undefined'){notify('Excel library did not load. Use CSV.',true);return;}const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'Attendance');XLSX.writeFile(wb,file+'.xlsx');return;}
 const safe=v=>{let s=String(v??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
 const csv='\ufeff'+rows.map(row=>row.map(safe).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=file+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}

// PASSWORD MANAGEMENT: only the Edge Function can perform privileged resets.
let recoveryMode = false;
function passwordMessage(id, message, error = false) {
 const node = $(id); node.textContent = message;
 node.style.color = error ? '#b73540' : '#18834c';
}
function setupPasswordControls() {
 $('changePassword').onclick = () => openPasswordDialog(false);
 $('adminPasswords').onclick = openAdminPasswordDialog;
 $('openForgot').onclick = $('forgotFromLogin').onclick = openForgotDialog;
 $('closeForgot').onclick = () => $('forgotDialog').close();
 $('forgotForm').onsubmit = sendResetEmail;
 $('closePassword').onclick = () => { if (!recoveryMode) $('passwordDialog').close(); };
 $('passwordForm').onsubmit = updateOwnPassword;
 $('closeAdminPasswords').onclick = () => $('adminPasswordDialog').close();
 $('adminPasswordForm').onsubmit = resetOtherPassword;
}
function openForgotDialog() {
 if ($('auth').open) $('auth').close();
 $('forgotEmail').value = $('email').value.trim();
 passwordMessage('forgotMessage', '');
 $('forgotDialog').showModal();
}
async function sendResetEmail(event) {
 event.preventDefault();
 const button = $('sendReset'); button.disabled = true;
 passwordMessage('forgotMessage', '');
 try {
  if (!db) throw Error('Supabase is not initialized.');
  const redirectTo = location.origin + location.pathname;
  const {error} = await db.auth.resetPasswordForEmail($('forgotEmail').value.trim(), {redirectTo});
  if (error) throw error;
  passwordMessage('forgotMessage', 'If this account exists, a reset email will arrive shortly. Check spam as well.');
 } catch (error) {passwordMessage('forgotMessage', error.message, true);}
 finally {button.disabled = false;}
}
function openPasswordDialog(recovery = false) {
 recoveryMode = recovery;
 $('passwordTitle').textContent = recovery ? 'Set a new password' : 'Change password';
 $('passwordHelp').textContent = recovery ? 'Enter a new password to complete account recovery.' : 'Verify your current password, then choose a new password.';
 $('currentPasswordLabel').hidden = recovery;
 $('currentPassword').required = !recovery;
 $('currentPassword').value = '';
 $('newPassword').value = '';
 $('confirmPassword').value = '';
 $('closePassword').hidden = recovery;
 passwordMessage('passwordMessage', '');
 if (!$('passwordDialog').open) $('passwordDialog').showModal();
}
async function updateOwnPassword(event) {
 event.preventDefault();
 const button = $('savePassword'); button.disabled = true;
 passwordMessage('passwordMessage', '');
 try {
  if (!db) throw Error('Supabase is not connected.');
  const password = $('newPassword').value;
  if (password.length < 12) throw Error('Use at least 12 characters.');
  if (password !== $('confirmPassword').value) throw Error('New passwords do not match.');
  if (!recoveryMode) {
   const email = session?.user?.email;
   if (!email) throw Error('Please sign in again.');
   // Verify current password without replacing the existing browser session.
   const verifier = supabase.createClient(window.APP_CONFIG.supabaseUrl, window.APP_CONFIG.supabaseAnonKey,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
   const {error:verifyError} = await verifier.auth.signInWithPassword({email,password:$('currentPassword').value});
   if (verifyError) throw Error('Current password is incorrect or reauthentication is required.');
   await verifier.auth.signOut();
  }
  const {error} = await db.auth.updateUser({password});
  if (error) throw error;
  passwordMessage('passwordMessage', 'Password updated successfully.');
  recoveryMode = false;
  $('closePassword').hidden = false;
  $('newPassword').value = $('confirmPassword').value = $('currentPassword').value = '';
 } catch (error) {passwordMessage('passwordMessage', error.message, true);}
 finally {button.disabled = false;}
}
async function openAdminPasswordDialog() {
 if (!isAdmin) return;
 passwordMessage('adminPasswordMessage', '');
 $('passwordUser').innerHTML = '<option value="">Loading users…</option>';
 $('adminPasswordDialog').showModal();
 try {
  const {data,error} = await db.functions.invoke('admin-passwords', {body:{action:'list'}});
  if (error) throw error;
  if (data?.error) throw Error(data.error);
  $('passwordUser').innerHTML = '<option value="">Select user</option>' + data.users.map(user =>
   `<option value="${escapeHTML(user.id)}">${escapeHTML(user.email || user.id)}</option>`).join('');
 } catch (error) {passwordMessage('adminPasswordMessage', 'Could not load users: '+error.message, true);}
}
async function resetOtherPassword(event) {
 event.preventDefault();
 const button = $('adminSavePassword'); button.disabled = true;
 passwordMessage('adminPasswordMessage', '');
 try {
  if (!isAdmin) throw Error('Administrator permission required.');
  const userId = $('passwordUser').value;
  const password = $('adminNewPassword').value;
  if (!userId) throw Error('Select a user.');
  if (password.length < 12) throw Error('Use at least 12 characters.');
  if (password !== $('adminConfirmPassword').value) throw Error('Passwords do not match.');
  if (!confirm('Reset the password for the selected user?')) return;
  const {data,error} = await db.functions.invoke('admin-passwords',
   {body:{action:'reset',userId,password}});
  if (error) throw error;
  if (data?.error) throw Error(data.error);
  $('adminNewPassword').value = $('adminConfirmPassword').value = '';
  passwordMessage('adminPasswordMessage', 'Password reset successfully. Tell the user securely.');
 } catch (error) {passwordMessage('adminPasswordMessage', error.message, true);}
 finally {button.disabled = false;}
}
function registerPasswordRecoveryListener() {
 db.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
   // Delay UI work until the Supabase callback completes.
   setTimeout(() => openPasswordDialog(true), 0);
  }
 });
}
async function start(){
 try{
  setup();signedOut();$('exEmployee').onchange=showExclusionList;
  if(!window.APP_CONFIG?.supabaseUrl||!window.APP_CONFIG?.supabaseAnonKey){$('loginnotice').textContent='Supabase config.js is missing or invalid.';return;}
  if(!window.supabase?.createClient){$('loginnotice').textContent='Supabase JavaScript library failed to load. Check browser Console.';return;}
  db=window.supabase.createClient(window.APP_CONFIG.supabaseUrl,window.APP_CONFIG.supabaseAnonKey);
  registerPasswordRecoveryListener();
  await loadRemote();
 }catch(e){console.error('Startup failure',e);$('loginnotice').textContent='Startup error: '+e.message;}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
