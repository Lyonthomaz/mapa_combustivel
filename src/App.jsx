import React, { useState, useEffect, useMemo } from 'react';
import { Navigation, Fuel, ShieldCheck, AlertTriangle, Crosshair, Calculator, X, ArrowLeft, CheckCircle2, Map as MapIcon, Plus, Minus, Download, Activity, Pizza, Mail, Lock, Star, MapPin, Banknote, CreditCard, Sun, Moon, Layers, Megaphone, LogOut, Users, UserX, UserCheck, Trash2, Accessibility, Volume2, VolumeX, Eye, Zap, ToggleLeft, ToggleRight } from 'lucide-react';
import { GoogleMap, useJsApiLoader, MarkerF } from '@react-google-maps/api';

// IMPORTAÇÕES DO FIREBASE
import { auth, db, googleProvider } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, addDoc, query, onSnapshot, serverTimestamp, doc, setDoc, getDoc, updateDoc, deleteDoc, getDocs } from "firebase/firestore";

// ==========================================
// CONFIGURAÇÕES DA CIDADE E GOOGLE MAPS
// ==========================================
// Centro ajustado entre Rio Preto e Mirassol para cobrir as duas cidades
const SJRP_MIRASSOL_CENTER = { lat: -20.8120, lng: -49.4200 };
const FANTASY_DOMAIN = "@mapeamento.com";
const libraries = ['places'];

const FUEL_TYPES = [
  { id: 'gas_comum', name: 'Gasolina Comum', color: 'bg-red-500' },
  { id: 'gas_aditivada', name: 'Gasolina Aditivada', color: 'bg-red-600' },
  { id: 'etanol_comum', name: 'Etanol Comum', color: 'bg-green-500' },
  { id: 'etanol_aditivado', name: 'Etanol Aditivado', color: 'bg-green-600' },
  { id: 'diesel_comum', name: 'Diesel', color: 'bg-yellow-500' },
  { id: 'diesel_s10', name: 'Diesel S10', color: 'bg-yellow-600' },
  // O tipo Elétrico ficará oculto por padrão, ativado pelo botão
  { id: 'ev_kwh', name: 'Energia (kWh)', color: 'bg-blue-400', isEV: true } 
];

// PLANO B: LISTA MANUAL DE EMERGÊNCIA (Incluindo Mirassol)
const FALLBACK_STATIONS = [
  { id: 'p1', name: 'Rede Brazilian - Bady (SJRP)', lat: -20.8210, lng: -49.3810, address: 'Av. Bady Bassitt, 4800' },
  { id: 'p2', name: 'Posto Ipiranga - Bady II (SJRP)', lat: -20.8150, lng: -49.3830, address: 'Av. Bady Bassitt, 3500' },
  { id: 'm1', name: 'Auto Posto Faria (Mirassol)', lat: -20.8150, lng: -49.5050, address: 'Av. Fernando Costa, 2000' },
  { id: 'm2', name: 'Posto Ipiranga Centro (Mirassol)', lat: -20.8200, lng: -49.5100, address: 'Rua 9 de Julho, 1500' },
];

const darkMapStyle = [
  { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] }
];

// ==========================================
// FUNÇÕES DE CÁLCULO E AUXILIARES
// ==========================================
function calculateDistance(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))); 
}

function calculateConsensus(reports) {
  const NOW = Date.now();
  let sumCash = 0, weightCash = 0;
  reports.forEach(report => {
    const timestamp = report.timestamp || NOW; 
    const hoursPassed = (NOW - timestamp) / (1000 * 60 * 60);
    if (hoursPassed >= 24) return; 
    const timeWeight = 1 - (hoursPassed / 24); 
    if (report.priceCash) { sumCash += (report.priceCash * timeWeight); weightCash += timeWeight; }
  });
  if (weightCash === 0) return { priceCash: null, confidence: 0 };
  return { priceCash: sumCash / weightCash, confidence: Math.min(100, Math.round((weightCash / 3) * 100)) };
}

