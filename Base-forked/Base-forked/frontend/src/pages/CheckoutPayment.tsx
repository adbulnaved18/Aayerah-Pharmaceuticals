import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCart } from '@/contexts/CartContext';
import { API_ENDPOINTS, apiClient } from '@/lib/api';
import { toast } from 'sonner';

export default function CheckoutPayment() {
  const navigate = useNavigate();
  const { cart, total, shippingFee, refreshCart } = useCart();
  const [processing, setProcessing] = useState(false);
  const handleSubmit = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      // Persist both key and request so a network-failure retry is identical.
      let attempt = JSON.parse(sessionStorage.getItem('checkoutAttempt') || 'null');
      if (!attempt) {
        const shippingAddress = await (await apiClient.get(API_ENDPOINTS.USER_ADDRESS, true)).json();
        if (!shippingAddress) { navigate('/checkout/shipping'); return; }
        attempt = { key: crypto.randomUUID(), body: { shippingAddress, paymentMethod: 'cod' } };
        sessionStorage.setItem('checkoutAttempt', JSON.stringify(attempt));
      }
      const order = await (await apiClient.post(API_ENDPOINTS.USER_ORDERS, attempt.body, true, false, { 'Idempotency-Key': attempt.key })).json();
      sessionStorage.removeItem('checkoutAttempt');
      await refreshCart().catch(() => undefined);
      toast.success('Order placed — payment due on delivery');
      navigate('/success', { state: { orderId: order.id } });
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to place order'); }
    finally { setProcessing(false); }
  };
  return <div className="min-h-screen"><Header /><main className="container py-8 max-w-3xl">
    <Card><CardHeader><CardTitle>Confirm order • Pay on delivery</CardTitle></CardHeader><CardContent>
      <p className="mb-6">Payment is collected on delivery. Prices and availability are checked when you place the order.</p>
      {cart.map(item => <div key={item.id} className="flex justify-between py-2"><span>{item.name} × {item.quantity}</span><span>₹{(item.price * item.quantity).toFixed(2)}</span></div>)}
      <p className="mt-4">Shipping: ₹{shippingFee.toFixed(2)}</p>
      <p className="font-bold my-6">Total: ₹{total.toFixed(2)}</p>
      <Button disabled={processing || (!cart.length && !sessionStorage.getItem('checkoutAttempt'))} onClick={handleSubmit}>{processing ? 'Placing order…' : 'Place order'}</Button>
    </CardContent></Card></main></div>;
}
