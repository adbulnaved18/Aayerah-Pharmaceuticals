// API client for Aayerah Pharma backend

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export const API_ENDPOINTS = {
  USER_ME: `${API_BASE_URL}/user/me`,
  
  // Owner administration endpoints
  OWNER_LOGIN: `${API_BASE_URL}/owner/login`,
  OWNER_LOGOUT: `${API_BASE_URL}/owner/logout`,
  OWNER_PROFILE: `${API_BASE_URL}/owner/profile`,
  
  // Product catalogue & admin endpoints
  PRODUCTS_SHOP: `${API_BASE_URL}/product/shop`,
  PRODUCT_DETAILS: (id: string) => `${API_BASE_URL}/product/product/${id}`,
  PRODUCT_CREATE: `${API_BASE_URL}/product/createproduct`,
  PRODUCT_UPDATE: (id: string) => `${API_BASE_URL}/product/updateproduct/${id}`,
  PRODUCT_DELETE: (id: string) => `${API_BASE_URL}/product/deleteproduct/${id}`,
  PRODUCT_CATEGORIES: `${API_BASE_URL}/product/categories`,
  PRODUCT_BULK_IMPORT: `${API_BASE_URL}/product/bulk-import`,
  PRODUCT_BULK_IMPORT_TEMPLATE: `${API_BASE_URL}/product/bulk-import/template`,
  RESTOCK_TEMPLATE: `${API_BASE_URL}/api/admin/stock-imports/template`,
  STOCK_IMPORTS: `${API_BASE_URL}/api/admin/stock-imports`,
  STOCK_IMPORT_POST: (id: string) => `${API_BASE_URL}/api/admin/stock-imports/${id}/post`,
};

export const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('aayerah_token') || localStorage.getItem('aairah_token') || localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function request<T = unknown>(
  url: string,
  method: string,
  data?: unknown,
  authenticated = false,
  form = false,
  extra: Record<string, string> = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(form ? {} : { 'Content-Type': 'application/json' }),
    ...(authenticated ? authHeaders() : {}),
    ...extra,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: data === undefined ? undefined : form ? (data as FormData) : JSON.stringify(data),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const errorMsg =
      typeof body.error === 'string'
        ? body.error
        : Array.isArray(body.details)
        ? body.details.map((d: { msg?: string }) => d.msg).join(', ')
        : `Request failed (${response.status})`;
    throw new Error(errorMsg);
  }

  // Handle empty responses
  const text = await response.text();
  return text ? JSON.parse(text) : ({} as T);
}

export const apiClient = {
  get: <T = unknown>(url: string, auth = false) => request<T>(url, 'GET', undefined, auth),
  post: <T = unknown>(
    url: string,
    data?: unknown,
    auth = false,
    form = false,
    headers: Record<string, string> = {}
  ) => request<T>(url, 'POST', data, auth, form, headers),
  put: <T = unknown>(url: string, data?: unknown, auth = false) => request<T>(url, 'PUT', data, auth),
  patch: <T = unknown>(url: string, data?: unknown, auth = false) => request<T>(url, 'PATCH', data, auth),
  delete: <T = unknown>(url: string, auth = false) => request<T>(url, 'DELETE', undefined, auth),
};

export interface BackendProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  discount: number;
  image?: string | { url?: string; public_id?: string };
  bgColor?: string;
  panelColor?: string;
  textColor?: string;
  active?: boolean;
}

export interface FrontendProduct {
  id: string;
  brand: string;
  name: string;
  detail: string;
  category: string;
  price: number;
  oldPrice?: number;
  tone: string;
  rx?: boolean;
  description?: string;
  stock: number;
  discount: number;
  image?: string;
  bgColor?: string;
  panelColor?: string;
  textColor?: string;
}

export function mapBackendToFrontendProduct(p: BackendProduct): FrontendProduct {
  // Derive tone and brand for rich visuals
  let tone = 'blue';
  if (p.category === 'Antibiotics' || p.category === 'Pain Relief') tone = 'coral';
  else if (p.category.includes('Vitamins')) tone = 'gold';
  else if (p.category === 'Skincare') tone = 'blue';
  else if (p.category === 'First Aid') tone = 'mint';
  else if (p.category === 'Surgical Supplies') tone = 'lavender';

  // Extract brand from description if present (e.g. "GSK Pharmaceuticals")
  const words = p.description ? p.description.split('. ') : [];
  const brand = words.length > 2 ? words[words.length - 1].replace(/\.$/, '') : 'Aairah Labs';
  const detail = words.length > 1 ? words[words.length - 2] : p.category;

  const oldPrice = p.discount > 0 ? Number((p.price / (1 - p.discount / 100)).toFixed(2)) : undefined;

  let rawImage = '';
  if (typeof p.image === 'object' && p.image !== null) {
    rawImage = (p.image as { url?: string }).url || '';
  } else if (typeof p.image === 'string') {
    rawImage = p.image;
  }

  let imageUrl: string | undefined = undefined;
  if (rawImage && rawImage.trim() !== '') {
    if (
      rawImage.startsWith('http://') ||
      rawImage.startsWith('https://') ||
      rawImage.startsWith('data:') ||
      rawImage.startsWith('blob:')
    ) {
      imageUrl = rawImage;
    } else if (rawImage.startsWith('/')) {
      imageUrl = `${API_BASE_URL}${rawImage}`;
    } else {
      imageUrl = `${API_BASE_URL}/${rawImage}`;
    }
  }

  return {
    id: p.id,
    brand,
    name: p.name,
    detail,
    category: p.category,
    price: Number(p.price),
    oldPrice,
    tone,
    rx: p.category === 'Antibiotics',
    description: p.description,
    stock: p.stock ?? 100,
    discount: p.discount ?? 0,
    image: imageUrl,
    bgColor: p.bgColor,
    panelColor: p.panelColor,
    textColor: p.textColor,
  };
}
