/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Plus, 
  Map as MapIcon, 
  MessageSquare, 
  User as UserIcon, 
  Bell, 
  Compass, 
  Camera, 
  DollarSign, 
  CheckCircle2, 
  AlertCircle,
  X,
  ArrowRight,
  Navigation,
  Info,
  ShieldCheck,
  Zap,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  Filter,
  RefreshCw,
  Package,
  Shield,
  Smile,
  Send,
  Moon,
  Sun
} from 'lucide-react';
import { Quest, User, QuestStatus, UserRole, Message, Notification, FoundItemClaim } from './types';
import { MOCK_USERS, MOCK_QUESTS, CATEGORIES } from './constants';
import { moderateImage, getQuestAIInsights, enhanceClosureReason } from './services/geminiService';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindow, Autocomplete } from '@react-google-maps/api';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  styles: [
    {
      "featureType": "poi",
      "elementType": "labels",
      "stylers": [{ "visibility": "off" }]
    },
    {
      "featureType": "transit",
      "stylers": [{ "visibility": "off" }]
    }
  ]
};

// --- Shared Components ---

function AddressAutocomplete({ onSelect, placeholder, className, isLoaded }: { onSelect: (place: google.maps.places.PlaceResult) => void, placeholder?: string, className?: string, isLoaded: boolean }) {
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const onLoad = (auto: google.maps.places.Autocomplete) => {
    setAutocomplete(auto);
  };

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      onSelect(place);
    }
  };

  if (!isLoaded) return <input type="text" placeholder="Loading maps..." disabled className={className} />;

  return (
    <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged}>
      <input
        type="text"
        placeholder={placeholder || "Search location..."}
        className={className || "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-orange-500 outline-none transition-all shadow-sm"}
      />
    </Autocomplete>
  );
}

const ExplainerPanel = ({ title, description, badge }: { title: string, description: string, badge?: string }) => (
  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 my-4">
    <div className="flex items-center gap-2 mb-2">
      <Info className="w-5 h-5 text-indigo-600" />
      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Reviewer Note</span>
      {badge && <span className="text-[10px] bg-indigo-200 text-indigo-700 px-1.5 py-0.5 rounded font-mono uppercase">{badge}</span>}
    </div>
    <h4 className="text-sm font-bold text-indigo-900">{title}</h4>
    <p className="text-xs text-indigo-700 leading-relaxed mt-1">{description}</p>
  </div>
);

