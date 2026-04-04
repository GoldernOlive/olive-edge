// OLIVE EDGE — Shared Auth & Nav

var SUPABASE_URL = "https://oktpizrevqehfrkcqphq.supabase.co";
var SUPABASE_KEY = "sb_publishable_r4lLwwInTT76wXjP-Cha4Q_T1yALqyt";

function getSession(){
  try{return{token:localStorage.getItem('oe_token')||'',email:localStorage.getItem('oe_email')||'',userId:localStorage.getItem('oe_uid')||''};}
  catch(e){return{token:'',email:'',userId:''};}
}
function setSession(token,email,userId){
  try{localStorage.setItem('oe_token',token);localStorage.setItem('oe_email',email);localStorage.setItem('oe_uid',userId);}catch(e){}
}
function clearSession(){
  try{localStorage.removeItem('oe_token');localStorage.removeItem('oe_email');localStorage.removeItem('oe_uid');}catch(e){}
}
function requireAuth(){
  var s=getSession();
  if(!s.token){window.location.href='index.html';return false;}
  return s;
}

var NAV_ITEMS=[
  {href:'dashboard.html',label:'Dashboard'},
  {href:'opportunities.html',label:'Opportunities'},
  {href:'scanner.html',label:'Scanner'},
  {href:'trends.html',label:'Trends'},
  {href:'suppliers.html',label:'Suppliers'},
  {href:'listing-generator.html',label:'Listing Writer'},
  {href:'listing-auditor.html',label:'Auditor'},
  {href:'workspace.html',label:'Workspace'}
];

function renderNav(activePage){
  var s=getSession();
  var links='';
  for(var i=0;i<NAV_ITEMS.length;i++){
    var item=NAV_ITEMS[i];
    var active=activePage===item.href?' active':'';
    links+='<a href="'+item.href+'" class="nav-link'+active+'">'+item.label+'</a>';
  }
  var nav='<nav class="nav"><div class="nav-inner">';
  nav+='<a href="dashboard.html" class="nav-logo" style="text-decoration:none"><span class="sub">Golden Olive</span><span class="main">Olive <span>Edge</span></span></a>';
  nav+='<div class="nav-links">'+links+'</div>';
  nav+='<div class="nav-user"><span class="nav-email">'+s.email+'</span><button class="btn-ghost btn-sm" onclick="doLogout()">Log Out</button></div>';
  nav+='</div></nav>';
  return nav;
}

function doLogout(){clearSession();window.location.href='index.html';}

async function supabaseSignUp(email,password){
  var r=await fetch(SUPABASE_URL+'/auth/v1/signup',{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
    body:JSON.stringify({email:email,password:password})
  });
  var d=await r.json();
  if(!r.ok)throw new Error(d.msg||d.error_description||d.error||'Sign up failed');
  return d;
}

async function supabaseLogin(email,password){
  var r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY},
    body:JSON.stringify({email:email,password:password})
  });
  var d=await r.json();
  if(!r.ok)throw new Error(d.msg||d.error_description||d.error||'Login failed');
  return d;
}

async function dbInsert(table,row){
  var s=getSession();
  var r=await fetch(SUPABASE_URL+'/rest/v1/'+table,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+s.token,'Prefer':'return=representation'},
    body:JSON.stringify(row)
  });
  if(!r.ok){var e=await r.json();throw new Error(e.message||'Insert failed');}
  return r.json();
}

async function dbSelect(table,filters){
  var s=getSession();
  var url=SUPABASE_URL+'/rest/v1/'+table+'?select=*';
  if(filters)url+='&'+filters;
  var r=await fetch(url,{headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+s.token}});
  if(!r.ok){var e=await r.json();throw new Error(e.message||'Select failed');}
  return r.json();
}

async function dbUpdate(table,id,row){
  var s=getSession();
  var r=await fetch(SUPABASE_URL+'/rest/v1/'+table+'?id=eq.'+id,{
    method:'PATCH',
    headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':'Bearer '+s.token},
    body:JSON.stringify(row)
  });
  if(!r.ok){var e=await r.json();throw new Error(e.message||'Update failed');}
  return r.json();
}

