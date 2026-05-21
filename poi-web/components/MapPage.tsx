"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface PoiItem {
  id: number;
  name: string;
  province: string;
  address: string;
  category: string;
  batch: string;
  age: string;
  lng: number;
  lat: number;
  image_url?: string;
  website?: string;
  distance_meters?: number;
}

declare global {
  interface Window {
    AMap: any;
    _AMapSecurityConfig: any;
  }
}

type QueryMode = "none" | "bbox" | "radius";

function formatDistance(meters?: number) {
  if (meters === undefined) return "";
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

export default function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const mouseToolRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  const [pois, setPois] = useState<PoiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [queryMode, setQueryMode] = useState<QueryMode>("none");
  const [showPoiList, setShowPoiList] = useState(false);
  const [selectedPoi, setSelectedPoi] = useState<PoiItem | null>(null);
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [total, setTotal] = useState(0);

  const clearMarkers = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
  }, []);

  const renderMarkers = useCallback(
    (poiList: PoiItem[]) => {
      if (!mapRef.current || !window.AMap) return;
      clearMarkers();

      poiList.forEach((poi) => {
        const marker = new window.AMap.Marker({
          position: [poi.lng, poi.lat],
          title: poi.name,
          map: mapRef.current,
        });

        marker.on("click", () => {
          setSelectedPoi(poi);
          if (infoWindowRef.current) {
            const content = `
              <div style="padding:8px;max-width:300px;">
                <h3 style="margin:0 0 4px;font-size:14px;font-weight:bold;">${poi.name}</h3>
                <p style="margin:2px 0;font-size:12px;color:#666;">类别：${poi.category || "未知"}</p>
                <p style="margin:2px 0;font-size:12px;color:#666;">时代：${poi.age || "未知"}</p>
                <p style="margin:2px 0;font-size:12px;color:#666;">地址：${poi.address || "未知"}</p>
                <p style="margin:2px 0;font-size:12px;color:#666;">批次：${poi.batch || "未知"}</p>
                ${poi.distance_meters ? `<p style="margin:2px 0;font-size:12px;color:#1890ff;">距离：${formatDistance(poi.distance_meters)}</p>` : ""}
                ${poi.website ? `<p style="margin:2px 0;"><a href="${poi.website}" target="_blank" style="font-size:12px;color:#1890ff;">查看详情</a></p>` : ""}
              </div>
            `;
            infoWindowRef.current.setContent(content);
            infoWindowRef.current.open(mapRef.current, [poi.lng, poi.lat]);
          }
        });

        markersRef.current.push(marker);
      });
    },
    [clearMarkers]
  );

  useEffect(() => {
    if (pois.length > 0) renderMarkers(pois);
  }, [pois, renderMarkers]);

  const fetchPoisByBbox = useCallback(
    async (minLng: number, minLat: number, maxLng: number, maxLat: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/pois/search/bbox?minLng=${minLng}&minLat=${minLat}&maxLng=${maxLng}&maxLat=${maxLat}`
        );
        const json = await res.json();
        if (json.data) {
          setPois(json.data);
          setTotal(json.meta?.total || 0);
          setShowPoiList(true);
        } else {
          console.error("bbox query failed:", json);
          setPois([]);
          setTotal(0);
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    },
    []
  );

  const fetchPoisByRadius = useCallback(
    async (lng: number, lat: number, radius: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/pois/search/radius?lng=${lng}&lat=${lat}&radius=${radius}`
        );
        const json = await res.json();
        if (json.data) {
          setPois(json.data);
          setTotal(json.meta?.total || 0);
          setShowPoiList(true);
        } else {
          console.error("radius query failed:", json);
          setPois([]);
          setTotal(0);
        }
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    const loadAmap = async () => {
      const key = process.env.NEXT_PUBLIC_AMAP_KEY;
      const securityCode = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE;
      if (!key) {
        console.error("NEXT_PUBLIC_AMAP_KEY is not set");
        return;
      }

      window._AMapSecurityConfig = { securityJsCode: securityCode || "" };

      const AMapLoader = (await import("@amap/amap-jsapi-loader")).default;
      const AMap = await AMapLoader.load({ key, version: "2.0", plugins: ["AMap.MouseTool"] });

      const map = new AMap.Map(mapContainerRef.current, {
        zoom: 5,
        center: [104.0, 35.0],
        viewMode: "2D",
      });
      mapRef.current = map;

      const infoWindow = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -30) });
      infoWindowRef.current = infoWindow;
    };

    loadAmap();

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const startDeviceTracking = () => {
    if (!navigator.geolocation) {
      alert("您的浏览器不支持定位功能");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const { longitude: lng, latitude: lat } = position.coords;
        setUserLocation({ lng, lat });

        if (!window.AMap || !mapRef.current) return;

        if (userMarkerRef.current) {
          userMarkerRef.current.setPosition([lng, lat]);
        } else {
          userMarkerRef.current = new window.AMap.Marker({
            position: [lng, lat],
            map: mapRef.current,
            icon: new window.AMap.Icon({
              size: new window.AMap.Size(32, 32),
              image:
                "data:image/svg+xml;base64," +
                btoa(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="8" fill="#1890ff" stroke="white" stroke-width="3"/><circle cx="16" cy="16" r="12" fill="none" stroke="#1890ff" stroke-width="2" opacity="0.3"/></svg>'
                ),
              imageSize: new window.AMap.Size(32, 32),
            }),
            title: "我的位置",
            zIndex: 200,
          });
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        alert("无法获取位置：" + err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  };

  const startBboxDraw = () => {
    if (!window.AMap || !mapRef.current) return;
    stopDrawing();
    setQueryMode("bbox");

    mouseToolRef.current = new window.AMap.MouseTool(mapRef.current);
    mouseToolRef.current.rectangle({
      strokeColor: "#1890ff",
      strokeWeight: 2,
      fillColor: "#1890ff",
      fillOpacity: 0.1,
    });

    mouseToolRef.current.on("draw", (e: any) => {
      const bounds = e.obj.getBounds();
      if (bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        fetchPoisByBbox(sw.getLng(), sw.getLat(), ne.getLng(), ne.getLat());
      }
      mouseToolRef.current?.close(false);
    });
  };

  const startRadiusDraw = () => {
    if (!window.AMap || !mapRef.current) return;
    stopDrawing();
    setQueryMode("radius");

    mouseToolRef.current = new window.AMap.MouseTool(mapRef.current);
    mouseToolRef.current.circle({
      strokeColor: "#ff4d4f",
      strokeWeight: 2,
      fillColor: "#ff4d4f",
      fillOpacity: 0.1,
    });

    mouseToolRef.current.on("draw", (e: any) => {
      const center = e.obj.getCenter();
      const radius = e.obj.getRadius();
      if (center && radius) {
        fetchPoisByRadius(center.getLng(), center.getLat(), Math.round(radius));
      }
      mouseToolRef.current?.close(false);
    });
  };

  const stopDrawing = () => {
    mouseToolRef.current?.close(true);
    setQueryMode("none");
    setPois([]);
    setTotal(0);
    clearMarkers();
    setShowPoiList(false);
  };

  const resetMapView = () => {
    stopDrawing();
    setSelectedPoi(null);
    if (mapRef.current) {
      mapRef.current.setZoomAndCenter(5, [104.0, 35.0]);
    }
    if (infoWindowRef.current) {
      infoWindowRef.current.close();
    }
  };

  return (
    <div className="relative w-full h-screen flex flex-col">
      <nav className="flex items-center justify-between px-4 py-2 bg-white shadow-sm z-50 border-b border-gray-200">
        <h1 className="text-lg font-bold text-gray-800">全国文保单位 POI 系统</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={startDeviceTracking}
            className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            定位
          </button>
          <button
            onClick={startBboxDraw}
            className={`px-3 py-1.5 text-sm rounded transition ${
              queryMode === "bbox"
                ? "bg-blue-600 text-white"
                : "bg-green-500 text-white hover:bg-green-600"
            }`}
          >
            拉框查询
          </button>
          <button
            onClick={startRadiusDraw}
            className={`px-3 py-1.5 text-sm rounded transition ${
              queryMode === "radius"
                ? "bg-red-600 text-white"
                : "bg-orange-500 text-white hover:bg-orange-600"
            }`}
          >
            半径查询
          </button>
          {queryMode !== "none" && (
            <button
              onClick={stopDrawing}
              className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition"
            >
              退出查询
            </button>
          )}
          <button
            onClick={resetMapView}
            className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition"
          >
            重置
          </button>
          <a
            href="/login"
            className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 transition"
          >
            登录
          </a>
        </div>
      </nav>

      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg px-4 py-2 z-50">
            <span className="text-sm text-gray-600">加载中...</span>
          </div>
        )}

        {pois.length === 0 && !loading && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white shadow-lg rounded-lg px-4 py-2 z-50">
            <span className="text-sm text-gray-500">点击"拉框查询"或"半径查询"开始查询文保单位</span>
          </div>
        )}

        {showPoiList && (
          <div className="absolute top-0 right-0 w-80 h-full bg-white/95 shadow-lg z-40 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">
                查询结果 ({total} 条)
              </span>
              <button
                onClick={() => setShowPoiList(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {pois.map((poi) => (
                <div
                  key={poi.id}
                  onClick={() => {
                    setSelectedPoi(poi);
                    mapRef.current?.setZoomAndCenter(14, [poi.lng, poi.lat]);
                  }}
                  className="px-3 py-2 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition"
                >
                  <div className="text-sm font-medium text-gray-800">{poi.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {poi.category} · {poi.age} · {poi.batch}
                  </div>
                  <div className="text-xs text-gray-400">{poi.address}</div>
                  {poi.distance_meters !== undefined && (
                    <div className="text-xs text-blue-500 mt-0.5">
                      距离: {formatDistance(poi.distance_meters)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedPoi && !showPoiList && (
          <div className="absolute bottom-4 left-4 bg-white shadow-lg rounded-lg p-4 z-40 max-w-sm">
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-gray-800">{selectedPoi.name}</h3>
              <button
                onClick={() => setSelectedPoi(null)}
                className="text-gray-400 hover:text-gray-600 ml-2"
              >
                ✕
              </button>
            </div>
            <div className="mt-2 space-y-1 text-sm text-gray-600">
              <p>类别: {selectedPoi.category || "未知"}</p>
              <p>时代: {selectedPoi.age || "未知"}</p>
              <p>地址: {selectedPoi.address || "未知"}</p>
              <p>批次: {selectedPoi.batch || "未知"}</p>
              {selectedPoi.distance_meters !== undefined && (
                <p className="text-blue-500">距离: {formatDistance(selectedPoi.distance_meters)}</p>
              )}
              {selectedPoi.website && (
                <a
                  href={selectedPoi.website}
                  target="_blank"
                  className="text-blue-500 hover:underline"
                >
                  查看详情 →
                </a>
              )}
            </div>
          </div>
        )}

        {userLocation && (
          <div className="absolute bottom-4 right-4 bg-white/90 shadow rounded px-3 py-1.5 z-40 text-xs text-gray-500">
            📍 {userLocation.lng.toFixed(6)}, {userLocation.lat.toFixed(6)}
          </div>
        )}
      </div>
    </div>
  );
}
