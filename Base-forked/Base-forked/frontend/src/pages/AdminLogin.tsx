import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Shield } from 'lucide-react';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { adminLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await adminLogin(email, password);
    if (result.success) {
      toast.success('Admin login successful!');
      navigate('/admin/dashboard');
    } else {
      toast.error(result.error || 'Invalid admin credentials');
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      
      <div className="min-h-screen bg-gradient-to-br from-stone-100 via-amber-50 to-stone-100">
        <div className="container flex items-center justify-center py-16 px-4">
          <div className="w-full max-w-md bg-amber-50 border border-amber-200 rounded-lg shadow-xl">
            {/* Header */}
            <div className="px-8 pt-8 pb-6 border-b border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-6 w-6 text-amber-800" />
                <h2 className="text-3xl font-bold text-amber-900">Admin Access</h2>
              </div>
              {/* <p className="text-amber-700">
                Demo credentials: admin@shop.com / admin123
              </p> */}
            </div>

            {/* Form Content */}
            <div className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label 
                    htmlFor="email" 
                    className="text-sm font-semibold text-amber-900 block"
                  >
                    Admin Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="admin@shop.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-amber-300 rounded-md text-amber-900 placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all"
                  />
                </div>
                
                <div className="space-y-2">
                  <label 
                    htmlFor="password" 
                    className="text-sm font-semibold text-amber-900 block"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-amber-300 rounded-md text-amber-900 placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all"
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full py-3 bg-amber-800 hover:bg-amber-900 text-amber-50 font-semibold rounded-md transition-colors shadow-md hover:shadow-lg mt-8"
                >
                  Admin Login
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
