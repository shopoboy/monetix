import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  getDocFromServer,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, loginWithGoogle, logout } from './firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle,
  Clock, 
  ShieldCheck, 
  Users, 
  DollarSign, 
  ArrowRight, 
  LayoutDashboard, 
  LogOut, 
  Eye, 
  Phone,
  ChevronLeft,
  Loader2,
  Search,
  ChevronDown
} from 'lucide-react';
import { COUNTRIES } from './constants/countries';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

// --- Utilities ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface Application {
  id: string;
  name: string;
  phone: string;
  address: string;
  dob: string;
  income: number;
  country: string;
  approvedAmount: number;
  status: 'pending' | 'contacted';
  confirmationNumber: string;
  createdAt: any;
}

// --- Components ---

const SearchableSelect = ({ 
  value, 
  onChange, 
  options, 
  placeholder 
}: { 
  value: string; 
  onChange: (val: string) => void; 
  options: string[]; 
  placeholder: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredOptions = useMemo(() => {
    return options.filter(opt => 
      opt.toLowerCase().includes(search.toLowerCase())
    );
  }, [options, search]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all bg-white flex items-center justify-between text-left"
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden"
          >
            <div className="p-2 border-b border-gray-100 flex items-center gap-2 bg-gray-50">
              <Search className="w-4 h-4 text-gray-400 ml-2" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar país..."
                className="w-full p-2 bg-transparent outline-none text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-48 sm:max-h-60 overflow-y-auto">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full px-4 py-3 sm:py-2 text-left text-sm hover:bg-blue-50 transition-colors ${
                      value === opt ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    {opt}
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No se encontraron resultados
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AdminLogin = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
      <LayoutDashboard className="w-16 h-16 text-blue-600 mx-auto mb-6" />
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Acceso Administrativo</h1>
      <p className="text-gray-600 mb-8">Inicie sesión con su cuenta de administrador para gestionar las solicitudes.</p>
      <button
        onClick={loginWithGoogle}
        className="w-full bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        Continuar con Google
      </button>
    </div>
  </div>
);

const AdminPanel = ({ user }: { user: User }) => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'applications'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const apps = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Application[];
      setApplications(apps);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'applications');
    });

    return () => unsubscribe();
  }, []);

  const totalAmount = useMemo(() => 
    applications.reduce((sum, app) => sum + app.approvedAmount, 0), 
    [applications]
  );

  const pendingCount = useMemo(() => 
    applications.filter(app => app.status === 'pending').length, 
    [applications]
  );

  const contactedCount = useMemo(() => 
    applications.filter(app => app.status === 'contacted').length, 
    [applications]
  );

  const handleContact = async (id: string) => {
    try {
      await updateDoc(doc(db, 'applications', id), { status: 'contacted' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `applications/${id}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Admin Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-gray-900">Panel Administrativo</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 hidden sm:inline">{user.email}</span>
          <button 
            onClick={logout}
            className="p-2 text-gray-500 hover:text-red-600 transition-colors"
            title="Cerrar Sesión"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Total Solicitudes</p>
            <h3 className="text-lg sm:text-2xl font-bold text-blue-600">{applications.length}</h3>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Monto Total</p>
            <h3 className="text-lg sm:text-2xl font-bold text-green-600">${totalAmount.toLocaleString()} USD</h3>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Pendientes</p>
            <h3 className="text-lg sm:text-2xl font-bold text-yellow-600">{pendingCount}</h3>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100">
            <p className="text-xs sm:text-sm font-medium text-gray-500 mb-1">Contactados</p>
            <h3 className="text-lg sm:text-2xl font-bold text-purple-600">{contactedCount}</h3>
          </div>
        </div>

        {/* Applications Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Nombre</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">País</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Teléfono</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Ingresos</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Monto Aprobado</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Estado</th>
                  <th className="px-6 py-4 text-sm font-semibold text-gray-600">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{app.name}</td>
                    <td className="px-6 py-4 text-gray-600">{app.country}</td>
                    <td className="px-6 py-4 text-gray-600">{app.phone}</td>
                    <td className="px-6 py-4 text-gray-600">${app.income.toLocaleString()}</td>
                    <td className="px-6 py-4 text-gray-900 font-semibold">${app.approvedAmount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-semibold",
                        app.status === 'pending' ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                      )}>
                        {app.status === 'pending' ? 'Pendiente' : 'Contactado'}
                      </span>
                    </td>
                    <td className="px-6 py-4 flex gap-2">
                      <button 
                        onClick={() => setSelectedApp(app)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver Detalles"
                      >
                        <Eye className="w-5 h-5" />
                      </button>
                      {app.status === 'pending' && (
                        <button 
                          onClick={() => handleContact(app.id)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Marcar como Contactado"
                        >
                          <Phone className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Detail Modal */}
      <AnimatePresence>
        {selectedApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl my-auto"
            >
              <div className="bg-blue-600 p-6 text-white flex justify-between items-center sticky top-0 z-10">
                <h2 className="text-xl font-bold">Detalle de Solicitud</h2>
                <button onClick={() => setSelectedApp(null)} className="p-1 hover:bg-white/20 rounded-lg">
                  <ChevronLeft className="w-6 h-6 rotate-180" />
                </button>
              </div>
              <div className="p-6 sm:p-8 space-y-4 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Nombre</p>
                    <p className="font-semibold">{selectedApp.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">País</p>
                    <p className="font-semibold">{selectedApp.country}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Teléfono</p>
                    <p className="font-semibold">{selectedApp.phone}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-500">Dirección</p>
                    <p className="font-semibold">{selectedApp.address}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Ingresos</p>
                    <p className="font-semibold">${selectedApp.income.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Monto Aprobado</p>
                    <p className="font-semibold text-blue-600">${selectedApp.approvedAmount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Estado</p>
                    <p className="font-semibold">{selectedApp.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">N° Confirmación</p>
                    <p className="font-semibold">{selectedApp.confirmationNumber}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fecha Nacimiento</p>
                    <p className="font-semibold">{selectedApp.dob}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fecha Solicitud</p>
                    <p className="font-semibold">
                      {selectedApp.createdAt instanceof Timestamp 
                        ? format(selectedApp.createdAt.toDate(), 'dd/MM/yyyy HH:mm')
                        : 'Reciente'}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedApp(null)}
                  className="w-full mt-6 bg-gray-100 text-gray-900 py-3 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [view, setView] = useState<'landing' | 'form' | 'loading' | 'result' | 'rejected' | 'admin'>('landing');
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    dob: '',
    income: '',
    country: ''
  });
  const [result, setResult] = useState<Application | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [loadingStep, setLoadingStep] = useState(0);

  const loadingMessages = [
    "Verificando información...",
    "Analizando ingresos...",
    "Consultando perfil crediticio...",
    "Calculando capacidad de pago...",
    "Generando resultado..."
  ];

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Test connection
  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setView('loading');
    
    // Simulate loading steps
    for (let i = 0; i < loadingMessages.length; i++) {
      setLoadingStep(i);
      await new Promise(r => setTimeout(r, 1500));
    }

    const incomeVal = parseFloat(formData.income);
    if (isNaN(incomeVal) || incomeVal < 0) {
      setRejectionReason("El ingreso mensual ingresado no es válido.");
      setView('rejected');
      return;
    }

    // Name validation (only letters)
    const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;
    if (!nameRegex.test(formData.name)) {
      setRejectionReason("El nombre completo solo debe contener letras.");
      setView('rejected');
      return;
    }

    // Phone validation (only digits)
    const phoneDigits = formData.phone.replace(/\D/g, '');
    if (phoneDigits.length < 7) {
      setRejectionReason("El número de teléfono debe contener solo números y tener al menos 7 dígitos.");
      setView('rejected');
      return;
    }

    // Age validation
    const birthDate = new Date(formData.dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    if (age < 18) {
      setRejectionReason("Lo sentimos, debe ser mayor de 18 años para solicitar un crédito.");
      setView('rejected');
      return;
    }

    const approvedAmount = incomeVal * 9.2;
    const confirmationNumber = Math.floor(100000 + Math.random() * 900000).toString();
    
    const appData = {
      name: formData.name,
      phone: formData.phone,
      address: formData.address,
      dob: formData.dob,
      income: parseFloat(formData.income),
      country: formData.country,
      approvedAmount,
      status: 'pending' as const,
      confirmationNumber,
      createdAt: serverTimestamp()
    };

    try {
      const docRef = await addDoc(collection(db, 'applications'), appData);
      setResult({ id: docRef.id, ...appData, createdAt: new Date() } as any);
      setView('result');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'applications');
    }
  };

  // --- Render Logic ---

  if (view === 'admin') {
    if (!isAuthReady) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
    if (!user) return <AdminLogin />;
    return <AdminPanel user={user} />;
  }

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 selection:bg-blue-100">
      <AnimatePresence mode="wait">
        {view === 'landing' && (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col"
          >
            {/* Hero Section */}
            <div className="bg-blue-600 text-white pt-20 pb-32 px-6 text-center">
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <h1 className="text-4xl sm:text-5xl font-bold mb-6 tracking-tight">
                  Pre-Aprobación de Crédito en Línea
                </h1>
                <p className="text-lg sm:text-xl text-blue-100 max-w-2xl mx-auto mb-10 leading-relaxed">
                  Obtenga una respuesta inmediata sobre su posible crédito. Complete una solicitud simple y nuestro sistema evaluará su perfil automáticamente.
                </p>
                <button 
                  onClick={() => setView('form')}
                  className="bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-50 transition-all flex items-center gap-2 mx-auto active:scale-95"
                >
                  Solicitar Crédito Ahora
                  <ArrowRight className="w-5 h-5" />
                </button>
              </motion.div>
            </div>

            {/* Stats Section */}
            <div className="-mt-16 px-6 max-w-5xl mx-auto w-full grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { label: 'Solicitudes Procesadas', value: '+12,000', icon: CheckCircle },
                { label: 'Clientes Satisfechos', value: '98%', icon: Users },
                { label: 'Disponibilidad del Sistema', value: '24/7', icon: Clock }
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center text-center">
                  <stat.icon className="w-8 h-8 text-blue-600 mb-3" />
                  <h3 className="text-2xl font-bold text-gray-900">{stat.value}</h3>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Features Section */}
            <div className="py-24 px-6 max-w-5xl mx-auto w-full">
              <h2 className="text-2xl font-bold text-center mb-12 text-gray-900">¿Por qué solicitar con nosotros?</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                {[
                  { title: 'Proceso Rápido', desc: 'Complete su solicitud en menos de 2 minutos desde cualquier dispositivo.', icon: Clock },
                  { title: 'Evaluación Automática', desc: 'Nuestro sistema analiza su información y calcula una posible pre-aprobación.', icon: LayoutDashboard },
                  { title: 'Información Segura', desc: 'Sus datos están protegidos con los más altos estándares de seguridad.', icon: ShieldCheck }
                ].map((feature, i) => (
                  <div key={i} className="text-center">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <feature.icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold text-lg mb-2">{feature.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Steps Section */}
            <div className="bg-gray-50 py-24 px-6">
              <div className="max-w-5xl mx-auto">
                <h2 className="text-2xl font-bold text-center mb-12">¿Cómo funciona?</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                  {[
                    { step: '1', title: 'Complete el formulario', desc: 'Ingrese sus datos básicos y financieros.' },
                    { step: '2', title: 'Evaluación automática', desc: 'El sistema procesa su solicitud al instante.' },
                    { step: '3', title: 'Resultado inmediato', desc: 'Conozca su monto pre-aprobado en segundos.' }
                  ].map((step, i) => (
                    <div key={i} className="relative">
                      <div className="text-5xl font-black text-blue-100 absolute -top-4 -left-2 z-0">{step.step}</div>
                      <div className="relative z-10">
                        <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                        <p className="text-gray-600 text-sm">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Admin Access (Hidden/Small) */}
            <footer className="py-8 text-center">
              <button 
                onClick={() => setView('admin')}
                className="text-xs text-gray-300 hover:text-gray-500 transition-colors"
              >
                Acceso Administrativo
              </button>
            </footer>
          </motion.div>
        )}

        {view === 'form' && (
          <motion.div 
            key="form"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="min-h-screen bg-gray-50 flex items-center justify-center p-6"
          >
            <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
              <div className="bg-blue-600 p-6 text-white flex items-center gap-4">
                <button onClick={() => setView('landing')} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <h2 className="text-xl font-bold">Solicitud de Crédito</h2>
              </div>
              <div className="p-8">
                <p className="text-sm text-gray-600 mb-8 text-center">Complete el siguiente formulario para conocer si califica para una pre-aprobación de crédito.</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre completo</label>
                    <input 
                      required
                      type="text"
                      placeholder="Ingrese su nombre completo"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ\s]/g, '')})}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Dirección de residencia</label>
                    <input 
                      required
                      type="text"
                      placeholder="Ej: Calle Principal #123, Ciudad"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                      value={formData.address}
                      onChange={e => setFormData({...formData, address: e.target.value})}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono</label>
                      <input 
                        required
                        type="tel"
                        placeholder="Ej: 8090000000"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        value={formData.phone}
                        onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">País</label>
                      <SearchableSelect
                        value={formData.country}
                        onChange={(val) => setFormData({ ...formData, country: val })}
                        options={COUNTRIES}
                        placeholder="Seleccione su país"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha de nacimiento</label>
                      <input 
                        required
                        type="date"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        value={formData.dob}
                        onChange={e => setFormData({...formData, dob: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Ingresos mensuales (USD)</label>
                      <div className="relative">
                        <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input 
                          required
                          type="text"
                          inputMode="numeric"
                          placeholder="Ej: 3500"
                          className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                          value={formData.income}
                          onChange={e => setFormData({...formData, income: e.target.value.replace(/\D/g, '')})}
                        />
                      </div>
                    </div>
                  </div>
                  <button 
                    type="submit"
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 transition-all active:scale-95"
                  >
                    Enviar Solicitud
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'loading' && (
          <motion.div 
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col items-center justify-center p-6 bg-white"
          >
            <div className="relative w-24 h-24 mb-8">
              <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
              <motion.div 
                className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Analizando su solicitud...</h2>
            <AnimatePresence mode="wait">
              <motion.p 
                key={loadingStep}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-blue-600 font-medium"
              >
                {loadingMessages[loadingStep]}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {view === 'result' && result && (
          <motion.div 
            key="result"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-screen bg-gray-50 flex items-center justify-center p-6"
          >
            <div className="max-w-2xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100">
              <div className="bg-green-50 p-12 text-center border-b border-green-100">
                <div className="w-20 h-20 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-200">
                  <CheckCircle className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-bold text-green-900 mb-2">Crédito Pre-Aprobado</h2>
                <p className="text-green-700 font-medium">¡Felicidades! Su perfil califica para un crédito inmediato.</p>
              </div>
              <div className="p-6 sm:p-12 text-center space-y-8">
                <div>
                  <p className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-2">Monto Estimado</p>
                  <h3 className="text-4xl sm:text-6xl font-black text-gray-900">${result.approvedAmount.toLocaleString()} <span className="text-xl sm:text-2xl text-gray-400">USD</span></h3>
                </div>
                
                <div className="bg-blue-50 p-6 rounded-2xl inline-block">
                  <p className="text-sm text-blue-600 font-bold mb-1">Número de Confirmación</p>
                  <p className="text-3xl font-mono font-black text-blue-900 tracking-widest">{result.confirmationNumber}</p>
                </div>

                <div className="bg-gray-50 p-4 rounded-xl text-left max-w-md mx-auto border border-gray-100">
                  <p className="text-xs text-gray-400 uppercase font-bold mb-1">Dirección Registrada</p>
                  <p className="text-sm text-gray-700 font-medium">{result.address}</p>
                </div>

                <div className="text-left space-y-4 text-gray-600 max-w-md mx-auto">
                  <p className="text-sm leading-relaxed">
                    Basado en la información proporcionada, nuestro sistema ha generado una posible pre-aprobación de crédito por el monto indicado arriba.
                  </p>
                  <p className="text-sm leading-relaxed">
                    Un asesor financiero se comunicará con usted próximamente para continuar con el proceso de evaluación y aprobación final del crédito.
                  </p>
                  <p className="text-xs font-bold text-gray-400 text-center pt-4">
                    POR FAVOR CONSERVE SU NÚMERO DE CONFIRMACIÓN
                  </p>
                </div>

                <button 
                  onClick={() => setView('landing')}
                  className="w-full bg-gray-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-black transition-all active:scale-95"
                >
                  Finalizar
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {view === 'rejected' && (
          <motion.div 
            key="rejected"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="min-h-screen bg-gray-50 flex items-center justify-center p-6"
          >
            <div className="max-w-2xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100">
              <div className="bg-red-50 p-12 text-center border-b border-red-100">
                <div className="w-20 h-20 bg-red-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-red-200">
                  <XCircle className="w-12 h-12" />
                </div>
                <h2 className="text-3xl font-bold text-red-900 mb-2">Solicitud No Aprobada</h2>
                <p className="text-red-700 font-medium">Lo sentimos, en este momento no podemos procesar su solicitud.</p>
              </div>
              <div className="p-12 text-center space-y-8">
                <div className="bg-gray-50 p-8 rounded-2xl border border-gray-100">
                  <p className="text-sm text-gray-500 uppercase tracking-widest font-bold mb-4">Motivo de la decisión</p>
                  <p className="text-lg text-gray-800 font-medium leading-relaxed">
                    {rejectionReason}
                  </p>
                </div>

                <div className="text-left space-y-4 text-gray-600 max-w-md mx-auto">
                  <p className="text-sm leading-relaxed">
                    Nuestro sistema realiza una evaluación automática basada en los criterios de riesgo y políticas vigentes. El hecho de no calificar en este momento no impide que pueda intentarlo nuevamente en el futuro si sus condiciones cambian.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => setView('form')}
                    className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-blue-700 transition-all active:scale-95"
                  >
                    Intentar de nuevo
                  </button>
                  <button 
                    onClick={() => setView('landing')}
                    className="flex-1 bg-gray-100 text-gray-900 py-4 rounded-2xl font-bold text-lg hover:bg-gray-200 transition-all active:scale-95"
                  >
                    Volver al inicio
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
