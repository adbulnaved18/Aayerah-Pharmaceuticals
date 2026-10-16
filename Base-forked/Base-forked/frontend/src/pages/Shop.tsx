import { useState, useEffect } from 'react';
import { Header } from '@/components/Header';
import { ProductCard } from '@/components/ProductCard';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { API_ENDPOINTS, apiClient } from '@/lib/api';

// Define the backend product interface
interface BackendProduct {
  _id: string;
  name: string;
  price: number;
  description?: string;
  image?: {
    url: string;
  };
  stock?: number;
  discount?: number;
  bgColor?: string;
  panelColor?: string;
  textColor?: string;
  category?: string;
  __v?: number;
}

const Shop = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [category, setCategory] = useState('all');
  const [products, setProducts] = useState<BackendProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch products from backend
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        // For public endpoints like product listing, we don't need credentials
        const response = await apiClient.getAll(API_ENDPOINTS.PRODUCTS_SHOP, false);
        if (!response.ok) {
          throw new Error('Failed to fetch products');
        }
        const data = await response.json();
        setProducts(data);
        setError(null);
      } catch (err) {
        setError('Failed to load products. Please try again later.');
        console.error('Error fetching products:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  // Extract categories from products
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category || 'Uncategorized')))];

  const filteredProducts = products.filter(product => {
    const productName = product.name || '';
    const productDescription = product.description || '';
    
    const matchesSearch = productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         productDescription.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = category === 'all' || (product.category || 'Uncategorized') === category;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 min-h-[calc(100vh-64px)]">
          <div className="container py-8 flex items-center justify-center min-h-[50vh]">
            <p className="text-2xl font-semibold text-amber-800">Loading products...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 min-h-[calc(100vh-64px)]">
          <div className="container py-8 flex items-center justify-center min-h-[50vh]">
            <div className="text-center">
              <p className="text-2xl font-semibold text-amber-800 mb-4">{error}</p>
              <button 
                onClick={() => window.location.reload()} 
                className="px-4 py-2 bg-amber-800 hover:bg-amber-900 text-white font-semibold rounded-none transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      
      <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 min-h-[calc(100vh-64px)]">
        <div className="container py-8">
          <h1 className="text-4xl font-extrabold mb-8 text-amber-900 uppercase tracking-tight">Shop All Products</h1>
          
          <div className="flex flex-col md:flex-row gap-4 mb-8">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-5 w-5 text-amber-700" />
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-2 border-amber-300 rounded-none bg-white text-amber-900 placeholder:text-amber-600 focus:border-amber-600 focus:ring-amber-500"
              />
            </div>
            
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full md:w-[200px] border-2 border-amber-300 rounded-none bg-white text-amber-900">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent className="bg-white border-2 border-amber-300 rounded-none">
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat} className="text-amber-900">
                    {cat === 'all' ? 'All Categories' : cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map(product => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-xl text-amber-800 font-semibold">No products found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Shop;