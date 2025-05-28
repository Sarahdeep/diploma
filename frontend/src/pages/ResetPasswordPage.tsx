import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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

const resetPasswordSchema = z.object({
  password: z.string().min(8, { message: "Пароль должен содержать не менее 8 символов." }),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Пароли не совпадают.",
  path: ["confirmPassword"],
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { resetPassword, isLoading, error, clearError } = useAuth();

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    clearError();
  }, [clearError]);

  React.useEffect(() => {
    if (!token) {
      toast.error("Токен для сброса пароля отсутствует или недействителен.");
      navigate('/login', { replace: true });
    }
  }, [token, navigate]);

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) {
      toast.error("Невозможно сбросить пароль без токена.");
      return;
    }
    clearError();
    try {
      await resetPassword(token, values.password);
      toast.success("Пароль успешно сброшен! Теперь вы можете войти с новым паролем.");
      navigate('/login', { replace: true });
    } catch (authError: any) {
      const message = authError?.message || "Ошибка сброса пароля. Пожалуйста, попробуйте еще раз или запросите новую ссылку.";
      toast.error(message);
      if (authError?.isValidationError && authError.validationErrors) {
        Object.entries(authError.validationErrors).forEach(([field, msg]) => {
          form.setError(field as keyof ResetPasswordFormValues, { type: 'server', message: msg as string });
        });
      }
    }
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
        <Card className="w-full max-w-md p-4 text-center">
          <CardTitle>Недействительный токен</CardTitle>
          <CardDescription>Токен для сброса пароля отсутствует или недействителен.</CardDescription>
          <Button asChild className="mt-4">
            <Link to="/login">Вернуться на страницу входа</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Сброс пароля</CardTitle>
          <CardDescription>Установите новый пароль для вашего аккаунта.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Новый пароль</FormLabel>
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
                    <FormLabel>Подтвердите новый пароль</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isLoading || !token}>
                {isLoading ? "Сброс..." : "Сбросить пароль"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
} 