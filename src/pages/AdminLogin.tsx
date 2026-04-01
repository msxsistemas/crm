import PortalLogin from "@/components/auth/PortalLogin";

const AdminLogin = () => {
  return (
    <PortalLogin
      portal="admin"
      title="Portal Administrativo"
      subtitle="Acesso exclusivo para administradores"
    />
  );
};

export default AdminLogin;
