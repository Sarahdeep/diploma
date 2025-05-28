import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

// TODO: Import your auth service
// import { authService } from '@/services/authService';

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Неверный формат электронной почты." }),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotPassword, isLoading, error, clearError } = useAuth();

  useEffect(() => {
    clearError(); // Clear any existing auth errors when page loads
  }, [clearError]);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    clearError();
    try {
      await forgotPassword(values.email);
      toast.success("Если такой email зарегистрирован, на него будет отправлена ссылка для сброса пароля.");
      // Optionally, navigate to login or a confirmation page
      // navigate('/login'); 
    } catch (authError: any) {
      // AuthContext's forgotPassword should not throw for "user not found"
      // It will throw for other unexpected errors (e.g. network issues, server 500)
      const message = authError?.message || "Произошла ошибка. Пожалуйста, попробуйте еще раз.";
      toast.error(message);
      // If backend could return field-specific errors for this endpoint (unlikely for forgot password)
      if (authError?.isValidationError && authError.validationErrors) {
        Object.entries(authError.validationErrors).forEach(([field, msg]) => {
          form.setError(field as keyof ForgotPasswordFormValues, { type: 'server', message: msg as string });
        });
      }
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Забыли пароль?</CardTitle>
          <CardDescription>
            Введите свой email, и мы отправим вам ссылку для сброса пароля.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Электронная почта</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Отправка..." : "Отправить ссылку для сброса"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Link to="/login" className="text-sm font-medium text-primary hover:underline">
            Вернуться на страницу входа
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
} 