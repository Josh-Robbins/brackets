// Minimal SSE helper for <Subscribe to="channel">...
(function(){
  function sub(channel, cb){
    var es = new EventSource('/bx/sse?to=' + encodeURIComponent(channel));
    es.onmessage = function(ev){ cb(ev.data); };
    return function(){ es.close(); };
  }
  window.BrxSSE = { sub: sub };
})();
