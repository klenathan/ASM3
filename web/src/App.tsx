import { AuthProvider } from "./features/auth/auth-context";
import { AppRoutes } from "./app/routes";

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
