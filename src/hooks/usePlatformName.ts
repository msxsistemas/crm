import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const DEFAULT_NAME = "ZapCRM";
let cachedName: string | null = null;
const listeners = new Set<(name: string) => void>();

const fetchName = async () => {
  const { data } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "platform_name")
    .maybeSingle();
  if (data?.value) {
    const name = String(data.value).replace(/^"|"$/g, "");
    cachedName = name || DEFAULT_NAME;
  } else {
    cachedName = DEFAULT_NAME;
  }
  document.title = cachedName;
  listeners.forEach((fn) => fn(cachedName!));
};

// Fetch once on module load
fetchName();

// Realtime subscription — auto-refresh on any system_settings change
const channel = supabase
  .channel("platform-name-realtime")
  .on(
    "postgres_changes" as any,
    { event: "*", schema: "public", table: "system_settings", filter: "key=eq.platform_name" },
    () => { fetchName(); }
  )
  .subscribe();

export const usePlatformName = () => {
  const [name, setName] = useState(cachedName || DEFAULT_NAME);

  useEffect(() => {
    if (cachedName) setName(cachedName);
    listeners.add(setName);
    return () => { listeners.delete(setName); };
  }, []);

  const refresh = () => { fetchName(); };

  return { platformName: name, refreshPlatformName: refresh };
};
