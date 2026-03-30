import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { store } from '../app/store';
import { logout, setAccessToken } from '../features/auth/authSlice.js';

class HttpService {
  private axiosInstance: AxiosInstance;
  
  constructor() {
    this.axiosInstance = axios.create({
      baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1',
      withCredentials: true,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.setupInterceptors();
  }
  
  private setupInterceptors() {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const state = store.getState();
        const token = (state as any).auth?.accessToken;
        
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
    
    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;
        
        // Handle token expiration
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            // Try to refresh token
            const refreshResponse = await axios.post(
              `${process.env.REACT_APP_API_URL}/auth/refresh-token`,
              {},
              { withCredentials: true }
            );
            
            const { accessToken } = refreshResponse.data.data;
            
            // Update store with new token
            store.dispatch(setAccessToken(accessToken));
            
            // Update the failed request with new token
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            
            // Retry the original request
            return this.axiosInstance(originalRequest);
          } catch (refreshError) {
            // Refresh failed, logout user
            store.dispatch(logout());
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }
        
        return Promise.reject(error);
      }
    );
  }
  
  // HTTP methods
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.get<T>(url, config);
  }
  
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.post<T>(url, data, config);
  }
  
  put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.put<T>(url, data, config);
  }
  
  delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.delete<T>(url, config);
  }
  
  patch<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.axiosInstance.patch<T>(url, data, config);
  }
}

export default new HttpService();