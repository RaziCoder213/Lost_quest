/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum QuestStatus {
  ACTIVE = 'ACTIVE',
  FOUND_CLAIMED = 'FOUND_CLAIMED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum UserRole {
  LOSTER = 'LOSTER',
  HELPER = 'HELPER'
}

export interface User {
  id: string;
  name: string;
  email: string;
  profileImage: string;
  isVerified: boolean;
  walletBalance: number;
  rating: number;
  activeQuests: string[]; // IDs
  joinedQuests: string[]; // IDs
  role?: UserRole;
  createdAt?: any;
  updatedAt?: any;
}

export interface Location {
  id: string;
  name: string; // The title/count (e.g. "Main Entrance")
  lat: number;
  lng: number;
  instructions?: string; // Recovery details
}

export interface Quest {
  id: string;
  ownerId: string;
  title: string;
  category: string;
  description: string;
  images: string[];
  rewardAmount: number;
  status: QuestStatus;
  locations: Location[];
  createdAt: number;
  helperIds: string[];
  priority?: 'NORMAL' | 'HIGH' | 'CRITICAL';
  aiRecoverySuggestions?: {
    zones: string[];
    tips: string[];
  };
}

export interface Message {
  id: string;
  questId: string;
  senderId: string;
  senderName: string;
  text: string;
  imageUrl?: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface FoundItemClaim {
  id: string;
  questId: string;
  questOwnerId?: string;
  helperId: string;
  helperName?: string;
  evidenceImages: string[];
  foundLocation: { lat: number; lng: number; address: string };
  condition: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminNotes?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'HELPER_JOINED' | 'NEW_MESSAGE' | 'CLAIM_SUBMITTED' | 'ADMIN_APPROVED' | 'REWARD_PAID' | 'QUEST_CLOSED' | 'SYSTEM';
  questId: string;
  message: string;
  timestamp: number;
  isRead: boolean;
}
