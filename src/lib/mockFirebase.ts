/**
 * Mock Firebase Layer
 * Replaces Firestore calls with Local Server calls to bypass Quota limits.
 */

const API_BASE = '/api';

export const mockDb = {
  // Mock implementations for Firestore-like behavior
  async getDoc(collection: string, id: string) {
    const res = await fetch(`${API_BASE}/users/${id}`);
    const data = await res.json();
    return {
      exists: () => !!data,
      data: () => data,
      id
    };
  },

  async setDoc(collection: string, id: string, data: any) {
    return await fetch(`${API_BASE}/users/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  async addDoc(collectionPath: string, data: any) {
    const res = await fetch(`${API_BASE}/${collectionPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return await res.json();
  },

  async updateDoc(collection: string, id: string, data: any) {
    return await fetch(`${API_BASE}/${collection}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  async getDocs(collectionPath: string) {
    const res = await fetch(`${API_BASE}/${collectionPath}`);
    const data = await res.json();
    return {
      docs: data.map((d: any) => ({
        id: d.id,
        data: () => d
      }))
    };
  }
};
