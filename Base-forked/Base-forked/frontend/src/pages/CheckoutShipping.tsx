import { API_ENDPOINTS, apiClient } from '@/lib/api';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const CheckoutShipping = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'India',
  });

  const [saving, setSaving] = useState(false);
  useEffect(() => {
    apiClient.get(API_ENDPOINTS.USER_ADDRESS, true).then(r => r.json()).then(data => {
      if (data) setFormData(data);
    }).catch(e => toast.error(e.message));
  }, []);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.USER_ADDRESS, formData, true);
      sessionStorage.removeItem('checkoutAttempt');
      toast.success('Shipping details saved');
      navigate('/checkout/payment');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Unable to save address'); }
    finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen">
      <Header />
      
      {/* Themed background for the page content */}
      <div className="bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
        <div className="container py-12 max-w-3xl">
          {/* Themed main title */}
          <h1 className="text-4xl font-extrabold mb-8 text-amber-900 tracking-tight text-center">
            Shipping Address
          </h1>
          
          <Card 
            // Themed card container
            className="bg-amber-50 border border-amber-300 shadow-2xl"
          >
            <CardHeader 
              // Themed header with a bottom border
              className="border-b border-amber-200"
            >
              {/* Themed card title */}
              <CardTitle className="text-2xl font-bold text-amber-900">
                Enter your shipping details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Form Fields */}
                <div className="grid md:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="space-y-2">
                    {/* Themed label */}
                    <Label htmlFor="fullName" className="text-amber-900 font-semibold">Full Name</Label>
                    <Input
                      id="fullName"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                      // Themed input field
                      className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    {/* Themed label */}
                    <Label htmlFor="email" className="text-amber-900 font-semibold">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      // Themed input field
                      className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-amber-900 font-semibold">Phone Number</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    required
                    className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                  />
                </div>

                {/* Street Address */}
                <div className="space-y-2">
                  <Label htmlFor="address" className="text-amber-900 font-semibold">Street Address</Label>
                  <Input
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    required
                    className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                  />
                </div>

                {/* City, State, ZIP */}
                <div className="grid md:grid-cols-3 gap-4">
                  
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-amber-900 font-semibold">City</Label>
                    <Input
                      id="city"
                      name="city"
                      value={formData.city}
                      onChange={handleChange}
                      required
                      className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-amber-900 font-semibold">State</Label>
                    <Input
                      id="state"
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      required
                      className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zipCode" className="text-amber-900 font-semibold">ZIP Code</Label>
                    <Input
                      id="zipCode"
                      name="zipCode"
                      value={formData.zipCode}
                      onChange={handleChange}
                      required
                      className="bg-white border border-amber-300 text-amber-900 placeholder:text-amber-400 focus:ring-amber-600 focus:border-transparent transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" name="country" value={formData.country} onChange={handleChange} required />
                </div>
                {/* Primary Button */}
                <Button 
                  type="submit" disabled={saving} 
                  className="w-full 
                    bg-amber-800 hover:bg-amber-900 text-amber-50 font-semibold shadow-lg mt-6" 
                  size="lg"
                >
                  Continue to Payment
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CheckoutShipping;