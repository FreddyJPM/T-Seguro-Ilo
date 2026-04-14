import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Search, PlusCircle, FileSpreadsheet, X, 
  BarChart3, Truck, IdCard, Trash2, UserPlus, Edit3, 
  UploadCloud, UserCog, Eye, Save, LogOut, MapPin, 
  Calendar, Building2, User as UserIcon, Settings,
  ChevronRight, Route, History, CheckCircle2, 
  FileDown, FileUp, ArrowRight, Car, ClipboardList, Users,
  Download, AlertTriangle, Navigation, Clock
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut 
} from 'firebase/auth';
import { 
  getFirestore, doc, setDoc, getDoc, collection, 
  onSnapshot, addDoc, deleteDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';

// --- FIREBASE CONFIGURATION ---
// Se asume que las variables globales __firebase_config y __app_id están disponibles en el entorno
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ilo-tseguro-v7';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [notification, setNotification] = useState(null);
  
  const [unidades, setUnidades] = useState([]);
  const [usuariosApp, setUsuariosApp] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUnidad, setSelectedUnidad] = useState(null);
  const [selectedServiceType, setSelectedServiceType] = useState('Urbano Regular');
  const [bulkLoading, setBulkLoading] = useState(false);

  // Authentication Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) { 
        console.error("Auth Error:", error); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Real-time Data Subscriptions
  useEffect(() => {
    if (!user) return;
    
    // Units Subscription
    const qUnidades = collection(db, 'artifacts', appId, 'public', 'data', 'unidades');
    const unsubUnidades = onSnapshot(qUnidades, (snapshot) => {
      setUnidades(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (error) => console.error("Firestore Error:", error));

    // System Users Subscription
    const qUsers = collection(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema');
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsuariosApp(docs);
      
      // Auto-create root admin if collection is empty
      if (docs.length === 0) {
        const adminId = "admin-root";
        setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', adminId), {
          name: 'Administrador Principal',
          role: 'admin',
          email: 'admin',
          password: '123',
          uid: adminId,
          createdAt: serverTimestamp()
        });
      }
    });

    // Audit Logs Subscription (Admin Only)
    let unsubLogs = () => {};
    if (currentUserData?.role === 'admin') {
      const qLogs = collection(db, 'artifacts', appId, 'public', 'data', 'auditoria');
      unsubLogs = onSnapshot(qLogs, (snapshot) => {
        const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        // Only keep last 30 logs for performance
        setAuditLogs(logs.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)).slice(0, 30));
      }, (error) => console.error("Audit Log Error:", error));
    }

    return () => { 
      unsubUnidades(); 
      unsubUsers(); 
      unsubLogs(); 
    };
  }, [user, currentUserData]);

  const logAction = async (action, details) => {
    if (!user || !currentUserData) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'auditoria'), {
        userId: currentUserData.uid,
        userName: currentUserData.name,
        action, 
        details: String(details),
        timestamp: serverTimestamp()
      });
    } catch (e) { 
      console.error("Error logging action:", e); 
    }
  };

  const showNotification = (msg) => {
    setNotification(String(msg));
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const formData = Object.fromEntries(new FormData(e.target));
    const foundUser = usuariosApp.find(u => u.email === formData.email && u.password === formData.password);
    
    if (foundUser) {
      setCurrentUserData(foundUser);
      setIsLoggedIn(true);
      setActiveTab(foundUser.role === 'visor' ? 'buscar' : 'dashboard');
      logAction("LOGIN", `Acceso de ${foundUser.name}`);
    } else { 
      showNotification("Credenciales incorrectas"); 
    }
  };

  const handleLogout = () => {
    if (currentUserData) logAction("LOGOUT", `Salida de ${currentUserData.name}`);
    setIsLoggedIn(false);
    setCurrentUserData(null);
    setActiveTab('dashboard');
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const newId = crypto.randomUUID();
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', newId), {
        ...fd,
        uid: newId,
        createdAt: serverTimestamp()
      });
      logAction("CREAR_USUARIO", fd.name);
      showNotification("Usuario creado correctamente");
      e.target.reset();
    } catch (err) {
      showNotification("Error al crear usuario");
    }
  };

  const deleteUser = async (id, name) => {
    if (id === 'admin-root') return showNotification("No se puede eliminar el admin principal");
    if (window.confirm(`¿Eliminar a ${name}?`)) {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'usuarios_sistema', id));
      logAction("ELIMINAR_USUARIO", name);
      showNotification("Usuario eliminado");
    }
  };

  const getStatusInfo = (fechaFin) => {
    if (!fechaFin) return { label: 'Sin Datos', color: 'bg-gray-400', isVigente: false, diasRestantes: -999 };
    const hoy = new Date(); 
    hoy.setHours(0,0,0,0);
    const fechaDoc = new Date(fechaFin);
    
    if (isNaN(fechaDoc)) return { label: 'Inválido', color: 'bg-gray-400', isVigente: false, diasRestantes: -999 };
    const diff = Math.ceil((fechaDoc - hoy) / (1000 * 60 * 60 * 24));
    
    if (diff < 0) return { label: 'Vencido', color: 'bg-red-600', isVigente: false, diasRestantes: diff };
    if (diff <= 15) return { label: 'Por Vencer', color: 'bg-orange-500', isVigente: true, diasRestantes: diff };
    return { label: 'Vigente', color: 'bg-emerald-500', isVigente: true, diasRestantes: diff };
  };

  const exportToCSV = () => {
    if (unidades.length === 0) {
      showNotification("No hay datos para exportar");
      return;
    }
    const headers = ["Placa", "Tipo Servicio", "Ruta", "Marca", "Modelo", "Año", "Empresa", "Conductor", "DNI", "Fin Autorizacion", "Estado"];
    const rows = unidades.map(u => {
      const status = getStatusInfo(u.finAutorizacion || u.finautorizacion);
      return [
        u.placa || "",
        u.tipoServicio || u.tiposervicio || "",
        u.ruta || "N/A",
        u.marca || "",
        u.modelo || "",
        u.anio || "",
        `"${u.empresa || ""}"`,
        `"${u.conductor || ""}"`,
        u.dni || "",
        u.finAutorizacion || u.finautorizacion || "",
        status.label
      ];
    });
    const csvContent = "\ufeff" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `padron_ilo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    logAction("EXPORTAR", "Descarga de padrón CSV");
    showNotification("CSV exportado correctamente");
  };

  const handleBulkUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkLoading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length < 2) return showNotification("Archivo mal formateado");
        
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
        const dataRows = lines.slice(1);
        const batch = writeBatch(db);
        let count = 0;
        
        for (const rowText of dataRows) {
          const values = rowText.split(',').map(v => v.trim().replace(/"/g, ''));
          const rowData = {};
          headers.forEach((header, index) => { 
            if (values[index] !== undefined) rowData[header] = values[index]; 
          });
          
          if (!rowData.placa) continue;
          
          const placaId = rowData.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'unidades', placaId);
          
          batch.set(docRef, {
            ...rowData,
            placa: rowData.placa.toUpperCase(),
            updatedAt: serverTimestamp(),
            updatedBy: currentUserData.uid,
            estado: 'Autorizado'
          }, { merge: true });
          
          count++;
          if (count >= 450) break; // Limit for batch processing
        }
        
        if (count > 0) {
          await batch.commit();
          logAction("CARGA_MASIVA", `Importados ${count} registros`);
          showNotification(`${count} unidades sincronizadas`);
        }
      } catch (error) { 
        showNotification("Error procesando CSV"); 
      } finally { 
        setBulkLoading(false); 
        e.target.value = ''; 
      }
    };
    reader.readAsText(file);
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-indigo-500"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row font-sans">
      {/* Sidebar Navigation */}
      <aside className="print:hidden w-full lg:w-72 bg-slate-900 text-white flex flex-col p-8 shrink-0">
        <div className="flex items-center gap-3 mb-12">
          <div className="bg-indigo-600 p-2 rounded-xl"><ShieldCheck className="w-6 h-6" /></div>
          <span className="text-xl font-black uppercase tracking-tighter italic">T-Seguro <span className="text-indigo-400">Ilo</span></span>
        </div>
        
        <nav className="flex-1 space-y-2">
          <button onClick={() => setActiveTab('dashboard')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'dashboard' ? 'bg-indigo-600' : 'text-slate-500 hover:text-white'}`}>
            <BarChart3 className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Dashboard</span>
          </button>
          <button onClick={() => setActiveTab('buscar')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'buscar' ? 'bg-indigo-600' : 'text-slate-500 hover:text-white'}`}>
            <Search className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Consultas</span>
          </button>
          {currentUserData?.role !== 'visor' && (
            <>
              <button onClick={() => setActiveTab('registrar')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'registrar' ? 'bg-indigo-600' : 'text-slate-500 hover:text-white'}`}>
                <PlusCircle className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Admisión</span>
              </button>
              <button onClick={() => setActiveTab('importar')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'importar' ? 'bg-indigo-600' : 'text-slate-500 hover:text-white'}`}>
                <UploadCloud className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Carga Masiva</span>
              </button>
            </>
          )}
          <button onClick={() => setActiveTab('reportes')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'reportes' ? 'bg-indigo-600' : 'text-slate-500 hover:text-white'}`}>
            <ClipboardList className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Padrón</span>
          </button>
          {currentUserData?.role === 'admin' && (
            <button onClick={() => setActiveTab('usuarios')} className={`w-full text-left p-4 rounded-2xl transition-all flex items-center gap-4 ${activeTab === 'usuarios' ? 'bg-indigo-600' : 'text-slate-500 hover:text-white'}`}>
              <Users className="w-5 h-5" /><span className="text-[10px] font-black uppercase tracking-widest">Usuarios</span>
            </button>
          )}
        </nav>

        <div className="mt-8 pt-8 border-t border-slate-800">
          <p className="text-[8px] font-black text-indigo-400 uppercase mb-2">Sesión Activa</p>
          <p className="text-[10px] font-bold truncate">{currentUserData?.name}</p>
          <p className="text-[8px] text-gray-500 uppercase">{currentUserData?.role}</p>
          <button onClick={handleLogout} className="mt-4 flex items-center gap-3 text-slate-500 hover:text-red-400 transition-colors">
            <LogOut className="w-5 h-5" /><span className="text-[10px] font-black uppercase">Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-8 lg:p-12 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          
          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Registros Totales</p>
                  <p className="text-4xl font-black text-slate-800">{unidades.length}</p>
                </div>
                <div className="bg-emerald-500 p-8 rounded-[2.5rem] text-white shadow-lg">
                  <p className="text-[9px] font-black text-emerald-100 uppercase tracking-widest mb-1">Unidades Vigentes</p>
                  <p className="text-4xl font-black">{unidades.filter(u => getStatusInfo(u.finautorizacion || u.finAutorizacion).isVigente).length}</p>
                </div>
                
                {/* NEW CARD: Units expiring soon (20 days) */}
                <div className="bg-amber-500 p-8 rounded-[2.5rem] text-white shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-black text-amber-100 uppercase tracking-widest mb-1">Próximos Vencer</p>
                      <p className="text-4xl font-black">{unidades.filter(u => {
                        const info = getStatusInfo(u.finautorizacion || u.finAutorizacion);
                        return info.diasRestantes >= 0 && info.diasRestantes <= 20;
                      }).length}</p>
                    </div>
                    <Clock className="w-5 h-5 opacity-40" />
                  </div>
                  <p className="text-[8px] font-bold text-amber-100 uppercase mt-2">Plazo de 20 días</p>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-lg">
                  <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest mb-1">Personal Activo</p>
                  <p className="text-4xl font-black">{usuariosApp.length}</p>
                </div>
              </div>

              {/* AUDIT SECTION: Admin Only */}
              {currentUserData?.role === 'admin' && (
                <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-6 flex items-center gap-3">
                    <History className="w-4 h-4" /> Auditoría de Acciones (Solo Admin)
                  </h3>
                  <div className="space-y-3">
                    {auditLogs.length > 0 ? (
                      auditLogs.map(log => (
                        <div key={log.id} className="flex items-center gap-4 text-[10px] border-b border-gray-50 pb-3 last:border-0">
                          <span className="font-black text-indigo-600 uppercase w-32 truncate">{log.userName}</span>
                          <span className="bg-slate-100 px-2 py-1 rounded text-slate-500 font-bold uppercase">{log.action}</span>
                          <span className="text-gray-400 flex-1 truncate">{log.details}</span>
                          <span className="text-gray-300 font-bold text-[8px]">
                            {log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleString() : '...'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-[10px] text-gray-400 italic">No hay registros de actividad recientes.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SEARCH TAB */}
          {activeTab === 'buscar' && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-12 animate-in zoom-in-95 duration-500">
              <div className="text-center space-y-4">
                <div className="bg-indigo-600 w-24 h-24 rounded-[2.5rem] mx-auto flex items-center justify-center shadow-2xl shadow-indigo-200">
                  <Search className="w-12 h-12 text-white" />
                </div>
                <h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">Fiscalización <span className="text-indigo-600">Ilo</span></h2>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Ingrese placa del vehículo para verificar</p>
              </div>
              <div className="w-full max-w-xl">
                <div className="bg-white p-2 rounded-[3rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.1)] flex items-center border-4 border-slate-50">
                  <input 
                    autoFocus 
                    type="text" 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value.toUpperCase())} 
                    placeholder="ABC-123" 
                    className="flex-1 bg-transparent p-6 text-3xl font-black outline-none text-center tracking-widest text-slate-800 placeholder:text-slate-100" 
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const found = unidades.find(u => u.placa === searchTerm.trim() || u.dni === searchTerm.trim());
                        if (found) setSelectedUnidad(found); else showNotification("Registro no encontrado");
                      }
                    }} 
                  />
                  <button 
                    onClick={() => {
                      const found = unidades.find(u => u.placa === searchTerm.trim() || u.dni === searchTerm.trim());
                      if (found) setSelectedUnidad(found); else showNotification("Registro no encontrado");
                    }} 
                    className="bg-slate-900 text-white h-20 w-20 rounded-[2rem] flex items-center justify-center hover:bg-indigo-600 transition-all m-1"
                  >
                    <ArrowRight className="w-8 h-8" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ADMISSION TAB */}
          {activeTab === 'registrar' && currentUserData?.role !== 'visor' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-12 rounded-[4rem] shadow-sm border border-gray-100">
                <h2 className="text-2xl font-black text-slate-800 uppercase mb-10 flex items-center gap-4">
                  <div className="w-2 h-8 bg-indigo-600 rounded-full"></div> Nueva Autorización
                </h2>
                <form className="space-y-8" onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = Object.fromEntries(new FormData(e.target));
                  const pid = fd.placa.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                  await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'unidades', pid), {
                    ...fd,
                    placa: fd.placa.toUpperCase(),
                    updatedAt: serverTimestamp(),
                    updatedBy: currentUserData.uid,
                    estado: 'Autorizado'
                  });
                  logAction("REGISTRO", fd.placa);
                  showNotification("Unidad Registrada");
                  e.target.reset();
                  setSelectedServiceType('Urbano Regular');
                }}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">N° Placa</label>
                      <input required name="placa" placeholder="ABC-123" className="w-full p-6 bg-slate-50 rounded-3xl font-black text-2xl text-center uppercase outline-none focus:bg-white border-4 border-transparent focus:border-indigo-50 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Tipo Servicio</label>
                      <select name="tipoServicio" value={selectedServiceType} onChange={(e) => setSelectedServiceType(e.target.value)} className="w-full p-6 bg-slate-50 rounded-3xl font-black text-xs uppercase outline-none">
                        <option value="Urbano Regular">Urbano Regular</option>
                        <option value="Servicio Taxi">Servicio Taxi</option>
                        <option value="Servicio Escolar">Servicio Escolar</option>
                        <option value="Trabajadores">Trabajadores</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Vencimiento</label>
                      <input required type="date" name="finAutorizacion" className="w-full p-6 bg-red-50 rounded-3xl font-black text-xs outline-none border-4 border-transparent focus:border-red-100 text-red-600" />
                    </div>
                  </div>

                  {selectedServiceType === 'Urbano Regular' && (
                    <div className="animate-in fade-in zoom-in-95 duration-300">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-indigo-600 uppercase ml-2 flex items-center gap-2"><Navigation className="w-3 h-3"/> Ruta / Itinerario Asignado</label>
                        <input required name="ruta" placeholder="Ej: RUTA 1-B / Pampa Inalámbrica" className="w-full p-6 bg-indigo-50/50 rounded-3xl font-black text-sm uppercase outline-none border-4 border-transparent focus:border-indigo-100" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-slate-50/50 p-8 rounded-[3rem]">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Marca</label>
                      <input name="marca" placeholder="Ej: TOYOTA" className="w-full p-4 bg-white rounded-2xl font-bold text-xs uppercase outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Modelo</label>
                      <input name="modelo" placeholder="Ej: HIACE" className="w-full p-4 bg-white rounded-2xl font-bold text-xs uppercase outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Año</label>
                      <input name="anio" type="number" placeholder="2020" className="w-full p-4 bg-white rounded-2xl font-bold text-xs outline-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase">Empresa Operadora / Razón Social</label>
                    <input required name="empresa" placeholder="EMPRESA DE TRANSPORTES EJEMPLO S.A.C." className="w-full p-6 bg-slate-50 rounded-3xl font-bold text-xs uppercase outline-none" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase">Nombre Conductor</label>
                      <input required name="conductor" placeholder="APELLIDOS Y NOMBRES" className="w-full p-6 bg-slate-50 rounded-3xl font-bold text-xs uppercase outline-none" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase">DNI</label>
                      <input required name="dni" maxLength="8" placeholder="8 DÍGITOS" className="w-full p-6 bg-slate-50 rounded-3xl font-bold text-xs outline-none" />
                    </div>
                  </div>

                  <button type="submit" className="w-full bg-slate-900 text-white font-black p-8 rounded-[2.5rem] uppercase tracking-[0.3em] text-[11px] hover:bg-indigo-600 transition-all shadow-2xl flex items-center justify-center gap-4">
                    <Save className="w-5 h-5" /> Registrar en Base de Datos
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* BULK UPLOAD TAB */}
          {activeTab === 'importar' && currentUserData?.role !== 'visor' && (
            <div className="animate-in fade-in duration-500 space-y-12">
              <div className="bg-white p-16 rounded-[4rem] border-4 border-dashed border-indigo-100 text-center relative overflow-hidden">
                {bulkLoading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                    <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mb-4"></div>
                    <p className="font-black text-indigo-600 uppercase text-xs tracking-widest">Procesando Sincronización...</p>
                  </div>
                )}
                <div className="bg-indigo-50 w-24 h-24 rounded-[2rem] flex items-center justify-center mx-auto mb-8 text-indigo-600">
                  <UploadCloud className="w-10 h-10" />
                </div>
                <h2 className="text-3xl font-black text-slate-800 uppercase mb-4 italic">Carga de Base de Datos</h2>
                <div className="max-w-xl mx-auto space-y-6 mb-10">
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase">Sube un archivo .csv con las cabeceras exactas.</p>
                  <div className="bg-slate-50 p-6 rounded-3xl text-left border border-slate-100">
                    <p className="text-[8px] font-black text-indigo-400 uppercase mb-3 tracking-widest">Ejemplo de formato CSV:</p>
                    <code className="text-[10px] font-mono text-slate-600 break-all bg-white p-3 rounded-xl block border border-slate-200 shadow-inner">
                      placa,marca,modelo,anio,empresa,conductor,dni,finAutorizacion,tipoServicio,ruta
                    </code>
                  </div>
                </div>
                <input type="file" id="bulk-csv" accept=".csv" onChange={handleBulkUpload} className="hidden" />
                <label htmlFor="bulk-csv" className="inline-flex items-center gap-6 bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black uppercase text-xs tracking-widest cursor-pointer hover:bg-indigo-600 transition-all shadow-xl">
                  Seleccionar Archivo CSV <FileUp className="w-5 h-5" />
                </label>
              </div>
            </div>
          )}

          {/* REPORT / PADRON TAB */}
          {activeTab === 'reportes' && (
            <div className="bg-white rounded-[3rem] shadow-sm border border-gray-100 overflow-hidden animate-in fade-in duration-500">
               <div className="p-10 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
                  <div>
                    <h2 className="text-xl font-black uppercase text-slate-800 tracking-tighter">Padrón de Transportes</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Total: {unidades.length} unidades registradas</p>
                  </div>
                  <button onClick={exportToCSV} className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase flex items-center gap-3 hover:bg-emerald-700 transition-all shadow-lg">
                    <FileDown className="w-4 h-4" /> Exportar CSV
                  </button>
               </div>
               <div className="overflow-x-auto">
                 <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-400 uppercase bg-slate-50/50">
                        <th className="px-10 py-6 border-b border-slate-100">Unidad / Ruta</th>
                        <th className="px-10 py-6 border-b border-slate-100">Vehículo</th>
                        <th className="px-10 py-6 border-b border-slate-100">Operador / Empresa</th>
                        <th className="px-10 py-6 border-b border-slate-100">Estado</th>
                        <th className="px-10 py-6 border-b border-slate-100 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {unidades.map(u => {
                        const status = getStatusInfo(u.finAutorizacion || u.finautorizacion);
                        return (
                          <tr key={u.id} className="hover:bg-indigo-50/10 transition-colors group">
                            <td className="px-10 py-6">
                              <div className="font-black text-slate-900 text-lg uppercase leading-none">{u.placa}</div>
                              <div className="text-[8px] font-black text-indigo-400 uppercase mt-1">
                                {u.ruta ? `RUTA: ${u.ruta}` : (u.tipoServicio || u.tiposervicio)}
                              </div>
                            </td>
                            <td className="px-10 py-6">
                              <div className="font-bold text-slate-700 text-[10px] uppercase">{u.marca || 'S/M'} {u.modelo}</div>
                              <div className="text-[8px] text-slate-400 font-bold uppercase">{u.anio || '-'}</div>
                            </td>
                            <td className="px-10 py-6">
                              <div className="font-bold text-slate-800 text-[10px] uppercase truncate max-w-[200px]">{u.empresa}</div>
                              <div className="text-[8px] text-indigo-500 font-black uppercase mt-1">{u.conductor}</div>
                            </td>
                            <td className="px-10 py-6">
                              <span className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase text-white shadow-sm ${status.color}`}>
                                {status.label}
                              </span>
                            </td>
                            <td className="px-10 py-6 text-right">
                               <button onClick={() => setSelectedUnidad(u)} className="p-3 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-2xl transition-all group-hover:shadow-sm">
                                 <Eye className="w-5 h-5" />
                               </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
               </div>
            </div>
          )}

          {/* USER MANAGEMENT TAB */}
          {activeTab === 'usuarios' && currentUserData?.role === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in duration-500">
              <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-gray-100">
                <h2 className="text-xl font-black text-slate-800 uppercase mb-8 flex items-center gap-3">
                  <UserPlus className="w-6 h-6 text-indigo-600" /> Crear Personal
                </h2>
                <form onSubmit={handleCreateUser} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Nombre Completo</label>
                    <input required name="name" className="w-full p-5 bg-slate-50 rounded-2xl font-bold text-xs outline-none focus:bg-white border-2 border-transparent focus:border-indigo-100 transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Usuario (Email)</label>
                      <input required name="email" className="w-full p-5 bg-slate-50 rounded-2xl font-bold text-xs outline-none focus:bg-white border-2 border-transparent focus:border-indigo-100 transition-all" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Contraseña</label>
                      <input required name="password" type="password" className="w-full p-5 bg-slate-50 rounded-2xl font-bold text-xs outline-none focus:bg-white border-2 border-transparent focus:border-indigo-100 transition-all" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Rol de Sistema</label>
                    <select name="role" className="w-full p-5 bg-slate-50 rounded-2xl font-black text-xs uppercase outline-none">
                      <option value="visor">Visor (Solo Consulta)</option>
                      <option value="operador">Operador (Admisión)</option>
                      <option value="admin">Administrador (Total)</option>
                    </select>
                  </div>
                  <button type="submit" className="w-full bg-slate-900 text-white font-black p-6 rounded-3xl uppercase tracking-widest text-[10px] hover:bg-indigo-600 transition-all">
                    Registrar Usuario
                  </button>
                </form>
              </div>

              <div className="bg-white p-12 rounded-[3.5rem] shadow-sm border border-gray-100">
                <h2 className="text-xl font-black text-slate-800 uppercase mb-8 flex items-center gap-3">
                  <Users className="w-6 h-6 text-indigo-600" /> Cuentas Activas
                </h2>
                <div className="space-y-4">
                  {usuariosApp.map(u => (
                    <div key={u.id} className="flex items-center justify-between p-5 bg-slate-50 rounded-3xl group hover:bg-white transition-all border border-transparent hover:border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-indigo-600 shadow-sm">{u.name?.charAt(0)}</div>
                        <div>
                          <p className="text-[10px] font-black text-slate-800 uppercase">{u.name}</p>
                          <p className="text-[8px] font-bold text-slate-400">{u.email} • <span className="text-indigo-500 uppercase">{u.role}</span></p>
                        </div>
                      </div>
                      <button onClick={() => deleteUser(u.id, u.name)} className="p-3 text-slate-200 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </main>

      {/* DETAIL MODAL */}
      {selectedUnidad && (() => {
        const status = getStatusInfo(selectedUnidad.finAutorizacion || selectedUnidad.finautorizacion);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/95 backdrop-blur-xl">
            <div className="bg-white w-full max-w-3xl rounded-[4rem] overflow-hidden flex flex-col md:flex-row shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="w-full md:w-2/5 bg-slate-50 p-12 flex flex-col items-center justify-center border-r border-slate-100 relative">
                 <button onClick={() => setSelectedUnidad(null)} className="absolute top-8 left-8 p-2 text-slate-400 hover:text-slate-900 md:hidden"><X className="w-8 h-8" /></button>
                 <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl border-4 border-slate-900 mb-8 w-full text-center transform -rotate-1">
                   <h3 className="text-5xl font-black text-slate-900 uppercase tracking-tighter italic">{selectedUnidad.placa}</h3>
                   <p className="text-[10px] font-black text-indigo-600 uppercase mt-3 tracking-[0.3em]">{selectedUnidad.tipoServicio || selectedUnidad.tiposervicio}</p>
                 </div>
                 
                 {selectedUnidad.ruta && (
                   <div className="bg-indigo-600 text-white p-6 rounded-[2rem] w-full text-center mb-6 shadow-lg">
                      <p className="text-[8px] font-black uppercase opacity-60 mb-1">Itinerario / Ruta</p>
                      <p className="text-xs font-black uppercase leading-tight italic">{selectedUnidad.ruta}</p>
                   </div>
                 )}

                 <div className="text-center w-full space-y-4">
                    <div className="bg-white p-4 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-300 uppercase mb-1">Vehículo</p>
                      <p className="text-sm font-black text-slate-800 uppercase leading-none">{selectedUnidad.marca || 'S/M'}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">{selectedUnidad.modelo || 'S/M'}</p>
                    </div>
                    <div className="bg-slate-800 text-white p-3 rounded-xl font-black text-xs inline-block px-6">AÑO: {selectedUnidad.anio || 'S/D'}</div>
                 </div>
              </div>

              <div className="w-full md:w-3/5 p-12 space-y-8 relative">
                <button onClick={() => setSelectedUnidad(null)} className="absolute top-8 right-8 p-2 text-slate-400 hover:text-slate-900 hidden md:block transition-transform hover:rotate-90"><X className="w-8 h-8" /></button>
                
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2"><Building2 className="w-3 h-3" /> Empresa Autorizada</label>
                  <p className="text-sm font-black text-slate-800 uppercase leading-tight italic">{selectedUnidad.empresa}</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center gap-5 bg-slate-50 p-6 rounded-[2rem]">
                    <div className="bg-white p-3 rounded-2xl shadow-sm text-indigo-600"><UserIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{selectedUnidad.conductor}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase">DNI: {selectedUnidad.dni}</p>
                    </div>
                  </div>
                  
                  <div className={`flex items-center gap-5 p-6 rounded-[2rem] border transition-colors duration-500 ${status.isVigente ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                    <div className={`bg-white p-3 rounded-2xl shadow-sm ${status.isVigente ? 'text-emerald-600' : 'text-red-600'}`}>
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <p className={`text-[11px] font-black uppercase tracking-tight italic ${status.isVigente ? 'text-emerald-700' : 'text-red-700'}`}>
                        {status.isVigente ? 'Vigente hasta' : 'Vencido el'} {selectedUnidad.finAutorizacion || selectedUnidad.finautorizacion}
                      </p>
                      <p className={`text-[8px] font-black uppercase mt-1 ${status.isVigente ? 'text-emerald-400' : 'text-red-400'}`}>Autorización Municipal</p>
                    </div>
                  </div>
                </div>

                <div className="pt-6 flex gap-4">
                  <button onClick={() => setSelectedUnidad(null)} className="flex-1 bg-slate-900 text-white py-5 rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-xl">Cerrar</button>
                  {currentUserData?.role === 'admin' && (
                    <button onClick={async () => {
                      if (window.confirm("¿Anular esta autorización permanentemente?")) {
                        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'unidades', selectedUnidad.id));
                        logAction("ELIMINAR_UNIDAD", selectedUnidad.placa);
                        setSelectedUnidad(null);
                        showNotification("Unidad eliminada");
                      }
                    }} className="p-5 bg-red-50 text-red-600 rounded-[1.5rem] hover:bg-red-600 hover:text-white transition-all">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* LOGIN OVERLAY */}
      {!isLoggedIn && (
        <div className="fixed inset-0 bg-slate-900 z-[300] flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-white rounded-[4rem] p-12 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.5)]">
            <div className="text-center mb-12">
              <div className="inline-flex bg-indigo-50 p-5 rounded-[2rem] mb-6 shadow-sm"><ShieldCheck className="w-12 h-12 text-indigo-600" /></div>
              <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tighter italic">T-Seguro <span className="text-indigo-600">Ilo</span></h1>
              <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em] mt-4">Sistema de Control de Transportes</p>
            </div>
            <form onSubmit={handleLogin} className="space-y-5">
              <input required name="email" placeholder="Usuario" className="w-full bg-slate-50 p-6 rounded-3xl font-black text-xs outline-none border-4 border-transparent focus:border-indigo-50 transition-all text-center uppercase tracking-widest" />
              <input required name="password" type="password" placeholder="Contraseña" className="w-full bg-slate-50 p-6 rounded-3xl font-black text-xs outline-none border-4 border-transparent focus:border-indigo-50 transition-all text-center tracking-widest" />
              <button type="submit" className="w-full bg-slate-900 text-white p-7 rounded-[2rem] font-black uppercase text-[11px] tracking-[0.3em] hover:bg-indigo-600 transition-all shadow-2xl flex items-center justify-center gap-3 mt-4">
                Acceder al Sistema <ChevronRight className="w-5 h-5" />
              </button>
            </form>
            <p className="text-center text-[8px] font-black text-slate-200 uppercase mt-12 tracking-widest">© 2024 Municipalidad de Ilo</p>
          </div>
        </div>
      )}

      {/* Notifications Toast */}
      {notification && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-full font-black text-[10px] uppercase z-[500] animate-in slide-in-from-bottom-5 shadow-2xl flex items-center gap-4 border border-indigo-500/20">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div> {notification}
        </div>
      )}
    </div>
  );
}
