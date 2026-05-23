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

  function fetchAllPages(basePath, baseParams, onComplete) {
    var allData = [];
    var size = 100;
    
    function fetchPage(page) {
      var url = basePath + baseParams + '&page=' + page + '&size=' + size;
      apiGet(url).then(function (r) {
        if (r.status === 200 && r.data && r.data.code === 0) {
          var list = r.data.data;
          allData = allData.concat(list);
          var meta = r.data.meta;
          // 如果当前获取到的数据使得总数还没达到后端告知的 total，并且确实拿到了数据，则继续取下一页
          if (meta && allData.length < meta.total && list.length > 0) {
            fetchPage(page + 1);
          } else {
            // 所有页都取完了（或者没数据了）
            onComplete(allData);
          }
        } else {
          // 发生错误时，把已经拿到的数据渲染出来，避免卡死
          onComplete(allData);
        }
      });
    }

    // 从第一页开始取
    fetchPage(1);
  }

  var map;
  var massMarks = null;
  var geoMarker, geoCircle;
  var mouseTool;
  var searchOverlay = null;
  var infoWin = document.getElementById('info-window');

  window._mapInit = function () {
    map = new AMap.Map('map-container', {
      zoom: 5, center: [104.0, 35.5],
      viewMode: '2D',
    });

    initGeolocation();
    initToolbar();
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

  function createDotIcon(color) {
    var canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    var ctx = canvas.getContext('2d');
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(12, 12, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    return canvas.toDataURL();
  }

  var batchColors = [
    '#f5222d', // 1: 红
    '#fa8c16', // 2: 橙
    '#fadb14', // 3: 黄
    '#52c41a', // 4: 绿
    '#1890ff', // 5: 蓝
    '#2f54eb', // 6: 靛
    '#722ed1', // 7: 紫
    '#eb2f96'  // 8: 粉(第八批)
  ];

  var dotStyles = batchColors.map(function(color) {
    return {
      url: createDotIcon(color),
      size: new AMap.Size(24, 24),
      anchor: new AMap.Pixel(12, 12)
    };
  });

  function renderPois(list) {
    if (!list) return;
    if (massMarks) {
      massMarks.clear();
      map.remove(massMarks);
      massMarks = null;
    }
    
    var data = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var pos = p.location.gcj02;
      var b = parseInt(p.batch, 10);
      var sIdx = (!isNaN(b) && b > 0) ? (b - 1) % dotStyles.length : 0;
      data.push({
        lnglat: [pos.lng, pos.lat],
        style: sIdx,
        extData: p
      });
    }

    massMarks = new AMap.MassMarks(data, {
      zIndex: 111,
      cursor: 'pointer',
      style: dotStyles
    });

    massMarks.on('mouseover', function (e) {
      showInfo(e.data.extData);
    });
    massMarks.on('mouseout', function () {
      infoWin.style.display = 'none';
    });

    massMarks.setMap(map);
  }

  function showInfo(poi) {
    var loc = poi.location;
    var html = '<h3>' + poi.name + '</h3>';
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
    // 移除了点击地图关闭信息窗的逻辑，因为现在由 hover (mouseout) 控制
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

    // 移除了定时器，不再每隔 30 秒把地图中心切回我的位置
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
    var selExtended = tb.querySelector('#sel-extended');
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
      var params = '?';
      var query = [];
      var v;
      v = selProv.value; if (v) query.push('province=' + encodeURIComponent(v));
      v = selCat.value; if (v) query.push('category=' + encodeURIComponent(v));
      v = selBatch.value; if (v) query.push('batch=' + v);
      v = selExtended.value; if (v !== '') query.push('has_extended=' + (v === '1' ? 'true' : 'false'));
      v = txtName.value.trim(); if (v) query.push('name=' + encodeURIComponent(v));
      params += query.join('&');
      
      fetchAllPages('/pois', params, function(allData) {
        renderPois(allData);
      });
    });

    var rectActive = false;
    var radiusActive = false;

    function clearSearchOverlay() {
      if (searchOverlay) {
        map.remove(searchOverlay);
        searchOverlay = null;
      }
      if (mouseTool) {
        mouseTool.close(true); // true 表示同时清除绘制的图形
        mouseTool = null;
      }
      btnRect.classList.remove('active');
      btnRadius.classList.remove('active');
      rectActive = false;
      radiusActive = false;
    }

    btnRect.addEventListener('click', function () {
      if (rectActive) { clearSearchOverlay(); return; }
      clearSearchOverlay();
      rectActive = true;
      btnRect.classList.add('active');
      
      mouseTool = new AMap.MouseTool(map);
      mouseTool.rectangle({ strokeColor: '#1890ff', fillColor: '#1890ff', fillOpacity: 0.1 });
      mouseTool.on('draw', function (e) {
        searchOverlay = e.obj;
        var bounds = e.obj.getBounds();
        var sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
        var params = '?minLng=' + sw.lng + '&minLat=' + sw.lat +
                     '&maxLng=' + ne.lng + '&maxLat=' + ne.lat;
        var ext = selExtended.value;
        if (ext !== '') params += '&has_extended=' + (ext === '1' ? 'true' : 'false');
        
        fetchAllPages('/pois/search/bbox', params, function(allData) {
          renderPois(allData);
        });

        var obj = e.obj;
        mouseTool.close(false); // 关闭测距工具，false 表示保留图形
        searchOverlay = obj; // 重新赋值覆盖物引用，因为 close 后可能丢失
        
        btnRect.classList.remove('active');
        rectActive = false;
      });
    });

    btnRadius.addEventListener('click', function () {
      if (radiusActive) { clearSearchOverlay(); return; }
      clearSearchOverlay();
      radiusActive = true;
      btnRadius.classList.add('active');
      
      mouseTool = new AMap.MouseTool(map);
      mouseTool.circle({ strokeColor: '#f5222d', fillColor: '#f5222d', fillOpacity: 0.1 });
      mouseTool.on('draw', function (e) {
        searchOverlay = e.obj;
        var center = e.obj.getCenter();
        var radius = e.obj.getRadius();
        var params = '?lng=' + center.lng + '&lat=' + center.lat +
                     '&radius=' + Math.round(radius);
        var ext = selExtended.value;
        if (ext !== '') params += '&has_extended=' + (ext === '1' ? 'true' : 'false');
        
        fetchAllPages('/pois/search/radius', params, function(allData) {
          renderPois(allData);
        });

        var obj = e.obj;
        mouseTool.close(false); // 关闭测距工具，false 表示保留图形
        searchOverlay = obj; // 重新赋值覆盖物引用，因为 close 后可能丢失
        
        btnRadius.classList.remove('active');
        radiusActive = false;
      });
    });

    btnClear.addEventListener('click', function () {
      selProv.value = '';
      selCat.value = '';
      selBatch.value = '';
      selExtended.value = '';
      txtName.value = '';
      if (massMarks) {
        massMarks.clear();
        map.remove(massMarks);
        massMarks = null;
      }
      clearSearchOverlay();
    });
  }

  window.clearDebug = function () {
    debugEl.innerHTML = '';
    debugCount = 0;
  };

})();
