"use client";

import { useState, useEffect } from "react";

interface ApiKeyItem {
  id: number;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function AccountPage() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/auth/apikey");
      if (!res.ok) {
        window.location.href = "/login";
        return;
      }
      const json = await res.json();
      setKeys(json.data || []);
    } catch {
      window.location.href = "/login";
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    const res = await fetch("/api/auth/apikey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    });
    const json = await res.json();
    if (res.ok) {
      setNewKey(json.data.key);
      setNewKeyName("");
      fetchKeys();
    }
  };

  const deleteKey = async (id: number) => {
    if (!confirm("确定删除此 API Key？")) return;
    await fetch(`/api/auth/apikey/${id}`, { method: "DELETE" });
    fetchKeys();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-gray-500">加载中...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-800">API Key 管理</h1>
        <div className="flex gap-3">
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

      <div className="max-w-3xl mx-auto mt-8 px-4">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">创建新 API Key</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Key 名称（例如：我的应用）"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={createKey}
              className="px-4 py-2 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition"
            >
              创建
            </button>
          </div>

          {newKey && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800 font-medium">
                请立即保存此 API Key，关闭后将无法再次查看：
              </p>
              <code className="block mt-2 p-2 bg-white rounded text-sm break-all select-all">
                {newKey}
              </code>
              <p className="text-xs text-yellow-700 mt-2">
                使用方式：在请求头添加 <code>Authorization: ApiKey {"{your-key}"}</code>
              </p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800">我的 API Keys</h2>
          </div>
          {keys.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 text-sm">
              暂无 API Key，请创建一个
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {keys.map((key) => (
                <div key={key.id} className="px-6 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{key.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      创建于: {new Date(key.createdAt).toLocaleString("zh-CN")}
                      {key.lastUsedAt &&
                        ` · 最后使用: ${new Date(key.lastUsedAt).toLocaleString("zh-CN")}`}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteKey(key.id)}
                    className="px-3 py-1 text-xs text-red-500 border border-red-200 rounded hover:bg-red-50 transition"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
