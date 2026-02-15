import { apiSlice } from '../../app/apiSlice';

export const friendRequestApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({

    sendFriendRequest: builder.mutation<any, { toUserId: string }>({
      query: (body) => ({
        url: '/friend-requests/send',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['FriendRequest'],
    }),

    getSentRequests: builder.query<any, void>({
      query: () => '/friend-requests/sent',
      providesTags: ['FriendRequest'],
    }),

    getReceivedRequests: builder.query<any, void>({
      query: () => '/friend-requests/received',
      providesTags: ['FriendRequest'],
    }),

    acceptFriendRequest: builder.mutation<any, string>({
      query: (requestId) => ({
        url: `/friend-requests/${requestId}/accept`,
        method: 'POST',
      }),
      invalidatesTags: ['FriendRequest'],
    }),

    rejectFriendRequest: builder.mutation<any, string>({
      query: (requestId) => ({
        url: `/friend-requests/${requestId}/reject`,
        method: 'POST',
      }),
      invalidatesTags: ['FriendRequest'],
    }),

    getFriendshipStatus: builder.query<any, string>({
      query: (userId) => `/friend-requests/status/${userId}`,
      providesTags: ['FriendRequest'],
    }),
  }),
});

export const {
  useSendFriendRequestMutation,
  useGetSentRequestsQuery,
  useGetReceivedRequestsQuery,
  useAcceptFriendRequestMutation,
  useRejectFriendRequestMutation,
  useGetFriendshipStatusQuery,
} = friendRequestApi;
