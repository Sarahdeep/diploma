import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth

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

// Schema for UserCreate in backend (email, username, password)
const registrationSchema = z.object({
  username: z.string().min(3, { message: "Имя пользователя должно содержать не менее 3 символов." }),
  email: z.string().email({ message: "Неверный формат электронной почты." }),
  password: z.string().min(8, { message: "Пароль должен содержать не менее 8 символов." }), // Updated to 8 to match backend UserCreate
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Пароли не совпадают.",
  path: ["confirmPassword"], 
});

type RegistrationFormValues = z.infer<typeof registrationSchema>;

export default function RegistrationPage() {
  const navigate = useNavigate();
  const { register, isLoading, error, clearError } = useAuth();

  useEffect(() => {
    clearError(); // Clear any existing auth errors when page loads
  }, [clearError]);

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function onSubmit(values: RegistrationFormValues) {
    clearError(); // Clear previous errors from AuthContext
    try {
      // Pass only the fields expected by schemas.UserCreate (email, username, password)
      await register({ 
        email: values.email,
        username: values.username,
        password: values.password,
        confirm_password: values.confirmPassword 
      });
      toast.success("Регистрация прошла успешно! Пожалуйста, проверьте свою электронную почту для подтверждения.");
      navigate('/login'); // Navigate to login page after successful registration
    } catch (authError: any) {
      // Error is already set in AuthContext, but we can also toast it
      const message = authError?.message || "Ошибка регистрации. Пожалуйста, попробуйте еще раз.";
      toast.error(message);
      // If backend returns field-specific validation errors (e.g., email already registered)
      if (authError?.isValidationError && authError.validationErrors) {
        Object.entries(authError.validationErrors).forEach(([field, msg]) => {
          // Attempt to map backend field names to form field names if they differ
          const formField = field === 'detail' ? 'root.serverError' : field;
          form.setError(formField as keyof RegistrationFormValues, { type: 'server', message: msg as string });
        });
      } else if (authError?.message) {
        // For general errors like "Email already registered"
        // Check if the message implies a specific field
        if (authError.message.toLowerCase().includes('email')) {
          form.setError('email', { type: 'server', message: authError.message });
        } else if (authError.message.toLowerCase().includes('username')) {
          form.setError('username', { type: 'server', message: authError.message });
        } 
      }
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Регистрация</CardTitle>
          <CardDescription>Создайте новый аккаунт, чтобы начать.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Имя пользователя</FormLabel>
                    <FormControl>
                      <Input placeholder="Ваше имя пользователя" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Подтвердите пароль</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? "Регистрация..." : "Зарегистрироваться"}
              </Button>
            </form>
          </Form>
        </CardContent>
        <CardFooter className="flex flex-col items-center space-y-2">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Уже есть аккаунт?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Войти
            </Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
} 