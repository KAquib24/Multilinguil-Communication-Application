import { apiSlice } from '../../app/apiSlice.js';
import { User } from '../auth/authApi.js';

export interface UserResponse {
  success: boolean;
  data: {
    users: User[];
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ContactResponse {
  success: boolean;
  data: {
    contacts: User[];
  };
}

export const userApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    // Search users
    searchUsers: builder.query<UserResponse, { 
      query: string; 
      page?: number; 
      limit?: number 
    }>({
      query: ({ query, page = 1, limit = 20 }) => ({
        url: `/users/search?query=${query}&page=${page}&limit=${limit}`,
        method: 'GET',
      }),
    }),
    
    // Get all users (excluding current user and contacts)
    getAllUsers: builder.query<UserResponse, { 
      page?: number; 
      limit?: number 
    }>({
      query: ({ page = 1, limit = 50 } = {}) => ({
        url: `/users/all?page=${page}&limit=${limit}`,
        method: 'GET',
      }),
      providesTags: ['User'],
    }),
    
    // Get user by ID
    getUserById: builder.query<{ success: boolean; data: { user: User } }, string>({
      query: (userId) => `/users/${userId}`,
    }),
    
    // Get user's contacts
    getContacts: builder.query<ContactResponse, void>({
      query: () => '/users/contacts',
      providesTags: ['User'],
    }),
    
    // Add contact
    addContact: builder.mutation<{ success: boolean; message: string; data: { user: User } }, string>({
      query: (targetUserId) => ({
        url: '/users/contacts/add',
        method: 'POST',
        body: { targetUserId },
      }),
      invalidatesTags: ['User'],
    }),
    
    // Remove contact
    removeContact: builder.mutation<{ success: boolean; message: string }, string>({
      query: (targetUserId) => ({
        url: `/users/contacts/remove/${targetUserId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useSearchUsersQuery,
  useGetAllUsersQuery,
  useGetUserByIdQuery,
  useGetContactsQuery,
  useAddContactMutation,
  useRemoveContactMutation,
} = userApi;