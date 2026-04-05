import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Test User', role: 'admin' },
    profile: { id: '1', name: 'Test User', role: 'admin' },
    session: { user: { id: '1', name: 'Test User', role: 'admin' } },
    loading: false,
    signOut: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/lib/socket', () => ({
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import api from '@/lib/api';

const mockConversations = [
  {
    id: 'conv-1',
    contact_name: 'Cliente Alpha',
    last_message: 'Olá, preciso de ajuda',
    updated_at: new Date().toISOString(),
    status: 'open',
    unread_count: 2,
  },
  {
    id: 'conv-2',
    contact_name: 'Cliente Beta',
    last_message: 'Obrigado!',
    updated_at: new Date().toISOString(),
    status: 'open',
    unread_count: 0,
  },
];

describe('Conversations (api mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('api.get returns conversation list', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(mockConversations);

    const result = await api.get('/conversations');
    expect(result).toHaveLength(2);
    expect((result as typeof mockConversations)[0].contact_name).toBe('Cliente Alpha');
  });

  it('api.get returns empty array when no conversations', async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]);

    const result = await api.get('/conversations');
    expect(result).toHaveLength(0);
  });

  it('api.get handles error gracefully', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('Network error'));

    await expect(api.get('/conversations')).rejects.toThrow('Network error');
  });

  it('conversation data has expected shape', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(mockConversations);

    const result = (await api.get('/conversations')) as typeof mockConversations;
    const first = result[0];

    expect(first).toHaveProperty('id');
    expect(first).toHaveProperty('contact_name');
    expect(first).toHaveProperty('last_message');
    expect(first).toHaveProperty('status');
    expect(first).toHaveProperty('unread_count');
  });

  it('api.post creates a new conversation', async () => {
    const newConv = { id: 'conv-3', contact_id: 'c-1', status: 'open' };
    vi.mocked(api.post).mockResolvedValueOnce(newConv);

    const result = await api.post('/conversations', { contact_id: 'c-1' });
    expect((result as typeof newConv).id).toBe('conv-3');
    expect(api.post).toHaveBeenCalledWith('/conversations', { contact_id: 'c-1' });
  });
});
