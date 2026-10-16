import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ShoppingCart, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { API_ENDPOINTS, apiClient } from '@/lib/api';

interface Product {
  _id: string;
  id: string;
  name: string;
  price: number;
  effectivePrice?: number;
  description: string;
  image: string;
  stock: number;
  discount?: number;
  category: string;
  bgColor?: string;
  panelColor?: string;
  textColor?: string;
}

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        // For public endpoints like product details, we don't need credentials
        const response = await apiClient.get(API_ENDPOINTS.PRODUCT_DETAILS(id || ''), false);
        if (!response.ok) {
          throw new Error('Failed to fetch product');
        }
        const data = await response.json();
        const productData = {
          ...data,
          id: data._id,
          image: data.image?.url || data.image || '',
          category: data.category || 'General'
        };
        setProduct(productData);
        setError(null);
        
        fetchRecommendations(productData.category, productData._id);
      } catch (err) {
        console.error('Error fetching product:', err);
        setError('Failed to load product. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    const fetchRecommendations = async (category: string, currentId: string) => {
      try {
        // For public endpoints like product recommendations, we don't need credentials
        const response = await apiClient.getAll(API_ENDPOINTS.PRODUCTS_SHOP, false);
        if (response.ok) {
          const data = await response.json();
          const filtered = data
            .filter((p: any) => p._id !== currentId && p.category === category)
            .slice(0, 4)
            .map((p: any) => ({
              ...p,
              id: p._id,
              image: p.image?.url || p.image || '',
              category: p.category || 'General'
            }));
          setRecommendations(filtered);
        }
      } catch (err) {
        console.error('Error fetching recommendations:', err);
      }
    };

    if (id) {
      fetchProduct();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
        <Header />
        <div className="container py-8 flex items-center justify-center min-h-[50vh]">
          <p className="text-2xl font-semibold text-amber-800">Loading product...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
        <Header />
        <div className="container py-8 flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <p className="text-2xl font-semibold text-red-600 mb-4">{error}</p>
            <button 
              onClick={() => navigate(-1)}
              className="px-6 py-3 bg-amber-800 hover:bg-amber-900 text-amber-50 font-semibold transition-colors shadow-md"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
        <Header />
        <div className="container py-8 text-center">
          <p className="text-xl text-amber-900">Product not found</p>
          <button 
            onClick={() => navigate(-1)} 
            className="mt-4 px-6 py-3 bg-amber-800 hover:bg-amber-900 text-amber-50 font-semibold transition-colors shadow-md"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const handleAddToCart = async () => {
    if (!user) {
      toast.error('Please login to add items to cart');
      navigate('/login');
      return;
    }
    
    try {
      await addToCart(product, quantity);
      toast.success(`₹{quantity} items of ₹{product.name} added to cart`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to add item'); }
  };

  const handleBuyNow = async () => {
    if (!user) {
      toast.error('Please login to purchase');
      navigate('/login');
      return;
    }
    try { await addToCart(product, quantity); navigate('/cart'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to add item'); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
      <Header />
      
      <div className="container py-12 px-4 max-w-7xl mx-auto">
        <button 
          onClick={() => navigate(-1)} 
          className="mb-10 px-5 py-2.5 text-amber-800 hover:text-amber-900 hover:bg-amber-100/50 transition-all inline-flex items-center font-semibold border border-transparent hover:border-amber-200"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Products
        </button>

        {/* Product Section */}
        <div className="grid md:grid-cols-2 gap-12 mb-20">
          {/* Image Section */}
          <div className="space-y-4">
            <div className="bg-gray-100 p-8 border-8 border-amber-100">
              <img
                src={product.image || '/placeholder-image.jpg'}
                alt={product.name}
                className="w-full h-auto object-contain"
              />
            </div>
          </div>

          {/* Product Details Section */}
          <div className="flex flex-col justify-start">
            <div className="inline-block mb-4 px-3 py-1 bg-amber-800 text-amber-50 font-bold text-xs w-fit uppercase tracking-wide">
              {product.category || 'General'}
            </div>
            
            <h1 className="text-4xl font-bold text-amber-900 mb-4 leading-tight uppercase tracking-tight">
              {product.name}
            </h1>
            
            <div className="mb-6">
              <p className="text-4xl font-bold text-red-600">₹{(product.effectivePrice ?? product.price).toLocaleString()}</p>
            </div>
            
            <div className="mb-8">
              <p className="text-amber-900 leading-relaxed text-base">{product.description}</p>
            </div>

            <div className="mb-6">
              <p className="text-sm font-semibold text-amber-900 mb-3">
                Size: <span className="ml-2 font-normal">S</span>
              </p>
              <div className="flex gap-3 mb-6">
                <button className="px-6 py-2 border-2 border-amber-900 bg-white text-amber-900 font-bold hover:bg-amber-900 hover:text-white transition-colors">
                  S
                </button>
                <button className="px-6 py-2 border-2 border-gray-300 bg-white text-gray-400 font-bold">
                  M
                </button>
                <button className="px-6 py-2 border-2 border-gray-300 bg-white text-gray-400 font-bold">
                  L
                </button>
                <button className="px-6 py-2 border-2 border-gray-300 bg-white text-gray-400 font-bold">
                  XL
                </button>
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm font-semibold text-red-600 mb-4">
                Hurry, only {product.stock} item left in stock!
              </p>
              <div className="w-20 h-1 bg-amber-900 mb-6"></div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center border-2 border-gray-300 bg-white">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="px-4 py-3 hover:bg-gray-100 font-bold text-lg transition-colors"
                >
                  -
                </button>
                <span className="px-6 py-3 border-x-2 border-gray-300 font-bold min-w-[60px] text-center">
                  {quantity}
                </span>
                <button 
                  onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                  className="px-4 py-3 hover:bg-gray-100 font-bold text-lg transition-colors"
                >
                  +
                </button>
              </div>
              <button 
                onClick={handleAddToCart} 
                className="flex-1 py-3.5 bg-amber-700 hover:bg-amber-900 text-amber-50 font-bold transition-colors uppercase tracking-wide text-sm"
              >
                Add to Cart
              </button>
            </div>

            <div className="border-t-2 border-gray-200 pt-6">
              <h3 className="text-base font-bold text-amber-900 mb-4 uppercase">
                Pair it with:
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border-2 border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 bg-gray-200 flex items-center justify-center">
                      <span className="text-2xl font-bold text-gray-400">UA</span>
                    </div>
                    <span className="text-sm font-semibold text-amber-900">
                      Adidas Mid Rise Socks - Black
                    </span>
                  </div>
                  <button className="px-6 py-2 bg-gray-400 text-white font-bold text-sm">
                    Sold out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations Section */}
        {recommendations.length > 0 && (
          <div className="mt-16">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-amber-900 mb-2 uppercase">
                You May Also Like
              </h2>
              <p className="text-amber-700">Similar products from the same category</p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => navigate(`/product/₹{rec.id}`)}
                  className="group cursor-pointer bg-amber-50 overflow-hidden hover:shadow-xl transition-all duration-300"
                >
                  <div className="aspect-square p-4">
                    <img
                      src={rec.image || '/placeholder-image.jpg'}
                      alt={rec.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 border-8 border-amber-100"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-amber-900 mb-2 text-base line-clamp-2 tracking-tight">
                      {rec.name}
                    </h3>
                    <p className="text-2xl font-bold text-amber-800">
                      ₹{rec.price.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetail;