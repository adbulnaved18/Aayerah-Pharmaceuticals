import { Link } from 'react-router-dom';
import { ShoppingCart, User, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';

export const Header = () => {
  const { cart } = useCart();
  const { user, isAdmin, logout } = useAuth();
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="bg-amber-50 border-b border-amber-200 sticky top-0 z-50 backdrop-blur supports-[backdrop-filter]:bg-amber-50/95">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        {/* Logo */}
        <Link to="/" className="flex items-center">
          
          <span className="text-2xl font-bold text-amber-900">VendorCart</span>
        </Link>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          <Link to="/">
            <Button 
              variant="ghost" 
              className="text-amber-800 hover:text-amber-900 hover:bg-amber-100"
            >
              Home
            </Button>
          </Link>
          <Link to="/shop">
            <Button 
              variant="ghost" 
              className="text-amber-800 hover:text-amber-900 hover:bg-amber-100"
            >
              Shop
            </Button>
          </Link>
          
          {user && !isAdmin && (
            <Link to="/cart" className="relative">
              <Button 
                variant="ghost" 
                size="icon"
                className="text-amber-800 hover:text-amber-900 hover:bg-amber-100"
              >
                <ShoppingCart className="h-5 w-5" />
                {itemCount > 0 && (
                  <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-amber-800 hover:bg-amber-900 text-amber-50 border-0">
                    {itemCount}
                  </Badge>
                )}
              </Button>
            </Link>
          )}

          {/* User Section */}
          {user ? (
            <div className="flex items-center gap-3">
              {isAdmin && (
                <Link to="/admin/dashboard">
                  <Button 
                    variant="outline"
                    className="border-amber-300 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
                  >
                    Dashboard
                  </Button>
                </Link>
              )}
              <span className="text-sm font-medium text-amber-800">{user.fullname}</span>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={logout}
                className="text-amber-800 hover:text-amber-900 hover:bg-amber-100"
              >
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          ) : (
            <Link to="/login">
              <Button 
                className="bg-stone-700 hover:bg-stone-800 text-stone-50"
              >
                <User className="mr-2 h-4 w-4" />
                Login
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
