import axios from 'axios';
const apiUrl = `${import.meta.env.VITE_API_URL}/api`;

console.log('API URL:', apiUrl); // Should show: http://localhost:5000/api

const getToken = () => localStorage.getItem("auth_token")

const axiosInstance = axios.create({
    baseURL: apiUrl,
    // withCredentials: true
})

axiosInstance.interceptors.request.use((config) =>{
    const token = getToken();
    if(token){
        config.headers.Authorization = `Bearer ${token}`
    }
    return config;
})

export default axiosInstance;