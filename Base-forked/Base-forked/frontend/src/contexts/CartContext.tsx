import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { API_ENDPOINTS, apiClient } from '@/lib/api';
import { toast } from 'sonner';

export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  image: string;
  category: string;
  stock: number;
  discount?: number;
  bgColor?: string;
  panelColor?: string;
  textColor?: string;
}

export interface CartItem extends Product {
  quantity: number;
}

interface CartContextType {
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  total: number;
  subtotal: number;
  shippingFee: number;
}
const CartContext = createContext<CartContextType | undefined>(undefined);
export const CartProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [totals, setTotals] = useState({ total: 0, subtotal: 0, shippingFee: 0 });
  const [cart, setCart] = useState<CartItem[]>([]);
  const userRef = useRef(user?.id);
  userRef.current = user?.id;
  const apply = async (response: Promise<Response>) => {
    const accountId = userRef.current;
    const data = await (await response).json();
    if (accountId === userRef.current) { setCart(data.items); setTotals({ total: data.total || 0, subtotal: data.subtotal || 0, shippingFee: data.shippingFee || 0 }); }
  };
  const refreshCart = async () => {
    if (!user) { setCart([]); return; }
    await apply(apiClient.get(API_ENDPOINTS.USER_CART, true));
  };
  useEffect(() => {
    setCart([]);
    setTotals({ total: 0, subtotal: 0, shippingFee: 0 });
    refreshCart().catch(e => toast.error(e.message));
  }, [user?.id]);
  const addToCart = async (product: Product, quantity = 1) => {
    if (!user) throw new Error('Please sign in first');
    await apply(apiClient.post(API_ENDPOINTS.USER_ADD_TO_CART(product.id), { quantity }, true));
  };
  const removeFromCart = async (id: string) => {
    try { await apply(apiClient.delete(API_ENDPOINTS.USER_REMOVE_FROM_CART(id), true)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to remove item'); }
  };
  const updateQuantity = async (id: string, quantity: number) => {
    if (quantity <= 0) return removeFromCart(id);
    try { await apply(apiClient.put(API_ENDPOINTS.USER_REMOVE_FROM_CART(id), { quantity }, true)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to update cart'); }
  };
  const clearCart = () => apply(apiClient.delete(API_ENDPOINTS.USER_CART, true));
  const { total, subtotal, shippingFee } = totals;
  return <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateQuantity, clearCart, refreshCart, total, subtotal, shippingFee }}>{children}</CartContext.Provider>;
};
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};
