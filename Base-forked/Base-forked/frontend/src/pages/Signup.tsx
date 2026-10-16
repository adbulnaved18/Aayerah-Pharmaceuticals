import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await signup(email, password, name);
    if (result.success) {
      toast.success('Account created successfully!');
      navigate('/shop');
    } else {
      toast.error(result.error || 'Signup failed. Please try again.');
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
              <h2 className="text-3xl font-bold text-amber-900 mb-2">Create Account</h2>
              <p className="text-amber-700">Sign up to start your journey with us</p>
            </div>

            {/* Form Content */}
            <div className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label 
                    htmlFor="name" 
                    className="text-sm font-semibold text-amber-900 block"
                  >
                    Full Name
                  </label>
                  <input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-amber-300 rounded-md text-amber-900 placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label 
                    htmlFor="email" 
                    className="text-sm font-semibold text-amber-900 block"
                  >
                    Email Address
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
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
                  Create Account
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-amber-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-amber-50 text-amber-600">or</span>
                </div>
              </div>

              {/* Login Link */}
              <div className="text-center">
                <p className="text-amber-800">
                  Already have an account?{' '}
                  <Link 
                    to="/login" 
                    className="font-semibold text-amber-900 hover:text-amber-700 underline decoration-amber-300 underline-offset-4 transition-colors"
                  >
                    Sign In
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
