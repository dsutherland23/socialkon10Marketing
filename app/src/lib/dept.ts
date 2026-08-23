import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { deptById, type DeptId } from "./data";

/**
 * Department atmosphere controller.
 * Sets data-dept on <html> so the entire token system morphs accent color
 * without touching structure, typography or components.
 */
export function useDepartment(dept: DeptId | null) {
  useEffect(() => {
    const el = document.documentElement;
    if (dept) el.setAttribute("data-dept", dept);
    else el.removeAttribute("data-dept");
    return () => el.removeAttribute("data-dept");
  }, [dept]);
}

/** Infer the active department from the current route (for nav state). */
export function useRouteDept(): DeptId | null {
  const { pathname } = useLocation();
  if (pathname.includes("graphic-design-branding")) return "brand";
  if (pathname.includes("social-media-marketing")) return "social";
  if (pathname.includes("website-design-development")) return "web";
  return null;
}

export { deptById };
export type { DeptId };
