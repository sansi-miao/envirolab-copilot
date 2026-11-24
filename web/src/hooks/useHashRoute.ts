import { useCallback, useEffect, useState } from "react";

import { isRouteId, type RouteId } from "../lib/navigation";

type RouteState = {
  route: RouteId;
  params: URLSearchParams;
};

function readRoute(): RouteState {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, query = ""] = raw.split("?");
  const candidate = path.replace(/^\/+/, "") || "home";

  return {
    route: isRouteId(candidate) ? candidate : "home",
    params: new URLSearchParams(query),
  };
}

export function useHashRoute() {
  const [state, setState] = useState<RouteState>(readRoute);

  useEffect(() => {
    const handleChange = () => setState(readRoute());
    window.addEventListener("hashchange", handleChange);
    return () => window.removeEventListener("hashchange", handleChange);
  }, []);

  const navigate = useCallback((route: RouteId, params?: Record<string, string>) => {
    const query = params ? new URLSearchParams(params).toString() : "";
    window.location.hash = `/${route}${query ? `?${query}` : ""}`;
  }, []);

  return { ...state, navigate };
}
