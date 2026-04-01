import PortalLogin from "@/components/auth/PortalLogin";

const Login = () => {
  return (
    <PortalLogin
      portal="user"
      title="Entre na sua conta"
      subtitle="Acesse seu painel principal"
      showRegisterLink
    />
  );
};

export default Login;
