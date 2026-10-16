import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const Success = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen">
      <Header />
      
      {/* Themed background for the page content, ensuring the success card is centered vertically */}
      <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100 min-h-[calc(100vh-64px)] flex items-center justify-center py-16">
        <Card 
          // Themed card container
          className="w-full max-w-md bg-amber-50 border border-amber-300 shadow-2xl"
        >
          <CardContent className="pt-8 pb-6 text-center">
            
            {/* Success Icon Theming */}
            <div 
              // Background color for the circle icon
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-200/50 mb-6"
            >
              {/* Icon color */}
              <CheckCircle className="h-12 w-12 text-amber-800" />
            </div>
            
            {/* Themed Heading and Text */}
            <h1 className="text-3xl font-extrabold mb-4 text-amber-900">
              Order Confirmed!
            </h1>
            <p className="text-lg text-amber-700 mb-8">
              Your order has been placed successfully. Payment is due on delivery.
            </p>

            <div className="space-y-3 pt-2">
              {/* Primary Button: Continue Shopping */}
              <Button 
                onClick={() => navigate('/shop')} 
                className="w-full 
                  bg-amber-800 hover:bg-amber-900 text-amber-50 font-semibold shadow-lg"
                size="lg"
              >
                Continue Shopping
              </Button>
              
              {/* Secondary Button: Back to Home (Outline) */}
              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
                className="w-full 
                  // Themed outline button style
                  text-amber-800 border-amber-400 hover:bg-amber-100/70 hover:border-amber-500"
                size="lg"
              >
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Success;