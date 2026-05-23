(function () {
  'use strict';

  var CFG = window.LBS_CONFIG;
  var debugEl = document.getElementById('debug-log');
  var debugCount = 0;

  function debugLog(method, url, status, body) {
    debugCount++;
    var entry = document.createElement('div');
    entry.className = 'log-entry';
    var statusClass = status >= 200 && status < 300 ? 'status-ok' : 'status-err';
    entry.innerHTML =
      '<div class="meta">#' + debugCount + ' ' + new Date().toLocaleTimeString() +
      ' <span class="' + statusClass + '">HTTP ' + status + '</span></div>' +
      '<div class="url">' + method + ' ' + url + '</div>' +
      '<pre>' + (typeof body === 'string' ? body : JSON.stringify(body, null, 1)) + '</pre>';
    debugEl.appendChild(entry);
    debugEl.scrollTop = debugEl.scrollHeight;
  }

  function api(method, path, body) {
    var url = CFG.API_BASE + path;
    var headers = { 'Content-Type': 'application/json' };
    if (CFG.API_KEY) headers['X-API-Key'] = CFG.API_KEY;
    var opts = { method: method, headers: headers };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) { data = txt; }
        debugLog(method, url, r.status, data); // 修复了这里：将 path 改成了 url
        return { status: r.status, data: data };
      });
    }).catch(function (err) {
      debugLog(method, url, 0, err.toString()); // 增加了错误捕获并打印到 debug log
      return { status: 0, data: null };
    });
  }

  function apiGet(path) { return api('GET', path); }

  var map, cluster, markerList = [];
  var geoMarker, geoCircle;
  var mouseTool, radiusMarker;
  var infoWin = document.getElementById('info-window');

  window._mapInit = function () {
    map = new AMap.Map('map-container', {
      zoom: 5, center: [104.0, 35.5],
      viewMode: '2D',
    });

    cluster = new AMap.MarkerCluster(map, [], {
      gridSize: 60,
      renderMarker: function (ctx) {
        ctx.marker.setContent('<div style="width:8px;height:8px;background:#ff4d4f;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.3)"></div>');
        ctx.marker.setOffset(new AMap.Pixel(-6, -6));
      },
    });

    map.on('moveend', debounce(loadPoisByView, 300));
    map.on('zoomend', debounce(loadPoisByView, 300));

    loadPoisByView();
    initGeolocation();
    initToolbar();
    initInfoWindow();
  };

  function debounce(fn, ms) {
    var t;
    return function () { clearTimeout(t); t = setTimeout(fn, ms); };
  }

  function loadPoisByView() {
    var b = map.getBounds();
    if (!b) return;
    var sw = b.getSouthWest(), ne = b.getNorthEast();
    var params = '?minLng=' + sw.lng + '&minLat=' + sw.lat +
                 '&maxLng=' + ne.lng + '&maxLat=' + ne.lat + '&size=100';
    apiGet('/pois/search/bbox' + params).then(function (r) {
      if (r.status === 200 && r.data.code === 0) {
        renderPois(r.data.data);
      }
    });
  }

  function renderPois(list) {
    markerList = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var pos = p.location.gcj02;
      var m = new AMap.Marker({
        position: [pos.lng, pos.lat],
        extData: p,
      });
      (function (poi) {
        m.on('click', function () { showInfo(poi); });
      })(p);
      markerList.push(m);
    }
    cluster.setMarkers(markerList);
  }

  function showInfo(poi) {
    var loc = poi.location;
    var html = '<div class="close-btn" onclick="document.getElementById(\'info-window\').style.display=\'none\'">&times;</div>';
    html += '<h3>' + poi.name + '</h3>';
    if (poi.code) html += '<div class="field">编号：<b>' + poi.code + '</b></div>';
    html += '<div class="field">类别：<b>' + poi.category + '</b></div>';
    if (poi.era) html += '<div class="field">年代：<b>' + poi.era + '</b></div>';
    html += '<div class="field">批次：第<b>' + poi.batch + '</b>批</div>';
    if (poi.province) html += '<div class="field">地点：<b>' + (poi.province || '') + (poi.city ? ' ' + poi.city : '') + '</b></div>';
    if (poi.address) html += '<div class="field">地址：<b>' + poi.address + '</b></div>';
    html += '<div class="field">坐标：WGS84 <b>' + loc.wgs84.lng.toFixed(4) + ', ' + loc.wgs84.lat.toFixed(4) + '</b></div>';
    if (poi.description) html += '<div class="field">描述：<b>' + poi.description + '</b></div>';
    if (poi.has_extended) {
      html += '<div class="field">';
      if (poi.website) html += '<a href="' + poi.website + '" target="_blank">官网</a> ';
      if (poi.image_urls && poi.image_urls.length) {
        html += '</div><div class="images">';
        for (var i = 0; i < poi.image_urls.length; i++) {
          html += '<img src="' + poi.image_urls[i] + '" onerror="this.style.display=\'none\'">';
        }
        html += '</div>';
      }
    }
    infoWin.innerHTML = html;
    infoWin.style.display = 'block';
    var px = map.lngLatToContainer(new AMap.LngLat(loc.gcj02.lng, loc.gcj02.lat));
    infoWin.style.left = (px.getX() + 15) + 'px';
    infoWin.style.top = (px.getY() - 80) + 'px';
  }

  function initInfoWindow() {
    map.on('click', function () { infoWin.style.display = 'none'; });
  }

  function initGeolocation() {
    var geolocation = new AMap.Geolocation({
      enableHighAccuracy: true, timeout: 10000,
      showButton: false, showMarker: false,
    });
    map.addControl(geolocation);

    geolocation.getCurrentPosition(function (status, result) {
      if (status === 'complete') updateGeoMarker(result.position);
    });

    setInterval(function () {
      geolocation.getCurrentPosition(function (status, result) {
        if (status === 'complete') updateGeoMarker(result.position);
      });
    }, 30000);
  }

  function updateGeoMarker(pos) {
    if (geoMarker) map.remove(geoMarker);
    if (geoCircle) map.remove(geoCircle);
    geoMarker = new AMap.Marker({
      position: pos,
      content: '<div style="width:14px;height:14px;background:#1890ff;border:3px solid #fff;border-radius:50%;box-shadow:0 0 8px rgba(24,144,255,.6)"></div>',
      offset: new AMap.Pixel(-10, -10),
      zIndex: 200,
    });
    geoCircle = new AMap.Circle({
      center: pos, radius: 100,
      strokeColor: '#1890ff', strokeWeight: 1, strokeOpacity: 0.5,
      fillColor: '#1890ff', fillOpacity: 0.1,
    });
    map.add([geoMarker, geoCircle]);
  }

  function initToolbar() {
    var tb = document.getElementById('toolbar');

    var selProv = tb.querySelector('#sel-province');
    var selCat = tb.querySelector('#sel-category');
    var selBatch = tb.querySelector('#sel-batch');
    var txtName = tb.querySelector('#txt-name');
    var btnSearch = tb.querySelector('#btn-search');
    var btnRect = tb.querySelector('#btn-rect');
    var btnRadius = tb.querySelector('#btn-radius');
    var btnClear = tb.querySelector('#btn-clear');

    apiGet('/meta/provinces').then(function (r) {
      if (r.status === 200 && r.data.code === 0) {
        var list = r.data.data;
        for (var i = 0; i < list.length; i++) {
          if (!list[i] || list[i] === 'NaN') continue;
          var opt = document.createElement('option');
          opt.value = list[i]; opt.textContent = list[i];
          selProv.appendChild(opt);
        }
      }
    });

    apiGet('/meta/categories').then(function (r) {
      if (r.status === 200 && r.data.code === 0) {
        var list = r.data.data;
        for (var i = 0; i < list.length; i++) {
          var opt = document.createElement('option');
          opt.value = list[i]; opt.textContent = list[i];
          selCat.appendChild(opt);
        }
      }
    });

    for (var b = 1; b <= 8; b++) {
      var opt = document.createElement('option');
      opt.value = b; opt.textContent = '第' + b + '批';
      selBatch.appendChild(opt);
    }

    btnSearch.addEventListener('click', function () {
      var params = '?size=100';
      var v;
      v = selProv.value; if (v) params += '&province=' + encodeURIComponent(v);
      v = selCat.value; if (v) params += '&category=' + encodeURIComponent(v);
      v = selBatch.value; if (v) params += '&batch=' + v;
      v = txtName.value.trim(); if (v) params += '&name=' + encodeURIComponent(v);
      apiGet('/pois' + params).then(function (r) {
        if (r.status === 200 && r.data.code === 0) renderPois(r.data.data);
      });
    });

    var rectActive = false;
    btnRect.addEventListener('click', function () {
      if (rectActive) return;
      rectActive = true;
      btnRect.classList.add('active');
      mouseTool = new AMap.MouseTool(map);
      mouseTool.rectangle({ strokeColor: '#1890ff', fillColor: '#1890ff', fillOpacity: 0.1 });
      mouseTool.on('draw', function (e) {
        var bounds = e.obj.getBounds();
        var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
        var params = '?minLng=' + sw.lng + '&minLat=' + sw.lat +
                     '&maxLng=' + ne.lng + '&maxLat=' + ne.lat + '&size=100';
        apiGet('/pois/search/bbox' + params).then(function (r) {
          if (r.status === 200 && r.data.code === 0) renderPois(r.data.data);
        });
        mouseTool.close();
        btnRect.classList.remove('active');
        rectActive = false;
      });
    });

    btnRadius.addEventListener('click', function () {
      var r = prompt('请输入查询半径（米）：', '5000');
      if (!r || isNaN(r)) return;
      radiusMarker = parseFloat(r);
      map.setDefaultCursor('crosshair');
      var handler = function (e) {
        var lnglat = e.lnglat;
        var params = '?lng=' + lnglat.getLng() + '&lat=' + lnglat.getLat() +
                     '&radius=' + radiusMarker + '&size=100';
        apiGet('/pois/search/radius' + params).then(function (res) {
          if (res.status === 200 && res.data.code === 0) {
            renderPois(res.data.data);
            new AMap.Circle({
              map: map,
              center: [lnglat.getLng(), lnglat.getLat()],
              radius: radiusMarker,
              strokeColor: '#f5222d', strokeWeight: 2,
              fillColor: '#f5222d', fillOpacity: 0.08,
            });
          }
        });
        map.setDefaultCursor('default');
        map.off('click', handler);
      };
      map.on('click', handler);
    });

    btnClear.addEventListener('click', function () {
      selProv.value = '';
      selCat.value = '';
      selBatch.value = '';
      txtName.value = '';
      cluster.setMarkers([]);
      loadPoisByView();
    });
  }

  window.clearDebug = function () {
    debugEl.innerHTML = '';
    debugCount = 0;
  };

})();
