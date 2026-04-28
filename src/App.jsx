import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Navigation, Fuel, ShieldCheck, AlertTriangle, Crosshair, Calculator, X, ArrowLeft, CheckCircle2, Map as MapIcon, Plus, Minus, Download, Store, Activity, Pizza } from 'lucide-react';

// Importando Dados e Configurações
import { SJRP_CENTER, FUEL_TYPES, STATIONS, POIS, generateInitialReports } from './data/mockData';

// Importando Funções Úteis
import { calculateDistance, calculateConsensus, formatMoney, getRawNumber } from './utils/mathUtils';

export default function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [reports, setReports] = useState(generateInitialReports());
  
  // Mapa Refs & States
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const userMarkerRef = useRef(null);
  const markersRef = useRef([]);
  const initialCenterDone = useRef(false);
  
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState(null); 
  
  // UI States
  const [selectedStation, setSelectedStation] = useState(null);
  const [modalView, setModalView] = useState('list');
  const [submitFuel, setSubmitFuel] = useState(null);
  const [submitPrice, setSubmitPrice] = useState('');
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  
  // Calc States
  const [isCalcOpen, setIsCalcOpen] = useState(false);
  const [calcPrice, setCalcPrice] = useState('');
  const [calcPaid, setCalcPaid] = useState('');

  // 1. Injetar scripts do Leaflet
  useEffect(() => {
    if (window.L) {
      setMapLoaded(true);
      return;
    }
    
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => setMapLoaded(true);
      document.head.appendChild(script);
    }
  }, []);

  // 2. Inicializar Mapa e Marcadores
  useEffect(() => {
    if (!mapLoaded || !mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Cria o mapa
    const map = window.L.map(mapContainerRef.current, {
      center: [SJRP_CENTER.lat, SJRP_CENTER.lng],
      zoom: 14,
      zoomControl: false, 
      attributionControl: false 
    });

    // Provedor CartoDB (Limpo, Rápido e Seguro)
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd'
    }).addTo(map);

    // ==========================================
    // ADICIONAR POIs (Pontos de Interesse)
    // ==========================================
    POIS.forEach(poi => {
      let iconColor, iconSvg;
      
      if (poi.type === 'hospital') {
        iconColor = '#ef4444'; // Vermelho
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;
      } else if (poi.type === 'fastfood') {
        iconColor = '#f59e0b'; // Laranja
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11h18v4H3v-4zM6 15v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4M12 4a5 5 0 0 0-5 5v2h10V9a5 5 0 0 0-5-5z"/></svg>`;
      } else {
        iconColor = '#8b5cf6'; // Roxo
        iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
      }

      const poiIcon = window.L.divIcon({
        className: '', 
        html: `
          <div style="background-color: ${iconColor}; width: 22px; height: 22px; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
            ${iconSvg}
          </div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      });

      const marker = window.L.marker([poi.lat, poi.lng], { icon: poiIcon, zIndexOffset: -100 }).addTo(map);
      marker.bindPopup(`<b>${poi.name}</b>`, { closeButton: false, className: 'custom-popup' });
      markersRef.current.push(marker);
    });

    // ==========================================
    // ADICIONAR POSTOS DE COMBUSTÍVEL
    // ==========================================
    STATIONS.forEach(station => {
      const customIcon = window.L.divIcon({
        className: '', 
        html: `
          <div style="filter: drop-shadow(0px 4px 4px rgba(0,0,0,0.3)); width: 36px; height: 48px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 24 32">
              <path fill="#2563eb" d="M12 0C5.373 0 0 5.373 0 12c0 7.828 12 20 12 20s12-12.172 12-20c0-6.627-5.373-12-12-12z"/>
              <circle fill="#ffffff" cx="12" cy="12" r="8"/>
              <text x="12" y="16" font-family="Arial" font-size="10" font-weight="bold" fill="#2563eb" text-anchor="middle">P</text>
            </svg>
          </div>
        `,
        iconSize: [36, 48],
        iconAnchor: [18, 48]
      });

      const marker = window.L.marker([station.lat, station.lng], { icon: customIcon, zIndexOffset: 1000 }).addTo(map);

      marker.on('click', () => {
        setSelectedStation(station);
        setModalView('list');
        map.setView([station.lat - 0.005, station.lng], 16, { animate: true }); 
      });

      markersRef.current.push(marker);
    });

    mapInstanceRef.current = map;
    setMapInstance(map);

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      
      map.remove();
      mapInstanceRef.current = null;
      setMapInstance(null);
      
      if (mapContainerRef.current) {
        mapContainerRef.current.innerHTML = '';
      }
    };
  }, [mapLoaded]);

  // 3. Capturar GPS
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => console.log("GPS desativado"),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, []);

  // 4. Atualizar Pin do Usuário no Mapa
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.L || !userLocation) return;

    if (!initialCenterDone.current) {
      map.setView([userLocation.lat, userLocation.lng], 15, { animate: true });
      initialCenterDone.current = true;
    }

    if (!userMarkerRef.current) {
      const userIcon = window.L.divIcon({
        className: '',
        html: `
          <div style="position: relative; width: 24px; height: 24px;">
            <div style="position: absolute; width: 100%; height: 100%; background-color: #3b82f6; border-radius: 50%; opacity: 0.3; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: absolute; top: 4px; left: 4px; width: 16px; height: 16px; background-color: #ffffff; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
            <div style="position: absolute; top: 6px; left: 6px; width: 12px; height: 12px; background-color: #2563eb; border-radius: 50%;"></div>
          </div>
          <style>
            @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0; } }
            .custom-popup .leaflet-popup-content-wrapper { border-radius: 8px; padding: 2px; }
            .custom-popup .leaflet-popup-content { margin: 8px; font-family: sans-serif; font-size: 12px;}
          </style>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      });
      userMarkerRef.current = window.L.marker([userLocation.lat, userLocation.lng], { icon: userIcon, zIndexOffset: 2000 }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation]);

  // Ações de Mapa
  const centerOnMe = () => {
    if (userLocation && mapInstanceRef.current) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 16, { animate: true });
    }
  };

  const handleZoomIn = () => mapInstanceRef.current && mapInstanceRef.current.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current && mapInstanceRef.current.zoomOut();

  // Simulação de Instalação de App (PWA)
  const handleInstallApp = () => {
    alert("Para instalar o APP Preço Baixo: \n\nNo Android (Chrome): Toque nos 3 pontinhos e 'Adicionar à Tela Inicial'. \n\nNo iPhone (Safari): Toque em Compartilhar e 'Adicionar à Tela de Início'.");
    setShowInstallBanner(false);
  };

  // Submeter Preço
  const handleSubmitPrice = (e) => {
    e.preventDefault();
    const priceNum = getRawNumber(submitPrice);
    if (!selectedStation || !submitFuel || priceNum <= 0) return;

    const distance = calculateDistance(userLocation?.lat, userLocation?.lng, selectedStation.lat, selectedStation.lng);
    if (distance > 1.0) {
      alert("⚠️ Você precisa estar num raio de 1km deste posto para informar o valor.");
      return;
    }

    const newReport = {
      id: `r_${Date.now()}`,
      stationId: selectedStation.id,
      fuelType: submitFuel.id,
      price: priceNum,
      timestamp: Date.now(),
      userId: `user_${Math.floor(Math.random() * 1000)}`
    };

    setReports([...reports, newReport]);
    setSubmitPrice('');
    setSelectedStation(null);
    if (mapInstanceRef.current) mapInstanceRef.current.setZoom(14); 
    alert("✅ Preço registrado com sucesso! A comunidade agradece.");
  };

  const calcLiters = useMemo(() => {
    const p = getRawNumber(calcPrice);
    const total = getRawNumber(calcPaid);
    if (p > 0 && total > 0) return (total / p).toFixed(2);
    return '0.00';
  }, [calcPrice, calcPaid]);

  return (
    <div className="h-[100dvh] w-full flex flex-col bg-slate-100 font-sans text-slate-800 relative overflow-hidden">
      
      {/* HEADER FLUTUANTE (NOME NOVO E DOWNLOAD) */}
      <header className="absolute top-0 inset-x-0 z-[1000] flex flex-col">
        {/* Banner de Instalação (Simulação PWA) */}
        {showInstallBanner && (
          <div className="bg-slate-900 text-white px-4 py-2 flex justify-between items-center animate-in slide-in-from-top">
            <div className="flex items-center gap-2">
              <div className="bg-blue-500 p-1 rounded">
                <Fuel className="w-3 h-3 text-white" />
              </div>
              <p className="text-xs font-semibold">Tenha o app no seu celular!</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleInstallApp} className="text-xs font-bold text-blue-400 uppercase tracking-wider">Instalar</button>
              <button onClick={() => setShowInstallBanner(false)} className="text-slate-400"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        <div className="bg-white/95 backdrop-blur-md p-4 shadow-sm border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Fuel className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-black text-lg text-slate-900 leading-tight tracking-tight">APP Preço Baixo</h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">São José do Rio Preto</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!showInstallBanner && (
               <button onClick={handleInstallApp} className="bg-slate-100 p-2 rounded-full text-slate-600 active:bg-slate-200">
                 <Download className="w-4 h-4" />
               </button>
            )}
            {userLocation ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-100 px-3 py-2 rounded-full">
                <Crosshair className="w-3 h-3" /> GPS ON
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-100 px-3 py-2 rounded-full animate-pulse">
                <AlertTriangle className="w-3 h-3" /> GPS OFF
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ÁREA DO MAPA LEAFLET */}
      <div className="flex-1 w-full relative z-0">
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100 z-10">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <MapIcon className="w-8 h-8 animate-bounce text-blue-500" />
              <p className="font-semibold text-sm">Carregando Mapa da Cidade...</p>
            </div>
          </div>
        )}
        
        <div style={{ width: '100%', height: '100%' }}>
           <div ref={mapContainerRef} style={{ width: '100%', height: '100%', marginTop: showInstallBanner ? '110px' : '72px' }} />
        </div>
      </div>

      {/* BOTÕES FLUTUANTES NO MAPA */}
      <div className={`absolute right-4 top-32 z-[1000] flex flex-col gap-2 transition-all duration-300 ${selectedStation ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${showInstallBanner ? 'translate-y-10' : 'translate-y-0'}`}>
        <button onClick={handleZoomIn} className="bg-white/90 backdrop-blur p-3 rounded-full shadow-lg border border-slate-100 text-slate-700 hover:text-blue-600 active:scale-95">
          <Plus className="w-6 h-6" />
        </button>
        <button onClick={handleZoomOut} className="bg-white/90 backdrop-blur p-3 rounded-full shadow-lg border border-slate-100 text-slate-700 hover:text-blue-600 active:scale-95">
          <Minus className="w-6 h-6" />
        </button>
      </div>

      <div className={`absolute right-4 z-[1000] transition-all duration-300 ${selectedStation ? 'bottom-[60vh]' : 'bottom-24'}`}>
        <button onClick={centerOnMe} className="bg-white p-3 rounded-full shadow-lg border border-slate-100 text-slate-700 hover:text-blue-600 active:scale-95 flex flex-col items-center justify-center">
          <Crosshair className="w-6 h-6 text-blue-600" />
        </button>
      </div>

      <div className={`absolute left-4 z-[1000] transition-all duration-300 ${selectedStation ? 'bottom-[60vh]' : 'bottom-6'}`}>
        <button onClick={() => setIsCalcOpen(true)} className="bg-slate-800 text-white p-4 rounded-full shadow-xl hover:bg-slate-700 active:scale-95 transition-transform">
          <Calculator className="w-6 h-6" />
        </button>
      </div>

      {!selectedStation && (
        <div className="absolute bottom-6 right-4 z-[1000]">
          <button 
            onClick={() => alert("Modo desenvolvedor: Clique em um posto primeiro, depois simule a localização nele.")}
            className="bg-orange-500 text-white px-4 py-3 rounded-full shadow-xl text-xs font-bold flex items-center gap-2"
          >
            <Navigation className="w-4 h-4" /> Simular GPS
          </button>
        </div>
      )}
      
      {selectedStation && (
        <div className="absolute bottom-[60vh] right-20 z-[1000]">
           <button 
            onClick={() => {
              setUserLocation({ lat: selectedStation.lat, lng: selectedStation.lng });
              if (mapInstanceRef.current) mapInstanceRef.current.setView([selectedStation.lat, selectedStation.lng], 16, { animate: true });
            }}
            className="bg-orange-500 text-white px-4 py-3 rounded-full shadow-xl text-xs font-bold flex items-center gap-2 active:scale-95"
          >
            📍 Teleportar p/ Posto
          </button>
        </div>
      )}

      {/* BOTTOM SHEET: MODAL DO POSTO */}
      {selectedStation && (
        <div className="absolute inset-x-0 bottom-0 z-[1001] bg-white rounded-t-[2rem] shadow-[0_-10px_40px_rgba(0,0,0,0.15)] flex flex-col max-h-[55vh] animate-in slide-in-from-bottom border-t border-slate-200">
          
          <div className="w-full flex justify-center pt-3 pb-1">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
          </div>

          <div className="px-5 pb-3 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-black text-slate-800 tracking-tight">{selectedStation.name}</h2>
              <p className="text-xs font-medium text-slate-500 line-clamp-1 mt-0.5">{selectedStation.address}</p>
            </div>
            <button 
              onClick={() => {
                setSelectedStation(null);
                if (mapInstanceRef.current) mapInstanceRef.current.setZoom(14);
              }} 
              className="p-2 bg-slate-100 active:bg-slate-200 rounded-full text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto pb-safe">
            {modalView === 'list' && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Selecione para atualizar ou conferir</p>
                <div className="grid grid-cols-1 gap-3">
                  {FUEL_TYPES.map(fuel => {
                    const stationReports = reports.filter(r => r.stationId === selectedStation.id && r.fuelType === fuel.id);
                    const { price, confidence } = calculateConsensus(stationReports);

                    return (
                      <button 
                        key={fuel.id}
                        onClick={() => {
                          setSubmitFuel(fuel);
                          setSubmitPrice('');
                          setModalView('input');
                        }}
                        className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl active:bg-blue-50 active:border-blue-200 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full shadow-sm ${fuel.color}`}></div>
                          <span className="font-bold text-slate-700 text-sm">{fuel.name}</span>
                        </div>
                        {price ? (
                          <div className="text-right">
                            <span className="block font-black text-slate-900 text-lg">R$ {price.toFixed(2)}</span>
                            <span className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
                              <ShieldCheck className={`w-3 h-3 ${confidence > 50 ? 'text-green-500' : 'text-orange-400'}`} />
                              {confidence}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-blue-600 bg-blue-100 px-3 py-1.5 rounded-lg">Atualizar</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {modalView === 'input' && submitFuel && (
              <div className="space-y-4 py-2">
                <button onClick={() => setModalView('list')} className="text-sm text-slate-500 flex items-center gap-1 font-semibold active:text-blue-600">
                  <ArrowLeft className="w-4 h-4" /> Voltar
                </button>
                
                <div className="text-center">
                  <p className="text-sm text-slate-500 mb-1">Qual valor você pagou no</p>
                  <h3 className="text-2xl font-black text-slate-800 mb-6">{submitFuel.name}?</h3>
                  
                  <form onSubmit={handleSubmitPrice} className="space-y-6">
                    <div className="relative max-w-[200px] mx-auto">
                      <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 font-bold text-xl">R$</span>
                      <input 
                        type="text" 
                        inputMode="numeric"
                        placeholder="0,00"
                        value={submitPrice}
                        onChange={(e) => setSubmitPrice(formatMoney(e.target.value))}
                        className="w-full text-center text-4xl font-black text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-2xl py-4 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                        required
                        autoFocus
                      />
                    </div>
                    
                    <button 
                      type="submit" 
                      disabled={!submitPrice || calculateDistance(userLocation?.lat, userLocation?.lng, selectedStation.lat, selectedStation.lng) > 1.0}
                      className="w-full bg-blue-600 active:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-4 rounded-2xl shadow-lg shadow-blue-200 transition-colors flex items-center justify-center gap-2 text-lg"
                    >
                      <CheckCircle2 className="w-6 h-6" /> Confirmar Preço
                    </button>

                    {calculateDistance(userLocation?.lat, userLocation?.lng, selectedStation.lat, selectedStation.lng) > 1.0 && (
                      <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs flex items-start gap-3 text-left border border-red-100">
                        <AlertTriangle className="w-6 h-6 flex-shrink-0" />
                        <p className="font-medium">Você precisa estar num raio de 1km deste posto para confirmar o preço. Isso garante que os dados sejam reais.</p>
                      </div>
                    )}
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CALCULADORA */}
      {isCalcOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[1002] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-800 text-white p-5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="bg-slate-700 p-2 rounded-xl">
                  <Calculator className="w-5 h-5 text-blue-400" />
                </div>
                <h3 className="font-bold">Calculadora de Litros</h3>
              </div>
              <button onClick={() => setIsCalcOpen(false)} className="text-slate-400 active:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Preço do Litro (Bomba)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 font-bold">R$</span>
                  <input 
                    type="text" inputMode="numeric"
                    value={calcPrice} onChange={(e) => setCalcPrice(formatMoney(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-black text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xl"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Total Pago</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 font-bold">R$</span>
                  <input 
                    type="text" inputMode="numeric"
                    value={calcPaid} onChange={(e) => setCalcPaid(formatMoney(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-4 pl-12 pr-4 font-black text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-xl"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 flex items-center justify-between bg-blue-50 -mx-6 -mb-6 p-6 rounded-b-[2rem]">
                <span className="text-blue-800 font-bold">Deu no tanque:</span>
                <div className="text-right flex items-end gap-1">
                  <span className="text-4xl font-black text-blue-600 leading-none">{calcLiters}</span>
                  <span className="text-blue-600/70 font-bold pb-1">L</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}