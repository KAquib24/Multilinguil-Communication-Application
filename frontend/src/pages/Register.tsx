import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useRegisterMutation } from '../features/auth/authApi.js';
import { setCredentials, setError, clearError } from '../features/auth/authSlice.js';
import AuthLayout from '../components/layout/AuthLayout';
import AuthInput from '../components/auth/AuthInput';
import { 
  UserIcon, 
  EnvelopeIcon, 
  LockClosedIcon, 
  PhotoIcon 
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
// import http from '../services/http';

interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  picture?: string;
}

const registerSchema = yup.object({
  name: yup
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name cannot exceed 50 characters')
    .required('Name is required'),
  email: yup
    .string()
    .email('Please enter a valid email address')
    .required('Email is required'),
  password: yup
    .string()
    .min(6, 'Password must be at least 6 characters')
    .matches(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    )
    .required('Password is required'),
  confirmPassword: yup
    .string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password'),
});

const Register: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [register, { isLoading }] = useRegisterMutation();
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string>('');
  const [uploadingPicture, setUploadingPicture] = useState(false);
  
  const {
    register: registerForm,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterFormData>({
    resolver: yupResolver(registerSchema),
  });
  
  const password = watch('password');
  
  const handlePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        toast.error('Please upload a valid image file (JPEG, PNG, GIF, WebP)');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size must be less than 5MB');
        return;
      }
      
      setProfilePicture(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const uploadProfilePicture = async (file: File): Promise<string | undefined> => {
    try {
      setUploadingPicture(true);
      
      // In a real app, you would upload to Cloudinary or similar service
      // For now, we'll use a mock upload
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Return a mock URL or use the actual upload response
      return picturePreview;
    } catch (error) {
      console.error('Failed to upload picture:', error);
      toast.error('Failed to upload profile picture');
      return undefined;
    } finally {
      setUploadingPicture(false);
    }
  };
  
  const removeProfilePicture = () => {
    setProfilePicture(null);
    setPicturePreview('');
  };
  
  const onSubmit = async (data: RegisterFormData) => {
    dispatch(clearError());
    
    try {
      let pictureUrl = '';
      
      // Upload profile picture if selected
      if (profilePicture) {
        const uploadedUrl = await uploadProfilePicture(profilePicture);
        if (uploadedUrl) {
          pictureUrl = uploadedUrl;
        }
      }
      
      // Prepare registration data
      const registrationData = {
        name: data.name,
        email: data.email,
        password: data.password,
        ...(pictureUrl && { picture: pictureUrl }),
      };
      
      // Register user
      const response = await register(registrationData).unwrap();
      
      if (response.success) {
        dispatch(setCredentials({
          user: response.data.user,
          accessToken: response.data.accessToken,
        }));
        
        toast.success('Registration successful!');
        navigate('/', { replace: true });
      }
    } catch (error: any) {
      const errorMessage = error.data?.message || 'Registration failed. Please try again.';
      dispatch(setError(errorMessage));
      toast.error(errorMessage);
    }
  };
  
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
              Create your account
            </h2>
            <p className="mt-2 text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Join WhatsApp Clone today
            </p>
          </div>
          
          {/* Profile Picture Upload */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white dark:border-whatsapp-gray-800 shadow-lg">
                {picturePreview ? (
                  <img
                    src={picturePreview}
                    alt="Profile preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-whatsapp-gray-200 dark:bg-whatsapp-gray-700 flex items-center justify-center">
                    <UserIcon className="w-16 h-16 text-whatsapp-gray-400" />
                  </div>
                )}
              </div>
              
              <label className="absolute bottom-0 right-0 bg-whatsapp-green-light text-white p-2 rounded-full cursor-pointer hover:bg-whatsapp-green-dark transition-colors duration-200">
                <PhotoIcon className="w-5 h-5" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handlePictureChange}
                  disabled={uploadingPicture}
                />
              </label>
              
              {picturePreview && (
                <button
                  type="button"
                  onClick={removeProfilePicture}
                  className="absolute top-0 right-0 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors duration-200"
                >
                  <span className="sr-only">Remove picture</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          {uploadingPicture && (
            <div className="text-center">
              <div className="inline-flex items-center space-x-2 text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-whatsapp-green-light"></div>
                <span>Uploading picture...</span>
              </div>
            </div>
          )}
          
          {/* Form */}
          <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-4">
              <AuthInput
                label="Full Name"
                type="text"
                autoComplete="name"
                icon={<UserIcon className="h-5 w-5" />}
                error={errors.name?.message}
                {...registerForm('name')}
              />
              
              <AuthInput
                label="Email address"
                type="email"
                autoComplete="email"
                icon={<EnvelopeIcon className="h-5 w-5" />}
                error={errors.email?.message}
                {...registerForm('email')}
              />
              
              <div className="space-y-2">
                <AuthInput
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  icon={<LockClosedIcon className="h-5 w-5" />}
                  error={errors.password?.message}
                  {...registerForm('password')}
                />
                
                {password && (
                  <div className="space-y-1">
                    <div className="text-xs text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
                      Password strength:
                    </div>
                    <div className="h-1 bg-whatsapp-gray-200 dark:bg-whatsapp-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-300 ${
                          password.length >= 8 ? 
                          (password.match(/[A-Z]/) && password.match(/[a-z]/) && password.match(/\d/) ?
                            'bg-green-500' : 'bg-yellow-500') :
                          'bg-red-500'
                        }`}
                        style={{ 
                          width: `${Math.min((password.length / 12) * 100, 100)}%` 
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>
              
              <AuthInput
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                icon={<LockClosedIcon className="h-5 w-5" />}
                error={errors.confirmPassword?.message}
                {...registerForm('confirmPassword')}
              />
              
              <div className="flex items-center space-x-4">
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  {showPassword ? 'Hide password' : 'Show password'}
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="text-sm text-whatsapp-green-light hover:text-whatsapp-green-dark"
                >
                  {showConfirmPassword ? 'Hide confirm' : 'Show confirm'}
                </button>
              </div>
            </div>
            
            {/* Terms and Conditions */}
            <div className="flex items-center">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                className="h-4 w-4 text-whatsapp-green-light focus:ring-whatsapp-green-light border-whatsapp-gray-300 dark:border-whatsapp-gray-600 rounded"
              />
              <label htmlFor="terms" className="ml-2 block text-sm text-whatsapp-gray-700 dark:text-whatsapp-gray-300">
                I agree to the{' '}
                <Link to="/terms" className="text-whatsapp-green-light hover:text-whatsapp-green-dark">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-whatsapp-green-light hover:text-whatsapp-green-dark">
                  Privacy Policy
                </Link>
              </label>
            </div>
            
            <div>
              <button
                type="submit"
                disabled={isLoading || uploadingPicture}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent rounded-lg text-sm font-medium text-white bg-whatsapp-green-light hover:bg-whatsapp-green-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-whatsapp-green-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Creating account...
                  </>
                ) : (
                  'Create Account'
                )}
              </button>
            </div>
          </form>
          
          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-whatsapp-gray-600 dark:text-whatsapp-gray-400">
              Already have an account?{' '}
              <Link
                to="/login"
                className="font-medium text-whatsapp-green-light hover:text-whatsapp-green-dark"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;