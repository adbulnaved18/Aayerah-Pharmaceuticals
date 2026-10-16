// API configuration file
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

export const API_ENDPOINTS = {
  USER_ME: `${API_BASE_URL}/user/me`,
  USER_ORDERS: `${API_BASE_URL}/user/orders`,
  OWNER_ORDERS: `${API_BASE_URL}/owner/orders`,
  OWNER_STATS: `${API_BASE_URL}/owner/stats`,
  ORDER_STATUS: (id: string) => `${API_BASE_URL}/owner/orders/${id}/status`,
  // User endpoints
  USER_LOGIN: `${API_BASE_URL}/user/login`,
  USER_REGISTER: `${API_BASE_URL}/user/register`,
  USER_LOGOUT: `${API_BASE_URL}/user/logout`,
  USER_CART: `${API_BASE_URL}/user/cart`,
  USER_ADDRESS: `${API_BASE_URL}/user/address`,
  USER_ADD_TO_CART: (productId: string) => `${API_BASE_URL}/user/addtocart/${productId}`,
  USER_REMOVE_FROM_CART: (productId: string) => `${API_BASE_URL}/user/cart/${productId}`,
  
  // Owner endpoints
  OWNER_LOGIN: `${API_BASE_URL}/owner/login`,
  OWNER_REGISTER: `${API_BASE_URL}/owner/register`,
  OWNER_LOGOUT: `${API_BASE_URL}/owner/logout`,
  
  // Product endpoints
  PRODUCTS_SHOP: `${API_BASE_URL}/product/shop`,
  PRODUCT_DETAILS: (id: string) => `${API_BASE_URL}/product/product/${id}`,
  PRODUCT_CREATE: `${API_BASE_URL}/product/createproduct`,
  PRODUCT_UPDATE: (id: string) => `${API_BASE_URL}/product/updateproduct/${id}`,
  PRODUCT_DELETE: (id: string) => `${API_BASE_URL}/product/deleteproduct/${id}`,
  PRODUCT_BULK_IMPORT: `${API_BASE_URL}/product/bulk-import`,
  PRODUCT_BULK_IMPORT_TEMPLATE: `${API_BASE_URL}/product/bulk-import/template`,

  // Stock Import / Restock endpoints
  STOCK_IMPORTS: `${API_BASE_URL}/admin/stock-imports`,
  STOCK_IMPORTS_TEMPLATE: `${API_BASE_URL}/admin/stock-imports/template`,
  STOCK_IMPORT_POST: (id: string) => `${API_BASE_URL}/admin/stock-imports/${id}/post`,
};

export const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token') || localStorage.getItem('aayerah_token') || localStorage.getItem('aairah_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function request(url: string, method: string, data?: unknown, authenticated = false, form = false, extra: Record<string, string> = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(authenticated ? authHeaders() : {}), ...extra },
    body: data === undefined ? undefined : form ? (data as FormData) : JSON.stringify(data),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${response.status})`);
  }
  return response;
}

export const apiClient = {
  getAll: async (url: string, auth = false) => {
    const items: unknown[] = [];
    for (let offset = 0; ; offset += 500) {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('limit', '500');
      pageUrl.searchParams.set('offset', String(offset));
      const page = await (await request(pageUrl.toString(), 'GET', undefined, auth)).json();
      items.push(...page);
      if (page.length < 500) break;
    }
    return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
  },
  get: (url: string, auth = false) => request(url, 'GET', undefined, auth),
  post: (url: string, data?: unknown, auth = false, form = false, headers: Record<string, string> = {}) => request(url, 'POST', data, auth, form, headers),
  put: (url: string, data?: unknown, auth = false) => request(url, 'PUT', data, auth),
  patch: (url: string, data?: unknown, auth = false) => request(url, 'PATCH', data, auth),
  delete: (url: string, auth = false) => request(url, 'DELETE', undefined, auth),
};