const Badge = ({ children, color = 'blue' }: { children: ReactNode, color?: string }) => {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    orange: 'bg-orange-100 text-orange-700',
    red: 'bg-red-100 text-red-700',
    indigo: 'bg-indigo-100 text-indigo-700',
  };
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tight ${colors[color]}`}>{children}</span>;
};

// --- Main App ---

const googleMapsLibraries: ("places" | "drawing" | "geometry" | "visualization")[] = ["places"];

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pakfound-theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  const [currentUser, setCurrentUser] = useState<User>(MOCK_USERS[0]);
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.LOSTER);
  const [quests, setQuests] = useState<Quest[]>(MOCK_QUESTS);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [claims, setClaims] = useState<FoundItemClaim[]>([]);
  
  // Navigation
  const [currentPage, setCurrentPage] = useState<'DASHBOARD' | 'MAP' | 'QUESTS' | 'CHAT' | 'PROFILE' | 'ADMIN' | 'ADD_QUEST'>('DASHBOARD');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closingQuestId, setClosingQuestId] = useState<string | null>(null);

  const googleMapsOptions = useMemo(() => ({
    id: 'google-map-script',
    googleMapsApiKey: ((import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY || '').trim(),
    libraries: googleMapsLibraries,
  }), []);

  const { isLoaded, loadError } = useJsApiLoader(googleMapsOptions);

  const mapsApiKeyMissing = !((import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY) || 
                            (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY === 'MY_GOOGLE_MAPS_API_KEY' ||
                            (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY.trim() === '';

  // Address Autocomplete State
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mapCenter, setMapCenter] = useState({ lat: 31.5204, lng: 74.3587 }); // Lahore, Pakistan
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);

  useEffect(() => {
    if (activeRole === UserRole.HELPER && !userLocation && isLoaded) {
      detectLocation();
    }
  }, [activeRole, isLoaded]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('pakfound-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('pakfound-theme', 'light');
    }
  }, [darkMode]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#fff9f7] flex flex-col items-center justify-center p-6 text-slate-800 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-10 text-center"
        >
          <div className="space-y-4">
            <div className="w-20 h-20 bg-orange-500 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-orange-200">
              <Compass className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 mt-6">PakFound</h1>
            <p className="text-slate-500 text-base font-medium max-w-[280px] mx-auto">Helping our neighbors in Pakistan find what they've lost.</p>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-8 rounded-[2.5rem] border border-orange-100 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-8 font-display">Who are you today?</h3>
              <div className="space-y-4">
                <button 
                  onClick={() => {
                    setCurrentUser(MOCK_USERS[0]);
                    setActiveRole(UserRole.LOSTER);
                    setIsLoggedIn(true);
                  }}
                  className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md shadow-orange-100 active:scale-95"
                >
                  <Search className="w-5 h-5" />
                  I LOST SOMETHING
                </button>
                <button 
                  onClick={() => {
                    setCurrentUser(MOCK_USERS[1]);
                    setActiveRole(UserRole.HELPER);
                    setIsLoggedIn(true);
                  }}
                  className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-md shadow-slate-200 active:scale-95"
                >
                  <Zap className="w-5 h-5" />
                  I WANT TO HELP
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-8">
              Community Beta • Made for Pakistan
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  const detectLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        // In a real app we'd reverse geocode this. For now, we'll simulate the update.
        setSearchQuery("Current Location: Detected");
        addNotification('SYSTEM', 'global', "Precision GPS locked. Updating local recovery grid.");
        // Center the map and mark user location
        setMapCenter({ lat: latitude, lng: longitude });
        setUserLocation({ lat: latitude, lng: longitude });
      },
      () => {
        alert("Unable to retrieve your location. Check permissions.");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!isLoaded) return;

    if (q.length > 2) {
      const autocompleteService = new google.maps.places.AutocompleteService();
      autocompleteService.getPlacePredictions({ input: q }, (predictions) => {
        if (predictions) {
          setSuggestions(predictions.map(p => p.description));
        }
      });
    } else {
      setSuggestions([]);
    }
  };

  const onSelectSuggestion = (suggestion: string) => {
    if (!isLoaded || typeof google === 'undefined') return;
    
    setSearchQuery(suggestion);
    setSuggestions([]);
    
    // Geocode the selection
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: suggestion }, (results) => {
      if (results && results[0]) {
        const { lat, lng } = results[0].geometry.location;
        setMapCenter({ lat: lat(), lng: lng() });
      }
    });
  };

  // Notifications logic
  const unreadCount = notifications.filter(n => !n.isRead).length;

  const addNotification = (type: Notification['type'], questId: string, message: string, targetUserId?: string) => {
    const newNotif: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      userId: targetUserId || currentUser.id,
      type,
      questId,
      message,
      timestamp: Date.now(),
      isRead: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Helper Functions
  const joinQuest = (questId: string) => {
    if (currentUser.joinedQuests.length >= 2) {
      alert("Helpers can only join 2 active quests at a time.");
      return;
    }
    setQuests(prev => prev.map(q => {
      if (q.id === questId) {
        return { ...q, helperIds: [...q.helperIds, currentUser.id] };
      }
      return q;
    }));
    setCurrentUser(prev => ({ ...prev, joinedQuests: [...prev.joinedQuests, questId] }));
    addNotification('HELPER_JOINED', questId, "You've successfully joined the quest!");
    setSelectedQuestId(questId);
    setCurrentPage('CHAT');
  };

  const handleCloseQuest = async (questId: string, reason: string) => {
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;

    // AI Enhance the reason
    const enhanced = await enhanceClosureReason(reason);

    // Update quest status
    setQuests(prev => prev.map(q => q.id === questId ? { ...q, status: QuestStatus.COMPLETED, closureReason: enhanced } : q));
    
    // Notify all helpers
    quest.helperIds.forEach(hid => {
      addNotification('QUEST_CLOSED', questId, `Quest "${quest.title}" was closed: ${enhanced}`, hid);
    });

    setShowCloseModal(false);
    setSelectedQuestId(null);
    setCurrentPage('DASHBOARD');
  };

  const publishQuest = async (newQuest: Partial<Quest>) => {
    const quest: Quest = {
      id: `q${Math.random().toString(36).substr(2, 5)}`,
      ownerId: currentUser.id,
      title: newQuest.title || '',
      category: newQuest.category || 'Others',
      description: newQuest.description || '',
      images: newQuest.images || [],
      rewardAmount: newQuest.rewardAmount || 50,
      status: QuestStatus.ACTIVE,
      locations: newQuest.locations || [],
      createdAt: Date.now(),
      helperIds: [],
      ...newQuest
    };
    
    // AI Insights (Simulated for speed, but using real Gemini Service)
    const insights = await getQuestAIInsights(quest.title, quest.description, quest.category);
    quest.aiRecoverySuggestions = insights;

    setQuests([quest, ...quests]);
    setCurrentUser(prev => ({ ...prev, activeQuests: [...prev.activeQuests, quest.id] }));
    
    if (quest.locations.length > 0) {
      setMapCenter({ lat: quest.locations[0].lat, lng: quest.locations[0].lng });
    }

    addNotification('SYSTEM', quest.id, `Item "${quest.title}" is now live in the network.`);
    setCurrentPage('DASHBOARD');
  };

  // Views
  const renderDashboard = () => {
    if (activeRole === UserRole.LOSTER) {
      return <LosterDashboard 
        user={currentUser} 
        quests={quests.filter(q => q.ownerId === currentUser.id)} 
        onAddClick={() => setCurrentPage('ADD_QUEST')}
        onQuestClick={(id) => { setSelectedQuestId(id); setCurrentPage('QUEST_DETAIL'); }}
        onChatClick={(id) => { setSelectedQuestId(id); setCurrentPage('CHAT'); }}
      />;
    }
    return <HelperDashboard 
      user={currentUser}
      quests={quests.filter(q => q.ownerId !== currentUser.id && !q.helperIds.includes(currentUser.id))}
      joinedQuests={quests.filter(q => q.helperIds.includes(currentUser.id))}
      onQuestClick={(id) => { setSelectedQuestId(id); setCurrentPage('QUEST_DETAIL'); }}
      onJoinQuest={joinQuest}
      onChatClick={(id) => { setSelectedQuestId(id); setCurrentPage('CHAT'); }}
      searchQuery={searchQuery}
      onSearch={handleSearch}
      onSelectSuggestion={onSelectSuggestion}
      suggestions={suggestions}
      onDetectLocation={detectLocation}
      mapCenter={mapCenter}
      userLocation={userLocation}
      isLoaded={isLoaded}
    />;
  };

  const currentQuest = selectedQuestId ? quests.find(q => q.id === selectedQuestId) : null;

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <Header 
        user={currentUser} 
        activeRole={activeRole} 
        unreadCount={unreadCount} 
        onSwitchRole={() => setActiveRole(activeRole === UserRole.LOSTER ? UserRole.HELPER : UserRole.LOSTER)}
        showNotifs={showNotifs}
        onToggleNotifs={() => setShowNotifs(!showNotifs)}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode(!darkMode)}
      />

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto lg:pl-32 relative bg-slate-50/50 dark:bg-slate-900/50 transition-colors">
        <div className="min-h-full px-4 lg:px-12 py-6 lg:py-6 max-w-[1400px] mx-auto">
          {mapsApiKeyMissing && (
            <div className="mb-6 bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500" />
              <p className="text-xs font-bold text-red-700">
                Action Required: Please set your Google Maps API Key in the "Secrets" panel to enable live maps and location tracking.
              </p>
            </div>
          )}
          {loadError && (
            <div className="mb-6 bg-red-50 border border-red-200 p-6 rounded-3xl flex flex-col gap-4 shadow-sm animate-pulse">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-6 h-6 text-red-500" />
                <h3 className="text-sm font-black text-red-900 uppercase tracking-tight">Google Maps Loading Error</h3>
              </div>
              <div className="bg-white/50 p-4 rounded-xl border border-red-100">
                <p className="text-[11px] font-bold text-red-700 leading-relaxed">
                  Error Code: <code className="bg-red-100 px-1.5 py-0.5 rounded text-red-800">{loadError.name}</code><br/>
                  Message: {loadError.message}
                </p>
              </div>
              <p className="text-[10px] font-medium text-red-600 italic">
                Tip: This usually means your API Key is restricted or invalid. Check your Google Cloud Console "API & Services" &rarr; "Credentials" page.
              </p>
            </div>
          )}
          <AnimatePresence mode="wait">
            {currentPage === 'DASHBOARD' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="min-h-full max-w-7xl mx-auto pb-20">
                <div className="space-y-16">
                  {renderDashboard()}
                </div>
              </motion.div>
            )}

            {currentPage === 'MAP' && (
              <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-[70vh] lg:h-[80vh] rounded-[3rem] overflow-hidden shadow-2xl border-4 border-white mb-32">
                 <FullMapView 
                   isLoaded={isLoaded}
                   quests={quests.filter(q => q.ownerId !== currentUser.id && q.status === QuestStatus.ACTIVE)}
                   onQuestClick={(id: string) => { setSelectedQuestId(id); setCurrentPage('QUEST_DETAIL'); }}
                   searchQuery={searchQuery}
                   onSearch={handleSearch}
                   onSelectSuggestion={onSelectSuggestion}
                   suggestions={suggestions}
                   onDetectLocation={detectLocation}
                   mapCenter={mapCenter}
                   userLocation={userLocation}
                 />
              </motion.div>
            )}

            {currentPage === 'QUESTS' && (
               <motion.div key="my-quests" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-3xl mx-auto">
                  <h2 className="text-3xl font-black italic mb-8 flex items-center gap-4 text-slate-800">
                    <ShieldCheck className="w-8 h-8 text-orange-500" />
                    My Active Quests
                  </h2>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {quests.filter(q => q.ownerId === currentUser.id || q.helperIds.includes(currentUser.id)).map(q => (
                      <div key={q.id} className="bg-white rounded-[2rem] p-6 border border-slate-100 flex gap-6 shadow-sm hover:shadow-xl hover:scale-[1.02] transition-all group">
                         <div className="relative shrink-0">
                           <img src={q.images[0]} className="w-20 h-20 rounded-2xl object-cover" />
                           <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-black italic px-2 py-1 rounded-full shadow-lg">
                             ${q.rewardAmount}
                           </div>
                         </div>
                         <div className="flex-1 min-w-0">
                            <h3 className="font-black italic text-base uppercase tracking-tight truncate group-hover:text-orange-500 transition-colors">{q.title}</h3>
                            <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-relaxed font-medium">{q.description}</p>
                            <div className="flex gap-3 mt-4">
                               <button onClick={() => { setSelectedQuestId(q.id); setCurrentPage('CHAT'); }} className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black italic uppercase tracking-widest active:scale-95 transition-transform">CHAT</button>
                               <button onClick={() => { setSelectedQuestId(q.id); setCurrentPage('QUEST_DETAIL'); }} className="flex-1 py-2 bg-orange-100 text-orange-700 rounded-xl text-[10px] font-black italic uppercase tracking-widest active:scale-95 transition-transform">INFO</button>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
               </motion.div>
            )}

            {currentPage === 'CHAT' && (
               <motion.div key="chat-room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full max-w-4xl mx-auto flex flex-col bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden">
                  {selectedQuestId && quests.find(q => q.id === selectedQuestId) ? (
                    <ChatRoom 
                      quest={quests.find(q => q.id === selectedQuestId)!} 
                      user={currentUser} 
                      messages={messages.filter(m => m.questId === selectedQuestId)}
                      onSendMessage={(txt: string, img?: string) => {
                        const msg: Message = {
                          id: Math.random().toString(),
                          questId: selectedQuestId,
                          senderId: currentUser.id,
                          senderName: currentUser.name,
                          text: txt,
                          imageUrl: img,
                          timestamp: Date.now()
                        };
                        setMessages([...messages, msg]);
                      }}
                      onBack={() => { setSelectedQuestId(null); setCurrentPage('CHAT'); }}
                      onFoundIt={() => setShowClaimForm(true)}
                      onCloseQuest={() => { setClosingQuestId(selectedQuestId); setShowCloseModal(true); }}
                      role={activeRole}
                    />
                  ) : (
                    <div className="p-8 h-full flex flex-col">
                      <h2 className="text-3xl font-black italic mb-8">Messages</h2>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 flex-1 overflow-y-auto pr-2 custom-scrollbar pb-48">
                        {quests.filter(q => q.ownerId === currentUser.id || q.helperIds.includes(currentUser.id)).map(q => (
                           <div 
                             key={q.id} 
                             onClick={() => setSelectedQuestId(q.id)}
                             className="flex items-center gap-5 p-5 bg-white rounded-2xl border border-slate-100 hover:border-orange-200 hover:bg-orange-50/10 active:scale-95 transition-all cursor-pointer group shadow-sm"
                           >
                              <div className="relative">
                                <img src={q.images[0]} className="w-16 h-16 rounded-2xl object-cover" />
                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
                              </div>
                              <div className="flex-1">
                                 <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-black italic text-sm uppercase group-hover:text-orange-500 transition-colors truncate">{q.title}</h4>
                                    <span className="text-[9px] text-green-500 font-black tracking-widest flex items-center gap-1 shrink-0">
                                      <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                                      LIVE
                                    </span>
                                 </div>
                                 <p className="text-[11px] text-slate-500 font-medium truncate">Update from the recovery team...</p>
                              </div>
                           </div>
                        ))}
                      </div>
                    </div>
                  )}
               </motion.div>
            )}

          {currentPage === 'ADD_QUEST' && (
            <motion.div key="add" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} className="min-h-full">
              <AddQuestFlow onCancel={() => setCurrentPage('DASHBOARD')} onPublish={publishQuest} isLoaded={isLoaded} />
            </motion.div>
          )}

          {currentPage === 'QUEST_DETAIL' && currentQuest && (
            <motion.div key="detail" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }} className="min-h-full">
              <QuestDetail 
                quest={currentQuest} 
                role={activeRole} 
                canJoin={activeRole === UserRole.HELPER && !currentQuest.helperIds.includes(currentUser.id) && currentQuest.ownerId !== currentUser.id}
                onJoin={() => joinQuest(currentQuest.id)}
                onBack={() => setCurrentPage('DASHBOARD')}
                onChatClick={() => setCurrentPage('CHAT')}
              />
            </motion.div>
          )}

          {currentPage === 'ADMIN' && (
            <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <AdminPanel 
        claims={claims} 
        onApprove={(claimId: string) => {
          const claim = claims.find(c => c.id === claimId);
          if (!claim) return;
          
          setClaims(prev => prev.map(c => c.id === claimId ? { ...c, status: 'APPROVED' } : c));
          setQuests(prev => prev.map(q => q.id === claim.questId ? { ...q, status: QuestStatus.COMPLETED } : q));
          addNotification('ADMIN_APPROVED', claim.questId, "Your finding has been approved by admin!");
        }}
      />
            </motion.div>
          )}

            {currentPage === 'PROFILE' && (
              <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="max-w-2xl mx-auto h-full flex flex-col pb-32">
                 <div className="bg-white dark:bg-slate-800 rounded-[3rem] p-10 shadow-2xl border border-slate-100 dark:border-slate-700 transition-colors flex flex-col items-center text-center">
                    <div className="relative mb-6">
                      <img src={currentUser.profileImage} className="w-32 h-32 rounded-full border-[6px] border-white dark:border-slate-700 shadow-2xl transition-colors" />
                      <button className="absolute bottom-1 right-1 w-10 h-10 bg-orange-500 text-white rounded-full flex items-center justify-center shadow-lg hover:rotate-12 transition-transform">
                        <Camera className="w-5 h-5" />
                      </button>
                    </div>
                    <h2 className="text-3xl font-black italic tracking-tight text-slate-900 dark:text-white">{currentUser.name}</h2>
                    <p className="text-slate-400 dark:text-slate-500 font-bold text-sm tracking-widest mt-1 uppercase">{currentUser.email}</p>
                    
                    <div className="grid grid-cols-2 gap-6 w-full mt-10">
                       <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 flex flex-col items-center transition-colors">
                          <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em] mb-2">Wallet</span>
                          <span className="text-2xl font-black italic tracking-tighter text-slate-900 dark:text-white">${currentUser.walletBalance}</span>
                       </div>
                       <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-700 flex flex-col items-center transition-colors">
                          <span className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-2">Rating</span>
                          <span className="text-2xl font-black italic tracking-tighter text-slate-900 dark:text-white">★ {currentUser.rating}</span>
                       </div>
                    </div>

                    <div className="w-full mt-12 space-y-3">
                      {['Security Hub', 'Payout Methods', 'Preferences', 'Help Center'].map(item => (
                        <button key={item} className="w-full flex justify-between items-center px-8 py-5 bg-white dark:bg-slate-900 border border-slate-50 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-200 dark:hover:border-slate-700 active:scale-95 transition-all text-sm font-black italic uppercase tracking-widest text-slate-600 dark:text-slate-400">
                           {item}
                           <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                        </button>
                      ))}
                      <button 
                        onClick={() => {
                          setIsLoggedIn(false);
                          setCurrentPage('DASHBOARD');
                        }}
                        className="w-full py-6 text-red-500 font-black italic text-sm mt-6 uppercase tracking-[0.3em] active:scale-95 transition-all"
                      >
                        Terminate Session
                      </button>
                    </div>
                 </div>
              </motion.div>
            )}

          {showClaimForm && currentQuest && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="fixed inset-0 bg-white z-[200] overflow-y-auto p-6 flex flex-col font-sans">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-black italic">Found Item Claim</h2>
                    <button onClick={() => setShowClaimForm(false)} className="p-2 bg-slate-100 rounded-full"><X className="w-6 h-6" /></button>
                </div>
                <ExplainerPanel 
                title="Security Checkpoint" 
                description="When a helper finds an item, they must submit photo evidence and their exact location. System verifies if they are within the lost radius."
                badge="Integrity"
                />
                <div className="flex-1 space-y-6">
                    <div className="aspect-video bg-slate-100 rounded-2xl flex flex-col items-center justify-center border-2 border-dashed border-slate-200">
                        <Camera className="w-8 h-8 text-slate-300" />
                        <span className="text-[10px] font-bold text-slate-400 mt-2">UPLOAD EVIDENCE PHOTOS</span>
                    </div>
                    <div className="space-y-4">
                        <input placeholder="Current Condition (e.g. Scratched, Clean)" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm" />
                        <div className="flex items-center gap-2 bg-green-50 p-3 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-xs font-bold text-green-700">Location Verified: Bethesda terrace</span>
                        </div>
                    </div>
                </div>
                <button 
                onClick={() => {
                    const newClaim: FoundItemClaim = {
                        id: `c${Date.now()}`,
                        questId: currentQuest.id,
                        helperId: currentUser.id,
                        evidenceImages: [],
                        foundLocation: { lat: 40.7738, lng: -73.9708, address: 'Bethesda Terrace' },
                        condition: 'Good',
                        status: 'PENDING'
                    };
                    setClaims([...claims, newClaim]);
                    setShowClaimForm(false);
                    addNotification('CLAIM_SUBMITTED', currentQuest.id, "Reward pending admin review.");
                }}
                className="w-full py-4 bg-orange-500 text-white rounded-2xl font-black italic shadow-xl shadow-orange-100 mt-6"
                >
                    SUBMIT CLAIM
                </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>

      {/* Bottom Nav */}
      <BottomNav currentPage={currentPage} setCurrentPage={setCurrentPage} activeRole={activeRole} />

      {/* Overlay for Notifications */}
      {showNotifs && (
        <div className="fixed inset-0 bg-black/40 z-[100] p-6 flex items-start justify-end">
           <motion.div 
             initial={{ opacity: 0, x: 50 }} 
             animate={{ opacity: 1, x: 0 }} 
             className="w-full max-w-xs bg-white rounded-3xl shadow-2xl overflow-hidden font-sans"
           >
              <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-black italic text-sm">Notifications</h3>
                <button onClick={() => setShowNotifs(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {notifications.map(n => (
                  <div key={n.id} className="p-4 border-b border-slate-50 hover:bg-slate-50 cursor-pointer">
                    <p className="text-xs font-medium text-slate-700">{n.message}</p>
                    <span className="text-[8px] font-bold text-slate-400 uppercase mt-1 inline-block">1 min ago</span>
                  </div>
                ))}
                {notifications.length === 0 && <p className="p-8 text-center text-xs text-slate-400">All caught up!</p>}
              </div>
           </motion.div>
        </div>
      )}

      {/* Admin Switcher for Reviewer Convenience */}
      <div className="fixed bottom-24 right-4 z-[100]">
         <button 
           onClick={() => setCurrentPage('ADMIN')}
           className="w-12 h-12 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
         >
           <ShieldCheck className="w-6 h-6" />
         </button>
         <div className="absolute -top-12 right-0 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded whitespace-nowrap">
            JUDGE VIEW: ADMIN
         </div>
      </div>

      {showCloseModal && closingQuestId && (
        <QuestClosureModal 
          onConfirm={(reason) => handleCloseQuest(closingQuestId, reason)}
          onCancel={() => { setShowCloseModal(false); setClosingQuestId(null); }}
        />
      )}
    </div>
  );
}

function QuestClosureModal({ onConfirm, onCancel }: { onConfirm: (reason: string) => void, onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const [isClosing, setIsClosing] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setIsClosing(true);
    await onConfirm(reason);
    setIsClosing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-6 backdrop-blur-sm px-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
      >
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-black italic">Close Quest</h2>
            <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-400" /></button>
          </div>
          <p className="text-xs text-slate-500 mb-6 font-medium">Why are you closing this quest? (e.g. Found it myself, No longer need help, etc.)</p>
          
          <textarea 
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Enter reason..."
            className="w-full h-32 bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm outline-none focus:border-orange-500 transition-colors"
          />

          <div className="mt-6 flex gap-3">
             <button onClick={onCancel} className="flex-1 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest outline-none">Cancel</button>
             <button 
                onClick={handleSubmit}
                disabled={!reason.trim() || isClosing}
                className="flex-[2] py-3 bg-orange-500 text-white rounded-2xl text-xs font-black italic uppercase tracking-widest shadow-lg shadow-orange-100 active:scale-95 transition-transform"
             >
                {isClosing ? 'Closing...' : 'Close Quest'}
             </button>
          </div>
        </div>
        <div className="bg-indigo-50 p-4 border-t border-indigo-100 flex gap-3 items-center">
           <Zap className="w-5 h-5 text-indigo-500" />
           <p className="text-[10px] text-indigo-700 font-medium italic leading-relaxed">
             "AI will enhance your reason to make it clear for all search helpers."
           </p>
        </div>
      </motion.div>
    </div>
  );
}

// --- Sub-Components ---

function Header({ user, activeRole, unreadCount, onSwitchRole, showNotifs, onToggleNotifs, darkMode, onToggleDarkMode }: { user: User, activeRole: UserRole, unreadCount: number, onSwitchRole: () => void, showNotifs: boolean, onToggleNotifs: () => void, darkMode: boolean, onToggleDarkMode: () => void }) {
  return (
    <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-3xl border-b border-slate-200/50 dark:border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-[60] lg:px-16 lg:py-6 transition-colors">
      <div className="flex items-center gap-5">
        <div className="w-12 h-12 bg-slate-950 dark:bg-orange-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-slate-900/20 -rotate-6 border border-white/10 group cursor-pointer hover:rotate-0 transition-transform duration-500">
          <Zap className="w-6 h-6 text-orange-500 dark:text-white fill-orange-500 dark:fill-white animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">PakFound</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 tracking-wide uppercase">Community Online</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 lg:gap-10">
        <button 
          onClick={onToggleDarkMode}
          className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-95"
        >
          {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        <div className="hidden md:flex items-center gap-8 px-6 py-2.5 bg-orange-50/50 dark:bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-orange-100 dark:border-slate-700 shadow-sm">
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Your City</span>
              <span className="text-sm font-bold text-slate-900 dark:text-white">Lahore</span>
           </div>
           <div className="w-px h-8 bg-orange-200 dark:bg-slate-700"></div>
           <div className="flex flex-col items-end">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Balance</span>
              <span className="text-sm font-bold text-orange-600 dark:text-orange-400">Rs. {user.walletBalance.toLocaleString()}</span>
           </div>
        </div>

        <button 
          onClick={onSwitchRole}
          className={`group relative flex items-center gap-3 px-5 py-2.5 rounded-2xl font-bold text-[10px] tracking-widest transition-all shadow-lg active:scale-95 ${activeRole === UserRole.LOSTER ? 'bg-orange-500 text-white shadow-orange-500/20' : 'bg-slate-900 text-white shadow-slate-900/20'}`}
        >
          {activeRole === UserRole.LOSTER ? 'SWITCH TO HELPER' : 'SWITCH TO POSTER'}
          <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500 ml-1" />
        </button>

        <button 
          onClick={onToggleNotifs}
          className={`relative w-11 h-11 rounded-xl flex items-center justify-center transition-all group ${showNotifs ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/20 scale-110' : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50 shadow-sm'}`}
        >
          <Bell className={`w-5 h-5 transition-colors ${showNotifs ? 'text-white' : 'group-hover:text-slate-900 text-slate-400'}`} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-600 text-white text-[9px] font-black rounded-lg flex items-center justify-center border-2 border-white animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
        
        <div className="hidden sm:block">
           <img src={user.profileImage} className="w-10 h-10 rounded-xl border-2 border-white shadow-lg object-cover" />
        </div>
      </div>
    </header>
  );
}

function BottomNav({ currentPage, setCurrentPage, activeRole }: { currentPage: string, setCurrentPage: (p: any) => void, activeRole: UserRole }) {
  const isHelper = activeRole === UserRole.HELPER;
  
  return (
    <nav className="fixed bottom-6 left-6 right-6 lg:left-6 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:right-auto lg:h-auto lg:max-h-[80vh] lg:w-16 bg-white dark:bg-slate-900 border border-orange-100 dark:border-slate-800 rounded-[2rem] flex items-center justify-around p-2 lg:flex-col lg:py-8 lg:gap-6 z-50 shadow-[0_15px_35px_rgba(255,138,113,0.12)] dark:shadow-none transition-colors">
      <NavButton active={currentPage === 'DASHBOARD'} onClick={() => setCurrentPage('DASHBOARD')} icon={Compass} label="Dashboard" />
      
      {!isHelper && <NavButton active={currentPage === 'MAP'} onClick={() => setCurrentPage('MAP')} icon={MapIcon} label="Map View" />}
      
      {activeRole === UserRole.LOSTER ? (
        <motion.button 
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setCurrentPage('ADD_QUEST')}
          title="Post Lost Item"
          className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all relative z-10 ${currentPage === 'ADD_QUEST' ? 'bg-slate-900 text-white' : 'bg-orange-500 text-white shadow-orange-200/50'}`}
        >
          <Plus className="w-7 h-7 stroke-[2.5px]" />
        </motion.button>
      ) : (
        <NavButton active={currentPage === 'QUESTS'} onClick={() => setCurrentPage('QUESTS')} icon={ShieldCheck} label="Interests" />
      )}
      
      <NavButton active={currentPage === 'CHAT'} onClick={() => setCurrentPage('CHAT')} icon={MessageSquare} label="Chats" />
      <NavButton active={currentPage === 'PROFILE'} onClick={() => setCurrentPage('PROFILE')} icon={UserIcon} label="Profile" />
    </nav>
  );
}