async function dbDelete(table,id){
  var s=getSession();
  var r=await fetch(SUPABASE_URL+'/rest/v1/'+table+'?id=eq.'+id,{
    method:'DELETE',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+s.token}
  });
  if(!r.ok){var e=await r.json();throw new Error(e.message||'Delete failed');}
}

function fmt(n){return n>=1000?(n/1000).toFixed(1)+'k':String(n||0);}
function fmtPrice(p){return '£'+(p/100).toFixed(2);}
function scoreColor(s){return s>=7?'score-high':s>=5?'score-mid':'score-low';}
function demandColor(d){return d==='High'?'var(--ol)':d==='Medium'?'var(--gd)':'var(--rd)';}
function compColor(c){return c==='Low'?'var(--gn)':c==='Medium'?'var(--gd)':c==='High'?'var(--or)':'var(--rd)';}

function copyText(text,btn){
  if(navigator.clipboard){navigator.clipboard.writeText(text);}
  else{var t=document.createElement('textarea');t.value=text;document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t);}
  if(btn){var orig=btn.textContent;btn.textContent='Copied!';setTimeout(function(){btn.textContent=orig;},2000);}
}

function csvExport(rows,name){
  if(!rows.length)return;
  var h=Object.keys(rows[0]);
  var csv=[h.join(',')].concat(rows.map(function(r){return h.map(function(k){return'"'+String(r[k]||'').replace(/"/g,'""')+'"';}).join(',');})).join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=name;a.click();
}

function pbar(p,c,h){
  h=h||5;
  return '<div class="pbar" style="height:'+h+'px"><div class="pbf" style="width:'+Math.min(100,p||0)+'%;background:'+(c||'var(--gd)')+';height:'+h+'px"></div></div>';
}

function sbox(l,v,c){
  return '<div class="sbox"><div class="lbl">'+l+'</div><div class="mono" style="font-size:16px;color:'+(c||'var(--tx)')+';font-weight:600">'+(v||'--')+'</div></div>';
}

function loading(msg){
  return '<div class="loading-row"><div class="spin"></div><span>'+(msg||'Loading...')+'</span></div>';
}

function errBox(msg){
  return '<div class="card-red"><strong>Error:</strong> '+msg+'</div>';
}

function estimateMonthlySales(listing){
  var favs=listing.num_favorers||0;
  var reviews=listing.reviews_count||listing.num_reviews||0;
  var price=(listing.price&&listing.price.amount||0)/100;
  var ageMonths=12;
  if(listing.original_creation_timestamp){
    var created=new Date(listing.original_creation_timestamp*1000);
    ageMonths=Math.max(1,(Date.now()-created)/(1000*60*60*24*30));
  }
  var reviewRate=reviews>0?(reviews/ageMonths)*50:0;
  var favRate=(favs/ageMonths)/10;
  var estimate=reviews>0?(reviewRate*0.65+favRate*0.35):favRate;
  if(price>100)estimate*=0.3;
  else if(price>50)estimate*=0.5;
  else if(price>30)estimate*=0.7;
  else if(price>20)estimate*=0.85;
  else if(price<8)estimate*=1.4;
  var monthly=Math.round(Math.max(0,estimate));
  var revenue=(monthly*price).toFixed(0);
  var label,color,badge;
  if(monthly>=100){label='Best Seller';color='var(--ol)';badge='b-live';}
  else if(monthly>=30){label='Strong';color='var(--gd)';badge='b-gold';}
  else if(monthly>=10){label='Growing';color='var(--bl)';badge='b-blue';}
  else if(monthly>=3){label='Active';color='var(--mu)';badge='b-grey';}
  else{label='Early';color='var(--mu2)';badge='b-grey';}
  return{monthly:monthly,revenue:revenue,label:label,color:color,badge:badge};
}

function salesBadgeHTML(listing){
  var s=estimateMonthlySales(listing);
  return '<div style="margin-top:5px;padding:5px 8px;background:var(--p2);border-radius:6px;font-size:11px">'
    +'<span style="color:'+s.color+';font-weight:700">~'+s.monthly+' sales/mo</span>'
    +' <span style="color:var(--mu)">Est £'+s.revenue+'/mo</span>'
    +' <span class="badge '+s.badge+'" style="margin-left:4px;font-size:9px">'+s.label+'</span>'
    +'</div>';
}
