"use client";

import { useState, useEffect, useCallback } from "react";

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
  heritage_code: number | null;
  class_code: number | null;
  image_url: string | null;
  website: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
}

type FormState = Partial<PoiItem> & { lng: number; lat: number; name: string };

const emptyForm: FormState = {
  name: "",
  province: "",
  address: "",
  category: "",
  batch: "",
  age: "",
  lng: 116.397,
  lat: 39.909,
  image_url: "",
  website: "",
  remark: "",
};

export default function AdminPage() {
  const [pois, setPois] = useState<PoiItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchName, setSearchName] = useState("");

  const pageSize = 20;

  const fetchPois = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (searchName) params.set("name", searchName);

      const res = await fetch(`/api/pois?${params}`);
      if (res.status === 401 || res.status === 403) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      setPois(json.data || []);
      setTotal(json.meta?.total || 0);
    } catch {
      console.error("Failed to fetch POIs");
    }
    setLoading(false);
  }, [page, searchName]);

  useEffect(() => {
    fetchPois();
  }, [fetchPois]);

  const savePoi = async () => {
    if (!editing) return;
    setSaving(true);

    try {
      const isEdit = !!editing.id;
      const url = isEdit ? `/api/pois/${editing.id}` : "/api/pois";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });

      if (res.ok) {
        setEditing(null);
        fetchPois();
      } else {
        const json = await res.json();
        alert(json.error?.message || "保存失败");
      }
    } catch {
      alert("网络错误");
    }
    setSaving(false);
  };

  const deletePoi = async (id: number) => {
    if (!confirm("确定删除此 POI？")) return;
    const res = await fetch(`/api/pois/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchPois();
    } else {
      const json = await res.json();
      alert(json.error?.message || "删除失败");
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">管理员后台</h1>
        <div className="flex gap-3 items-center">
          <a href="/" className="text-sm text-gray-600 hover:text-gray-800">
            地图首页
          </a>
          <button
            onClick={() => {
              document.cookie = "token=; Max-Age=0; Path=/";
              window.location.href = "/login";
            }}
            className="text-sm text-red-500 hover:text-red-600"
          >
            退出登录
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto mt-6 px-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={searchName}
              onChange={(e) => {
                setSearchName(e.target.value);
                setPage(1);
              }}
              placeholder="搜索名称..."
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
            />
            <button
              onClick={fetchPois}
              className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300 transition"
            >
              刷新
            </button>
          </div>
          <button
            onClick={() => setEditing({ ...emptyForm })}
            className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            + 新增 POI
          </button>
        </div>

        {editing && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-semibold mb-4">
                {editing.id ? "编辑 POI" : "新增 POI"}
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">名称 *</label>
                  <input
                    value={editing.name || ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600">经度</label>
                    <input
                      type="number"
                      step="any"
                      value={editing.lng}
                      onChange={(e) =>
                        setEditing({ ...editing, lng: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">纬度</label>
                    <input
                      type="number"
                      step="any"
                      value={editing.lat}
                      onChange={(e) =>
                        setEditing({ ...editing, lat: parseFloat(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">省份/地区</label>
                  <input
                    value={editing.province || ""}
                    onChange={(e) => setEditing({ ...editing, province: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">详细地址</label>
                  <input
                    value={editing.address || ""}
                    onChange={(e) => setEditing({ ...editing, address: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-gray-600">类别</label>
                    <input
                      value={editing.category || ""}
                      onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">时代</label>
                    <input
                      value={editing.age || ""}
                      onChange={(e) => setEditing({ ...editing, age: e.target.value })}
                      className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">批次</label>
                  <input
                    value={editing.batch || ""}
                    onChange={(e) => setEditing({ ...editing, batch: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">图片URL</label>
                  <input
                    value={editing.image_url || ""}
                    onChange={(e) => setEditing({ ...editing, image_url: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">官网</label>
                  <input
                    value={editing.website || ""}
                    onChange={(e) => setEditing({ ...editing, website: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">备注</label>
                  <textarea
                    value={editing.remark || ""}
                    onChange={(e) => setEditing({ ...editing, remark: e.target.value })}
                    className="w-full px-3 py-1.5 border rounded text-sm mt-0.5"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition"
                >
                  取消
                </button>
                <button
                  onClick={savePoi}
                  disabled={saving}
                  className="px-4 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类别</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">时代</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">批次</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">地址</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">坐标</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      加载中...
                    </td>
                  </tr>
                ) : pois.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  pois.map((poi) => (
                    <tr key={poi.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500">{poi.id}</td>
                      <td className="px-4 py-2 font-medium text-gray-800">{poi.name}</td>
                      <td className="px-4 py-2 text-gray-600">{poi.category}</td>
                      <td className="px-4 py-2 text-gray-600">{poi.age}</td>
                      <td className="px-4 py-2 text-gray-600">{poi.batch}</td>
                      <td className="px-4 py-2 text-gray-600 max-w-48 truncate">{poi.address}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">
                        {poi.lng?.toFixed(4)}, {poi.lat?.toFixed(4)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() =>
                              setEditing({
                                ...poi,
                                lng: poi.lng || 0,
                                lat: poi.lat || 0,
                              })
                            }
                            className="text-xs text-blue-500 hover:text-blue-700"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => deletePoi(poi.id)}
                            className="text-xs text-red-500 hover:text-red-700"
                          >
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              共 {total} 条，第 {page}/{totalPages || 1} 页
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30"
              >
                上一页
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-30"
              >
                下一页
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