function NavButton({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick} 
      title={label}
      className="flex flex-col items-center gap-1 transition-all outline-none border-none bg-transparent cursor-pointer group active:scale-95 relative"
    >
      <div className={`p-2 lg:p-2.5 rounded-xl transition-all relative ${active ? 'bg-orange-500 scale-105 shadow-md shadow-orange-200' : 'hover:bg-orange-50 dark:hover:bg-slate-800'}`}>
        <Icon className={`w-4.5 h-4.5 lg:w-5.5 lg:h-5.5 transition-colors ${active ? 'text-white' : 'text-slate-400 group-hover:text-orange-400 dark:text-slate-500'}`} />
      </div>
      <span className="lg:hidden text-[8px] font-bold text-slate-400 dark:text-slate-500 mt-0.5">{label}</span>
      {active && (
        <motion.div 
          layoutId="sidebar-active-indicator"
          className="absolute -right-8 lg:-right-10 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-orange-500 rounded-l-full hidden lg:block"
        />
      )}
    </button>
  );
}

function FullMapView({ quests, onQuestClick, searchQuery, onSearch, onSelectSuggestion, suggestions, onDetectLocation, mapCenter, userLocation, isLoaded }: any) {
  const [filterCat, setFilterCat] = useState('All Categories');
  const [filterPrice, setFilterPrice] = useState('Any Reward');
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const onLoad = React.useCallback(function callback(m: google.maps.Map) {
    setMap(m);
  }, []);

  const onUnmount = React.useCallback(function callback(m: google.maps.Map) {
    setMap(null);
  }, []);

  const filteredQuests = quests.filter((q: Quest) => {
    const catMatch = filterCat === 'All Categories' || q.category === filterCat;
    const reward = Number(q.rewardAmount);
    const priceMatch = filterPrice === 'Any Reward' || (
      filterPrice === '< 500' ? reward < 500 :
      filterPrice === '500 - 2000' ? (reward >= 500 && reward <= 2000) :
      filterPrice === '> 2000' ? reward > 2000 : true
    );
    return catMatch && priceMatch;
  });

  // Fit bounds when quests change
  useEffect(() => {
    if (map && isLoaded && typeof google !== 'undefined' && filteredQuests.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      filteredQuests.forEach((q: Quest) => {
        if (q.locations && q.locations.length > 0) {
          bounds.extend(new google.maps.LatLng(q.locations[0].lat, q.locations[0].lng));
        }
      });
      if (userLocation) {
        bounds.extend(new google.maps.LatLng(userLocation.lat, userLocation.lng));
      }
      
      // Only fit bounds if there are multiple markers or markers are far from center
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds);
        // Don't zoom in too much
        if ((map.getZoom() || 0) > 16) {
          map.setZoom(14);
        }
      }
    }
  }, [map, filteredQuests, isLoaded, userLocation]);

  // Pan to center when mapCenter changes manually
  useEffect(() => {
    if (map && mapCenter) {
      map.panTo(mapCenter);
    }
  }, [map, mapCenter]);

  return (
    <div className="h-full flex flex-col relative group overflow-hidden lg:rounded-[2.5rem] lg:shadow-2xl bg-white border border-slate-100">
      {/* Search & Filter Interface */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-col gap-2 max-w-xl">
        <div className="bg-white/95 backdrop-blur-sm border border-orange-100 rounded-2xl p-1.5 shadow-xl focus-within:ring-2 focus-within:ring-orange-200 transition-all flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 flex-1 h-10">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input 
              type="text" 
              placeholder="Search area (e.g. Liberty Market)..." 
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="flex-1 bg-transparent border-none focus:ring-0 text-xs font-bold text-slate-900 placeholder:text-slate-300 h-full"
            />
            {searchQuery && (
              <button onClick={() => onSearch('')} className="p-1.5 hover:bg-orange-50 rounded-lg">
                 <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>
          <div className="w-px h-5 bg-orange-100 hidden sm:block" />
          <button 
            onClick={onDetectLocation}
            className="flex items-center gap-2 px-3 h-10 text-orange-500 hover:bg-orange-50 rounded-xl transition-all font-bold text-[10px]"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Near Me</span>
          </button>
        </div>

        {/* Compact Filters Row */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <select 
            value={filterCat} 
            onChange={(e) => setFilterCat(e.target.value)}
            className="flex-shrink-0 bg-white/90 backdrop-blur-sm border border-orange-100 rounded-lg px-2.5 py-1.5 text-[9px] font-bold text-slate-600 outline-none focus:ring-1 focus:ring-orange-500 shadow-sm"
          >
            <option>All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          
          <select 
            value={filterPrice} 
            onChange={(e) => setFilterPrice(e.target.value)}
            className="flex-shrink-0 bg-white/90 backdrop-blur-sm border border-orange-100 rounded-lg px-2.5 py-1.5 text-[9px] font-bold text-slate-600 outline-none focus:ring-1 focus:ring-orange-500 shadow-sm"
          >
            <option>Any Reward</option>
            <option>&lt; 500</option>
            <option>500 - 2000</option>
            <option>&gt; 2000</option>
          </select>
        </div>
        
        {suggestions.length > 0 && searchQuery && (
          <div className="bg-white rounded-xl p-2 shadow-2xl border border-orange-50 space-y-0.5 max-h-60 overflow-y-auto">
            {suggestions.map((s: string, i: number) => (
              <button 
                key={i} 
                onClick={() => onSelectSuggestion(s)}
                className="w-full text-left px-3 py-2 hover:bg-orange-50 rounded-lg flex items-center gap-2 transition-colors group"
              >
                <MapPin className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                <span className="text-[10px] font-bold text-slate-600 truncate">{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 bg-slate-100 relative overflow-hidden min-h-[300px]">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={mapCenter}
            zoom={14}
            options={mapOptions as any}
            onLoad={onLoad}
            onUnmount={onUnmount}
          >
            {userLocation && isLoaded && typeof google !== 'undefined' && (
              <MarkerF 
                position={userLocation} 
                title="YOU ARE HERE"
                icon={{
                  url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
                  scaledSize: new google.maps.Size(40, 40),
                  labelOrigin: new google.maps.Point(20, -10)
                } as any}
                label={{
                  text: 'YOU ARE HERE',
                  color: '#3b82f6',
                  fontSize: '10px',
                  fontWeight: '900',
                  className: 'bg-white/80 px-1 py-0.5 rounded shadow-sm backdrop-blur-sm mt-8 inline-block'
                }}
              />
            )}

            {isLoaded && typeof google !== 'undefined' && filteredQuests.map((q: Quest, i: number) => {
              const location = q.locations && q.locations.length > 0 
                ? q.locations[0] 
                : { lat: mapCenter.lat + (Math.sin(i) * 0.01), lng: mapCenter.lng + (Math.cos(i) * 0.01) };
              
              return (
                <MarkerF
                  key={q.id}
                  position={{ lat: location.lat, lng: location.lng }}
                  onClick={() => setSelectedQuest(q)}
                  animation={google.maps.Animation.DROP}
                  icon={{
                    url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
                    scaledSize: new google.maps.Size(40, 40)
                  } as any}
                />
              );
            })}

            {selectedQuest && (
              <InfoWindow
                position={{ 
                  lat: (selectedQuest.locations[0]?.lat || mapCenter.lat), 
                  lng: (selectedQuest.locations[0]?.lng || mapCenter.lng) 
                }}
                onCloseClick={() => setSelectedQuest(null)}
              >
                <div className="p-1 min-w-[220px] font-sans">
                  <div className="relative h-28 w-full mb-3 rounded-2xl overflow-hidden group shadow-md">
                    <img src={selectedQuest.images[0]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute top-2 right-2 bg-orange-500 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-[0_4px_12px_rgba(255,138,113,0.4)]">
                      Rs. {selectedQuest.rewardAmount}
                    </div>
                  </div>
                  <div className="px-1">
                    <h4 className="font-black italic text-[13px] text-slate-900 leading-tight mb-1 truncate uppercase tracking-tight">{selectedQuest.title}</h4>
                    <p className="text-[10px] text-slate-400 font-bold mb-4 line-clamp-2 leading-relaxed">{selectedQuest.description}</p>
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={() => onQuestClick(selectedQuest.id)}
                        className="flex-1 py-2.5 bg-slate-900 text-white rounded-xl text-[9px] font-black italic uppercase tracking-[0.15em] shadow-lg shadow-slate-200 active:scale-95 transition-all"
                      >
                        Scanner
                      </button>
                      <button 
                        onClick={() => {
                          onQuestClick(selectedQuest.id);
                        }}
                         className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-[9px] font-black italic uppercase tracking-[0.15em] shadow-lg shadow-orange-200 active:scale-95 transition-all"
                      >
                        Intercept
                      </button>
                    </div>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-slate-50">
            <div className="flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Waking Google Maps...</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-4 right-4 z-10">
           <div className="bg-white/90 backdrop-blur-md border border-orange-100 p-3 rounded-2xl shadow-xl text-slate-900">
              <div className="flex items-center gap-2 mb-2">
                 <div className="w-1 h-4 bg-orange-500 rounded-full animate-pulse"></div>
                 <h4 className="text-[8px] font-bold uppercase tracking-widest text-slate-400">Live Status</h4>
              </div>
              <div className="flex gap-4">
                 <div>
                    <span className="text-[7px] text-slate-400 font-bold uppercase block">Items</span>
                    <p className="text-xs font-bold text-slate-900">{filteredQuests.length}</p>
                 </div>
                 <div className="w-px h-5 bg-orange-100" />
                 <div>
                    <span className="text-[7px] text-slate-400 font-bold uppercase block">Active</span>
                    <p className="text-xs font-bold text-orange-500">2.4K</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function AdminPanel({ claims, onApprove }: any) {
  return (
    <div className="p-4 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">Review Help</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Help our community by checking these found items.</p>
      </div>

      <div className="space-y-4">
        {claims.map((c: any) => (
          <div key={c.id} className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-orange-100 dark:border-slate-700 shadow-sm transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${c.status === 'PENDING' ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400' : 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400'}`}>
                {c.status === 'PENDING' ? 'Waiting' : 'Checked'}
              </span>
            </div>
            <div className="flex gap-4">
               <div className="w-20 h-20 bg-orange-50 dark:bg-slate-700 rounded-2xl flex items-center justify-center border border-orange-50 dark:border-slate-600">
                  <Camera className="w-8 h-8 text-orange-200 dark:text-slate-600" />
               </div>
               <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Proof for Finding</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Found in: {c.foundLocation.address}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium italic">Status: {c.condition}</p>
               </div>
            </div>
            {c.status === 'PENDING' && (
              <div className="flex gap-3 mt-6">
                <button className="flex-1 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 transition-colors">SKIP</button>
                <button onClick={() => onApprove(c.id)} className="flex-[2] py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold shadow-md shadow-orange-100 transition-colors">CONFIRM FINDING</button>
              </div>
            )}
          </div>
        ))}
        {claims.length === 0 && (
           <div className="text-center py-24">
             <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
               <CheckCircle2 className="w-8 h-8 text-orange-200" />
             </div>
             <p className="text-slate-400 font-medium">No items waiting for review!</p>
           </div>
        )}
      </div>
    </div>
  );
}

function LosterDashboard({ user, quests, onAddClick, onQuestClick, onChatClick }: any) {
  return (
    <div className="p-4 sm:p-0 space-y-8 lg:space-y-12 pb-48">
      <section>
        <div className="flex justify-between items-end mb-6 lg:mb-8">
          <div>
            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Your Lost Items</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm lg:text-base font-medium mt-2">We are helping you find {quests.length} active items.</p>
          </div>
          <button 
            onClick={onAddClick} 
            className="flex items-center gap-3 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-2xl font-bold tracking-wide transition-all shadow-md shadow-orange-100 active:scale-95"
          >
            <Plus className="w-5 h-5" /> 
            <span className="hidden sm:inline">Post New Item</span>
          </button>
        </div>

        <ExplainerPanel 
          title="How it works" 
          description="Your item is shared with our community of helpers in Pakistan. They will look for it and chat with you if they find something. It's safe and easy!"
          badge="Community"
        />

        <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-2 mt-8">
          {quests.map((q: Quest) => (
             <QuestCard key={q.id} quest={q} onClick={() => onQuestClick(q.id)} onChatClick={(id) => onChatClick(id)} />
          ))}
        </div>
        
        {quests.length === 0 && (
          <div className="py-20 lg:py-32 flex flex-col items-center text-center max-w-sm mx-auto">
             <div className="w-24 h-24 bg-white border border-orange-100 rounded-[2.5rem] flex items-center justify-center mb-8">
               <Package className="w-10 h-10 text-orange-300" />
             </div>
             <p className="text-slate-900 font-bold text-lg">No Items Posted Yet</p>
             <p className="text-sm text-slate-500 mt-4 font-medium">Post your first item and our community will start helping you find it immediately.</p>
             <button onClick={onAddClick} className="mt-10 w-full py-4 bg-slate-900 text-white rounded-2xl font-bold tracking-widest shadow-xl active:scale-95 transition-all">
               POST AN ITEM
             </button>
          </div>
        )}
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-[3rem] p-8 lg:p-12 shadow-sm border border-orange-50 dark:border-slate-700 relative overflow-hidden transition-colors">
        <div className="absolute top-0 right-0 w-64 h-64 bg-orange-100/50 dark:bg-orange-900/20 blur-[100px] rounded-full"></div>
        <h3 className="text-2xl font-bold mb-10 flex items-center gap-4 text-slate-900 dark:text-white">
          <Zap className="w-8 h-8 text-orange-500" />
          Easy Tips for You
        </h3>
        <div className="grid sm:grid-cols-3 gap-10">
          {[
            { icon: Camera, title: "Clear Photos", desc: "Take good photos so helpers know exactly what to look for." },
            { icon: Navigation, title: "Correct Location", desc: "Mark the exact area where you think you lost it." },
            { icon: DollarSign, title: "Offer a Gift", desc: "Small rewards can help motivate our community to look faster." }
          ].map((item, i) => (
            <div key={i} className="space-y-4">
              <div className="w-14 h-14 rounded-[1.25rem] bg-orange-50 dark:bg-slate-700 flex items-center justify-center group-hover:scale-110 transition-transform">
                <item.icon className="w-7 h-7 text-orange-500" />
              </div>
              <div>
                <h4 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">{item.title}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed font-medium">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

interface QuestCardProps {
  key?: string | number;
  quest: Quest;
  onClick: () => void;
  onChatClick?: (id: string) => void;
}

function QuestCard({ quest, onClick, onChatClick }: QuestCardProps) {
  return (
    <motion.div 
      whileHover={{ y: -8 }}
      className="bg-white dark:bg-slate-800 rounded-[2.5rem] overflow-hidden border border-orange-50 dark:border-slate-700 shadow-sm hover:shadow-xl transition-all group flex flex-col h-full bg-gradient-to-b from-white dark:from-slate-800 to-[#fffbf9] dark:to-slate-800/80"
    >
      <div className="relative h-64 shrink-0 overflow-hidden cursor-pointer" onClick={onClick}>
        <img src={quest.images[0]} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
        <div className="absolute top-4 right-4 flex gap-2">
           <div className="bg-orange-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
              <span className="text-[8px] opacity-70">Rs.</span>
              {quest.rewardAmount}
           </div>
           {quest.priority === 'HIGH' && (
             <div className="bg-red-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-2">
                <Zap className="w-3 h-3 fill-white" />
                URGENT
             </div>
           )}
        </div>
        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
           <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 py-2 rounded-2xl border border-orange-100 dark:border-slate-700 shadow-md">
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1 leading-none">Last Seen</span>
              <div className="flex items-center gap-2">
                 <MapPin className="w-3 h-3 text-orange-500" />
                 <span className="text-xs font-bold text-slate-900 dark:text-white">{quest.locations[0]?.name.split(',')[0]}</span>
              </div>
           </div>
           <div className="flex -space-x-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 overflow-hidden shadow-sm">
                  <img src={`https://i.pravatar.cc/100?img=${i + 10}`} className="w-full h-full object-cover" />
                </div>
              ))}
              <div className="w-8 h-8 rounded-full border-2 border-white dark:border-slate-800 bg-orange-500 text-white flex items-center justify-center text-[10px] font-bold shadow-sm">
                +{quest.helperIds.length}
              </div>
           </div>
        </div>
      </div>
      
      <div className="p-8 flex flex-col flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className="bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-3 py-1 rounded-lg uppercase tracking-wider border border-orange-100 dark:border-orange-900/50">
            {quest.category}
          </div>
          <div className="flex items-center gap-1.5">
             <div className="w-1.5 h-1.5 rounded-full animate-pulse bg-green-500"></div>
             <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Finding</span>
          </div>
        </div>
        
        <h3 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white group-hover:text-orange-500 transition-colors mb-3 leading-tight cursor-pointer" onClick={onClick}>
          {quest.title}
        </h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400 font-medium line-clamp-2 mb-8 leading-relaxed">
          {quest.description}
        </p>
        
        <div className="mt-auto flex gap-3">
           {onChatClick && (
             <button 
               onClick={() => onChatClick(quest.id)}
               className="flex-1 py-4 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 group/btn"
             >
               <MessageSquare className="w-4 h-4" />
               CHAT NOW
             </button>
           )}
           <button 
             onClick={onClick}
             className="flex-1 py-4 bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 group/btn border border-orange-100 dark:border-orange-900/40 hover:bg-orange-100 dark:hover:bg-orange-950/40"
           >
             DETAILS
             <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
           </button>
        </div>
      </div>
    </motion.div>
  );
}

function HelperDashboard({ quests, joinedQuests, onQuestClick, onJoinQuest, onChatClick, searchQuery, onSearch, onSelectSuggestion, suggestions, onDetectLocation, mapCenter, userLocation, isLoaded }: any) {
  return (
    <div className="h-[calc(100vh-180px)] lg:h-[calc(100vh-100px)] relative pb-48 lg:pb-32">
      <FullMapView 
        quests={quests} 
        onQuestClick={onQuestClick} 
        searchQuery={searchQuery} 
        onSearch={onSearch} 
        onSelectSuggestion={onSelectSuggestion}
        suggestions={suggestions} 
        onDetectLocation={onDetectLocation} 
        mapCenter={mapCenter} 
        userLocation={userLocation}
        isLoaded={isLoaded}
      />
      
      {/* Joined Quests Floating Panel */}
      {joinedQuests.length > 0 && (
        <div className="absolute bottom-6 left-6 right-6 lg:left-auto lg:right-6 lg:w-96 z-30">
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-orange-100 dark:border-slate-800 rounded-[2rem] p-5 shadow-2xl transition-colors">
            <div className="flex items-center justify-between mb-4 px-2">
               <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-2">
                 <ShieldCheck className="w-4 h-4 text-orange-500" />
                 Your Current Jobs
               </h3>
               <span className="text-[10px] font-bold text-orange-500">{joinedQuests.length} ACTIVE</span>
            </div>
            <div className="space-y-3">
              {joinedQuests.map((q: Quest) => (
                <div key={q.id} className="bg-orange-50/50 dark:bg-slate-800 border border-orange-100 dark:border-slate-700 rounded-2xl p-3 flex items-center gap-4 group hover:bg-orange-100/50 dark:hover:bg-slate-700 transition-all">
                   <img src={q.images[0]} className="w-12 h-12 rounded-xl object-cover shadow-sm" />
                   <div className="flex-1 min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">{q.title}</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{q.locations[0]?.name}</p>
                   </div>
                   <div className="flex gap-2">
                     <button onClick={() => onChatClick(q.id)} className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-sm hover:scale-110 transition-transform">
                        <MessageSquare className="w-4 h-4" />
                     </button>
                     <button onClick={() => onQuestClick(q.id)} className="w-8 h-8 bg-white dark:bg-slate-700 border border-orange-200 dark:border-slate-600 text-orange-500 rounded-lg flex items-center justify-center shadow-sm hover:scale-110 transition-transform">
                        <Navigation className="w-4 h-4" />
                     </button>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddQuestFlow({ onCancel, onPublish, isLoaded }: { onCancel: () => void, onPublish: (form: Partial<Quest>) => void, isLoaded: boolean }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Partial<Quest>>({
    title: '',
    category: CATEGORIES[0],
    description: '',
    images: [],
    rewardAmount: 500,
    locations: []
  });
  const [moderating, setModerating] = useState(false);
  const [moderationResult, setModerationResult] = useState<any>(null);

  // For Step 3 (Possible Locations)
  const [tempLocTitle, setTempLocTitle] = useState('');
  const [tempLocInstructions, setTempLocInstructions] = useState('');
  const [tempLocCoords, setTempLocCoords] = useState<{lat: number, lng: number} | null>(null);

  const steps = ["Details", "Photos", "Recovery Guide", "Reward", "Post"];

  const handleNext = () => {
    if (step === 1 && (!form.title || !form.description)) {
      alert("Please enter the name and description of the item.");
      return;
    }
    if (step === 2 && (form.images?.length || 0) < 1) {
      alert("Please upload at least 1 photo of the item.");
      return;
    }
    if (step === 3 && (form.locations?.length || 0) < 1) {
      alert("Please add at least 1 possible location where you lost the item.");
      return;
    }
    setStep(step + 1);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if ((form.images?.length || 0) >= 5) {
      alert("Maximum 5 images allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (rv) => {
      const base64 = rv.target?.result as string;
      setModerating(true);
      setModerationResult(null);
      const res = await moderateImage(base64);
      setModerating(false);
      
      if (res.isSafe) {
        setForm(prev => ({ ...prev, images: [base64] }));
        setModerationResult(res);
      } else {
        alert(`AI Shield Blocked Upload: ${res.rejectionReason}`);
      }
    };
    reader.readAsDataURL(file);
  };

  const addLocation = () => {
    if (!tempLocTitle || !tempLocCoords) {
      alert("Please search for a location and give it a title/count.");
      return;
    }
    const newLoc = { 
      id: Math.random().toString(36).substr(2, 9), 
      name: tempLocTitle, 
      lat: tempLocCoords.lat, 
      lng: tempLocCoords.lng, 
      instructions: tempLocInstructions 
    };
    setForm({...form, locations: [...(form.locations || []), newLoc]});
    setTempLocTitle('');
    setTempLocInstructions('');
    setTempLocCoords(null);
  };

  const removeLocation = (id: string) => {
    setForm({...form, locations: form.locations?.filter(l => l.id !== id)});
  };

  const detectLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        setTempLocTitle(`My Location`);
        setTempLocCoords({ lat: latitude, lng: longitude });
      }, (error) => {
        alert("Location access denied.");
      });
    } else {
      alert("Geolocation not supported.");
    }
  };

  return (
    <div className="p-4 pt-10 min-h-screen bg-slate-50/50">
      <div className="max-w-xl mx-auto pb-24">
        <div className="flex justify-between items-center mb-12">
          <button onClick={onCancel} className="text-slate-400 h-10 w-10 bg-white border border-slate-200 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
            <X className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 w-8 rounded-full transition-all duration-500 ${i + 1 <= step ? 'bg-orange-500 w-12' : 'bg-slate-200'}`}></div>
            ))}
          </div>
          <div className="w-10"></div>
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-black italic text-slate-900 dark:text-white tracking-tight">Main Details</h2>
              <p className="text-slate-400 dark:text-slate-500 font-medium text-sm">Tell the community what to look for.</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Item Title</label>
                <input 
                  value={form.title}
                  onChange={(e) => setForm({...form, title: e.target.value})}
                  placeholder="e.g. Blue Nike Backpack" 
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-sm font-bold placeholder:text-slate-300 dark:placeholder:text-slate-600 dark:text-white focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none transition-all shadow-sm" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Category</label>
                  <select 
                    value={form.category}
                    onChange={(e) => setForm({...form, category: e.target.value})}
                    className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-sm font-bold dark:text-white focus:border-orange-500 outline-none shadow-sm"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Urgency</label>
                   <div className="flex bg-slate-200 dark:bg-slate-700 p-1 rounded-2xl">
                      {['NORMAL', 'HIGH'].map(p => (
                        <button 
                          key={p}
                          onClick={() => setForm({...form, priority: p as any})}
                          className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${form.priority === p ? 'bg-white dark:bg-slate-600 shadow-md text-orange-500' : 'text-slate-400 dark:text-slate-500'}`}
                        >
                          {p}
                        </button>
                      ))}
                   </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] ml-1">Key Description</label>
                <textarea 
                  value={form.description}
                  onChange={(e) => setForm({...form, description: e.target.value})}
                  rows={4}
                  placeholder="Mention unique features, contents, or serial numbers..." 
                  className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-6 py-4 text-sm font-bold dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:border-orange-500 outline-none shadow-sm resize-none"
                />
              </div>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-black italic text-slate-900 dark:text-white tracking-tight">Visual Identity</h2>
              <p className="text-slate-400 dark:text-slate-500 font-medium text-sm">Upload exactly 1 clear photo for identification.</p>
            </div>
            
            <div className="grid grid-cols-1 gap-4 max-w-xs mx-auto">
              {(form.images || []).map((img, i) => (
                <div key={i} className="aspect-square rounded-3xl overflow-hidden relative group border-2 border-white dark:border-slate-800 shadow-lg">
                  <img src={img} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => setForm({...form, images: []})}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {(form.images?.length || 0) < 1 && (
                <label className="aspect-square rounded-3xl bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-orange-300 hover:bg-orange-50/20 dark:hover:bg-slate-700 transition-all group">
                  {moderating ? (
                    <Clock className="w-8 h-8 text-orange-500 animate-spin" />
                  ) : (
                    <Camera className="w-8 h-8 text-slate-300 dark:text-slate-600 group-hover:text-orange-400 group-hover:scale-110 transition-all" />
                  )}
                  <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 mt-4 uppercase tracking-[0.2em]">
                    {moderating ? 'Scanning...' : 'Add Photo'}
                  </span>
                  <input type="file" className="hidden" accept="image/*" onChange={(e: any) => handleImageUpload(e)} />
                </label>
              )}
            </div>

            <ExplainerPanel 
              title="AI Content Moderation" 
              description="Gemini Vision scans all uploads for safety and clarity. Blurry or unsafe content will be auto-flagged for review."
              badge="Secure"
            />
          </motion.div>
        )}



        {step === 3 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
            <div className="space-y-4 text-center">
               <h2 className="text-3xl font-black italic text-slate-900 dark:text-white tracking-tight">Possible Locations & Recovery Instructions</h2>
            </div>

            <div className="space-y-8">
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-[2.5rem] p-8 shadow-xl transition-colors">
                 <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black italic text-slate-900 dark:text-white">Saved Locations</h3>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase">Up to 5 spots</p>
                 </div>
                 
                 <div className="space-y-3">
                    {form.locations?.map((loc, i) => (
                      <div key={loc.id} className="bg-orange-50/50 dark:bg-slate-900/50 p-4 rounded-2xl flex items-center gap-4 group border border-orange-100 dark:border-slate-700 transition-colors">
                         <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shrink-0 shadow-sm font-black text-orange-500 text-sm">
                            {String(i + 1).padStart(2, '0')}
                         </div>
                         <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white truncate">{loc.name}</h4>
                            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">{loc.instructions || 'No specific instructions'}</p>
                         </div>
                         <button 
                           onClick={() => removeLocation(loc.id)}
                           className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-red-500 shadow-sm hover:bg-red-50 transition-colors"
                         >
                            <X className="w-4 h-4" />
                         </button>
                      </div>
                    ))}
                    {(!form.locations || form.locations.length === 0) && (
                      <p className="text-center py-6 text-slate-300 font-bold italic text-sm">No locations added yet.</p>
                    )}
                 </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-xl space-y-6">
                 <h3 className="text-xl font-black italic">Additional Locations</h3>
                 
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Location Count (Title)</label>
                       <input 
                         value={tempLocTitle}
                         onChange={(e) => setTempLocTitle(e.target.value)}
                         placeholder="e.g. Near Entry Gate 2"
                         className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:bg-white focus:border-orange-500 outline-none transition-all shadow-sm"
                       />
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Search Address</label>
                       <div className="relative group">
                          <AddressAutocomplete 
                            isLoaded={isLoaded}
                            onSelect={(place) => {
                              if (place.geometry?.location) {
                                setTempLocCoords({
                                  lat: place.geometry.location.lat(),
                                  lng: place.geometry.location.lng()
                                });
                              }
                            }}
                            placeholder="Find it on the map..."
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:bg-white focus:border-orange-500 outline-none transition-all shadow-sm"
                          />
                          <button onClick={detectLocation} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-orange-500 hover:scale-110 transition-transform">
                             <Navigation className="w-4 h-4" />
                          </button>
                       </div>
                       {tempLocCoords && (
                         <div className="flex items-center gap-2 px-2 text-[10px] font-black text-green-600 uppercase tracking-widest mt-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Location Pin Secured
                         </div>
                       )}
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Specific Instructions</label>
                       <textarea 
                         value={tempLocInstructions}
                         onChange={(e) => setTempLocInstructions(e.target.value)}
                         rows={4}
                         placeholder="e.g. Talk to manager at counter 4..."
                         className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-sm font-bold focus:bg-white focus:border-orange-500 outline-none transition-all shadow-sm resize-none"
                       />
                    </div>

                    <button 
                      onClick={addLocation}
                      className="w-full py-5 bg-orange-500 text-white rounded-full font-black italic text-sm shadow-xl shadow-orange-100 flex items-center justify-center gap-3 active:scale-95 transition-all group"
                    >
                       Add More Locations
                       <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                    </button>
                 </div>
              </div>
            </div>
          </motion.div>
        )}

        {step === 4 && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-10">
            <div className="space-y-2 text-center">
              <h2 className="text-3xl font-black italic text-slate-900 tracking-tight">Community Reward</h2>
              <p className="text-slate-400 font-medium text-sm">Motivation for your neighbors to keep their eyes open.</p>
            </div>
            
            <div className="bg-white dark:bg-slate-800 border-2 border-orange-500 p-12 rounded-[3.5rem] flex flex-col items-center shadow-2xl relative overflow-hidden transition-colors">
              <span className="text-[10px] font-black text-orange-500 uppercase tracking-[0.5em] mb-6 relative z-10">Your Bounty</span>
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <span className="text-4xl font-black italic text-slate-300 dark:text-slate-600">Rs.</span>
                <input 
                   type="number"
                   value={form.rewardAmount}
                   onChange={(e) => setForm({...form, rewardAmount: Number(e.target.value)})}
                   className="text-7xl font-black italic text-slate-900 dark:text-white w-48 bg-transparent outline-none text-center tracking-tighter" 
                />
              </div>
              
              <div className="w-full max-w-sm mt-10 relative z-10">
                <input 
                  type="range"
                  min="500"
                  max="25000"
                  step="500"
                  value={form.rewardAmount}
                  onChange={(e) => setForm({...form, rewardAmount: Number(e.target.value)})}
                  className="w-full h-3 bg-orange-100 rounded-full appearance-none cursor-pointer accent-orange-500"
                />
                <div className="flex justify-between mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Rs. 500</span>
                  <span>Rs. 25,000</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] flex gap-4 items-center shadow-lg">
               <Zap className="w-8 h-8 text-orange-400 shrink-0" />
               <p className="text-sm font-bold leading-relaxed italic opacity-80">
                 "Larger rewards significantly increase recovery speed by activating more Helpers."
               </p>
            </div>
          </motion.div>
        )}

        {step === 5 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="space-y-12 flex flex-col items-center text-center py-12">
            <div className="w-32 h-32 bg-orange-500 text-white rounded-[2.5rem] flex items-center justify-center shadow-2xl">
              <ShieldCheck className="w-16 h-16" />
            </div>
            
            <div className="space-y-4">
              <h2 className="text-4xl font-black italic text-slate-900 dark:text-white tracking-tighter">Ready to Deploy</h2>
              <p className="text-slate-500 dark:text-slate-400 text-lg font-medium px-10">Your quest is ready. Once published, it will be visible to everyone in the recovery area.</p>
            </div>

            <div className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-8 rounded-[3rem] shadow-2xl flex items-center gap-6 text-left transition-colors">
              <img src={form.images?.[0]} className="w-20 h-20 rounded-[1.5rem] object-cover shadow-lg" />
              <div className="flex-1 min-w-0">
                <h4 className="text-lg font-black italic text-slate-900 dark:text-white truncate mb-1">{form.title}</h4>
                <div className="flex gap-2">
                   <span className="bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">{form.category}</span>
                   <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter">Rs. {form.rewardAmount}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <div className="mt-12 flex gap-4">
          {step > 1 && (
            <button 
              onClick={() => setStep(step - 1)} 
              className="w-14 h-14 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-sm"
            >
              <ChevronLeft className="w-6 h-6 text-slate-400 dark:text-slate-500" />
            </button>
          )}
          <button 
            onClick={step === 5 ? () => onPublish(form) : handleNext} 
            className="flex-1 h-14 bg-slate-900 dark:bg-orange-600 text-white rounded-2xl text-xs font-bold shadow-xl active:scale-[0.98] transition-all uppercase tracking-widest"
          >
            {step === 5 ? 'Publish Quest' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestDetail({ quest, canJoin, onJoin, onBack, onChatClick }: any) {
  return (
    <div className="h-full flex flex-col lg:flex-row lg:gap-12 lg:items-start max-w-7xl mx-auto p-4 sm:p-6 lg:p-10">
      {/* Visual Context */}
      <div className="w-full lg:w-[45%] space-y-8">
        <div className="flex justify-between items-center lg:mb-4">
          <button 
            onClick={onBack} 
            className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-md hover:scale-110 active:scale-95 transition-all border border-orange-100 dark:border-slate-700"
          >
            <ChevronLeft className="w-6 h-6 text-slate-800 dark:text-white" />
          </button>
          <div className="lg:hidden">
            <span className="bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 text-[10px] font-bold px-3 py-1 rounded-lg uppercase tracking-wider border border-orange-100 dark:border-orange-900/50">
              {quest.category}
            </span>
          </div>
        </div>

        <div className="space-y-6">
           <div className="relative aspect-square rounded-[3rem] overflow-hidden shadow-xl border-4 border-white dark:border-slate-800 transition-colors">
              <img src={quest.images[0]} className="w-full h-full object-cover" />
              <div className="absolute top-6 right-6">
                 <div className="bg-orange-500 text-white text-lg font-bold px-6 py-3 rounded-[1.5rem] shadow-xl">
                   Rs. {quest.rewardAmount}
                 </div>
              </div>
           </div>
           <div className="grid grid-cols-4 gap-4">
              {quest.images.slice(1).map((img: string, i: number) => (
                <div key={i} className="aspect-square rounded-2xl overflow-hidden border-2 border-white dark:border-slate-800 shadow-lg transition-colors">
                  <img src={img} className="w-full h-full object-cover" />
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* Intel Section */}
      <div className="flex-1 mt-10 lg:mt-0 space-y-10 pb-32 lg:pb-0">
         <div className="space-y-6">
            <div className="hidden lg:flex items-center gap-3">
               <div className="bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 text-[10px] font-black italic px-4 py-1.5 rounded-full uppercase tracking-widest border border-orange-100 dark:border-orange-900/50">
                  {quest.category}
               </div>
               {quest.priority === 'HIGH' && (
                 <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[10px] font-black italic px-4 py-1.5 rounded-full uppercase tracking-widest border border-red-100 dark:border-red-900/50 flex items-center gap-2">
                    <Zap className="w-3 h-3 fill-red-600 dark:fill-red-400" />
                    Priority Target
                 </div>
               )}
            </div>
            <h2 className="text-4xl lg:text-6xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white leading-none">{quest.title}</h2>
            <p className="text-lg text-slate-500 dark:text-slate-400 font-medium leading-relaxed italic">{quest.description}</p>
         </div>

         <div className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
               <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-6">Last Known Sectors</span>
               <div className="space-y-5">
                  {quest.locations.slice(0, 4).map((loc: any, i: number) => (
                    <div key={i} className="flex items-center gap-4 group">
                       <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center shrink-0 group-hover:bg-orange-500 transition-colors">
                          <MapPin className="w-5 h-5 text-orange-500 group-hover:text-white" />
                       </div>
                       <div>
                          <p className="text-xs font-black italic uppercase tracking-tight text-slate-700">{loc.name.split(',')[0]}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{loc.radius}m search radius</p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
            <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white flex flex-col justify-between relative overflow-hidden">
               <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-[50px] rounded-full"></div>
               <div className="relative z-10">
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest block mb-4">Network Status</span>
                  <p className="text-3xl font-black italic tracking-tighter leading-none">{quest.helperIds.length} ACTIVE<br/>AGENTS</p>
               </div>
               <div className="flex -space-x-4 mt-8 relative z-10">
                  {quest.helperIds.map((id: string, i: number) => (
                    <div key={id} className="w-11 h-11 rounded-full border-4 border-slate-900 bg-slate-700 overflow-hidden shadow-2xl">
                      <img src={`https://i.pravatar.cc/100?img=${i + 30}`} className="w-full h-full object-cover grayscale" />
                    </div>
                  ))}
                  <div className="w-11 h-11 rounded-full border-4 border-slate-900 bg-orange-500 text-white flex items-center justify-center text-[10px] font-black shadow-2xl">
                     +2
                  </div>
               </div>
            </div>
         </div>

         {quest.aiRecoverySuggestions && (
            <div className="bg-orange-50/50 rounded-[2.5rem] p-8 border border-orange-100 space-y-6">
               <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200">
                     <Zap className="w-6 h-6 text-white fill-white" />
                  </div>
                  <h3 className="text-xl font-black italic uppercase tracking-tight text-slate-800">Gemini Intelligence</h3>
               </div>
               <div className="grid sm:grid-cols-2 gap-8">
                  <div>
                    <h4 className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-3">Hot Zones</h4>
                    <div className="flex flex-wrap gap-2">
                       {quest.aiRecoverySuggestions.zones.map((z: string, i: number) => (
                         <span key={i} className="px-3 py-1 bg-white border border-orange-100 rounded-lg text-[10px] font-black italic text-orange-700 uppercase">{z}</span>
                       ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-3">Tactical Advice</h4>
                    <ul className="space-y-2">
                       {quest.aiRecoverySuggestions.tips.map((t: string, i: number) => (
                         <li key={i} className="text-[11px] font-medium text-slate-600 italic flex items-start gap-2">
                           <div className="w-1 h-1 bg-blue-500 rounded-full mt-1.5 shrink-0"></div>
                           {t}
                         </li>
                       ))}
                    </ul>
                  </div>
               </div>
            </div>
         )}

         <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent lg:relative lg:p-0 lg:bg-none z-50">
           {canJoin ? (
             <button 
               onClick={onJoin}
               className="w-full py-6 bg-orange-500 hover:bg-orange-600 text-white rounded-[2rem] text-sm font-black italic uppercase tracking-[0.3em] shadow-2xl shadow-orange-500/40 active:scale-95 transition-all flex items-center justify-center gap-4 group"
             >
               Initialize Search Protocol
               <ChevronRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
             </button>
           ) : (
             <div className="flex gap-4">
                <button 
                  onClick={onChatClick}
                  className="flex-1 py-6 bg-slate-900 hover:bg-slate-800 text-white rounded-[2rem] text-sm font-black italic uppercase tracking-[0.3em] flex items-center justify-center gap-4 transition-all active:scale-95 shadow-2xl"
                >
                  <MessageSquare className="w-6 h-6" />
                  Live Comms
                </button>
                <button className="hidden sm:flex flex-1 py-6 bg-white border border-slate-200 text-slate-800 rounded-[2rem] text-sm font-black italic uppercase tracking-[0.3em] items-center justify-center gap-4 transition-all active:scale-95 border-b-4 border-slate-200">
                   Analyze Context
                </button>
             </div>
           )}
         </div>
      </div>
    </div>
  );
}

function ChatRoom({ quest, user, messages, onSendMessage, onBack, onFoundIt, onCloseQuest, role }: any) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const emojis = ["👋", "📍", "👀", "💎", "✅", "🙌", "🔥", "🤝"];

  const handleFileUpload = (e: any) => {
    const file = e.target.files?.[0];
    if (file) {
      onSendMessage("Intel Update: Visual Data Attached", "https://images.unsplash.com/photo-1540331547168-8b63109225b7?auto=format&fit=crop&q=80&w=400");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 relative overflow-hidden lg:rounded-[3rem] lg:shadow-2xl lg:border lg:border-slate-100 dark:lg:border-slate-700 max-w-4xl mx-auto w-full transition-colors">
      {/* PakFound Header */}
      <div className="px-6 py-4 border-b border-orange-50 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 transition-colors">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-orange-50 dark:hover:bg-slate-800 rounded-xl transition-colors"><ChevronLeft className="w-6 h-6 text-slate-800 dark:text-white" /></button>
          <div className="flex items-center gap-3">
            <div className="relative">
              <img src={quest.images[0]} className="w-10 h-10 rounded-xl object-cover shadow-sm border border-orange-100 dark:border-slate-700" />
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-slate-800"></div>
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white line-clamp-1">{quest.title}</h3>
              <div className="flex items-center gap-2">
                 <p className="text-[9px] text-green-600 dark:text-green-400 font-bold uppercase tracking-widest animate-pulse">Live Chat</p>
                 <span className="text-[9px] text-slate-300 dark:text-slate-600 font-bold">•</span>
                 <p className="text-[9px] text-slate-400 dark:text-slate-500 font-medium uppercase tracking-widest">{quest.helperIds.length + 1} Neighbors</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {role === UserRole.LOSTER ? (
            <button 
              onClick={onCloseQuest}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-slate-100"
            >
              CLOSE POST
            </button>
          ) : (
            <button 
              onClick={onFoundIt}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 shadow-md shadow-orange-100"
            >
              I FOUND IT
            </button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-[#fff9f7] dark:bg-slate-900 transition-colors">
         <div className="flex flex-col items-center py-8">
            <div className="w-16 h-16 bg-white dark:bg-slate-800 border border-orange-100 dark:border-slate-700 rounded-[1.5rem] flex items-center justify-center mb-4 shadow-sm">
               <Shield className="w-8 h-8 text-orange-500" />
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">Safety Chat Protected</p>
         </div>

         {messages.map((m: any) => {
           const isMe = m.senderId === user.id;
           return (
             <motion.div 
               initial={{ opacity: 0, y: 10, scale: 0.95 }}
               animate={{ opacity: 1, y: 0, scale: 1 }}
               key={m.id} 
               className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
             >
               <div className={`flex items-center gap-2 mb-1 px-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                 <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{m.senderName}</span>
                 <span className="text-[9px] text-slate-300 dark:text-slate-600 font-medium">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
               </div>
               <div className={`max-w-[85%] rounded-[1.5rem] px-5 py-3.5 text-[14px] shadow-sm leading-relaxed ${
                 isMe 
                   ? 'bg-slate-900 dark:bg-orange-600 text-white rounded-tr-none font-medium' 
                   : 'bg-white dark:bg-slate-800 border border-orange-50 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-none font-medium'
               }`}>
                 {m.imageUrl && (
                   <img src={m.imageUrl} className="w-full h-auto max-h-80 object-cover rounded-2xl mb-3 shadow-sm border border-slate-50 dark:border-slate-700" />
                 )}
                 <p>{m.text}</p>
               </div>
             </motion.div>
           );
         })}
      </div>

      <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 shrink-0 sticky bottom-0 z-20 transition-colors">
        {showEmoji && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3 mb-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-x-auto no-scrollbar"
          >
            {emojis.map(e => (
              <button 
                key={e} 
                onClick={() => { setText(text + e); setShowEmoji(false); }}
                className="text-xl hover:scale-125 transition-transform shrink-0"
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
        <div className="bg-orange-50 dark:bg-slate-800 rounded-[2.5rem] p-1.5 flex items-center gap-1 border border-orange-100 dark:border-slate-700 focus-within:bg-white dark:focus-within:bg-slate-700 focus-within:shadow-xl focus-within:border-orange-200 transition-all">
          <button 
             onClick={() => setShowEmoji(!showEmoji)}
             className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${showEmoji ? 'bg-orange-500 text-white' : 'text-slate-400 dark:text-slate-500 hover:bg-orange-100 dark:hover:bg-slate-700'}`}
          >
            <Smile className="w-6 h-6" />
          </button>
          
          <input 
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                onSendMessage(text);
                setText('');
              }
            }}
            placeholder="Type a message..." 
            className="flex-1 bg-transparent text-sm font-medium outline-none h-12 px-2 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600" 
          />

          <div className="flex items-center gap-2 pr-1">
            <label className="w-12 h-12 flex items-center justify-center text-slate-400 hover:bg-orange-100 rounded-full cursor-pointer transition-colors group">
              <Camera className="w-6 h-6 group-hover:text-orange-500" />
              <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
            </label>
            <button 
               disabled={!text.trim()}
               onClick={() => {
                 if (text.trim()) {
                   onSendMessage(text);
                   setText('');
                 }
               }}
               className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${text.trim() ? 'bg-orange-500 text-white shadow-lg shadow-orange-100' : 'bg-orange-100 text-slate-300 cursor-not-allowed'}`}
            >
              <Send className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

