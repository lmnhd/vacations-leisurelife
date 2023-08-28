import exp from "constants";

const AuthLayout = ({ children }: { children: React.ReactNode;}) => {
   return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        { children }
    </div>
   ) 
}
export default AuthLayout;