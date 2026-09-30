/* Shared by the landing page and the app: shortcut download + install prompt */
(function(){
  var C = window.CONFIG;
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); deferred = e; document.dispatchEvent(new Event('sy-installable')); });

  function appUrl(){
    if (C.APP_URL) return C.APP_URL;
    var base = location.href.split(/[?#]/)[0];
    if (/app\.html$/.test(base)) return base;
    return base.replace(/index\.html$/, '').replace(/\/?$/, '/') + 'app.html';
  }
  function platform(){
    var u = navigator.userAgent;
    if (/Windows/i.test(u)) return 'win';
    if (/Macintosh|Mac OS X/i.test(u) && !/Mobile/i.test(u)) return 'mac';
    if (/Android/i.test(u)) return 'android';
    if (/iPhone|iPad|iPod/i.test(u)) return 'ios';
    return 'linux';
  }
  function save(name, text, type){
    var b = new Blob([text], {type: type || 'text/plain'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  }
  function downloadShortcut(){
    var url = appUrl(), name = C.APP_NAME, p = platform();
    if (p === 'mac') {
      save(name + '.webloc', '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>' + url + '</string></dict></plist>', 'application/xml');
    } else if (p === 'linux') {
      save(name + '.desktop', '[Desktop Entry]\nType=Link\nName=' + name + '\nURL=' + url + '\nIcon=text-html\n');
    } else {
      save(name + '.url', '[InternetShortcut]\r\nURL=' + url + '\r\n');
    }
    return p;
  }
  function exe(){
    if (!C.INSTALLER_URL) return false;
    var a = document.createElement('a');
    a.href = C.INSTALLER_URL; a.download = 'Installer Studyly.exe'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    return true;
  }
  function install(){
    if (!deferred) return Promise.resolve(false);
    deferred.prompt();
    return deferred.userChoice.then(function(c){ deferred = null; return c.outcome === 'accepted'; });
  }
  window.Shortcut = { url: appUrl, platform: platform, download: downloadShortcut, exe: exe, install: install, canInstall: function(){ return !!deferred; } };

  // Apply app name everywhere
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('[data-name]').forEach(function(el){ el.textContent = C.APP_NAME; });
    document.title = document.title.replace('{name}', C.APP_NAME);
    document.querySelectorAll('[data-icon]').forEach(function(el){ el.innerHTML = window.ic(el.dataset.icon, +el.dataset.size || 20); });
  });
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register(appUrl().replace(/app\.html$/, '') + 'sw.js').catch(function(){});
  }
})();
