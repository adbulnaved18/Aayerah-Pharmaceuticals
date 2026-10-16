import { Link } from 'react-router-dom';
import { ShoppingBag, Shield, Truck, HeadphonesIcon, Sparkles, Tag, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Header } from '@/components/Header';
import { useEffect, useState } from 'react';
// import { img } from '../../images/hero.jpg';

const Index = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <div className="min-h-screen">
      <Header />
      
      {/* Hero Section with Animated Background */}
      <section id="home" className="relative py-32 px-4 overflow-hidden min-h-[600px] flex items-center">
        <div 
          className={`absolute inset-0 transition-all duration-1000 ₹{
            isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
          }`}
          style={{
            backgroundImage: `/images/hero.jpg`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-900/60 via-stone-900/50 to-amber-800/60"></div>
        </div>
        
        <div className="container mx-auto text-center relative z-10">
          <div className={`transition-all duration-1000 ₹{
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 text-white tracking-tight drop-shadow-2xl">
              Welcome to VendorCart
            </h1>
            <p className="text-xl md:text-2xl text-amber-50 mb-10 max-w-2xl mx-auto font-medium drop-shadow-lg">
              Discover amazing products at unbeatable prices. Your one-stop shop for quality electronics and accessories.
            </p>
            <div className="flex gap-4 justify-center">
              <button className="px-8 py-3 text-lg bg-amber-800 hover:bg-amber-900 text-amber-50 rounded-lg font-semibold transition-all shadow-xl hover:shadow-2xl flex items-center transform hover:scale-105">
                <ShoppingBag className="mr-2 h-5 w-5" />
                Start Shopping
              </button>
              <button className="px-8 py-3 text-lg bg-white hover:bg-amber-50 text-amber-900 rounded-lg font-semibold transition-all shadow-xl hover:shadow-2xl transform hover:scale-105">
                Sign In
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Motto Section */}
      <section className="relative py-20 px-4 bg-gradient-to-br from-amber-50 via-stone-100 to-amber-100">
        <div className="container mx-auto">
          <div className={`transition-all duration-1000 delay-300 ₹{
            isVisible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
          }`}>
            <div className="text-center">
              <div className="inline-flex items-center justify-center gap-4 mb-6">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-400"></div>
                <Sparkles className="h-7 w-7 text-amber-700" />
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-400"></div>
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-amber-900 tracking-tight mb-4">
                From Concept to Consumer, Excellence in Every Component.
              </h2>
              <div className="inline-flex items-center justify-center gap-4 mt-6">
                <div className="h-px w-24 bg-gradient-to-r from-transparent to-amber-300"></div>
                <div className="w-2 h-2 rounded-full bg-amber-600"></div>
                <div className="h-px w-24 bg-gradient-to-l from-transparent to-amber-300"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Discount Sale Banner */}
      <section className="py-20 px-4 bg-gradient-to-br from-amber-700 via-amber-800 to-stone-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-64 h-64 bg-amber-400 rounded-full filter blur-3xl"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-stone-900 rounded-full filter blur-3xl"></div>
        </div>
        
        <div className="container mx-auto relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-amber-50 mb-3 tracking-tight">Exclusive Deals & Offers</h2>
            <p className="text-xl text-amber-100 font-medium">Limited time only - Don't miss out!</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Flash Sale Card */}
            <div className="bg-gradient-to-br from-amber-50 to-stone-50 rounded-2xl shadow-2xl overflow-hidden transform hover:scale-105 hover:-translate-y-2 transition-all duration-300 border-2 border-amber-200">
              <div className="bg-gradient-to-r from-amber-600 to-amber-700 p-5 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-amber-500/20 backdrop-blur-sm"></div>
                <p className="relative text-white font-bold text-xl tracking-wide flex items-center justify-center gap-2">
                  <Tag className="h-5 w-5" />
                  FLASH SALE
                </p>
              </div>
              <div className="p-8 text-center">
                <div className="mb-6 relative">
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <Tag className="h-32 w-32 text-amber-600" />
                  </div>
                  <Tag className="h-16 w-16 text-amber-700 mx-auto relative z-10" />
                </div>
                <div className="mb-4">
                  <p className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-700 to-amber-900 mb-1">50%</p>
                  <p className="text-2xl font-bold text-amber-800">OFF</p>
                </div>
                <p className="text-base text-stone-700 font-semibold mb-6">On Selected Electronics</p>
                <button className="w-full py-3.5 bg-gradient-to-r from-amber-700 to-amber-800 hover:from-amber-800 hover:to-amber-900 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl">
                  Shop Now
                </button>
              </div>
            </div>

            {/* Weekend Special Card */}
            <div className="bg-gradient-to-br from-amber-50 to-stone-50 rounded-2xl shadow-2xl overflow-hidden transform hover:scale-105 hover:-translate-y-2 transition-all duration-300 border-2 border-amber-200">
              <div className="bg-gradient-to-r from-stone-700 to-stone-800 p-5 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-stone-600/20 backdrop-blur-sm"></div>
                <p className="relative text-white font-bold text-xl tracking-wide flex items-center justify-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  WEEKEND SPECIAL
                </p>
              </div>
              <div className="p-8 text-center">
                <div className="mb-6 relative">
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <TrendingUp className="h-32 w-32 text-stone-600" />
                  </div>
                  <TrendingUp className="h-16 w-16 text-stone-700 mx-auto relative z-10" />
                </div>
                <div className="mb-4">
                  <p className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-stone-700 to-stone-900 mb-1">BUY 2</p>
                  <p className="text-2xl font-bold text-stone-800">GET 1 FREE</p>
                </div>
                <p className="text-base text-stone-700 font-semibold mb-6">On All Accessories</p>
                <button className="w-full py-3.5 bg-gradient-to-r from-stone-700 to-stone-800 hover:from-stone-800 hover:to-stone-900 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl">
                  Browse Deals
                </button>
              </div>
            </div>

            {/* Clearance Sale Card */}
            <div className="bg-gradient-to-br from-amber-50 to-stone-50 rounded-2xl shadow-2xl overflow-hidden transform hover:scale-105 hover:-translate-y-2 transition-all duration-300 border-2 border-amber-200">
              <div className="bg-gradient-to-r from-yellow-700 to-yellow-800 p-5 text-center relative overflow-hidden">
                <div className="absolute inset-0 bg-yellow-600/20 backdrop-blur-sm"></div>
                <p className="relative text-white font-bold text-xl tracking-wide flex items-center justify-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  CLEARANCE
                </p>
              </div>
              <div className="p-8 text-center">
                <div className="mb-6 relative">
                  <div className="absolute inset-0 flex items-center justify-center opacity-10">
                    <ShoppingBag className="h-32 w-32 text-yellow-600" />
                  </div>
                  <ShoppingBag className="h-16 w-16 text-yellow-700 mx-auto relative z-10" />
                </div>
                <div className="mb-4">
                  <p className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-yellow-700 to-yellow-900 mb-1">70%</p>
                  <p className="text-2xl font-bold text-yellow-800">OFF</p>
                </div>
                <p className="text-base text-stone-700 font-semibold mb-6">Last Season Items</p>
                <button className="w-full py-3.5 bg-gradient-to-r from-yellow-700 to-yellow-800 hover:from-yellow-800 hover:to-yellow-900 text-white rounded-xl font-bold transition-all shadow-lg hover:shadow-xl">
                  View Sales
                </button>
              </div>
            </div>
          </div>

          {/* Countdown Timer */}
          <div className="mt-14 text-center">
            <p className="text-amber-50 text-xl font-bold mb-5 flex items-center justify-center gap-2">
              <span className="text-2xl">⏰</span>
              Hurry! Offers End Soon
            </p>
            <div className="flex justify-center gap-5">
              {['12', '34', '56', '23'].map((num, idx) => (
                <div key={idx} className="bg-gradient-to-br from-amber-50 to-white backdrop-blur-sm rounded-xl p-5 min-w-[80px] shadow-2xl border-2 border-amber-200 transform hover:scale-110 transition-transform">
                  <p className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-700 to-amber-900">{num}</p>
                  <p className="text-xs text-amber-700 font-bold mt-2 tracking-wider">
                    {['HOURS', 'MINS', 'SECS', 'MS'][idx]}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Customer Reviews Section */}
      <section id="reviews" className="py-20 px-4 bg-gradient-to-br from-stone-50 via-amber-50 to-stone-50">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold mb-3 text-amber-900 tracking-tight">What Our Customers Say</h2>
            <p className="text-lg text-amber-700 font-medium">Real reviews from real customers</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white border-2 border-amber-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300">
              <div className="p-7">
                <div className="flex items-center mb-5">
                  <div className="flex text-amber-600 text-2xl">
                    {[...Array(5)].map((_, i) => (
                      <span key={i}>★</span>
                    ))}
                  </div>
                </div>
                <p className="text-amber-900 mb-5 italic text-base leading-relaxed">
                  "The wireless headphones I purchased exceeded my expectations. Sound quality is pristine and the battery life lasts for days. Worth every penny!"
                </p>
                <div className="border-t-2 border-amber-200 pt-5">
                  <p className="font-bold text-amber-900 text-lg">Sarah Mitchell</p>
                  <p className="text-sm text-amber-700 font-medium mt-1">Verified Purchase - Premium Headphones</p>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-amber-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300">
              <div className="p-7">
                <div className="flex items-center mb-5">
                  <div className="flex text-amber-600 text-2xl">
                    {[...Array(5)].map((_, i) => (
                      <span key={i}>★</span>
                    ))}
                  </div>
                </div>
                <p className="text-amber-900 mb-5 italic text-base leading-relaxed">
                  "Exceptional service from start to finish. My laptop arrived perfectly packaged and works flawlessly. The customer support team was incredibly helpful with setup."
                </p>
                <div className="border-t-2 border-amber-200 pt-5">
                  <p className="font-bold text-amber-900 text-lg">James Robertson</p>
                  <p className="text-sm text-amber-700 font-medium mt-1">Verified Purchase - Gaming Laptop</p>
                </div>
              </div>
            </div>

            <div className="bg-white border-2 border-amber-200 rounded-xl shadow-lg hover:shadow-2xl transition-shadow duration-300">
              <div className="p-7">
                <div className="flex items-center mb-5">
                  <div className="flex text-amber-600 text-2xl">
                    {[...Array(5)].map((_, i) => (
                      <span key={i}>★</span>
                    ))}
                  </div>
                </div>
                <p className="text-amber-900 mb-5 italic text-base leading-relaxed">
                  "I've been shopping here for over a year now. The quality is consistently excellent and delivery is always prompt. My go-to store for electronics!"
                </p>
                <div className="border-t-2 border-amber-200 pt-5">
                  <p className="font-bold text-amber-900 text-lg">Emily Chen</p>
                  <p className="text-sm text-amber-700 font-medium mt-1">Verified Purchase - Smart Watch</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section id="shop" className="py-20 px-4 bg-gradient-to-br from-amber-800 to-amber-900 text-amber-50">
        <div className="container mx-auto text-center">
          <h2 className="text-5xl font-bold mb-4 tracking-tight">Ready to Start Shopping?</h2>
          <p className="text-xl mb-8 opacity-90 font-medium">
            Join thousands of satisfied customers today
          </p>
          <button className="px-10 py-4 text-lg bg-stone-100 hover:bg-white text-amber-900 rounded-xl font-bold transition-all shadow-xl hover:shadow-2xl transform hover:scale-105">
            Browse Products
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-amber-900 text-amber-50 py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center mb-4">
                <ShoppingBag className="h-7 w-7 mr-2" />
                <span className="text-2xl font-bold tracking-tight">VendorCart</span>
              </div>
              <p className="text-amber-200 font-medium leading-relaxed">
                Your trusted destination for quality electronics and accessories.
              </p>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-lg">Shop</h3>
              <ul className="space-y-2 text-amber-200 font-medium">
                <li><a href="#" className="hover:text-amber-50 transition-colors">All Products</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Electronics</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Accessories</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">New Arrivals</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-lg">Support</h3>
              <ul className="space-y-2 text-amber-200 font-medium">
                <li><a href="#" className="hover:text-amber-50 transition-colors">Contact Us</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Shipping Info</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Returns</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4 text-lg">Company</h3>
              <ul className="space-y-2 text-amber-200 font-medium">
                <li><a href="#" className="hover:text-amber-50 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-amber-50 transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t-2 border-amber-800 mt-8 pt-8 text-center text-amber-200">
            <p className="font-medium">&copy; 2025 VendorCart. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;