import { useEffect, useState } from 'react'
import reactLogo from './assets/react.svg'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import viteLogo from '/vite.svg'
import './App.css'
import Login from './pages/user-login/login';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ProtectedRoute, PublicRoute } from './Protected'
import HomePage from './components/HomePage'
import UserDetails from './components/UserDetails'
import Status from './pages/StatusSection/Status'
import Setting from './pages/SettingSection/Setting'
import useUserStore from './store/useUserStore'
import { disconnectSocket, initializeSocket } from './services/chat.service'
import { useChatStore } from './store/chatStore'
import ChannelsPage from './components/ChannelPage';


function App() {
  const {user} = useUserStore();
  const {setCurrentUser,initsocketListners,cleanup} = useChatStore();

  useEffect(()=>{
    if(user?._id){
      const socket = initializeSocket();
      if(socket){
          setCurrentUser(user);
          initsocketListners();

      }

    }
    return () =>{
      cleanup();
      disconnectSocket();
    }
  },[user,setCurrentUser,initsocketListners,cleanup])
  return (
    <>
      <ToastContainer position='top-right' autoClose={3000} />
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route element={<PublicRoute />}>
            <Route path='/user-login' element={<Login />} />
          </Route>
          

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path='/' element={<HomePage />} />
            <Route path='/channels' element={<ChannelsPage />} />
            <Route path='/user-profile' element={<UserDetails />} />
            <Route path='/status' element={<Status />} />
            <Route path='/setting' element={<Setting />} />
          </Route>
        </Routes>
      </Router>
    </>

  );
}



export default App
