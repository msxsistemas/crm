/**
 * Middleware de autorização por role.
 * Uso: { preHandler: [fastify.authenticate, authorize('admin')] }
 */
export function authorize(...roles) {
  return async function (req, reply) {
    if (!roles.includes(req.user?.role)) {
      return reply.status(403).send({ error: 'Acesso negado' });
    }
  };
}
