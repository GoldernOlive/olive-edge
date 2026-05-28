// Olive Edge — Shared Nav
// Add to any page: <div id="nav-placeholder"></div> then <script src="js/nav.js"></script>
(function(){
  var token=localStorage.getItem('oe_token')||'';
  var email=localStorage.getItem('oe_email')||'';
  if(!token){window.location.href='index.html';return;}

  var page=window.location.pathname.split('/').pop()||'';
  function active(p){return page===p?' active':'';}

  var html='<nav class="nav">'
    +'<div class="nav-inner">'
    +'<a href="search.html" class="nav-logo" style="text-decoration:none"><span class="sub">Golden Olive</span><span class="main">Olive <span>Edge</span></span></a>'
    +'<div class="nav-links">'
    +'<a href="search.html" class="nav-link'+active('search.html')+'">🔍 Search</a>'
    +'<a href="listing-generator.html" class="nav-link'+active('listing-generator.html')+'">✍️ Listing Writer</a>'
    +'<a href="listing-auditor.html" class="nav-link'+active('listing-auditor.html')+'">🔎 My Listings</a>'
    +'</div>'
    +'<div class="nav-user">'
    +'<span class="nav-email">'+email+'</span>'
    +'<button class="btn-ghost btn-sm" onclick="(function(){localStorage.removeItem(\'oe_token\');localStorage.removeItem(\'oe_email\');localStorage.removeItem(\'oe_uid\');window.location.href=\'index.html\';})()">Log Out</button>'
    +'</div>'
    +'</div>'
    +'</nav>';

  var el=document.getElementById('nav-placeholder');
  if(el)el.outerHTML=html;
})();
