/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QuestStatus, UserRole } from './types';

export const CATEGORIES = [
  'Electronics',
  'Keys',
  'Wallets',
  'Pets',
  'Documents',
  'Clothing',
  'Others'
];

export const MOCK_USERS = [
  {
    id: 'u1',
    name: 'Ahmad Khan',
    email: 'ahmad@demo.pk',
    profileImage: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    isVerified: true,
    walletBalance: 1200,
    rating: 4.8,
    activeQuests: ['q1'],
    joinedQuests: []
  },
  {
    id: 'u2',
    name: 'Zainab Bibi',
    email: 'zainab@demo.pk',
    profileImage: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop',
    isVerified: true,
    walletBalance: 450,
    rating: 4.9,
    activeQuests: [],
    joinedQuests: ['q1']
  }
];

export const MOCK_QUESTS = [
  {
    id: 'q1',
    ownerId: 'u1',
    title: 'Blue Wallet with CNIC',
    category: 'Wallets',
    description: 'Lost my blue leather wallet in Liberty Market Lahore near the food street. It contains my CNIC and some cash. Please help!',
    images: [
      'https://images.unsplash.com/photo-1627123424574-724758594e93?w=400&h=300&fit=crop'
    ],
    rewardAmount: 1500,
    status: QuestStatus.ACTIVE,
    locations: [
      { id: 'loc1', name: 'Liberty Market Lahore', lat: 31.5113, lng: 74.3406, radius: 200 },
      { id: 'loc2', name: 'Main Boulevard Gulberg', lat: 31.5150, lng: 74.3410, radius: 150 }
    ],
    createdAt: Date.now() - 86400000,
    helperIds: ['u2'],
    aiRecoverySuggestions: {
      zones: ['Near the flower stalls', 'Parking area block C'],
      tips: ['Check with the nearby traffic warden', 'Ask at the Liberty police kiosk']
    }
  }
];
