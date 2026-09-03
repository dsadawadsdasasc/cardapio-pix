declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
  }
}

export const META_PIXEL_ID = "";

export const trackPixelEvent = (eventName: string, data?: Record<string, any>) => {
  if (typeof window !== "undefined" && window.fbq) {
    try {
      if (data) {
        window.fbq("track", eventName, data);
      } else {
        window.fbq("track", eventName);
      }
    } catch (err) {
      console.warn("[Meta Pixel] Erro ao disparar evento:", err);
    }
  }
};

