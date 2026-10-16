import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
// Assuming Card, CardContent, CardFooter are components styled with neutral tones
import { Card, CardContent, CardFooter } from '@/components/ui/card';
// Assuming Button is a base component that needs color overriding
import { Button } from '@/components/ui/button'; 
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Updated interface to match actual backend response
interface BackendProduct {
  _id: string;
  name: string;
  price: number;
  effectivePrice?: number;
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
}

interface ProductCardProps {
  product: BackendProduct;
}

export const ProductCard = ({ product }: ProductCardProps) => {
  const { addToCart } = useCart();
  const { user } = useAuth();

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Please login to add items to cart');
      return;
    }
    
    // Map backend product data to CartContext Product interface
    const cartProduct = {
      id: product._id,
      name: product.name,
      price: product.price,
      description: product.description || '',
      image: product.image?.url || '',
      category: product.category || 'general',
      stock: product.stock || 0,
    };
    
    try {
      await addToCart(cartProduct);
      toast.success(`₹{product.name} added to cart`);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to add item'); }
  };

  return (
    <Link to={`/product/₹{product._id}`}>
      <Card 
        // Sharp edges, no border on card itself
        className="transition-all hover:shadow-xl h-full bg-amber-50 rounded-none"
      >
        <div className="aspect-square p-4">
          <img
            src={product.image?.url || '/placeholder-image.jpg'}
            alt={product.name}
            className="h-full w-full object-cover transition-transform hover:scale-105 border-8 border-amber-100"
          />
        </div>
        <CardContent className="p-4 flex flex-col h-32">
          {/* Sharp, aligned text */}
          <h3 className="font-bold text-lg mb-2 line-clamp-1 text-amber-900 tracking-tight">
            {product.name}
          </h3>
          {/* Description with consistent spacing */}
          <p className="text-sm line-clamp-1 mb-2 text-amber-700">
            {product.description}
          </p>
          {/* Price aligned to bottom */}
          <p className="text-2xl font-bold text-amber-800 mt-auto">
            ₹{product.effectivePrice ?? product.price}
          </p>
        </CardContent>
        <CardFooter className="p-4 pt-0">
          <Button 
            onClick={handleAddToCart} 
            className="w-full rounded-none border-2 border-amber-900
              bg-amber-700 hover:bg-amber-900 text-amber-50 font-bold tracking-wide
            "
          >
            <ShoppingCart className="mr-2 h-4 w-4" />
            Add to Cart
          </Button>
        </CardFooter>
      </Card>
    </Link>
  );
};