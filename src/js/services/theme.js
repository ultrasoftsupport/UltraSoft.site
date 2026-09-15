import { supabase } from '../config/supabase.js';
import { getCurrentTenantId } from './tenant_service.js';

export function isHexColorLight(hex) {
  if (!hex || hex[0] !== '#') return false;
  let fullHex = hex;
  if (hex.length === 4) {
    fullHex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  const r = parseInt(fullHex.substring(1, 3), 16) || 0;
  const g = parseInt(fullHex.substring(3, 5), 16) || 0;
  const b = parseInt(fullHex.substring(5, 7), 16) || 0;
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128;
}

export function adjustColorBrightness(hex, percent) {
  if (!hex || hex[0] !== '#') return hex;
  let fullHex = hex;
  if (hex.length === 4) {
    fullHex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  let R = parseInt(fullHex.substring(1, 3), 16) || 0;
  let G = parseInt(fullHex.substring(3, 5), 16) || 0;
  let B = parseInt(fullHex.substring(5, 7), 16) || 0;

  R = parseInt(R * (100 + percent) / 100);
  G = parseInt(G * (100 + percent) / 100);
  B = parseInt(B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;
  G = (G < 255) ? G : 255;
  B = (B < 255) ? B : 255;

  R = (R > 0) ? R : 0;
  G = (G > 0) ? G : 0;
  B = (B > 0) ? B : 0;

  const rHex = R.toString(16).padStart(2, '0');
  const gHex = G.toString(16).padStart(2, '0');
  const bHex = B.toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}

// Fallback Default Themes Configuration matching UltraSoft Brand System Catalog
export const DEFAULT_THEMES = {
  "UltraSoft Dark Theme": {
    "name": "UltraSoft Dark Theme",
    "description": "المظهر الداكن الفاخر والسينمائي المعزز برؤية UltraSoft باللون الأزرق الكحلي الداكن، السيان والنيون المائي.",
    "is_system": true,
    "colors": {
      "page": {
        "bg": "#0b1329",
        "bg_secondary": "#0f172a",
        "surface": "#0f172a",
        "text": "#f8fafc",
        "text_muted": "#cbd5e1",
        "selection_bg": "#0284c7",
        "selection_text": "#ffffff"
      },
      "brand": {
        "primary": "#0284c7",
        "primary_hover": "#0369a1",
        "secondary": "#1e293b",
        "secondary_hover": "#334155"
      },
      "top_nav": {
        "bg": "#0f172a",
        "border": "#1e293b",
        "logo": "#0284c7",
        "text": "#f8fafc",
        "link_active": "#0284c7",
        "link_hover": "#38bdf8",
        "icons": "#cbd5e1",
        "search_bg": "#0b1329",
        "search_border": "#1e293b",
        "search_text": "#f8fafc"
      },
      "hero": {
        "bg": "#0b1329",
        "overlay": "linear-gradient(to bottom, rgba(11,19,41,0.4), rgba(11,19,41,1))",
        "title": "#ffffff",
        "subtitle": "#e0f2fe"
      },
      "buttons": {
        "primary": { "bg": "#0284c7", "text": "#ffffff", "border": "transparent", "hover_bg": "#0369a1", "hover_text": "#ffffff", "active_bg": "#075985", "disabled_bg": "#1e293b", "disabled_text": "#94a3b8" },
        "secondary": { "bg": "#1e293b", "text": "#f8fafc", "border": "#334155", "hover_bg": "#334155", "hover_text": "#ffffff", "active_bg": "#475569", "disabled_bg": "#0f172a", "disabled_text": "#64748b" },
        "success": { "bg": "#10b981", "text": "#ffffff", "border": "transparent", "hover_bg": "#059669", "hover_text": "#ffffff", "active_bg": "#047857", "disabled_bg": "#1e293b", "disabled_text": "#cbd5e1" },
        "warning": { "bg": "#f59e0b", "text": "#ffffff", "border": "transparent", "hover_bg": "#d97706", "hover_text": "#ffffff", "active_bg": "#b45309", "disabled_bg": "#1e293b", "disabled_text": "#cbd5e1" },
        "danger": { "bg": "#ef4444", "text": "#ffffff", "border": "transparent", "hover_bg": "#dc2626", "hover_text": "#ffffff", "active_bg": "#b91c1c", "disabled_bg": "#1e293b", "disabled_text": "#cbd5e1" }
      },
      "product_cards": {
        "bg": "#0f172a",
        "border": "#1e293b",
        "radius": "16px",
        "title": "#f8fafc",
        "price": "#38bdf8",
        "category": "#cbd5e1",
        "shadow": "0 4px 20px rgba(0,0,0,0.4)",
        "hover_effect": "scale",
        "hover_shadow": "0 10px 30px rgba(2,132,199,0.15)",
        "badge_bg": "#0284c7",
        "badge_text": "#ffffff"
      },
      "modal": {
        "bg": "#0f172a",
        "border": "#1e293b",
        "image_border": "#1e293b",
        "price": "#38bdf8",
        "text": "#f8fafc",
        "text_secondary": "#cbd5e1",
        "quantity_bg": "#1e293b",
        "quantity_text": "#f8fafc",
        "size_active_bg": "#0284c7",
        "size_active_text": "#ffffff",
        "size_inactive_bg": "#1e293b",
        "size_inactive_text": "#cbd5e1",
        "color_border_active": "#0284c7"
      },
      "inputs": {
        "bg": "#0f172a",
        "border": "#1e293b",
        "focus_border": "#0284c7",
        "focus_ring": "rgba(2,132,199,0.2)",
        "placeholder": "#64748b",
        "text": "#f8fafc",
        "icons": "#cbd5e1"
      },
      "tables": {
        "header_bg": "#0f172a",
        "header_text": "#cbd5e1",
        "row_bg": "#0f172a",
        "row_alt_bg": "#1e293b",
        "row_hover_bg": "#334155",
        "border": "#1e293b",
        "selected_bg": "rgba(2,132,199,0.1)",
        "selected_text": "#38bdf8"
      },
      "sidebar": {
        "bg": "#0f172a",
        "border": "#1e293b",
        "text": "#cbd5e1",
        "text_hover": "#ffffff",
        "text_active": "#38bdf8",
        "bg_active": "rgba(2,132,199,0.15)",
        "bg_hover": "#1e293b",
        "icons": "#cbd5e1",
        "icons_active": "#38bdf8"
      },
      "footer": {
        "bg": "#0b1329",
        "border": "#0f172a",
        "text": "#cbd5e1",
        "link": "#cbd5e1",
        "link_hover": "#38bdf8",
        "social_bg": "#0f172a",
        "social_text": "#cbd5e1",
        "social_hover_bg": "#0284c7",
        "social_hover_text": "#ffffff"
      },
      "shadows": {
        "color": "rgba(0,0,0,0.8)",
        "size": "10px",
        "blur": "40px"
      },
      "scrollbar": {
        "track": "#0b1329",
        "thumb": "#1e293b",
        "thumb_hover": "#0284c7"
      },
      "loading": {
        "loader": "#0284c7",
        "spinner": "#1e293b"
      }
    },
    "fonts": {
      "family": "Cairo, Tajawal, sans-serif",
      "size_base": "16px"
    },
    "animations": {
      "transition_speed": "0.3s"
    },
    "visuals": {
      "glass_effect": false,
      "blur_intensity": "0px",
      "show_hero_image": true,
      "hero_image_blend": "overlay"
    }
  },
  "UltraSoft Light Theme": {
    "name": "UltraSoft Light Theme",
    "description": "المظهر الفاتح الناصع والمريح للعين يعكس الهوية السماوية والسيان الفاخرة لـ UltraSoft مع تباين عالي وحدود واضحة.",
    "is_system": true,
    "colors": {
      "page": {
        "bg": "#ebf3fa",
        "bg_secondary": "#ffffff",
        "surface": "#ffffff",
        "text": "#0f172a",
        "text_muted": "#475569",
        "selection_bg": "#0284c7",
        "selection_text": "#ffffff"
      },
      "brand": {
        "primary": "#0284c7",
        "primary_hover": "#0369a1",
        "secondary": "#e2e8f0",
        "secondary_hover": "#cbd5e1"
      },
      "borders": {
        "color": "#cbd5e1",
        "width": "1px",
        "radius": "16px"
      },
      "top_nav": {
        "bg": "#ffffff",
        "border": "#cbd5e1",
        "logo": "#0284c7",
        "text": "#0f172a",
        "link_active": "#0284c7",
        "link_hover": "#0369a1",
        "icons": "#475569",
        "search_bg": "#f8fafc",
        "search_border": "#cbd5e1",
        "search_text": "#0f172a"
      },
      "hero": {
        "bg": "#ebf3fa",
        "overlay": "linear-gradient(to bottom, rgba(235,243,250,0.3), rgba(235,243,250,1))",
        "title": "#0f172a",
        "subtitle": "#475569"
      },
      "buttons": {
        "primary": { "bg": "#0284c7", "text": "#ffffff", "border": "transparent", "hover_bg": "#0369a1", "hover_text": "#ffffff", "active_bg": "#075985", "disabled_bg": "#cbd5e1", "disabled_text": "#94a3b8" },
        "secondary": { "bg": "#f1f5f9", "text": "#0f172a", "border": "#cbd5e1", "hover_bg": "#e2e8f0", "hover_text": "#0f172a", "active_bg": "#cbd5e1", "disabled_bg": "#f8fafc", "disabled_text": "#94a3b8" },
        "success": { "bg": "#10b981", "text": "#ffffff", "border": "transparent", "hover_bg": "#059669", "hover_text": "#ffffff", "active_bg": "#047857", "disabled_bg": "#cbd5e1", "disabled_text": "#94a3b8" },
        "warning": { "bg": "#f59e0b", "text": "#ffffff", "border": "transparent", "hover_bg": "#d97706", "hover_text": "#ffffff", "active_bg": "#b45309", "disabled_bg": "#cbd5e1", "disabled_text": "#94a3b8" },
        "danger": { "bg": "#ef4444", "text": "#ffffff", "border": "transparent", "hover_bg": "#dc2626", "hover_text": "#ffffff", "active_bg": "#b91c1c", "disabled_bg": "#cbd5e1", "disabled_text": "#94a3b8" }
      },
      "product_cards": {
        "bg": "#ffffff",
        "border": "#cbd5e1",
        "radius": "16px",
        "title": "#0f172a",
        "price": "#0284c7",
        "category": "#475569",
        "shadow": "0 4px 16px -2px rgba(15,23,42,0.08), 0 2px 6px -1px rgba(15,23,42,0.04)",
        "hover_effect": "scale",
        "hover_shadow": "0 12px 28px -4px rgba(2,132,199,0.20)",
        "badge_bg": "#0284c7",
        "badge_text": "#ffffff"
      },
      "modal": {
        "bg": "#ffffff",
        "border": "#e1effe",
        "image_border": "#e1effe",
        "price": "#0284c7",
        "text": "#0f172a",
        "text_secondary": "#475569",
        "quantity_bg": "#f0f9ff",
        "quantity_text": "#0f172a",
        "size_active_bg": "#0284c7",
        "size_active_text": "#ffffff",
        "size_inactive_bg": "#f0f9ff",
        "size_inactive_text": "#475569",
        "color_border_active": "#0284c7"
      },
      "inputs": {
        "bg": "#ffffff",
        "border": "#e1effe",
        "focus_border": "#0284c7",
        "focus_ring": "rgba(2,132,199,0.15)",
        "placeholder": "#94a3b8",
        "text": "#0f172a",
        "icons": "#475569"
      },
      "tables": {
        "header_bg": "#f0f9ff",
        "header_text": "#475569",
        "row_bg": "#ffffff",
        "row_alt_bg": "#f7fbff",
        "row_hover_bg": "#f0f9ff",
        "border": "#e1effe",
        "selected_bg": "rgba(2,132,199,0.08)",
        "selected_text": "#0284c7"
      },
      "sidebar": {
        "bg": "#ffffff",
        "border": "#e1effe",
        "text": "#475569",
        "text_hover": "#0f172a",
        "text_active": "#0284c7",
        "bg_active": "rgba(2,132,199,0.08)",
        "bg_hover": "#f0f9ff",
        "icons": "#475569",
        "icons_active": "#0284c7"
      },
      "footer": {
        "bg": "#ffffff",
        "border": "#e1effe",
        "text": "#475569",
        "link": "#475569",
        "link_hover": "#0284c7",
        "social_bg": "#f0f9ff",
        "social_text": "#475569",
        "social_hover_bg": "#0284c7",
        "social_hover_text": "#ffffff"
      },
      "shadows": {
        "color": "rgba(2,132,199,0.08)",
        "size": "4px",
        "blur": "15px"
      },
      "scrollbar": {
        "track": "#fafafa",
        "thumb": "#d4d4d4",
        "thumb_hover": "#0284c7"
      },
      "loading": {
        "loader": "#0284c7",
        "spinner": "#e5e5e5"
      }
    },
    "fonts": {
      "family": "Tajawal, sans-serif",
      "size_base": "16px"
    },
    "animations": {
      "transition_speed": "0.3s"
    },
    "visuals": {
      "glass_effect": false,
      "blur_intensity": "0px",
      "show_hero_image": true,
      "hero_image_blend": "luminosity"
    }
  },
  "Warm Theme": {
    "name": "Warm Theme",
    "description": "مظهر دافئ مريح بلون بيج رملي وهادي مع لمسات برتقالية ناعمة.",
    "is_system": true,
    "colors": {
      "page": {
        "bg": "#fdf6e2",
        "bg_secondary": "#f4ebd0",
        "surface": "#f4ebd0",
        "text": "#2e2315",
        "text_muted": "#705a41",
        "selection_bg": "#f97316",
        "selection_text": "#ffffff"
      },
      "brand": {
        "primary": "#f97316",
        "primary_hover": "#ea580c",
        "secondary": "#ebdcb9",
        "secondary_hover": "#c4b28d"
      },
      "borders": {
        "color": "#ebdcb9",
        "width": "1px",
        "radius": "12px"
      },
      "top_nav": {
        "bg": "#f4ebd0",
        "border": "#e6d5b8",
        "logo": "#f97316",
        "text": "#2e2315",
        "link_active": "#f97316",
        "link_hover": "#ea580c",
        "icons": "#705a41",
        "search_bg": "#fdf6e2",
        "search_border": "#e6d5b8",
        "search_text": "#2e2315"
      },
      "hero": {
        "bg": "#fdf6e2",
        "overlay": "linear-gradient(to bottom, rgba(253,246,226,0.3), rgba(253,246,226,1))",
        "title": "#2e2315",
        "subtitle": "#705a41"
      },
      "buttons": {
        "primary": { "bg": "#f97316", "text": "#ffffff", "border": "transparent", "hover_bg": "#ea580c", "hover_text": "#ffffff", "active_bg": "#c2410c", "disabled_bg": "#ebdcb9", "disabled_text": "#705a41" },
        "secondary": { "bg": "#ebdcb9", "text": "#2e2315", "border": "#c4b28d", "hover_bg": "#c4b28d", "hover_text": "#2e2315", "active_bg": "#b5a37e", "disabled_bg": "#fdf6e2", "disabled_text": "#705a41" },
        "success": { "bg": "#10b981", "text": "#ffffff", "border": "transparent", "hover_bg": "#059669", "hover_text": "#ffffff", "active_bg": "#047857", "disabled_bg": "#ebdcb9", "disabled_text": "#705a41" },
        "warning": { "bg": "#f59e0b", "text": "#ffffff", "border": "transparent", "hover_bg": "#d97706", "hover_text": "#ffffff", "active_bg": "#b45309", "disabled_bg": "#ebdcb9", "disabled_text": "#705a41" },
        "danger": { "bg": "#ef4444", "text": "#ffffff", "border": "transparent", "hover_bg": "#dc2626", "hover_text": "#ffffff", "active_bg": "#b91c1c", "disabled_bg": "#ebdcb9", "disabled_text": "#705a41" }
      },
      "product_cards": {
        "bg": "#f4ebd0",
        "border": "#e6d5b8",
        "radius": "16px",
        "title": "#2e2315",
        "price": "#f97316",
        "category": "#705a41",
        "shadow": "0 4px 15px rgba(112,90,65,0.08)",
        "hover_effect": "scale",
        "hover_shadow": "0 10px 25px rgba(249,115,22,0.1)",
        "badge_bg": "#f97316",
        "badge_text": "#ffffff"
      },
      "modal": {
        "bg": "#f4ebd0",
        "border": "#e6d5b8",
        "image_border": "#e6d5b8",
        "price": "#f97316",
        "text": "#2e2315",
        "text_secondary": "#705a41",
        "quantity_bg": "#ebdcb9",
        "quantity_text": "#2e2315",
        "size_active_bg": "#f97316",
        "size_active_text": "#ffffff",
        "size_inactive_bg": "#ebdcb9",
        "size_inactive_text": "#705a41",
        "color_border_active": "#f97316"
      },
      "inputs": {
        "bg": "#fdf6e2",
        "border": "#c4b28d",
        "focus_border": "#f97316",
        "focus_ring": "rgba(249,115,22,0.15)",
        "placeholder": "#a8957e",
        "text": "#2e2315",
        "icons": "#705a41"
      },
      "tables": {
        "header_bg": "#ebdcb9",
        "header_text": "#705a41",
        "row_bg": "#f4ebd0",
        "row_alt_bg": "#ebdcb9",
        "row_hover_bg": "#c4b28d",
        "border": "#e6d5b8",
        "selected_bg": "rgba(249,115,22,0.08)",
        "selected_text": "#f97316"
      },
      "sidebar": {
        "bg": "#f4ebd0",
        "border": "#e6d5b8",
        "text": "#705a41",
        "text_hover": "#2e2315",
        "text_active": "#f97316",
        "bg_active": "rgba(249,115,22,0.08)",
        "bg_hover": "#ebdcb9",
        "icons": "#705a41",
        "icons_active": "#f97316"
      },
      "footer": {
        "bg": "#fdf6e2",
        "border": "#e6d5b8",
        "text": "#705a41",
        "link": "#705a41",
        "link_hover": "#f97316",
        "social_bg": "#f4ebd0",
        "social_text": "#705a41",
        "social_hover_bg": "#f97316",
        "social_hover_text": "#ffffff"
      },
      "shadows": {
        "color": "rgba(46,35,21,0.15)",
        "size": "6px",
        "blur": "20px"
      },
      "scrollbar": {
        "track": "#fdf6e2",
        "thumb": "#c4b28d",
        "thumb_hover": "#f97316"
      },
      "loading": {
        "loader": "#f97316",
        "spinner": "#e6d5b8"
      }
    },
    "fonts": {
      "family": "Tajawal, sans-serif",
      "size_base": "16px"
    },
    "animations": {
      "transition_speed": "0.3s"
    },
    "visuals": {
      "glass_effect": false,
      "blur_intensity": "0px",
      "show_hero_image": true,
      "hero_image_blend": "multiply"
    }
  },
  "Midnight Theme": {
    "name": "Midnight Theme",
    "description": "مظهر غامق بلون كحلي جذاب وتفاصيل عصرية تدمج التكنولوجيا بالفخامة.",
    "is_system": true,
    "colors": {
      "page": {
        "bg": "#0b0f19",
        "bg_secondary": "#161e2e",
        "surface": "#161e2e",
        "text": "#f3f4f6",
        "text_muted": "#9ca3af",
        "selection_bg": "#f97316",
        "selection_text": "#ffffff"
      },
      "brand": {
        "primary": "#f97316",
        "primary_hover": "#ea580c",
        "secondary": "#1f2937",
        "secondary_hover": "#374151"
      },
      "top_nav": {
        "bg": "#161e2e",
        "border": "#1f2937",
        "logo": "#f97316",
        "text": "#f3f4f6",
        "link_active": "#f97316",
        "link_hover": "#ea580c",
        "icons": "#9ca3af",
        "search_bg": "#0b0f19",
        "search_border": "#1f2937",
        "search_text": "#f3f4f6"
      },
      "hero": {
        "bg": "#0b0f19",
        "overlay": "linear-gradient(to bottom, rgba(11,15,25,0.4), rgba(11,15,25,1))",
        "title": "#ffffff",
        "subtitle": "#9ca3af"
      },
      "buttons": {
        "primary": { "bg": "#f97316", "text": "#ffffff", "border": "transparent", "hover_bg": "#ea580c", "hover_text": "#ffffff", "active_bg": "#c2410c", "disabled_bg": "#1f2937", "disabled_text": "#9ca3af" },
        "secondary": { "bg": "#1f2937", "text": "#f3f4f6", "border": "#374151", "hover_bg": "#374151", "hover_text": "#ffffff", "active_bg": "#4b5563", "disabled_bg": "#161e2e", "disabled_text": "#6b7280" },
        "success": { "bg": "#10b981", "text": "#ffffff", "border": "transparent", "hover_bg": "#059669", "hover_text": "#ffffff", "active_bg": "#047857", "disabled_bg": "#1f2937", "disabled_text": "#9ca3af" },
        "warning": { "bg": "#f59e0b", "text": "#ffffff", "border": "transparent", "hover_bg": "#d97706", "hover_text": "#ffffff", "active_bg": "#b45309", "disabled_bg": "#1f2937", "disabled_text": "#9ca3af" },
        "danger": { "bg": "#ef4444", "text": "#ffffff", "border": "transparent", "hover_bg": "#dc2626", "hover_text": "#ffffff", "active_bg": "#b91c1c", "disabled_bg": "#1f2937", "disabled_text": "#9ca3af" }
      },
      "product_cards": {
        "bg": "#161e2e",
        "border": "#1f2937",
        "radius": "16px",
        "title": "#f3f4f6",
        "price": "#f97316",
        "category": "#9ca3af",
        "shadow": "0 4px 20px rgba(0,0,0,0.4)",
        "hover_effect": "scale",
        "hover_shadow": "0 10px 30px rgba(249,115,22,0.15)",
        "badge_bg": "#f97316",
        "badge_text": "#ffffff"
      },
      "modal": {
        "bg": "#161e2e",
        "border": "#1f2937",
        "image_border": "#1f2937",
        "price": "#f97316",
        "text": "#f3f4f6",
        "text_secondary": "#9ca3af",
        "quantity_bg": "#1f2937",
        "quantity_text": "#f3f4f6",
        "size_active_bg": "#f97316",
        "size_active_text": "#ffffff",
        "size_inactive_bg": "#1f2937",
        "size_inactive_text": "#9ca3af",
        "color_border_active": "#f97316"
      },
      "inputs": {
        "bg": "#0b0f19",
        "border": "#374151",
        "focus_border": "#f97316",
        "focus_ring": "rgba(249,115,22,0.2)",
        "placeholder": "#4b5563",
        "text": "#f3f4f6",
        "icons": "#9ca3af"
      },
      "tables": {
        "header_bg": "#1f2937",
        "header_text": "#9ca3af",
        "row_bg": "#161e2e",
        "row_alt_bg": "#1f2937",
        "row_hover_bg": "#374151",
        "border": "#1f2937",
        "selected_bg": "rgba(249,115,22,0.1)",
        "selected_text": "#f97316"
      },
      "sidebar": {
        "bg": "#161e2e",
        "border": "#1f2937",
        "text": "#9ca3af",
        "text_hover": "#f3f4f6",
        "text_active": "#f97316",
        "bg_active": "rgba(249,115,22,0.1)",
        "bg_hover": "#1f2937",
        "icons": "#9ca3af",
        "icons_active": "#f97316"
      },
      "footer": {
        "bg": "#0b0f19",
        "border": "#161e2e",
        "text": "#9ca3af",
        "link": "#9ca3af",
        "link_hover": "#f97316",
        "social_bg": "#161e2e",
        "social_text": "#9ca3af",
        "social_hover_bg": "#f97316",
        "social_hover_text": "#ffffff"
      },
      "shadows": {
        "color": "rgba(0,0,0,0.5)",
        "size": "10px",
        "blur": "40px"
      },
      "scrollbar": {
        "track": "#0b0f19",
        "thumb": "#1f2937",
        "thumb_hover": "#f97316"
      },
      "loading": {
        "loader": "#f97316",
        "spinner": "#1f2937"
      }
    },
    "fonts": {
      "family": "Tajawal, sans-serif",
      "size_base": "16px"
    },
    "animations": {
      "transition_speed": "0.3s"
    },
    "visuals": {
      "glass_effect": false,
      "blur_intensity": "0px",
      "show_hero_image": true,
      "hero_image_blend": "overlay"
    }
  },
  "Light Theme": {
    "name": "Light Theme",
    "description": "المظهر الفاتح الناصع والمريح للعين.",
    "is_system": true,
    "colors": {
      "page": { "bg": "#ebf3fa", "bg_secondary": "#ffffff", "surface": "#ffffff", "text": "#0f172a", "text_muted": "#475569" },
      "brand": { "primary": "#0284c7" },
      "buttons": { "style_preset": "rounded-lg" },
      "product_cards": { "style_preset": "modern-glass" }
    }
  },
  "Dark Theme": {
    "name": "Dark Theme",
    "description": "المظهر الداكن الفاخر والسينمائي المعزز.",
    "is_system": true,
    "colors": {
      "page": { "bg": "#0b1329", "bg_secondary": "#0f172a", "surface": "#0f172a", "text": "#f8fafc", "text_muted": "#cbd5e1" },
      "brand": { "primary": "#0284c7" },
      "buttons": { "style_preset": "rounded-lg" },
      "product_cards": { "style_preset": "modern-glass" }
    }
  },
  "Midnight Theme": {
    "name": "Midnight Theme",
    "description": "مظهر غامق بلون كحلي جذاب وتفاصيل فاخرة.",
    "is_system": true,
    "colors": {
      "page": { "bg": "#090d16", "bg_secondary": "#0d1322", "surface": "#0d1322", "text": "#f1f5f9", "text_muted": "#94a3b8" },
      "brand": { "primary": "#38bdf8" },
      "buttons": { "style_preset": "rounded-lg" },
      "product_cards": { "style_preset": "modern-glass" }
    }
  }
};

// Aliases for system themes matching catalog names
DEFAULT_THEMES["Light Theme"].colors = DEFAULT_THEMES["UltraSoft Light Theme"].colors;
DEFAULT_THEMES["Dark Theme"].colors = DEFAULT_THEMES["UltraSoft Dark Theme"].colors;
DEFAULT_THEMES["Midnight Theme"].colors = DEFAULT_THEMES["UltraSoft Dark Theme"].colors;

/**
 * Extract complete theme variables robustly regardless of structure wrapper
 */
export function extractThemeVariables(themeObj) {
  if (!themeObj) return DEFAULT_THEMES["UltraSoft Dark Theme"].colors;

  // 1. Check parsed colors
  const parsed = parseThemeColors(themeObj);
  if (parsed && parsed.page && parsed.page.bg) {
    return parsed;
  }

  // 2. Check themeObj.colors.colors
  if (themeObj.colors && themeObj.colors.colors && themeObj.colors.colors.page) {
    return themeObj.colors.colors;
  }

  // 3. Check themeObj.colors
  if (themeObj.colors && themeObj.colors.page) {
    return themeObj.colors;
  }

  // 4. Check themeObj.variables
  if (themeObj.variables && themeObj.variables.page) {
    return themeObj.variables;
  }
  if (themeObj.variables && themeObj.variables.colors && themeObj.variables.colors.page) {
    return themeObj.variables.colors;
  }

  // 5. Check DEFAULT_THEMES by name or theme_key
  const name = themeObj.name || themeObj.theme_key;
  if (name && DEFAULT_THEMES[name] && DEFAULT_THEMES[name].colors) {
    return DEFAULT_THEMES[name].colors;
  }

  // 6. Name match fallback
  const strName = String(name || '');
  if (strName.includes('Light')) return DEFAULT_THEMES["UltraSoft Light Theme"].colors;
  if (strName.includes('Warm')) return DEFAULT_THEMES["Warm Theme"].colors;

  return DEFAULT_THEMES["UltraSoft Dark Theme"].colors;
}

DEFAULT_THEMES["Dark Theme"] = DEFAULT_THEMES["UltraSoft Dark Theme"];
DEFAULT_THEMES["Light Theme"] = DEFAULT_THEMES["UltraSoft Light Theme"];

export function parseThemeColors(theme) {
  if (!theme) return null;

  const themeName = theme.name || theme.theme_key;
  if (themeName && DEFAULT_THEMES[themeName]) {
    const sysDef = DEFAULT_THEMES[themeName];
    if (sysDef && sysDef.colors && sysDef.colors.page) {
      let dbColors = theme.colors;
      if (dbColors && dbColors.colors && dbColors.colors.page) {
        return dbColors.colors;
      }
      if (dbColors && dbColors.page) {
        return dbColors;
      }
      return sysDef.colors;
    }
  }

  if (themeName === 'Light Theme' && DEFAULT_THEMES['UltraSoft Light Theme']) {
    return DEFAULT_THEMES['UltraSoft Light Theme'].colors;
  }
  if (themeName === 'Dark Theme' || themeName === 'Midnight Theme') {
    return DEFAULT_THEMES['UltraSoft Dark Theme'].colors;
  }
  if (themeName === 'Warm Theme') {
    return DEFAULT_THEMES['UltraSoft Light Theme'].colors;
  }

  let raw = theme;
  if (theme.colors) {
    raw = theme.colors;
    if (raw.colors && raw.colors.page) raw = raw.colors;
  } else if (theme.variables) {
    raw = theme.variables;
    if (raw.colors && raw.colors.page) raw = raw.colors;
  }

  if (raw && raw.page && typeof raw.page === 'object' && raw.page.bg) {
    return raw;
  }

  if (raw && raw.bg) {
    return {
      page: {
        bg: raw.bg,
        bg_secondary: raw.bg_secondary || raw.surface || '#ffffff',
        surface: raw.surface || '#ffffff',
        text: raw.text || '#0f172a',
        text_muted: raw.text_muted || '#475569'
      },
      brand: raw.brand || { primary: '#0284c7', primary_hover: '#0369a1' },
      borders: raw.borders || { color: '#cbd5e1' }
    };
  }

  const sysDefault = DEFAULT_THEMES["UltraSoft Dark Theme"] || DEFAULT_THEMES["Dark Theme"];
  return sysDefault ? sysDefault.colors : null;
}

/**
 * Apply the theme config values to HTML body and create dynamic style rules.
 */
export function applyTheme(theme) {
  if (!theme) return;
  const colors = parseThemeColors(theme);
  if (!colors || !colors.page) return;

  const config = theme.variables || theme.colors || theme;
  const fonts = config.fonts || theme.fonts || colors.fonts || {};
  const animations = config.animations || theme.animations || colors.animations || {};
  const visuals = config.visuals || theme.visuals || colors.visuals || {};

  // 1. Get or create stylesheet
  let styleEl = document.getElementById('devo-theme-styles-dynamic');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'devo-theme-styles-dynamic';
    document.head.appendChild(styleEl);
  }

  const pageBg = colors.page.bg || '#0f172a';
  const pageSurface = colors.page.bg_secondary || colors.page.surface || '#1e293b';
  const brandPrimary = colors.brand?.primary || '#0284c7';
  const brandPrimaryHover = colors.brand?.primary_hover || '#0369a1';
  const pageText = colors.page.text || '#f8fafc';
  const pageMuted = colors.page.text_muted || '#cbd5e1';

  const isLightPageBg = isHexColorLight(pageBg);
  const defaultGray = isLightPageBg ? (colors.brand?.secondary || '#cbd5e1') : '#262626';
  const defaultGrayHover = isLightPageBg ? (colors.brand?.secondary_hover || '#94a3b8') : '#404040';
  const grayColor = colors.borders?.color || defaultGray;
  const grayHoverColor = colors.brand?.secondary_hover || defaultGrayHover;

  // 2. Build CSS Variables block
  let cssText = `
    :root {
      /* Page Level Backgrounds & Texts */
      --devo-black: ${pageBg} !important;
      --devo-dark: ${pageSurface} !important;
      --devo-gray: ${grayColor} !important;
      --devo-gray-hover: ${grayHoverColor} !important;
      --devo-orange: ${brandPrimary} !important;
      --devo-orange-hover: ${brandPrimaryHover} !important;
      --devo-text: ${pageText} !important;
      --devo-muted: ${pageMuted} !important;
      --devo-success: ${colors.alerts?.success?.text || '#10b981'} !important;
      --devo-error: ${colors.alerts?.error?.text || '#ef4444'} !important;
      --devo-warning: ${colors.alerts?.warning?.text || '#f59e0b'} !important;
      --devo-info: ${colors.alerts?.info?.text || '#3b82f6'} !important;

      /* Selection Color */
      --selection-bg: ${colors.page.selection_bg || '#f97316'} !important;
      --selection-text: ${colors.page.selection_text || '#ffffff'} !important;

      /* Shadows */
      --shadow-color: ${colors.shadows?.color || 'rgba(0,0,0,0.8)'} !important;
      --shadow-size: ${colors.shadows?.size || '10px'} !important;
      --shadow-blur: ${colors.shadows?.blur || '40px'} !important;
      --shadow-devo-float: 0 var(--shadow-size) var(--shadow-blur) -10px var(--shadow-color) !important;

      /* Borders */
      --border-color: ${grayColor} !important;
      --border-width: ${colors.borders?.width || '1px'} !important;
      --border-radius-base: ${colors.borders?.radius || '12px'} !important;

      /* Scrollbar */
      --scrollbar-track: ${colors.scrollbar?.track || '#0a0a0a'} !important;
      --scrollbar-thumb: ${colors.scrollbar?.thumb || '#262626'} !important;
      --scrollbar-thumb-hover: ${colors.scrollbar?.thumb_hover || '#f97316'} !important;

      /* Loader */
      --loader-color: ${colors.loading?.loader || '#f97316'} !important;
      --spinner-track: ${colors.loading?.spinner || '#262626'} !important;

      /* Transitions */
      --transition-speed: ${animations.transition_speed || '0.3s'} !important;

      /* Fonts */
      --font-family: ${fonts.family || "'Tajawal', sans-serif"} !important;
      --font-size-base: ${fonts.size_base || '16px'} !important;
    }

    body {
      background-color: var(--devo-black) !important;
      color: var(--devo-text) !important;
      font-family: var(--font-family) !important;
      font-size: var(--font-size-base) !important;
    }

    body, input, select, textarea, button, span, p, h1, h2, h3, h4, h5, h6, td, th {
      font-family: var(--font-family) !important;
    }

    ::selection {
      background-color: var(--selection-bg) !important;
      color: var(--selection-text) !important;
    }

    /* Scrollbars Custom Overrides */
    ::-webkit-scrollbar {
      width: 6px !important;
      height: 6px !important;
    }
    ::-webkit-scrollbar-track {
      background: var(--scrollbar-track) !important;
    }
    ::-webkit-scrollbar-thumb {
      background: var(--scrollbar-thumb) !important;
      border-radius: 4px !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: var(--scrollbar-thumb-hover) !important;
    }

    /* Target loaders / spinners */
    .ph-spinner {
      color: var(--loader-color) !important;
    }

    /* Coordinated Text Fixes for Light/Warm Themes */
    .text-neutral-400, .text-gray-400, .text-zinc-400, .text-neutral-500, .text-gray-500, .text-zinc-500 {
      color: var(--devo-muted) !important;
    }

    /* Nested text-white inside light backgrounds should adapt color to match primary text under light themes */
    .bg-devo-black .text-white, .bg-devo-dark .text-white, .bg-devo-gray .text-white,
    .bg-devo-black .text-white\\/90, .bg-devo-dark .text-white\\/90, .bg-devo-gray .text-white\\/90,
    .bg-devo-black .text-white\\/80, .bg-devo-dark .text-white\\/80, .bg-devo-gray .text-white\\/80,
    .bg-devo-black\\/80 .text-white, .bg-devo-dark\\/80 .text-white, .bg-devo-gray\\/80 .text-white,
    .bg-devo-black\\/90 .text-white, .bg-devo-dark\\/90 .text-white, .bg-devo-gray\\/90 .text-white,
    .bg-devo-black\\/95 .text-white, .bg-devo-dark\\/95 .text-white, .bg-devo-gray\\/95 .text-white,
    .bg-devo-black\\/50 .text-white, .bg-devo-dark\\/50 .text-white, .bg-devo-gray\\/50 .text-white,
    .bg-devo-black\\/30 .text-white, .bg-devo-dark\\/30 .text-white, .bg-devo-gray\\/30 .text-white {
      color: ${isLightPageBg ? 'var(--devo-text)' : '#ffffff'} !important;
    }

    ${isLightPageBg ? `
      .bg-devo-gray, .bg-devo-gray\\/80, .bg-devo-gray\\/50 {
        color: var(--devo-text);
      }
    ` : ''}
  `;

  // 3. Modals & Shadows Overrides
  cssText += `
    .shadow-devo-float, .shadow-2xl {
      box-shadow: var(--shadow-devo-float) !important;
    }
  `;

  // 3.5. Inactive Navigation Links Readability Overrides
  cssText += `
    header [data-nav-view].text-devo-muted,
    .top-navigation [data-nav-view].text-devo-muted,
    #mobile-nav-links [data-nav-view].text-devo-muted {
      color: ${isLightPageBg ? 'rgba(0, 0, 0, 0.65)' : 'rgba(255, 255, 255, 0.75)'} !important;
    }
    header [data-nav-view].text-devo-muted:hover,
    .top-navigation [data-nav-view].text-devo-muted:hover,
    #mobile-nav-links [data-nav-view].text-devo-muted:hover {
      color: ${isLightPageBg ? 'var(--devo-text)' : '#ffffff'} !important;
    }
  `;

  // 4. Top Navigation Overrides
  if (colors.top_nav) {
    cssText += `
      /* Header & Topnav Elements */
      header, .top-navigation, #admin-topbar, .bg-devo-dark.border-b.border-devo-gray {
        background-color: ${colors.top_nav.bg} !important;
        border-color: ${colors.top_nav.border} !important;
        color: ${colors.top_nav.text} !important;
      }
      header a, .top-navigation a, #admin-topbar a {
        color: ${colors.top_nav.text} !important;
      }
      header a.active, .top-navigation a.active, #admin-topbar a.active {
        color: ${colors.top_nav.link_active} !important;
      }
      header a:hover, .top-navigation a:hover, #admin-topbar a:hover {
        color: ${colors.top_nav.link_hover} !important;
      }
      header i, .top-navigation i, #admin-topbar i {
        color: ${colors.top_nav.icons} !important;
      }
      header input, .top-navigation input, #admin-topbar input {
        background-color: ${colors.top_nav.search_bg} !important;
        border-color: ${colors.top_nav.search_border} !important;
        color: ${colors.top_nav.search_text} !important;
      }
    `;
  }

  // 5. Hero Overrides
  // 5. Hero Overrides
  if (colors.hero) {
    cssText += `
      .hero-bg, [data-theme-hero="true"] {
        background-color: ${colors.hero.bg} !important;
      }
    `;
  }

  // 6. Buttons Styling
  if (colors.buttons) {
    const btnTypes = ['primary', 'secondary', 'success', 'warning', 'danger'];
    const stylePreset = colors.buttons.style_preset || 'solid';
    
    btnTypes.forEach(type => {
      const btn = colors.buttons[type];
      if (btn) {
        let bg = btn.bg;
        let text = btn.text;
        let border = btn.border || 'transparent';
        let hoverBg = btn.hover_bg;
        let hoverText = btn.hover_text || btn.text;
        let borderRadiusCss = '';

        if (stylePreset === 'outlined' && type === 'primary') {
          bg = 'transparent';
          text = btn.bg;
          border = `2px solid ${btn.bg}`;
          hoverBg = btn.bg;
          hoverText = '#ffffff';
        } else if (stylePreset === 'soft' && type === 'primary') {
          bg = `${btn.bg}1a`; // 10% opacity
          text = btn.bg;
          border = '1px solid transparent';
          hoverBg = btn.bg;
          hoverText = '#ffffff';
        } else if (stylePreset === 'rounded-pill') {
          borderRadiusCss = 'border-radius: 9999px !important;';
        }

        cssText += `
          .btn-${type}, button.btn-${type}, [data-btn="${type}"] {
            background-color: ${bg} !important;
            color: ${text} !important;
            border: ${border === 'transparent' ? '1px solid transparent' : border} !important;
            ${borderRadiusCss}
          }
          .btn-${type}:hover, button.btn-${type}:hover, [data-btn="${type}"]:hover {
            background-color: ${hoverBg} !important;
            color: ${hoverText} !important;
            border-color: ${type === 'primary' && stylePreset === 'outlined' ? btn.bg : 'transparent'} !important;
          }
          .btn-${type}:active, button.btn-${type}:active, [data-btn="${type}"]:active {
            background-color: ${btn.active_bg || btn.hover_bg} !important;
          }
          .btn-${type}:disabled, button.btn-${type}:disabled, [data-btn="${type}"]:disabled {
            background-color: ${btn.disabled_bg || '#262626'} !important;
            color: ${btn.disabled_text || '#a3a3a3'} !important;
            border-color: transparent !important;
            cursor: not-allowed;
            opacity: 0.6;
          }
        `;
      }
    });
  }

  // 7. Inputs Overrides
  if (colors.inputs) {
    cssText += `
      input:not([type="checkbox"]):not([type="radio"]):not([type="color"]), select, textarea {
        background-color: ${colors.inputs.bg} !important;
        border-color: ${colors.inputs.border} !important;
        color: ${colors.inputs.text} !important;
      }
      input::placeholder, textarea::placeholder, select::placeholder {
        color: ${colors.inputs.placeholder} !important;
      }
      input:focus, select:focus, textarea:focus {
        border-color: ${colors.inputs.focus_border} !important;
        box-shadow: 0 0 0 2px ${colors.inputs.focus_ring} !important;
        outline: none !important;
      }
    `;
  }

  // 8. Tables Styling
  if (colors.tables) {
    cssText += `
      table {
        border-color: ${colors.tables.border} !important;
      }
      table border-devo-gray {
        border-color: ${colors.tables.border} !important;
      }
      thead, thead th, table th, tr.bg-devo-dark\\/50 {
        background-color: ${colors.tables.header_bg} !important;
        color: ${colors.tables.header_text} !important;
      }
      tbody tr, table tr {
        background-color: ${colors.tables.row_bg} !important;
        border-bottom: 1px solid ${colors.tables.border} !important;
      }
      tbody tr:nth-child(even), table tr:nth-child(even) {
        background-color: ${colors.tables.row_alt_bg || colors.tables.row_bg} !important;
      }
      tbody tr:hover, table tr:hover {
        background-color: ${colors.tables.row_hover_bg} !important;
      }
      tbody tr.selected, table tr.selected {
        background-color: ${colors.tables.selected_bg} !important;
        color: ${colors.tables.selected_text} !important;
      }
    `;
  }

  // 9. Sidebar Overrides
  if (colors.sidebar) {
    cssText += `
      #main-sidebar, aside {
        background-color: ${colors.sidebar.bg} !important;
        border-color: ${colors.sidebar.border} !important;
      }
      #main-sidebar .nav-link, aside a, .sidebar-item {
        color: ${colors.sidebar.text} !important;
      }
      #main-sidebar .nav-link:hover, aside a:hover, .sidebar-item:hover {
        background-color: ${colors.sidebar.bg_hover} !important;
        color: ${colors.sidebar.text_hover} !important;
      }
      #main-sidebar .nav-link.bg-devo-orange\\/10, #main-sidebar .nav-link.text-devo-orange, aside a.active, .sidebar-item.active {
        background-color: ${colors.sidebar.bg_active} !important;
        color: ${colors.sidebar.text_active} !important;
      }
      #main-sidebar .nav-link i, aside a i, .sidebar-item i {
        color: ${colors.sidebar.icons} !important;
      }
      #main-sidebar .nav-link.bg-devo-orange\\/10 i, #main-sidebar .nav-link.text-devo-orange i, aside a.active i, .sidebar-item.active i {
        color: ${colors.sidebar.icons_active} !important;
      }
    `;
  }

  // 10. Footer Overrides
  if (colors.footer) {
    cssText += `
      footer {
        background-color: ${colors.footer.bg} !important;
        border-color: ${colors.footer.border} !important;
        color: ${colors.footer.text} !important;
      }
      footer a, footer button {
        color: ${colors.footer.link} !important;
      }
      footer a:hover, footer button:hover {
        color: ${colors.footer.link_hover} !important;
      }
      footer .social-btn, footer a[id^="link-"] {
        background-color: ${colors.footer.social_bg} !important;
        color: ${colors.footer.social_text} !important;
      }
      footer .social-btn:hover, footer a[id^="link-"]:hover {
        background-color: ${colors.footer.social_hover_bg} !important;
        color: ${colors.footer.social_hover_text} !important;
      }
    `;
  }

  // 11. Cards Styling
  // 11. Cards Styling
  if (colors.cards || colors.product_cards) {
    const cardPreset = colors.product_cards?.style_preset || 'bordered';
    let cardBg = colors.cards?.product?.bg || colors.product_cards?.bg || '#171717';
    let cardBorder = colors.cards?.product?.border || colors.product_cards?.border || '#262626';
    let cardRadius = colors.cards?.product?.radius || colors.product_cards?.radius || '16px';
    let cardShadow = colors.cards?.product?.shadow || colors.product_cards?.shadow || '0 4px 15px rgba(0,0,0,0.05)';
    let cardBackdrop = '';

    if (cardPreset === 'bordered') {
      cardShadow = 'none !important';
    } else if (cardPreset === 'shadowed') {
      cardBorder = 'transparent !important';
      const isLightBg = colors.page?.bg ? isHexColorLight(colors.page.bg) : false;
      cardShadow = isLightBg ? '0 10px 30px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.01) !important' : '0 10px 30px rgba(0,0,0,0.4) !important';
    } else if (cardPreset === 'glass') {
      const isLightBg = colors.page?.bg ? isHexColorLight(colors.page.bg) : false;
      cardBg = isLightBg ? 'rgba(255,255,255,0.4) !important' : 'rgba(0,0,0,0.3) !important';
      cardBorder = isLightBg ? 'rgba(0,0,0,0.08) !important' : 'rgba(255,255,255,0.08) !important';
      cardBackdrop = 'backdrop-filter: blur(12px) !important; -webkit-backdrop-filter: blur(12px) !important;';
    }

    // Fallbacks for specific cards (statistics, dashboard, order)
    const statBg = colors.cards?.statistics?.bg || cardBg;
    const statBorder = colors.cards?.statistics?.border || cardBorder;
    const statRadius = colors.cards?.statistics?.radius || cardRadius;
    const statShadow = colors.cards?.statistics?.shadow || cardShadow;

    const dashBg = colors.cards?.dashboard?.bg || cardBg;
    const dashBorder = colors.cards?.dashboard?.border || cardBorder;
    const dashRadius = colors.cards?.dashboard?.radius || cardRadius;
    const dashShadow = colors.cards?.dashboard?.shadow || cardShadow;

    const orderBg = colors.cards?.order?.bg || cardBg;
    const orderBorder = colors.cards?.order?.border || cardBorder;
    const orderRadius = colors.cards?.order?.radius || cardRadius;
    const orderShadow = colors.cards?.order?.shadow || cardShadow;

    // Product cards (gallery, home, warehouse)
    cssText += `
      .product-card, [data-card-type="product"], .card-hover {
        background-color: ${cardBg} !important;
        border-color: ${cardBorder} !important;
        border-radius: ${cardRadius} !important;
        box-shadow: ${cardShadow} !important;
        ${cardBackdrop}
        transition: transform var(--transition-speed), box-shadow var(--transition-speed) !important;
      }
      .product-card:hover, [data-card-type="product"]:hover, .card-hover:hover {
        box-shadow: ${colors.product_cards?.hover_shadow || '0 10px 30px rgba(0,0,0,0.1)'} !important;
        ${colors.cards?.product?.hover_anim === 'translate-y' || colors.product_cards?.hover_effect === 'translate-y' ? 'transform: translateY(-4px) !important;' : ''}
        ${colors.cards?.product?.hover_anim === 'scale' || colors.product_cards?.hover_effect === 'scale' ? 'transform: scale(1.02) !important;' : ''}
      }
      .product-card h3, .product-card h4 {
        color: ${colors.product_cards?.title || colors.page.text} !important;
      }
      .product-card .price {
        color: ${colors.product_cards?.price || colors.brand.primary} !important;
      }
      .product-card .category {
        color: ${colors.product_cards?.category || colors.page.text_muted} !important;
      }

      /* Statistics Cards */
      .stat-card, [data-card-type="statistics"] {
        background-color: ${statBg} !important;
        border-color: ${statBorder} !important;
        border-radius: ${statRadius} !important;
        box-shadow: ${statShadow} !important;
      }
      
      /* Dashboard Cards */
      .dashboard-card, [data-card-type="dashboard"] {
        background-color: ${dashBg} !important;
        border-color: ${dashBorder} !important;
        border-radius: ${dashRadius} !important;
        box-shadow: ${dashShadow} !important;
      }
      
      /* Order Cards */
      .order-card, [data-card-type="order"], .bg-devo-dark.border.border-devo-gray.rounded-xl.p-4 {
        background-color: ${orderBg} !important;
        border-color: ${orderBorder} !important;
        border-radius: ${orderRadius} !important;
        box-shadow: ${orderShadow} !important;
      }
    `;
  }

  // 12. Alerts & Badges Overrides
  if (colors.alerts) {
    const successBg = colors.alerts.success?.bg || 'rgba(16, 185, 129, 0.1)';
    const successText = colors.alerts.success?.text || '#10b981';
    const successBorder = colors.alerts.success?.border || 'rgba(16, 185, 129, 0.2)';

    const errorBg = colors.alerts.error?.bg || 'rgba(239, 68, 68, 0.1)';
    const errorText = colors.alerts.error?.text || '#ef4444';
    const errorBorder = colors.alerts.error?.border || 'rgba(239, 68, 68, 0.2)';

    const warningBg = colors.alerts.warning?.bg || 'rgba(245, 158, 11, 0.1)';
    const warningText = colors.alerts.warning?.text || '#f59e0b';
    const warningBorder = colors.alerts.warning?.border || 'rgba(245, 158, 11, 0.2)';

    const infoBg = colors.alerts.info?.bg || 'rgba(59, 130, 246, 0.1)';
    const infoText = colors.alerts.info?.text || '#3b82f6';
    const infoBorder = colors.alerts.info?.border || 'rgba(59, 130, 246, 0.2)';

    cssText += `
      .alert-success, .bg-devo-success\\/10 { background-color: ${successBg} !important; color: ${successText} !important; border-color: ${successBorder} !important; }
      .alert-error, .alert-danger, .bg-devo-error\\/10 { background-color: ${errorBg} !important; color: ${errorText} !important; border-color: ${errorBorder} !important; }
      .alert-warning, .bg-devo-warning\\/10 { background-color: ${warningBg} !important; color: ${warningText} !important; border-color: ${warningBorder} !important; }
      .alert-info, .bg-devo-info\\/10 { background-color: ${infoBg} !important; color: ${infoText} !important; border-color: ${infoBorder} !important; }
    `;
  }
  if (colors.badges) {
    const orangeBg = colors.badges.orange?.bg || colors.brand?.primary || '#f97316';
    const orangeText = colors.badges.orange?.text || '#ffffff';

    const successBg = colors.badges.success?.bg || '#10b981';
    const successText = colors.badges.success?.text || '#ffffff';

    const errorBg = colors.badges.error?.bg || '#ef4444';
    const errorText = colors.badges.error?.text || '#ffffff';

    const warningBg = colors.badges.warning?.bg || '#f59e0b';
    const warningText = colors.badges.warning?.text || '#ffffff';

    const infoBg = colors.badges.info?.bg || '#3b82f6';
    const infoText = colors.badges.info?.text || '#ffffff';

    cssText += `
      .badge-orange, .badge-primary, .bg-devo-orange { background-color: ${orangeBg} !important; color: ${orangeText} !important; }
      .badge-success, .bg-devo-success { background-color: ${successBg} !important; color: ${successText} !important; }
      .badge-error, .badge-danger, .bg-devo-error { background-color: ${errorBg} !important; color: ${errorText} !important; }
      .badge-warning, .bg-devo-warning { background-color: ${warningBg} !important; color: ${warningText} !important; }
      .badge-info, .bg-devo-info { background-color: ${infoBg} !important; color: ${infoText} !important; }
    `;
  }

  // 13. Product Details Modal Overrides
  if (colors.modal) {
    cssText += `
      #order-details-modal > div, #product-details-modal > div, [data-modal="details"] {
        background-color: ${colors.modal.bg} !important;
        border-color: ${colors.modal.border} !important;
      }
      #order-details-modal img, #product-details-modal img {
        border-color: ${colors.modal.image_border} !important;
      }
      .price-text, .text-devo-orange {
        color: ${colors.modal.price} !important;
      }
      #order-details-modal .text-white, #product-details-modal .text-white, [data-modal="details"] .text-white {
        color: ${colors.page.text} !important;
      }
      /* Quantity Counter Controls */
      .qty-control, .quantity-control {
        background-color: ${colors.modal.quantity_bg} !important;
        color: ${colors.modal.quantity_text} !important;
      }
      /* Size Selector Controls */
      .size-option, .size-selector-btn {
        background-color: ${colors.modal.size_inactive_bg} !important;
        color: ${colors.modal.size_inactive_text} !important;
      }
      .size-option.active, .size-selector-btn.active {
        background-color: ${colors.modal.size_active_bg} !important;
        color: ${colors.modal.size_active_text} !important;
      }
      /* Color Selector Controls */
      .color-option.active {
        border-color: ${colors.modal.color_border_active} !important;
        box-shadow: 0 0 0 2px ${colors.modal.color_border_active} !important;
      }
    `;
  }

  // 14. Toasts & Cart Overrides
  if (colors.toasts) {
    cssText += `
      .toast-container > div, #toast-container > div {
        background-color: ${colors.toasts.bg} !important;
        border: 1px solid ${colors.toasts.border} !important;
        color: ${colors.toasts.text} !important;
      }
    `;
  }
  if (colors.cart) {
    cssText += `
      #cart-sidebar, .cart-sidebar {
        background-color: ${colors.cart.bg} !important;
        border-color: ${colors.cart.border} !important;
        color: ${colors.cart.text} !important;
      }
      .cart-totals {
        background-color: ${colors.cart.totals_bg} !important;
        color: ${colors.cart.totals_text} !important;
      }
    `;
  }

  styleEl.innerHTML = cssText;

  // Re-apply Hero Background Fades & Settings to match new active theme colors immediately
  if (typeof window.loadHeroSettings === 'function') {
    try { window.loadHeroSettings(true); } catch (e) {}
  }
}

/**
 * Sync the active theme from the database.
 * Updates local cache and applies theme changes.
 */
export async function syncActiveTheme() {
  try {
    const currentTenantId = getCurrentTenantId();
    let activeThemeId = null;

    if (currentTenantId) {
      // 1. محاولة القراءة من جدول tenant_branding_settings المنظم أولاً
      try {
        const { data: brandRow } = await supabase
          .from('tenant_branding_settings')
          .select('active_theme_id')
          .eq('tenant_id', currentTenantId)
          .maybeSingle();

        if (brandRow && brandRow.active_theme_id) {
          activeThemeId = brandRow.active_theme_id;
        }
      } catch (err) {}

      // 2. كاش احتياطي من home_settings
      if (!activeThemeId) {
        const { data: tenantSetting } = await supabase
          .from('home_settings')
          .select('setting_value')
          .eq('tenant_id', currentTenantId)
          .eq('setting_key', 'active_theme_id')
          .maybeSingle();

        if (tenantSetting && tenantSetting.setting_value) {
          activeThemeId = tenantSetting.setting_value;
        }
      }
    }

    let theme = null;
    try {
      if (activeThemeId) {
        const { data } = await supabase
          .from('themes')
          .select('*')
          .eq('id', activeThemeId)
          .maybeSingle();
        theme = data;
      }

      if (!theme) {
        const { data } = await supabase
          .from('themes')
          .select('*')
          .eq('is_active', true)
          .maybeSingle();
        theme = data;
      }
    } catch(tErr) {
      console.warn('Themes fetching warning (using fallback default theme):', tErr);
    }

    if (theme) {
      const themeColors = theme.colors?.colors ? theme.colors : (theme.colors || {});
      const cachedStr = localStorage.getItem(`ultrasoft_active_theme_${currentTenantId}`) || localStorage.getItem('devo_active_theme');
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        const cachedColors = cached.colors?.colors ? cached.colors.colors : (cached.colors || {});
        const targetColors = themeColors.colors || themeColors;
        if (cached.id !== theme.id || JSON.stringify(cachedColors) !== JSON.stringify(targetColors)) {
          updateCacheAndApply(theme, currentTenantId);
        } else {
          applyTheme(cached);
        }
      } else {
        updateCacheAndApply(theme, currentTenantId);
      }
    } else {
      loadCachedOrFallback();
    }
  } catch (e) {
    console.error('Failed to sync active theme:', e);
    loadCachedOrFallback();
  }
}

function updateCacheAndApply(dbTheme, tenantId = '') {
  const themeData = dbTheme.colors?.colors ? dbTheme.colors : (dbTheme.colors || {});
  const themeObj = {
    id: dbTheme.id,
    name: dbTheme.name,
    theme_key: dbTheme.theme_key,
    created_at: dbTheme.created_at,
    colors: themeData.colors || themeData,
    fonts: themeData.fonts || {},
    animations: themeData.animations || {},
    visuals: themeData.visuals || {}
  };
  const key = tenantId ? `ultrasoft_active_theme_${tenantId}` : 'ultrasoft_active_theme';
  localStorage.setItem(key, JSON.stringify(themeObj));
  localStorage.setItem('devo_active_theme', JSON.stringify(themeObj));
  applyTheme(themeObj);
}

function loadCachedOrFallback() {
  const cachedStr = localStorage.getItem('devo_active_theme');
  if (cachedStr) {
    try {
      applyTheme(JSON.parse(cachedStr));
    } catch (e) {
      applyTheme(DEFAULT_THEMES["Dark Theme"]);
    }
  } else {
    applyTheme(DEFAULT_THEMES["Dark Theme"]);
  }
}

// --- Admin Panel API Operations ---

export async function loadAllThemes() {
  try {
    const currentTenantId = getCurrentTenantId();
    
    // Fetch all themes from database
    const { data, error } = await supabase
      .from('themes')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;

    let activeThemeIdFromSettings = null;
    if (currentTenantId) {
      try {
        const { data: setRes } = await supabase
          .from('home_settings')
          .select('setting_value')
          .eq('tenant_id', currentTenantId)
          .eq('setting_key', 'active_theme_id')
          .maybeSingle();
        if (setRes && setRes.setting_value) {
          activeThemeIdFromSettings = setRes.setting_value;
        }
      } catch (e) {}
    }

    if (data && data.length > 0) {
      // System themes show for everyone. Custom factory themes show ONLY to the factory that created them.
      const processed = data
        .filter(t => {
          // If theme explicitly has a tenant_id or is marked as non-system, verify ownership
          if (t.tenant_id || t.is_system === false) {
            if (!currentTenantId) return false;
            return String(t.tenant_id) === String(currentTenantId);
          }
          // Default unassigned system themes show for everyone
          return true;
        })
        .map(t => {
          const isSystemTheme = (t.is_system !== undefined && t.is_system !== null) 
            ? Boolean(t.is_system) 
            : !t.tenant_id;
          const isActive = activeThemeIdFromSettings 
            ? String(t.id) === String(activeThemeIdFromSettings)
            : Boolean(t.is_active);
          return {
            ...t,
            is_system: isSystemTheme,
            is_active: isActive
          };
        });

      return processed;
    }

    // Default system themes fallback if table is empty
    const systemNames = ["UltraSoft Dark Theme", "UltraSoft Light Theme"];
    return systemNames.map((name, index) => ({
      id: index === 0 ? '00000000-0000-0000-0000-000000000001' : '00000000-0000-0000-0000-000000000002',
      name: name,
      theme_key: name.toLowerCase().replace(/\s+/g, '-'),
      description: DEFAULT_THEMES[name].description,
      is_system: true,
      is_active: activeThemeIdFromSettings ? String(activeThemeIdFromSettings).includes(String(index + 1)) : index === 0,
      variables: DEFAULT_THEMES[name],
      colors: DEFAULT_THEMES[name].colors
    }));

  } catch (e) {
    console.warn('Using system themes list fallback. Error:', e.message);
    const systemNames = ["UltraSoft Dark Theme", "UltraSoft Light Theme"];
    return systemNames.map((name, index) => ({
      id: index === 0 ? '00000000-0000-0000-0000-000000000001' : '00000000-0000-0000-0000-000000000002',
      name: name,
      theme_key: name.toLowerCase().replace(/\s+/g, '-'),
      description: DEFAULT_THEMES[name].description,
      is_system: true,
      is_active: index === 0,
      variables: DEFAULT_THEMES[name],
      colors: DEFAULT_THEMES[name].colors
    }));
  }
}

export async function createNewTheme(name, baseOnThemeVariables, description = '') {
  const currentTenantId = getCurrentTenantId();
  const fullThemeData = {
    ...baseOnThemeVariables,
    description: description || 'تم إنشاؤه مخصصاً بواسطة لوحة التحكم.'
  };

  const payload = {
    name: name,
    theme_key: 'custom-' + Date.now(),
    colors: fullThemeData,
    is_active: false,
    is_system: false
  };

  if (currentTenantId) {
    payload.tenant_id = currentTenantId;
  }

  try {
    const { data, error } = await supabase
      .from('themes')
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Full payload insert fallback:', err.message);
    const { data, error } = await supabase
      .from('themes')
      .insert({
        name: name,
        colors: fullThemeData,
        is_active: false
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export async function updateTheme(themeId, variables, description) {
  const fullThemeData = {
    ...variables,
    ...(description ? { description } : {})
  };

  const { data, error } = await supabase
    .from('themes')
    .update({
      colors: fullThemeData
    })
    .eq('id', themeId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function activateTheme(themeId) {
  if (!themeId) return null;
  const currentTenantId = getCurrentTenantId();

  // 1. Save active theme for this tenant in tenant_branding_settings and home_settings
  if (currentTenantId) {
    try {
      await supabase
        .from('tenant_branding_settings')
        .upsert({
          tenant_id: currentTenantId,
          active_theme_id: themeId,
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id' });
    } catch (e) {
      console.warn('Saving active_theme_id in tenant_branding_settings notice:', e.message);
    }

    try {
      await supabase
        .from('home_settings')
        .upsert({
          tenant_id: currentTenantId,
          setting_key: 'active_theme_id',
          setting_value: String(themeId),
          description: 'المظهر المفعل لهذا المصنع'
        }, { onConflict: 'tenant_id,setting_key' });
    } catch (e) {
      console.warn('Saving active_theme_id notice:', e.message);
    }
  }

  // 2. Update is_active flag in database gracefully
  try {
    await supabase.from('themes').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('themes').update({ is_active: true }).eq('id', themeId);
  } catch (e) {
    console.warn('Theme is_active update notice:', e.message);
  }

  // 3. Fetch and apply theme variables to DOM
  try {
    const { data: targetTheme } = await supabase
      .from('themes')
      .select('*')
      .eq('id', themeId)
      .maybeSingle();

    if (targetTheme) {
      updateCacheAndApply(targetTheme, currentTenantId);
      return targetTheme;
    }
  } catch (err) {
    console.warn('Database theme activation lookup notice:', err.message);
  }
  const isLight = String(themeId).includes('light') || String(themeId).includes('2') || String(themeId).includes('sys-1');
  const sysName = isLight ? "UltraSoft Light Theme" : "UltraSoft Dark Theme";
  const targetTheme = DEFAULT_THEMES[sysName] || DEFAULT_THEMES["UltraSoft Dark Theme"];
  const fullObj = {
    id: themeId,
    name: targetTheme.name,
    theme_key: targetTheme.name.toLowerCase().replace(/\s+/g, '-'),
    is_active: true,
    is_system: true,
    colors: targetTheme.colors,
    variables: targetTheme
  };
  updateCacheAndApply(fullObj, currentTenantId);
  return fullObj;
}

export async function duplicateTheme(themeId, newName) {
  const { data: source, error: fetchError } = await supabase
    .from('themes')
    .select('*')
    .eq('id', themeId)
    .single();

  if (fetchError) throw fetchError;

  const sourceConfig = source.colors || source.variables || {};

  const { data: duplicated, error: insertError } = await supabase
    .from('themes')
    .insert({
      name: newName,
      theme_key: 'copy-' + Date.now(),
      colors: sourceConfig,
      is_active: false
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return duplicated;
}

export async function deleteTheme(themeId) {
  const { data: check, error: fetchError } = await supabase
    .from('themes')
    .select('*')
    .eq('id', themeId)
    .single();

  if (fetchError) throw fetchError;
  if (check.is_active) throw new Error('لا يمكن حذف المظهر النشط حالياً.');
  const isSys = check.is_system || (check.name && check.name.includes('UltraSoft'));
  if (isSys) throw new Error('لا يمكن حذف المظاهر الافتراضية للنظام.');

  const { error: deleteError } = await supabase
    .from('themes')
    .delete()
    .eq('id', themeId);

  if (deleteError) throw deleteError;
  return true;
}

export async function resetSystemTheme(themeId, name) {
  const original = DEFAULT_THEMES[name];
  if (!original) throw new Error('مظهر النظام غير معرّف في الكود البرمجي الرئيسي.');
  
  return await updateTheme(themeId, original, original.description);
}
