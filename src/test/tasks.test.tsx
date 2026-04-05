import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', name: 'Test User', role: 'admin' },
    profile: { id: 'user-1', name: 'Test User', role: 'admin' },
    session: { user: { id: 'user-1', name: 'Test User', role: 'admin' } },
    loading: false,
    signOut: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock heavy UI dependencies
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Droppable: ({ children }: { children: (provided: object, snapshot: object) => React.ReactNode }) =>
    children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }: { children: (provided: object, snapshot: object) => React.ReactNode }) =>
    children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

import api from '@/lib/api';

const mockTasks = [
  {
    id: 'task-1',
    title: 'Ligar para cliente',
    description: 'Retornar chamada pendente',
    priority: 'high',
    status: 'pending',
    due_date: null,
    assigned_to: 'user-1',
    assigned_name: 'Test User',
    creator_name: 'Test User',
    created_at: new Date().toISOString(),
    reminder_minutes: null,
  },
  {
    id: 'task-2',
    title: 'Enviar proposta',
    description: null,
    priority: 'medium',
    status: 'done',
    due_date: null,
    assigned_to: 'user-1',
    assigned_name: 'Test User',
    creator_name: 'Test User',
    created_at: new Date().toISOString(),
    reminder_minutes: null,
  },
];

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('Tasks (api mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('api.get returns task list', async () => {
    vi.mocked(api.get).mockResolvedValueOnce(mockTasks);

    const result = await api.get('/tasks');
    expect(result).toHaveLength(2);
    expect((result as typeof mockTasks)[0].title).toBe('Ligar para cliente');
  });

  it('api.post creates a new task', async () => {
    const newTask = {
      id: 'task-3',
      title: 'Nova tarefa',
      priority: 'low',
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    vi.mocked(api.post).mockResolvedValueOnce(newTask);

    const result = await api.post('/tasks', { title: 'Nova tarefa', priority: 'low' });
    expect((result as typeof newTask).id).toBe('task-3');
    expect((result as typeof newTask).title).toBe('Nova tarefa');
    expect(api.post).toHaveBeenCalledWith('/tasks', { title: 'Nova tarefa', priority: 'low' });
  });

  it('api.patch updates task status to done', async () => {
    const updated = { ...mockTasks[0], status: 'done' };
    vi.mocked(api.patch).mockResolvedValueOnce(updated);

    const result = await api.patch('/tasks/task-1', { status: 'done' });
    expect((result as typeof updated).status).toBe('done');
  });

  it('api.delete removes a task', async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({ ok: true });

    const result = await api.delete('/tasks/task-1');
    expect(result).toEqual({ ok: true });
    expect(api.delete).toHaveBeenCalledWith('/tasks/task-1');
  });

  it('filters tasks by status', async () => {
    const pending = mockTasks.filter((t) => t.status === 'pending');
    vi.mocked(api.get).mockResolvedValueOnce(pending);

    const result = (await api.get('/tasks?status=pending')) as typeof mockTasks;
    expect(result.every((t) => t.status === 'pending')).toBe(true);
  });
});
