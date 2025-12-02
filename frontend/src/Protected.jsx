import { useEffect, useState } from "react";
import { Navigate, useLocation, Outlet } from "react-router-dom"; // Added Outlet import
import useUserStore from "./store/useUserStore";
import { checkUserAuth } from "./services/user.service";
import Spinner from "./utils/spinner"; // Or wherever your Loader component is

export const ProtectedRoute = () => {
    const location = useLocation();
    const [isChecking, setIsChecking] = useState(true);
    const { isAuthenticated, setUser, clearUser } = useUserStore();
    
    useEffect(() => {
        const verifyAuth = async () => {
            try {
                const result = await checkUserAuth();
                if (result?.isAuthenticated) {
                    setUser(result.user);
                } else {
                    clearUser();
                }
            } catch (error) {
                console.error(error);
                clearUser();
            } finally {
                setIsChecking(false);
            }
        }
        verifyAuth();
    }, [setUser, clearUser])
    
    if (isChecking) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Spinner />
            </div>
        );
    }
    
    if (!isAuthenticated) {
        return <Navigate to="/user-login" state={{ from: location }} replace />
    }

    // user is authenticated - render the protected route
    return <Outlet />
}

export const PublicRoute = () => {
    const isAuthenticated = useUserStore(state => state.isAuthenticated);
    
    if (isAuthenticated) {
        return <Navigate to='/' replace />
    }
    
    return <Outlet />
}