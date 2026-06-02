import { useState } from 'react';
import { useNavigate } from 'react-router';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { BookHeart } from 'lucide-react';
import { useApp } from '../context/AppContext';
import * as api from '../utils/api';

export function Login() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setCurrentUser, refreshData, loadToday } = useApp();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (pin.length !== 4) {
      setError('Please enter a 4-digit PIN');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api.login(pin);
      setCurrentUser(pin);
      await Promise.all([refreshData(), loadToday()]);
      navigate('/menu');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-indigo-100 rounded-full">
              <BookHeart className="w-12 h-12 text-indigo-600" />
            </div>
          </div>
          <div>
            <CardTitle className="text-3xl">Peer Journal</CardTitle>
            <CardDescription className="text-base mt-2">
              AI-mediated reflective journaling
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-center block">
                Enter your 4-digit PIN
              </label>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={4}
                  value={pin}
                  onChange={(value) => {
                    setPin(value);
                    setError('');
                  }}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && (
                <p className="text-sm text-red-500 text-center">{error}</p>
              )}
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? 'Logging in...' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
