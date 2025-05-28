import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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

const loginSchema = z.object({
  // In backend, login takes 'username' which is email, and 'password'
  email: z.string().email({ message: "Неверный формат электронной почты." }),
  password: z.string().min(1, { message: "Введите пароль." }),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading, clearError } = useAuth();

  useEffect(() => {
    clearError(); // Clear any existing auth errors when page loads
  }, [clearError]); // Dependency array ensures this runs once on mount or if clearError changes

  const from = location.state?.from?.pathname || '/observations';

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: LoginFormValues) {
    clearError(); // Clear any previous global auth errors
    try {
      await login(values.email, values.password);
      toast.success("Вход выполнен успешно!");
      navigate(from, { replace: true });
    } catch (authError: any) {
      // This catch block now correctly receives errors from AuthContext.login
      const message = authError?.message || "Ошибка входа. Проверьте учетные данные.";
      toast.error(message); // Display toast for login failure
      
      // Handle field-specific errors from backend if they exist in authError.validationErrors
      if (authError?.isValidationError && authError.validationErrors) {
        Object.entries(authError.validationErrors).forEach(([field, msg]) => {
          form.setError(field as keyof LoginFormValues, { type: 'server', message: msg as string });
        });
      }
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Вход в систему</CardTitle>
          <CardDescription>Введите свои учетные данные для доступа к аккаунту.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email" // Changed from emailOrUsername to email to match schema
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="user@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Пароль</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex items-center justify-end"> {/* Adjusted for only forgot password link */}
                <Link
                  to="/forgot-password" // TODO: Create this page if not exists
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Забыли пароль?
                </Link>
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Вход..." : "Войти"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Нет аккаунта?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Зарегистрироваться
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
