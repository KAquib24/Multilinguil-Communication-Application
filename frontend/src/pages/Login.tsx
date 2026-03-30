import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useLoginMutation } from '../features/auth/authApi';
import {
  setCredentials,
  setError,
  clearError,
  selectAuthError,
} from '../features/auth/authSlice';
import AuthLayout from '../components/layout/AuthLayout';
import AuthInput from '../components/auth/AuthInput';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

/* ============================
   TYPES
============================ */
interface LoginFormData {
  email: string;
  password: string;
}

/* ============================
   VALIDATION SCHEMA
============================ */
const loginSchema = yup.object({
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .required('Password is required'),
});

/* ============================
   COMPONENT
============================ */
const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const [login, { isLoading }] = useLoginMutation();
  const authError = useSelector(selectAuthError);

  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
  });

  // Redirect path after login
  const from = (location.state as any)?.from?.pathname || '/';

  /* ============================
     SUBMIT HANDLER
  ============================ */
  const onSubmit = async (data: LoginFormData) => {
    dispatch(clearError());

    try {
      const response = await login(data).unwrap();

      // ✅ Save user + token
      dispatch(
        setCredentials({
          user: response.data.user,
          accessToken: response.data.accessToken,
        })
      );

      toast.success('Login successful');
      navigate(from, { replace: true });
    } catch (error: any) {
      const errorMessage =
        error?.data?.message || 'Login failed. Please try again.';
      dispatch(setError(errorMessage));
      toast.error(errorMessage);
    }
  };

  /* ============================
     UI
  ============================ */
  return (
    <AuthLayout type="auth">
      <div className="min-h-screen flex items-center justify-center bg-whatsapp-bg-light dark:bg-whatsapp-bg-dark p-4">
        <div className="max-w-md w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 bg-whatsapp-green-light rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.012-.57-.012-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.87.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                </svg>
              </div>
            </div>

            <h2 className="mt-6 text-3xl font-bold text-whatsapp-text-light dark:text-whatsapp-text-dark">
              Welcome back
            </h2>
            <p className="mt-2 text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Sign in to your account
            </p>
          </div>

          {/* Error */}
          {authError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-600 dark:text-red-400">
                {authError}
              </p>
            </div>
          )}

          {/* Form */}
          <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <AuthInput
              label="Email address"
              type="email"
              autoComplete="email"
              icon={<EnvelopeIcon className="h-5 w-5" />}
              error={errors.email?.message}
              {...register('email')}
            />

            <div>
              <AuthInput
                label="Password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                icon={<LockClosedIcon className="h-5 w-5" />}
                error={errors.password?.message}
                {...register('password')}
              />

              <div className="flex items-center justify-between mt-2">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>

                <Link
                  to="/forgot-password"
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center py-3 px-4 rounded-lg text-white bg-whatsapp-green-light hover:bg-whatsapp-green-dark disabled:opacity-50"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <div className="text-center">
            <p className="text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Don&apos;t have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-whatsapp-green-light hover:text-whatsapp-green-dark"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
