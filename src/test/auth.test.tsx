import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    session: null,
    loading: false,
    signOut: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

vi.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: false, loading: false }),
}));

vi.mock('@/hooks/usePlatformName', () => ({
  usePlatformName: () => ({ platformName: 'MSX CRM' }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  Navigate: () => null,
  useNavigate: () => vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import api from '@/lib/api';
import PortalLogin from '@/components/auth/PortalLogin';

describe('PortalLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper: renders the login form and returns commonly used elements
  function renderLogin() {
    render(
      <PortalLogin
        portal="user"
        title="Entre na sua conta"
        subtitle="Acesse seu painel"
      />
    );
    const emailInput = screen.getByLabelText(/email/i);
    // Use selector: 'input' to avoid matching the "Mostrar senha" toggle button
    const passwordInput = screen.getByLabelText('Senha', { selector: 'input' });
    const submitBtn = screen.getByRole('button', { name: /entrar/i });
    return { emailInput, passwordInput, submitBtn };
  }

  it('renders email and password fields', () => {
    const { emailInput, passwordInput } = renderLogin();
    expect(emailInput).toBeDefined();
    expect(passwordInput).toBeDefined();
  });

  it('renders submit button', () => {
    const { submitBtn } = renderLogin();
    expect(submitBtn).toBeDefined();
  });

  it('calls api.post on form submit', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ csrfToken: 'tok' });
    const { emailInput, passwordInput, submitBtn } = renderLogin();

    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'senha123' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'senha123',
      });
    });
  });

  it('shows error toast on failed login', async () => {
    const { toast } = await import('sonner');
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Credenciais inválidas'));
    const { emailInput, passwordInput, submitBtn } = renderLogin();

    fireEvent.change(emailInput, { target: { value: 'wrong@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'wrongpass' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Email ou senha incorretos');
    });
  });
});
