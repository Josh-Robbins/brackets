// brackets.js: handles { brx: {...}, html } envelopes + OOB swaps with htmx
(function(){
  function fx(env){
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
      if(ct.includes('application/json')){
        var body = JSON.parse(xhr.responseText||'{}');
        if(body.brx) fx(body.brx);
        if(body.html){
          var tpl = document.createElement('template'); tpl.innerHTML = body.html;
          tpl.content.querySelectorAll('[hx-swap-oob]').forEach(function(n){
            if(n.id){ var t = document.getElementById(n.id); if(t) t.replaceWith(n); }
          });
        }
        e.preventDefault();
      }
    } catch(err){ console.warn('brackets.js', err); }
  });
})();