import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate, Link } from "react-router-dom";
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { FaDoorOpen, FaBell, FaUser, FaSignOutAlt, FaMapMarkedAlt, FaCamera, FaComments } from 'react-icons/fa';
import "./App.css";
import axios from "axios";

// Mapbox token - would normally be in .env file
mapboxgl.accessToken = 'pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4M29iazA2Z2gycXA4N2pmbDZmangifQ.-g_vE53SD2WrJ6tFX7QHmA';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth context
const AuthContext = React.createContext();

const useAuth = () => {
  return React.useContext(AuthContext);
};

const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCurrentUser(response.data);
    } catch (error) {
      console.error("Error fetching user:", error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      console.log("Attempting login with:", email);
      
      const response = await axios.post(`${API}/token`, formData, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      const { access_token } = response.data;
      console.log("Login successful, token received");
      
      localStorage.setItem('token', access_token);
      setToken(access_token);
      return true;
    } catch (error) {
      console.error("Login error:", error);
      throw new Error(error.response?.data?.detail || "Login failed");
    }
  };

  const register = async (name, email, password) => {
    try {
      await axios.post(`${API}/register`, {
        name,
        email,
        password
      });
      return true;
    } catch (error) {
      console.error("Registration error:", error);
      throw new Error(error.response?.data?.detail || "Registration failed");
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setCurrentUser(null);
  };

  const value = {
    currentUser,
    login,
    register,
    logout,
    isAuthenticated: !!currentUser,
    token
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// API service
const api = {
  getHeaders: (token) => ({
    headers: { Authorization: `Bearer ${token}` }
  }),

  getDoors: async (token, category = null) => {
    try {
      const url = category 
        ? `${API}/doors?category=${category}` 
        : `${API}/doors`;
      const response = await axios.get(url, api.getHeaders(token));
      return response.data;
    } catch (error) {
      console.error("Error fetching doors:", error);
      throw error;
    }
  },

  getDoor: async (token, doorId) => {
    try {
      const response = await axios.get(`${API}/doors/${doorId}`, api.getHeaders(token));
      return response.data;
    } catch (error) {
      console.error("Error fetching door:", error);
      throw error;
    }
  },

  createDoor: async (token, doorData) => {
    try {
      const formData = new FormData();
      Object.keys(doorData).forEach(key => {
        if (key !== 'location') {
          formData.append(key, doorData[key]);
        }
      });
      formData.append('latitude', doorData.location.latitude);
      formData.append('longitude', doorData.location.longitude);

      const response = await axios.post(`${API}/doors`, formData, {
        headers: {
          ...api.getHeaders(token).headers,
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    } catch (error) {
      console.error("Error creating door:", error);
      throw error;
    }
  },

  getComments: async (token, doorId) => {
    try {
      const response = await axios.get(`${API}/comments/${doorId}`, api.getHeaders(token));
      return response.data;
    } catch (error) {
      console.error("Error fetching comments:", error);
      throw error;
    }
  },

  createComment: async (token, comment) => {
    try {
      const response = await axios.post(`${API}/comments`, comment, api.getHeaders(token));
      return response.data;
    } catch (error) {
      console.error("Error creating comment:", error);
      throw error;
    }
  },

  getNotifications: async (token) => {
    try {
      const response = await axios.get(`${API}/notifications`, api.getHeaders(token));
      return response.data;
    } catch (error) {
      console.error("Error fetching notifications:", error);
      throw error;
    }
  },

  markNotificationAsRead: async (token, notificationId) => {
    try {
      await axios.post(`${API}/notifications/${notificationId}/read`, {}, api.getHeaders(token));
    } catch (error) {
      console.error("Error marking notification as read:", error);
      throw error;
    }
  }
};

// Components
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

const NavBar = () => {
  const { currentUser, logout } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 30000); // Fetch every 30 seconds
      return () => clearInterval(interval);
    }
  }, [token]);

  const fetchNotifications = async () => {
    try {
      const data = await api.getNotifications(token);
      setNotifications(data);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const handleNotificationClick = async (notification) => {
    try {
      await api.markNotificationAsRead(token, notification.id);
      fetchNotifications();
      navigate(`/doors/${notification.door_id}`);
      setShowNotifications(false);
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <nav className="bg-indigo-700 text-white p-4">
      <div className="container mx-auto flex justify-between items-center">
        <Link to="/" className="text-xl font-bold flex items-center">
          <FaDoorOpen className="mr-2" /> Door Discovery
        </Link>
        
        {currentUser && (
          <div className="flex items-center space-x-4">
            <Link to="/map" className="hover:text-indigo-200">
              <FaMapMarkedAlt className="text-xl" />
            </Link>
            
            <Link to="/add-door" className="hover:text-indigo-200">
              <FaCamera className="text-xl" />
            </Link>
            
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="hover:text-indigo-200 relative"
              >
                <FaBell className="text-xl" />
                {unreadCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg overflow-hidden z-20 text-gray-800">
                  <div className="py-2">
                    <div className="px-4 py-2 font-bold border-b">Notifications</div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="px-4 py-2 text-sm text-gray-500">No notifications</div>
                      ) : (
                        notifications.map(notification => (
                          <div 
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`px-4 py-2 hover:bg-gray-100 cursor-pointer ${!notification.is_read ? 'bg-blue-50' : ''}`}
                          >
                            <div className="font-semibold">{notification.title}</div>
                            <div className="text-sm">{notification.message}</div>
                            <div className="text-xs text-gray-500">
                              {new Date(notification.created_at).toLocaleString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="relative group">
              <button className="hover:text-indigo-200 flex items-center">
                <FaUser className="mr-1" /> {currentUser.name}
              </button>
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg overflow-hidden z-20 hidden group-hover:block text-gray-800">
                <div className="py-1">
                  <button 
                    onClick={logout}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left flex items-center"
                  >
                    <FaSignOutAlt className="mr-2" /> Sign out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {!currentUser && (
          <div className="space-x-4">
            <Link to="/login" className="hover:text-indigo-200">Login</Link>
            <Link to="/register" className="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded">Register</Link>
          </div>
        )}
      </div>
    </nav>
  );
};

const Home = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [doors, setDoors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDoors();
    }
  }, [isAuthenticated, activeCategory]);

  const fetchDoors = async () => {
    try {
      setLoading(true);
      const data = await api.getDoors(token, activeCategory);
      setDoors(data);
    } catch (error) {
      console.error("Error fetching doors:", error);
      toast.error("Failed to load doors");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Discover Amazing Doors</h1>
        <p className="text-gray-600 mb-4">
          Explore unique and interesting doors shared by our community.
          Add your own discoveries and join the conversation!
        </p>
        
        <div className="flex space-x-4 mb-6">
          <button 
            onClick={() => setActiveCategory(null)}
            className={`px-4 py-2 rounded-full ${activeCategory === null ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
          >
            All Doors
          </button>
          <button 
            onClick={() => setActiveCategory('A')}
            className={`px-4 py-2 rounded-full ${activeCategory === 'A' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
          >
            Category A (Important)
          </button>
          <button 
            onClick={() => setActiveCategory('B')}
            className={`px-4 py-2 rounded-full ${activeCategory === 'B' ? 'bg-indigo-600 text-white' : 'bg-gray-200'}`}
          >
            Category B (Less Important)
          </button>
        </div>
        
        <button 
          onClick={() => navigate('/add-door')}
          className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
        >
          <FaCamera className="inline mr-2" /> Add New Door
        </button>
      </div>
      
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : doors.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <h3 className="text-xl font-semibold text-gray-600">No doors found</h3>
          <p className="text-gray-500 mt-2">
            {activeCategory 
              ? `There are no doors in category ${activeCategory} yet.` 
              : "No doors have been added yet."}
          </p>
          <button 
            onClick={() => navigate('/add-door')}
            className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
          >
            Add the first door
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {doors.map(door => (
            <div 
              key={door.id} 
              className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition cursor-pointer"
              onClick={() => {
                console.log("Door clicked, navigating to:", `/doors/${door.id}`);
                navigate(`/doors/${door.id}`);
              }}
            >
              <div className="h-48 overflow-hidden">
                <img 
                  src={door.image_url} 
                  alt={door.title} 
                  className="w-full h-full object-cover transition transform hover:scale-105"
                />
              </div>
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <h3 className="text-xl font-semibold">{door.title}</h3>
                  <span className={`px-2 py-1 rounded text-sm ${door.category === 'A' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                    Category {door.category}
                  </span>
                </div>
                <p className="text-gray-600 mt-2 line-clamp-2">{door.description}</p>
                <div className="mt-3 text-sm text-gray-500">
                  {door.place_name && <div>Location: {door.place_name}</div>}
                  <div>Added by {door.user_name}</div>
                  <div>{new Date(door.created_at).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LandingPage = () => {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 opacity-90"></div>
        <div className="relative h-screen flex items-center">
          <div className="absolute inset-0 z-0">
            <img 
              src="https://images.unsplash.com/photo-1503898362-59e068e7f9d8" 
              alt="Beautiful door" 
              className="w-full h-full object-cover"
            />
          </div>
          <div className="absolute inset-0 bg-black opacity-50 z-10"></div>
          <div className="container mx-auto px-6 relative z-20 text-white">
            <h1 className="text-5xl md:text-6xl font-bold mb-6">Discover the World's Most Beautiful Doors</h1>
            <p className="text-xl md:text-2xl mb-8 max-w-2xl">
              Document, share and explore unique doors around the world. Join our community of door enthusiasts.
            </p>
            <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
              <Link to="/register" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-lg text-center">
                Sign Up Now
              </Link>
              <Link to="/login" className="bg-transparent hover:bg-white hover:text-indigo-600 text-white font-semibold py-3 px-8 border-2 border-white rounded-lg text-center">
                Login
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-indigo-600 text-3xl mb-4">
                <FaCamera />
              </div>
              <h3 className="text-xl font-semibold mb-2">Capture</h3>
              <p className="text-gray-600">
                Take photos of interesting doors you find in your travels and daily life.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-indigo-600 text-3xl mb-4">
                <FaMapMarkedAlt />
              </div>
              <h3 className="text-xl font-semibold mb-2">Locate</h3>
              <p className="text-gray-600">
                Our app automatically captures the location and displays it on a map for others to find.
              </p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="text-indigo-600 text-3xl mb-4">
                <FaComments />
              </div>
              <h3 className="text-xl font-semibold mb-2">Connect</h3>
              <p className="text-gray-600">
                Share stories, comment on doors, and connect with fellow door enthusiasts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="py-16 bg-indigo-600 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to start your door discovery journey?</h2>
          <p className="text-xl mb-8">Join our community today and share your unique discoveries.</p>
          <Link to="/register" className="bg-white text-indigo-600 hover:bg-gray-100 font-bold py-3 px-8 rounded-lg">
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
};

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    
    try {
      await login(email, password);
      navigate("/");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Login to Door Discovery</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="flex items-center justify-between">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Logging in...
                </span>
              ) : "Login"}
            </button>
          </div>
        </form>
        
        <div className="text-center mt-6">
          <p className="text-gray-600">
            Don't have an account? <Link to="/register" className="text-indigo-600 hover:text-indigo-800">Register</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { register, login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      await register(name, email, password);
      await login(email, password);
      navigate("/");
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Create an Account</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="name">
              Name
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="name"
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              Email
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="email"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="password"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="confirmPassword">
              Confirm Password
            </label>
            <input
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="confirmPassword"
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          
          <div className="flex items-center justify-between">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating account...
                </span>
              ) : "Register"}
            </button>
          </div>
        </form>
        
        <div className="text-center mt-6">
          <p className="text-gray-600">
            Already have an account? <Link to="/login" className="text-indigo-600 hover:text-indigo-800">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

const MapView = () => {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [doors, setDoors] = useState([]);
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [viewport, setViewport] = useState({
    latitude: 40.7128,
    longitude: -74.0060,
    zoom: 12
  });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setViewport({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            zoom: 12
          });
        },
        () => {
          // Fallback to default location
        }
      );
    }
  }, []);

  useEffect(() => {
    const fetchDoors = async () => {
      try {
        setLoading(true);
        const data = await api.getDoors(token);
        setDoors(data);
      } catch (error) {
        console.error("Error fetching doors:", error);
        toast.error("Failed to load doors");
      } finally {
        setLoading(false);
      }
    };

    fetchDoors();
  }, [token]);

  useEffect(() => {
    if (map.current) return; // only initialize once
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [viewport.longitude, viewport.latitude],
      zoom: viewport.zoom
    });

    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.current.addControl(new mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true
      },
      trackUserLocation: true
    }), 'bottom-right');

    return () => {
      map.current.remove();
      map.current = null;
    };
  }, [viewport]);

  useEffect(() => {
    if (!map.current || doors.length === 0 || loading) return;

    // Clear existing markers
    const existingMarkers = document.querySelectorAll('.mapboxgl-marker');
    existingMarkers.forEach(marker => marker.remove());

    // Add markers for each door
    doors.forEach(door => {
      const { location, title, category, id } = door;
      
      // Create custom marker element
      const el = document.createElement('div');
      el.className = 'marker';
      el.style.width = '30px';
      el.style.height = '30px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = category === 'A' ? '#ef4444' : '#3b82f6';
      el.style.cursor = 'pointer';
      el.style.border = '2px solid white';
      el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
      
      // Add popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div>
            <h3 class="font-bold">${title}</h3>
            <p>Category: ${category}</p>
            <button class="mt-2 px-3 py-1 bg-indigo-600 text-white rounded text-sm view-door" data-id="${id}">
              View Details
            </button>
          </div>
        `);
      
      // Add marker to map
      const marker = new mapboxgl.Marker(el)
        .setLngLat([location.longitude, location.latitude])
        .setPopup(popup)
        .addTo(map.current);
      
      // Add click handler to button in popup
      marker.getPopup().on('open', () => {
        document.querySelector(`.view-door[data-id="${id}"]`)?.addEventListener('click', () => {
          navigate(`/doors/${id}`);
        });
      });
    });

    // Fit bounds to show all markers if we have multiple doors
    if (doors.length > 1) {
      const bounds = new mapboxgl.LngLatBounds();
      doors.forEach(door => {
        bounds.extend([door.location.longitude, door.location.latitude]);
      });
      map.current.fitBounds(bounds, { padding: 50 });
    } else if (doors.length === 1) {
      // Center on the single door
      map.current.setCenter([doors[0].location.longitude, doors[0].location.latitude]);
    }
  }, [doors, loading, navigate]);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex-grow relative">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-75 z-10 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        )}
        <div ref={mapContainer} className="w-full h-full" />
      </div>
    </div>
  );
};

const AddDoor = () => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [placeName, setPlaceName] = useState("");
  const [history, setHistory] = useState("");
  const [category, setCategory] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [location, setLocation] = useState(null);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  const { token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Get user's location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setLoadingLocation(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setError("Failed to get your location. Please allow location access.");
          setLoadingLocation(false);
        }
      );
    } else {
      setError("Geolocation is not supported by your browser");
      setLoadingLocation(false);
    }
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!image) {
      setError("Please select an image");
      return;
    }
    
    if (!category) {
      setError("Please select a category");
      return;
    }
    
    if (!location) {
      setError("Location is required. Please allow location access.");
      return;
    }
    
    setSubmitting(true);
    setError("");
    
    try {
      const doorData = {
        title,
        description,
        place_name: placeName,
        history,
        category,
        location,
        image
      };
      
      await api.createDoor(token, doorData);
      toast.success("Door added successfully!");
      navigate("/");
    } catch (error) {
      console.error("Error adding door:", error);
      setError("Failed to add door. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Add New Door</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6">
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="title">
            Title *
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="title"
            type="text"
            placeholder="Give your door a name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="description">
            Description *
          </label>
          <textarea
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="description"
            placeholder="Describe this door and why it caught your attention"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            required
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="placeName">
            Place Name
          </label>
          <input
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="placeName"
            type="text"
            placeholder="Building or location name (optional)"
            value={placeName}
            onChange={(e) => setPlaceName(e.target.value)}
          />
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="history">
            History & Experience
          </label>
          <textarea
            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            id="history"
            placeholder="Share any history or personal experiences with this door (optional)"
            value={history}
            onChange={(e) => setHistory(e.target.value)}
            rows={3}
          />
        </div>
        
        <div className="mb-4">
          <span className="block text-gray-700 text-sm font-bold mb-2">
            Category *
          </span>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-5 w-5 text-indigo-600"
                name="category"
                value="A"
                checked={category === "A"}
                onChange={() => setCategory("A")}
                required
              />
              <span className="ml-2 text-gray-700">A - Very Important</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio h-5 w-5 text-indigo-600"
                name="category"
                value="B"
                checked={category === "B"}
                onChange={() => setCategory("B")}
              />
              <span className="ml-2 text-gray-700">B - Less Important</span>
            </label>
          </div>
        </div>
        
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="image">
            Door Image *
          </label>
          <input
            className="hidden"
            id="image"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageChange}
            required
          />
          <div className="flex items-center justify-center w-full">
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Door preview"
                  className="max-h-64 rounded-lg"
                />
                <button
                  type="button"
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                  onClick={() => {
                    setImage(null);
                    setImagePreview(null);
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ) : (
              <label
                htmlFor="image"
                className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to take a photo</span> or drag and drop</p>
                  <p className="text-xs text-gray-500">PNG, JPG or JPEG</p>
                </div>
              </label>
            )}
          </div>
        </div>
        
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">
            Location
          </label>
          {loadingLocation ? (
            <div className="flex items-center text-gray-500">
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Getting your location...
            </div>
          ) : location ? (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
              <p className="text-sm">
                <span className="font-semibold">Location captured:</span> {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </p>
            </div>
          ) : (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              <p className="text-sm">
                Failed to get your location. Please allow location access and try again.
              </p>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            onClick={() => navigate("/")}
          >
            Cancel
          </button>
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            type="submit"
            disabled={submitting || loadingLocation || !location}
          >
            {submitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </span>
            ) : "Add Door"}
          </button>
        </div>
      </form>
    </div>
  );
};

const DoorDetail = () => {
  const { id } = useParams();
  const [door, setDoor] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { token, currentUser } = useAuth();
  const navigate = useNavigate();
  const mapContainer = useRef(null);
  const map = useRef(null);
  
  console.log("Door ID from params:", id);

  useEffect(() => {
    const fetchDoorAndComments = async () => {
      try {
        setLoading(true);
        const doorData = await api.getDoor(token, id);
        setDoor(doorData);
        
        const commentsData = await api.getComments(token, id);
        setComments(commentsData);
      } catch (error) {
        console.error("Error fetching door details:", error);
        toast.error("Failed to load door details");
        navigate("/");
      } finally {
        setLoading(false);
      }
    };

    fetchDoorAndComments();
  }, [id, token, navigate]);

  useEffect(() => {
    if (!door || !mapContainer.current) return;
    
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v11',
      center: [door.location.longitude, door.location.latitude],
      zoom: 15
    });
    
    // Add marker
    const el = document.createElement('div');
    el.className = 'marker';
    el.style.width = '30px';
    el.style.height = '30px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = door.category === 'A' ? '#ef4444' : '#3b82f6';
    el.style.border = '2px solid white';
    el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    
    new mapboxgl.Marker(el)
      .setLngLat([door.location.longitude, door.location.latitude])
      .addTo(map.current);
    
    // Add navigation control
    map.current.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [door]);

  const handleSubmitComment = async (e) => {
    e.preventDefault();
    
    if (!newComment.trim()) return;
    
    setSubmitting(true);
    
    try {
      const comment = {
        text: newComment,
        door_id: id
      };
      
      const createdComment = await api.createComment(token, comment);
      setComments([...comments, createdComment]);
      setNewComment("");
      toast.success("Comment added");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!door) {
    return (
      <div className="container mx-auto p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Door not found
        </div>
        <button
          onClick={() => navigate("/")}
          className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="md:flex">
          <div className="md:w-1/2">
            <img
              src={door.image_url}
              alt={door.title}
              className="w-full h-auto object-cover"
            />
          </div>
          <div className="p-6 md:w-1/2">
            <div className="flex justify-between items-start">
              <h1 className="text-3xl font-bold mb-2">{door.title}</h1>
              <span className={`px-3 py-1 rounded-full text-sm ${door.category === 'A' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                Category {door.category}
              </span>
            </div>
            
            <p className="text-gray-700 mb-4">{door.description}</p>
            
            {door.place_name && (
              <div className="mb-3">
                <h3 className="text-lg font-semibold">Location</h3>
                <p className="text-gray-600">{door.place_name}</p>
              </div>
            )}
            
            {door.history && (
              <div className="mb-3">
                <h3 className="text-lg font-semibold">History & Experience</h3>
                <p className="text-gray-600">{door.history}</p>
              </div>
            )}
            
            <div className="mb-3">
              <h3 className="text-lg font-semibold">Added by</h3>
              <p className="text-gray-600">{door.user_name}</p>
              <p className="text-sm text-gray-500">{new Date(door.created_at).toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t">
          <h2 className="text-xl font-bold mb-4">Location</h2>
          <div ref={mapContainer} className="w-full h-64 rounded-lg mb-4"></div>
          
          <div className="flex justify-end">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${door.location.latitude},${door.location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12 1.586l-4 4V18a1 1 0 001 1h6a1 1 0 001-1V5.586l-4-4zM11 5.414V17h-1V5.414l-6.293 6.293-1.414-1.414L10 2.586l7.707 7.707-1.414 1.414L11 5.414z" clipRule="evenodd" />
              </svg>
              Navigate to this door
            </a>
          </div>
        </div>
        
        <div className="p-6 border-t">
          <h2 className="text-xl font-bold mb-4">Comments</h2>
          
          <form onSubmit={handleSubmitComment} className="mb-6">
            <div className="flex items-start">
              <textarea
                className="flex-grow shadow appearance-none border rounded py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                placeholder="Add a comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                rows={3}
                required
              />
              <button
                type="submit"
                className="ml-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                disabled={submitting}
              >
                {submitting ? (
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : "Post"}
              </button>
            </div>
          </form>
          
          {comments.length === 0 ? (
            <div className="text-center py-6 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {comments.map(comment => (
                <div key={comment.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span className="font-semibold">{comment.user_name}</span>
                    <span className="text-sm text-gray-500">{new Date(comment.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-2">{comment.text}</p>
                  {door.user_id === currentUser.id && comment.user_id !== currentUser.id && (
                    <div className="mt-2 text-right">
                      <span className="text-xs text-gray-500 italic">
                        As the door owner, you can reply to this comment
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const NotFound = () => {
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col justify-center items-center">
      <h1 className="text-6xl font-bold text-indigo-600 mb-4">404</h1>
      <p className="text-2xl mb-6">Page not found</p>
      <Link to="/" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
        Go Home
      </Link>
    </div>
  );
};

function App() {
  return (
    <div className="App min-h-screen bg-gray-100">
      <AuthProvider>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route 
              path="/map" 
              element={
                <ProtectedRoute>
                  <MapView />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/add-door" 
              element={
                <ProtectedRoute>
                  <AddDoor />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/doors/:id" 
              element={
                <ProtectedRoute>
                  <DoorDetail />
                </ProtectedRoute>
              } 
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <ToastContainer position="bottom-right" />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
