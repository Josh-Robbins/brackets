// Tiny client runtime: handles JSON envelopes + OOB swaps via HTMX.
(function(){
  function fx(env){
    if(!env) return;
    if(env.toast) document.dispatchEvent(new CustomEvent('brx:toast',{detail:env.toast}));
    if(env.redirect) location.href = env.redirect;
    if(env.navigate) history.pushState({}, '', env.navigate);
    if(env.replace) history.replaceState({}, '', env.replace);
    if(env.reload) location.reload();
  }
  document.addEventListener('htmx:afterOnLoad', function(e){
    try {
      var xhr = e.detail.xhr;
      var ct = (xhr.getResponseHeader('Content-Type')||'').toLowerCase();
      if(!ct.includes('application/json')) return;
      var body = JSON.parse(xhr.responseText||'{}');
      if(body.brx) fx(body.brx);
      if(body.html){
        var tpl = document.createElement('template'); tpl.innerHTML = body.html;
        tpl.content.querySelectorAll('[hx-swap-oob]').forEach(function(n){
          if(n.id){ var t = document.getElementById(n.id); if(t) t.replaceWith(n); }
        });
      }
      e.preventDefault();
    } catch(err){ console.warn('brackets.js', err); }
  });

  // Optional prefetch for <Link prefetch>
  document.addEventListener('mouseover', function(e){
    var a = e.target.closest('a[data-bx-prefetch="1"]');
    if(!a || a.dataset.prefetched) return;
    a.dataset.prefetched = "1";
    fetch(a.getAttribute('href'), { headers: { 'HX-Request': 'true' } }).catch(()=>{});
  });
})();