const formatMoney = (val) => { 
  let num = String(val).replace(/\D/g, ''); 
  return num ? (Number(num) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; 
};
const getRawNumber = (val) => val ? Number(String(val).replace(/\D/g, '')) / 100 : 0;

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================
export default function App() {
  const [authView, setAuthView] = useState('login'); 
  const [currentUser, setCurrentUser] = useState(null); 
  const [isAdmin, setIsAdmin] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [preferredFuel, setPreferredFuel] = useState('gas_comum');
  
  const [userLocation, setUserLocation] = useState(null);
  const [reports, setReports] = useState([]);
  const [evStatusMap, setEvStatusMap] = useState({}); // Mapeia quais postos ativaram EV
  const [stations, setStations] = useState([]); 
  const [mapInstance, setMapInstance] = useState(null); 
  const [selectedStation, setSelectedStation] = useState(null);
  const [apiStatus, setApiStatus] = useState('Buscando...');
  
  const [modalView, setModalView] = useState('list');
  const [submitFuel, setSubmitFuel] = useState(null);
  const [submitPriceCash, setSubmitPriceCash] = useState('');
  
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [isFuelSelectorOpen, setIsFuelSelectorOpen] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [usersList, setUsersList] = useState([]);
  
  // ESTADOS DE ACESSIBILIDADE
  const [isAccMenuOpen, setIsAccMenuOpen] = useState(false);
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const [visualMode, setVisualMode] = useState('normal'); // normal, high-contrast, grayscale, invert
  const [calcPrice, setCalcPrice] = useState('');
  const [calcPaid, setCalcPaid] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mapType, setMapType] = useState('roadmap'); 

  const { isLoaded } = useJsApiLoader({ 
    id: 'google-map-script', 
    googleMapsApiKey: "AIzaSyAYqXkuN3fBDtpzmDtj42A5KkhJcDgjttU",
    libraries: libraries
  });

  // Função de Narração
  const speak = (text) => {
    if (!narrationEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel(); // Para fala anterior
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.active === false) { alert("Sua conta foi desativada."); await signOut(auth); return; }
          setIsAdmin(userData.role === 'admin');
        }
        setCurrentUser(user);
        setAuthView('app');
        speak("Acesso autorizado. Carregando mapa de combustíveis.");
      } else { setCurrentUser(null); setIsAdmin(false); setAuthView('login'); }
    });
    return () => unsubscribe();
  }, [narrationEnabled]);

  // Carrega Relatórios e Status de Postos Elétricos
  useEffect(() => {
    if (authView !== 'app') return;
    
    // Ouve os Preços
    const qReports = query(collection(db, "reports"));
    const unsubReports = onSnapshot(qReports, (snapshot) => {
      const fetchedReports = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetchedReports.push({ id: doc.id, ...data, timestamp: data.timestamp ? data.timestamp.toMillis() : Date.now() });
      });
      setReports(fetchedReports);
    });

    // Ouve o Status de Ativação do Carro Elétrico por Posto
    const qEV = query(collection(db, "ev_status"));
    const unsubEV = onSnapshot(qEV, (snapshot) => {
      const evMap = {};
      snapshot.forEach((doc) => { evMap[doc.id] = doc.data().hasEV; });
      setEvStatusMap(evMap);
    });

    return () => { unsubReports(); unsubEV(); };
  }, [authView]);

  // BUSCA AUTOMÁTICA (RIO PRETO E MIRASSOL)
  useEffect(() => {
    if (!mapInstance || !window.google || authView !== 'app') return;
    
    const service = new window.google.maps.places.PlacesService(mapInstance);
    // Raio aumentado para 25km para garantir cobertura de Mirassol
    const request = { location: SJRP_MIRASSOL_CENTER, radius: 25000, type: 'gas_station' };
    let allStations = [];

    service.nearbySearch(request, (results, status, pagination) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
        const fetchedStations = results.map(place => ({
          id: place.place_id,
          name: place.name,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          address: place.vicinity
        }));
        
        allStations = [...allStations, ...fetchedStations];
        const uniqueStations = Array.from(new Map(allStations.map(item => [item.id, item])).values());
        
        setStations(uniqueStations);
        setApiStatus('Google Places Ativo');

        if (pagination && pagination.hasNextPage) {
          setTimeout(() => { pagination.nextPage(); }, 2000);
        }
      } else if (status !== window.google.maps.places.PlacesServiceStatus.OK && allStations.length === 0) {
        setStations(FALLBACK_STATIONS);
        setApiStatus('Modo Offline Ativo');
      }
    });
  }, [mapInstance, authView]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.watchPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {}, { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }
  }, []);

  const cheapestStationId = useMemo(() => {
    if (!preferredFuel || authView !== 'app' || stations.length === 0) return null;
    let cheapestId = null; let minPrice = Infinity;
    
    stations.forEach(station => {
      const dist = calculateDistance(userLocation?.lat || SJRP_MIRASSOL_CENTER.lat, userLocation?.lng || SJRP_MIRASSOL_CENTER.lng, station.lat, station.lng);
      if (dist <= 25.0) { 
        const stationReports = reports.filter(r => r.stationId === station.id && r.fuelType === preferredFuel);
        let priceCash = null;
        if (preferredFuel === 'ev_kwh') {
           // Para elétrico, busca o último valor absoluto
           const evReps = stationReports.sort((a,b) => b.timestamp - a.timestamp);
           if(evReps.length > 0) priceCash = evReps[0].priceCash;
        } else {
           priceCash = calculateConsensus(stationReports).priceCash;
        }
        
        if (priceCash && priceCash < minPrice) { minPrice = priceCash; cheapestId = station.id; }
      }
    });
    return cheapestId;
  }, [userLocation, preferredFuel, reports, authView, stations]);

  const calcLiters = useMemo(() => {
    const p = getRawNumber(calcPrice); const total = getRawNumber(calcPaid);
    return p > 0 && total > 0 ? (total / p).toFixed(2) : '0.00';
  }, [calcPrice, calcPaid]);

  const handleCloseCalc = () => { setIsCalcOpen(false); setCalcPrice(''); setCalcPaid(''); speak("Calculadora fechada"); };
  const formatEmail = (user) => user.includes('@') ? user : `${user.trim().toLowerCase()}${FANTASY_DOMAIN}`;

  const handleLogin = async (e) => {
    e.preventDefault();
    try { await signInWithEmailAndPassword(auth, formatEmail(usernameInput), passwordInput); } 
    catch (error) { alert("Usuário ou senha incorretos."); speak("Usuário ou senha incorretos."); }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const email = formatEmail(usernameInput);
      const userCred = await createUserWithEmailAndPassword(auth, email, passwordInput);
      const role = usernameInput.trim().toLowerCase() === 'admin' ? 'admin' : 'user';
      await setDoc(doc(db, "users", userCred.user.uid), {
        username: usernameInput.trim().toLowerCase(), email: email, role: role, active: true, createdAt: serverTimestamp()
      });
    } catch (error) { alert("Erro ao cadastrar."); }
  };

  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        await setDoc(doc(db, "users", user.uid), {
          username: user.displayName || user.email.split('@')[0], email: user.email, role: 'user', active: true, createdAt: serverTimestamp()
        });
      }
    } catch (error) { alert("Erro ao logar com o Google."); }
  };

  const handleSubmitPrice = async (e) => {
    e.preventDefault();
    const priceCashNum = getRawNumber(submitPriceCash);
    if (!selectedStation || !submitFuel || priceCashNum <= 0) return;
    try {
      await addDoc(collection(db, "reports"), {
        stationId: selectedStation.id, fuelType: submitFuel.id, priceCash: priceCashNum, userId: auth.currentUser.uid, timestamp: serverTimestamp() 
      });
      speak(`Preço atualizado. ${submitFuel.name} por ${submitPriceCash} reais.`);
      setSelectedStation(null); setSubmitPriceCash(''); mapInstance?.setZoom(13); alert("✅ Preço atualizado na nuvem!");
    } catch (error) { alert("Erro ao enviar."); }
  };

  const toggleEVStatus = async () => {
    if (!selectedStation) return;
    const currentStatus = !!evStatusMap[selectedStation.id];
    const newStatus = !currentStatus;
    await setDoc(doc(db, "ev_status", selectedStation.id), { hasEV: newStatus });
    speak(newStatus ? "Recarga de carro elétrico ativada para este posto." : "Recarga de carro elétrico desativada.");
  };

  const loadUsersForAdmin = async () => {
    if (!isAdmin) return;
    setShowAdminPanel(true);
    const qs = await getDocs(collection(db, "users"));
    const list = []; qs.forEach(doc => list.push({ id: doc.id, ...doc.data() })); setUsersList(list);
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    if(window.confirm("Alterar status do usuário?")) {
      await updateDoc(doc(db, "users", userId), { active: !currentStatus }); loadUsersForAdmin();
    }
  };

  const deleteUserRecord = async (userId) => {
    if(window.confirm("Excluir usuário permanentemente?")) { await deleteDoc(doc(db, "users", userId)); loadUsersForAdmin(); }
  };

  // Aplicação das Classes de Acessibilidade Visual
  const accClasses = useMemo(() => {
    let classes = "";
    if (visualMode === 'high-contrast') classes += " contrast-150 saturate-200 ";
    if (visualMode === 'grayscale') classes += " grayscale ";
    if (visualMode === 'invert') classes += " invert ";
    return classes;
  }, [visualMode]);

  if (authView === 'login' || authView === 'register') {
    return (
      <div className={`min-h-[100dvh] flex flex-col items-center justify-center p-6 relative ${isDarkMode ? 'bg-slate-900' : 'bg-slate-50'} ${accClasses}`}>
        <div className="absolute top-4 right-4 z-50">
           <button onClick={() => setIsAccMenuOpen(!isAccMenuOpen)} className="p-3 bg-blue-600 text-white rounded-full shadow-lg" aria-label="Acessibilidade">
             <Accessibility className="w-6 h-6" />
           </button>
        </div>

        <div className="w-full max-w-sm bg-white p-8 rounded-[2rem] shadow-2xl z-10">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-blue-600 p-4 rounded-2xl shadow-lg mb-4"><Fuel className="w-10 h-10 text-white" /></div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Preço Baixo</h1>
          </div>

          <button onClick={handleGoogleLogin} className="w-full bg-white border border-slate-300 text-slate-700 font-bold py-3 rounded-xl shadow-sm hover:bg-slate-50 flex items-center justify-center gap-3 mb-6">
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
            Entrar com o Google
          </button>

          <div className="flex items-center gap-4 mb-6"><div className="h-px bg-slate-200 flex-1"></div><span className="text-xs text-slate-400 font-bold uppercase">Ou via usuário</span><div className="h-px bg-slate-200 flex-1"></div></div>

          <form onSubmit={authView === 'login' ? handleLogin : handleRegister} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input type="text" placeholder="Usuário (ex: admin)" value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} required className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 text-slate-800 focus:outline-none focus:border-blue-500 lowercase" />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <input type="password" placeholder="Sua senha" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required minLength="6" className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 text-slate-800 focus:outline-none focus:border-blue-500" />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg active:scale-95 transition-transform">{authView === 'login' ? 'Entrar' : 'Criar Conta'}</button>
          </form>
          <div className="mt-6 text-center">
            {authView === 'login' ? <button onClick={() => setAuthView('register')} className="text-sm font-bold text-blue-600 hover:underline">Não tem conta de usuário? Cadastre-se</button> : <button onClick={() => setAuthView('login')} className="text-sm font-bold text-slate-500 hover:text-slate-800">Já tenho conta. Fazer Login.</button>}
          </div>
        </div>

        {/* MODAL DE ACESSIBILIDADE */}
        {isAccMenuOpen && (
          <div className="fixed inset-0 bg-slate-900/60 z-[3000] flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-xl flex items-center gap-2"><Accessibility className="w-6 h-6 text-blue-600" /> Acessibilidade</h3>
                  <button onClick={() => setIsAccMenuOpen(false)}><X className="w-6 h-6 text-slate-500" /></button>
                </div>
                
                <div className="space-y-4">
                  <button onClick={() => { setNarrationEnabled(!narrationEnabled); speak(narrationEnabled ? "Narração desativada." : "Narração ativada."); }} className={`w-full flex items-center justify-between p-4 rounded-xl border-2 font-bold ${narrationEnabled ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                    <span className="flex items-center gap-2">{narrationEnabled ? <Volume2 className="w-5 h-5"/> : <VolumeX className="w-5 h-5"/>} Narração por Voz</span>
                    {narrationEnabled ? <ToggleRight className="w-6 h-6 text-blue-600" /> : <ToggleLeft className="w-6 h-6 text-slate-400" />}
                  </button>

                  <h4 className="font-bold text-slate-700 mt-4 mb-2 flex items-center gap-2"><Eye className="w-5 h-5" /> Ajustes Visuais</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setVisualMode('normal')} className={`p-3 border rounded-lg font-bold text-sm ${visualMode === 'normal' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}>Padrão</button>
                    <button onClick={() => setVisualMode('high-contrast')} className={`p-3 border rounded-lg font-bold text-sm ${visualMode === 'high-contrast' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}>Alto Contraste</button>
                    <button onClick={() => setVisualMode('grayscale')} className={`p-3 border rounded-lg font-bold text-sm ${visualMode === 'grayscale' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}>Monocromático</button>
                    <button onClick={() => setVisualMode('invert')} className={`p-3 border rounded-lg font-bold text-sm ${visualMode === 'invert' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}>Inverter Cores</button>
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`h-[100dvh] w-full flex flex-col relative overflow-hidden ${accClasses}`}>
      
      <header className="w-full z-[1000] bg-white border-b flex items-center justify-between p-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-xl flex-shrink-0"><Fuel className="w-5 h-5 text-white" /></div>
          <div className="flex flex-col">
            <h1 className="font-black text-lg leading-tight text-slate-900">APP Preço Baixo</h1>
            <p className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1">
              <MapPin className="w-3 h-3"/> {stations.length} POSTOS ({apiStatus})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { setIsAccMenuOpen(true); speak("Menu de acessibilidade aberto."); }} className="p-2 bg-blue-100 text-blue-700 rounded-full font-bold shadow-sm" aria-label="Acessibilidade">
            <Accessibility className="w-5 h-5" />
          </button>
          {isAdmin && <button onClick={loadUsersForAdmin} className="bg-orange-100 text-orange-700 p-2 rounded-full font-bold shadow-sm"><Users className="w-5 h-5" /></button>}
          <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-500"><LogOut className="w-5 h-5" /></button>
        </div>
      </header>

      <div className="flex-1 w-full relative z-0">
        <GoogleMap 
          mapContainerStyle={{ width: '100%', height: '100%' }} 
          center={SJRP_MIRASSOL_CENTER} 
          zoom={12} 
          onLoad={(map) => setMapInstance(map)} 
          options={{ disableDefaultUI: true, styles: isDarkMode && mapType !== 'satellite' ? darkMapStyle : [], mapTypeId: mapType }}
        >
          {stations.map(station => {
            const isCheapest = station.id === cheapestStationId;
            const balloonColor = isCheapest ? '#10b981' : '#2563eb';
            const hasEV = !!evStatusMap[station.id];
            
            return (
              <MarkerF
                key={station.id}
                position={{ lat: station.lat, lng: station.lng }}
                onClick={() => { 
                  setSelectedStation(station); 
                  setModalView('list'); 
                  mapInstance?.panTo({ lat: station.lat, lng: station.lng });
                  speak(`Posto selecionado: ${station.name}`);
                }}
                animation={isCheapest ? window.google.maps.Animation.BOUNCE : null} 
                icon={{
                  url: `data:image/svg+xml;utf8,${encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 24 32">
                      <path fill="${balloonColor}" d="M12 0C5.373 0 0 5.373 0 12c0 7.828 12 20 12 20s12-12.172 12-20c0-6.627-5.373-12-12-12z"/>
                      <circle fill="#ffffff" cx="12" cy="12" r="8"/>
                      <text x="12" y="17" font-family="Arial" font-size="11" font-weight="900" fill="${balloonColor}" text-anchor="middle">${hasEV ? '⚡' : (isCheapest ? '$' : 'P')}</text>
                    </svg>
                  `)}`,
                  scaledSize: isCheapest ? new window.google.maps.Size(46, 60) : new window.google.maps.Size(34, 44),
                  anchor: isCheapest ? new window.google.maps.Point(23, 60) : new window.google.maps.Point(17, 44)
                }}
              />
            )
          })}
          
          {userLocation && (
            <MarkerF
              position={{ lat: userLocation.lat, lng: userLocation.lng }}
              icon={{
                url: `data:image/svg+xml;utf8,${encodeURIComponent(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" fill="#3b82f6" fill-opacity="0.3"/>
                    <circle cx="12" cy="12" r="6" fill="#ffffff"/>
                    <circle cx="12" cy="12" r="4" fill="#2563eb"/>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(24, 24),
                anchor: new window.google.maps.Point(12, 12)
              }}
            />
          )}
        </GoogleMap>
      </div>

      {/* CONTROLES FLUTUANTES DO MAPA */}
      <div className={`absolute right-4 top-24 z-[1000] flex flex-col gap-2 transition-opacity ${selectedStation ? 'opacity-0' : 'opacity-100'}`}>
        <button onClick={() => setMapType(t => t === 'roadmap' ? 'satellite' : 'roadmap')} className="bg-white/90 p-3 rounded-full shadow-lg text-slate-700 active:scale-95"><Layers className="w-6 h-6" /></button>
        <button onClick={() => setIsDarkMode(!isDarkMode)} disabled={mapType === 'satellite'} className="bg-white/90 p-3 rounded-full shadow-lg text-slate-700 active:scale-95"><Moon className="w-6 h-6" /></button>
        <button onClick={() => mapInstance?.setZoom(mapInstance.getZoom() + 1)} className="bg-white/90 p-3 rounded-full shadow-lg text-slate-700 mt-2"><Plus className="w-6 h-6" /></button>
        <button onClick={() => mapInstance?.setZoom(mapInstance.getZoom() - 1)} className="bg-white/90 p-3 rounded-full shadow-lg text-slate-700"><Minus className="w-6 h-6" /></button>
      </div>

      <div className={`absolute left-4 z-[1000] flex flex-col gap-3 transition-all duration-300 ${selectedStation ? 'bottom-[65vh]' : 'bottom-6'}`}>
        <button onClick={() => { setIsCalcOpen(true); speak("Calculadora aberta."); }} className="bg-slate-800 text-white p-4 rounded-full shadow-xl hover:bg-slate-700"><Calculator className="w-6 h-6" /></button>
        <button onClick={() => { setIsFuelSelectorOpen(true); speak("Menu de pesquisa de destaques aberto."); }} className="bg-emerald-600 text-white p-4 rounded-full shadow-xl hover:bg-emerald-700"><Fuel className="w-6 h-6" /></button>
      </div>

      {/* BOTTOM SHEET DO POSTO (COM CARRO ELÉTRICO) */}
      {selectedStation && (
        <div className="absolute inset-x-0 bottom-0 z-[1001] bg-white rounded-t-[2rem] shadow-2xl flex flex-col animate-in slide-in-from-bottom max-h-[65vh]">
          <div className="p-5 border-b flex justify-between items-start sticky top-0 bg-white z-10 rounded-t-[2rem]">
            <div>
              <h2 className="text-xl font-black text-slate-800">{selectedStation.name}</h2>
              <p className="text-xs text-slate-500 mb-3">{selectedStation.address}</p>
              
              {/* BOTÃO DE CARRO ELÉTRICO */}
              <button 
                onClick={toggleEVStatus}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${evStatusMap[selectedStation.id] ? 'bg-blue-100 text-blue-700 border-2 border-blue-600' : 'bg-slate-100 text-slate-500 border-2 border-slate-200'}`}
              >
                <Zap className={`w-4 h-4 ${evStatusMap[selectedStation.id] ? 'text-blue-600' : 'text-slate-400'}`} />
                {evStatusMap[selectedStation.id] ? 'Carro Elétrico: Ativo' : 'Possui recarga elétrica?'}
              </button>
            </div>
            <button onClick={() => { setSelectedStation(null); mapInstance?.setZoom(12); speak("Detalhes do posto fechados."); }} className="p-2 bg-slate-100 rounded-full"><X className="w-5 h-5 text-slate-500" /></button>
          </div>

          <div className="p-5 overflow-y-auto">
            {modalView === 'list' && FUEL_TYPES.filter(fuel => !fuel.isEV || evStatusMap[selectedStation.id]).map(fuel => {
              const r = reports.filter(x => x.stationId === selectedStation.id && x.fuelType === fuel.id);
              
              let priceCash = null;
              if (fuel.isEV) {
                // Para Elétricos, pega sempre o último registro absoluto
                const evReports = r.sort((a,b) => b.timestamp - a.timestamp);
                if (evReports.length > 0) priceCash = evReports[0].priceCash;
              } else {
                // Para Combustível, pega o consenso das últimas 24h
                priceCash = calculateConsensus(r).priceCash;
              }

              return (
                <div key={fuel.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl mb-3 border">
                  <span className="font-bold text-sm text-slate-700 flex items-center gap-2">
                    {fuel.isEV && <Zap className="w-4 h-4 text-blue-500" />} {fuel.name}
                  </span>
                  {priceCash ? 
                    <span className="font-black text-lg text-emerald-700">R$ {priceCash.toFixed(2)}</span> 
                  : 
                    <button onClick={() => { setSubmitFuel(fuel); setModalView('input'); speak(`Informar preço para ${fuel.name}`); }} className="text-xs font-bold text-blue-600 bg-blue-100 px-3 py-1 rounded-lg">Informar</button>
                  }
                </div>
              );
            })}
            
            {modalView === 'input' && (
              <form onSubmit={handleSubmitPrice} className="space-y-4 text-center pb-4">
                <button type="button" onClick={() => setModalView('list')} className="text-sm text-slate-500 flex items-center mb-4"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</button>
                <div className="bg-slate-50 border-2 rounded-2xl p-4 text-left">
                  <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Preço: {submitFuel?.name}</label>
                  <input type="text" placeholder="0,00" value={submitPriceCash} onChange={(e) => setSubmitPriceCash(formatMoney(e.target.value))} className="w-full text-2xl font-black bg-transparent outline-none text-slate-800" autoFocus />
                </div>
                <button type="submit" disabled={!submitPriceCash} className="w-full bg-blue-600 disabled:bg-slate-300 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Confirmar Preço</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MENUS E MODAIS SOBREPOSTOS */}
      
      {/* MODAL DE ACESSIBILIDADE */}
      {isAccMenuOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[3000] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-black text-xl flex items-center gap-2 text-slate-800"><Accessibility className="w-6 h-6 text-blue-600" /> Acessibilidade</h3>
                <button onClick={() => setIsAccMenuOpen(false)}><X className="w-6 h-6 text-slate-500" /></button>
              </div>
              
              <div className="space-y-4">
                <button onClick={() => { setNarrationEnabled(!narrationEnabled); speak(narrationEnabled ? "Narração desativada." : "Narração ativada."); }} className={`w-full flex items-center justify-between p-4 rounded-xl border-2 font-bold transition-colors ${narrationEnabled ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  <span className="flex items-center gap-2">{narrationEnabled ? <Volume2 className="w-5 h-5"/> : <VolumeX className="w-5 h-5"/>} Narração por Voz</span>
                  {narrationEnabled ? <ToggleRight className="w-6 h-6 text-blue-600" /> : <ToggleLeft className="w-6 h-6 text-slate-400" />}
                </button>

                <h4 className="font-bold text-slate-700 mt-4 mb-2 flex items-center gap-2"><Eye className="w-5 h-5" /> Ajustes Visuais</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => { setVisualMode('normal'); speak("Modo visual padrão ativado."); }} className={`p-3 border rounded-lg font-bold text-sm transition-colors ${visualMode === 'normal' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>Padrão</button>
                  <button onClick={() => { setVisualMode('high-contrast'); speak("Modo alto contraste ativado."); }} className={`p-3 border rounded-lg font-bold text-sm transition-colors ${visualMode === 'high-contrast' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>Alto Contraste</button>
                  <button onClick={() => { setVisualMode('grayscale'); speak("Modo monocromático ativado."); }} className={`p-3 border rounded-lg font-bold text-sm transition-colors ${visualMode === 'grayscale' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>Monocromático</button>
                  <button onClick={() => { setVisualMode('invert'); speak("Cores invertidas ativadas."); }} className={`p-3 border rounded-lg font-bold text-sm transition-colors ${visualMode === 'invert' ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-700'}`}>Inverter Cores</button>
                </div>
              </div>
            </div>
        </div>
      )}

      {isFuelSelectorOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[1002] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm">
            <h3 className="font-bold mb-4 text-slate-800">Procurar Destaque Para:</h3>
            <div className="grid gap-2 overflow-y-auto max-h-[50vh]">
              {FUEL_TYPES.map(f => (
                <button key={f.id} onClick={() => { setPreferredFuel(f.id); setIsFuelSelectorOpen(false); speak(`Procurando destaque para ${f.name}`); }} className={`p-3 border rounded-lg font-bold text-left ${preferredFuel === f.id ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'text-slate-600'}`}>
                  {f.isEV && <Zap className="w-4 h-4 inline-block mr-1" />} {f.name}
                </button>
              ))}
            </div>
            <button onClick={() => setIsFuelSelectorOpen(false)} className="w-full mt-4 p-3 bg-slate-100 rounded-lg font-bold text-slate-600">Fechar</button>
          </div>
        </div>
      )}

      {isCalcOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[1002] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold flex items-center gap-2 text-slate-800"><Calculator className="w-5 h-5 text-blue-500" /> Calculadora</h3>
              <button onClick={handleCloseCalc} className="text-slate-400 hover:text-slate-600"><X className="w-6 h-6" /></button>
            </div>
            
            <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Valor por litro / kWh</label>
            <input type="text" placeholder="R$ 0,00" value={calcPrice} onChange={(e) => setCalcPrice(formatMoney(e.target.value))} className="w-full bg-slate-50 border rounded-lg p-3 mb-3 font-bold text-slate-800" />
            
            <label className="text-xs font-bold text-slate-500 uppercase ml-1 block mb-1">Valor pago</label>
            <input type="text" placeholder="R$ 0,00" value={calcPaid} onChange={(e) => setCalcPaid(formatMoney(e.target.value))} className="w-full bg-slate-50 border rounded-lg p-3 mb-4 font-bold text-slate-800" />
            
            <div className="bg-blue-50 p-4 rounded-lg flex justify-between items-center">
              <span className="font-bold text-blue-800">Rendimento total:</span>
              <span className="text-2xl font-black text-blue-600">{calcLiters}</span>
            </div>
            
            <button onClick={handleCloseCalc} className="w-full mt-4 p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-bold transition-colors">
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}