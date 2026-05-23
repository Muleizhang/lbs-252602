(function () {
  'use strict';

  var CFG = window.LBS_CONFIG;
  var localKey = localStorage.getItem('lbs_api_key');
  if (localKey) CFG.API_KEY = localKey;

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
    var token = localStorage.getItem('lbs_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var opts = { method: method, headers: headers };
    if (body) opts.body = JSON.stringify(body);
    return fetch(url, opts).then(function (r) {
      return r.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) { data = txt; }
        debugLog(method, url, r.status, data);
        if (r.status === 401 || r.status === 403) {
          // token 过期或无权限，自动退出
          if (path !== '/auth/login' && path !== '/auth/register') {
            doLogout();
          }
        }
        return { status: r.status, data: data };
      });
    }).catch(function (err) {
      debugLog(method, url, 0, err.toString());
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

  // ===================== Auth System =====================

  var currentUser = null;
  var authMode = 'login';

  var modalAuth = document.getElementById('modal-auth');
  var modalProfile = document.getElementById('modal-profile');
  var authTitle = document.getElementById('auth-title');
  var authUser = document.getElementById('auth-user');
  var authPass = document.getElementById('auth-pass');
  var authEmail = document.getElementById('auth-email');
  var authToggle = document.getElementById('auth-toggle');
  var authSubmit = document.getElementById('btn-auth-submit');
  var userInfo = document.getElementById('user-info');
  var btnLoginShow = document.getElementById('btn-login-show');
  var btnProfile = document.getElementById('btn-profile');
  var btnLogout = document.getElementById('btn-logout');

  function updateAuthUI() {
    if (currentUser) {
      userInfo.textContent = currentUser.username + ' (' + currentUser.role + ')';
      userInfo.style.display = 'inline';
      btnLoginShow.style.display = 'none';
      btnProfile.style.display = 'inline-block';
      btnLogout.style.display = 'inline-block';
    } else {
      userInfo.style.display = 'none';
      btnLoginShow.style.display = 'inline-block';
      btnProfile.style.display = 'none';
      btnLogout.style.display = 'none';
    }
  }

  function doLogout() {
    currentUser = null;
    localStorage.removeItem('lbs_token');
    localStorage.removeItem('lbs_user');
    localStorage.removeItem('lbs_api_key');
    CFG.API_KEY = '';
    updateAuthUI();
  }

  function tryRestoreSession() {
    var token = localStorage.getItem('lbs_token');
    var savedUser = localStorage.getItem('lbs_user');
    if (token && savedUser) {
      try {
        currentUser = JSON.parse(savedUser);
        updateAuthUI();
        api('POST', '/auth/refresh', null).then(function (r) {
          if (r.status === 200 && r.data && r.data.code === 0) {
            localStorage.setItem('lbs_token', r.data.data.access_token);
          } else {
            doLogout();
          }
        });
      } catch (e) {
        doLogout();
      }
    } else {
      updateAuthUI();
    }
  }

  authToggle.addEventListener('click', function () {
    if (authMode === 'login') {
      authMode = 'register';
      authTitle.textContent = '用户注册';
      authEmail.style.display = 'block';
      authToggle.textContent = '已有账号？去登录';
    } else {
      authMode = 'login';
      authTitle.textContent = '用户登录';
      authEmail.style.display = 'none';
      authToggle.textContent = '没有账号？去注册';
    }
  });

  btnLoginShow.addEventListener('click', function () {
    authUser.value = '';
    authPass.value = '';
    authEmail.value = '';
    authMode = 'login';
    authTitle.textContent = '用户登录';
    authEmail.style.display = 'none';
    authToggle.textContent = '没有账号？去注册';
    modalAuth.style.display = 'flex';
  });

  authSubmit.addEventListener('click', function () {
    var u = authUser.value.trim();
    var p = authPass.value;
    if (!u || !p) return;

    if (authMode === 'login') {
      api('POST', '/auth/login', { username: u, password: p }).then(function (r) {
        if (r.status === 200 && r.data && r.data.code === 0) {
          var token = r.data.data.access_token;
          localStorage.setItem('lbs_token', token);
          modalAuth.style.display = 'none';
          api('GET', '/users/me', null).then(function (r2) {
            if (r2.status === 200 && r2.data && r2.data.code === 0) {
              currentUser = r2.data.data;
              localStorage.setItem('lbs_user', JSON.stringify(currentUser));
              updateAuthUI();
            }
          });
        }
      });
    } else {
      var e = authEmail.value.trim();
      if (!e) return;
      api('POST', '/auth/register', { username: u, email: e, password: p }).then(function (r) {
        if (r.status === 200 && r.data && r.data.code === 0) {
          api('POST', '/auth/login', { username: u, password: p }).then(function (r2) {
            if (r2.status === 200 && r2.data && r2.data.code === 0) {
              var token = r2.data.data.access_token;
              localStorage.setItem('lbs_token', token);
              modalAuth.style.display = 'none';
              api('GET', '/users/me', null).then(function (r3) {
                if (r3.status === 200 && r3.data && r3.data.code === 0) {
                  currentUser = r3.data.data;
                  localStorage.setItem('lbs_user', JSON.stringify(currentUser));
                  updateAuthUI();
                }
              });
            }
          });
        }
      });
    }
  });

  btnLogout.addEventListener('click', function () {
    doLogout();
  });

  // ===================== Profile & API Key Management =====================

  var profUser = document.getElementById('prof-user');
  var profRole = document.getElementById('prof-role');
  var keyList = document.getElementById('key-list');
  var newKeyName = document.getElementById('new-key-name');
  var btnCreateKey = document.getElementById('btn-create-key');

  btnProfile.addEventListener('click', function () {
    if (!currentUser) return;
    profUser.textContent = currentUser.username;
    profRole.textContent = currentUser.role;
    newKeyName.value = '';
    modalProfile.style.display = 'flex';
    loadApiKeys();
  });

  function loadApiKeys() {
    api('GET', '/users/me/apikeys', null).then(function (r) {
      keyList.innerHTML = '';
      if (r.status === 200 && r.data && r.data.code === 0) {
        var keys = r.data.data;
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          var item = document.createElement('div');
          item.className = 'key-item';
          var statusText = k.is_active ? '✅ 有效' : '❌ 已吊销';
          item.innerHTML = '<div><b>' + k.key_prefix + '****</b> ' + (k.name || '') + '<br><span style="color:#888">' + statusText + ' | 最后使用: ' + (k.last_used_at || '从未') + '</span></div>';
          if (k.is_active) {
            var useBtn = document.createElement('button');
            useBtn.textContent = '使用';
            useBtn.style.cssText = 'padding:2px 8px;font-size:11px;margin-right:4px;';
            useBtn.addEventListener('click', function () {
              var existing = keyList.querySelector('.use-key-box');
              if (existing) existing.remove();
              var box = document.createElement('div');
              box.className = 'use-key-box';
              box.style.cssText = 'margin-top:4px;padding:6px;background:#e6f7ff;border:1px solid #91d5ff;border-radius:3px;display:flex;gap:6px;align-items:center;';
              box.innerHTML = '<input type="text" placeholder="粘贴完整的 API Key (sk_...)" style="flex:1;padding:3px;font-size:12px;border:1px solid #d9d9d9;border-radius:3px;">' +
                '<button style="padding:3px 8px;font-size:12px;">确认</button>';
              item.appendChild(box);
              var inp = box.querySelector('input');
              var confirmBtn = box.querySelector('button');
              confirmBtn.addEventListener('click', function () {
                var fullKey = inp.value.trim();
                if (!fullKey) return;
                CFG.API_KEY = fullKey;
                localStorage.setItem('lbs_api_key', fullKey);
                box.innerHTML = '<span style="color:#52c41a;font-size:12px;">已设置: ' + fullKey.substring(0, 12) + '****</span>';
              });
            });
            var revokeBtn = document.createElement('button');
            revokeBtn.textContent = '吊销';
            revokeBtn.style.cssText = 'padding:2px 8px;font-size:11px;background:#ff4d4f;';
            (function (kId) {
              revokeBtn.addEventListener('click', function () {
                if (!confirm('确定吊销此 Key？吊销后不可恢复。')) return;
                api('DELETE', '/users/me/apikeys/' + kId, null).then(function () {
                  loadApiKeys();
                });
              });
            })(k.id);
            var btnGroup = document.createElement('div');
            btnGroup.appendChild(useBtn);
            btnGroup.appendChild(revokeBtn);
            item.appendChild(btnGroup);
          }
          keyList.appendChild(item);
        }
        if (keys.length === 0) {
          keyList.innerHTML = '<div style="padding:12px;color:#888;text-align:center;">暂无 API Key，请点击上方按钮生成</div>';
        }
      }
    });
  }

  btnCreateKey.addEventListener('click', function () {
    var name = newKeyName.value.trim() || '默认 Key';
    api('POST', '/users/me/apikeys', { name: name }).then(function (r) {
      if (r.status === 200 && r.data && r.data.code === 0) {
        var plain = r.data.data.key_plain;
        CFG.API_KEY = plain;
        localStorage.setItem('lbs_api_key', plain);

        var box = document.createElement('div');
        box.style.cssText = 'margin-top:8px;padding:8px;background:#fffbe6;border:1px solid #ffe58f;border-radius:4px;';
        box.innerHTML = '<div style="color:#d48806;font-size:12px;margin-bottom:4px;">新 Key 已生成并自动启用，请立即复制保存（关闭后无法再查看完整 Key）：</div>' +
          '<div style="display:flex;align-items:center;gap:6px;">' +
          '<input readonly style="flex:1;padding:4px;font-size:12px;border:1px solid #d9d9d9;border-radius:3px;" value="' + plain + '">' +
          '<button id="btn-copy-key" style="padding:4px 10px;font-size:12px;white-space:nowrap;">复制</button>' +
          '</div>';
        keyList.insertBefore(box, keyList.firstChild);
        var inp = box.querySelector('input');
        inp.select();
        box.querySelector('#btn-copy-key').addEventListener('click', function () {
          inp.select();
          document.execCommand('copy');
          this.textContent = '已复制!';
        });
      }
    });
  });

  tryRestoreSession();

})();
