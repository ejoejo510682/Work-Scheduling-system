"use client";

import { useEffect, useState } from "react";

// 截圖給別人看用：手機／電腦是深色模式時，這頁可以切成淺色（只有這頁，離開就恢復）
const KEY = "hours-preview-light";

export function LightModeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 上次的選擇存在瀏覽器裡，畫面載入後才讀得到
      setLight(localStorage.getItem(KEY) === "1");
    } catch {
      // 私密瀏覽等情況讀不到就算了，只是不會記住
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("force-light", light);
    return () => document.documentElement.classList.remove("force-light");
  }, [light]);

  function toggle() {
    const next = !light;
    setLight(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // 存不進去就只在這次畫面有效
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
    >
      {light ? "🌙 跟系統一樣" : "☀️ 淺色模式"}
    </button>
  );
}
