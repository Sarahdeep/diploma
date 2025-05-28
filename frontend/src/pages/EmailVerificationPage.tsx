import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from '../contexts/AuthContext';

// TODO: Import your auth service
// import { authService } from '@/services/authService';

export default function EmailVerificationPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  // Local state for this page to manage UI messages specifically for verification steps
  const [verificationStatus, setVerificationStatus] = useState<'verifying' | 'success' | 'error' | 'idle'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const { verifyEmail: verifyEmailServiceCall, isLoading, error, clearError } = useAuth();

  useEffect(() => {
    const processVerification = async () => {
      clearError(); // Clear any global auth errors first
      if (!token) {
        setVerificationStatus('error');
        setMessage("Токен для верификации отсутствует или недействителен.");
        toast.error("Токен для верификации отсутствует или недействителен.");
        return;
      }

      setVerificationStatus('verifying');
      setMessage("Пожалуйста, подождите, мы проверяем ваш токен...");
      
      try {
        await verifyEmailServiceCall(token);
        setVerificationStatus('success');
        setMessage("Email успешно подтвержден! Теперь вы можете войти в систему.");
        toast.success("Email успешно подтвержден!");
      } catch (authError: any) {
        const errMsg = authError?.message || "Ошибка подтверждения email. Возможно, ссылка устарела или недействительна.";
        setVerificationStatus('error');
        setMessage(errMsg);
        toast.error(errMsg);
      }
    };

    processVerification();
  }, [token, verifyEmailServiceCall, clearError]); // Added dependencies

  // Display general errors from AuthContext that might not be caught by the try-catch in useEffect
  // For example, if the context itself had an issue not directly from the API call trigger.
  useEffect(() => {
    if (error && verificationStatus !== 'error') { // Avoid double-showing if already handled
        toast.error(`An unexpected auth error occurred: ${error.message}`);
        setVerificationStatus('error'); // Sync local status if global auth error occurs
        setMessage(error.message);
    }
  }, [error, verificationStatus]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle>
            {verificationStatus === 'verifying' && "Подтверждение Email..."}
            {verificationStatus === 'success' && "Email Подтвержден!"}
            {verificationStatus === 'error' && "Ошибка Подтверждения"}
            {verificationStatus === 'idle' && "Получение токена..."}
          </CardTitle>
          <CardDescription>
            {message || (isLoading && verificationStatus === 'verifying' ? "Проверка..." : " ")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && verificationStatus === 'verifying' && (
            <div className="flex justify-center items-center">
              {/* You can add a spinner here, e.g., from lucide-react */}
              <p>Проверка...</p>
            </div>
          )}
          {verificationStatus === 'success' && (
            <Button asChild className="w-full">
              <Link to="/login">Перейти на страницу входа</Link>
            </Button>
          )}
          {verificationStatus === 'error' && (
            <Button asChild className="w-full mt-2">
              <Link to="/login">Вернуться на страницу входа</Link>
            </Button>
            // Consider a button to resend verification if your backend supports it
          )}
        </CardContent>
      </Card>
    </div>
  );
} 