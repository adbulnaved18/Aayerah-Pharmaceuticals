import { useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useCart } from '@/contexts/CartContext';
import { Separator } from '@/components/ui/separator';

const Cart = () => {
  const { cart, updateQuantity, removeFromCart, total, subtotal, shippingFee } = useCart();
  const navigate = useNavigate();

  // --- Empty Cart State ---
  if (cart.length === 0) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 min-h-[calc(100vh-64px)]">
          <div className="container py-16 text-center">
            <ShoppingBag className="h-24 w-24 mx-auto mb-4 text-amber-500" />
            <h2 className="text-3xl font-bold mb-2 text-amber-900">Your cart is empty</h2>
            <p className="text-amber-700 mb-6">Add some products to get started</p>
            <Button 
              onClick={() => navigate('/shop')}
              className="bg-amber-800 hover:bg-amber-900 text-amber-50 font-semibold shadow-md rounded-none"
            >
              Continue Shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // --- Populated Cart State ---
  return (
    <div className="min-h-screen">
      <Header />
      <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
        <div className="container py-12">
          <h1 className="text-4xl font-extrabold mb-8 text-amber-900 tracking-tight uppercase">
            Shopping Cart
          </h1>
          
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Cart Items List */}
            <div className="lg:col-span-2 space-y-4">
              {cart.map(item => (
                <Card 
                  key={item.id} 
                  className="bg-amber-50 border-2 border-amber-300 shadow-md rounded-none"
                >
                  <CardContent className="p-6">
                    <div className="flex gap-6 items-center">
                      
                      {/* Image with border */}
                      <div className="flex-shrink-0">
                        <div className="w-32 h-32 p-2 border-4 border-amber-200 bg-white">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>
                      
                      <div className="flex-1">
                        <h3 className="font-bold text-lg mb-2 text-amber-900 uppercase tracking-tight">
                          {item.name}
                        </h3>
                        <p className="text-amber-700 text-sm mb-2">Size: S</p>
                        <p className="text-amber-800 font-bold text-2xl">₹{item.price.toLocaleString()}</p>
                      </div>

                      <div className="flex flex-col items-end justify-between h-32 gap-4">
                        
                        {/* Remove Button */}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(item.id)}
                          className="text-amber-700 hover:bg-amber-200 hover:text-amber-900 transition-colors rounded-none border-2 border-amber-200"
                        >
                          <Trash2 className="h-5 w-5" />
                        </Button>

                        {/* Quantity Controls */}
                        <div className="flex items-center border-2 border-amber-300 bg-white">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="px-3 py-2 hover:bg-amber-100 font-bold text-lg transition-colors text-amber-800"
                          >
                            -
                          </button>
                          <span className="px-4 py-2 border-x-2 border-amber-300 font-bold min-w-[50px] text-center text-amber-900">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="px-3 py-2 hover:bg-amber-100 font-bold text-lg transition-colors text-amber-800"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Order Summary Card - Sticky */}
            <div className="lg:col-span-1">
              <div className="sticky top-24">
                <Card className="bg-white border-2 border-amber-800 shadow-xl rounded-none">
                  <CardContent className="p-6">
                    <h2 className="text-2xl font-bold mb-6 text-amber-900 uppercase tracking-tight border-b-2 border-amber-300 pb-4">
                      Order Summary
                    </h2>
                    
                    <div className="space-y-4 mb-6">
                      <div className="flex justify-between items-center">
                        <span className="text-amber-700 font-semibold">Subtotal ({cart.length} items)</span>
                        <span className="font-bold text-amber-900 text-lg">₹{subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-amber-700 font-semibold">Shipping</span>
                        <span className="font-bold text-amber-600">{shippingFee === 0 ? "Free" : `₹₹{shippingFee.toFixed(2)}`}</span>
                      </div>
                      
                      {/* Free Shipping Progress */}
                      <div className="pt-4">
                        <p className="text-sm text-amber-900 mb-2">{shippingFee === 0 ? "Free shipping applies to this order." : "Shipping is included in the total below."}</p>
                        <div className="w-full h-1 bg-amber-800"></div>
                      </div>
                    </div>

                    <Separator className="my-6 bg-amber-300 h-0.5" />

                    <div className="flex justify-between items-center mb-8 py-4 bg-amber-50 px-4 border-2 border-amber-300">
                      <span className="text-xl font-extrabold text-amber-900 uppercase">Total</span>
                      <span className="text-3xl font-extrabold text-amber-800">₹{total.toLocaleString()}</span>
                    </div>

                    <div className="space-y-3">
                      <button
                        className="w-full bg-amber-800 hover:bg-amber-900 text-white font-bold py-4 transition-colors uppercase tracking-wide text-sm flex items-center justify-center gap-2 rounded-none"
                        onClick={() => navigate('/checkout/shipping')}
                      >
                        <span>🔒</span>
                        Check Out
                      </button>
                      
                      <button
                        className="w-full bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold py-4 border-2 border-amber-800 transition-colors uppercase tracking-wide text-sm rounded-none"
                        onClick={() => navigate('/cart')}
                      >
                        View Cart
                      </button>
                    </div>

                    <p className="text-xs text-amber-700 text-center mt-4">
                      Taxes included and shipping calculated at checkout.
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cart;