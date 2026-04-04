import jwt from 'jsonwebtoken';
import 'dotenv/config';

export function generateTokens(user) {
  const payload = { id: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
  const refreshToken = jwt.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });
  return { token, refreshToken };
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

export async function authenticate(request, reply) {
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Token não fornecido' });
  }
  try {
    const token = auth.slice(7);
    const payload = verifyToken(token);
    request.user = payload;
  } catch (e) {
    return reply.status(401).send({ error: 'Token inválido ou expirado' });
  }
}

export function requireAdmin(request, reply, done) {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send({ error: 'Acesso negado' });
  }
  done();
}
